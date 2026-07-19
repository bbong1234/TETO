'use client';

import { memo, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import type { Item, Record as TetoRecord, Tag } from '@/types/teto';
import type { PlanPriority } from '@/lib/activity/plan-priority';
import AttributionFlowPicker from '@/components/records/AttributionFlowPicker';
import ContextualFunctionTagRow from '@/components/records/ContextualFunctionTagRow';
import TodayPlansPanel from './TodayPlansPanel';
import QuickCreateBar from './QuickCreateBar';
import type { UserRule } from '@/lib/db/user-rules';
import {
  type ActivityContextValue,
} from './ActivityContextPicker';
import {
  resolveTargetItemId,
  validateActivityContext,
} from '@/lib/activity/item-tree';

type IdleMode = '想法' | '计划' | '发生';

function AttributionTagSection({
  items,
  itemsLoading,
  context,
  tags,
  actionTagId,
  onContextChange,
  onItemsChange,
  onItemCreated,
  onCreateError,
  onSubItemsLoaded,
  onActionTagChange,
  onTagCreated,
}: {
  items: Item[];
  itemsLoading?: boolean;
  context: ActivityContextValue;
  tags: Tag[];
  actionTagId: string | null;
  onContextChange: (v: ActivityContextValue) => void;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onCreateError?: (message: string) => void;
  onSubItemsLoaded?: (subItems: import('@/types/teto').SubItem[]) => void;
  onActionTagChange: (tagId: string | null) => void;
  onTagCreated?: (tag: Tag) => void;
}) {
  const itemAnchorId = resolveTargetItemId(context);
  const categoryAnchorId = context.categoryItemId || null;
  const effectiveActionScopeItemId = itemAnchorId ?? categoryAnchorId;

  return (
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
              scopeItemId={categoryAnchorId}
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
  );
}

export default memo(function ActivityIdlePanel({
  items,
  itemsLoading = false,
  tags = [],
  todayRecords,
  todayDate,
  onPlanComplete,
  onRecordPlanPriorityChange,
  content,
  mode,
  context,
  actionTagId,
  onTagCreated,
  planPriority,
  onPlanPriorityChange,
  submitting,
  onContentChange,
  onModeChange,
  onContextChange,
  onActionTagChange,
  onAutoActionTagResolved,
  onItemsChange,
  onItemCreated,
  onCreateError,
  onSubItemsLoaded,
  onSubmit,
  onQuickCreateAttributionResolved,
  onQuickCreateInputClear,
  contextManualOverride = false,
  userRules,
  onRecordAdded,
  onQuickCreateError,
  anchorDate,
  autoFocusQuickCreate,
  onQuickCreateSubmitted,
}: {
  items: Item[];
  itemsLoading?: boolean;
  tags?: Tag[];
  todayRecords: TetoRecord[];
  todayDate: string;
  onPlanComplete?: (record: TetoRecord) => void;
  onRecordPlanPriorityChange?: (record: TetoRecord, priority: PlanPriority | null) => void | Promise<void>;
  content: string;
  mode: IdleMode;
  context: ActivityContextValue;
  actionTagId: string | null;
  onTagCreated?: (tag: Tag) => void;
  planPriority?: PlanPriority | null;
  onPlanPriorityChange?: (p: PlanPriority | null) => void;
  submitting: boolean;
  onContentChange: (v: string) => void;
  onModeChange: (v: IdleMode) => void;
  onContextChange: (v: ActivityContextValue) => void;
  onActionTagChange: (tagId: string | null) => void;
  /** 本地随手记规则自动推荐动作；不应覆盖用户手动归属状态。 */
  onAutoActionTagResolved?: (tagId: string | null) => void;
  onSubItemsLoaded?: (subItems: import('@/types/teto').SubItem[]) => void;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onCreateError?: (message: string) => void;
  onSubmit: () => void;
  onQuickCreateAttributionResolved?: (context: ActivityContextValue | null) => void;
  onQuickCreateInputClear?: (options: { preserveManualSelection: boolean }) => void;
  contextManualOverride?: boolean;
  userRules?: UserRule[];
  onRecordAdded?: (record: TetoRecord, replaceOptimistic?: boolean) => void;
  onQuickCreateError?: (message: string) => void;
  /** 随手记记录归属日期，默认 todayDate */
  anchorDate?: string;
  autoFocusQuickCreate?: boolean;
  onQuickCreateSubmitted?: () => void;
}) {
  const [subItemsCount, setSubItemsCount] = useState(0);

  const handleSubItemsLoaded = useCallback(
    (subs: import('@/types/teto').SubItem[]) => {
      setSubItemsCount(subs.length);
      onSubItemsLoaded?.(subs);
    },
    [onSubItemsLoaded]
  );

  const itemAnchorId = resolveTargetItemId(context);
  const categoryAnchorId = context.categoryItemId || null;
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

  return (
    <div className="space-y-3 px-4 py-3">
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

      <AttributionTagSection
        items={items}
        itemsLoading={itemsLoading}
        context={context}
        tags={tags}
        actionTagId={actionTagId}
        onContextChange={onContextChange}
        onItemsChange={onItemsChange}
        onItemCreated={onItemCreated}
        onCreateError={onCreateError}
        onSubItemsLoaded={handleSubItemsLoaded}
        onActionTagChange={onActionTagChange}
        onTagCreated={onTagCreated}
      />

      {mode === '发生' && onRecordAdded && (
        <QuickCreateBar
          variant="embedded"
          items={items}
          userRules={userRules}
          tags={tags}
          anchorDate={anchorDate ?? todayDate}
          autoFocus={autoFocusQuickCreate}
          onRecordAdded={onRecordAdded}
          onError={onQuickCreateError}
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
          onSubmitted={onQuickCreateSubmitted}
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
        <p className="text-[10px] text-slate-400 leading-snug">
          {mode === '发生'
            ? '选择一类、事项与动作标签，在输入框随手记已完成的事'
            : mode === '计划'
              ? '选择归属标签后记录计划，或从下方列表勾选完成'
              : '选择归属标签后记录想法'}
        </p>
      </div>
    </div>
  );
});
