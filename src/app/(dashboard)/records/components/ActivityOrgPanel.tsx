'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Item, Record as TetoRecord, Tag, UserTool } from '@/types/teto';
import AttributionFlowPicker from '@/components/records/AttributionFlowPicker';
import ContextualFunctionTagRow from '@/components/records/ContextualFunctionTagRow';
import ProjectTagChips from '@/components/records/ProjectTagChips';
import ToolLabelField, { persistToolOptionIfNeeded } from '@/components/records/ToolLabelField';
import {
  resolveActivityContextFromRecord,
  resolveTargetItemId,
  validateActivityContext,
} from '@/lib/activity/item-tree';
import { resolveItemDefaults } from '@/lib/utils/item-match';
import { resolveActivityRecordIdClient } from '@/lib/activity/activity-switch-pending';
import {
  EMPTY_ACTIVITY_CONTEXT,
  type ActivityContextValue,
} from './ActivityContextPicker';

interface ActivityOrgPanelProps {
  activity: TetoRecord;
  items: Item[];
  tags: Tag[];
  userTools?: UserTool[];
  toolsLoading?: boolean;
  onToolsChange?: (tools: UserTool[]) => void;
  onActivityUpdated: (record: TetoRecord) => void;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onTagCreated?: (tag: Tag) => void;
  onError?: (message: string) => void;
  layout?: 'inline' | 'panel' | 'section';
}

async function resolveRecordId(activity: TetoRecord): Promise<string | null> {
  return resolveActivityRecordIdClient(activity);
}

