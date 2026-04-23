'use client';

import { Star, Clock, Tag, FolderOpen, BarChart3, Timer, MapPin, Users, Smile, Zap, Loader2, DollarSign, Check, CheckCircle2, CalendarClock } from 'lucide-react';
import type { Record } from '@/types/teto';
import type { ParsedSemantic } from '@/types/semantic';

// ================================
// 类型色板
// ================================
const TYPE_COLORS: { [key: string]: string } = {
  '发生': 'bg-green-100 text-green-700',
  '计划': 'bg-blue-100 text-blue-700',
  '想法': 'bg-amber-100 text-amber-700',
  '总结': 'bg-slate-100 text-slate-700',
};

// ================================
// 胶囊组件（统一渲染所有语义属性）
// ================================
function Capsule({ icon, children, color, isGuess }: { icon: React.ReactNode; children: React.ReactNode; color: string; isGuess?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${color} ${
      isGuess ? 'ring-1 ring-amber-300 ring-offset-1' : ''
    }`}>
      {isGuess && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-0.5" />}
      {icon}
      {children}
    </span>
  );
}

// ================================
// Props
// ================================
interface RecordItemProps {
  record: Record;
  onClick: () => void;
  onStarToggle: () => void;
  compact?: boolean;
  aiPending?: boolean;
  /** 多选模式 */
  selectionMode?: boolean;
  /** 当前是否被选中 */
  selected?: boolean;
  /** 切换选中 */
  onToggleSelect?: () => void;
  /** Todo 完成回调（仅计划类型 active 状态） */
  onComplete?: () => void;
  /** Todo 推迟回调（仅计划类型 active 状态） */
  onPostpone?: () => void;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ================================
// 主组件：严格三层结构
// ================================
export default function RecordItem({ record, onClick, onStarToggle, compact, aiPending, selectionMode, selected, onToggleSelect, onComplete, onPostpone }: RecordItemProps) {
  const timeDisplay = formatTime(record.occurred_at) || formatTime(record.created_at);
  const typeColor = TYPE_COLORS[record.type] || 'bg-slate-100 text-slate-700';

  // 置信度映射：判断哪些字段是 guess
  const fc = (record.parsed_semantic as ParsedSemantic | null | undefined)?.field_confidence;
  const isGuess = (field: string) => fc?.[field] === 'guess';

  // Todo 生命周期：计划类型 + active 状态才可操作
  const canLifecycleAction = record.type === '计划' && (!record.lifecycle_status || record.lifecycle_status === 'active');

  // 计划投影：如果记录类型是"计划"且有未来的 time_anchor_date，显示半透明效果
  const isPlanShadow = record.type === '计划' && record.time_anchor_date && record.time_anchor_date !== record.date;

  // 判断底部是否有任何胶囊需要渲染
  const hasCapsules =
    (record.cost != null && record.cost > 0) ||
    (record.people && record.people.length > 0) ||
    record.location ||
    record.mood ||
    record.energy ||
    (record.duration_minutes != null && record.duration_minutes > 0) ||
    record.metric_value != null ||
    (record.tags && record.tags.length > 0) ||
    aiPending;

  return (
    <div
      onClick={selectionMode ? onToggleSelect : onClick}
      className={`group cursor-pointer rounded-xl shadow-sm hover:shadow-md transition-shadow ${compact ? 'px-3 py-2' : 'px-4 py-3'} ${
        isPlanShadow ? 'bg-blue-50/60 border border-dashed border-blue-200'
          : selected ? 'bg-blue-50 border border-blue-300 ring-1 ring-blue-200'
          : 'bg-white'
      }`}
    >
      {/* 多选模式的勾选框 */}
      {selectionMode && (
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
            selected ? 'bg-blue-500 border-blue-500' : 'border-slate-300 bg-white'
          }`}>
            {selected && <Check className="h-3 w-3 text-white" />}
          </span>
          <span className="text-[10px] text-slate-400">点击选择</span>
        </div>
      )}
      {/* ======================= */}
      {/* Layer 1: TopBar（元数据行） */}
      {/* ======================= */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* 时间 */}
          {timeDisplay && (
            <span className="flex items-center gap-0.5 text-[11px] text-slate-400 shrink-0">
              <Clock className="h-3 w-3" />
              {timeDisplay}
            </span>
          )}
          {/* 类型 Badge */}
          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${typeColor}`}>
            {record.type}
          </span>
          {/* 关联事项 */}
          {record.item && (
            <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 truncate max-w-[140px]">
              <FolderOpen className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{record.item.title}</span>
            </span>
          )}
        </div>
        {/* 右侧操作区：生命周期按钮 + 星标 */}
        <div className="flex items-center gap-1 shrink-0">
          {/* 计划记录的完成/推迟图标按钮 */}
          {canLifecycleAction && !selectionMode && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onComplete?.(); }}
                className="p-1 rounded-lg text-green-500 hover:bg-green-50 hover:text-green-700 transition-colors"
                aria-label="完成计划"
                title="完成"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onPostpone?.(); }}
                className="p-1 rounded-lg text-amber-500 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                aria-label="推迟计划"
                title="推迟"
              >
                <CalendarClock className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {/* 星标 */}
          <button
            onClick={(e) => { e.stopPropagation(); onStarToggle(); }}
            className="shrink-0 p-0.5 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label={record.is_starred ? '取消星标' : '添加星标'}
          >
            <Star className={`h-3.5 w-3.5 ${record.is_starred ? 'fill-amber-400 text-amber-400' : 'text-slate-300 group-hover:text-slate-400'}`} />
          </button>
        </div>
      </div>

      {/* ======================= */}
      {/* Layer 2: Content（正文主干） */}
      {/* ======================= */}
      <p className={`${compact ? 'text-sm' : 'text-[15px]'} leading-relaxed text-slate-900 break-words`}>
        {record.content || record.raw_input || ''}
      </p>
      {/* 原始输入（当 AI 重写了 content 且与 raw_input 不同时显示） */}
      {record.raw_input && record.content && record.raw_input !== record.content && (
        <p className="mt-0.5 text-[11px] text-slate-400 italic break-words">
          原始：{record.raw_input}
        </p>
      )}

      {/* ======================= */}
      {/* Layer 3: BottomBar（语义胶囊） */}
      {/* ======================= */}
      {hasCapsules && (
        <div className={`flex flex-wrap items-center gap-1.5 ${compact ? 'mt-1.5' : 'mt-2'}`}>
          {/* 💰 花费 */}
          {record.cost != null && record.cost > 0 && (
            <Capsule icon={<DollarSign className="h-2.5 w-2.5" />} color="bg-red-50 text-red-600">
              ¥{record.cost.toFixed(2)}
            </Capsule>
          )}
          {/* 👥 人物 */}
          {record.people && record.people.length > 0 && (
            <Capsule icon={<Users className="h-2.5 w-2.5" />} color="bg-indigo-50 text-indigo-600" isGuess={isGuess('people')}>
              {record.people.join(', ')}
            </Capsule>
          )}
          {/* 📍 地点 */}
          {record.location && (
            <Capsule icon={<MapPin className="h-2.5 w-2.5" />} color="bg-cyan-50 text-cyan-600" isGuess={isGuess('location')}>
              {record.location}
            </Capsule>
          )}
          {/* 😊 心情 */}
          {record.mood && (
            <Capsule icon={<Smile className="h-2.5 w-2.5" />} color="bg-pink-50 text-pink-600" isGuess={isGuess('mood')}>
              {record.mood}
            </Capsule>
          )}
          {/* ⚡ 能量 */}
          {record.energy && (
            <Capsule icon={<Zap className="h-2.5 w-2.5" />} color="bg-orange-50 text-orange-600" isGuess={isGuess('energy')}>
              {record.energy}
            </Capsule>
          )}
          {/* ⏱ 时长 */}
          {record.duration_minutes != null && record.duration_minutes > 0 && (
            <Capsule icon={<Timer className="h-2.5 w-2.5" />} color="bg-teal-50 text-teal-600">
              {record.duration_minutes}分钟
            </Capsule>
          )}
          {/* 📊 指标 */}
          {record.metric_value != null && (
            <Capsule icon={<BarChart3 className="h-2.5 w-2.5" />} color="bg-purple-50 text-purple-600">
              {record.metric_name && `${record.metric_name} `}{record.metric_value}{record.metric_unit && ` ${record.metric_unit}`}
            </Capsule>
          )}
          {/* # 标签 */}
          {record.tags && record.tags.length > 0 && record.tags.map((tag) => (
            <Capsule key={tag.id} icon={<Tag className="h-2.5 w-2.5" />} color="bg-blue-50 text-blue-600">
              {tag.name}
            </Capsule>
          ))}
          {/* AI 处理中 */}
          {aiPending && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-500 animate-pulse">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              AI处理中
            </span>
          )}
        </div>
      )}

      {/* 非 active 状态的 lifecycle 标识 */}
      {record.lifecycle_status && record.lifecycle_status !== 'active' && record.type === '计划' && (
        <div className="mt-1.5 pt-1 border-t border-slate-100">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            record.lifecycle_status === 'completed' ? 'bg-green-50 text-green-600' :
            record.lifecycle_status === 'postponed' ? 'bg-amber-50 text-amber-600' :
            'bg-slate-50 text-slate-500'
          }`}>
            {record.lifecycle_status === 'completed' && <CheckCircle2 className="h-2.5 w-2.5" />}
            {record.lifecycle_status === 'postponed' && <CalendarClock className="h-2.5 w-2.5" />}
            {record.lifecycle_status === 'completed' ? '已完成' :
             record.lifecycle_status === 'postponed' ? '已推迟' :
             record.lifecycle_status === 'cancelled' ? '已取消' : record.lifecycle_status}
          </span>
        </div>
      )}
    </div>
  );
}
