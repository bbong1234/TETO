'use client';

import { Star, Tag, FolderOpen, BarChart3, Timer, MapPin, Users, Smile, Zap, Loader2, DollarSign, CheckCircle2, CalendarClock, HelpCircle, XCircle, Target, Flag, Clock } from 'lucide-react';
import type { Item, Record } from '@/types/teto';
import type { ParsedSemantic } from '@/types/semantic';
import { getItemPath } from '@/lib/activity/item-tree';

// ================================
// ????
// ================================
const TYPE_COLORS: { [key: string]: string } = {
  '发生': 'bg-green-100 text-green-700',
  '计划': 'bg-blue-100 text-blue-700',
  '想法': 'bg-amber-100 text-amber-700',
  '总结': 'bg-slate-100 text-slate-700',
};

/** ?????????? fallback ? '??' */
function getTypeColor(type: string): string {
  return TYPE_COLORS[type] || TYPE_COLORS['发生'];
}

// ================================
// ????????????????
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
  /** ??????????? L1?L2 ??? */
  allItems?: Item[];
  /** Todo ?????????? active ??? */
  onComplete?: () => void;
  /** Todo ?????????? active ??? */
  onPostpone?: () => void;
  /** Todo ?????????? active ??? */
  onCancel?: () => void;
  /** ???? */
  onConvertToPlan?: () => void;
  /** ???? */
  onConvertToItem?: () => void;
  /** ???? */
  onConvertToGoal?: () => void;
  /** ?? AI ??????? RecordList? */
  onConfirmClassification?: () => void;
}

