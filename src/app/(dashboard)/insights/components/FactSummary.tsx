'use client';

import { useState } from 'react';
import { Lightbulb, Sparkles, Loader2, ExternalLink } from 'lucide-react';

interface FourAxesData {
  action_vs_goal: Array<{
    item_id: string;
    item_title: string;
    record_count: number;
    total_duration_minutes: number;
    has_goal: boolean;
    goal_title: string | null;
    goal_progress: number | null;
    deficit: number | null;
    deficit_unit: string | null;
  }>;
  time_vs_plan: {
    total_plans: number;
    completed_plans: number;
    completion_rate: number;
    overdue_plans: number;
  };
  effort_vs_result: {
    total_records_with_duration: number;
    total_hours: number;
    records_with_result: number;
    result_rate: number;
  };
  recent_time_summary: {
    total_hours_7d: number;
    total_hours_30d: number;
    change_percent: number | null;
    top_item_title: string | null;
    top_item_hours: number | null;
  };
}

interface PeriodComparisonData {
  this_week: { record_count: number; total_hours: number; total_cost: number };
  last_week: { record_count: number; total_hours: number; total_cost: number };
  this_month: { record_count: number; total_hours: number; total_cost: number };
  last_month: { record_count: number; total_hours: number; total_cost: number };
}

/** 结构化事实，带追溯信息 */
interface Fact {
  text: string;
  /** 追溯：时间范围 */
  timeScope: string;
  /** 追溯：数据来源描述 */
  source: string;
  /** 追溯：关联的事项ID（可跳转） */
  itemId?: string;
}

/** 纯规则生成事实总结（第一层，不依赖LLM） */
function generateFacts(
  axes: FourAxesData,
  comparison: PeriodComparisonData | null
): Fact[] {
  const facts: Fact[] = [];

  // === 行动vs目标 ===
  const withGoal = axes.action_vs_goal.filter(i => i.has_goal);
  const withoutGoal = axes.action_vs_goal.filter(i => !i.has_goal);

  // 目标接近完成的
  const nearDone = withGoal.filter(i => i.goal_progress !== null && i.goal_progress >= 80);
  nearDone.forEach(i => {
    facts.push({
      text: `🎯 ${i.item_title}的目标「${i.goal_title || '目标'}」已完成${i.goal_progress}%`,
      timeScope: '所选时段',
      source: `目标进度数据，${i.record_count}条关联记录`,
      itemId: i.item_id,
    });
  });

  // 目标进度缓慢的
  const slow = withGoal.filter(i => i.goal_progress !== null && i.goal_progress < 30 && i.record_count > 0);
  slow.forEach(i => {
    const detail = (i.deficit !== null && i.deficit_unit) ? `，还差${i.deficit.toLocaleString()}${i.deficit_unit}` : '';
    facts.push({
      text: `⚠️ ${i.item_title}目标进度仅${i.goal_progress}%${detail}`,
      timeScope: '所选时段',
      source: `目标进度数据，${i.record_count}条关联记录`,
      itemId: i.item_id,
    });
  });

  // 有行动但无目标
  if (withoutGoal.length > 0) {
    const names = withoutGoal.map(i => i.item_title).join('、');
    facts.push({
      text: `📋 ${names}尚无量化目标`,
      timeScope: '当前',
      source: '活跃事项目标关联查询',
    });
  }

  // 无行动的事项（活跃但无记录）
  const noAction = axes.action_vs_goal.filter(i => i.record_count === 0);
  if (noAction.length > 0) {
    const names = noAction.map(i => i.item_title).join('、');
    facts.push({
      text: `💤 ${names}在所选时段内无记录`,
      timeScope: '所选时段',
      source: '活跃事项记录统计',
    });
  }

  // === 时间vs计划 ===
  if (axes.time_vs_plan.total_plans > 0) {
    if (axes.time_vs_plan.completion_rate >= 80) {
      facts.push({
        text: `✅ 计划完成率${axes.time_vs_plan.completion_rate}%，执行力强`,
        timeScope: '所选时段',
        source: `${axes.time_vs_plan.completed_plans}/${axes.time_vs_plan.total_plans}个计划已完成`,
      });
    } else if (axes.time_vs_plan.completion_rate < 50) {
      facts.push({
        text: `⏳ 计划完成率仅${axes.time_vs_plan.completion_rate}%，多数计划未落实`,
        timeScope: '所选时段',
        source: `${axes.time_vs_plan.completed_plans}/${axes.time_vs_plan.total_plans}个计划已完成`,
      });
    } else {
      facts.push({
        text: `📊 计划完成率${axes.time_vs_plan.completion_rate}%，${axes.time_vs_plan.completed_plans}/${axes.time_vs_plan.total_plans}已完成`,
        timeScope: '所选时段',
        source: '计划类记录状态统计',
      });
    }
    if (axes.time_vs_plan.overdue_plans > 0) {
      facts.push({
        text: `🔴 ${axes.time_vs_plan.overdue_plans}个计划已过期未完成`,
        timeScope: '所选时段',
        source: '计划类记录过期状态',
      });
    }
  }

  // === 投入vs效果 ===
  if (axes.effort_vs_result.total_records_with_duration > 0) {
    if (axes.effort_vs_result.result_rate >= 70) {
      facts.push({
        text: `💡 投入产出比高：${axes.effort_vs_result.result_rate}%的记录有明确结果`,
        timeScope: '所选时段',
        source: `${axes.effort_vs_result.records_with_result}/${axes.effort_vs_result.total_records_with_duration}条有投入的记录`,
      });
    } else if (axes.effort_vs_result.result_rate < 30) {
      facts.push({
        text: `🔍 投入产出比低：仅${axes.effort_vs_result.result_rate}%的记录有结果`,
        timeScope: '所选时段',
        source: `${axes.effort_vs_result.records_with_result}/${axes.effort_vs_result.total_records_with_duration}条有投入的记录`,
      });
    } else {
      facts.push({
        text: `📝 ${axes.effort_vs_result.result_rate}%的投入记录有对应结果`,
        timeScope: '所选时段',
        source: '记录result字段统计',
      });
    }
  }

  // === 近期时间分布 ===
  if (axes.recent_time_summary.total_hours_7d > 0) {
    const avgPerDay = (axes.recent_time_summary.total_hours_7d / 7).toFixed(1);
    facts.push({
      text: `⏱️ 近7天日均投入${avgPerDay}h`,
      timeScope: '近7天',
      source: `总计${axes.recent_time_summary.total_hours_7d}h`,
    });
    if (axes.recent_time_summary.change_percent !== null) {
      const dir = axes.recent_time_summary.change_percent >= 0 ? '上升' : '下降';
      facts.push({
        text: `📈 周投入${dir}${Math.abs(axes.recent_time_summary.change_percent)}%`,
        timeScope: '近7天vs前7天',
        source: '周环比对比',
      });
    }
    if (axes.recent_time_summary.top_item_title) {
      facts.push({
        text: `🏆 近7天最多时间：${axes.recent_time_summary.top_item_title}（${axes.recent_time_summary.top_item_hours}h）`,
        timeScope: '近7天',
        source: '事项时长排名',
      });
    }
  }

  // === 周期对比 ===
  if (comparison) {
    const wDiff = comparison.this_week.total_hours - comparison.last_week.total_hours;
    if (Math.abs(wDiff) >= 1) {
      const dir = wDiff > 0 ? '多' : '少';
      facts.push({
        text: `📅 本周比上周${dir}${Math.abs(wDiff).toFixed(1)}h`,
        timeScope: '本周vs上周',
        source: `本周${comparison.this_week.total_hours}h / 上周${comparison.last_week.total_hours}h`,
      });
    }
    const mDiff = comparison.this_month.total_hours - comparison.last_month.total_hours;
    if (Math.abs(mDiff) >= 2) {
      const dir = mDiff > 0 ? '多' : '少';
      facts.push({
        text: `📆 本月比上月${dir}${Math.abs(mDiff).toFixed(1)}h`,
        timeScope: '本月vs上月',
        source: `本月${comparison.this_month.total_hours}h / 上月${comparison.last_month.total_hours}h`,
      });
    }
  }

  return facts;
}

