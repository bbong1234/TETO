'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Trash2, Pencil, X, Check,
  ExternalLink, RefreshCw, Plus, Layers, FileText, History,
  Calendar, DollarSign, Timer, BarChart3, Target
} from 'lucide-react';
import type { Item, UpdateItemPayload, Record as TetoRecord, Phase, Goal, ItemAggregation } from '@/types/teto';
import { ITEM_STATUSES } from '@/types/teto';
import { useToast } from '@/components/ui/use-toast';
import ToastContainer from '@/components/ui/use-toast';
import PhaseForm from '../components/PhaseForm';
import HistoryImport from '../components/HistoryImport';
import GoalForm from '../components/GoalForm';
import GoalEngineDashboard from '../components/GoalEngineDashboard';
import ItemGoalSection from '../components/ItemGoalSection';
import ItemTimeline from '../components/ItemTimeline';

interface ItemWithPhases extends Item {
  phases?: (Phase & { goals?: Goal[] })[];
  goal?: Goal | null;
  goals?: Goal[];
  aggregation?: ItemAggregation | null;
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

  const relatedRecords: TetoRecord[] = item.recent_records || [];
  const phases = item.phases || [];
  const agg = item.aggregation;
  const totalHours = agg ? agg.total_duration_minutes / 60 : 0;
  const totalCost = agg?.total_cost ?? 0;
  const recordCount = agg?.record_count ?? relatedRecords.length;
  const gradientClass = STATUS_COLORS[item.status] || 'from-slate-400 to-slate-500';

  const goalMap: Record<string, string> = {};
  (item.goals || (item.goal ? [item.goal] : [])).forEach(g => { if (g) goalMap[g.id] = g.title; });

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
                  {agg?.metric_summaries?.map(ms => (
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

        {/* ── 区域二：量化进度（目标列表 + 仪表盘合并） ── */}
        <section className="glass rounded-3xl shadow-soft-lg p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-700">量化进度</h2>
            </div>
            <button
              onClick={() => { setEditingGoal(null); setShowGoalForm(true); }}
              className="text-[11px] text-slate-400 hover:text-purple-500 transition-colors flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />设置目标
            </button>
          </div>
          <GoalEngineDashboard itemId={itemId} onAddGoal={() => { setEditingGoal(null); setShowGoalForm(true); }} />
          {(item.goals || []).length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100/60">
              <ItemGoalSection
                itemId={itemId}
                goals={item.goals || []}
                phases={phases.map(p => ({ id: p.id, title: p.title }))}
                onGoalChanged={fetchItem}
                onError={showError}
              />
            </div>
          )}
        </section>

        {/* ── 区域三：章节时间线 ── */}
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
          />
        </section>

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
            onClose={() => { setShowGoalForm(false); setEditingGoal(null); }}
            onSaved={() => { setShowGoalForm(false); setEditingGoal(null); fetchItem(); }}
            onError={showError}
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

      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
