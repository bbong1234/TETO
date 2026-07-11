'use client';



import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Loader2, Send } from 'lucide-react';

import type { Item, Record as TetoRecord, Tag as TetoTag } from '@/types/teto';
import type { UserRule } from '@/lib/db/user-rules';

import { postManualRecord } from '@/lib/activity/post-manual-record';
import { resolveTemporalFields } from '@/lib/utils/record-unit-mapper';
import { dateAndTimeToIso } from '@/lib/activity/record-time';

import { buildOptimisticManualRecord } from '@/lib/activity/records-mutation';

import {

  buildActivityContextFromAttributionOption,

  buildQuickCreateAttributionOptions,

  pickDefaultAttributionOptionId,

  type QuickCreateAttributionOption,

} from '@/lib/activity/quick-create-preview';

import { triggerAiEnhance, type NewItemSuggestion } from '@/lib/activity/ai-enhance-trigger';

import { loadSubItemsForHosts } from '@/hooks/use-activity-context-data';
import { isActiveItem } from '@/lib/activity/item-tree';
import type { SubItem } from '@/types/teto';

import { matchPresetsByText } from '@/lib/utils/item-match';



interface ParsedHint {

  cost?: number;

  durationMinutes?: number;

  location?: string;

}



function parseQuickHints(text: string): ParsedHint {

  const hints: ParsedHint = {};



  const costMatch =

    text.match(/¥\s*(\d+(?:\.\d+)?)/) ??

    text.match(/(\d+(?:\.\d+)?)\s*元/) ??

    text.match(/(\d+(?:\.\d+)?)\s*块/);

  if (costMatch) hints.cost = parseFloat(costMatch[1]);



  const hrMatch = text.match(/(\d+(?:\.\d+)?)\s*小时/);

  const minMatch = text.match(/(\d+)\s*分钟/) ?? text.match(/(\d+)\s*min/i);

  if (hrMatch) hints.durationMinutes = Math.round(parseFloat(hrMatch[1]) * 60);

  else if (minMatch) hints.durationMinutes = parseInt(minMatch[1], 10);



  return hints;

}



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

  onAiEnhanceStart?: (id: string) => void;

  onAiEnhanceEnd?: (id: string) => void;

  onRecordPatched?: (record: TetoRecord) => void;

  onFallbackRefresh?: () => void;

  onNewItemSuggested?: (suggestion: NewItemSuggestion) => void;

  /** embedded：整合进上方输入卡片；standalone：独立区块 */

  variant?: 'embedded' | 'standalone';

  /**
   * 当自动归属发生变化时回调。
   * optionId 形如 l1:xxx / l2:xxx，用于区分「仅一类」与「二类/三类」匹配。
   */
  /** 输入解析出的归属，用于同步上方标签栏（仅选标签，不进入块时间） */
  onAttributionResolved?: (context: import('@/lib/activity/activity-context-types').ActivityContextValue | null) => void;
  /** 本地规则解析出的动作标签，用于同步上方动作栏 */
  onFunctionTagResolved?: (tagId: string | null) => void;

  /** 用户已在上方 AttributionFlowPicker 手动改过归属 */
  contextManualOverride?: boolean;

  /** 手动归属上下文，发送时优先于自动匹配 */
  manualContext?: { itemId: string; subItemId?: string } | null;

  /** 手动附加标签，发送时合并进 tag_ids */
  manualTagIds?: string[];

  /** 输入框被清空时回调；手动选择的归属需要保留。 */
  onInputClear?: (options: { preserveManualSelection: boolean }) => void;

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

  onAiEnhanceStart,

  onAiEnhanceEnd,

  onRecordPatched,

  onFallbackRefresh,

  onNewItemSuggested,

  variant = 'standalone',

  onAttributionResolved,
  onFunctionTagResolved,

  contextManualOverride = false,

  manualContext = null,

  manualTagIds = [],

  onInputClear,

}: QuickCreateBarProps) {

  const [text, setText] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const [selectedAttributionId, setSelectedAttributionId] = useState<string | null>(null);

  const [subItemsForMatch, setSubItemsForMatch] = useState<SubItem[]>([]);
  const manualSelectionRef = useRef<QuickCreateAttributionOption | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // 用 ref 存储回调，避免 useEffect 依赖数组引发无限重渲染
  const onAttributionResolvedRef = useRef(onAttributionResolved);
  onAttributionResolvedRef.current = onAttributionResolved;
  const onFunctionTagResolvedRef = useRef(onFunctionTagResolved);
  onFunctionTagResolvedRef.current = onFunctionTagResolved;
  const onInputClearRef = useRef(onInputClear);
  onInputClearRef.current = onInputClear;

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

  const hints = parseQuickHints(text);

  const hasHints = hints.cost != null || hints.durationMinutes != null;



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

  // 当选中归属稳定后通知父组件同步 AttributionFlowPicker
  useEffect(() => {

    if (!text.trim() || contextManualOverride) return;

    const resolved = selectedAttribution;

    onAttributionResolvedRef.current?.(
      buildActivityContextFromAttributionOption(items, resolved, selectedAttributionId)
    );
    if (resolved?.functionTagId) {
      onFunctionTagResolvedRef.current?.(resolved.functionTagId);
    }

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



    const today = todayStr();

    const now = new Date();



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

      // 仅匹配到一类：写入大类 id

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

    const reviewStatus =

      picked?.isNoAssign || picked?.id === 'unassigned' || !itemId

        ? ('unchecked' as const)

        : ('confirmed' as const);



    const temporal = resolveTemporalFields(today, '发生', {
      time_text: trimmed,
      duration_minutes: hints.durationMinutes,
    });

    let occurredAt = temporal.occurredAt;
    let occurredAtEnd = temporal.occurredAtEnd;
    if (!occurredAt) {
      const currentClock = `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}`;
      const defaultEnd = dateAndTimeToIso(temporal.recordDate, currentClock);
      occurredAt = hints.durationMinutes
        ? new Date(
            new Date(defaultEnd).getTime() - hints.durationMinutes * 60000
          ).toISOString()
        : defaultEnd;
      if (hints.durationMinutes) occurredAtEnd = defaultEnd;
    }
    if (!occurredAtEnd && hints.durationMinutes) {
      occurredAtEnd = new Date(
        new Date(occurredAt).getTime() + hints.durationMinutes * 60000
      ).toISOString();
    }

    const payload = {
      raw_input: trimmed,
      content: '',
      type: '发生' as const,
      date: temporal.recordDate,
      lifecycle_status: 'completed' as const,
      input_source: 'quick' as const,
      review_status: reviewStatus,
      ...(occurredAt ? { occurred_at: occurredAt } : {}),
      ...(occurredAtEnd ? { occurred_at_end: occurredAtEnd } : {}),
      ...(temporal.anchorDate ? { time_anchor_date: temporal.anchorDate } : {}),
      ...(itemId ? { item_id: itemId } : {}),
      ...(subItemId ? { sub_item_id: subItemId } : {}),
      ...(tagIds ? { tag_ids: tagIds } : {}),
      ...(hints.cost != null
        ? { cost: hints.cost, money_direction: 'expense' as const, money_currency: 'CNY' }
        : {}),
      ...(hints.durationMinutes != null ? { duration_minutes: hints.durationMinutes } : {}),
    };



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

      onAiEnhanceStart?.(created.id);

      triggerAiEnhance({
        recordId: created.id,
        inputText: trimmed,
        date: today,
        items,
        userRules,
        existingItemId: created.item_id ?? null,
        inputSource: 'quick',

        onFieldsUpdated: (_patch, updated) => {

          onAiEnhanceEnd?.(created.id);

          if (updated) onRecordPatched?.(updated);

        },

        onError: () => onAiEnhanceEnd?.(created.id),

        onNewItemSuggested,

      });

    } catch (e) {

      onFallbackRefresh?.();

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

    hints,

    selectedAttribution,

    onRecordAdded,

    onError,

    onAiEnhanceStart,

    onAiEnhanceEnd,

    onRecordPatched,

    onFallbackRefresh,

    onNewItemSuggested,

    contextManualOverride,

    manualContext,

    manualTagIds,

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

          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}

          placeholder="随手记… (¥20 早饭 2分钟)"

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



      {hasHints && text.trim() && (

        <div className="flex flex-wrap gap-1.5 px-0.5">

          {hints.cost != null && (

            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 border border-green-100">

              ¥{hints.cost}

            </span>

          )}

          {hints.durationMinutes != null && (

            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-100">

              {hints.durationMinutes >= 60

                ? `${Math.floor(hints.durationMinutes / 60)}小时${hints.durationMinutes % 60 > 0 ? `${hints.durationMinutes % 60}分` : ''}`

                : `${hints.durationMinutes}分钟`}

            </span>

          )}

        </div>

      )}

    </div>

  );

}


