'use client';

import { useState, useEffect } from 'react';
import { X, Save, Target } from 'lucide-react';
import type { Goal, GoalStatus, GoalMeasureType, CreateGoalPayload, UpdateGoalPayload } from '@/types/teto';
import { GOAL_STATUSES, GOAL_MEASURE_TYPES } from '@/types/teto';

interface GoalFormProps {
  goal?: Goal | null;
  /** 预设归属事项ID */
  itemId?: string | null;
  /** 预设归属阶段ID */
  phaseId?: string | null;
  /** 可选阶段列表（供归属选择） */
  phases?: { id: string; title: string }[];
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}

const STATUS_LABELS: Record<GoalStatus, string> = {
  '进行中': '进行中',
  '已达成': '已达成',
  '已放弃': '已放弃',
  '已暂停': '已暂停',
};

export default function GoalForm({ goal, itemId, phaseId, phases, onClose, onSaved, onError }: GoalFormProps) {
  const isEditing = !!goal;
  const [title, setTitle] = useState(goal?.title || '');
  const [description, setDescription] = useState(goal?.description || '');
  const [status, setStatus] = useState<GoalStatus>(goal?.status || '进行中');
  const [measureType, setMeasureType] = useState<GoalMeasureType>(goal?.measure_type || 'boolean');
  const [targetValue, setTargetValue] = useState(goal?.target_value != null ? String(goal.target_value) : '');
  const [currentValue, setCurrentValue] = useState(goal?.current_value != null ? String(goal.current_value) : '');
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(goal?.phase_id ?? phaseId ?? null);
  const [metricName, setMetricName] = useState(goal?.metric_name || '');
  const [unit, setUnit] = useState(goal?.unit || '');
  const [dailyTarget, setDailyTarget] = useState(goal?.daily_target != null ? String(goal.daily_target) : '');
  const [startDate, setStartDate] = useState(goal?.start_date || '');
  const [deadlineDate, setDeadlineDate] = useState(goal?.deadline_date || '');
  const [saving, setSaving] = useState(false);

  // 当编辑的目标变化时，重置表单
  useEffect(() => {
    if (goal) {
      setTitle(goal.title);
      setDescription(goal.description || '');
      setStatus(goal.status);
      setMeasureType(goal.measure_type || 'boolean');
      setTargetValue(goal.target_value != null ? String(goal.target_value) : '');
      setCurrentValue(goal.current_value != null ? String(goal.current_value) : '');
      setSelectedPhaseId(goal.phase_id ?? phaseId ?? null);
      setMetricName(goal.metric_name || '');
      setUnit(goal.unit || '');
      setDailyTarget(goal.daily_target != null ? String(goal.daily_target) : '');
      setStartDate(goal.start_date || '');
      setDeadlineDate(goal.deadline_date || '');
    } else {
      setTitle('');
      setDescription('');
      setStatus('进行中');
      setMeasureType('boolean');
      setTargetValue('');
      setCurrentValue('');
      setSelectedPhaseId(phaseId ?? null);
      setMetricName('');
      setUnit('');
      setDailyTarget('');
      setStartDate('');
      setDeadlineDate('');
    }
  }, [goal]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      onError('请输入目标标题');
      return;
    }

    setSaving(true);
    try {
      if (isEditing && goal) {
        // 更新目标
        const payload: UpdateGoalPayload = {
          title: title.trim(),
          description: description.trim() || undefined,
          status,
          measure_type: measureType,
          target_value: measureType === 'numeric' && targetValue.trim() ? Number(targetValue) : undefined,
          current_value: measureType === 'numeric' && currentValue.trim() ? Number(currentValue) : undefined,
          phase_id: selectedPhaseId,
          metric_name: measureType === 'numeric' && metricName.trim() ? metricName.trim() : undefined,
          unit: measureType === 'numeric' && unit.trim() ? unit.trim() : undefined,
          daily_target: measureType === 'numeric' && dailyTarget.trim() ? Number(dailyTarget) : undefined,
          start_date: measureType === 'numeric' && startDate ? startDate : undefined,
          deadline_date: measureType === 'numeric' && deadlineDate ? deadlineDate : undefined,
        };
        const res = await fetch(`/api/v2/goals/${goal.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          onSaved();
        } else {
          const err = await res.json();
          onError(err.error || '更新目标失败');
        }
      } else {
        // 创建目标
        const payload: CreateGoalPayload = {
          title: title.trim(),
          description: description.trim() || undefined,
          status,
          item_id: itemId ?? undefined,
          phase_id: selectedPhaseId ?? undefined,
          measure_type: measureType,
          target_value: measureType === 'numeric' && targetValue.trim() ? Number(targetValue) : undefined,
          current_value: measureType === 'numeric' && currentValue.trim() ? Number(currentValue) : undefined,
          metric_name: measureType === 'numeric' && metricName.trim() ? metricName.trim() : undefined,
          unit: measureType === 'numeric' && unit.trim() ? unit.trim() : undefined,
          daily_target: measureType === 'numeric' && dailyTarget.trim() ? Number(dailyTarget) : undefined,
          start_date: measureType === 'numeric' && startDate ? startDate : undefined,
          deadline_date: measureType === 'numeric' && deadlineDate ? deadlineDate : undefined,
        };
        const res = await fetch('/api/v2/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          onSaved();
        } else {
          const err = await res.json();
          onError(err.error || '创建目标失败');
        }
      }
    } catch (err) {
      console.error(isEditing ? '更新目标失败:' : '创建目标失败:', err);
      onError(isEditing ? '更新目标失败，请重试' : '创建目标失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleSubmit();
    }
  };

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* 抽屉 */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto bg-white shadow-xl lg:rounded-l-2xl">
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
              <Target className="h-4 w-4" />
            </div>
            <h2 className="text-base font-bold text-slate-900">
              {isEditing ? '编辑目标' : '新建目标'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="px-5 py-4 space-y-5">
          {/* 标题 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              标题 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入目标名称"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="描述这个目标的具体内容..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* 度量类型 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">度量类型</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMeasureType('boolean')}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${
                  measureType === 'boolean'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                ✓ 达标型
                <p className="text-[10px] font-normal mt-0.5 opacity-70">是/否已达成</p>
              </button>
              <button
                onClick={() => setMeasureType('numeric')}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${
                  measureType === 'numeric'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                # 量化型
                <p className="text-[10px] font-normal mt-0.5 opacity-70">数字进度跟踪</p>
              </button>
            </div>
          </div>

          {/* 达标型：总目标值 + 当前值 */}
          {measureType === 'boolean' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">总目标值</label>
                <input
                  type="number"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder="例如 100"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">当前值</label>
                <input
                  type="number"
                  value={currentValue}
                  onChange={(e) => setCurrentValue(e.target.value)}
                  placeholder="例如 0"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* 量化型：引擎配置区（当前值由引擎自动计算，不显示） */}
          {measureType === 'numeric' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">总目标值（可选）</label>
                  <input
                    type="number"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    placeholder="例如 10000"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* 引擎配置：指标匹配 */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-3">
                <p className="text-xs font-medium text-amber-700">📊 量化引擎配置（用于仪表盘计算）</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">关联指标名</label>
                    <input
                      type="text"
                      value={metricName}
                      onChange={(e) => setMetricName(e.target.value)}
                      placeholder="例如 单词、听读"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">计量单位</label>
                    <input
                      type="text"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="例如 个、分钟"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">每日期望值</label>
                  <input
                    type="number"
                    value={dailyTarget}
                    onChange={(e) => setDailyTarget(e.target.value)}
                    placeholder="例如 40（每天背40个单词）"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">起算日期</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">截止日期（可选）</label>
                    <input
                      type="date"
                      value={deadlineDate}
                      onChange={(e) => setDeadlineDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-amber-600">提示：关联指标名需与记录中的指标名完全一致，用于防串库精准匹配</p>
              </div>
            </div>
          )}

          {/* 归属阶段 */}
          {phases && phases.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">归属阶段</label>
              <select
                value={selectedPhaseId ?? ''}
                onChange={(e) => setSelectedPhaseId(e.target.value || null)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">事项级目标（不绑定阶段）</option>
                {phases.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* 状态 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">状态</label>
            <div className="flex flex-wrap gap-1.5">
              {GOAL_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    status === s
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 底部保存按钮 */}
        <div className="sticky bottom-0 border-t border-slate-200 bg-white px-5 py-4">
          <button
            onClick={handleSubmit}
            disabled={saving || !title.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-600 disabled:bg-blue-300 transition-colors"
          >
            <Save className="h-4 w-4" />
            {saving ? (isEditing ? '保存中...' : '创建中...') : (isEditing ? '保存' : '创建')}
          </button>
        </div>
      </div>
    </>
  );
}
