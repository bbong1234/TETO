'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Trash2, Pencil, X, Check,
  ExternalLink, RefreshCw, Plus, Layers, FileText, History,
  Calendar, DollarSign, Timer, BarChart3, Target, Sparkles,
  Zap, Archive, ChevronRight
} from 'lucide-react';
import type { Item, UpdateItemPayload, Record as TetoRecord, Phase, Goal, ItemAggregation, SubItem } from '@/types/teto';
import { ITEM_STATUSES } from '@/types/teto';
import { useToast } from '@/components/ui/use-toast';
import ToastContainer from '@/components/ui/use-toast';
import PhaseForm from '../components/PhaseForm';
import PhaseSuggest from '../components/PhaseSuggest';
import HistoryImport from '../components/HistoryImport';
import GoalForm from '../components/GoalForm';
import GoalEngineDashboard from '../components/GoalEngineDashboard';
import ItemGoalSection from '../components/ItemGoalSection';
import ItemTimeline from '../components/ItemTimeline';
import ItemDataPanel from '../components/ItemDataPanel';
import SubItemTabBar from '../components/SubItemTabBar';
import SubItemForm from '../components/SubItemForm';
import SubItemPromoteDialog from '../components/SubItemPromoteDialog';

interface DailyStat {
  date: string;
  record_count: number;
  total_duration_minutes: number;
  total_cost: number;
  metrics: Array<{ metric_name: string; total_value: number; metric_unit: string }>;
}

interface ItemWithPhases extends Item {
  phases?: (Phase & { goals?: Goal[] })[];
  goal?: Goal | null;
  goals?: Goal[];
  sub_items?: SubItem[];
  aggregation?: ItemAggregation | null;
  records?: TetoRecord[];
  recent_daily_stats?: DailyStat[];
}

function fieldLabel(field: string): string {
  const map: Record<string, string> = {
    mood: '心情', energy: '能量', item_hint: '关联事项',
    type_hint: '类型', location: '地点', people: '关系人',
    record_link_hint: '关联记录',
  };
  return map[field] || field;
}

