'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Item, Record as TetoRecord, RecordType, CreateRecordPayload, Tag } from '@/types/teto';
import type { UserRule } from '@/lib/db/user-rules';
import type { PlanPriority } from '@/lib/activity/plan-priority';
import { planPriorityToSubcategory } from '@/lib/activity/plan-priority';
import { postManualRecord } from '@/lib/activity/post-manual-record';
import { buildOptimisticManualRecord } from '@/lib/activity/records-mutation';
import {
  resolveTargetItemId,
  validateActivityContext,
  resolveActivityContextFromRecord,
} from '@/lib/activity/item-tree';
import { matchByUserRules, matchPresetsByText } from '@/lib/utils/item-match';
import {
  buildActivityContextFromAttributionOption,
  buildQuickCreateAttributionOptions,
  pickDefaultAttributionOptionId,
} from '@/lib/activity/quick-create-preview';
import { saveLastActivityContext } from '@/lib/activity/recent-context';
import {
  EMPTY_ACTIVITY_CONTEXT,
  type ActivityContextValue,
} from './ActivityContextPicker';
import ActivityIdlePanel from './ActivityIdlePanel';

type IdleMode = '想法' | '计划' | '发生';

interface DiaryActivityCreatePanelProps {
  date: string;
  items: Item[];
  itemsLoading?: boolean;
  tags: Tag[];
  userRules?: UserRule[];
  dayRecords: TetoRecord[];
  onRecordAdded: (record: TetoRecord, replaceOptimistic?: boolean) => void;
  onPlanComplete?: (record: TetoRecord) => void;
  onPlanPriorityChange?: (record: TetoRecord, priority: PlanPriority | null) => void | Promise<void>;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onTagCreated?: (tag: Tag) => void;
  onCreateError?: (message: string) => void;
  onError?: (message: string) => void;
}

