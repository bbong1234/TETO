'use client';

import {
  Split, CheckCircle2, X, Activity, DollarSign, Timer, BarChart3,
  Users, MapPin, Clock, Smile, Zap, Target, Heart, FolderOpen,
} from 'lucide-react';
import type { Item } from '@/types/teto';

interface SplitPreviewData {
  recordId: string;
  inputText: string;
  date: string;
  units: Array<Record<string, unknown>>;
  typeHints: string[];
  batchId: string;
}

interface SplitPreviewPanelProps {
  splitPreview: SplitPreviewData;
  items: Item[];
  onConfirm: () => void;
  onDismiss: () => void;
  onCancel: () => void;
}

export default function SplitPreviewPanel({
  splitPreview, items, onConfirm, onDismiss, onCancel,
}: SplitPreviewPanelProps) {
  return (
    <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <Split className="h-4 w-4 text-indigo-500 shrink-0" />
        <span className="text-xs font-semibold text-indigo-700">
          AI 检测到 {splitPreview.units.length} 条独立记录，确认后一次性创建
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {splitPreview.units.map((unit, i) => {
          const actionText = typeof unit.action_text === 'string' ? unit.action_text : '';
          const objectText = typeof unit.object_text === 'string' ? unit.object_text : '';
          const action = typeof unit.action === 'string' ? unit.action : '';
          const obj = typeof unit.object === 'string' ? unit.object : '';
          const mainText = typeof unit.main_text === 'string' ? unit.main_text : '';
          const eventText = typeof unit.event_text === 'string' ? unit.event_text : '';
          const causeText = typeof unit.cause_text === 'string' ? unit.cause_text : '';
          const resultText = typeof unit.result_text === 'string' ? unit.result_text : '';
          const cost = typeof unit.cost === 'number' ? unit.cost : (typeof unit.money_amount === 'number' ? unit.money_amount : null);
          const moneyDir = typeof unit.money_direction === 'string' ? unit.money_direction : null;
          const durationMin = typeof unit.duration_minutes === 'number' ? unit.duration_minutes : null;
          const location = typeof unit.location === 'string' ? unit.location : (typeof unit.place_text === 'string' ? unit.place_text : null);
          const timeText = typeof unit.time_text === 'string' ? unit.time_text : null;
          const people = Array.isArray(unit.people) ? (unit.people as unknown[]).filter((p): p is string => typeof p === 'string') : [];
          const mood = typeof unit.mood === 'string' ? unit.mood : null;
          const energy = typeof unit.energy === 'string' ? unit.energy : null;
          const bodyState = typeof unit.body_state === 'string' ? unit.body_state : null;
          const state = typeof unit.state === 'string' ? unit.state : null;
          const metric = unit.metric && typeof unit.metric === 'object' ? (unit.metric as Record<string, unknown>) : null;
          const itemHint = typeof unit.item_hint === 'string' ? unit.item_hint : null;
          const subItemHint = typeof unit.sub_item_hint === 'string' ? unit.sub_item_hint : null;
          const sharedCtx = Array.isArray(unit.shared_context) ? unit.shared_context as Array<{ field: string; value: unknown; raw: string }> : null;
          const fieldConf = unit.field_confidence as Record<string, string> | undefined;
          const hasGuess = fieldConf && Object.values(fieldConf).some(v => v === 'guess');

          const title = mainText
            || (actionText && objectText ? `${actionText} ${objectText}` : actionText)
            || (action && obj ? `${action}${obj}` : action)
            || `第${i + 1}条`;
          const typeHint = splitPreview.typeHints[i] || '发生';

          const hasContext = eventText || causeText || resultText;

          const hasOwnTime = !!timeText;
          const isInheritedTime = i > 0 && !hasOwnTime;
          const hasCapsules = cost != null || durationMin != null || metric
            || people.length > 0 || location || timeText || isInheritedTime
            || mood || energy || bodyState || state;

          const matchedItem = itemHint
            ? (items.find(it => it.title.toLowerCase() === itemHint.toLowerCase())
              || items.find(it => it.title.toLowerCase() === itemHint.toLowerCase().replace(/\s+/g, '')))
            : null;
          const itemDisplay = matchedItem
            ? matchedItem.title
            : (itemHint ? `${itemHint}（未匹配）` : null);

          return (
            <div key={i} className="rounded-lg bg-white border border-indigo-100 px-3 py-2 space-y-1.5">
              {/* L1: 标题行 */}
              <div className="flex items-center gap-1.5">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${
                  typeHint === '发生' ? 'bg-green-100 text-green-700' :
                  typeHint === '计划' ? 'bg-blue-100 text-blue-700' :
                  typeHint === '想法' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-600'
                }`}>{typeHint}</span>
                <span className="text-xs font-semibold text-slate-800">{title}</span>
                {hasGuess && (
                  <span className="inline-flex items-center shrink-0 text-amber-500" title="AI 对部分字段不确定">
                    <Activity className="h-3 w-3" />
                  </span>
                )}
              </div>

              {/* L2: 语境行 */}
              {hasContext && (
                <div className="text-[10px] text-slate-500 leading-snug">
                  {eventText && <span className="italic">{eventText}</span>}
                  {eventText && (causeText || resultText) && <span className="mx-1 text-slate-300">|</span>}
                  {causeText && resultText && <span>{causeText} → {resultText}</span>}
                  {causeText && !resultText && <span>原因：{causeText}</span>}
                  {!causeText && resultText && <span>结果：{resultText}</span>}
                </div>
              )}

              {/* L3: 胶囊行 */}
              {hasCapsules && (
                <div className="flex flex-wrap items-center gap-1">
                  {cost != null && cost > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-50 text-red-600">
                      <DollarSign className="h-2.5 w-2.5" />
                      ¥{cost}{moneyDir === 'income' ? ' 收入' : ''}
                    </span>
                  )}
                  {durationMin != null && durationMin > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-teal-50 text-teal-600">
                      <Timer className="h-2.5 w-2.5" />
                      {durationMin}分钟
                    </span>
                  )}
                  {metric && (
                    <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-purple-50 text-purple-600">
                      <BarChart3 className="h-2.5 w-2.5" />
                      {String(metric.value ?? '')}{String(metric.unit ?? '')} {String(metric.name ?? '')}
                    </span>
                  )}
                  {people.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-600">
                      <Users className="h-2.5 w-2.5" />
                      {people.join(', ')}
                    </span>
                  )}
                  {location && (
                    <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-cyan-50 text-cyan-600">
                      <MapPin className="h-2.5 w-2.5" />
                      {location}
                    </span>
                  )}
                  {timeText && (
                    <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600">
                      <Clock className="h-2.5 w-2.5" />
                      {timeText}
                    </span>
                  )}
                  {isInheritedTime && (
                    <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-50 text-slate-400">
                      <Clock className="h-2.5 w-2.5" />
                      随主记录
                    </span>
                  )}
                  {mood && (
                    <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-pink-50 text-pink-600">
                      <Smile className="h-2.5 w-2.5" />
                      {mood}
                    </span>
                  )}
                  {energy && (
                    <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-orange-50 text-orange-600">
                      <Zap className="h-2.5 w-2.5" />
                      {energy}
                    </span>
                  )}
                  {state && (
                    <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-600">
                      <Target className="h-2.5 w-2.5" />
                      {state}
                    </span>
                  )}
                  {bodyState && (
                    <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-rose-50 text-rose-600">
                      <Heart className="h-2.5 w-2.5" />
                      {bodyState}
                    </span>
                  )}
                </div>
              )}

              {/* L4: 事项行 */}
              <div className="flex items-center gap-1.5 text-[10px]">
                {itemDisplay ? (
                  <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 ${
                    matchedItem ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-500'
                  }`}>
                    <FolderOpen className="h-2.5 w-2.5" />
                    {itemDisplay}{subItemHint ? ` / ${subItemHint}` : ''}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-50 text-slate-400 px-2 py-0.5">
                    <FolderOpen className="h-2.5 w-2.5" />
                    无事项
                  </span>
                )}
                {sharedCtx && sharedCtx.length > 0 && (
                  <span className="text-amber-500 truncate">
                    共享：{sharedCtx.map(sc => sc.raw).join('、')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onConfirm}
          className="flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-indigo-600 transition-colors"
        >
          <CheckCircle2 className="h-3 w-3" />
          确认
        </button>
        <button
          onClick={onDismiss}
          className="flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-[11px] text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <X className="h-3 w-3" />
          不分割
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
