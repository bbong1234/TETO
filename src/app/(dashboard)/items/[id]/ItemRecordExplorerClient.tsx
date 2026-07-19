'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Clock,
  Filter,
  FolderKanban,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import type { ItemExplorerProjectFacet, ItemRecordExplorerResult, Record as TetoRecord } from '@/types/teto';
import ItemExplorerFacetPanels from './ItemExplorerFacetPanels';
import { useToast } from '@/components/ui/use-toast';
import ToastContainer from '@/components/ui/use-toast';
import { formatDurationMinutes } from '@/lib/activity/stats-utils';
import { getApiErrorMessage } from '@/lib/api/client-errors';

const TYPE_COLORS: Record<string, string> = {
  发生: 'bg-green-100 text-green-700',
  计划: 'bg-blue-100 text-blue-700',
  想法: 'bg-amber-100 text-amber-700',
  总结: 'bg-slate-100 text-slate-700',
};

function ExplorerRecordRow({ record }: { record: TetoRecord }) {
  const functionTag = record.tags?.find((t) => t.type === 'function');
  const typeColor = TYPE_COLORS[record.type] ?? TYPE_COLORS['发生'];

  return (
    <div className="rounded-xl border border-slate-100 bg-white/60 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-slate-800 leading-snug flex-1">{record.content}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${typeColor}`}>
          {record.type}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
        {record.date && <span>{record.date}</span>}
        {record.item?.title && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5">{record.item.title}</span>
        )}
        {functionTag && (
          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-600">
            {functionTag.name}
          </span>
        )}
        {record.duration_minutes != null && record.duration_minutes > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {formatDurationMinutes(record.duration_minutes)}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ItemRecordExplorerClient({ itemId }: { itemId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toasts, showError, dismissToast } = useToast();

  const [data, setData] = useState<ItemRecordExplorerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const projectId = searchParams.get('project_id');
  const subItemId = searchParams.get('sub_item_id');
  const functionTagId = searchParams.get('function_tag_id');

  const buildUrl = useCallback(
    (next: {
      project_id?: string | null;
      sub_item_id?: string | null;
      function_tag_id?: string | null;
      offset?: number;
    }) => {
      const params = new URLSearchParams();
      const p = next.project_id !== undefined ? next.project_id : projectId;
      const s = next.sub_item_id !== undefined ? next.sub_item_id : subItemId;
      const f = next.function_tag_id !== undefined ? next.function_tag_id : functionTagId;
      if (p) params.set('project_id', p);
      if (s) params.set('sub_item_id', s);
      if (f) params.set('function_tag_id', f);
      if (next.offset && next.offset > 0) params.set('offset', String(next.offset));
      const qs = params.toString();
      return qs ? `/items/${itemId}?${qs}` : `/items/${itemId}`;
    },
    [itemId, projectId, subItemId, functionTagId]
  );

  const fetchExplorer = useCallback(
    async (offset = 0, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams();
        if (projectId) params.set('project_id', projectId);
        if (subItemId) params.set('sub_item_id', subItemId);
        if (functionTagId) params.set('function_tag_id', functionTagId);
        params.set('limit', '50');
        if (offset > 0) params.set('offset', String(offset));

        const res = await fetch(`/api/v2/items/${itemId}/records-explorer?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '加载失败');

        const result = json.data as ItemRecordExplorerResult;
        if (append) {
          setData((prev) =>
            prev
              ? { ...result, records: [...prev.records, ...result.records] }
              : result
          );
        } else {
          setData(result);
        }
      } catch (err) {
        console.error('加载事项记录失败:', err);
        showError('加载事项记录失败');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [itemId, projectId, subItemId, functionTagId, showError]
  );

  useEffect(() => {
    void fetchExplorer(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, projectId, subItemId, functionTagId]);

  const hasFilters = Boolean(projectId || subItemId || functionTagId);

  const selectedProject = useMemo(
    () => data?.project_facets.find((f) =>
      f.kind === 'sub_item' ? f.id === subItemId : f.id === projectId && !subItemId
    ),
    [data, projectId, subItemId]
  );
  const selectedAction = useMemo(
    () => data?.action_facets.find((f) => f.id === functionTagId),
    [data, functionTagId]
  );

  const setProjectFilter = (facet: ItemExplorerProjectFacet | null) => {
    if (!facet) {
      router.replace(buildUrl({ project_id: null, sub_item_id: null, offset: 0 }), { scroll: false });
      return;
    }
    if (facet.kind === 'sub_item') {
      router.replace(
        buildUrl({ project_id: null, sub_item_id: facet.id, offset: 0 }),
        { scroll: false }
      );
    } else {
      router.replace(
        buildUrl({ project_id: facet.id, sub_item_id: null, offset: 0 }),
        { scroll: false }
      );
    }
  };

  const setActionFilter = (id: string | null) => {
    router.replace(buildUrl({ function_tag_id: id, offset: 0 }), { scroll: false });
  };

  const clearFilters = () => {
    router.replace(`/items/${itemId}`, { scroll: false });
  };

  const handleDelete = async () => {
    if (!data) return;
    const recordHint =
      data.stats.record_count > 0
        ? `\n\n该标签下有 ${data.stats.record_count} 条记录，删除后将解除归属关联（记录本身保留）。`
        : '';
    if (
      !confirm(
        `确定删除第一标签「${data.root_item.title}」？${recordHint}`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/v2/items/${itemId}`, { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(getApiErrorMessage(errData, '删除失败'));
      }
      router.push('/items');
    } catch (err) {
      showError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center desktop-bg">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 desktop-bg">
        <p className="text-sm text-slate-500">第一标签不存在或无法加载</p>
        <Link href="/items" className="text-xs text-indigo-500 hover:underline">
          返回事项列表
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0 desktop-bg">
      <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-4">
        <div className="glass rounded-2xl px-5 py-4 shadow-soft">
          <div className="flex items-center gap-3">
            <Link
              href="/items"
              className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-slate-800 truncate">
                {data.root_item.title}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">第一标签 · 记录集合</p>
            </div>
            <button
              type="button"
              title="删除第一标签"
              disabled={deleting}
              onClick={() => void handleDelete()}
              className="rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
              <FolderKanban className="h-3 w-3" />
              {data.stats.record_count} 条记录
            </span>
            {data.stats.total_duration_minutes > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-blue-600">
                <Clock className="h-3 w-3" />
                {formatDurationMinutes(data.stats.total_duration_minutes)}
              </span>
            )}
          </div>
        </div>

        <ItemExplorerFacetPanels
          rootItemId={itemId}
          projectFacets={data.project_facets}
          actionFacets={data.action_facets}
          projectId={projectId}
          subItemId={subItemId}
          functionTagId={functionTagId}
          onProjectFilter={setProjectFilter}
          onActionFilter={setActionFilter}
          onMutated={() => void fetchExplorer(0, false)}
          onError={showError}
        />

        {hasFilters && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            <span>
              筛选中：
              {selectedProject && ` ${selectedProject.level === 2 ? '第二' : '第三'}标签「${selectedProject.path_label}」`}
              {selectedAction && ` 动作「${selectedAction.name}」`}
            </span>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-slate-100 text-indigo-500"
            >
              <X className="h-3 w-3" />
              清除
            </button>
          </div>
        )}

        <section className="glass rounded-2xl p-4 shadow-soft space-y-2">
          <h2 className="text-xs font-bold text-slate-700 mb-2">记录列表</h2>
          {data.records.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">当前筛选下暂无记录</p>
          ) : (
            <>
              {data.records.map((record) => (
                <ExplorerRecordRow key={record.id} record={record} />
              ))}
              {data.pagination.has_more && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void fetchExplorer(data.pagination.offset + data.pagination.limit, true)}
                    className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                  >
                    {loadingMore ? '加载中…' : '加载更多'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
