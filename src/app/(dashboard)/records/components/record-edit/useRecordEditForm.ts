'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { persistToolOptionIfNeeded } from '@/components/records/ToolLabelField';
import {
  buildCorrectionPayload,
  formStateToUpdatePayload,
  recordToFormState,
  type RecordEditFormState,
} from '@/lib/activity/record-form';
import { resolveActivityContextFromRecord, validateActivityContext } from '@/lib/activity/item-tree';
import { isOptimisticRecordId, resolveClientRecordId } from '@/lib/activity/records-mutation';
import { splitToolLabelForForm, recordHasFinance } from '@/lib/activity/finance-account';
import type { Item, Record } from '@/types/teto';
import { parseClientApiJson } from '@/lib/observability/client-request';
import { isRecordNotFoundApiError } from '@/lib/api/client-errors';

interface UseRecordEditFormOptions {
  record: Record;
  items: Item[];
  onSaved: (updated: Record) => void;
  onDeleted: (id: string) => void;
  onDeleteFailed?: (record: Record) => void;
  onError: (message: string) => void;
}

export type SaveStatus = 'idle' | 'saving' | 'saved';

async function fireCorrections(recordId: string, diffs: Array<{ field: string; newValue: unknown }>) {
  for (const { field, newValue } of diffs) {
    fetch(`/api/v2/records/${recordId}/correct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_corrected: field,
        new_value: newValue,
        decision_type: 'USER_EDIT',
      }),
    }).catch(() => {});
  }
}

const AUTO_SAVE_MS = 600;

export function useRecordEditForm({
  record,
  items,
  onSaved,
  onDeleted,
  onDeleteFailed,
  onError,
}: UseRecordEditFormOptions) {
  const [form, setForm] = useState<RecordEditFormState>(() => recordToFormState(record, items));
  const [contextSubItemsCount, setContextSubItemsCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    setForm(recordToFormState(record, items));
    setSaveStatus('idle');
  }, [record.id, record.updated_at, items]);

  useEffect(() => {
    const hasFinance = recordHasFinance(record.cost, record.money_direction);
    const { financeAccount, toolLabel } = splitToolLabelForForm(record.tool_label, hasFinance);
    setForm((prev) => ({
      ...prev,
      activityContext: {
        ...resolveActivityContextFromRecord(items, record.item_id, record.sub_item_id),
        phaseId: record.phase_id || prev.activityContext.phaseId || '',
      },
      toolLabel,
      financeAccount,
    }));
  }, [record.item_id, record.sub_item_id, record.phase_id, record.tool_label, record.cost, record.money_direction, items]);

  const save = useCallback(async () => {
    const form = formRef.current;
    if (saving) return;
    const contextErr = validateActivityContext(form.activityContext, items, contextSubItemsCount);
    if (contextErr) {
      onError(contextErr);
      return;
    }
    setSaving(true);
    setSaveStatus('saving');
    try {
      const payload = formStateToUpdatePayload(form, record);
      const res = await fetch(`/api/v2/records/${record.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const pe = parseClientApiJson(err);
        onError(pe.message || '保存失败');
        setSaveStatus('idle');
        return;
      }
      const json = await res.json();
      const env = parseClientApiJson(json);
      const updated = env.data as Record;
      const mergedTool = form.toolLabel.trim() || form.financeAccount.trim();
      if (mergedTool) void persistToolOptionIfNeeded(mergedTool);
      if (record.review_status === 'confirmed' || record.input_source === 'ai') {
        void fireCorrections(record.id, buildCorrectionPayload(record, payload));
      }
      setSaveStatus('saved');
      if (savedFadeRef.current) clearTimeout(savedFadeRef.current);
      savedFadeRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      onSaved(updated);
    } catch {
      onError('保存失败，请重试');
      setSaveStatus('idle');
    } finally {
      setSaving(false);
    }
  }, [saving, items, contextSubItemsCount, record, onSaved, onError]);

  const saveRef = useRef(save);
  saveRef.current = save;

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveRef.current();
    }, AUTO_SAVE_MS);
  }, []);

  const patchForm = useCallback(
    (patch: Partial<RecordEditFormState>) => {
      setForm((prev) => ({ ...prev, ...patch }));
      scheduleSave();
    },
    [scheduleSave]
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedFadeRef.current) clearTimeout(savedFadeRef.current);
    };
  }, []);

  const remove = useCallback(async () => {
    if (deleting) return;
    if (!confirm('确定要删除这条记录吗？')) return;

    const snapshot = record;
    onDeleted(record.id);

    setDeleting(true);
    try {
      let id = record.id;
      if (isOptimisticRecordId(id)) {
        const resolved = await resolveClientRecordId(record);
        if (!isOptimisticRecordId(resolved)) {
          id = resolved;
        } else {
          return;
        }
      }
      const res = await fetch(`/api/v2/records/${id}`, { method: 'DELETE' });
      const errBody = !res.ok ? await res.json().catch(() => ({})) : null;
      const notFound = isRecordNotFoundApiError(errBody, res.status);
      if (res.ok || notFound) {
        if (id !== record.id) onDeleted(id);
        return;
      }
      onDeleteFailed?.(snapshot);
      const pe = parseClientApiJson(errBody);
      onError(pe.message || '删除失败');
    } catch {
      onDeleteFailed?.(snapshot);
      onError('删除失败，请重试');
    } finally {
      setDeleting(false);
    }
  }, [deleting, record, onDeleted, onDeleteFailed, onError]);

  return {
    form,
    patchForm,
    save,
    remove,
    saving,
    deleting,
    saveStatus,
    setContextSubItemsCount,
  };
}