export default function ActivityOrgPanel({
  activity,
  items,
  tags,
  userTools,
  toolsLoading,
  onToolsChange,
  onActivityUpdated,
  onItemsChange,
  onItemCreated,
  onTagCreated,
  onError,
  layout = 'panel',
}: ActivityOrgPanelProps) {
  const [context, setContext] = useState<ActivityContextValue>(EMPTY_ACTIVITY_CONTEXT);
  const [toolLabel, setToolLabel] = useState('');
  const [functionTagId, setFunctionTagId] = useState<string | null>(null);
  const [projectTagIds, setProjectTagIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [subItemsCount, setSubItemsCount] = useState(0);
  const toolPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setContext(
      resolveActivityContextFromRecord(
        items,
        activity.item_id,
        activity.sub_item_id
      ) as ActivityContextValue
    );
    setToolLabel(activity.tool_label?.trim() ?? '');
    const fnTag = activity.tags?.find((t) => t.type === 'function');
    setFunctionTagId(fnTag?.id ?? null);
    setProjectTagIds((activity.tags ?? []).filter((t) => t.type === 'project').map((t) => t.id));
  }, [
    activity.id,
    activity.item_id,
    activity.sub_item_id,
    activity.tool_label,
    activity.tags,
    items,
  ]);

  const persistOrg = useCallback(
    async (patch: {
      context?: ActivityContextValue;
      tool_label?: string | null;
      tag_ids?: string[];
    }) => {
      const ctx = patch.context ?? context;
      const contextErr = validateActivityContext(ctx, items, subItemsCount);
      if (contextErr) {
        onError?.(contextErr);
        return;
      }

      const recordId = await resolveRecordId(activity);
      if (!recordId) {
        onError?.('活动尚未同步，请稍后再试');
        return;
      }

      const itemId = resolveTargetItemId(ctx);
      const body: Record<string, unknown> = {
        item_id: itemId,
        sub_item_id: ctx.subItemId || null,
        phase_id: ctx.phaseId || null,
      };

      if (patch.tool_label !== undefined) {
        body.tool_label = patch.tool_label;
      }
      if (patch.tag_ids !== undefined) {
        body.tag_ids = patch.tag_ids;
      } else if (functionTagId) {
        const otherIds = (activity.tags ?? [])
          .filter((t) => t.type !== 'function')
          .map((t) => t.id);
        body.tag_ids = [...otherIds, functionTagId];
      }

      setSaving(true);
      try {
        const res = await fetch(`/api/v2/records/${recordId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          onError?.(data.error?.message ?? '保存归属失败');
          return;
        }
        if (data.data) onActivityUpdated(data.data as TetoRecord);
      } catch (e) {
        onError?.(e instanceof Error ? e.message : '保存归属失败');
      } finally {
        setSaving(false);
      }
    },
    [
      activity,
      context,
      functionTagId,
      items,
      onActivityUpdated,
      onError,
      subItemsCount,
    ]
  );

  const handleContextChange = (next: ActivityContextValue) => {
    setContext(next);

    // 选中事项时自动带出默认职能/工具（仅在用户尚未填写时）
    const nextItemId = resolveTargetItemId(next);
    const defaults = resolveItemDefaults(items, nextItemId);
    const patch: { context: ActivityContextValue; tool_label?: string | null; tag_ids?: string[] } = {
      context: next,
    };

    if (defaults.toolLabel && !toolLabel.trim()) {
      setToolLabel(defaults.toolLabel);
      patch.tool_label = defaults.toolLabel;
    }
    if (defaults.functionTagId && !functionTagId) {
      setFunctionTagId(defaults.functionTagId);
      const otherIds = (activity.tags ?? [])
        .filter((t) => t.type !== 'function')
        .map((t) => t.id);
      patch.tag_ids = [...otherIds, defaults.functionTagId];
    }

    void persistOrg(patch);
  };

  const handleToolChange = (value: string) => {
    setToolLabel(value);
    if (toolPersistTimerRef.current) clearTimeout(toolPersistTimerRef.current);
    toolPersistTimerRef.current = setTimeout(() => {
      const trimmed = value.trim() || null;
      if (trimmed) void persistToolOptionIfNeeded(value);
      void persistOrg({ tool_label: trimmed });
    }, 450);
  };

  useEffect(() => {
    return () => {
      if (toolPersistTimerRef.current) clearTimeout(toolPersistTimerRef.current);
    };
  }, []);

  const composeTagIds = useCallback(
    (fnTagId: string | null, projectIds: string[]) => {
      const moodIds = (activity.tags ?? [])
        .filter((t) => t.type === 'mood')
        .map((t) => t.id);
      return [...projectIds, ...(fnTagId ? [fnTagId] : []), ...moodIds];
    },
    [activity.tags]
  );

  const handleFunctionTagSelect = (tagId: string | null) => {
    setFunctionTagId(tagId);
    void persistOrg({ tag_ids: composeTagIds(tagId, projectTagIds) });
  };

  const handleProjectToggle = (tagId: string) => {
    const next = projectTagIds.includes(tagId)
      ? projectTagIds.filter((id) => id !== tagId)
      : [...projectTagIds, tagId];
    setProjectTagIds(next);
    void persistOrg({ tag_ids: composeTagIds(functionTagId, next) });
  };

  const inner = (
    <div className="space-y-3">
      <div>
        <span className="mb-1 block text-[10px] font-medium text-slate-500">归属</span>
        <AttributionFlowPicker
          items={items}
          value={context}
          onChange={handleContextChange}
          onItemsChange={onItemsChange}
          onItemCreated={onItemCreated}
          onCreateError={onError}
          onSubItemsLoaded={(subs) => setSubItemsCount(subs.length)}
          hideCategoryLevel
          dimUnselected
        />
      </div>
      <div>
        <ContextualFunctionTagRow
          itemId={resolveTargetItemId(context)}
          fallbackTags={tags}
          selectedTagId={functionTagId}
          onSelect={handleFunctionTagSelect}
          onTagCreated={onTagCreated}
          strictScope
        />
      </div>
      <div>
        <ProjectTagChips
          tags={tags}
          selectedTagIds={projectTagIds}
          onToggle={handleProjectToggle}
          onTagCreated={onTagCreated}
        />
      </div>
      <div>
        <ToolLabelField
          tools={userTools}
          toolsLoading={toolsLoading}
          onToolsChange={onToolsChange}
          value={toolLabel}
          onChange={handleToolChange}
        />
      </div>
      {saving && (
        <p className="flex items-center gap-1 text-[10px] text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          保存中…
        </p>
      )}
    </div>
  );

  if (layout === 'section') {
    return (
      <div className="px-3 py-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">
          归属与职能
        </p>
        {inner}
      </div>
    );
  }

  if (layout === 'panel') {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="shrink-0 border-b border-slate-100 px-3 py-2">
          <p className="text-xs font-medium text-slate-600">归属与职能</p>
          <p className="text-[10px] text-slate-400">计时中可随时调整</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{inner}</div>
      </div>
    );
  }

  return inner;
}
