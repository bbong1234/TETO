'use client';

import { useState, useEffect } from 'react';
import { X, Save, Target, Layers } from 'lucide-react';
import type { Goal, GoalStatus, GoalMeasureType, CreateGoalPayload, UpdateGoalPayload, SubItem } from '@/types/teto';
import { GOAL_STATUSES, GOAL_MEASURE_TYPES } from '@/types/teto';

interface GoalFormProps {
  goal?: Goal | null;
  /** 预设归属事项ID */
  itemId?: string | null;
  /** 预设归属阶段ID */
  phaseId?: string | null;
  /** 可选阶段列表（供归属选择） */
  phases?: { id: string; title: string }[];
  /** 可选子项列表（供归属选择） */
  subItems?: SubItem[];
  /** 预选子项ID（从子项Tab带入） */
  preselectedSubItemId?: string | null;
  /** 目标达成时创建新阶段的回调 */
  onGoalAchievedCreatePhase?: () => void;
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

export default function GoalForm({ goal, itemId, phaseId, phases, subItems, preselectedSubItemId, onGoalAchievedCreatePhase, onClose, onSaved, onError }: GoalFormProps) {
  const isEditing = !!goal;
  const isAchieved = isEditing && goal?.status === '已达成';
  const [title, setTitle] = useState(goal?.title || '');
  const [description, setDescription] = useState(goal?.description || '');
  const [status, setStatus] = useState<GoalStatus>(goal?.status || '进行中');
  const [measureType, setMeasureType] = useState<GoalMeasureType>(goal?.measure_type || 'boolean');
  const [targetValue, setTargetValue] = useState(goal?.target_value != null ? String(goal.target_value) : '');
  const [currentValue, setCurrentValue] = useState(goal?.current_value != null ? String(goal.current_value) : '');
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(goal?.phase_id ?? phaseId ?? null);
  const [selectedSubItemId, setSelectedSubItemId] = useState<string | null>(goal?.sub_item_id ?? preselectedSubItemId ?? null);
  const [metricName, setMetricName] = useState(goal?.metric_name || '');
  const [unit, setUnit] = useState(goal?.unit || '');
  const [dailyTarget, setDailyTarget] = useState(goal?.daily_target != null ? String(goal.daily_target) : '');
  const [startDate, setStartDate] = useState(goal?.start_date || '');
  const [deadlineDate, setDeadlineDate] = useState(goal?.deadline_date || '');
  // 重复型目标字段
  const [repeatFrequency, setRepeatFrequency] = useState<string>(goal?.repeat_frequency || 'daily');
  const [repeatCount, setRepeatCount] = useState(goal?.repeat_count != null ? String(goal.repeat_count) : '');
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
      setSelectedSubItemId(goal.sub_item_id ?? preselectedSubItemId ?? null);
      setMetricName(goal.metric_name || '');
      setUnit(goal.unit || '');
      setDailyTarget(goal.daily_target != null ? String(goal.daily_target) : '');
      setStartDate(goal.start_date || '');
      setDeadlineDate(goal.deadline_date || '');
      setRepeatFrequency(goal.repeat_frequency || 'daily');
      setRepeatCount(goal.repeat_count != null ? String(goal.repeat_count) : '');
    } else {
      setTitle('');
      setDescription('');
      setStatus('进行中');
      setMeasureType('boolean');
      setTargetValue('');
      setCurrentValue('');
      setSelectedPhaseId(phaseId ?? null);
      setSelectedSubItemId(preselectedSubItemId ?? null);
      setMetricName('');
      setUnit('');
      setDailyTarget('');
      setStartDate('');
      setDeadlineDate('');
      setRepeatFrequency('daily');
      setRepeatCount('');
    }
  }, [goal]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      onError('请输入目标标题');
      return;
    }

    // 校验：量化型/重复型必须选择子项
    if ((measureType === 'numeric' || measureType === 'repeat') && !selectedSubItemId && subItems && subItems.length > 0) {
      onError('量化型和重复型目标必须挂在子项下');
      return;
    }

    setSaving(true);
    try {
      if (isEditing && goal) {
        // 更新目标
        let payload: UpdateGoalPayload;
        if (isAchieved) {
          // 已达成目标仅允许修改状态
          payload = { status };
        } else {
          payload = {
            title: title.trim(),
            description: description.trim() || undefined,
            status,
            measure_type: measureType,
            target_value: measureType === 'numeric' && targetValue.trim() ? Number(targetValue) : undefined,
            current_value: measureType === 'numeric' && currentValue.trim() ? Number(currentValue) : undefined,
            phase_id: selectedPhaseId,
            sub_item_id: selectedSubItemId,
            metric_name: measureType === 'numeric' && metricName.trim() ? metricName.trim() : undefined,
            unit: measureType === 'numeric' && unit.trim() ? unit.trim() : undefined,
            daily_target: measureType === 'numeric' && dailyTarget.trim() ? Number(dailyTarget) : undefined,
            start_date: measureType === 'numeric' && startDate ? startDate : undefined,
            deadline_date: measureType === 'numeric' && deadlineDate ? deadlineDate : undefined,
            repeat_frequency: measureType === 'repeat' ? (repeatFrequency as 'daily' | 'weekly' | 'monthly') : undefined,
            repeat_count: measureType === 'repeat' && repeatCount.trim() ? Number(repeatCount) : undefined,
          };
        }
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
          sub_item_id: selectedSubItemId ?? undefined,
          measure_type: measureType,
          target_value: measureType === 'numeric' && targetValue.trim() ? Number(targetValue) : undefined,
          current_value: measureType === 'numeric' && currentValue.trim() ? Number(currentValue) : undefined,
          metric_name: measureType === 'numeric' && metricName.trim() ? metricName.trim() : undefined,
          unit: measureType === 'numeric' && unit.trim() ? unit.trim() : undefined,
          daily_target: measureType === 'numeric' && dailyTarget.trim() ? Number(dailyTarget) : undefined,
          start_date: measureType === 'numeric' && startDate ? startDate : undefined,
          deadline_date: measureType === 'numeric' && deadlineDate ? deadlineDate : undefined,
          repeat_frequency: measureType === 'repeat' ? (repeatFrequency as 'daily' | 'weekly' | 'monthly') : undefined,
          repeat_count: measureType === 'repeat' && repeatCount.trim() ? Number(repeatCount) : undefined,
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
          {/* 已达成目标提示 */}
          {isAchieved && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <p className="text-xs font-medium text-amber-700">此目标已达成，数据已锁定不可修改。仅可将状态回退为「已放弃」或「已暂停」。</p>
            </div>
          )}

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
              disabled={isAchieved}
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
              disabled={isAchieved}
            />
          </div>

          {/* 度量类型 */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">度量类型</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMeasureType('boolean')}
                disabled={isAchieved}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${
                  measureType === 'boolean'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                } ${isAchieved ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                ✓ 达标型
                <p className="text-[10px] font-normal mt-0.5 opacity-70">是/否已达成</p>
              </button>
              <button
                onClick={() => setMeasureType('numeric')}
                disabled={isAchieved}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${
                  measureType === 'numeric'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                } ${isAchieved ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                # 量化型
                <p className="text-[10px] font-normal mt-0.5 opacity-70">数字进度跟踪</p>
              </button>
              <button
                onClick={() => setMeasureType('repeat')}
                disabled={isAchieved}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${
                  measureType === 'repeat'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                } ${isAchieved ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                ↻ 重复型
                <p className="text-[10px] font-normal mt-0.5 opacity-70">周期性完成</p>
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

          {/* 重复型：频率 + 次数 */}
          {measureType === 'repeat' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-3">
                <p className="text-xs font-medium text-emerald-700">↻ 重复型目标配置</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">重复频率</label>
                    <select
                      value={repeatFrequency}
                      onChange={(e) => setRepeatFrequency(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="daily">每天</option>
                      <option value="weekly">每周</option>
                      <option value="monthly">每月</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">每周期完成次数</label>
                    <input
                      type="number"
                      value={repeatCount}
                      onChange={(e) => setRepeatCount(e.target.value)}
                      placeholder="例如 3"
                      min="1"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-emerald-600">提示：重复型目标统计该子项下每个周期内的记录条数</p>
              </div>
            </div>
          )}

          {/* 归属子项 */}
          {subItems && subItems.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">
                归属子项
                {(measureType === 'numeric' || measureType === 'repeat') && (
                  <span className="text-red-500 ml-1">*</span>
                )}
              </label>
              <select
                value={selectedSubItemId ?? ''}
                onChange={(e) => setSelectedSubItemId(e.target.value || null)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">事项级目标（不绑定子项）</option>
                {subItems.map(s => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
              {(measureType === 'numeric' || measureType === 'repeat') && !selectedSubItemId && (
                <p className="text-[10px] text-amber-500 mt-1">量化型和重复型目标建议绑定子项以精准匹配记录</p>
              )}
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
                  disabled={isAchieved && s !== '已放弃' && s !== '已暂停'}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    status === s
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  } ${isAchieved && s !== '已放弃' && s !== '已暂停' ? 'opacity-30 cursor-not-allowed' : ''}`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* 目标达成引导 */}
          {status === '已达成' && onGoalAchievedCreatePhase && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
              <p className="text-xs font-medium text-indigo-700 mb-2">目标已达成！要以此为新起点，创建一个新阶段吗？</p>
              <button
                type="button"
                onClick={onGoalAchievedCreatePhase}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors"
              >
                <Layers className="h-3.5 w-3.5" />
                创建新阶段
              </button>
            </div>
          )}
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
