'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Inbox, Loader2, Plus, Check, CalendarDays, Sparkles, RefreshCw } from 'lucide-react';
import type { Item, Record as TetoRecord, ReviewSummary, ReviewPeriod, UserProfile } from '@/types/teto';
import ItemAttributionChips from '@/components/records/ItemAttributionChips';
import { getItemDepth, isCategoryItem } from '@/lib/activity/item-tree';
import { notifyUnassignedRefresh } from '@/hooks/use-unassigned-count';
import ClassificationQueuePanel from '@/app/(dashboard)/records/components/ClassificationQueuePanel';
import ClassificationDictionaryPanel from '@/app/(dashboard)/records/components/ClassificationDictionaryPanel';

type ReviewTab = 'review' | 'inbox' | 'classify' | 'dictionary';

function formatRecordTime(record: TetoRecord): string {
  const iso = record.occurred_at || record.created_at;
  if (!iso) return record.date ?? '';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} 分钟`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

export default function ReviewClient() {
  const [tab, setTab] = useState<ReviewTab>('review');
  const [items, setItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      const res = await fetch('/api/v2/items?lite=true');
      const data = await res.json();
      if (res.ok) setItems(Array.isArray(data.data) ? data.data : []);
    } catch {
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'classify' || tab === 'dictionary') {
      void loadItems();
    }
  }, [tab, loadItems]);

  const handleItemCreated = useCallback((item: Item) => {
    setItems((prev) => [...prev, item]);
  }, []);

  const handlePanelError = useCallback((msg: string) => {
    setPanelError(msg);
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden p-4 lg:p-6">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="h-5 w-5 text-indigo-500" />
        <h1 className="text-xl font-bold text-slate-900">复盘</h1>
      </div>

      {panelError && (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{panelError}</p>
      )}

      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1 self-start flex-wrap">
        {([
          { key: 'review', label: '滚动复盘' },
          { key: 'inbox', label: '未归属' },
          { key: 'classify', label: '分类整理' },
          { key: 'dictionary', label: '关键词词典' },
        ] as { key: ReviewTab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'review' && <RollingReview />}
        {tab === 'inbox' && <TriageInbox />}
        {tab === 'classify' && (
          itemsLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载事项…
            </div>
          ) : (
            <ClassificationQueuePanel
              items={items}
              onItemsChange={loadItems}
              onItemCreated={handleItemCreated}
              onCreateError={handlePanelError}
              onError={handlePanelError}
            />
          )
        )}
        {tab === 'dictionary' && (
          itemsLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载事项…
            </div>
          ) : (
            <ClassificationDictionaryPanel items={items} onError={handlePanelError} />
          )
        )}
      </div>
    </div>
  );
}

function RollingReview() {
  const [summaries, setSummaries] = useState<ReviewSummary[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reviewRes, profileRes] = await Promise.all([
        fetch('/api/v2/review'),
        fetch('/api/v2/user-profile'),
      ]);
      const reviewData = await reviewRes.json();
      const profileData = await profileRes.json();
      if (reviewRes.ok) setSummaries(reviewData.data ?? []);
      if (profileRes.ok) setProfile(profileData.data ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshProfile = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/v2/user-profile?refresh=true');
      const data = await res.json();
      if (res.ok) setProfile(data.data ?? null);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载中…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summaries.map((s) => (
          <ReviewCard key={s.period} summary={s} />
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-800">用户画像</h2>
          </div>
          <button
            type="button"
            onClick={() => void refreshProfile()}
            disabled={refreshing}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            刷新
          </button>
        </div>

        {!profile ? (
          <p className="text-xs text-slate-400">暂无足够数据生成画像</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ProfileStat
              label="平均专注时长"
              value={profile.avg_focus_minutes != null ? formatMinutes(profile.avg_focus_minutes) : '—'}
            />
            <ProfileStat
              label="活跃时段"
              value={
                profile.active_hours.length > 0
                  ? profile.active_hours.slice(0, 3).map((h) => `${h.hour}点`).join('、')
                  : '—'
              }
            />
            <div className="sm:col-span-2">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">高频事项</p>
              {profile.top_items.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.top_items.map((it) => (
                    <span
                      key={it.item_id}
                      className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] text-indigo-700"
                    >
                      {it.item_title} · {formatMinutes(it.minutes)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">—</p>
              )}
            </div>
            {profile.interrupt_patterns.length > 0 && (
              <div className="sm:col-span-2">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">打断/暂停</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.interrupt_patterns.map((p) => (
                    <span key={p.label} className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700">
                      {p.label} · {p.count} 次
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function ReviewCard({ summary }: { summary: ReviewSummary }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-800">{summary.label}</p>
      <p className="mt-0.5 text-[10px] text-slate-400">
        {summary.date_from}{summary.date_from !== summary.date_to ? ` ~ ${summary.date_to}` : ''}
      </p>
      <p className="mt-2 text-xs text-slate-600">{summary.headline}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
          <p className="text-[10px] text-slate-400">活动</p>
          <p className="text-sm font-semibold tabular-nums text-slate-800">{summary.sessions_count}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
          <p className="text-[10px] text-slate-400">时长</p>
          <p className="text-sm font-semibold tabular-nums text-slate-800">{formatMinutes(summary.total_minutes)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
          <p className="text-[10px] text-slate-400">想法</p>
          <p className="text-sm font-semibold tabular-nums text-slate-800">{summary.ideas_count}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
          <p className="text-[10px] text-slate-400">待整理</p>
          <p className="text-sm font-semibold tabular-nums text-slate-800">{summary.unassigned_count}</p>
        </div>
      </div>

      {summary.milestones.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">里程碑</p>
          <ul className="space-y-1">
            {summary.milestones.slice(0, 5).map((m, i) => (
              <li key={i} className="flex items-start gap-1 text-[11px] text-slate-600">
                <span className="text-green-500">✓</span>
                <span className="min-w-0 break-words">{m}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.top_items.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">主要投入</p>
          <div className="flex flex-wrap gap-1">
            {summary.top_items.slice(0, 3).map((it) => (
              <span key={it.item_id} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-700">
                {it.item_title}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TriageInbox() {
  const [records, setRecords] = useState<TetoRecord[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [createForId, setCreateForId] = useState<string | null>(null);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const categoryOptions = useMemo(() => {
    return items.filter((i) => isCategoryItem(i, items) && !i.parent_item_id);
  }, [items]);

  const defaultCategoryId = useMemo(() => {
    const other = categoryOptions.find((i) => i.title === '其他');
    return other?.id ?? categoryOptions[0]?.id ?? '';
  }, [categoryOptions]);

  const [createCategoryId, setCreateCategoryId] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [recordsRes, itemsRes] = await Promise.all([
        fetch('/api/v2/records?unassigned=true&order=desc&limit=50'),
        fetch('/api/v2/items?lite=true'),
      ]);
      const recordsData = await recordsRes.json();
      const itemsData = await itemsRes.json();
      if (recordsRes.ok) setRecords(recordsData.data ?? []);
      if (itemsRes.ok) setItems(itemsData.data ?? []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (defaultCategoryId && !createCategoryId) {
      setCreateCategoryId(defaultCategoryId);
    }
  }, [defaultCategoryId, createCategoryId]);

  const chipItems = useMemo(
    () => items.filter((i) => getItemDepth(items, i.id) >= 1),
    [items]
  );

  const patchRecord = async (id: string, body: Record<string, unknown>) => {
    setActingId(id);
    try {
      const res = await fetch(`/api/v2/records/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? '更新失败');
      }
      setRecords((prev) => prev.filter((r) => r.id !== id));
      notifyUnassignedRefresh();
    } finally {
      setActingId(null);
    }
  };

  const handleAssign = (recordId: string, itemId: string) => {
    void patchRecord(recordId, { item_id: itemId, review_status: 'confirmed' });
  };

  const handleSkipAssign = (recordId: string) => {
    void patchRecord(recordId, { review_status: 'confirmed' });
  };

  const handleCreateAndAssign = async (recordId: string) => {
    const title = newItemTitle.trim();
    if (!title || !createCategoryId) return;
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/v2/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, parent_item_id: createCategoryId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? '创建事项失败');
      const item: Item | null = data.data ?? null;
      if (!item?.id) throw new Error('创建成功但未返回数据');
      setItems((prev) => [...prev, item]);
      await patchRecord(recordId, { item_id: item.id, review_status: 'confirmed' });
      setCreateForId(null);
      setNewItemTitle('');
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setCreateSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2">
        <Inbox className="h-4 w-4 text-indigo-500" />
        <h2 className="text-sm font-semibold text-slate-800">待整理</h2>
        {!loading && records.length > 0 && (
          <span className="text-xs text-slate-400 tabular-nums">{records.length} 条</span>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-4">
        捕捉时没选归属的记录会在这里。点事项归类，或确认「不归类」。
      </p>

      <div className="flex-1 min-h-0 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中…
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
            <p className="text-sm text-slate-500">没有待整理的记录</p>
            <p className="text-xs text-slate-400 mt-1">记录时可直接开始，事后再来归类</p>
          </div>
        ) : (
          records.map((record) => (
            <div
              key={record.id}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {record.content?.trim() || '（无描述）'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {formatRecordTime(record)}
                    {record.cost != null && record.cost > 0 && (
                      <span className="ml-2 text-amber-600">¥{Number(record.cost).toFixed(2)}</span>
                    )}
                    {record.duration_minutes != null && record.duration_minutes > 0 && (
                      <span className="ml-2">{record.duration_minutes} 分钟</span>
                    )}
                  </p>
                </div>
                {actingId === record.id && (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />
                )}
              </div>

              {createForId === record.id ? (
                <div className="space-y-2 rounded-lg bg-slate-50 p-2.5">
                  <input
                    type="text"
                    value={newItemTitle}
                    onChange={(e) => setNewItemTitle(e.target.value)}
                    placeholder="新事项名称"
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-300 focus:outline-none"
                    autoFocus
                  />
                  {categoryOptions.length > 0 && (
                    <select
                      value={createCategoryId}
                      onChange={(e) => setCreateCategoryId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-300 focus:outline-none"
                    >
                      {categoryOptions.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.title}
                        </option>
                      ))}
                    </select>
                  )}
                  {createError && <p className="text-[10px] text-red-500">{createError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={createSubmitting || !newItemTitle.trim()}
                      onClick={() => void handleCreateAndAssign(record.id)}
                      className="flex items-center gap-1 rounded-lg bg-blue-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                    >
                      {createSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
                      创建并归类
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateForId(null);
                        setNewItemTitle('');
                        setCreateError(null);
                      }}
                      className="rounded-lg px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {chipItems.length > 0 && (
                    <ItemAttributionChips
                      items={items}
                      limit={6}
                      showSkip={false}
                      onSelect={(itemId) => {
                        if (itemId) void handleAssign(record.id, itemId);
                      }}
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={actingId === record.id}
                      onClick={() => handleSkipAssign(record.id)}
                      className="flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" />
                      不归类
                    </button>
                    <button
                      type="button"
                      disabled={actingId === record.id}
                      onClick={() => {
                        setCreateForId(record.id);
                        setNewItemTitle('');
                        setCreateError(null);
                      }}
                      className="flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[11px] text-slate-500 hover:border-blue-300 hover:text-blue-600 disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" />
                      新建事项
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
