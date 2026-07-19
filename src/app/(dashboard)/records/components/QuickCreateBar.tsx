'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import type { Item, Record as TetoRecord, Tag as TetoTag } from '@/types/teto';
import type { UserRule } from '@/lib/db/user-rules';
import { postManualRecord } from '@/lib/activity/post-manual-record';
import { dateAndTimeToIso } from '@/lib/activity/record-time';
import { buildOptimisticManualRecord } from '@/lib/activity/records-mutation';
import {
  buildActivityContextFromAttributionOption,
  buildQuickCreateAttributionOptions,
  pickDefaultAttributionOptionId,
  type QuickCreateAttributionOption,
} from '@/lib/activity/quick-create-preview';
import { loadSubItemsForHosts } from '@/hooks/use-activity-context-data';
import { isActiveItem } from '@/lib/activity/item-tree';
import type { SubItem } from '@/types/teto';
import { matchPresetsByText } from '@/lib/utils/item-match';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface QuickCreateBarProps {
  items: Item[];
  userRules?: UserRule[];
  tags?: TetoTag[];
  onRecordAdded: (record: TetoRecord, replaceOptimistic?: boolean) => void;
  onError?: (msg: string) => void;
  variant?: 'embedded' | 'standalone';
  /** 记录归属日期，默认今天 */
  anchorDate?: string;
  /** 挂载后聚焦输入框 */
  autoFocus?: boolean;
  onAttributionResolved?: (context: import('@/lib/activity/activity-context-types').ActivityContextValue | null) => void;
  onFunctionTagResolved?: (tagId: string | null) => void;
  contextManualOverride?: boolean;
  manualContext?: { itemId: string; subItemId?: string } | null;
  manualTagIds?: string[];
  onInputClear?: (options: { preserveManualSelection: boolean }) => void;
  /** 提交成功后回调（如关闭展开区） */
  onSubmitted?: () => void;
  /** Escape 关闭 */
  onDismiss?: () => void;
}

