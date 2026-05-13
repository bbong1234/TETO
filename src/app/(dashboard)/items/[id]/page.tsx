'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Trash2, Pencil, X, Check,
  ExternalLink, RefreshCw, Plus, Layers, FileText, History,
  Calendar, DollarSign, Timer, BarChart3, Target, Sparkles,
  ChevronRight, AlertTriangle, CheckSquare
} from 'lucide-react';
import type { Item, UpdateItemPayload, Record as TetoRecord, Phase, Goal, ItemAggregation, SubItem } from '@/types/teto';
import { ITEM_STATUSES } from '@/types/teto';
import { useToast } from '@/components/ui/use-toast';
import ToastContainer from '@/components/ui/use-toast';
import PhaseForm from '../components/PhaseForm';
import PhaseSuggest from '../components/PhaseSuggest';
import HistoryImport from '../components/HistoryImport';
import UnifiedGoalPanel from '../components/UnifiedGoalPanel';
import ItemTimeline from '../components/ItemTimeline';
import ItemDataPanel from '../components/ItemDataPanel';
import SubItemTabBar from '../components/SubItemTabBar';
import SubItemForm from '../components/SubItemForm';
import SubItemPromoteDialog from '../components/SubItemPromoteDialog';

interface DailyStat {
  date: string;
  sub_item_id: string | null;
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

/** 调用纠错 API 修正 AI 推测错误的字段 */
async function correctField(
  recordId: string,
  field: string,
  newValue: string,
  decisionId?: string
) {
  const res = await fetch(`/api/v2/records/${recordId}/correct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      field_corrected: field,
      new_value: newValue,
      decision_id: decisionId ?? undefined,
    }),
  });
  return res.ok ? await res.json() : null;
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
  const [goalRefreshKey, setGoalRefreshKey] = useState(0);
  const [showPhaseSuggest, setShowPhaseSuggest] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  // 子项相关状态
  const [activeSubItemId, setActiveSubItemId] = useState<string | null>(null);
  const [showSubItemForm, setShowSubItemForm] = useState(false);
  const [editingSubItem, setEditingSubItem] = useState<SubItem | null>(null);

  // 计划完成对话框状态
  const [completingRecord, setCompletingRecord] = useState<TetoRecord | null>(null);
  const [completeDate, setCompleteDate] = useState('');
  const [completeTime, setCompleteTime] = useState('');
  const [completionContent, setCompletionContent] = useState('');

  // 多选模式状态
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [promotingSubItem, setPromotingSubItem] = useState<SubItem | null>(null);
  const [correctingField, setCorrectingField] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);

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

  const handleCompleteRecord = (record: TetoRecord) => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    setCompleteDate(dateStr);
    setCompleteTime(timeStr);
    setCompletionContent('');
    setCompletingRecord(record);
  };

  const confirmCompleteRecord = async () => {
    if (!completingRecord) return;
    const record = completingRecord;
    setCompletingRecord(null);
    try {
      const occurredAt = `${completeDate}T${completeTime}:00+08:00`;
      const payload: Record<string, string> = { occurred_at: occurredAt, date: completeDate };
      if (completionContent.trim()) payload.completion_content = completionContent.trim();
      const res = await fetch(`/api/v2/records/${record.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) { setGoalRefreshKey(k => k + 1); fetchItem(); } else { const e = await res.json(); showError(e.error || '完成操作失败'); }
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
      if (res.ok) { setGoalRefreshKey(k => k + 1); fetchItem(); } else { const e = await res.json(); showError(e.error || '推迟操作失败'); }
    } catch { showError('推迟操作失败，请重试'); }
  };

  const handleCancelRecord = async (record: TetoRecord) => {
    if (!confirm(`确认取消计划：「${record.content}」？\n取消后不会生成任何新记录。`)) return;
    try {
      const res = await fetch(`/api/v2/records/${record.id}/cancel`, { method: 'POST' });
      if (res.ok) { setGoalRefreshKey(k => k + 1); fetchItem(); } else { const e = await res.json(); showError(e.error || '取消操作失败'); }
    } catch { showError('取消操作失败，请重试'); }
  };