export default function DiaryActivityCreatePanel({
  date,
  items,
  itemsLoading = false,
  tags,
  userRules = [],
  dayRecords,
  onRecordAdded,
  onPlanComplete,
  onPlanPriorityChange,
  onItemsChange,
  onItemCreated,
  onTagCreated,
  onCreateError,
  onError,
}: DiaryActivityCreatePanelProps) {
  const [idleContent, setIdleContent] = useState('');
  const [idleMode, setIdleMode] = useState<IdleMode>('发生');
  const [idleContext, setIdleContext] = useState<ActivityContextValue>(EMPTY_ACTIVITY_CONTEXT);
  const [idleSubItemsCount, setIdleSubItemsCount] = useState(0);
  const [idleActionTagId, setIdleActionTagId] = useState<string | null>(null);
  const [idlePlanPriority, setIdlePlanPriority] = useState<PlanPriority | null>(null);
  const [idleSubmitting, setIdleSubmitting] = useState(false);
  const [contextManualOverride, setContextManualOverride] = useState(false);
  const contextManualOverrideRef = useRef(false);
  contextManualOverrideRef.current = contextManualOverride;

  const resolveEffectiveIdleContext = useCallback(
    (context: ActivityContextValue, text: string): ActivityContextValue => {
      if (resolveTargetItemId(context)) return context;
      const ruleItemId = text.trim() ? matchByUserRules(text, userRules) : null;
      if (!ruleItemId) return context;
      return resolveActivityContextFromRecord(items, ruleItemId) as ActivityContextValue;
    },
    [items, userRules]
  );

  const handleIdleSubmit = async () => {
    if (idleMode === '发生') return;

    const text = idleContent.trim();
    if (!text) {
      onError?.('想法/计划请填写具体内容');
      return;
    }

    let effectiveContext = resolveEffectiveIdleContext(idleContext, text);
    const allowsActionOnly = Boolean(effectiveContext.categoryItemId && idleActionTagId);
    const contextErr = allowsActionOnly
      ? null
      : validateActivityContext(effectiveContext, items, idleSubItemsCount);
    if (contextErr) {
      onError?.(contextErr);
      return;
    }

    let itemId: string | undefined;
    let subItemId: string | null = effectiveContext.subItemId || null;
    let tagIds: string[] | undefined = idleActionTagId ? [idleActionTagId] : undefined;

    if (!contextManualOverride) {
      const presets = matchPresetsByText(text, userRules);
      const options = buildQuickCreateAttributionOptions(text, items, userRules, tags);
      const pickedId = pickDefaultAttributionOptionId(options);
      const picked = options.find((option) => option.id === pickedId);

      if (picked?.isNoAssign) {
        itemId = undefined;
        subItemId = null;
      } else if (picked?.id?.startsWith('l1:')) {
        itemId = picked.itemId ?? undefined;
        subItemId = null;
      } else if (picked?.itemId != null) {
        itemId = picked.itemId;
        subItemId = picked.subItemId ?? null;
      } else {
        itemId =
          presets.itemId ??
          resolveTargetItemId(effectiveContext) ??
          effectiveContext.categoryItemId ??
          undefined;
      }

      const resolvedCtx = buildActivityContextFromAttributionOption(items, picked, pickedId);
      if (resolvedCtx) effectiveContext = resolvedCtx;

      if (!idleActionTagId) {
        const fnId = picked?.functionTagId ?? presets.functionTagId;
        if (fnId) tagIds = [fnId];
      }
    } else {
      itemId =
        resolveTargetItemId(effectiveContext) ??
        effectiveContext.categoryItemId ??
        undefined;
    }

    const actionText =
      tagIds?.length === 1
        ? tags.find((tag) => tag.id === tagIds![0] && tag.type === 'function')?.name.trim() || undefined
        : undefined;

    setIdleSubmitting(true);
    try {
      const payload: CreateRecordPayload = {
        content: text,
        type: idleMode as RecordType,
        date,
        item_id: itemId,
        sub_item_id: subItemId,
        input_source: 'manual',
        review_status: itemId ? 'confirmed' : 'unchecked',
        ...(tagIds ? { tag_ids: tagIds } : {}),
        ...(actionText ? { action_text: actionText } : {}),
      };
      if (idleMode === '计划') {
        payload.lifecycle_status = 'active';
        payload.time_anchor_date = date;
        if (idlePlanPriority) {
          payload.subcategory = planPriorityToSubcategory(idlePlanPriority) ?? undefined;
        }
      }

      const optimistic = buildOptimisticManualRecord(payload, items, tags);
      onRecordAdded(optimistic, false);
      saveLastActivityContext(effectiveContext);
      setIdleContext(effectiveContext);
      setIdleContent('');
      setIdleActionTagId(null);
      setIdlePlanPriority(null);
      setIdleSubmitting(false);

      try {
        const created = await postManualRecord(payload);
        onRecordAdded(created, true);
      } catch (e) {
        onError?.(e instanceof Error ? e.message : '保存失败');
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '操作失败');
      setIdleSubmitting(false);
    }
  };

  useEffect(() => {
    if (idleMode === '发生') return;
    if (!idleContent.trim() || contextManualOverride) return;

    const options = buildQuickCreateAttributionOptions(idleContent, items, userRules, tags);
    const pickedId = pickDefaultAttributionOptionId(options);
    const picked = options.find((option) => option.id === pickedId);
    if (!picked) return;

    const ctx = buildActivityContextFromAttributionOption(items, picked, pickedId);
    if (ctx) setIdleContext(ctx);
    if (picked.functionTagId) setIdleActionTagId(picked.functionTagId);
  }, [idleContent, idleMode, items, userRules, tags, contextManualOverride]);

  const handleQuickCreateAttributionResolved = useCallback((context: ActivityContextValue | null) => {
    if (contextManualOverrideRef.current) return;
    setIdleContext(context ?? EMPTY_ACTIVITY_CONTEXT);
  }, []);

  const handleIdleContextChange = useCallback((v: ActivityContextValue) => {
    const hasManualContext = Boolean(v.itemId || v.subItemId || v.phaseId);
    setIdleContext(v);
    setContextManualOverride(hasManualContext);
  }, []);

  const handleIdleActionTagChange = useCallback((tagId: string | null) => {
    setIdleActionTagId(tagId);
    setContextManualOverride(true);
  }, []);

  const handleQuickCreateInputClear = useCallback(
    ({ preserveManualSelection }: { preserveManualSelection: boolean }) => {
      if (preserveManualSelection) return;
      setIdleContext(EMPTY_ACTIVITY_CONTEXT);
      setIdleActionTagId(null);
      setContextManualOverride(false);
    },
    []
  );

  return (
    <div className="overflow-x-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <ActivityIdlePanel
        items={items}
        itemsLoading={itemsLoading}
        onItemsChange={onItemsChange}
        onItemCreated={onItemCreated}
        onCreateError={onCreateError}
        tags={tags}
        todayRecords={dayRecords}
        todayDate={date}
        anchorDate={date}
        autoFocusQuickCreate
        onPlanComplete={onPlanComplete}
        onRecordPlanPriorityChange={onPlanPriorityChange}
        content={idleContent}
        mode={idleMode}
        context={idleContext}
        actionTagId={idleActionTagId}
        submitting={idleSubmitting}
        onContentChange={setIdleContent}
        onModeChange={setIdleMode}
        onContextChange={handleIdleContextChange}
        onActionTagChange={handleIdleActionTagChange}
        onAutoActionTagResolved={setIdleActionTagId}
        onTagCreated={onTagCreated}
        planPriority={idlePlanPriority}
        onPlanPriorityChange={setIdlePlanPriority}
        onSubItemsLoaded={(subs) => setIdleSubItemsCount(subs.length)}
        onSubmit={handleIdleSubmit}
        onQuickCreateAttributionResolved={handleQuickCreateAttributionResolved}
        onQuickCreateInputClear={handleQuickCreateInputClear}
        contextManualOverride={contextManualOverride}
        userRules={userRules}
        onRecordAdded={onRecordAdded}
        onQuickCreateError={onError}
      />
    </div>
  );
}