function AttributionOptionBubble({
  option,
  selected,
  disabled,
  onSelect,
}: {
  option: QuickCreateAttributionOption;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      title={option.label}
      aria-label={`归属到 ${option.label}`}
      aria-pressed={selected}
      className={[
        'flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border text-center shadow-sm transition-all active:scale-95 disabled:opacity-50',
        selected
          ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200/80'
          : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40',
        option.isNoAssign && !selected ? 'border-dashed' : '',
        option.id === 'unassigned' && !selected ? 'border-dashed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        className={`max-w-[3.25rem] truncate px-0.5 text-xs leading-tight ${
          selected ? 'font-semibold text-blue-800' : 'font-medium text-slate-700'
        }`}
      >
        {option.shortLabel}
      </span>
    </button>
  );
}

export default function QuickCreateBar({
  items,
  userRules = [],
  tags = [],
  onRecordAdded,
  onError,
  variant = 'standalone',
  anchorDate,
  autoFocus = false,
  onAttributionResolved,
  onFunctionTagResolved,
  contextManualOverride = false,
  manualContext = null,
  manualTagIds = [],
  onInputClear,
  onSubmitted,
  onDismiss,
}: QuickCreateBarProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedAttributionId, setSelectedAttributionId] = useState<string | null>(null);
  const [subItemsForMatch, setSubItemsForMatch] = useState<SubItem[]>([]);
  const manualSelectionRef = useRef<QuickCreateAttributionOption | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onAttributionResolvedRef = useRef(onAttributionResolved);
  onAttributionResolvedRef.current = onAttributionResolved;
  const onFunctionTagResolvedRef = useRef(onFunctionTagResolved);
  onFunctionTagResolvedRef.current = onFunctionTagResolved;
  const onInputClearRef = useRef(onInputClear);
  onInputClearRef.current = onInputClear;

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    const l2Ids = items.filter((i) => i.parent_item_id && isActiveItem(i)).map((i) => i.id);
    if (l2Ids.length === 0) {
      setSubItemsForMatch([]);
      return;
    }
    let cancelled = false;
    void loadSubItemsForHosts(l2Ids).then((map) => {
      if (cancelled) return;
      setSubItemsForMatch([...map.values()].flat());
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const attributionOptions = useMemo(
    () => buildQuickCreateAttributionOptions(text, items, userRules, tags, { subItems: subItemsForMatch }),
    [text, items, userRules, tags, subItemsForMatch]
  );

  const selectedAttribution = useMemo(
    () =>
      attributionOptions.find((option) => option.id === selectedAttributionId) ??
      manualSelectionRef.current,
    [attributionOptions, selectedAttributionId]
  );

  useEffect(() => {
    if (!text.trim()) {
      manualSelectionRef.current = null;
      setSelectedAttributionId(null);
      onAttributionResolvedRef.current?.(null);
      onFunctionTagResolvedRef.current?.(null);
      onInputClearRef.current?.({
        preserveManualSelection:
          contextManualOverride || Boolean(manualSelectionRef.current),
      });
      return;
    }

    if (contextManualOverride) return;

    if (manualSelectionRef.current) {
      return;
    }
    const recommendedId = pickDefaultAttributionOptionId(attributionOptions);
    if (recommendedId !== selectedAttributionId) {
      setSelectedAttributionId(recommendedId);
    }
  }, [text, attributionOptions, contextManualOverride, selectedAttributionId]);

  useEffect(() => {
    if (!text.trim() || contextManualOverride) return;

    const resolved = selectedAttribution;

    onAttributionResolvedRef.current?.(
      buildActivityContextFromAttributionOption(items, resolved, selectedAttributionId)
    );
    onFunctionTagResolvedRef.current?.(resolved?.functionTagId ?? null);
  }, [
    selectedAttribution,
    selectedAttributionId,
    text,
    items,
    contextManualOverride,
  ]);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;

    const recordDate = anchorDate ?? todayStr();
    const now = new Date();
    const currentClock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const occurredAt = dateAndTimeToIso(recordDate, currentClock);

    const presets = matchPresetsByText(trimmed, userRules);
    const picked = selectedAttribution;

    let itemId: string | undefined;
    let subItemId: string | null = null;

    if (contextManualOverride && manualContext) {
      itemId = manualContext.itemId || undefined;
      subItemId = manualContext.subItemId || null;
    } else if (picked?.isNoAssign) {
      itemId = undefined;
    } else if (picked?.id?.startsWith('l1:')) {
      itemId = picked.itemId ?? undefined;
    } else if (picked?.itemId !== undefined && picked.itemId !== null) {
      itemId = picked.itemId;
      subItemId = picked.subItemId ?? null;
    } else {
      itemId = presets.itemId ?? undefined;
    }

    const tagIds =
      manualTagIds.length > 0
        ? manualTagIds
        : picked?.functionTagId
          ? [picked.functionTagId]
          : presets.functionTagId
            ? [presets.functionTagId]
            : undefined;
    const actionText =
      tagIds?.length === 1
        ? tags.find((tag) => tag.id === tagIds[0] && tag.type === 'function')?.name.trim() || undefined
        : undefined;

    const reviewStatus =
      picked?.isNoAssign || picked?.id === 'unassigned' || !itemId
        ? ('unchecked' as const)
        : ('confirmed' as const);

    const payload = {
      raw_input: trimmed,
      content: '',
      type: '发生' as const,
      date: recordDate,
      occurred_at: occurredAt,
      lifecycle_status: 'completed' as const,
      input_source: 'quick' as const,
      review_status: reviewStatus,
      ...(itemId ? { item_id: itemId } : {}),
      ...(subItemId ? { sub_item_id: subItemId } : {}),
      ...(tagIds ? { tag_ids: tagIds } : {}),
      ...(actionText ? { action_text: actionText } : {}),
    } as Parameters<typeof postManualRecord>[0];

    const optimistic = buildOptimisticManualRecord(payload, items, tags);
    onRecordAdded(optimistic, false);
    setText('');
    manualSelectionRef.current = null;
    setSelectedAttributionId(null);
    setSubmitting(true);
    inputRef.current?.blur();

    try {
      const created = await postManualRecord(payload);
      onRecordAdded(created, true);
      onSubmitted?.();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '记录失败');
    } finally {
      setSubmitting(false);
    }
  }, [
    text,
    submitting,
    items,
    tags,
    userRules,
    selectedAttribution,
    onRecordAdded,
    onError,
    contextManualOverride,
    manualContext,
    manualTagIds,
    anchorDate,
    onSubmitted,
  ]);

  return (
    <div className={variant === 'embedded' ? 'space-y-1.5' : 'space-y-1.5'}>
      {variant === 'standalone' && attributionOptions.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {attributionOptions.map((option) => (
            <AttributionOptionBubble
              key={option.id}
              option={option}
              selected={selectedAttributionId === option.id}
              disabled={submitting}
              onSelect={() => {
                manualSelectionRef.current = option;
                setSelectedAttributionId(option.id);
              }}
            />
          ))}
        </div>
      )}

      <div className={`flex items-center gap-2 ${variant === 'embedded' ? 'pt-1' : ''}`}>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              void handleSubmit();
            }
            if (e.key === 'Escape') onDismiss?.();
          }}
          placeholder="随手记…"
          className={
            variant === 'embedded'
              ? 'min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm placeholder-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors'
              : 'min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm placeholder-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 transition-colors'
          }
          disabled={submitting}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
          className={
            variant === 'embedded'
              ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:opacity-40'
              : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-700 text-white transition-colors hover:bg-slate-800 disabled:opacity-40'
          }
          aria-label="快速记录"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
