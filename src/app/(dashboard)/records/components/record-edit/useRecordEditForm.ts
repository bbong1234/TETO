'use client';

import { useCallback, useEffect, useState } from 'react';
import { persistToolOptionIfNeeded } from '@/components/records/ToolLabelField';
import {
  applyParsedUnitToFormState,
  buildCorrectionPayload,
  formStateToUpdatePayload,
  recordToFormState,
  type RecordEditFormState,
} from '@/lib/activity/record-form';
import { resolveActivityContextFromRecord, validateActivityContext } from '@/lib/activity/item-tree';
import type { ParsedSemantic } from '@/types/semantic';
import type { Item, Record } from '@/types/teto';
import { parseClientApiJson } from '@/lib/observability/client-request';

interface UseRecordEditFormOptions {
  record: Record;
  items: Item[];
  onSaved: (updated: Record) => void;
  onDeleted: (id: string) => void;
  onError: (message: string) => void;
}

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

export function useRecordEditForm({
  record,
  items,
  onSaved,
  onDeleted,
  onError,
}: UseRecordEditFormOptions) {
  const [form, setForm] = useState<RecordEditFormState>(() => recordToFormState(record, items));
  const [contextSubItemsCount, setContextSubItemsCount] = useState(0);
  const [isEditingRawInput, setIsEditingRawInput] = useState(false);
  const [isReParsing, setIsReParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    setForm(recordToFormState(record, items));
    setIsEditingRawInput(false);
  }, [record.id, record.updated_at, items]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      activityContext: {
        ...resolveActivityContextFromRecord(items, record.item_id, record.sub_item_id),
        phaseId: record.phase_id || prev.activityContext.phaseId || '',
      },
      toolLabel: record.tool_label || prev.toolLabel,
    }));
  }, [record.item_id, record.sub_item_id, record.phase_id, record.tool_label, items]);

  const patchForm = useCallback((patch: Partial<RecordEditFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const save = useCallback(async () => {
    if (saving) return;
    const contextErr = validateActivityContext(form.activityContext, items, contextSubItemsCount);
    if (contextErr) {
      onError(contextErr);
      return;
    }
    setSaving(true);
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
        return;
      }
      const json = await res.json();
      const env = parseClientApiJson(json);
      const updated = env.data as Record;
      if (form.toolLabel.trim()) void persistToolOptionIfNeeded(form.toolLabel);
      if (record.review_status === 'confirmed' || record.input_source === 'ai') {
        void fireCorrections(record.id, buildCorrectionPayload(record, payload));
      }
      onSaved(updated);
    } catch {
      onError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }, [saving, form, items, contextSubItemsCount, record, onSaved, onError]);

  const remove = useCallback(async () => {
    if (deleting) return;
    if (!confirm('确定要删除这条记录吗？')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v2/records/${record.id}`, { method: 'DELETE' });
      if (res.ok) {
        onDeleted(record.id);
      } else {
        const err = await res.json().catch(() => ({}));
        const pe = parseClientApiJson(err);
        onError(pe.message || '删除失败');
      }
    } catch {
      onError('删除失败，请重试');
    } finally {
      setDeleting(false);
    }
  }, [deleting, record.id, onDeleted, onError]);

  const reParse = useCallback(async () => {
    if (!form.rawInput.trim() || isReParsing) return;
    setIsReParsing(true);
    try {
      const date = form.recordDate || record.date || new Date().toISOString().split('T')[0];
      let recentRecords: Array<{ id: string; content: string; date: string; type: string }> | undefined;
      try {
        const now = new Date();
        const threeDaysAgo = new Date(now);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const fmtDate = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const recentRes = await fetch(
          `/api/v2/records?date_from=${fmtDate(threeDaysAgo)}&date_to=${fmtDate(now)}`
        );
        if (recentRes.ok) {
          const recentJson = await recentRes.json();
          if (Array.isArray(recentJson.data)) {
            recentRecords = recentJson.data.map(
              (r: { id: string; content: string; date: string; type: string }) => ({
                id: r.id,
                content: r.content,
                date: r.date,
                type: r.type,
              })
            );
          }
        }
      } catch {
        /* ignore */
      }

      const parseRes = await fetch('/api/v2/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: form.rawInput.trim(),
          date,
          recent_records: recentRecords,
          items: items.map((i) => ({ id: i.id, title: i.title })),
        }),
      });
      if (!parseRes.ok) {
        onError('AI 解析失败');
        return;
      }
      const json = await parseRes.json();
      if (!json?.data?.parsed?.units?.[0]) {
        onError('AI 解析返回空结果');
        return;
      }
      const unit = json.data.parsed.units[0] as ParsedSemantic;
      const typeHint = json.data.type_hints?.[0] as string | undefined;
      setForm((prev) => applyParsedUnitToFormState(prev, unit, form.rawInput, typeHint, items));
      setIsEditingRawInput(false);
    } catch {
      onError('AI 重新解析失败，请重试');
    } finally {
      setIsReParsing(false);
    }
  }, [form.rawInput, form.recordDate, record.date, items, isReParsing, onError]);

  return {
    form,
    patchForm,
    save,
    remove,
    reParse,
    saving,
    deleting,
    showAdvanced,
    setShowAdvanced,
    isEditingRawInput,
    setIsEditingRawInput,
    isReParsing,
    setContextSubItemsCount,
  };
}
