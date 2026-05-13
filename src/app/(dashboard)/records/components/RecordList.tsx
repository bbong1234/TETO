'use client';

import type { Record } from '@/types/teto';
import RecordItem from './RecordItem';

function formatTimeShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 去除时间文本中的日期部分，只保留时间段信息
 *  "今天（2026-05-03）" → ""
 *  "今天下午" → "下午"
 *  "明天早上8点" → "早上8点"
 *  "早上" → "早上"（无变化）
 */
function stripDateFromTimeText(text: string): string {
  if (!text) return text;
  // 去除括号内的日期格式
  let result = text.replace(/[（(]\d{4}[-/]\d{1,2}[-/]\d{1,2}[）)]/g, '');
  // 去除前缀的日期引用词（保留后面的时间段）
  result = result.replace(/^(今天|明天|昨天|后天|前天|大后天|今日|明日|昨日)\s*/, '');
  return result.trim();
}

type SessionUi = { lifecycle?: string; errorMessage?: string | null };

function getSessionUi(rec: Record): SessionUi | undefined {
  const ps = rec.parsed_semantic as { _session_ui?: SessionUi } | null | undefined;
  return ps?._session_ui;
}

/** 计划时间投影：当 time_anchor_date 到达时，调整相对日期词 */
function adjustPlanTimeText(timeText: string, anchorDate: string | null | undefined, todayStr: string): string {
  if (!timeText || !anchorDate) return timeText;
  // 计算锚定日期与今天的偏移
  const anchor = new Date(anchorDate + 'T00:00:00');
  const today = new Date(todayStr + 'T00:00:00');
  const diffDays = Math.round((anchor.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  let result = timeText;
  if (diffDays === 0) {
    // 锚定日期就是今天 → "明天"变"今天"、"后天"变"明天"、"大后天"变"后天"
    result = result.replace('大后天', '后天').replace('后天', '明天').replace('明天', '今天');
  } else if (diffDays === 1) {
    // 锚定日期是明天 → "后天"变"明天"、"大后天"变"后天"
    result = result.replace('大后天', '后天').replace('后天', '明天');
  } else if (diffDays === -1) {
    // 锚定日期是昨天（过期计划）→ "今天"变"昨天"
    result = result.replace('今天', '昨天');
  }
  return result;
}

interface RecordListProps {
  records: Record[];
  onRecordClick: (record: Record) => void;
  onStarToggle: (record: Record) => void;
  compact?: boolean;
  aiPendingIds?: Set<string>;
  /** 多选模式 */
  selectionMode?: boolean;
  /** 已选中的 ID 集合 */
  selectedIds?: Set<string>;
  /** 切换选中 */
  onToggleSelect?: (id: string) => void;
  /** 完成计划 */
  onComplete?: (record: Record) => void;
  /** 推迟计划 */
  onPostpone?: (record: Record) => void;
  /** 取消计划 */
  onCancel?: (record: Record) => void;
  /** 想法转计划 */
  onConvertToPlan?: (record: Record) => void;
  /** 想法转事项 */
  onConvertToItem?: (record: Record) => void;
  /** 记录转目标 */
  onConvertToGoal?: (record: Record) => void;
}

export default function RecordList({ records, onRecordClick, onStarToggle, compact, aiPendingIds, selectionMode, selectedIds, onToggleSelect, onComplete, onPostpone, onCancel, onConvertToPlan, onConvertToItem, onConvertToGoal }: RecordListProps) {
  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <p className="text-sm">暂无记录</p>
        <p className="mt-1 text-xs">在上方输入框中快速记录</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* 时间线竖线 */}
      <div className="absolute left-[9px] top-3 bottom-3 w-0.5 bg-gradient-to-b from-blue-200 via-slate-200 to-transparent rounded-full" />

      <div className="space-y-2">
        {records.map((record) => {
          const sessionUi = getSessionUi(record);
          const isSessionCard = record.id.startsWith('session:');
          const isLegacyPending = record.id.startsWith('pending:') && !!aiPendingIds?.has(record.id);
          const isLegacyDefer = record.id.startsWith('defer:');
          // 获取今天的日期字符串（确保每次渲染都取最新）
          const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
          // 时间轴时间显示逻辑
          // inherited: 拆分记录继承的时间仅用于排序，不显示
          // fuzzy: 模糊时间段（如"早上"、"下午"），显示 time_text 而非假精确时间
          // 精确时间: 显示 HH:MM
          // 计划类型: 优先精确时间，其次时间段，最后日期引用（需去日期词）
          const isTimeInherited = record.time_precision === 'inherited';
          const isTimeFuzzy = record.time_precision === 'fuzzy';
          const time = isTimeInherited
            ? ''
            : isTimeFuzzy
              ? '' // fuzzy 时间不显示假精确 HH:MM
              : formatTimeShort(record.occurred_at);
          // fuzzy 时间段名称（如"早上"、"下午"）
          // 对计划记录：即使 fuzzy 也显示时间段（计划需要时间提示）
          let fuzzyTimeText = '';
          if (!time && isTimeFuzzy && record.time_text) {
            if (record.type === '计划') {
              // 计划：保留时间段部分（如"早上"），去除日期引用
              fuzzyTimeText = stripDateFromTimeText(record.time_text);
            } else {
              fuzzyTimeText = record.time_text;
            }
          }
          // 计划类型：无精确时间时用 time_text 显示时间段
          // 应用时间投影：锚定日期到达时，"明天"→"今天"等
          // 然后去除日期引用词，只保留时间段（如"下午"、"早上8点"）
          let planTimeText = '';
          if (!time && !fuzzyTimeText && record.type === '计划') {
            const rawTimeText = record.time_text || '';
            if (rawTimeText) {
              const adjusted = adjustPlanTimeText(rawTimeText, record.time_anchor_date, todayStr);
              planTimeText = stripDateFromTimeText(adjusted);
            }
          }
          // 计划记录回退：如果 time_text 只含日期引用（去后为空），尝试从 occurred_at 提取时间
          let fallbackPlanTime = '';
          if (record.type === '计划' && !time && !fuzzyTimeText && !planTimeText && record.occurred_at) {
            fallbackPlanTime = formatTimeShort(record.occurred_at);
          }
          // 计划记录最终兜底：不应出现时间完全不显示的情况
          // 当所有时间变量都为空时，从 time_text 或 time_anchor_date 提取可显示的信息
          let lastResortTime = '';
          if (record.type === '计划' && !time && !fuzzyTimeText && !planTimeText && !fallbackPlanTime) {
            const rawTimeText = record.time_text || '';
            if (rawTimeText) {
              // time_text 存在但被完全去除了（如纯日期引用"今天"）
              // 保留原始 time_text，总比什么都不显示好
              lastResortTime = rawTimeText;
            } else if (record.time_anchor_date) {
              // 无 time_text 但有锚定日期，显示相对日期
              const anchor = new Date(record.time_anchor_date + 'T00:00:00');
              const today = new Date(todayStr + 'T00:00:00');
              const diffDays = Math.round((anchor.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
              if (diffDays === 0) lastResortTime = '今天';
              else if (diffDays === 1) lastResortTime = '明天';
              else if (diffDays === -1) lastResortTime = '昨天';
              else if (diffDays === 2) lastResortTime = '后天';
              else lastResortTime = `${record.time_anchor_date.slice(5)}`;
            }
          }
          const sessionTimeline =
            isSessionCard && sessionUi?.lifecycle
              ? sessionUi.lifecycle === 'parsing'
                ? '解析中'
                : sessionUi.lifecycle === 'awaiting_confirmation'
                  ? '待确认'
                  : sessionUi.lifecycle === 'deferred'
                    ? '已收起'
                    : sessionUi.lifecycle === 'failed'
                      ? '失败'
                      : sessionUi.lifecycle === 'cancelled'
                        ? '已取消'
                        : ''
              : '';
          const legacyTimeline = isLegacyPending ? '解析中' : isLegacyDefer ? '待确认' : '';
          const displayTime =
            sessionTimeline ||
            legacyTimeline ||
            (time || fuzzyTimeText || planTimeText || fallbackPlanTime || lastResortTime);
          const isPeriodTime =
            !!sessionTimeline ||
            !!legacyTimeline ||
            !!(fuzzyTimeText || planTimeText || lastResortTime);
          const showParsingPulse =
            (isSessionCard && sessionUi?.lifecycle === 'parsing') || isLegacyPending;
          return (
            <div key={record.id} className="relative flex gap-2.5">
              {/* 时间线节点 */}
              <div className="relative z-10 flex flex-col items-center shrink-0 w-5 pt-2.5">
                <span className={`w-3 h-3 rounded-full border-2 border-white shadow-sm ${
                  record.type === '计划' ? 'bg-blue-400' :
                  record.type === '想法' ? 'bg-amber-400' :
                  record.type === '总结' ? 'bg-slate-400' :
                  'bg-green-400'
                }`} />
                {displayTime && (
                  <span className={`mt-1 text-[9px] font-medium leading-none whitespace-nowrap ${
                    isPeriodTime ? (record.type === '计划' ? 'text-blue-400' : 'text-slate-500') : 'text-slate-400'
                  }`}>
                    {displayTime}
                  </span>
                )}
              </div>
              {/* 卡片 */}
              <div className="flex-1 min-w-0">
                <RecordItem
                  record={record}
                  onClick={() => onRecordClick(record)}
                  onStarToggle={() => onStarToggle(record)}
                  compact={compact}
                  aiPending={showParsingPulse}
                  selectionMode={selectionMode}
                  selected={selectedIds?.has(record.id)}
                  onToggleSelect={() => onToggleSelect?.(record.id)}
                  onComplete={() => onComplete?.(record)}
                  onPostpone={() => onPostpone?.(record)}
                  onCancel={() => onCancel?.(record)}
                  onConvertToPlan={() => onConvertToPlan?.(record)}
                  onConvertToItem={() => onConvertToItem?.(record)}
                  onConvertToGoal={() => onConvertToGoal?.(record)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
