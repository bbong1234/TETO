'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Clock, FolderKanban, Zap, Trash2 } from 'lucide-react';
import type { TopLevelItemExplorerSummary } from '@/types/teto';
import { toSortableTimeString } from '@/lib/utils/sortable-time';
import { useToast } from '@/components/ui/use-toast';
import ToastContainer from '@/components/ui/use-toast';
import { ItemsDesktopSkeleton } from '@/components/ui/PageSkeletons';
import { formatDurationMinutes } from '@/lib/activity/stats-utils';
import { getApiErrorMessage } from '@/lib/api/client-errors';

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '暂无活动';
  const diff = Date.now() - Date.parse(iso);
  const days = Math.floor(diff / 86400000);
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  return `${Math.floor(days / 30)} 月前`;
}

function normalizeSummary(raw: TopLevelItemExplorerSummary): TopLevelItemExplorerSummary {
  const last = toSortableTimeString(raw.last_active_at);
  return {
    ...raw,
    last_active_at: last || null,
  };
}

export default function ItemsClient() {
  const [summaries, setSummaries] = useState<TopLevelItemExplorerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toasts, showError, dismissToast } = useToast();

  const fetchSummaries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/items/explorer-summaries');
      const json = await res.json();
      if (!res.ok) throw new Error(getApiErrorMessage(json, '加载失败'));
      setSummaries((json.data ?? []).map(normalizeSummary));
    } catch (err) {
      console.error('加载第一标签失败:', err);
      showError('加载第一标签失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void fetchSummaries();
  }, [fetchSummaries]);

  const filtered = summaries.filter(
    (s) => !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (item: TopLevelItemExplorerSummary) => {
    const recordHint =
      item.record_count > 0
        ? `\n\n该标签下有 ${item.record_count} 条记录，删除后将解除与这些记录的归属关联（记录本身保留）。`
        : '';
    if (
      !confirm(
        `确定删除第一标签「${item.title}」？${recordHint}\n\n此操作为搁置归档，可从数据库恢复前需重新创建。`
      )
    ) {
      return;
    }
    setDeletingId(item.id);
    try {
      const res = await fetch(`/api/v2/items/${item.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(getApiErrorMessage(errData, '删除失败'));
      }
      setSummaries((prev) => prev.filter((s) => s.id !== item.id));
    } catch (err) {
      showError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto min-h-0 desktop-bg">
      <div className="p-6 md:p-10 max-w-5xl mx-auto">
        <div className="mb-6 glass rounded-2xl px-5 py-4 shadow-soft">
          <h1 className="text-base font-bold text-slate-800 tracking-tight">事项</h1>
          <p className="text-xs text-slate-500 mt-1">
            按第一标签浏览记录集合，可在详情中按项目与动作筛选
          </p>
        </div>

        <div className="mb-4 relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索第一标签…"
            className="w-full glass rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400/50 placeholder:text-slate-300 border-0"
          />
        </div>

        {loading ? (
          <ItemsDesktopSkeleton />
        ) : filtered.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center">
            <p className="text-sm text-slate-500">暂无带记录的第一标签</p>
            <p className="text-xs text-slate-400 mt-2">
              在记录模块为记录归属事项后，将在此显示
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="glass rounded-2xl p-4 shadow-soft hover:shadow-md transition-shadow group relative"
              >
                <Link href={`/items/${item.id}`} className="block">
                  <div className="flex items-start justify-between gap-2 pr-8">
                    <h2 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                      {item.title}
                    </h2>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {formatRelativeTime(item.last_active_at)}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                      <FolderKanban className="h-3 w-3" />
                      {item.record_count} 条记录
                    </span>
                    {item.total_duration_minutes > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-blue-600">
                        <Clock className="h-3 w-3" />
                        {formatDurationMinutes(item.total_duration_minutes)}
                      </span>
                    )}
                    {item.project_count > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-600">
                        {item.project_count} 个项目
                      </span>
                    )}
                    {item.action_count > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-purple-600">
                        <Zap className="h-3 w-3" />
                        {item.action_count} 个动作
                      </span>
                    )}
                  </div>
                </Link>
                <button
                  type="button"
                  title="删除第一标签"
                  disabled={deletingId === item.id}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void handleDelete(item);
                  }}
                  className="absolute top-3 right-3 rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
