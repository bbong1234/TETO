'use client';

import { useState } from 'react';
import { X, Save, Target, Loader2, AlertTriangle, Lightbulb, Pencil } from 'lucide-react';
import type { Goal, GoalStatus, GoalRuleType, GoalOperator, GoalPeriod, CreateGoalPayload, UpdateGoalPayload, SubItem, ParsedGoal, ParsedGoalSuggestion } from '@/types/teto';
import { GOAL_STATUSES, GOAL_RULE_TYPES, GOAL_OPERATORS, GOAL_PERIODS } from '@/types/teto';

interface GoalFormProps {
  goal?: Goal | null;
  /** 预设归属事项ID */
  itemId?: string | null;
  /** 预设归属阶段ID */
  phaseId?: string | null;
  /** 可选阶段列表 */
  phases?: { id: string; title: string }[];
  /** 可选子项列表 */
  subItems?: SubItem[];
  /** 预选子项ID */
  preselectedSubItemId?: string | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}

const RULE_TYPE_LABELS: Record<GoalRuleType, { label: string; icon: string; color: string }> = {
  '一次性完成': { label: '一次性完成', icon: '🎯', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  '周期性达成': { label: '周期性达成', icon: '🔄', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  '周期性限制': { label: '周期性限制', icon: '🚫', color: 'bg-red-50 text-red-700 border-red-200' },
};

export default function GoalForm({ goal, itemId, phaseId, phases, subItems, preselectedSubItemId, onClose, onSaved, onError }: GoalFormProps) {
  const isEditing = !!goal;
  const isCompleted = isEditing && goal?.status === '已完成';

  // ── 自然语言输入状态 ──
  const [inputText, setInputText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParsedGoal | null>(null);

  // ── 规则卡片状态 ──
  const [showRuleCard, setShowRuleCard] = useState(false);
  const [editingRule, setEditingRule] = useState(false);

  // ── 规则参数 ──
  const [ruleType, setRuleType] = useState<GoalRuleType>(goal?.rule_type || '一次性完成');
  const [operator, setOperator] = useState<GoalOperator>(goal?.operator || '>=');
  const [period, setPeriod] = useState<GoalPeriod | null>(goal?.period || null);
  const [targetMin, setTargetMin] = useState(goal?.target_min != null ? String(goal.target_min) : '');
  const [targetMax, setTargetMax] = useState(goal?.target_max != null ? String(goal.target_max) : '');
  const [metricName, setMetricName] = useState(goal?.metric_name || '');
  const [unit, setUnit] = useState(goal?.unit || '');
  const [deadline, setDeadline] = useState(goal?.deadline || '');
  const [startDate, setStartDate] = useState(goal?.start_date || '');
  const [selectedSubItemId, setSelectedSubItemId] = useState<string | null>(goal?.sub_item_id ?? preselectedSubItemId ?? null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(goal?.phase_id ?? phaseId ?? null);
  const [status, setStatus] = useState<GoalStatus>(goal?.status || '进行中');
  const [saving, setSaving] = useState(false);

  // 编辑已有目标时，直接显示规则卡片并展开编辑面板
  if (isEditing && !showRuleCard && !parseResult) {
    setShowRuleCard(true);
    setEditingRule(true);
  }

  // ── AI 解析 ──
  const handleParse = async () => {
    if (!inputText.trim()) return;
    setParsing(true);
    setParseResult(null);
    setShowRuleCard(false);

    try {
      const res = await fetch('/api/v2/goals/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal_text: inputText.trim(), item_id: itemId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '解析失败');

      const result: ParsedGoal = json.data;
      setParseResult(result);

      if (!result.is_fuzzy && result.parsed) {
        // 清晰目标：自动填入规则参数
        applyParsedSuggestion(result.parsed);
        setShowRuleCard(true);
      }
    } catch (err: any) {
      onError(err.message || 'AI 解析失败，请重试');
    } finally {
      setParsing(false);
    }
  };

  // ── 应用解析建议 ──
  const applyParsedSuggestion = (suggestion: ParsedGoalSuggestion) => {
    setRuleType(suggestion.rule_type);
    setOperator(suggestion.operator);
    setPeriod(suggestion.period);
    setTargetMin(suggestion.target_min != null ? String(suggestion.target_min) : '');
    setTargetMax(suggestion.target_max != null ? String(suggestion.target_max) : '');
    setMetricName(suggestion.metric_name || '');
    setUnit(suggestion.unit || '');
    setDeadline(suggestion.deadline || '');
    setShowRuleCard(true);
    setEditingRule(false);
  };

  // ── 保存 ──
  const handleSave = async () => {
    setSaving(true);
    try {
      if (isEditing && goal) {
        // 更新
        const payload: UpdateGoalPayload = isCompleted
          ? { status }
          : {
              title: inputText.trim() || goal.title,
              goal_text: inputText.trim() || goal.goal_text,
              status,
              rule_type: ruleType,
              operator,
              period,
              target_min: targetMin.trim() ? Number(targetMin) : null,
              target_max: targetMax.trim() ? Number(targetMax) : null,
              metric_name: metricName.trim() || null,
              unit: unit.trim() || null,
              start_date: startDate || null,
              deadline: deadline || null,
              sub_item_id: selectedSubItemId,
              phase_id: selectedPhaseId,
            };
        const res = await fetch(`/api/v2/goals/${goal.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || '更新失败');
        }
        onSaved();
      } else {
        // 创建
        const goalText = inputText.trim() || parseResult?.parsed?.goal_text || '';
        const payload: CreateGoalPayload = {
          title: goalText,
          goal_text: goalText,
          status: '进行中',
          item_id: itemId ?? undefined,
          phase_id: selectedPhaseId ?? undefined,
          sub_item_id: selectedSubItemId ?? undefined,
          rule_type: ruleType,
          operator,
          period,
          target_min: targetMin.trim() ? Number(targetMin) : null,
          target_max: targetMax.trim() ? Number(targetMax) : null,
          metric_name: metricName.trim() || null,
          unit: unit.trim() || null,
          start_date: startDate || null,
          deadline: deadline || null,
          source: '手动创建',
          confirmation_required: false,
        };
        const res = await fetch('/api/v2/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || '创建失败');
        }
        onSaved();
      }
    } catch (err: any) {
      onError(err.message || '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !showRuleCard) {
      e.preventDefault();
      handleParse();
    }
  };

  const ruleInfo = RULE_TYPE_LABELS[ruleType];

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
              {isEditing ? '编辑目标' : '设置目标'}
            </h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* 已完成目标提示 */}
          {isCompleted && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <p className="text-xs font-medium text-amber-700">此目标已完成，数据已锁定不可修改。仅可将状态回退为「放弃」或「暂停」。</p>
            </div>
          )}

          {/* ── 自然语言输入区 ── */}
          {!isEditing && (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-500">用自然语言描述你的目标</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder='如"每天背30个单词""6月前通过四级""每天刷抖音不超过30分钟"'
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                  disabled={parsing}
                />
                <button
                  onClick={handleParse}
                  disabled={parsing || !inputText.trim()}
                  className="shrink-0 rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
                >
                  {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : '解析'}
                </button>
              </div>
            </div>
          )}

          {/* 编辑模式下的标题输入 */}
          {isEditing && !isCompleted && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">目标标题</label>
              <input
                type="text"
                value={inputText || goal?.title || ''}
                onChange={(e) => setInputText(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={isCompleted}
              />
            </div>
          )}

          {/* ── 模糊目标提示 ── */}
          {parseResult?.is_fuzzy && (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-amber-700">这是一个模糊方向，不适合作为正式目标</p>
                    <p className="text-[10px] text-amber-600 mt-0.5">{parseResult.fuzzy_reason}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                  你可以选择一个具体目标：
                </div>
                {parseResult.suggestions.map((suggestion, idx) => {
                  const info = RULE_TYPE_LABELS[suggestion.rule_type];
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setInputText(suggestion.goal_text);
                        applyParsedSuggestion(suggestion);
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800">{suggestion.goal_text}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium border ${info.color}`}>
                          {info.icon} {info.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {suggestion.operator} {suggestion.target_min ?? suggestion.target_max ?? ''}{suggestion.unit ? ` ${suggestion.unit}` : ''}
                        {suggestion.period && suggestion.period !== '无' ? ` · ${suggestion.period}` : ''}
                        {suggestion.deadline ? ` · 截止 ${suggestion.deadline}` : ''}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 规则卡片 ── */}
          {showRuleCard && !isCompleted && (
            <div className="space-y-4">
              {/* 规则类型标签 */}
              <div className={`rounded-xl border p-4 ${ruleInfo.color}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{ruleInfo.icon}</span>
                    <span className="text-sm font-bold">{ruleInfo.label}</span>
                  </div>
                  <button onClick={() => setEditingRule(!editingRule)} className="flex items-center gap-1 rounded-md bg-white/60 px-2 py-1 text-[10px] font-medium hover:bg-white transition-colors">
                    <Pencil className="h-3 w-3" />
                    {editingRule ? '收起' : '修改规则'}
                  </button>
                </div>

                {/* 规则摘要 */}
                {!editingRule && (
                  <p className="mt-2 text-sm font-medium">
                    {period && period !== '无' ? `${period} ` : ''}
                    {operator === '<=' ? '不超过' : operator === '>=' ? '至少' : operator === 'complete' ? '' : operator}{' '}
                    {targetMin || targetMax || '—'}{unit ? ` ${unit}` : ''}
                    {deadline ? ` · 截止 ${deadline}` : ''}
                  </p>
                )}
              </div>

              {/* 编辑规则面板 */}
              {editingRule && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  {/* 规则类型 */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">规则类型</label>
                    <div className="flex gap-1.5">
                      {GOAL_RULE_TYPES.map(rt => {
                        const info = RULE_TYPE_LABELS[rt];
                        return (
                          <button key={rt} onClick={() => setRuleType(rt)} className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-medium border transition-colors ${ruleType === rt ? info.color : 'border-slate-200 bg-white text-slate-500'}`}>
                            {info.icon} {info.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 操作符 + 周期 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">操作符</label>
                      <select value={operator} onChange={(e) => setOperator(e.target.value as GoalOperator)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                        {GOAL_OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">周期</label>
                      <select value={period || '无'} onChange={(e) => setPeriod(e.target.value as GoalPeriod)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                        {GOAL_PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* 目标值 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">目标值 (下限)</label>
                      <input type="number" value={targetMin} onChange={(e) => setTargetMin(e.target.value)} placeholder="如 30" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    {(ruleType === '周期性限制' || operator === 'between') && (
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-slate-500">上限值</label>
                        <input type="number" value={targetMax} onChange={(e) => setTargetMax(e.target.value)} placeholder="如 30" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                    )}
                  </div>

                  {/* 指标名 + 单位 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">指标名</label>
                      <input type="text" value={metricName} onChange={(e) => setMetricName(e.target.value)} placeholder="如 背单词" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">单位</label>
                      <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="如 个、分钟" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                  </div>

                  {/* 日期 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">起算日期</label>
                      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">截止日期</label>
                      <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                  </div>
                </div>
              )}

              {/* 归属子项 */}
              {subItems && subItems.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">归属子项</label>
                  <select value={selectedSubItemId ?? ''} onChange={(e) => setSelectedSubItemId(e.target.value || null)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="">事项级目标</option>
                    {subItems.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </div>
              )}

              {/* 归属阶段 */}
              {phases && phases.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">归属阶段</label>
                  <select value={selectedPhaseId ?? ''} onChange={(e) => setSelectedPhaseId(e.target.value || null)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="">不绑定阶段</option>
                    {phases.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* ── 状态（编辑模式） ── */}
          {isEditing && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">状态</label>
              <div className="flex flex-wrap gap-1.5">
                {GOAL_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    disabled={isCompleted && s !== '放弃' && s !== '暂停'}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      status === s ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    } ${isCompleted && s !== '放弃' && s !== '暂停' ? 'opacity-30 cursor-not-allowed' : ''}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部保存按钮 */}
        {(showRuleCard || isEditing) && !isCompleted && (
          <div className="sticky bottom-0 border-t border-slate-200 bg-white px-5 py-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-600 disabled:bg-blue-300 transition-colors"
            >
              <Save className="h-4 w-4" />
              {saving ? '保存中...' : (isEditing ? '保存' : '确认创建')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