  const handleDeletePhase = async (phase: Phase) => {
    if (!confirm(`确定删除阶段「${phase.title}」？此操作不可恢复。`)) return;
    try {
      const res = await fetch(`/api/v2/phases/${phase.id}`, { method: 'DELETE' });
      if (res.ok) {
        setPhaseRefreshKey(k => k + 1);
        fetchItem();
      } else {
        const errData = await res.json();
        showError(errData.error || '删除阶段失败');
      }
    } catch {
      showError('删除阶段失败，请重试');
    }
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

  // 游离记录：有子项的事项下，没有 sub_item_id 的非计划记录（计划有专属"待完成计划"区域）
  const orphanRecords = useMemo(() => {
    if (!item || !(item.sub_items || []).length) return [];
    const allRecords = item.records || item.recent_records || [];
    return allRecords.filter(r => !r.sub_item_id && r.type !== '计划');
  }, [item]);
  const [orphanAssignSubId, setOrphanAssignSubId] = useState<string>('');
  const [assigningOrphans, setAssigningOrphans] = useState(false);

  const relatedRecords: TetoRecord[] = item
    ? (() => {
        const allRecords = item.records || item.recent_records || [];
        if (!activeSubItemId) return allRecords;
        if (activeSubItemId === '__orphan__') return orphanRecords;
        return allRecords.filter(r => r.sub_item_id === activeSubItemId);
      })()
    : [];

  // 时间线记录：排除活跃计划（计划在"待完成计划"section 中显示）
  const timelineRecords = useMemo(() =>
    relatedRecords.filter(r => !(r.type === '计划' && (!r.lifecycle_status || r.lifecycle_status === 'active'))),
    [relatedRecords]
  );

  // 活跃计划记录（在"待完成计划"section 显示）
  const activePlans = useMemo(() =>
    relatedRecords.filter(r => r.type === '计划' && (!r.lifecycle_status || r.lifecycle_status === 'active')),
    [relatedRecords]
  );

  // 计算占位日期：量化目标范围内、无记录的日期
  const placeholderEntries = useMemo(() => {
    if (!item?.goals) return [];

    const numericGoals = item.goals.filter(g => {
      if (g.rule_type !== '周期性达成' || !g.start_date || !g.item_id) return false;
      if (activeSubItemId === '__orphan__') return false;
      if (activeSubItemId) return g.sub_item_id === activeSubItemId;
      return true;
    });

    if (numericGoals.length === 0) return [];

    const earliest = numericGoals.reduce<string>((min, g) =>
      g.start_date! < min ? g.start_date! : min, numericGoals[0].start_date!);

    // 收集已有记录的日期集合
    const recordDates = new Set<string>();
    for (const r of relatedRecords) {
      const d = r.occurred_at?.slice(0, 10) || r.created_at?.slice(0, 10);
      if (d) recordDates.add(d);
    }

    const placeholders: Array<{ id: string; date: string }> = [];
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const cur = new Date(earliest + 'T00:00:00Z');
    const end = new Date(todayStr + 'T00:00:00Z');
    while (cur <= end) {
      const dateStr = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}-${String(cur.getUTCDate()).padStart(2, '0')}`;
      if (!recordDates.has(dateStr)) {
        placeholders.push({ id: `placeholder-${dateStr}`, date: dateStr });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    return placeholders;
  }, [item?.goals, relatedRecords, activeSubItemId]);

  const handleAssignOrphans = async () => {
    if (!orphanAssignSubId || orphanRecords.length === 0) return;
    setAssigningOrphans(true);
    try {
      let successCount = 0;
      for (const rec of orphanRecords) {
        const res = await fetch(`/api/v2/records/${rec.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sub_item_id: orphanAssignSubId }),
        });
        if (res.ok) successCount++;
      }
      if (successCount > 0) {
        fetchItem();
        setOrphanAssignSubId('');
      }
    } catch {
      showError('分配子项失败，请重试');
    } finally {
      setAssigningOrphans(false);
    }
  };

  // 多选模式操作
  const handleToggleSelectionMode = () => {
    if (selectionMode) {
      setSelectionMode(false);
      setSelectedIds(new Set());
    } else {
      setSelectionMode(true);
    }
  };

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = () => {
    const allIds = relatedRecords.map(r => r.id);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const msg = selectedIds.size > 20
      ? `你正在删除 ${selectedIds.size} 条记录，此操作不可撤销。确定继续？`
      : `确定删除选中的 ${selectedIds.size} 条记录？此操作不可撤销。`;
    if (!confirm(msg)) return;
    setBatchDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const BATCH_SIZE = 200;
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const res = await fetch('/api/v2/records/batch-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: batch }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || '批量删除失败');
        }
      }
      setSelectedIds(new Set());
      setSelectionMode(false);
      fetchItem();
    } catch (err: any) {
      showError(err.message || '批量删除失败，请重试');
    } finally {
      setBatchDeleting(false);
    }
  };

  const handleSelectAllInYear = useCallback((year: string) => {
    const yearRecordIds = relatedRecords
      .filter(r => {
        const d = r.occurred_at || r.created_at;
        const y = d ? new Date(d).getFullYear().toString() : '';
        return y === year;
      })
      .map(r => r.id);

    const allSelected = yearRecordIds.length > 0 && yearRecordIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        yearRecordIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        yearRecordIds.forEach(id => next.add(id));
        return next;
      });
    }
  }, [relatedRecords, selectedIds]);

  // 子项级聚合计算（必须在 early return 前调用，保持 hooks 顺序稳定）
  const subItemAgg = useMemo(() => {
    if (!item || !activeSubItemId || activeSubItemId === '__orphan__' || relatedRecords.length === 0) return null;
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

  const effectiveAgg = (activeSubItemId && activeSubItemId !== '__orphan__') ? subItemAgg : agg;
  const totalHours = effectiveAgg ? effectiveAgg.total_duration_minutes / 60 : 0;
  const totalCost = effectiveAgg?.total_cost ?? 0;
  const recordCount = effectiveAgg?.record_count ?? relatedRecords.length;
  const gradientClass = STATUS_COLORS[item.status] || 'from-slate-400 to-slate-500';

  const goalMap: Record<string, string> = {};
  (item.goals || (item.goal ? [item.goal] : [])).forEach(g => { if (g) goalMap[g.id] = g.title; });

  // 按子项筛选目标
  const filteredGoals = (() => {
    const allGoals = item.goals || [];
    if (!activeSubItemId || activeSubItemId === '__orphan__') return allGoals;
    // 选中子项时：显示该子项的目标 + 事项级达标型目标（无 sub_item_id 的）
    return allGoals.filter(g => g.sub_item_id === activeSubItemId || (!g.sub_item_id && g.rule_type === '一次性完成'));
  })();

  return (
    <div className="flex-1 overflow-y-auto min-h-0 desktop-bg">
      <div className="mx-auto max-w-[1200px] px-4 py-5">

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

        {/* ── 统一视图 ── */}
        <div className="space-y-5 mb-5">
            {/* 待完成计划 */}
            {activePlans.length > 0 && (
              <section className="glass rounded-3xl shadow-soft-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="h-4 w-4 text-indigo-400" />
                  <h2 className="text-sm font-bold text-slate-700">待完成计划</h2>
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
                    {activePlans.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {activePlans
                    .sort((a, b) => {
                      // 计划按时间升序排列（最早的在上）
                      // 综合 time_anchor_date + time_text 时段权重，避免仅靠 created_at 排序
                      const getPlanKey = (r: typeof a) => {
                        if (r.occurred_at) return r.occurred_at;
                        const date = r.time_anchor_date || r.created_at;
                        // 从 time_text 提取时段权重
                        const t = (r.time_text || '').toLowerCase();
                        let h = 12;
                        if (t.includes('凌晨') || t.includes('深夜')) h = 0;
                        else if (t.includes('早上') || t.includes('早晨') || t.includes('清晨') || t.includes('上午')) h = 8;
                        else if (t.includes('中午') || t.includes('午饭') || t.includes('午休')) h = 12;
                        else if (t.includes('下午')) h = 15;
                        else if (t.includes('傍晚') || t.includes('黄昏')) h = 18;
                        else if (t.includes('晚上') || t.includes('夜晚') || t.includes('夜里')) h = 20;
                        return `${date}T${String(h).padStart(2, '0')}:00:00`;
                      };
                      return getPlanKey(a).localeCompare(getPlanKey(b));
                    })
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
        </div>

        {/* ── 区域二：子项切换 ── */}
        {(item.sub_items || []).length > 0 && (
          <section className="glass rounded-3xl shadow-soft-lg p-4 mb-5">
            <SubItemTabBar
              subItems={item.sub_items || []}
              activeSubItemId={activeSubItemId}
              orphanCount={orphanRecords.length}
              onTabChange={setActiveSubItemId}
              onAdd={() => { setEditingSubItem(null); setShowSubItemForm(true); }}
              onEdit={(sub) => { setEditingSubItem(sub); setShowSubItemForm(true); }}
              onPromote={(sub) => setPromotingSubItem(sub)}
            />
            {/* 未归类区域 */}
            {activeSubItemId === '__orphan__' && orphanRecords.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100/60">
                <div className="rounded-xl bg-amber-50/60 border border-amber-200/60 px-4 py-3">
                  <p className="text-xs font-medium text-amber-700 mb-2">
                    以下 {orphanRecords.length} 条记录尚未归类到子项，建议尽快分配
                  </p>
                  <div className="space-y-1.5 mb-3">
                    {orphanRecords.slice(0, 5).map(r => (
                      <div key={r.id} className="flex items-center gap-2 rounded-lg bg-white/60 px-2.5 py-1.5">
                        <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-medium ${
                          r.type === '计划' ? 'bg-blue-100 text-blue-600' :
                          r.type === '想法' ? 'bg-purple-100 text-purple-600' :
                          r.type === '总结' ? 'bg-amber-100 text-amber-600' :
                          'bg-green-100 text-green-600'
                        }`}>{r.type}</span>
                        <span className="text-xs text-slate-700 truncate flex-1">{r.content}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {new Date(r.occurred_at || r.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ))}
                    {orphanRecords.length > 5 && (
                      <p className="text-[10px] text-slate-400 text-center">还有 {orphanRecords.length - 5} 条...</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={orphanAssignSubId}
                      onChange={(e) => setOrphanAssignSubId(e.target.value)}
                      className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    >
                      <option value="">选择子项...</option>
                      {(item.sub_items || []).map(sub => (
                        <option key={sub.id} value={sub.id}>{sub.title}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAssignOrphans}
                      disabled={!orphanAssignSubId || assigningOrphans}
                      className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {assigningOrphans ? '分配中...' : '一键分配'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── 区域三：数据 + 目标（两栏布局） ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
          {/* 左栏：数据趋势 */}
          <section className="glass rounded-3xl shadow-soft-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-700">
                {activeSubItemId === '__orphan__'
                  ? '未归类数据'
                  : activeSubItemId
                  ? `${(item.sub_items || []).find(s => s.id === activeSubItemId)?.title || '子项'} 数据`
                  : '数据总览'}
              </h2>
            </div>
            <ItemDataPanel
              dailyStats={item.recent_daily_stats || []}
              subItems={item.sub_items || []}
              activeSubItemId={activeSubItemId}
            />
            {/* 无子项时的入口 */}
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
          </section>

          {/* 右栏：目标进度 */}
          <section className="glass rounded-3xl shadow-soft-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-700">目标进度</h2>
            </div>
            <UnifiedGoalPanel
              itemId={itemId}
              goals={filteredGoals}
              subItems={item.sub_items || []}
              activeSubItemId={activeSubItemId}
              phases={phases.map(p => ({ id: p.id, title: p.title }))}
              refreshKey={goalRefreshKey}
              onGoalChanged={() => { setGoalRefreshKey(k => k + 1); fetchItem(); }}
              onError={showError}
            />
          </section>
        </div>

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
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEditPhase(currentPhase)}
                        className="p-2 rounded-xl hover:bg-white/60 text-indigo-400 hover:text-indigo-600 transition-colors"
                        title="编辑阶段"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeletePhase(currentPhase)}
                        className="p-2 rounded-xl hover:bg-red-50/60 text-indigo-400 hover:text-red-500 transition-colors"
                        title="删除阶段"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => handleEditPhase(p)}
                      className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/60 text-slate-400 hover:text-indigo-500 transition-all"
                      title="编辑"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDeletePhase(p)}
                      className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50/60 text-slate-400 hover:text-red-500 transition-all"
                      title="删除"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
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
            {relatedRecords.length > 0 && (
              <button
                onClick={handleToggleSelectionMode}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectionMode
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <CheckSquare className="h-3.5 w-3.5" />
                {selectionMode ? '取消' : '选择'}
              </button>
            )}
          </div>

          <ItemTimeline
            phases={phases}
            records={timelineRecords}
            goalMap={goalMap}
            onRecordClick={setEditingRecord}
            onEditPhase={handleEditPhase}
            onComplete={handleCompleteRecord}
            onPostpone={handlePostponeRecord}
            onCancel={handleCancelRecord}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onBatchDelete={handleBatchDelete}
            batchDeleting={batchDeleting}
            placeholders={placeholderEntries}
            onSelectAllInYear={handleSelectAllInYear}
          />
        </section>

        {/* ── 弹窗层 ── */}

        {/* 完成计划对话框 */}
        {completingRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setCompletingRecord(null)}>
            <div className="bg-white rounded-xl shadow-lg p-5 w-96 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-slate-800">完成计划</h3>
              <p className="text-xs text-slate-500">{completingRecord.content}</p>
              <div className="space-y-2">
                <label className="block text-xs text-slate-600">
                  实际完成内容
                  <textarea
                    value={completionContent}
                    onChange={(e) => setCompletionContent(e.target.value)}
                    placeholder="描述实际完成了什么（可选，留空则沿用原计划内容）"
                    rows={2}
                    className="mt-1 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none resize-none"
                  />
                </label>
                <label className="block text-xs text-slate-600">
                  完成日期
                  <input type="date" value={completeDate} onChange={(e) => setCompleteDate(e.target.value)}
                    className="mt-1 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none" />
                </label>
                <label className="block text-xs text-slate-600">
                  完成时间
                  <input type="time" value={completeTime} onChange={(e) => setCompleteTime(e.target.value)}
                    className="mt-1 block w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none" />
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setCompletingRecord(null)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50">取消</button>
                <button onClick={confirmCompleteRecord}
                  className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600">确认完成</button>
              </div>
            </div>
          </div>
        )}

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

                {/* AI 低置信度提示 + 纠错入口 */}
                {editingRecord.parsed_semantic && (() => {
                  const ps = editingRecord.parsed_semantic;
                  const confidence = typeof ps.confidence === 'number' ? ps.confidence : null;
                  const fieldConf = ps.field_confidence || {};
                  const guessedFields = Object.entries(fieldConf).filter(([, v]) => v === 'guess').map(([k]) => k);
                  if (confidence !== null && confidence < 0.7) {
                    return (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                        <p className="text-xs font-medium text-amber-700 mb-1">AI 无法确定以下信息，点击字段可纠正</p>
                        {guessedFields.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {guessedFields.map(f => (
                              <button
                                key={f}
                                onClick={() => {
                                  const val = prompt(`纠正「${fieldLabel(f)}」字段的值 (当前: AI推测)`);
                                  if (val && editingRecord?.id) {
                                    correctField(editingRecord.id as string, f, val).then(r => {
                                      if (r) {
                                        setCorrectingField(null);
                                        // 刷新页面以反映纠错结果
                                        window.location.reload();
                                      }
                                    });
                                  }
                                }}
                                className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-600 hover:bg-amber-200 cursor-pointer transition-colors"
                                title={`纠正${fieldLabel(f)}`}
                              >
                                ✎ {fieldLabel(f)}
                              </button>
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
                  {editingRecord.time_text && (
                    <p>时间描述: {editingRecord.time_text}</p>
                  )}
                  {editingRecord.action_text && (
                    <p>动作: {editingRecord.action_text}</p>
                  )}
                  {editingRecord.event_text && (
                    <p>事件: {editingRecord.event_text}</p>
                  )}
                  {editingRecord.object_text && (
                    <p>对象: {editingRecord.object_text}</p>
                  )}
                  {editingRecord.cause_text && (
                    <p>原因: {editingRecord.cause_text}</p>
                  )}
                  {editingRecord.outcome_type && (
                    <p>结果类型: {editingRecord.outcome_type}</p>
                  )}
                  {editingRecord.outcome_direction && (
                    <p>结果方向: {editingRecord.outcome_direction}</p>
                  )}
                  {editingRecord.place_type && (
                    <p>地点: {editingRecord.place_type}</p>
                  )}
                  {editingRecord.location && (
                    <p>位置: {editingRecord.location}</p>
                  )}
                  {editingRecord.people && editingRecord.people.length > 0 && (
                    <p>人物: {editingRecord.people.join(', ')}</p>
                  )}
                  {editingRecord.metric_value != null && (
                    <p>指标: +{editingRecord.metric_value.toLocaleString()} {editingRecord.metric_unit ?? ''} {editingRecord.metric_name ?? ''}</p>
                  )}
                  {editingRecord.duration_minutes != null && (
                    <p>时长: {editingRecord.duration_minutes}分钟</p>
                  )}
                  {editingRecord.cost != null && (
                    <p>花费: ¥{editingRecord.cost.toLocaleString()}</p>
                  )}
                  {editingRecord.mood && <p>心情: {editingRecord.mood}</p>}
                  {editingRecord.energy && <p>精力: {editingRecord.energy}</p>}
                  {editingRecord.note && <p>备注: {editingRecord.note}</p>}
                  {editingRecord.lifecycle_status && editingRecord.lifecycle_status !== 'active' && (
                    <p>生命周期: {editingRecord.lifecycle_status}</p>
                  )}
                </div>
                <div className="pt-3">
                  <button
                    onClick={() => {
                      const rd = editingRecord.occurred_at
                        ? new Date(editingRecord.occurred_at).toISOString().slice(0, 10)
                        : new Date(editingRecord.created_at).toISOString().slice(0, 10);
                      router.push(`/records?date=${rd}&item_id=${itemId}`);
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
            subItems={item.sub_items || []}
            onClose={() => setShowHistoryImport(false)}
            onRecordsImported={() => { setGoalRefreshKey(k => k + 1); fetchItem(); }}
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