// ================================
// ??????????
// ================================
export default function RecordItem({ record, onClick, onStarToggle, compact, aiPending, allItems, onComplete, onPostpone, onCancel, onConvertToPlan, onConvertToItem, onConvertToGoal, onConfirmClassification: _onConfirmClassification }: RecordItemProps) {
  const itemPathLabel = allItems && record.item_id
    ? getItemPath(allItems, record.item_id).map((i) => i.title).join(' ? ')
    : record.item?.title ?? null;
  const sessionUi = (
    record.parsed_semantic as { _session_ui?: { lifecycle?: string; errorMessage?: string | null } } | null | undefined
  )?._session_ui;
  const isSessionCard = record.id.startsWith('session:');
  const isSessionParsing = Boolean(isSessionCard && sessionUi?.lifecycle === 'parsing');
  const isSessionAwaiting = Boolean(isSessionCard && sessionUi?.lifecycle === 'awaiting_confirmation');
  const isSessionDeferred = Boolean(isSessionCard && sessionUi?.lifecycle === 'deferred');
  const isSessionFailed = Boolean(isSessionCard && sessionUi?.lifecycle === 'failed');
  const isLegacyParsing = record.id.startsWith('pending:');
  const isLegacyDefer = record.id.startsWith('defer:');

  const isParsingPlaceholder = isSessionParsing || isLegacyParsing;
  /** ? defer: ??????? / ??????????? */
  const isDeferLike = isLegacyDefer || isSessionAwaiting || isSessionDeferred;
  // ????????????? guess
  const parsed = record.parsed_semantic as ParsedSemantic | null | undefined;
  const fc = parsed?.field_confidence;
  const isGuess = (field: string) => fc?.[field] === 'guess';
  const lowConfidence = parsed?.confidence != null && parsed.confidence < 0.7;
  const needsClarification = !!(parsed as { needs_clarification?: boolean } | null)?.needs_clarification;

  const typeColor = getTypeColor(record.type);

  // Todo ????????? + active ??????
  const canLifecycleAction = record.type === '计划' && (!record.lifecycle_status || record.lifecycle_status === 'active');

  // ????????????"??"????? time_anchor_date????????
  const isPlanShadow = record.type === '计划' && record.time_anchor_date && record.time_anchor_date !== record.date;

  // ???????????????
  const hasCapsules =
    (record.cost != null && record.cost > 0) ||
    (record.people && record.people.length > 0) ||
    record.location ||
    record.mood ||
    record.energy ||
    (record.duration_minutes != null && record.duration_minutes > 0) ||
    record.metric_value != null ||
    (record.tags && record.tags.length > 0) ||
    (!!(record.occurred_at || record.occurred_at_end || record.time_text)) ||
    !!(record.goal_id || record.goal?.title) ||
    aiPending;

  return (
    <div
      onClick={onClick}
      className={`group rounded-xl shadow-sm transition-shadow ${
        isParsingPlaceholder ? 'cursor-default' : 'cursor-pointer hover:shadow-md'
      } ${compact ? 'px-3 py-2' : 'px-4 py-3'} ${
        isPlanShadow ? 'bg-blue-50/60 border border-dashed border-blue-200'
          : isSessionFailed ? 'bg-red-50/40 border border-red-100'
          : 'bg-white'
      }`}
    >
      {/* ======================= */}
      {/* Layer 1: TopBar?????? */}
      {/* ======================= */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* ?? Badge */}
          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0 ${typeColor}`}>
            {record.type}
          </span>
          {isSessionFailed && (
            <span className="inline-flex shrink-0 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-800 ring-1 ring-red-100">
              ??
            </span>
          )}
          {!isSessionFailed && isDeferLike && (
            <span className="inline-flex shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-100">
              {isSessionDeferred ? '???' : '???'}
            </span>
          )}
          {/* AI ?????? */}
          {lowConfidence && !needsClarification && (
            <span className="inline-flex items-center shrink-0 text-amber-500" title="AI ????????????????">
              <HelpCircle className="h-3.5 w-3.5" />
            </span>
          )}
          {/* ??????AI ???????????? */}
          {needsClarification && (
            <span className="inline-flex items-center shrink-0" title="AI ?????????????">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-white">
                <span className="text-[9px] font-bold">?</span>
              </span>
            </span>
          )}
          {/* ???? */}
          {record.item && itemPathLabel && (
            <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 truncate max-w-[160px]">
              <FolderOpen className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{itemPathLabel}</span>
            </span>
          )}
        </div>
        {/* ???????????? + ?? */}
        <div className="flex items-center gap-1 shrink-0">
          {/* ???????/?????? */}
          {canLifecycleAction && !isParsingPlaceholder && !isDeferLike && !isSessionFailed && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onComplete?.(); }}
                className="p-1 rounded-lg text-green-500 hover:bg-green-50 hover:text-green-700 transition-colors"
                aria-label="????"
                title="??"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onPostpone?.(); }}
                className="p-1 rounded-lg text-amber-500 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                aria-label="????"
                title="??"
              >
                <CalendarClock className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onCancel?.(); }}
                className="p-1 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                aria-label="????"
                title="??"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {/* ?? */}
          <button
            onClick={(e) => { e.stopPropagation(); onStarToggle(); }}
            disabled={isParsingPlaceholder || isDeferLike || isSessionFailed}
            className="shrink-0 p-0.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={record.is_starred ? '????' : '????'}
          >
            <Star className={`h-3.5 w-3.5 ${record.is_starred ? 'fill-amber-400 text-amber-400' : 'text-slate-300 group-hover:text-slate-400'}`} />
          </button>
          {/* ???? */}
          {onConvertToItem && !isParsingPlaceholder && !isDeferLike && !isSessionFailed && (
            <button
              onClick={(e) => { e.stopPropagation(); onConvertToItem(); }}
              className="shrink-0 p-0.5 rounded-lg hover:bg-violet-50 text-slate-300 hover:text-violet-500 transition-colors opacity-0 group-hover:opacity-100"
              aria-label="????"
              title="????"
            >
              <Target className="h-3.5 w-3.5" />
            </button>
          )}
          {/* ???? */}
          {onConvertToGoal && !isParsingPlaceholder && !isDeferLike && !isSessionFailed && (
            <button
              onClick={(e) => { e.stopPropagation(); onConvertToGoal(); }}
              className="shrink-0 p-0.5 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
              aria-label="????"
              title="????"
            >
              <Flag className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ======================= */}
      {/* Layer 2: Content?????? */}
      {/* ======================= */}
      <p className={`${compact ? 'text-sm' : 'text-[15px]'} font-medium leading-relaxed text-slate-900 break-words`}>
        {(record.content || '').trim() || (record.raw_input || '').trim() || ''}
      </p>
      {(() => {
        const main = (record.content || '').trim();
        const raw = (record.raw_input || '').trim();
        const showRaw =
          !isParsingPlaceholder && raw && main && raw !== main;
        return showRaw ? (
          <p className="mt-0.5 text-[11px] text-slate-400 leading-snug break-words">???{raw}</p>
        ) : null;
      })()}

      {/* ======================= */}
      {/* Layer 3: BottomBar?????? */}
      {/* ======================= */}
      {hasCapsules && (
        <div className={`flex flex-wrap items-center gap-1.5 ${compact ? 'mt-1.5' : 'mt-2'}`}>
          {/* ?? ?? */}
          {record.cost != null && record.cost > 0 && (
            <Capsule icon={<DollarSign className="h-2.5 w-2.5" />} color="bg-red-50 text-red-600">
              ?{record.cost.toFixed(2)}
            </Capsule>
          )}
          {/* ?? ?? */}
          {record.people && record.people.length > 0 && (
            <Capsule icon={<Users className="h-2.5 w-2.5" />} color="bg-indigo-50 text-indigo-600" isGuess={isGuess('people')}>
              {record.people.join(', ')}
            </Capsule>
          )}
          {/* ?? ?? */}
          {record.location && (
            <Capsule icon={<MapPin className="h-2.5 w-2.5" />} color="bg-cyan-50 text-cyan-600" isGuess={isGuess('location')}>
              {record.location}
            </Capsule>
          )}
          {/* ?? ?? */}
          {record.mood && (
            <Capsule icon={<Smile className="h-2.5 w-2.5" />} color="bg-pink-50 text-pink-600" isGuess={isGuess('mood')}>
              {record.mood}
            </Capsule>
          )}
          {/* ? ?? */}
          {record.energy && (
            <Capsule icon={<Zap className="h-2.5 w-2.5" />} color="bg-orange-50 text-orange-600" isGuess={isGuess('energy')}>
              {record.energy}
            </Capsule>
          )}
          {/* ?? ?? */}
          {(() => {
            const formatHm = (iso: string) =>
              new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            let label = '';
            if (record.occurred_at) {
              label = formatHm(record.occurred_at);
              if (record.occurred_at_end) label += `?${formatHm(record.occurred_at_end)}`;
            } else if (record.occurred_at_end) {
              label = formatHm(record.occurred_at_end);
            } else if (record.time_text) {
              label = record.time_text;
            }
            if (!label) return null;
            return (
              <Capsule icon={<Clock className="h-2.5 w-2.5" />} color="bg-blue-50 text-blue-600">
                {label}
              </Capsule>
            );
          })()}
          {/* ? ?? */}
          {record.duration_minutes != null && record.duration_minutes > 0 && (
            <Capsule icon={<Timer className="h-2.5 w-2.5" />} color="bg-teal-50 text-teal-600">
              {record.duration_minutes}??
            </Capsule>
          )}
          {/* ?? ?? */}
          {record.metric_value != null && (
            <Capsule icon={<BarChart3 className="h-2.5 w-2.5" />} color="bg-purple-50 text-purple-600">
              {record.metric_name && `${record.metric_name} `}{record.metric_value}{record.metric_unit && ` ${record.metric_unit}`}
            </Capsule>
          )}
          {/* ?? ???? */}
          {(record.goal?.title || record.goal_id) && (
            <Capsule icon={<Flag className="h-2.5 w-2.5" />} color="bg-indigo-50 text-indigo-600">
              {record.goal?.title || '?????'}
            </Capsule>
          )}
          {/* # ?? */}
          {record.tags && record.tags.length > 0 && record.tags.map((tag) => (
            <Capsule key={tag.id} icon={<Tag className="h-2.5 w-2.5" />} color="bg-blue-50 text-blue-600">
              {tag.name}
            </Capsule>
          ))}
          {/* AI ??? */}
          {aiPending && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-500 animate-pulse">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ???
            </span>
          )}
        </div>
      )}

      {/* ? active ??? lifecycle ?? */}
      {record.lifecycle_status && record.lifecycle_status !== 'active' && record.type === '计划' && (
        <div className="mt-1.5 pt-1 border-t border-slate-100">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            record.lifecycle_status === 'completed' ? 'bg-green-50 text-green-600' :
            record.lifecycle_status === 'postponed' ? 'bg-amber-50 text-amber-600' :
            'bg-slate-50 text-slate-500'
          }`}>
            {record.lifecycle_status === 'completed' && <CheckCircle2 className="h-2.5 w-2.5" />}
            {record.lifecycle_status === 'postponed' && <CalendarClock className="h-2.5 w-2.5" />}
            {record.lifecycle_status === 'completed' ? '???' :
             record.lifecycle_status === 'postponed' ? '???' :
             record.lifecycle_status === 'cancelled' ? '???' : record.lifecycle_status}
          </span>
        </div>
      )}
    </div>
  );
}
