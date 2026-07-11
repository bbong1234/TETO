'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Send, Square, ArrowRightLeft } from 'lucide-react';
import type { Item, Tag, Record as TetoRecord } from '@/types/teto';
import { formatActiveActivityTitle } from '@/lib/activity/recent-context';
import MentionPicker, { type MentionToken, type PickerSubItem } from './MentionPicker';
import { getChildItems, getItemPath, listLevel3ItemOptions } from '@/lib/activity/item-tree';
import { loadSubItemsForHosts } from '@/hooks/use-activity-context-data';
import type { SubItem } from '@/types/teto';
import {
  buildBlockItemSwitchSegmentLabel,
  buildBlockSegmentLabel,
} from '@/hooks/use-block-session-segments';
import type { BlockTimelineSegmentMeta } from '@/app/(dashboard)/records/components/BlockSessionTimeline';
import {
  buildBlockActionSegmentMeta,
  buildBlockItemSegmentMeta,
} from '@/lib/activity/block-tag-switch-rules';
import { buildUnitUpdate } from '@/lib/activity/build-unit-update';
import { postManualRecord } from '@/lib/activity/post-manual-record';
import { genTraceId } from '@/lib/observability/id-registry';
import { jsonHeadersWithTrace, parseClientApiJson } from '@/lib/observability/client-request';
import { isOptimisticRecordId } from '@/lib/activity/records-mutation';
import { resolveActivityRecordIdClient } from '@/lib/activity/activity-switch-pending';
import { fetchSessionEvents, postSessionEvent } from '@/lib/activity/activity-events-client';
import { inferEventTypeFromInput } from '@/lib/activity/event-aggregation';
import type { ActivityEvent } from '@/types/teto';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  status?: 'pending' | 'done' | 'error';
}

export interface InlineSwitchPayload {
  content?: string;
  item_id: string | null;
  sub_item_id: string | null;
  sub_item_title?: string | null;
  tag_ids: string[];
}

export interface ActionSwitchPayload {
  content: string;
  actionLabel: string;
  tag_ids: string[];
}

type PickerMode = 'switch' | null;

interface InlineMention {
  start: number;
  end: number;
  label: string;
  type: 'item' | 'function_tag' | 'sub_item';
  id: string;
  /** switch：切换事项; action：切换行动 */
  mode: 'switch' | 'action';
  /** sub_item 时的父 item_id */
  parentItemId?: string;
}

interface ActivityDialogChatProps {
  activity?: TetoRecord | null;
  items: Item[];
  /** 块时间展示：欢迎语、段标签等用合并后的当前段归属 */
  displayActivity?: TetoRecord | null;
  /** 拉取事项级动作标签时用的 item_id（块时间可能是 L2 而非 DB 上的大类） */
  attributionItemId?: string | null;
  /** 动作标签列表，用于 /切换 气泡选词（同时支持事项级标签） */
  functionTags?: Tag[];
  /** 近期使用的动作词，用于 /切换 建议（无对应 tag 对象） */
  recentActions?: string[];
  /** 块内历史事项顺序，优先展示 */
  recentItemIds?: string[];
  /** 块时间锁定的一类 categoryItemId；设置后 /切换 候选只展示该大类下的子事项（L2/L3）。换大类请用顶部「切换」按钮 */
  lockedCategoryItemId?: string | null;
  /** 块时间冻结态：等待第一条输入启动计时 */
  frozen?: boolean;
  /** 冻结态下锁定的事项 id（L1） */
  frozenItemId?: string | null;
  date: string;
  onActivityUpdated?: (record: TetoRecord) => void;
  onRecordSynced?: (record: TetoRecord) => void;
  onRecordAdded?: (record: TetoRecord, replaceOptimistic?: boolean) => void;
  onError?: (message: string) => void;
  /** 含 token 的消息提交时直接 inline switch */
  onInlineSwitch?: (payload: InlineSwitchPayload) => void;
  /** /行动名 提交时切换行动段（同事项） */
  onActionSwitch?: (payload: ActionSwitchPayload) => void;
  /** 冻结态第一条输入启动计时 */
  onFirstInput?: (content: string) => void;
  /** 块内时间轴追加段（由父级 ActiveState 维护） */
  onAppendBlockSegment?: (
    label: string,
    startMs?: number,
    meta?: BlockTimelineSegmentMeta
  ) => void;
  /** 嵌入计时卡片：无顶栏，由父级展示计时器 */
  embedded?: boolean;
  layout?: 'default' | 'panel';
  titleLine?: string;
  elapsedLabel?: string;
  actionLoading?: boolean;
  stopSubmitting?: boolean;
  onClose?: () => void;
  onSwitch?: () => void;
  onRequestStop?: () => void;
}

