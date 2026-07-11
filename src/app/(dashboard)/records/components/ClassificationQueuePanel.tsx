'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Check, X, SkipForward, FolderOpen, Wrench } from 'lucide-react';
import type { Item, Record as TetoRecord, Tag } from '@/types/teto';
import AttributionFlowPicker from '@/components/records/AttributionFlowPicker';
import {
  EMPTY_ACTIVITY_CONTEXT,
  type ActivityContextValue,
} from './ActivityContextPicker';
import { resolveTargetItemId } from '@/lib/activity/item-tree';

interface QueueItem {
  record: TetoRecord;
  editingContext: ActivityContextValue;
}

interface ClassificationQueuePanelProps {
  items: Item[];
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onCreateError?: (message: string) => void;
  onRecordUpdated?: (record: TetoRecord) => void;
  onError?: (msg: string) => void;
}

export default function ClassificationQueuePanel({
  items,
  onItemsChange,
  onItemCreated,
  onCreateError,
  onRecordUpdated,
  onError,
}: ClassificationQueuePanelProps) {
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [functionTags, setFunctionTags] = useState<Tag[]>([]);
  const [selectedFnTagId, setSelectedFnTagId] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recordsRes, tagsRes] = await Promise.all([
        fetch('/api/v2/records?review_status=unchecked&has_item_id=true&limit=50&order=desc'),
        fetch('/api/v2/tags?type=function'),
      ]);
      const recordsJson = await recordsRes.json();
      const tagsJson = await tagsRes.json();
      const records: TetoRecord[] = Array.isArray(recordsJson.data)
        ? recordsJson.data.filter((r: TetoRecord) => !r.id.startsWith('session:') && !r.id.startsWith('pending:'))
        : [];
      setQueueItems(records.map((r) => ({
        record: r,
        editingContext: r.item_id
          ? ({ itemId: r.item_id, categoryItemId: '', subItemId: r.sub_item_id ?? '' } as ActivityContextValue)
          : EMPTY_ACTIVITY_CONTEXT,
      })));
      const fnTags: Tag[] = Array.isArray(tagsJson.data) ? tagsJson.data : [];
      setFunctionTags(fnTags);
    } catch {
      onError?.('加载整理队列失败');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { void load(); }, [load]);

  const confirm = async (qi: QueueItem, noNeed = false) => {
    setProcessingId(qi.record.id);
    try {
      const itemId = noNeed ? null : resolveTargetItemId(qi.editingContext);
      const fnTagId = selectedFnTagId[qi.record.id];
      const patch: Record<string, unknown> = { review_status: 'confirmed' };
      if (noNeed) {
        patch.item_id = null;
        patch.sub_item_id = null;
      } else if (itemId) {
        patch.item_id = itemId;
      }
      if (fnTagId) {
        patch.tag_ids = [fnTagId, ...(qi.record.tags?.filter(t => t.type !== 'function').map(t => t.id) ?? [])];
      }
      const res = await fetch(`/api/v2/records/${qi.record.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('确认失败');
      const data = await res.json();
      onRecordUpdated?.(data.data as TetoRecord);

      if (noNeed) {
        // 不归类：写入 no_assign 规则，避免同类词下次再弹建议
        const keyword = (qi.record.raw_input?.trim().replace(/[¥￥\d.,元块小时分钟]+/g, '').trim()) ||
          qi.record.content?.trim();
        if (keyword && keyword.length >= 2) {
          void fetch('/api/v2/user-rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              // fuzzy_resolution + metadata 兼容未跑 036 迁移的数据库
              rule_type: 'fuzzy_resolution',
              trigger_pattern: keyword.slice(0, 20),
              source: 'user_confirm',
              is_active: true,
              metadata: { no_assign: true },
            }),
          });
        }
      } else if (itemId) {
        // 确认归属：写入关键词词典
        const parsed = qi.record.parsed_semantic as { action_text?: string } | null | undefined;
        const keyword = (parsed?.action_text?.trim()) ||
          (qi.record.raw_input?.trim().replace(/[¥￥\d.,元块小时分钟]+/g, '').trim()) ||
          qi.record.content?.trim();
        if (keyword && keyword.length >= 2) {
          void fetch('/api/v2/user-rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rule_type: 'item_mapping',
              trigger_pattern: keyword.slice(0, 20),
              target_id: itemId,
              target_type: 'item',
              source: 'user_confirm',
              confidence: 'high',
              is_active: true,
            }),
          });
        }
      }

      setQueueItems((prev) => prev.filter((x) => x.record.id !== qi.record.id));
      setExpandedId(null);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '确认失败');
    } finally {
      setProcessingId(null);
    }
  };

  const skip = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/v2/records/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_status: 'disputed' }),
      });
      if (!res.ok) throw new Error('跳过失败');
      setQueueItems((prev) => prev.filter((x) => x.record.id !== id));
      setExpandedId(null);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '跳过失败');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (queueItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <Check className="h-8 w-8 mb-2 text-green-400" />
        <p className="text-sm font-medium text-slate-600">全部整理完成</p>
        <p className="text-xs mt-1">没有待分类的记录了</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 mb-3">
        共 <span className="font-semibold text-slate-700">{queueItems.length}</span> 条记录待整理
      </p>

      {queueItems.map((qi) => {
        const isExpanded = expandedId === qi.record.id;
        const isProcessing = processingId === qi.record.id;
        const suggestedItem = qi.record.item?.title;
        const fnTags = qi.record.tags?.filter((t) => t.type === 'function') ?? [];
        const currentFnTagId = selectedFnTagId[qi.record.id] ?? fnTags[0]?.id ?? '';

        return (
          <div key={qi.record.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {/* 记录主内容 */}
            <div
              className="px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : qi.record.id)}
            >
              <p className="text-sm font-medium text-slate-800 leading-snug">
                {qi.record.content || qi.record.raw_input || '（无内容）'}
              </p>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                {qi.record.date && <span>{qi.record.date}</span>}
                {qi.record.duration_minutes != null && qi.record.duration_minutes > 0 && (
                  <span>{qi.record.duration_minutes}分钟</span>
                )}
                {qi.record.cost != null && qi.record.cost > 0 && <span>¥{qi.record.cost}</span>}
                {suggestedItem && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 border border-amber-100 px-1.5 py-0.5 text-amber-700">
                    <FolderOpen className="h-2.5 w-2.5" />
                    {suggestedItem}？
                  </span>
                )}
                {fnTags.length > 0 && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-teal-50 border border-teal-100 px-1.5 py-0.5 text-teal-700">
                    <Wrench className="h-2.5 w-2.5" />
                    {fnTags.map(t => t.name).join('/')}？
                  </span>
                )}
              </div>
            </div>

            {/* 展开的分类选择器 */}
            {isExpanded && (
              <div className="border-t border-slate-100 px-3 pb-3 pt-2.5 space-y-3 bg-slate-50/50">
                <div>
                  <span className="block text-[10px] font-medium text-slate-500 mb-1.5">归属事项</span>
                  <AttributionFlowPicker
                    items={items}
                    value={qi.editingContext}
                    onChange={(ctx) =>
                      setQueueItems((prev) =>
                        prev.map((x) => x.record.id === qi.record.id ? { ...x, editingContext: ctx } : x)
                      )
                    }
                    onItemsChange={onItemsChange}
                    onItemCreated={onItemCreated}
                    onCreateError={onCreateError}
                  />
                </div>

                {functionTags.length > 0 && (
                  <div>
                    <span className="block text-[10px] font-medium text-slate-500 mb-1.5">职能动作</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedFnTagId((prev) => ({ ...prev, [qi.record.id]: '' }))}
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                          currentFnTagId === '' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        不选
                      </button>
                      {functionTags.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => setSelectedFnTagId((prev) => ({ ...prev, [qi.record.id]: tag.id }))}
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                            currentFnTagId === tag.id ? 'bg-teal-500 text-white' : 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                          }`}
                        >
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => confirm(qi)}
                    className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50 transition-colors"
                  >
                    {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    确认归属
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => confirm(qi, true)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-50 transition-colors"
                  >
                    无需归属
                  </button>
                  <button
                    type="button"
                    onClick={() => void skip(qi.record.id)}
                    className="ml-auto rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-100 transition-colors"
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* 折叠态快捷操作 */}
            {!isExpanded && (
              <div className="flex items-center gap-1 border-t border-slate-100 px-3 py-1.5 bg-slate-50/30">
                {qi.record.item_id && (
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={(e) => { e.stopPropagation(); void confirm(qi); }}
                    className="flex items-center gap-1 rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                  >
                    {isProcessing ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Check className="h-2.5 w-2.5" />}
                    确认建议
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setExpandedId(qi.record.id)}
                  className="rounded-md border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  手动选择
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void confirm(qi, true); }}
                  className="rounded-md px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-100 transition-colors"
                >
                  无需归属
                </button>
                <button
                  type="button"
                  onClick={() => void skip(qi.record.id)}
                  className="ml-auto rounded-md p-0.5 text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
