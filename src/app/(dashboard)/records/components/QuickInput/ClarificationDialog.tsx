'use client';

import { Activity, CheckCircle2 } from 'lucide-react';
import type { ClarificationNeeded } from '@/types/semantic';

interface ClarificationDialogProps {
  clarification: ClarificationNeeded;
  durationInputs: Record<string, string>;
  selectedClarifyOption: Record<string, string>;
  metricInputValues: Record<string, string>;
  onDurationInputsChange: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  onSelectedClarifyOptionChange: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  onMetricInputValuesChange: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onSkip: () => void;
}

export default function ClarificationDialog({
  clarification,
  durationInputs, selectedClarifyOption, metricInputValues,
  onDurationInputsChange, onSelectedClarifyOptionChange, onMetricInputValuesChange,
  onConfirm, onCancel,
}: ClarificationDialogProps) {
  return (
    <div
      className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-3 space-y-3"
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      tabIndex={0}
    >
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-amber-500 shrink-0" />
        <span className="text-xs font-semibold text-amber-700">
          AI 解析结果需要确认
        </span>
      </div>
      {/* 显示原始输入 */}
      {clarification.originalInput && (
        <div className="text-[11px] text-slate-600 bg-white/60 rounded px-2 py-1 border border-amber-100 truncate">
          <span className="text-amber-500 font-medium mr-1">原文:</span>{clarification.originalInput}
        </div>
      )}
      {clarification.issues.map((issue, idx) => (
        <div key={idx} className="space-y-2">
          {/* 原因说明 */}
          <div className="text-[10px] text-amber-600">
            原因：{issue.reason}
          </div>

          {/* 共享时长场景 */}
          {issue.type === 'shared_duration' && issue.sharedContext && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-slate-700">{issue.message}</div>
              <div className="flex items-center gap-2 text-[11px]">
                <input
                  type="number"
                  placeholder="分钟"
                  className="w-16 rounded border border-amber-200 bg-white px-1.5 py-0.5 text-[11px] focus:border-amber-400 focus:outline-none"
                  value={durationInputs[`${issue.unitIndex}_0`] || ''}
                  onChange={(e) => onDurationInputsChange(prev => ({ ...prev, [`${issue.unitIndex}_0`]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Tab') return; }}
                />
                <span className="text-slate-400">分钟，</span>
                <input
                  type="number"
                  placeholder="分钟"
                  className="w-16 rounded border border-amber-200 bg-white px-1.5 py-0.5 text-[11px] focus:border-amber-400 focus:outline-none"
                  value={durationInputs[`${issue.unitIndex}_1`] || ''}
                  onChange={(e) => onDurationInputsChange(prev => ({ ...prev, [`${issue.unitIndex}_1`]: e.target.value }))}
                />
                <span className="text-slate-400">分钟</span>
              </div>
              <div className="flex gap-2 text-[10px]">
                <button
                  className="rounded bg-amber-100 px-2 py-0.5 text-amber-700 hover:bg-amber-200 transition-colors"
                  onClick={() => {
                    const total = typeof issue.sharedContext!.value === 'number' ? issue.sharedContext!.value : 0;
                    const half = Math.round(total / 2);
                    onDurationInputsChange(prev => ({ ...prev, [`${issue.unitIndex}_0`]: String(half), [`${issue.unitIndex}_1`]: String(total - half) }));
                  }}
                >
                  平均分配：各 {typeof issue.sharedContext?.value === 'number' ? Math.round((issue.sharedContext.value as number) / 2) : '?'} 分钟
                </button>
              </div>
            </div>
          )}

          {/* 子项归属歧义场景 */}
          {issue.type === 'sub_item_ambiguous' && issue.options && (
            <div className="space-y-1">
              <div className="text-[11px] text-slate-700">{issue.message}</div>
              <div className="flex flex-col gap-1">
                {issue.options.map(opt => (
                  <label key={opt.value} className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name={`sub_item_${issue.unitIndex}`}
                      value={opt.value}
                      checked={selectedClarifyOption[`sub_item_${issue.unitIndex}`] === opt.value}
                      onChange={(e) => onSelectedClarifyOptionChange(prev => ({ ...prev, [`sub_item_${issue.unitIndex}`]: e.target.value }))}
                    />
                    {opt.label}
                  </label>
                ))}
                <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                  <input
                    type="radio"
                    name={`sub_item_${issue.unitIndex}`}
                    value="none"
                    checked={selectedClarifyOption[`sub_item_${issue.unitIndex}`] === 'none' || !selectedClarifyOption[`sub_item_${issue.unitIndex}`]}
                    onChange={(e) => onSelectedClarifyOptionChange(prev => ({ ...prev, [`sub_item_${issue.unitIndex}`]: e.target.value }))}
                  />
                  暂不选择
                </label>
              </div>
            </div>
          )}

          {/* 事项归属缺失场景 */}
          {issue.type === 'item_missing' && issue.options && (
            <div className="space-y-1">
              <div className="text-[11px] text-slate-700">{issue.message}</div>
              <div className="flex flex-col gap-1">
                {issue.options.map(opt => (
                  <label key={opt.value} className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name={`item_${issue.unitIndex}`}
                      value={opt.value}
                      checked={selectedClarifyOption[`item_${issue.unitIndex}`] === opt.value}
                      onChange={(e) => onSelectedClarifyOptionChange(prev => ({ ...prev, [`item_${issue.unitIndex}`]: e.target.value }))}
                    />
                    {opt.label}
                  </label>
                ))}
                <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                  <input
                    type="radio"
                    name={`item_${issue.unitIndex}`}
                    value="none"
                    checked={selectedClarifyOption[`item_${issue.unitIndex}`] === 'none' || !selectedClarifyOption[`item_${issue.unitIndex}`]}
                    onChange={(e) => onSelectedClarifyOptionChange(prev => ({ ...prev, [`item_${issue.unitIndex}`]: e.target.value }))}
                  />
                  不关联事项
                </label>
              </div>
            </div>
          )}

          {/* 事项建议场景 */}
          {issue.type === 'item_suggestion' && issue.options && (
            <div className="space-y-1">
              <div className="text-[11px] text-slate-700">{issue.message}</div>
              <div className="text-[10px] text-slate-400 mb-1">{issue.reason}</div>
              <div className="flex flex-col gap-1">
                {issue.options.map(opt => (
                  <label key={opt.value} className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name={`item_suggest_${issue.unitIndex}`}
                      value={opt.value}
                      checked={selectedClarifyOption[`item_suggest_${issue.unitIndex}`] === opt.value}
                      onChange={(e) => onSelectedClarifyOptionChange(prev => ({ ...prev, [`item_suggest_${issue.unitIndex}`]: e.target.value }))}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 量化目标提示场景 */}
          {issue.type === 'metric_prompt' && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-slate-700">{issue.message}</div>
              <div className="text-[10px] text-slate-400 mb-1">{issue.reason}</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder={issue.metricDailyTarget ? `日均目标: ${issue.metricDailyTarget}` : '输入数值'}
                  value={metricInputValues[`metric_${issue.metricGoalId || issue.unitIndex}`] || ''}
                  onChange={(e) => onMetricInputValuesChange(prev => ({ ...prev, [`metric_${issue.metricGoalId || issue.unitIndex}`]: e.target.value }))}
                  className="w-28 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                {issue.metricUnit && (
                  <span className="text-[11px] text-slate-400">{issue.metricUnit}</span>
                )}
                <button
                  onClick={() => onMetricInputValuesChange(prev => {
                    const next = { ...prev };
                    delete next[`metric_${issue.metricGoalId || issue.unitIndex}`];
                    return next;
                  })}
                  className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
                >
                  跳过
                </button>
              </div>
            </div>
          )}

          {/* 低置信度场景 */}
          {issue.type === 'low_confidence' && (
            <div className="space-y-1">
              <div className="text-[11px] text-slate-700">{issue.message}</div>
              <div className="flex gap-3 text-[11px]">
                <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name={`low_conf_${issue.unitIndex}`}
                    value="accept"
                    checked={selectedClarifyOption[`low_conf_${issue.unitIndex}`] !== 'reject'}
                    onChange={(e) => onSelectedClarifyOptionChange(prev => ({ ...prev, [`low_conf_${issue.unitIndex}`]: e.target.value }))}
                  />
                  按AI推测结果确认
                </label>
                <label className="flex items-center gap-1.5 text-slate-500 cursor-pointer">
                  <input
                    type="radio"
                    name={`low_conf_${issue.unitIndex}`}
                    value="reject"
                    checked={selectedClarifyOption[`low_conf_${issue.unitIndex}`] === 'reject'}
                    onChange={(e) => onSelectedClarifyOptionChange(prev => ({ ...prev, [`low_conf_${issue.unitIndex}`]: e.target.value }))}
                  />
                  忽略不确定字段
                </label>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onConfirm}
          className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-amber-600 transition-colors"
        >
          <CheckCircle2 className="h-3 w-3" />
          确认
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-[11px] text-slate-500 hover:bg-slate-50 transition-colors"
        >
          取消并重新编辑
        </button>
      </div>
    </div>
  );
}
