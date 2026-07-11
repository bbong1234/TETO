'use client';

import { useMemo, useState } from 'react';
import AttributionFlowPicker from '@/components/records/AttributionFlowPicker';
import ContextualFunctionTagRow from '@/components/records/ContextualFunctionTagRow';
import { resolveTargetItemId } from '@/lib/activity/item-tree';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import type { Item, Tag } from '@/types/teto';
import RecordDetailSection from './RecordDetailSection';

interface RecordAttributionSectionProps {
  form: RecordEditFormState;
  items: Item[];
  tags: Tag[];
  onPatch: (patch: Partial<RecordEditFormState>) => void;
  onContextSubItemsLoaded: (count: number) => void;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onTagCreated?: (tag: Tag) => void;
  onCreateError?: (message: string) => void;
}

function pathLabels(form: RecordEditFormState, items: Item[]): string[] {
  const ctx = form.activityContext;
  const parts: string[] = [];
  if (ctx.categoryTitle?.trim()) parts.push(ctx.categoryTitle.trim());
  else if (ctx.categoryItemId) {
    const c = items.find((i) => i.id === ctx.categoryItemId);
    if (c) parts.push(c.title);
  }
  if (ctx.itemTitle?.trim()) parts.push(ctx.itemTitle.trim());
  else if (ctx.itemId) {
    const i = items.find((x) => x.id === ctx.itemId);
    if (i) parts.push(i.title);
  }
  if (ctx.subItemTitle?.trim()) parts.push(ctx.subItemTitle.trim());
  return parts;
}

export default function RecordAttributionSection({
  form,
  items,
  tags,
  onPatch,
  onContextSubItemsLoaded,
  onItemsChange,
  onItemCreated,
  onTagCreated,
  onCreateError,
}: RecordAttributionSectionProps) {
  const [expandLevel, setExpandLevel] = useState<'none' | 'category' | 'action'>('none');

  const itemId = resolveTargetItemId(form.activityContext);
  const actionScopeItemId = itemId ?? form.activityContext.categoryItemId ?? null;
  const selectedActionTagId = useMemo(() => {
    const selected = tags.find((t) => t.type === 'function' && form.tagIds.includes(t.id));
    return selected?.id ?? null;
  }, [tags, form.tagIds]);
  const actionTag = tags.find((t) => t.id === selectedActionTagId);

  const path = pathLabels(form, items);

  const selectActionTag = (tagId: string | null) => {
    const nonFunctionIds = form.tagIds.filter((id) => {
      const tag = tags.find((t) => t.id === id);
      return tag?.type !== 'function';
    });
    onPatch({ tagIds: tagId ? [...nonFunctionIds, tagId] : nonFunctionIds });
    setExpandLevel('none');
  };

  return (
    <RecordDetailSection title="归属">
      <div className="flex flex-wrap items-center gap-1.5">
        {path.length > 0 ? (
          path.map((part, i) => (
            <button
              key={`${part}-${i}`}
              type="button"
              onClick={() => setExpandLevel(expandLevel === 'category' ? 'none' : 'category')}
              className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
            >
              {part}
            </button>
          ))
        ) : (
          <button
            type="button"
            onClick={() => setExpandLevel('category')}
            className="rounded-full border border-dashed border-slate-200 px-2.5 py-0.5 text-[11px] text-slate-400 hover:border-blue-300 hover:text-blue-600"
          >
            + 事项
          </button>
        )}

        {actionTag ? (
          <button
            type="button"
            onClick={() => setExpandLevel(expandLevel === 'action' ? 'none' : 'action')}
            className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
          >
            {actionTag.name}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setExpandLevel('action')}
            className="rounded-full border border-dashed border-slate-200 px-2.5 py-0.5 text-[11px] text-slate-400 hover:border-blue-300 hover:text-blue-600"
          >
            + 动作
          </button>
        )}
      </div>

      {expandLevel === 'category' && (
        <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2">
          <AttributionFlowPicker
            items={items}
            value={form.activityContext}
            onChange={(ctx) => onPatch({ activityContext: ctx })}
            onItemsChange={onItemsChange}
            onItemCreated={onItemCreated}
            onCreateError={onCreateError}
            onSubItemsLoaded={(subs) => onContextSubItemsLoaded(subs.length)}
            dimUnselected
          />
        </div>
      )}

      {expandLevel === 'action' && (
        <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2">
          <ContextualFunctionTagRow
            itemId={actionScopeItemId}
            fallbackTags={tags}
            selectedTagId={selectedActionTagId}
            onSelect={selectActionTag}
            onTagCreated={onTagCreated}
            hideLabel
            strictScope
          />
        </div>
      )}
    </RecordDetailSection>
  );
}