/** 内联 mention 高亮输入框：mirror div 在后，透明 textarea 在前 */
function MentionTextarea({
  inputRef,
  value,
  mention,
  placeholder,
  onChange,
  onKeyDown,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  mention: InlineMention | null;
  placeholder: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const SHARED = 'px-3 py-2 text-sm leading-relaxed' as const;

  const mentionClass = useMemo(() => {
    if (mention?.type === 'function_tag') return 'rounded bg-purple-100 text-purple-800 font-medium';
    if (mention?.type === 'sub_item') return 'rounded bg-emerald-100 text-emerald-800 font-medium';
    return 'rounded bg-blue-100 text-blue-800 font-medium';
  }, [mention?.type]);

  return (
    <div className="relative min-w-0 flex-1">
      {/* Mirror layer — shows highlight marks, pointer-events: none */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-lg ${SHARED}`}
        style={{ fontFamily: 'inherit' }}
      >
        {mention ? (
          <>
            <span>{value.slice(0, mention.start)}</span>
            <mark className={`not-italic ${mentionClass}`}>
              {value.slice(mention.start, mention.end)}
            </mark>
            <span>{value.slice(mention.end)}</span>
          </>
        ) : (
          // keep mirror height in sync even without mention
          <span style={{ visibility: 'hidden' }}>{value || ' '}</span>
        )}
      </div>

      {/* Actual textarea — transparent background when mention active so mirror shows */}
      <textarea
        ref={inputRef}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={`relative max-h-24 min-h-[36px] w-full resize-none rounded-lg border-0 outline-none ring-0 shadow-sm focus:ring-1 focus:ring-[#95ec69]/60 ${SHARED}`}
        style={{
          background: mention ? 'transparent' : 'white',
          color: mention ? 'transparent' : undefined,
          caretColor: 'rgb(15 23 42)',
          fontFamily: 'inherit',
        }}
      />
    </div>
  );
}

function buildConfirmationText(
  update: Record<string, unknown>,
  typeHint?: string
): string {
  if (typeHint === '想法') return '已为你插播一条想法';
  if (typeHint === '计划') return '已为你插播一条待办';

  const parts: string[] = [];
  if (typeof update.location === 'string' && update.location) {
    parts.push(`地点：${update.location}`);
  }
  if (typeof update.cost === 'number' && update.cost > 0) {
    parts.push(`金额：¥${update.cost}`);
  }
  if (typeof update.mood === 'string' && update.mood) {
    parts.push(`心情：${update.mood}`);
  }
  if (typeof update.body_state === 'string' && update.body_state) {
    parts.push(`身体：${update.body_state}`);
  }
  if (typeof update.result === 'string' && update.result) {
    parts.push(`进展：${update.result}`);
  }
  if (parts.length === 0) return '已记录';
  return `已记录 ${parts.join('，')}`;
}

function eventToMessage(ev: ActivityEvent): ChatMessage | null {
  const base = { id: `ev-${ev.id}`, status: 'done' as const };
  switch (ev.event_type) {
    case 'ai_user':
      return { ...base, role: 'user', text: ev.content };
    case 'ai_reply':
      return { ...base, role: 'assistant', text: ev.content };
    case 'progress':
      return { ...base, role: 'system', text: `进度 · ${ev.content}` };
    case 'milestone':
      return { ...base, role: 'system', text: `✅ 里程碑 · ${ev.content}` };
    case 'idea':
      return { ...base, role: 'system', text: `💡 想法 · ${ev.content}` };
    case 'plan':
      return { ...base, role: 'system', text: `📌 待办 · ${ev.content}` };
    case 'pause':
      return { ...base, role: 'system', text: ev.content ? `⏸ 暂停（${ev.content}）` : '⏸ 暂停' };
    case 'resume':
      return { ...base, role: 'system', text: '▶ 继续' };
    case 'sub_start':
      return { ...base, role: 'system', text: `↘ 插入：${ev.content}` };
    case 'sub_end':
      return { ...base, role: 'system', text: `↗ 结束插入：${ev.content}` };
    default:
      return null;
  }
}

async function resolveRecordId(activity: TetoRecord): Promise<string | null> {
  return resolveActivityRecordIdClient(activity);
}

function buildSegmentLabel(
  items: Item[],
  activity: TetoRecord,
  actionLabel?: string
): string {
  return buildBlockSegmentLabel(items, activity, actionLabel);
}

/** 从自由文本中解析最后一个 /切换xxx 模式，返回对应 mention */
function parseMentionFromText(
  text: string,
  items: Item[],
  functionTags: Tag[],
  subItems: PickerSubItem[] = []
): InlineMention | null {
  const match = text.match(/\/切换(\S+)/);
  if (!match || match.index == null) return null;
  const label = match[1];
  const start = match.index;
  const end = start + match[0].length;

  // 优先匹配三类 SubItem / L3 Item
  const sub = subItems.find((s) => s.title === label);
  if (sub)
    return {
      start,
      end,
      label,
      type: 'sub_item',
      id: sub.id,
      mode: 'switch',
      parentItemId: sub.parentItemId,
    };

  // 匹配事项（二类）
  const item = items.find((i) => i.title === label);
  if (item) return { start, end, label, type: 'item', id: item.id, mode: 'switch' };

  // 匹配职能标签（行动）
  const tag = functionTags.find((t) => t.name === label);
  if (tag) return { start, end, label, type: 'function_tag', id: tag.id, mode: 'action' };

  // 无精确匹配但有文本：返回占位
  if (label) return { start, end, label, type: 'item', id: '', mode: 'switch' };

  return null;
}

function ChatBubble({
  role,
  text,
  status,
}: {
  role: ChatMessage['role'];
  text: string;
  status?: ChatMessage['status'];
}) {
  if (role === 'system') {
    return (
      <div className="flex justify-center px-2">
        <span className="rounded-md bg-black/5 px-2 py-0.5 text-[11px] leading-relaxed text-slate-500">
          {text}
        </span>
      </div>
    );
  }

  const isUser = role === 'user';
  const isPending = status === 'pending';

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={[
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[10px] font-medium',
          isUser ? 'bg-[#95ec69] text-slate-700' : 'bg-white text-slate-500 shadow-sm',
        ].join(' ')}
        aria-hidden
      >
        {isUser ? '我' : 'AI'}
      </div>
      <div
        className={[
          'max-w-[75%] min-w-0 break-words px-3 py-2 text-sm leading-relaxed',
          isUser
            ? 'rounded-lg rounded-tr-sm bg-[#95ec69] text-slate-900'
            : 'rounded-lg rounded-tl-sm bg-white text-slate-800 shadow-sm',
          isPending ? 'flex items-center gap-1.5 text-xs text-slate-400' : '',
        ].join(' ')}
      >
        {isPending ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            {text}
          </>
        ) : (
          text
        )}
      </div>
    </div>
  );
}

function welcomeText(
  items: Item[],
  activity: TetoRecord,
  titleLine?: string
): string {
  const title = titleLine ?? formatActiveActivityTitle(items, activity);
  return `正在记录「${title}」`;
}

export default function ActivityDialogChat({
  activity,
  items,
  displayActivity,
  attributionItemId,
  functionTags = [],
  recentActions = [],
  recentItemIds = [],
  lockedCategoryItemId,
  frozen = false,
  frozenItemId,
  date,
  embedded = false,
  layout = 'default',
  titleLine,
  elapsedLabel,
  actionLoading = false,
  stopSubmitting = false,
  onActivityUpdated,
  onRecordSynced,
  onRecordAdded,
  onClose,
  onSwitch,
  onRequestStop,
  onError,
  onInlineSwitch,
  onActionSwitch,
  onFirstInput,
  onAppendBlockSegment,
}: ActivityDialogChatProps) {
  const labelActivity = displayActivity ?? activity;
  const frozenItem = frozenItemId ? items.find((i) => i.id === frozenItemId) : null;
  const frozenTitle = frozenItem?.title ?? '块时间';

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (frozen) {
      return [{ id: 'welcome', role: 'system', text: '说说你要做什么…' }];
    }
    if (!activity) return [];
    return [
      {
        id: 'welcome',
        role: 'system',
        text: welcomeText(items, labelActivity ?? activity, titleLine),
      },
    ];
  });
  const [input, setInput] = useState('');
  const [inlineMention, setInlineMention] = useState<InlineMention | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [pickerFilter, setPickerFilter] = useState('');
  const [pickerSubItems, setPickerSubItems] = useState<PickerSubItem[]>([]);
  // 当前事项下的历史动作标签（事项级别作用域）
  const [scopedActionTags, setScopedActionTags] = useState<Tag[]>([]);
  const scopedTagsForRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activityRef = useRef(activity);
  const queueRef = useRef<Array<{ assistantMsgId: string; text: string }>>([]);
  const processingRef = useRef(false);

  useEffect(() => {
    activityRef.current = activity;
    if (frozen || !activity || !labelActivity) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === 'welcome'
          ? {
              ...m,
              text: welcomeText(items, labelActivity, titleLine),
            }
          : m
      )
    );
  }, [activity, labelActivity, items, frozen, titleLine]);

  // 当事项切换时拉取该事项的历史动作标签（作用域限制）
  useEffect(() => {
    const itemId = attributionItemId ?? activity?.item_id ?? null;
    if (!itemId || scopedTagsForRef.current === itemId) return;
    scopedTagsForRef.current = itemId;
    void fetch(`/api/v2/items/${itemId}/function-tags`)
      .then((res) => res.json())
      .then((data: { data?: { frequent?: Tag[]; all?: Tag[] } }) => {
        const tags = [
          ...(data.data?.frequent ?? []),
          ...(data.data?.all ?? []).filter(
            (t) => !(data.data?.frequent ?? []).some((f) => f.id === t.id)
          ),
        ];
        setScopedActionTags(tags);
      })
      .catch(() => setScopedActionTags([]));
  }, [activity?.item_id, attributionItemId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const historyLoadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (frozen || !activity) return;
    const sessionId = activity.id;
    if (!sessionId || isOptimisticRecordId(sessionId)) return;
    if (historyLoadedFor.current === sessionId) return;
    historyLoadedFor.current = sessionId;

    let cancelled = false;
    void fetchSessionEvents(sessionId).then((events) => {
      if (cancelled || events.length === 0) return;
      const history = events.map(eventToMessage).filter((m): m is ChatMessage => m !== null);
      if (history.length === 0) return;
      setMessages((prev) => {
        const welcome = prev.find((m) => m.id === 'welcome');
        return welcome ? [welcome, ...history] : history;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [activity?.id, frozen]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const updateMessage = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  }, []);

  const processOneMessage = useCallback(
    async (assistantMsgId: string, trimmed: string) => {
      const traceId = genTraceId();
      const aiHdr = jsonHeadersWithTrace(traceId);
      const currentActivity = activityRef.current;
      if (!currentActivity) return;

      const persistSessionId = isOptimisticRecordId(currentActivity.id)
        ? null
        : currentActivity.id;
      const sessionCtxRef: { recent: ActivityEvent[] } = { recent: [] };
      if (persistSessionId) {
        void postSessionEvent({ sessionId: persistSessionId, eventType: 'ai_user', content: trimmed });
        sessionCtxRef.recent = await fetchSessionEvents(persistSessionId);
      }

      const recentContext = sessionCtxRef.recent
        .filter((e) => ['progress', 'milestone', 'idea', 'plan'].includes(e.event_type))
        .slice(-5)
        .map((e) => ({ content: e.content, type: '发生', occurred_at: e.occurred_at }));

      try {
        const parseRes = await fetch('/api/v2/parse', {
          method: 'POST',
          headers: aiHdr,
          body: JSON.stringify({
            input: trimmed,
            date,
            items: items.map((i) => ({ id: i.id, title: i.title })),
            ...(recentContext.length > 0 ? { recent_records: recentContext } : {}),
          }),
        });
        if (!parseRes.ok) {
          updateMessage(assistantMsgId, {
            text: '暂时无法理解，请换个说法试试',
            status: 'error',
          });
          return;
        }

        const parseJson = await parseRes.json();
        const env = parseClientApiJson(parseJson);
        const payload = env.data as {
          parsed: { units: Array<Record<string, unknown>> };
          type_hints: string[];
        } | undefined;
        const unit = payload?.parsed?.units?.[0];
        if (!unit) {
          updateMessage(assistantMsgId, {
            text: '没有识别到可记录的信息',
            status: 'error',
          });
          return;
        }

        const typeHint = payload?.type_hints?.[0];

        if (typeHint === '想法' || typeHint === '计划') {
          const content =
            (typeof unit.action_text === 'string' && unit.action_text) ||
            (typeof unit.event_text === 'string' && unit.event_text) ||
            trimmed;
          const created = await postManualRecord({
            content,
            type: typeHint,
            date,
            item_id: currentActivity.item_id ?? undefined,
            sub_item_id: currentActivity.sub_item_id ?? null,
            phase_id: currentActivity.phase_id ?? null,
            input_source: 'ai',
            review_status: 'confirmed',
            lifecycle_status: typeHint === '计划' ? 'active' : 'completed',
            time_anchor_date: typeHint === '计划' ? date : undefined,
          });
          onRecordAdded?.(created, false);
          if (persistSessionId) {
            void postSessionEvent({
              sessionId: persistSessionId,
              eventType: typeHint === '想法' ? 'idea' : 'plan',
              content,
              payload: { record_id: created.id },
            });
          }
          updateMessage(assistantMsgId, {
            text: buildConfirmationText({}, typeHint),
            status: 'done',
          });
          return;
        }

        const update = buildUnitUpdate(unit, typeHint);
        update.input_source = 'ai';
        update.review_status = 'confirmed';
        if (
          update.money_direction === undefined &&
          typeof update.cost === 'number' &&
          update.cost > 0
        ) {
          update.money_direction = 'expense';
          update.money_currency = 'CNY';
        }

        if (Object.keys(update).length === 0) {
          updateMessage(assistantMsgId, {
            text: '没有识别到可记录的信息',
            status: 'error',
          });
          return;
        }

        const currentForPatch = activityRef.current;
        if (!currentForPatch) return;
        const recordId = await resolveRecordId(currentForPatch);
        if (!recordId) {
          updateMessage(assistantMsgId, {
            text: '活动尚未同步，请稍后再试',
            status: 'error',
          });
          return;
        }

        const putRes = await fetch(`/api/v2/records/${recordId}`, {
          method: 'PUT',
          headers: aiHdr,
          body: JSON.stringify(update),
        });
        if (!putRes.ok) {
          updateMessage(assistantMsgId, { text: '保存失败，请重试', status: 'error' });
          onError?.('对话报备保存失败');
          return;
        }

        const putJson = await putRes.json();
        const updated = putJson.data as TetoRecord | undefined;
        if (updated) {
          activityRef.current = updated;
          onActivityUpdated?.(updated);
          onRecordSynced?.(updated);
        }

        if (persistSessionId) {
          const eventType = inferEventTypeFromInput(trimmed, typeHint);
          if (eventType === 'progress' || eventType === 'milestone') {
            void postSessionEvent({
              sessionId: persistSessionId,
              eventType,
              content: trimmed,
              payload: { item_id: currentActivity.item_id ?? null },
            });
          }
        }

        const confirmText = buildConfirmationText(update, typeHint);
        if (persistSessionId) {
          void postSessionEvent({ sessionId: persistSessionId, eventType: 'ai_reply', content: confirmText });
        }
        updateMessage(assistantMsgId, {
          text: confirmText,
          status: 'done',
        });
      } catch (e) {
        updateMessage(assistantMsgId, { text: '出错了，请重试', status: 'error' });
        onError?.(e instanceof Error ? e.message : '对话报备失败');
      }
    },
    [date, items, onActivityUpdated, onRecordSynced, onError, onRecordAdded, updateMessage]
  );

  const drainQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const job = queueRef.current.shift()!;
        await processOneMessage(job.assistantMsgId, job.text);
      }
    } finally {
      processingRef.current = false;
      if (queueRef.current.length > 0) {
        void drainQueue();
      }
    }
  }, [processOneMessage]);

  const handleTokenSelect = (token: MentionToken) => {
    // 找到当前触发位置（/切换 开头）
    const triggerText = '/切换';
    const triggerIdx = input.lastIndexOf(triggerText);
    const prefix = triggerIdx !== -1 ? input.slice(0, triggerIdx) : '';
    const insertText = `${triggerText}${token.label}`;
    const newValue = prefix + insertText;

    setInput(newValue);
    setInlineMention({
      start: prefix.length,
      end: prefix.length + insertText.length,
      label: token.label,
      type: token.type,
      id: token.id,
      mode: token.type === 'function_tag' ? 'action' : 'switch',
      parentItemId: token.parentItemId,
    });
    setShowPicker(false);
    setPickerFilter('');
    setPickerMode(null);
    inputRef.current?.focus();
  };

  const handleSubmit = () => {
    const trimmed = input.trim();

    if (frozen && onFirstInput) {
      if (!trimmed) return;
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: 'user', text: trimmed, status: 'done' },
      ]);
      setInput('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
      onFirstInput(trimmed);
      return;
    }

    // 处理内联 mention（/切换事项 或 /切换行动）
    const activeMention = inlineMention ?? parseMentionFromText(trimmed, items, functionTags, pickerSubItems);
    if (activeMention) {
      const extraContent = trimmed
        .slice(0, activeMention.start)
        .concat(trimmed.slice(activeMention.end))
        .trim();
      const nowMs = Date.now();
      const displayText = trimmed;

      if (activeMention.mode === 'switch' && onInlineSwitch) {
        if (effectiveCategoryId && activeMention.type === 'item') {
          const lockedChildren = getChildItems(items, effectiveCategoryId);
          const inLocked = lockedChildren.some((c) => c.id === activeMention.id);
          if (!inLocked) {
            setMessages((prev) => [
              ...prev,
              {
                id: `sys-lock-${nowMs}`,
                role: 'system',
                text: '⚠️ 块时间已锁定当前大类，不能切换到其他大类。',
              },
            ]);
            setInput('');
            setInlineMention(null);
            setShowPicker(false);
            if (inputRef.current) inputRef.current.style.height = 'auto';
            return;
          }
        }
        const label = activeMention.label;
        const switchItemId =
          activeMention.type === 'sub_item'
            ? (activeMention.parentItemId ?? null)
            : activeMention.type === 'item'
              ? activeMention.id
              : activityRef.current?.item_id ?? null;
        const switchSubItemId = activeMention.type === 'sub_item' ? activeMention.id : null;
        const inBlock = Boolean(lockedCategoryItemId);
        const segLabel = activityRef.current
          ? inBlock && switchItemId
            ? buildBlockItemSwitchSegmentLabel(
                items,
                switchItemId,
                switchSubItemId,
                switchSubItemId ? label : undefined
              )
            : buildBlockSegmentLabel(items, {
                ...activityRef.current,
                item_id: switchItemId,
                sub_item_id: switchSubItemId,
                content: extraContent || `切换到 ${label}`,
                tags: [],
              })
          : label;
        setMessages((prev) => [
          ...prev,
          { id: `user-${nowMs}`, role: 'user', text: displayText, status: 'done' },
          { id: `sys-${nowMs}`, role: 'system', text: `↘ 切换到 ${label}` },
        ]);
        setInput('');
        setInlineMention(null);
        setShowPicker(false);
        if (inputRef.current) inputRef.current.style.height = 'auto';
        onAppendBlockSegment?.(
          segLabel,
          nowMs,
          inBlock && switchItemId
            ? buildBlockItemSegmentMeta(switchItemId, switchSubItemId)
            : undefined
        );
        onInlineSwitch({
          ...(inBlock ? {} : { content: extraContent || `切换到 ${label}` }),
          item_id: switchItemId,
          sub_item_id: switchSubItemId,
          sub_item_title: switchSubItemId ? label : null,
          tag_ids: activeMention.type === 'function_tag' ? [activeMention.id] : [],
        });
        return;
      }

      if (activeMention.mode === 'action' && onActionSwitch && activityRef.current) {
        const inBlock = Boolean(lockedCategoryItemId);
        const baseActivity = labelActivity ?? activityRef.current;
        const segLabel = buildSegmentLabel(items, baseActivity, activeMention.label);
        const actionTagIds =
          activeMention.type === 'function_tag' ? [activeMention.id] : [];
        setMessages((prev) => [
          ...prev,
          { id: `user-${nowMs}`, role: 'user', text: displayText, status: 'done' },
          { id: `sys-${nowMs}`, role: 'system', text: `↘ 切换行动 ${activeMention.label}` },
        ]);
        setInput('');
        setInlineMention(null);
        setShowPicker(false);
        if (inputRef.current) inputRef.current.style.height = 'auto';
        onAppendBlockSegment?.(
          segLabel,
          nowMs,
          inBlock
            ? buildBlockActionSegmentMeta(baseActivity, activeMention.label, actionTagIds)
            : undefined
        );
        onActionSwitch({
          content: inBlock ? extraContent : extraContent || activeMention.label,
          actionLabel: activeMention.label,
          tag_ids: actionTagIds,
        });
        return;
      }
    }

    if (!trimmed) return;

    const userMsgId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const assistantMsgId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', text: trimmed, status: 'done' },
      {
        id: assistantMsgId,
        role: 'assistant',
        text: '理解中…',
        status: 'pending',
      },
    ]);
    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    queueRef.current.push({ assistantMsgId, text: trimmed });
    void drainQueue();
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;

    // 如果高亮 mention 被用户编辑到不再匹配，清除它
    if (inlineMention) {
      const current = value.slice(inlineMention.start, inlineMention.end);
      const expected = `/切换${inlineMention.label}`;
      if (current !== expected) {
        setInlineMention(null);
      }
    }

    const lastSwitchIdx = value.lastIndexOf('/切换');
    if (lastSwitchIdx !== -1) {
      const afterTrigger = value.slice(lastSwitchIdx + 3);
      setPickerFilter(afterTrigger.trim());
      setPickerMode('switch');
      setShowPicker(true);
      // 懒加载三类候选
      void loadPickerSubItems();
      return;
    }

    setShowPicker(false);
    setPickerFilter('');
    setPickerMode(null);
  };

  const loadPickerSubItems = useCallback(async () => {
    // 计算当前大类（复用与 effectiveCategoryId 相同的逻辑）
    const catId = lockedCategoryItemId
      ?? (activity?.item_id ? (getItemPath(items, activity.item_id)?.[0]?.id ?? null) : null);

    const l2Items = catId ? getChildItems(items, catId) : [];
    if (l2Items.length === 0) return;

    // L3 Items（已在 items 数组中，直接过滤）
    const l3AsPickerItems: PickerSubItem[] = l2Items.flatMap((l2) =>
      listLevel3ItemOptions(items, l2.id).map((l3) => ({
        id: l3.id,
        title: l3.title,
        parentItemId: l2.id,
        parentItemTitle: l2.title,
      }))
    );

    // SubItems（从 API 加载，使用共享缓存）
    const subsMap = await loadSubItemsForHosts(l2Items.map((l) => l.id));
    const subsAsPickerItems: PickerSubItem[] = l2Items.flatMap((l2) =>
      (subsMap.get(l2.id) ?? []).map((s: SubItem) => ({
        id: s.id,
        title: s.title,
        parentItemId: l2.id,
        parentItemTitle: l2.title,
      }))
    );

    setPickerSubItems([...l3AsPickerItems, ...subsAsPickerItems]);
  }, [lockedCategoryItemId, activity?.item_id, items]);

  const rootClass =
    layout === 'panel'
      ? 'flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#ededed] shadow-sm'
      : embedded
        ? 'flex shrink-0 flex-col overflow-hidden bg-[#ededed]'
        : 'flex max-h-[min(420px,48vh)] min-h-[260px] min-w-0 flex-col overflow-hidden bg-[#ededed]';

  // 推导当前会话的 L1 大类：优先使用外部锁定值，否则从 activity.item_id 路径取顶层
  const effectiveCategoryId = lockedCategoryItemId
    ?? (activity?.item_id
      ? (getItemPath(items, activity.item_id)?.[0]?.id ?? null)
      : null);

  // /切换 同时支持事项和行动（职能标签）
  const pickerItems = effectiveCategoryId
    ? getChildItems(items, effectiveCategoryId)
    : items;

  // 优先使用当前事项下的历史动作标签；无数据时回退到全局 functionTags
  const pickerTags = scopedActionTags.length > 0 ? scopedActionTags : functionTags;

  return (
    <div className={rootClass}>
      {layout === 'panel' && (
        <div className="shrink-0 border-b border-black/5 bg-[#f7f7f7] px-3 py-2">
          <p className="text-xs font-medium text-slate-600">
            {frozen ? `块时间 · ${frozenTitle}` : '实时报备'}
          </p>
        </div>
      )}

      {!embedded && layout !== 'panel' && titleLine && elapsedLabel && onClose && onSwitch && onRequestStop && (
        <div className="flex shrink-0 items-center gap-2 border-b border-black/5 bg-[#f7f7f7] px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm text-blue-600 hover:text-blue-700"
          >
            收起
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-medium text-slate-900">{titleLine}</p>
            <p className="text-[10px] tabular-nums text-slate-500">{elapsedLabel}</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              disabled={actionLoading}
              onClick={onSwitch}
              className="rounded-md p-1.5 text-slate-500 hover:bg-black/5 disabled:opacity-50"
              aria-label="切换"
            >
              <ArrowRightLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={actionLoading || stopSubmitting}
              onClick={onRequestStop}
              className="rounded-md p-1.5 text-slate-500 hover:bg-black/5 disabled:opacity-50"
              aria-label="停止"
            >
              {stopSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className={
          layout === 'panel'
            ? 'min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto px-3 py-2'
            : 'max-h-28 min-h-[72px] space-y-2 overflow-x-hidden overflow-y-auto px-3 py-2'
        }
      >
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            role={msg.role}
            text={msg.text}
            status={msg.status}
          />
        ))}
      </div>

      <div className="relative flex shrink-0 flex-col gap-1 bg-[#f7f7f7] px-3 py-2">
        {showPicker && (pickerItems.length > 0 || pickerTags.length > 0 || pickerSubItems.length > 0 || recentActions.length > 0) && (
          <MentionPicker
            items={pickerItems}
            functionTags={pickerTags}
            subItems={pickerSubItems}
            recentActions={recentActions}
            recentItemIds={recentItemIds}
            filterText={pickerFilter}
            mode="switch"
            onSelect={handleTokenSelect}
          />
        )}

        <div className="flex items-end gap-2">
          {/* Mirror div + transparent textarea for inline highlight */}
          <MentionTextarea
            inputRef={inputRef}
            value={input}
            mention={inlineMention}
            placeholder={frozen ? '说说你要做什么…' : '说点什么…或输入 /切换'}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && showPicker) {
                setShowPicker(false);
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <button
            type="button"
            disabled={!input.trim()}
            onClick={handleSubmit}
            className={[
              'mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40',
              input.trim() ? 'bg-[#07c160] text-white' : 'bg-slate-300 text-white',
            ].join(' ')}
            aria-label="发送"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