interface FactSummaryProps {
  four_axes: FourAxesData;
  period_comparison: PeriodComparisonData | null;
}

export default function FactSummary({ four_axes, period_comparison }: FactSummaryProps) {
  const facts = generateFacts(four_axes, period_comparison);
  const [polished, setPolished] = useState<string | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [showTrace, setShowTrace] = useState(false);

  const handlePolish = async () => {
    if (polishing || facts.length === 0) return;
    setPolishing(true);
    try {
      const res = await fetch('/api/v2/insights/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facts: facts.map(f => f.text) }),
      });
      const json = await res.json();
      if (json.data?.polished) {
        setPolished(json.data.polished);
      }
    } catch {
      // 润色失败不影响展示
    } finally {
      setPolishing(false);
    }
  };

  if (facts.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-bold text-slate-700">事实总结</h3>
        <span className="text-[10px] text-slate-400 ml-auto">基于规则生成</span>
        <button
          onClick={() => setShowTrace(!showTrace)}
          className={`ml-1 text-[10px] px-2 py-0.5 rounded-full transition-colors ${showTrace ? 'bg-slate-100 text-slate-600' : 'bg-transparent text-slate-400 hover:bg-slate-50'}`}
        >
          {showTrace ? '隐藏依据' : '显示依据'}
        </button>
        <button
          onClick={handlePolish}
          disabled={polishing}
          className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-purple-50 text-purple-600 hover:bg-purple-100 disabled:opacity-50 transition-colors"
        >
          {polishing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {polishing ? '润色中...' : 'AI润色'}
        </button>
      </div>
      {polished ? (
        <div>
          <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{polished}</p>
          <button
            onClick={() => setPolished(null)}
            className="mt-2 text-[10px] text-slate-400 hover:text-slate-600"
          >
            查看原始事实列表
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {facts.map((fact, i) => (
            <li key={i}>
              <p className="text-xs text-slate-600 leading-relaxed">{fact.text}</p>
              {showTrace && (
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                  <span>时间：{fact.timeScope}</span>
                  <span className="text-slate-300">|</span>
                  <span>来源：{fact.source}</span>
                  {fact.itemId && (
                    <>
                      <span className="text-slate-300">|</span>
                      <a
                        href={`/items/${fact.itemId}`}
                        className="inline-flex items-center gap-0.5 text-blue-500 hover:text-blue-600"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        查看事项
                      </a>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
