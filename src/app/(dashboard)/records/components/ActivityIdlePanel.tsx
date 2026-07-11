'use client';

import { memo, useMemo, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import type { Item, Record as TetoRecord, UserTool, Tag } from '@/types/teto';
import type { PlanPriority } from '@/lib/activity/plan-priority';
import type { ActivitySwitchPayload } from '@/lib/activity/records-mutation';
import { DIARY_ITEM_TITLE } from '@/lib/activity/constants';
import InputSuggestChips from '@/components/records/InputSuggestChips';
import AttributionFlowPicker from '@/components/records/AttributionFlowPicker';
import ContextualFunctionTagRow from '@/components/records/ContextualFunctionTagRow';
import MoodPicker from '@/components/records/MoodPicker';
import TodayPlansPanel from './TodayPlansPanel';
import QuickCreateBar from './QuickCreateBar';
import QuickSwitchPanel from './QuickSwitchPanel';
import QuickStartBubbles from './QuickStartBubbles';
import type { QuickStartBubble } from '@/lib/activity/quick-start-bubbles';
import type { QuickSwitchEntry } from '@/lib/activity/quick-switch-utils';
import type { UserRule } from '@/lib/db/user-rules';
import type { NewItemSuggestion } from '@/lib/activity/ai-enhance-trigger';
import {
  EMPTY_ACTIVITY_CONTEXT,
  type ActivityContextValue,
} from './ActivityContextPicker';
import {
  resolveActivityContextFromRecord,
  resolveTargetItemId,
  validateActivityContext,
} from '@/lib/activity/item-tree';

type IdleMode = '想法' | '计划' | '发生';

export default memo(function ActivityIdlePanel({
  items,
  itemsLoading = false,
  userTools,
  toolsLoading,
  onToolsChange,
  tags = [],
  todayRecords,
  todayDate,
  quickSwitchRecords = [],
  onQuickSwitch,
  onQuickSwitchSelect,
  onQuickSwitchStateChange,
  onPlanComplete,
  onRecordPlanPriorityChange,
  content,
  mode,
  context,
  toolLabel,
  mood,
  actionTagId,
  selectedTagIds = [],
  onTagIdsChange,
  onTagCreated,
  planPriority,
  onPlanPriorityChange,
  submitting,
  onContentChange,
  onModeChange,
  onContextChange,
  onToolLabelChange,
  onMoodChange,
  onActionTagChange,
  onAutoActionTagResolved,
  onItemsChange,
  onItemCreated,
  onCreateError,
  onSubItemsLoaded,
  onSubmit,
  onCustomStart,
  onSelectCategory,
  onEnterBlockTime,
  onQuickCreateAttributionResolved,
  onQuickCreateInputClear,
  contextManualOverride = false,
  onContextHintSelect,
  userRules,
  onRecordAdded,
  onAiEnhanceStart,
  onAiEnhanceEnd,
  onRecordPatched,
  onFallbackRefresh,
  onNewItemSuggested,
  onQuickCreateError,
}: {
  items: Item[];
  itemsLoading?: boolean;
  userTools?: UserTool[];
  toolsLoading?: boolean;
  onToolsChange?: (tools: UserTool[]) => void;
  tags?: Tag[];
  todayRecords: TetoRecord[];
  todayDate: string;
  quickSwitchRecords?: TetoRecord[];
  onQuickSwitch?: (data: ActivitySwitchPayload) => void;
  onQuickSwitchSelect?: (entry: QuickSwitchEntry, toolLabel: string | null) => void;
  onQuickSwitchStateChange?: (loading: boolean) => void;
  onPlanComplete?: (record: TetoRecord) => void;
  onRecordPlanPriorityChange?: (record: TetoRecord, priority: PlanPriority | null) => void | Promise<void>;
  content: string;
  mode: IdleMode;
  context: ActivityContextValue;
  toolLabel: string;
  mood: string | null;
  actionTagId: string | null;
  selectedTagIds?: string[];
  onTagIdsChange?: (ids: string[]) => void;
  onTagCreated?: (tag: Tag) => void;
  planPriority?: PlanPriority | null;
  onPlanPriorityChange?: (p: PlanPriority | null) => void;
  submitting: boolean;
  onContentChange: (v: string) => void;
  onModeChange: (v: IdleMode) => void;
  onContextChange: (v: ActivityContextValue) => void;
  onToolLabelChange: (v: string) => void;
  onMoodChange: (v: string | null) => void;
  onActionTagChange: (tagId: string | null) => void;
  /** 本地随手记规则自动推荐动作；不应覆盖用户手动归属状态。 */
  onAutoActionTagResolved?: (tagId: string | null) => void;
  onSubItemsLoaded?: (subItems: import('@/types/teto').SubItem[]) => void;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onCreateError?: (message: string) => void;
  onSubmit: () => void;
  onCustomStart?: () => void;
  onSelectCategory?: (bubble: QuickStartBubble) => void;
  onEnterBlockTime?: () => void;
  /** 随手记输入框解析结果，同步到 AttributionFlowPicker */
  onQuickCreateAttributionResolved?: (context: ActivityContextValue | null) => void;
  onQuickCreateInputClear?: (options: { preserveManualSelection: boolean }) => void;
  contextManualOverride?: boolean;
  onContextHintSelect?: (hint: { kind: 'cost' | 'location' | 'content'; value: string | number }) => void;
  userRules?: UserRule[];
  onRecordAdded?: (record: TetoRecord, replaceOptimistic?: boolean) => void;
  onAiEnhanceStart?: (recordId: string) => void;
  onAiEnhanceEnd?: (recordId: string) => void;
  onRecordPatched?: (record: TetoRecord) => void;
  onFallbackRefresh?: () => void;
  onNewItemSuggested?: (suggestion: NewItemSuggestion) => void;
  onQuickCreateError?: (message: string) => void;
}) {
  const hasDiaryItem = items.some((i) => i.title === DIARY_ITEM_TITLE);

  const [subItemsCount, setSubItemsCount] = useState(0);

  const handleSubItemsLoaded = useCallback(
    (subs: import('@/types/teto').SubItem[]) => {
      onSubItemsLoaded?.(subs);
    },
    [onSubItemsLoaded]
  );

  const itemAnchorId = resolveTargetItemId(context);
  const categoryAnchorId = context.categoryItemId || null;
  const effectiveActionScopeItemId = itemAnchorId ?? categoryAnchorId;
  const selectedActionTagIds = actionTagId ? [actionTagId] : [];
  const hasActionOnlyAnchor = mode === '发生' && Boolean(categoryAnchorId && actionTagId);
  const contextErr = hasActionOnlyAnchor
    ? null
    : validateActivityContext(context, items, subItemsCount);
  const canSubmit =
    mode === '发生' ? !contextErr : Boolean(content.trim()) && !contextErr;

  const submitBg =
    mode === '发生'
      ? 'bg-blue-500 hover:bg-blue-600'
      : mode === '计划'
        ? 'bg-indigo-500 hover:bg-indigo-600'
        : 'bg-purple-500 hover:bg-purple-600';

  const bubbleRecords = [...todayRecords, ...quickSwitchRecords];

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <QuickSwitchPanel
          variant="idle-top"
          supplementRecords={quickSwitchRecords}
          items={items}
          userTools={userTools}
          toolsLoading={toolsLoading}
          onSwitched={onQuickSwitch}
          onEntrySelect={onQuickSwitchSelect}
          onSwitchStateChange={onQuickSwitchStateChange}
          onError={onCreateError}
        />
        {onCustomStart && (
          <button
            type="button"
            onClick={onCustomStart}
            className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600"
          >
            + 自定义
          </button>
        )}
      </div>

      <div className="flex w-fit rounded-lg border border-slate-200 overflow-hidden">
        {(['发生', '想法', '计划'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onModeChange(t)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === t
                ? t === '发生'
                  ? 'bg-blue-500 text-white'
                  : t === '计划'
                    ? 'bg-indigo-500 text-white'
                    : 'bg-purple-500 text-white'
                : 'bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {mode === '发生' && (
        <>
          <div className="space-y-2">
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-slate-500">一类标签（大类）</span>
                <span className="text-[10px] text-slate-400">先定范围</span>
              </div>
              <AttributionFlowPicker
                items={items}
                itemsLoading={itemsLoading}
                value={context}
                onChange={onContextChange}
                onItemsChange={onItemsChange}
                onItemCreated={onItemCreated}
                onCreateError={onCreateError}
                onSubItemsLoaded={onSubItemsLoaded}
                dimUnselected
                hideItemLevels
              />
            </div>
            {context.categoryItemId && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium text-slate-500">事项（可选，单选）</span>
                    <span className="text-[10px] text-slate-400">项目/主题线</span>
                  </div>
                  <AttributionFlowPicker
                    items={items}
                    itemsLoading={itemsLoading}
                    value={context}
                    onChange={onContextChange}
                    onItemsChange={onItemsChange}
                    onItemCreated={onItemCreated}
                    onCreateError={onCreateError}
                    onSubItemsLoaded={onSubItemsLoaded}
                    dimUnselected
                    hideCategoryLevel
                  />
                </div>
                <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium text-slate-500">动作（可选，单选）</span>
                    <span className="text-[10px] text-slate-400">行为线</span>
                  </div>
                  <ContextualFunctionTagRow
                    itemId={effectiveActionScopeItemId}
                    fallbackTags={tags}
                    selectedTagId={actionTagId}
                    onSelect={onActionTagChange}
                    onTagCreated={onTagCreated}
                    hideLabel
                    chipVariant="outline"
                    strictScope
                  />
                </div>
              </div>
            )}
          </div>
          {/* 进入块时间：按当前选中标签立即开始计时 */}
          {context.categoryItemId && onEnterBlockTime && (
            <div>
              <button
                type="button"
                onClick={onEnterBlockTime}
                className="flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
              >
                <span className="h-2 w-2 rounded-full bg-blue-400" />
                进入块时间
              </button>
            </div>
          )}
        </>
      )}

      {mode === '发生' && onRecordAdded && (
        <QuickCreateBar
          variant="embedded"
          items={items}
          userRules={userRules}
          tags={tags}
          onRecordAdded={onRecordAdded}
          onError={onQuickCreateError}
          onAiEnhanceStart={onAiEnhanceStart}
          onAiEnhanceEnd={onAiEnhanceEnd}
          onRecordPatched={onRecordPatched}
          onFallbackRefresh={onFallbackRefresh}
          onNewItemSuggested={onNewItemSuggested}
          onAttributionResolved={onQuickCreateAttributionResolved}
          onFunctionTagResolved={onAutoActionTagResolved}
          onInputClear={onQuickCreateInputClear}
          contextManualOverride={contextManualOverride}
          manualContext={
            contextManualOverride && context
              ? {
                  itemId: itemAnchorId || categoryAnchorId || '',
                  subItemId: context.subItemId || undefined,
                }
              : null
          }
          manualTagIds={selectedActionTagIds}
        />
      )}

      {mode !== '发生' && (
        <div className="flex gap-2">
          <input
            type="text"
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && canSubmit && onSubmit()}
            placeholder={
              mode === '计划' ? '记下要做的事…' : '随手记一条想法…'
            }
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button
            type="button"
            disabled={submitting || !canSubmit}
            onClick={onSubmit}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50 ${submitBg}`}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            记录
          </button>
        </div>
      )}

      {(mode === '想法' || mode === '计划') && (
        <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
          <InputSuggestChips
            text={content}
            tags={tags}
            items={items}
            selectedTagIds={selectedTagIds}
            onSelectTag={(tag) => {
              if (!onTagIdsChange) return;
              if (!selectedTagIds.includes(tag.id)) {
                onTagIdsChange([...selectedTagIds, tag.id]);
              }
            }}
            onSelectItem={(item) => {
              const ctx = resolveActivityContextFromRecord(items, item.id) as ActivityContextValue;
              onContextChange(ctx);
            }}
          />

          <div>
            <span className="mb-0.5 block text-[10px] font-medium text-slate-500">归属（可选）</span>
            <AttributionFlowPicker
              items={items}
              itemsLoading={itemsLoading}
              value={context}
              onChange={onContextChange}
              onItemsChange={onItemsChange}
              onItemCreated={onItemCreated}
              onCreateError={onCreateError}
              onSubItemsLoaded={handleSubItemsLoaded}
              onContextHintSelect={onContextHintSelect}
            />
          </div>

          {mode === '计划' && onPlanPriorityChange && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 shrink-0">优先级</span>
              {(['high', 'medium', 'low'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPlanPriorityChange(planPriority === p ? null : p)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    planPriority === p
                      ? p === 'high'
                        ? 'bg-red-100 text-red-700'
                        : p === 'medium'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-200 text-slate-600'
                      : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {p === 'high' ? '高' : p === 'medium' ? '中' : '低'}
                </button>
              ))}
            </div>
          )}

          {mode === '想法' && (
            <p className="text-[10px] text-slate-400 leading-snug">
              {hasDiaryItem
                ? `日复盘可归属「${DIARY_ITEM_TITLE}」事项；项目复盘建议写在对应子项下。`
                : `建议新建「${DIARY_ITEM_TITLE}」事项作为日复盘入口；项目复盘写在对应子项下。`}
            </p>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 shrink-0">心情</span>
            <MoodPicker value={mood} onChange={onMoodChange} size="sm" />
          </div>
        </div>
      )}

      {mode === '计划' && onPlanComplete && (
        <TodayPlansPanel
          date={todayDate}
          records={todayRecords}
          items={items}
          onComplete={onPlanComplete}
          onPriorityChange={onRecordPlanPriorityChange}
        />
      )}

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
        {mode === '发生' ? (
          <p className="text-[10px] text-slate-400 leading-snug">
            点标签选择归属，点击「进入块时间」开始计时，或在输入框随手记已完成的事
          </p>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
});