const STATUS_COLORS: Record<string, string> = {
  '活跃': 'from-emerald-500 to-green-600',
  '推进中': 'from-blue-500 to-indigo-600',
  '放缓': 'from-amber-500 to-yellow-600',
  '停滞': 'from-orange-500 to-red-500',
  '已完成': 'from-slate-400 to-slate-500',
  '已搁置': 'from-slate-300 to-slate-400',
};

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const itemId = params.id as string;

  const [item, setItem] = useState<ItemWithPhases | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [todayCount, setTodayCount] = useState<number | null>(null);

  const [editingRecord, setEditingRecord] = useState<TetoRecord | null>(null);
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);
  const [showPhaseForm, setShowPhaseForm] = useState(false);
  const [showHistoryImport, setShowHistoryImport] = useState(false);
  const [phaseRefreshKey, setPhaseRefreshKey] = useState(0);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [showPhaseSuggest, setShowPhaseSuggest] = useState(false);

  // 子项相关状态
  const [activeSubItemId, setActiveSubItemId] = useState<string | null>(null);
  const [showSubItemForm, setShowSubItemForm] = useState(false);
  const [editingSubItem, setEditingSubItem] = useState<SubItem | null>(null);
  const [promotingSubItem, setPromotingSubItem] = useState<SubItem | null>(null);
  const [promoting, setPromoting] = useState(false);

  // 视图切换：执行 / 档案
  const [activeView, setActiveView] = useState<'execute' | 'archive'>('execute');

  const { toasts, showError, dismissToast } = useToast();

  const fetchItem = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/items/${itemId}`);
      if (!res.ok) throw new Error('事项不存在');
      const data = await res.json();
      setItem(data.data);
    } catch (err) {
      console.error('加载事项详情失败:', err);
      showError('加载事项详情失败');
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  // 获取今日记录数
  const fetchTodayCount = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const res = await fetch(`/api/v2/records?item_id=${itemId}&date=${today}&limit=500`);
      if (!res.ok) return;
      const data = await res.json();
      setTodayCount((data.data ?? []).length);
    } catch {
      // 非关键，静默失败
    }
  }, [itemId]);

  useEffect(() => {
    fetchItem();
    fetchTodayCount();
  }, [fetchItem, fetchTodayCount]);

  const startEdit = () => {
    if (!item) return;
    setEditTitle(item.title);
    setEditStatus(item.status);
    setEditDesc(item.description || '');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editTitle.trim()) return;
    setSaving(true);
    try {
      const payload: UpdateItemPayload = {
        title: editTitle.trim(),
        status: editStatus as Item['status'],
        description: editDesc || undefined,
      };
      const res = await fetch(`/api/v2/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setEditing(false);
        fetchItem();
      } else {
        const errData = await res.json();
        showError(errData.error || '更新事项失败');
      }
    } catch (err) {
      console.error('更新事项失败:', err);
      showError('更新事项失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('确定删除此事项？关联的记录不会被删除。')) return;
    try {
      const res = await fetch(`/api/v2/items/${itemId}`, { method: 'DELETE' });
      if (res.ok) router.push('/items');
    } catch (err) {
      console.error('删除事项失败:', err);
      showError('删除事项失败，请重试');
    }
  };

  const handlePhaseSaved = () => {
    setShowPhaseForm(false);
    setEditingPhase(null);
    setPhaseRefreshKey(k => k + 1);
    fetchItem();
  };

  const handleEditPhase = (phase: Phase) => {
    setEditingPhase(phase);
    setShowPhaseForm(true);
  };

  const handleCompleteRecord = async (record: TetoRecord) => {
    if (!confirm(`确认完成计划：「${record.content}」？\n将生成一条“发生”记录。`)) return;
    try {
      const res = await fetch(`/api/v2/records/${record.id}/complete`, { method: 'POST' });
      if (res.ok) { fetchItem(); } else { const e = await res.json(); showError(e.error || '完成操作失败'); }
    } catch { showError('完成操作失败，请重试'); }
  };

  const handlePostponeRecord = async (record: TetoRecord) => {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
    const newDate = prompt('推迟到哪天？（格式：YYYY-MM-DD）', tomorrowStr);
    if (!newDate) return;
    try {
      const res = await fetch(`/api/v2/records/${record.id}/postpone`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_date: newDate }),
      });
      if (res.ok) { fetchItem(); } else { const e = await res.json(); showError(e.error || '推迟操作失败'); }
    } catch { showError('推迟操作失败，请重试'); }
  };

  const handleCancelRecord = async (record: TetoRecord) => {
    if (!confirm(`确认取消计划：「${record.content}」？\n取消后不会生成任何新记录。`)) return;
    try {
      const res = await fetch(`/api/v2/records/${record.id}/cancel`, { method: 'POST' });
      if (res.ok) { fetchItem(); } else { const e = await res.json(); showError(e.error || '取消操作失败'); }
    } catch { showError('取消操作失败，请重试'); }
  };

  const handleCreatePhase = () => {
    setEditingPhase(null);
    setShowPhaseForm(true);
  };

  const handlePromotePhaseToItem = async (phase: Phase) => {
    if (!confirm(`将阶段「${phase.title}」升级为独立事项，其时间范围内的记录将迁移过去。确认？`)) return;
    try {
      const itemRes = await fetch('/api/v2/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: phase.title, description: phase.description || undefined }),
      });
      if (!itemRes.ok) throw new Error('创建事项失败');
      const { data: newItem } = await itemRes.json();

      if (phase.start_date || phase.end_date) {
        const qp = new URLSearchParams({ item_id: itemId });
        if (phase.start_date) qp.set('date_from', phase.start_date);
        if (phase.end_date) qp.set('date_to', phase.end_date);
        const recRes = await fetch(`/api/v2/records?${qp.toString()}`);
        if (recRes.ok) {
          const { data: recs } = await recRes.json();
          for (const rec of recs) {
            await fetch(`/api/v2/records/${rec.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ item_id: newItem.id }),
            });
          }
        }
      }

      await fetch('/api/v2/phases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: newItem.id,
          title: phase.title,
          description: phase.description || undefined,
          start_date: phase.start_date || undefined,
          end_date: phase.end_date || undefined,
          status: phase.status,
        }),
      });

      await fetch(`/api/v2/phases/${phase.id}`, { method: 'DELETE' });
      fetchItem();
      setPhaseRefreshKey(k => k + 1);
    } catch {
      showError('升级阶段失败，请重试');
    }
  };

  // 所有 hooks 必须在 early return 之前调用（React Rules of Hooks）
  const relatedRecords: TetoRecord[] = item
    ? (() => {
        const allRecords = item.records || item.recent_records || [];
        if (!activeSubItemId) return allRecords;
        return allRecords.filter(r => r.sub_item_id === activeSubItemId);
      })()
    : [];

  // 子项级聚合计算（必须在 early return 前调用，保持 hooks 顺序稳定）
  const subItemAgg = useMemo(() => {
    if (!item || !activeSubItemId || relatedRecords.length === 0) return null;
    let totalDuration = 0;
    let totalCost = 0;
    const metricMap = new Map<string, { total: number; unit: string }>();
    for (const r of relatedRecords) {
      if (r.duration_minutes) totalDuration += r.duration_minutes;
      if (r.cost) totalCost += r.cost;
      if (r.metric_name && r.metric_value != null) {
        const existing = metricMap.get(r.metric_name);
        if (existing) { existing.total += r.metric_value; }
        else { metricMap.set(r.metric_name, { total: r.metric_value, unit: r.metric_unit || '' }); }
      }
    }
    return {
      record_count: relatedRecords.length,
      total_duration_minutes: totalDuration,
      total_cost: totalCost,
      metric_summaries: Array.from(metricMap.entries()).map(([name, { total, unit }]) => ({ metric_name: name, total_value: total, metric_unit: unit })),
    };
  }, [item, activeSubItemId, relatedRecords]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-sm text-red-600 mb-2">事项不存在或加载失败</p>
        <button onClick={fetchItem} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
          <RefreshCw className="h-3 w-3" />重新加载
        </button>
      </div>
    );
  }

  const phases = item.phases || [];
  const agg = item.aggregation;

  const effectiveAgg = activeSubItemId ? subItemAgg : agg;
  const totalHours = effectiveAgg ? effectiveAgg.total_duration_minutes / 60 : 0;
  const totalCost = effectiveAgg?.total_cost ?? 0;
  const recordCount = effectiveAgg?.record_count ?? relatedRecords.length;
  const gradientClass = STATUS_COLORS[item.status] || 'from-slate-400 to-slate-500';

  const goalMap: Record<string, string> = {};
  (item.goals || (item.goal ? [item.goal] : [])).forEach(g => { if (g) goalMap[g.id] = g.title; });

  // 按子项筛选目标
  const filteredGoals = (() => {
    const allGoals = item.goals || [];
    if (!activeSubItemId) return allGoals;
    // 选中子项时：显示该子项的目标 + 事项级达标型目标（无 sub_item_id 的）
    return allGoals.filter(g => g.sub_item_id === activeSubItemId || (!g.sub_item_id && g.measure_type === 'boolean'));
  })();

  return (
    <div className="flex-1 overflow-y-auto min-h-0 desktop-bg">
      <div className="mx-auto max-w-[860px] px-4 py-5">

        {/* 返回 */}
        <button
          onClick={() => router.push('/items')}
          className="mb-4 flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-500 transition-colors glass rounded-xl px-3 py-1.5 shadow-soft"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回桌面
        </button>

        {/* ── 区域一：Header ── */}
        <section className="glass rounded-3xl shadow-soft-lg p-5 mb-5">
          {editing ? (
            <div className="space-y-3">
              <input
                type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus
                className="w-full bg-white/60 rounded-2xl px-4 py-2 text-base font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400/50 border-0"
              />
              <textarea
                value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="描述（可选）" rows={2}
                className="w-full bg-white/60 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/50 border-0"
              />
              <select
                value={editStatus} onChange={e => setEditStatus(e.target.value)}
                className="bg-white/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/50 border-0"
              >
                {ITEM_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="flex items-center gap-2">
                <button onClick={saveEdit} disabled={saving}
                  className="rounded-xl bg-indigo-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors">
                  {saving ? <Loader2 className="inline h-3 w-3 animate-spin mr-1" /> : <Check className="inline h-3 w-3 mr-1" />}保存
                </button>
                <button onClick={() => setEditing(false)}
                  className="rounded-xl bg-white/60 px-4 py-1.5 text-xs text-slate-600 hover:bg-white/80 transition-colors">
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-4">
              {/* 图标 */}
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradientClass} flex items-center justify-center shadow-lg shrink-0`}>
                {item.icon
                  ? <span className="text-2xl">{item.icon}</span>
                  : <span className="text-xl font-bold text-white/90">{item.title.charAt(0)}</span>
                }
              </div>

              <div className="flex-1 min-w-0">
                {/* 标题行 */}
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h1 className="text-lg font-bold text-slate-900">{item.title}</h1>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-gradient-to-br ${gradientClass} text-white shadow-sm`}>
                    {item.status}
                  </span>
                  {todayCount !== null && todayCount > 0 && (
                    <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-600">
                      今日 {todayCount} 条
                    </span>
                  )}
                </div>

                {item.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 mb-2">{item.description}</p>
                )}

                {/* 数据条 */}
                <div className="flex flex-wrap gap-2">
                  {totalHours > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-xl bg-teal-50/80 px-2.5 py-1 text-[11px] font-medium text-teal-600">
                      <Timer className="h-3 w-3" />{totalHours.toFixed(1)}h
                    </span>
                  )}
                  {totalCost > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-xl bg-red-50/80 px-2.5 py-1 text-[11px] font-medium text-red-500">
                      <DollarSign className="h-3 w-3" />¥{totalCost.toLocaleString()}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100/80 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                    <FileText className="h-3 w-3" />{recordCount} 条记录
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-xl bg-amber-50/80 px-2.5 py-1 text-[11px] font-medium text-amber-600">
                    <Layers className="h-3 w-3" />{phases.length} 阶段
                  </span>
                  {effectiveAgg?.metric_summaries?.map(ms => (
                    <span key={ms.metric_name} className="inline-flex items-center gap-1 rounded-xl bg-purple-50/80 px-2.5 py-1 text-[11px] font-medium text-purple-600">
                      <BarChart3 className="h-3 w-3" />{ms.total_value.toLocaleString()}{ms.metric_unit} {ms.metric_name}
                    </span>
                  ))}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => router.push(`/records?item_id=${itemId}`)}
                  className="rounded-xl bg-indigo-500 hover:bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors flex items-center gap-1 shadow-sm"
                >
                  <Plus className="h-3 w-3" />记一笔
                </button>
                <button onClick={() => { setEditingGoal(null); setShowGoalForm(true); }}
                  className="p-2 rounded-xl glass shadow-soft hover:shadow-soft-lg text-slate-400 hover:text-purple-500 transition-all" title="设置目标">
                  <Target className="h-4 w-4" />
                </button>
                <button onClick={handleCreatePhase}
                  className="p-2 rounded-xl glass shadow-soft hover:shadow-soft-lg text-slate-400 hover:text-amber-500 transition-all" title="新建阶段">
                  <Layers className="h-4 w-4" />
                </button>
                <button onClick={() => setShowHistoryImport(true)}
                  className="p-2 rounded-xl glass shadow-soft hover:shadow-soft-lg text-slate-400 hover:text-teal-500 transition-all" title="历史导入">
                  <History className="h-4 w-4" />
                </button>
                <button onClick={startEdit}
                  className="p-2 rounded-xl glass shadow-soft hover:shadow-soft-lg text-slate-400 hover:text-indigo-500 transition-all" title="编辑">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={handleDelete}
                  className="p-2 rounded-xl glass shadow-soft hover:shadow-soft-lg text-slate-400 hover:text-red-500 transition-all" title="删除">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── 视图切换 Tab ── */}
        <div className="flex items-center gap-1 mb-5">
          <button
            onClick={() => setActiveView('execute')}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              activeView === 'execute'
                ? 'bg-indigo-500 text-white shadow-md'
                : 'bg-white/60 text-slate-500 hover:bg-white/80 hover:text-slate-700'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            执行
          </button>
          <button
            onClick={() => setActiveView('archive')}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              activeView === 'archive'
                ? 'bg-slate-700 text-white shadow-md'
                : 'bg-white/60 text-slate-500 hover:bg-white/80 hover:text-slate-700'
            }`}
          >
            <Archive className="h-3.5 w-3.5" />
            档案
          </button>
        </div>

        {/* ── 执行视图 ── */}
        {activeView === 'execute' && (
          <div className="space-y-5">
            {/* 待完成计划 */}
            {relatedRecords.filter(r => r.type === '计划' && r.status !== '已完成' && r.status !== '已取消').length > 0 && (
              <section className="glass rounded-3xl shadow-soft-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="h-4 w-4 text-indigo-400" />
                  <h2 className="text-sm font-bold text-slate-700">待完成计划</h2>
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
                    {relatedRecords.filter(r => r.type === '计划' && r.status !== '已完成' && r.status !== '已取消').length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {relatedRecords
                    .filter(r => r.type === '计划' && r.status !== '已完成' && r.status !== '已取消')
                    .slice(0, 5)
                    .map(r => (
                      <div key={r.id} className="flex items-center justify-between rounded-xl bg-slate-50/80 px-3 py-2 group hover:bg-indigo-50/50 transition-colors">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <ChevronRight className="h-3 w-3 text-indigo-400 shrink-0" />
                          <span className="text-sm text-slate-700 truncate">{r.content}</span>
                          {r.time_anchor_date && (
                            <span className="text-[10px] text-indigo-400 shrink-0">
                              {new Date(r.time_anchor_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleCompleteRecord(r)}
                            className="p-1 rounded-lg hover:bg-green-100 text-green-500 text-[10px]"
                            title="完成"
                          >✓</button>
                          <button
                            onClick={() => handlePostponeRecord(r)}
                            className="p-1 rounded-lg hover:bg-amber-100 text-amber-500 text-[10px]"
                            title="推迟"
                          >→</button>
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            )}

            {/* 子项推进状态 */}
            {(item.sub_items || []).length > 0 && (
              <section className="glass rounded-3xl shadow-soft-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="h-4 w-4 text-purple-400" />
                  <h2 className="text-sm font-bold text-slate-700">行动线推进</h2>
                </div>
                <div className="space-y-2">
                  {(item.sub_items || []).map(sub => {
                    const subRecords = (item.records || item.recent_records || []).filter(r => r.sub_item_id === sub.id);
                    const lastRecord = subRecords.length > 0 ? subRecords[0] : null;
                    const daysSinceLast = lastRecord
                      ? Math.floor((Date.now() - new Date(lastRecord.created_at).getTime()) / 86400000)
                      : null;
                    const isStalled = daysSinceLast !== null && daysSinceLast > 7;
                    return (
                      <div
                        key={sub.id}
                        className={`flex items-center justify-between rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
                          activeSubItemId === sub.id
                            ? 'bg-indigo-50 border border-indigo-200'
                            : 'bg-slate-50/80 hover:bg-slate-100/80'
                        }`}
                        onClick={() => setActiveSubItemId(activeSubItemId === sub.id ? null : sub.id)}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${isStalled ? 'bg-amber-400' : 'bg-green-400'}`} />
                          <span className="text-sm text-slate-700">{sub.title}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span>{subRecords.length}条</span>
                          {daysSinceLast !== null && (
                            <span className={isStalled ? 'text-amber-500 font-medium' : ''}>
                              {daysSinceLast === 0 ? '今天' : daysSinceLast === 1 ? '昨天' : `${daysSinceLast}天前`}
                            </span>
                          )}
                          {daysSinceLast === null && (
                            <span className="text-amber-400">暂无记录</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 近期动态 */}
            <section className="glass rounded-3xl shadow-soft-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-bold text-slate-700">近期动态</h2>
              </div>
              {relatedRecords.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-6 text-center">
                  <FileText className="h-5 w-5 mx-auto text-slate-300 mb-2" />
                  <p className="text-xs text-slate-400">还没有记录</p>
                  <button
                    onClick={() => router.push(`/records?item_id=${itemId}`)}
                    className="mt-2 text-[11px] text-indigo-500 hover:text-indigo-600 font-medium"
                  >
                    记一笔 →
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {relatedRecords.slice(0, 8).map(r => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-xl bg-slate-50/80 px-3 py-2 hover:bg-indigo-50/50 cursor-pointer transition-colors"
                      onClick={() => setEditingRecord(r)}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-medium ${
                          r.type === '计划' ? 'bg-blue-100 text-blue-600' :
                          r.type === '想法' ? 'bg-purple-100 text-purple-600' :
                          r.type === '总结' ? 'bg-amber-100 text-amber-600' :
                          'bg-green-100 text-green-600'
                        }`}>{r.type}</span>
                        <span className="text-sm text-slate-700 truncate">{r.content}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                        {new Date(r.occurred_at || r.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))}
                  {relatedRecords.length > 8 && (
                    <button
                      onClick={() => setActiveView('archive')}
                      className="w-full text-center py-2 text-[11px] text-slate-400 hover:text-indigo-500 transition-colors"
                    >
                      查看全部 {relatedRecords.length} 条 →
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── 档案视图 ── */}
        {activeView === 'archive' && (<>

        {/* ── 区域二：数据总览（基础趋势 + 目标对照合并） ── */}
        <section className="glass rounded-3xl shadow-soft-lg p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-700">
                {activeSubItemId
                  ? `${(item.sub_items || []).find(s => s.id === activeSubItemId)?.title || '子项'} 数据`
                  : '数据总览'}
              </h2>
            </div>
            <button
              onClick={() => { setEditingGoal(null); setShowGoalForm(true); }}
              className="text-[11px] text-slate-400 hover:text-purple-500 transition-colors flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />设置目标
            </button>
          </div>

          {/* 上半区：基础趋势 */}
          {activeSubItemId && subItemAgg ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50/80 px-3 py-2.5">
                <p className="text-[10px] text-slate-400 mb-0.5">记录数</p>
                <p className="text-lg font-bold text-slate-800">{subItemAgg.record_count}</p>
              </div>
              <div className="rounded-xl bg-slate-50/80 px-3 py-2.5">
                <p className="text-[10px] text-slate-400 mb-0.5">总时长</p>
                <p className="text-lg font-bold text-slate-800">{(subItemAgg.total_duration_minutes / 60).toFixed(1)}h</p>
              </div>
              <div className="rounded-xl bg-slate-50/80 px-3 py-2.5">
                <p className="text-[10px] text-slate-400 mb-0.5">总花费</p>
                <p className="text-lg font-bold text-slate-800">{subItemAgg.total_cost > 0 ? `¥${subItemAgg.total_cost.toLocaleString()}` : '-'}</p>
              </div>
              {subItemAgg.metric_summaries.map(ms => (
                <div key={ms.metric_name} className="rounded-xl bg-purple-50/80 px-3 py-2.5">
                  <p className="text-[10px] text-slate-400 mb-0.5">{ms.metric_name}</p>
                  <p className="text-lg font-bold text-purple-700">{ms.total_value.toLocaleString()}{ms.metric_unit}</p>
                </div>
              ))}
            </div>
          ) : (
            <ItemDataPanel dailyStats={item.recent_daily_stats || []} />
          )}

          {/* 子项标签页 */}
          {(item.sub_items || []).length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100/60">
              <SubItemTabBar
                subItems={item.sub_items || []}
                activeSubItemId={activeSubItemId}
                onTabChange={setActiveSubItemId}
                onAdd={() => { setEditingSubItem(null); setShowSubItemForm(true); }}
                onEdit={(sub) => { setEditingSubItem(sub); setShowSubItemForm(true); }}
                onPromote={(sub) => setPromotingSubItem(sub)}
              />
            </div>
          )}
          {/* 无子项时的入口 — 醒目展示 */}
          {(item.sub_items || []).length === 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100/60">
              <button
                onClick={() => { setEditingSubItem(null); setShowSubItemForm(true); }}
                className="flex items-center gap-2 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100/60 px-4 py-2.5 text-xs font-medium text-indigo-500 hover:text-indigo-600 transition-all"
              >
                <Layers className="h-3.5 w-3.5" />
                添加子项，拆分行动线
              </button>
            </div>
          )}

          {/* 下半区：目标对照（仅当有目标时显示） */}
          {((item.goals || []).length > 0 || (item.goal)) && (
            <div className="mt-4 pt-4 border-t border-slate-100/60">
              <div className="flex items-center gap-2 mb-3">
                <Target className="h-3.5 w-3.5 text-slate-400" />
                <h3 className="text-xs font-semibold text-slate-500">目标进度</h3>
              </div>
              <GoalEngineDashboard itemId={itemId} activeSubItemId={activeSubItemId} goals={item.goals || []} onAddGoal={() => { setEditingGoal(null); setShowGoalForm(true); }} />
              <div className="mt-3">
                <ItemGoalSection
                  itemId={itemId}
                  goals={filteredGoals}
                  subItems={item.sub_items || []}
                  activeSubItemId={activeSubItemId}
                  phases={phases.map(p => ({ id: p.id, title: p.title }))}
                  onGoalChanged={fetchItem}
                  onError={showError}
                />
              </div>
            </div>
          )}
        </section>

        {/* ── 区域三：阶段管理（始终可见，0阶段时展示空状态入口） ── */}
        <section className="glass rounded-3xl shadow-soft-lg p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-700">阶段</h2>
              {phases.length > 0 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{phases.length}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPhaseSuggest(true)}
                className="text-[11px] text-slate-400 hover:text-indigo-500 transition-colors flex items-center gap-1"
              >
                <Sparkles className="h-3 w-3" />从记录生成
              </button>
              <button
                onClick={handleCreatePhase}
                className="text-[11px] text-slate-400 hover:text-amber-500 transition-colors flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />新建阶段
              </button>
            </div>
          </div>

          {phases.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-6 text-center">
              <Layers className="h-6 w-6 mx-auto text-slate-300 mb-2" />
              <p className="text-xs text-slate-400 mb-1">还没有阶段</p>
              <p className="text-[10px] text-slate-300">点上方「从记录生成」让系统帮你归纳，或「新建阶段」手动创建</p>
            </div>
          ) : (<>
            {/* 当前阶段醒目展示 */}
            {(() => {
              const currentPhase = phases.find(p => !p.end_date);
              if (!currentPhase) return null;
              const range = [
                currentPhase.start_date ? new Date(currentPhase.start_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : null,
                '进行中'
              ].filter(Boolean).join(' — ');
              return (
                <div className="rounded-2xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200/60 p-4 mb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-base font-bold text-indigo-800">{currentPhase.title}</p>
                      <p className="text-[11px] text-indigo-500 mt-0.5">{range}</p>
                    </div>
                    <button
                      onClick={() => handleEditPhase(currentPhase)}
                      className="p-2 rounded-xl hover:bg-white/60 text-indigo-400 hover:text-indigo-600 transition-colors"
                      title="编辑阶段"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {currentPhase.description && (
                    <p className="text-xs text-indigo-600/70 mt-2 leading-relaxed">{currentPhase.description}</p>
                  )}
                  {/* 阶段数据看板 */}
                  {currentPhase.aggregation && currentPhase.aggregation.record_count > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-white/60 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
                        <FileText className="h-3 w-3" />{currentPhase.aggregation.record_count} 条记录
                      </span>
                      {currentPhase.aggregation.total_duration_minutes > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-white/60 px-2 py-0.5 text-[10px] font-medium text-teal-600">
                          <Timer className="h-3 w-3" />{(currentPhase.aggregation.total_duration_minutes / 60).toFixed(1)}h
                        </span>
                      )}
                      {currentPhase.aggregation.total_cost > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-white/60 px-2 py-0.5 text-[10px] font-medium text-red-500">
                          <DollarSign className="h-3 w-3" />¥{currentPhase.aggregation.total_cost.toLocaleString()}
                        </span>
                      )}
                      {currentPhase.aggregation.metric_summaries?.map(ms => (
                        <span key={ms.metric_name} className="inline-flex items-center gap-1 rounded-lg bg-white/60 px-2 py-0.5 text-[10px] font-medium text-purple-600">
                          <BarChart3 className="h-3 w-3" />{ms.total_value.toLocaleString()}{ms.metric_unit} {ms.metric_name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 其他阶段列表 */}
            <div className="space-y-1.5">
              {phases.filter(p => p.end_date).map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-xl bg-slate-50/80 px-3 py-2 group">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-1 h-4 rounded-full bg-slate-300 shrink-0" />
                    <span className="text-sm text-slate-600 truncate">{p.title}</span>
                    {p.start_date && p.end_date && (
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {new Date(p.start_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })} — {new Date(p.end_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {/* 阶段简要数据 */}
                    {p.aggregation && p.aggregation.record_count > 0 && (
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {p.aggregation.record_count}条
                        {p.aggregation.total_duration_minutes > 0 && ` · ${(p.aggregation.total_duration_minutes / 60).toFixed(1)}h`}
                        {p.aggregation.metric_summaries?.map(ms => ` · ${ms.total_value.toLocaleString()}${ms.metric_unit}${ms.metric_name}`).join('')}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleEditPhase(p)}
                    className="shrink-0 p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/60 text-slate-400 hover:text-indigo-500 transition-all"
                    title="编辑"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </>)}
        </section>

        {/* ── 区域四：章节时间线 ── */}
        <section className="glass rounded-3xl shadow-soft-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-700">时间线</h2>
            </div>
          </div>

          <ItemTimeline
            phases={phases}
            records={relatedRecords}
            goalMap={goalMap}
            onRecordClick={setEditingRecord}
            onEditPhase={handleEditPhase}
            onComplete={handleCompleteRecord}
            onPostpone={handlePostponeRecord}
            onCancel={handleCancelRecord}
          />
        </section>
        </>)}

        {/* ── 弹窗层 ── */}

        {/* 记录详情 */}
        {editingRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setEditingRecord(null)}>
            <div className="absolute inset-0 glass-dark" />
            <div className="relative glass-heavy rounded-3xl shadow-soft-xl w-[520px] max-h-[75vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 glass-heavy rounded-t-3xl px-6 py-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-2">
                  <span className="rounded-xl bg-slate-100/80 px-2.5 py-1 text-[11px] font-medium text-slate-500">{editingRecord.type}</span>
                  <h3 className="text-sm font-bold text-slate-800">记录详情</h3>
                </div>
                <button onClick={() => setEditingRecord(null)} className="p-1.5 rounded-xl hover:bg-white/50 text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-6 pb-5 space-y-3">
                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{editingRecord.content}</p>

                {/* AI 低置信度提示 */}
                {editingRecord.parsed_semantic && (() => {
                  const ps = editingRecord.parsed_semantic;
                  const confidence = typeof ps.confidence === 'number' ? ps.confidence : null;
                  const fieldConf = ps.field_confidence || {};
                  const guessedFields = Object.entries(fieldConf).filter(([, v]) => v === 'guess').map(([k]) => k);
                  if (confidence !== null && confidence < 0.7) {
                    return (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                        <p className="text-xs font-medium text-amber-700 mb-1">AI 无法确定以下信息，请手动补充</p>
                        {guessedFields.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {guessedFields.map(f => (
                              <span key={f} className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-600">{fieldLabel(f)}</span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] text-amber-500">解析置信度较低（{Math.round(confidence * 100)}%），请核对结构化字段</p>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="space-y-1.5 text-xs text-slate-500">
                  {editingRecord.occurred_at && (
                    <p className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(editingRecord.occurred_at).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                  {editingRecord.metric_value != null && (
                    <p>指标: +{editingRecord.metric_value.toLocaleString()} {editingRecord.metric_unit ?? ''} {editingRecord.metric_name ?? ''}</p>
                  )}
                  {editingRecord.status && <p>状态: {editingRecord.status}</p>}
                  {editingRecord.result && <p>结果: {editingRecord.result}</p>}
                  {editingRecord.mood && <p>心情: {editingRecord.mood}</p>}
                  {editingRecord.energy && <p>精力: {editingRecord.energy}</p>}
                  {editingRecord.note && <p>备注: {editingRecord.note}</p>}
                </div>
                <div className="pt-3">
                  <button
                    onClick={() => {
                      const rd = editingRecord.occurred_at
                        ? new Date(editingRecord.occurred_at).toISOString().slice(0, 10)
                        : new Date(editingRecord.created_at).toISOString().slice(0, 10);
                      router.push(`/records?date=${rd}`);
                    }}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    <ExternalLink className="h-3 w-3" />在记录页查看
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 阶段表单 */}
        {showPhaseForm && (
          <PhaseForm
            itemId={itemId}
            phase={editingPhase}
            onClose={() => { setShowPhaseForm(false); setEditingPhase(null); }}
            onSaved={handlePhaseSaved}
            onError={showError}
          />
        )}

        {/* 目标表单 */}
        {showGoalForm && (
          <GoalForm
            goal={editingGoal}
            itemId={itemId}
            phases={phases.map(p => ({ id: p.id, title: p.title }))}
            subItems={item.sub_items || []}
            preselectedSubItemId={activeSubItemId}
            onGoalAchievedCreatePhase={() => {
              setShowGoalForm(false);
              setEditingGoal(null);
              setEditingPhase(null);
              setShowPhaseForm(true);
            }}
            onClose={() => { setShowGoalForm(false); setEditingGoal(null); }}
            onSaved={() => { setShowGoalForm(false); setEditingGoal(null); fetchItem(); }}
            onError={showError}
          />
        )}

        {/* 子项表单 */}
        {showSubItemForm && (
          <SubItemForm
            itemId={itemId}
            initialData={editingSubItem}
            onClose={() => { setShowSubItemForm(false); setEditingSubItem(null); }}
            onSaved={fetchItem}
          />
        )}

        {/* 子项升格对话框 */}
        {promotingSubItem && (
          <SubItemPromoteDialog
            subItem={promotingSubItem}
            promoting={promoting}
            onClose={() => setPromotingSubItem(null)}
            onConfirm={async (migrateRecords) => {
              setPromoting(true);
              try {
                const res = await fetch(`/api/v2/sub-items/${promotingSubItem.id}/promote`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ migrate_records: migrateRecords }),
                });
                if (!res.ok) throw new Error('升格失败');
                setPromotingSubItem(null);
                fetchItem();
              } catch {
                showError('升格失败');
              } finally {
                setPromoting(false);
              }
            }}
          />
        )}

        {/* 历史导入 */}
        {showHistoryImport && (
          <HistoryImport
            itemId={itemId}
            itemTitle={item.title}
            onClose={() => setShowHistoryImport(false)}
            onRecordsImported={fetchItem}
            onPhaseImported={() => { setPhaseRefreshKey(k => k + 1); fetchItem(); }}
            onError={showError}
          />
        )}

        {/* 从记录生成阶段 */}
        {showPhaseSuggest && (
          <PhaseSuggest
            itemId={itemId}
            onClose={() => setShowPhaseSuggest(false)}
            onPhaseCreated={() => { setPhaseRefreshKey(k => k + 1); fetchItem(); }}
            onError={showError}
          />
        )}

      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
