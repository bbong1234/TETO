'use client';

import { useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import type { Item, Tag } from '@/types/teto';
import type { NewItemSuggestion } from '@/lib/activity/ai-enhance-trigger';

interface NewItemConfirmBubbleProps {
  suggestion: NewItemSuggestion;
  items: Item[];
  onConfirmed: (newItem: Item, functionTag: Tag | null) => void;
  onDismiss: () => void;
  onError?: (message: string) => void;
}

export default function NewItemConfirmBubble({
  suggestion,
  items,
  onConfirmed,
  onDismiss,
  onError,
}: NewItemConfirmBubbleProps) {
  const [submitting, setSubmitting] = useState(false);

  const categoryItem = suggestion.categoryHint
    ? items.find(
        (i) =>
          !i.parent_item_id &&
          i.title.toLowerCase() === suggestion.categoryHint!.toLowerCase()
      )
    : null;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      // 1. 创建新事项
      const itemRes = await fetch('/api/v2/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: suggestion.name,
          parent_item_id: categoryItem?.id ?? null,
          status: '活跃',
        }),
      });
      const itemJson = await itemRes.json();
      const newItem: Item | null =
        itemRes.ok && itemJson.data?.id ? (itemJson.data as Item) : null;
      if (!newItem) {
        throw new Error(itemJson.error?.message ?? '创建事项失败');
      }

      // 2. 查找或创建职能标签
      let fnTag: Tag | null = null;
      if (suggestion.functionTagHint) {
        const tagsRes = await fetch('/api/v2/tags');
        const tagsJson = await tagsRes.json();
        const allTags: Tag[] = Array.isArray(tagsJson.data) ? tagsJson.data : [];
        const existing = allTags.find(
          (t) =>
            t.type === 'function' &&
            t.name.toLowerCase() === suggestion.functionTagHint!.toLowerCase()
        );
        if (existing) {
          fnTag = existing;
        } else {
          const createRes = await fetch('/api/v2/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: suggestion.functionTagHint, type: 'function' }),
          });
          const createJson = await createRes.json();
          if (createRes.ok && createJson.data?.id) {
            fnTag = createJson.data as Tag;
          }
        }
      }

      // 3. 挂载记录
      const patch: { item_id: string; tag_ids?: string[]; review_status: string } = {
        item_id: newItem.id,
        review_status: 'confirmed',
      };
      if (fnTag) patch.tag_ids = [fnTag.id];
      await fetch(`/api/v2/records/${suggestion.recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });

      // 4. 写入关键词词典，下次相同事项名自动归属
      void fetch('/api/v2/user-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule_type: 'item_mapping',
          trigger_pattern: suggestion.name.slice(0, 20),
          target_id: newItem.id,
          target_type: 'item',
          source: 'user_confirm',
          confidence: 'high',
          is_active: true,
        }),
      });

      onConfirmed(newItem, fnTag);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '创建事项失败');
      onDismiss();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 w-[calc(100vw-2rem)] max-w-sm lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0">
      <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-lg ring-1 ring-blue-50">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-sm font-medium text-slate-800">
              检测到新事项「{suggestion.name}」
            </p>
            <p className="text-xs text-slate-500">
              {categoryItem ? `归属到「${categoryItem.title}」` : '未找到归属大类'}
              {suggestion.functionTagHint ? `  ·  职能：${suggestion.functionTagHint}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
              确认创建
            </button>
            <button
              type="button"
              onClick={onDismiss}
              disabled={submitting}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              跳过
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          disabled={submitting}
          className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
