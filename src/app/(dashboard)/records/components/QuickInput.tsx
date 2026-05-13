'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ChevronDown, ChevronUp, Clock, DollarSign, Timer, BarChart3, FolderOpen, X, Smile, Zap, Activity, Split, MapPin, Users, Layers, Sparkles } from 'lucide-react';
import type { Tag, Item, RecordType, SubItem } from '@/types/teto';
import type { PendingQuestion } from '@/types/inputs';
import type { OptimizeInputResult } from '@/types/semantic';
import { RECORD_TYPES } from '@/types/teto';
import { parseNaturalInput, ParsedInput } from '@/lib/utils/parseNaturalInput';
import ParsedChip, { type ChipData } from './QuickInput/ParsedChip';
import { genTraceId } from '@/lib/observability/id-registry';
import { jsonHeadersWithTrace, parseClientApiJson, formatErrorWithTrace } from '@/lib/observability/client-request';
import { resolveIngestV2ForClient } from '@/lib/ingest/ingest-v2';

export type IngestClarifyState = {
  inputId: string;
  unitId: string;
  question: PendingQuestion;
  rawContext: string;
  /** 与时间轴会话卡同一 stable id */
  client_session_id?: string;
  splitPreview?: Array<{
    type?: string;
    text: string;
    time?: string;
    ownerHint?: string;
  }>;
};

// ================================
// Props
// ================================

interface QuickInputProps {
  selectedDate: string;
  tags: Tag[];
  items: Item[];
  onRecordCreated: () => void;
  /** client_session_id 与 RecordsClient 中 session:${id} 对应 */
  onPendingCreated?: (clientSessionId: string, content: string, date: string) => void;
  onPendingResolved?: (clientSessionId: string) => void;
  onPendingSessionPatch?: (
    clientSessionId: string,
    patch: Partial<{
      lifecycle: 'parsing' | 'awaiting_confirmation' | 'deferred' | 'saved' | 'cancelled' | 'failed';
      inputId: string;
      clarifySnapshot: IngestClarifyState;
      errorMessage: string;
      rawContext: string;
    }>
  ) => void;
  /** 正式入库后按 inputId 移除会话卡（与 patch 互补） */
  onDeferResolved?: (inputId: string) => void;
  /** 父级点击时间轴会话卡：灌回澄清面板 */
  resumeClarify?: { nonce: number; snapshot: IngestClarifyState } | null;
  onResumeClarifyApplied?: () => void;
  onError: (message: string) => void;
}

// ================================
// 主组件
// ================================
const INGEST_CLARIFY_STORAGE_KEY = 'teto_records_ingest_clarify_v1';

export default function QuickInput({
  selectedDate,
  tags,
  items,
  onRecordCreated,
  onPendingCreated,
  onPendingResolved,
  onPendingSessionPatch,
  onDeferResolved,
  resumeClarify,
  onResumeClarifyApplied,
  onError,
}: QuickInputProps) {
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ParsedInput>({});
  const [type, setType] = useState<RecordType>('发生');
  const [content, setContent] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedSubItemId, setSelectedSubItemId] = useState<string>('');
  const [subItemsForSelectedItem, setSubItemsForSelectedItem] = useState<SubItem[]>([]);
  const [loadingSubItems, setLoadingSubItems] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [splitNotice, setSplitNotice] = useState<string | null>(null); // 拆分成功提示
  /** TETO 1.6：服务端 inputs 渐进澄清（一题一单） */
  const [ingestClarify, setIngestClarify] = useState<IngestClarifyState | null>(null);
  const [ingestBusy, setIngestBusy] = useState(false);
  const [ingestTextDraft, setIngestTextDraft] = useState('');
  const [optimizeLoading, setOptimizeLoading] = useState(false); // 优化输入加载中
  const [showParseDetail, setShowParseDetail] = useState(false); // 解析详情面板
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** 多条录入并行进入澄清时排队展示（避免后一条覆盖前一条） */
  const ingestClarifyQueueRef = useRef<IngestClarifyState[]>([]);
  /** 队列 ref 变更时触发 sessionStorage 同步（与 ingestClarify 解耦） */
  const [queueSig, setQueueSig] = useState(0);
  const bumpQueueSig = () => setQueueSig((s) => s + 1);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(INGEST_CLARIFY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        current: IngestClarifyState | null;
        queue: IngestClarifyState[];
      };
      if (Array.isArray(parsed.queue)) ingestClarifyQueueRef.current = parsed.queue;
      if (parsed.current) setIngestClarify(parsed.current);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        INGEST_CLARIFY_STORAGE_KEY,
        JSON.stringify({
          current: ingestClarify,
          queue: ingestClarifyQueueRef.current,
        })
      );
    } catch {
      /* ignore */
    }
  }, [ingestClarify, queueSig]);

  useEffect(() => {
    if (!resumeClarify) return;
    setIngestClarify(resumeClarify.snapshot);
    onResumeClarifyApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅响应父级 nonce 触发灌回
  }, [resumeClarify?.nonce]);

  // 选事项后，动态拉取该事项的子项列表
  useEffect(() => {
    if (!selectedItemId) {
      setSubItemsForSelectedItem([]);
      setSelectedSubItemId('');
      return;
    }
    setLoadingSubItems(true);
    fetch(`/api/v2/sub-items?item_id=${selectedItemId}`)
      .then(res => res.ok ? res.json() : { data: [] })
      .then(json => {
        const subs: SubItem[] = json.data || [];
        setSubItemsForSelectedItem(subs);
        // 如果当前选中的子项不在新事项的子项列表中，清空
        if (selectedSubItemId && !subs.find(s => s.id === selectedSubItemId)) {
          setSelectedSubItemId('');
        }
      })
      .catch(() => setSubItemsForSelectedItem([]))
      .finally(() => setLoadingSubItems(false));
  }, [selectedItemId]);

  const selectedItemIdRef = useRef(selectedItemId);
  selectedItemIdRef.current = selectedItemId;

  // ================================
  // 本地即时解析（debounce 300ms，纯本地，不调用 LLM）
  // ================================
  const triggerParse = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!text.trim()) {
      setParsed({});
      return;
    }
    debounceRef.current = setTimeout(() => {
      const matchItems = items.map(i => ({ id: i.id, title: i.title }));
      const result = parseNaturalInput(text, matchItems);
      setParsed(result);
      if (result.type_hint) setType(result.type_hint);
      // 不再自动 setSelectedItemId — 推荐的事项只作为 UI 提示展示
      // 用户必须手动选择才会生效，避免"开会"被错误归类到"英语"等误匹配
    }, 300);
  }, [items]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleTextChange = (text: string) => {
    setRawText(text);
    triggerParse(text);
  };

  // ================================
  // 构建芯片列表
  // ================================
  const chips: ChipData[] = [];
  if (parsed.cost !== undefined) {
    chips.push({ key: 'cost', label: '金额', value: `¥${parsed.cost}`, icon: <DollarSign className="h-2.5 w-2.5" /> });
  }
  if (parsed.duration !== undefined) {
    const h = Math.floor(parsed.duration / 60);
    const m = parsed.duration % 60;
    const display = h > 0 ? `${h}h${m > 0 ? m + 'min' : ''}` : `${m}分钟`;
    chips.push({ key: 'duration', label: '时长', value: display, icon: <Timer className="h-2.5 w-2.5" /> });
  }
  if (parsed.metric_value !== undefined) {
    const obj = parsed.metric_object ? `${parsed.metric_object} ` : '';
    chips.push({
      key: 'metric',
      label: '指标',
      value: `${obj}${parsed.metric_value}${parsed.metric_unit || ''}`,
      icon: <BarChart3 className="h-2.5 w-2.5" />,
    });
  }
  if (parsed.time_hint) {
    chips.push({ key: 'time', label: '时间', value: parsed.time_hint, icon: <Clock className="h-2.5 w-2.5" /> });
  }
  if (parsed.suggested_item_name) {
    chips.push({ key: 'item', label: '事项', value: parsed.suggested_item_name, icon: <FolderOpen className="h-2.5 w-2.5" /> });
  }
  if (parsed.mood_hint) {
    chips.push({ key: 'mood', label: '心情', value: parsed.mood_hint, icon: <Smile className="h-2.5 w-2.5" /> });
  }
  if (parsed.energy_hint) {
    chips.push({ key: 'energy', label: '能量', value: parsed.energy_hint, icon: <Zap className="h-2.5 w-2.5" /> });
  }
  if (parsed.status_hint) {
    chips.push({ key: 'status', label: '状态', value: parsed.status_hint, icon: <Activity className="h-2.5 w-2.5" /> });
  }
  if (parsed.location_hint) {
    chips.push({ key: 'location', label: '地点', value: parsed.location_hint, icon: <MapPin className="h-2.5 w-2.5" /> });
  }
  if (parsed.people_hint && parsed.people_hint.length > 0) {
    chips.push({ key: 'people', label: '关系人', value: parsed.people_hint.join(', '), icon: <Users className="h-2.5 w-2.5" /> });
  }
  if (parsed.date_hint) {
    chips.push({ key: 'dateAnchor', label: '日期', value: parsed.date_hint, icon: <Clock className="h-2.5 w-2.5" /> });
  }

  // ================================
  // 芯片编辑/删除
  // ================================
  const handleChipEdit = (key: string, value: string) => {
    const newParsed = { ...parsed };
    if (key === 'cost') {
      const num = parseFloat(value.replace(/[¥￥元块]/g, ''));
      if (!isNaN(num)) newParsed.cost = num;
    } else if (key === 'duration') {
      const num = parseFloat(value.replace(/[^0-9.]/g, ''));
      if (!isNaN(num)) newParsed.duration = Math.round(num);
    } else if (key === 'metric') {
      const num = parseFloat(value.replace(/[^0-9.]/g, ''));
      if (!isNaN(num)) newParsed.metric_value = num;
    } else if (key === 'time') {
      newParsed.time_hint = value;
    } else if (key === 'item') {
      const match = items.find(i => i.title === value);
      if (match) {
        newParsed.suggested_item_id = match.id;
        newParsed.suggested_item_name = match.title;
        setSelectedItemId(match.id);
      }
    } else if (key === 'mood') {
      newParsed.mood_hint = value;
    } else if (key === 'energy') {
      newParsed.energy_hint = value;
    } else if (key === 'status') {
      newParsed.status_hint = value;
    } else if (key === 'location') {
      newParsed.location_hint = value;
    } else if (key === 'people') {
      newParsed.people_hint = value.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
    }
    setParsed(newParsed);
  };

  const handleChipRemove = (key: string) => {
    const newParsed = { ...parsed };
    if (key === 'cost') delete newParsed.cost;
    else if (key === 'duration') delete newParsed.duration;
    else if (key === 'metric') {
      delete newParsed.metric_value;
      delete newParsed.metric_unit;
      delete newParsed.metric_object;
    }
    else if (key === 'mood') delete newParsed.mood_hint;
    else if (key === 'energy') delete newParsed.energy_hint;
    else if (key === 'status') delete newParsed.status_hint;
    else if (key === 'location') delete newParsed.location_hint;
    else if (key === 'people') delete newParsed.people_hint;
    else if (key === 'dateAnchor') { delete newParsed.date_hint; delete newParsed.time_anchor; }
    else if (key === 'time') delete newParsed.time_hint;
    else if (key === 'item') {
      delete newParsed.suggested_item_id;
      delete newParsed.suggested_item_name;
      setSelectedItemId('');
      setSelectedSubItemId('');
    }
    setParsed(newParsed);
  };

  // ================================
  // 优化输入：调用 AI 预处理模糊输入
  // ================================
  const handleOptimizeInput = async () => {
    if (!rawText.trim() || optimizeLoading) return;
    setOptimizeLoading(true);
    try {
      const res = await fetch('/api/v2/optimize-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: rawText.trim(), date: selectedDate }),
      });
      if (!res.ok) {
        const err = await res.json();
        onError(err.error || '优化输入失败');
        return;
      }
      const json = await res.json();
      if (!json?.data) {
        onError('优化输入返回空结果');
        return;
      }
      const result = json.data as OptimizeInputResult;
      const lines = result.optimized_lines.filter(l => l.text.trim());

      // 空结果兜底
      if (lines.length === 0) {
        onError('优化返回空结果，请直接提交');
        return;
      }

      // 输入已清晰：单行且文本与原文相同，不需要修改
      if (result.fuzzy_type === null && lines.length === 1 && lines[0].text.trim() === rawText.trim()) {
        setSplitNotice('输入已清晰，无需优化');
        setTimeout(() => setSplitNotice(null), 3000);
        return;
      }

      // 直接替换文本框内容
      const optimizedText = lines.map(l => l.text.trim()).join('\n');
      setRawText(optimizedText);
      triggerParse(optimizedText);

      // 单行时设置类型
      if (lines.length === 1 && lines[0].type_hint) {
        setType(lines[0].type_hint);
      }

      // 显示简短提示
      if (lines.length > 1) {
        setSplitNotice(`已优化为 ${lines.length} 条清晰记录，点击提交保存`);
      } else {
        setSplitNotice('已优化输入');
      }
      setTimeout(() => setSplitNotice(null), 4000);
    } catch {
      onError('优化输入请求失败，请重试');
    } finally {
      setOptimizeLoading(false);
    }
  };

  // ================================
  // 重置输入状态
  // ================================
  const resetState = () => {
    ingestClarifyQueueRef.current = [];
    bumpQueueSig();
    setRawText('');
    setParsed({});
    setType('发生');
    setContent('');
    setSelectedItemId('');
    setSelectedSubItemId('');
    setSubItemsForSelectedItem([]);
    setSelectedTagIds([]);
    setExpanded(false);
    setIngestClarify(null);
    setIngestTextDraft('');
  };

  /** 仅清空当前录入草稿，不关闭正在进行的澄清面板、不清队 */
  const resetSubmitDraft = () => {
    setRawText('');
    setParsed({});
    setType('发生');
    setContent('');
    setSelectedItemId('');
    setSelectedSubItemId('');
    setSubItemsForSelectedItem([]);
    setSelectedTagIds([]);
    setExpanded(false);
    setIngestTextDraft('');
  };

  const closeCurrentClarifyOrShowNext = (): IngestClarifyState | null => {
    const next = ingestClarifyQueueRef.current.shift() ?? null;
    setIngestClarify(next);
    bumpQueueSig();
    return next;
  };

  useEffect(() => {
    setIngestTextDraft('');
  }, [ingestClarify?.unitId, ingestClarify?.question?.field]);
  const cancelIngestFlow = async () => {
    if (!ingestClarify || ingestBusy) return;
    const cancelledInputId = ingestClarify.inputId;
    const sid = ingestClarify.client_session_id;
    setIngestBusy(true);
    const tid = genTraceId();
    try {
      await fetch(`/api/v2/inputs/${ingestClarify.inputId}/cancel`, {
        method: 'POST',
        headers: jsonHeadersWithTrace(tid),
      });
    } catch {
      /* 仍关闭本地卡片 */
    } finally {
      closeCurrentClarifyOrShowNext();
      if (sid) onPendingSessionPatch?.(sid, { lifecycle: 'cancelled' });
      setIngestBusy(false);
    }
  };

  const submitIngestClarify = async (answer: string | number | null) => {
    if (!ingestClarify || ingestBusy) return;
    const { inputId, unitId, question } = ingestClarify;
    setIngestBusy(true);
    const tid = genTraceId();
    try {
      const res = await fetch(`/api/v2/inputs/${inputId}/answer`, {
        method: 'POST',
        headers: jsonHeadersWithTrace(tid),
        body: JSON.stringify({ unit_id: unitId, field: question.field, answer }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const pe = parseClientApiJson(json);
        onError(formatErrorWithTrace(pe.message ?? '提交失败', pe.traceId));
        if (ingestClarify.client_session_id) {
          onPendingSessionPatch?.(ingestClarify.client_session_id, {
            lifecycle: 'failed',
            errorMessage: pe.message ?? '提交失败',
          });
        }
        return;
      }
      const env = parseClientApiJson(json);
      const d = env.data as {
        next?: { unit_id: string; question: PendingQuestion } | null;
        promoted_record_id?: string | null;
        promoted_record_ids?: string[] | null;
        input_status?: string;
        deferred?: boolean;
      } | undefined;
      if (d?.deferred) {
        const snap = ingestClarify ? { ...ingestClarify } : null;
        closeCurrentClarifyOrShowNext();
        if (snap?.client_session_id) {
          onPendingSessionPatch?.(snap.client_session_id, {
            lifecycle: 'deferred',
            clarifySnapshot: snap,
            rawContext: snap.rawContext,
          });
        }
        setSplitNotice('已暂存待确认，可在时间轴同一张会话卡上点击继续处理。');
        setTimeout(() => setSplitNotice(null), 8000);
      } else if (d?.next) {
        setIngestClarify((prev) =>
          prev
            ? {
                ...prev,
                unitId: d.next!.unit_id,
                question: d.next!.question,
                client_session_id: prev.client_session_id,
              }
            : null
        );
      } else {
        if ((d?.promoted_record_ids && d.promoted_record_ids.length > 0) || d?.promoted_record_id) {
          onRecordCreated();
          if (ingestClarify.client_session_id) onPendingResolved?.(ingestClarify.client_session_id);
          onDeferResolved?.(inputId);
        } else if (d?.input_status === 'cancelled' && ingestClarify.client_session_id) {
          onPendingResolved?.(ingestClarify.client_session_id);
          onDeferResolved?.(inputId);
        }
        const nextPanel = closeCurrentClarifyOrShowNext();
        if (d?.input_status !== 'cancelled' && !nextPanel) {
          resetState();
        }
      }
    } finally {
      setIngestBusy(false);
    }
  };

  const skipIngestClarify = async () => {
    if (!ingestClarify || ingestBusy) return;
    const { inputId, unitId, question } = ingestClarify;
    setIngestBusy(true);
    const tid = genTraceId();
    try {
      const res = await fetch(`/api/v2/inputs/${inputId}/skip`, {
        method: 'POST',
        headers: jsonHeadersWithTrace(tid),
        body: JSON.stringify({ unit_id: unitId, field: question.field }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const pe = parseClientApiJson(json);
        onError(formatErrorWithTrace(pe.message ?? '跳过失败', pe.traceId));
        if (ingestClarify.client_session_id) {
          onPendingSessionPatch?.(ingestClarify.client_session_id, {
            lifecycle: 'failed',
            errorMessage: pe.message ?? '跳过失败',
          });
        }
        return;
      }
      const env = parseClientApiJson(json);
      const d = env.data as {
        next?: { unit_id: string; question: PendingQuestion } | null;
        promoted_record_id?: string | null;
      } | undefined;
      if (d?.promoted_record_id) {
        onRecordCreated();
        if (ingestClarify.client_session_id) onPendingResolved?.(ingestClarify.client_session_id);
        onDeferResolved?.(inputId);
      }
      if (d?.next) {
        setIngestClarify((prev) =>
          prev
            ? {
                ...prev,
                unitId: d.next!.unit_id,
                question: d.next!.question,
                client_session_id: prev.client_session_id,
              }
            : null
        );
      } else {
        const nextPanel = closeCurrentClarifyOrShowNext();
        if (!nextPanel) resetState();
      }
    } finally {
      setIngestBusy(false);
    }
  };

  // ================================
  // 提交保存（即时清空草稿；网络解析后台执行，不阻塞下一次发送）
  // ================================
  type PostInputPayload = {
    input: { id: string; status: string };
    pending: { unit_id: string; question: PendingQuestion } | null;
    units?: Array<{
      unit_index?: number;
      unit_text?: string | null;
      classifier_decision?: {
        content_summary?: string;
        proposed_fields?: {
          type?: string;
          time_text?: string;
          occurred_at?: string;
          time_anchor_date?: string;
          item_id?: string;
          sub_item_id?: string;
        };
      };
    }>;
    promoted_record_ids: string[];
  };

  const buildClarifyFromPostResponse = (
    d: PostInputPayload,
    line: string,
    itemList: Item[],
    clientSessionId: string
  ): IngestClarifyState => {
    const splitPreview =
      d.pending?.question.clarify_class === 'compound_confirm' && Array.isArray(d.units)
        ? [...d.units]
            .sort((a, b) => (a.unit_index ?? 0) - (b.unit_index ?? 0))
            .map((u) => ({
              type: u.classifier_decision?.proposed_fields?.type,
              text: (u.classifier_decision?.content_summary || u.unit_text || '').trim(),
              time:
                u.classifier_decision?.proposed_fields?.time_text ||
                u.classifier_decision?.proposed_fields?.occurred_at ||
                u.classifier_decision?.proposed_fields?.time_anchor_date,
              ownerHint: (() => {
                const itemId = u.classifier_decision?.proposed_fields?.item_id;
                const subItemId = u.classifier_decision?.proposed_fields?.sub_item_id;
                if (subItemId) return `归属子项 ${subItemId}`;
                if (itemId) {
                  const matched = itemList.find((it) => it.id === itemId);
                  return matched ? `归属事项 ${matched.title}` : `归属事项 ${itemId}`;
                }
                return '未指定归属';
              })(),
            }))
            .filter((u) => u.text.length > 0)
        : undefined;
    return {
      inputId: d.input.id,
      unitId: d.pending!.unit_id,
      question: d.pending!.question,
      rawContext: line,
      client_session_id: clientSessionId,
      splitPreview,
    };
  };

  const runIngestJob = async (params: {
    submitTraceId: string;
    linesToProcess: string[];
    pendingTokens: Array<{ sessionId: string; line: string }>;
    capturedDate: string;
    capturedType: RecordType;
    capturedItemId: string;
    capturedSubItemId: string;
    capturedTagIds: string[];
    itemList: Item[];
  }) => {
    const {
      submitTraceId,
      linesToProcess,
      pendingTokens,
      capturedDate,
      capturedType,
      capturedItemId,
      capturedSubItemId,
      capturedTagIds,
      itemList,
    } = params;
    const traceHdr = () => jsonHeadersWithTrace(submitTraceId);
    const processedSessionIds = new Set<string>();
    let pendingClarify: IngestClarifyState | null = null;

    try {
      for (let i = 0; i < linesToProcess.length; i++) {
        const line = linesToProcess[i];
        const token = pendingTokens[i];
        const res = await fetch('/api/v2/inputs', {
          method: 'POST',
          headers: traceHdr(),
          body: JSON.stringify({
            raw_input: line,
            source: 'quick',
            metadata: {
              date: capturedDate,
              client_time: new Date().toISOString(),
              seed_fields: {
                type: capturedType,
                ...(capturedItemId ? { item_id: capturedItemId } : {}),
                ...(capturedSubItemId ? { sub_item_id: capturedSubItemId } : {}),
                ...(capturedTagIds.length > 0 ? { tag_ids: capturedTagIds } : {}),
              },
            },
          }),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          const pe = parseClientApiJson(json);
          onError(formatErrorWithTrace(pe.message ?? '录入失败', pe.traceId));
          onPendingSessionPatch?.(token.sessionId, {
            lifecycle: 'failed',
            errorMessage: pe.message ?? '录入失败',
          });
          processedSessionIds.add(token.sessionId);
          continue;
        }

        const env = parseClientApiJson(json);
        const d = env.data as PostInputPayload | undefined;

        if (!d) {
          onPendingSessionPatch?.(token.sessionId, {
            lifecycle: 'failed',
            errorMessage: '空响应',
          });
          processedSessionIds.add(token.sessionId);
          continue;
        }

        if (!d.pending) {
          onRecordCreated();
          onPendingResolved?.(token.sessionId);
          processedSessionIds.add(token.sessionId);
        } else if (!pendingClarify) {
          pendingClarify = buildClarifyFromPostResponse(d, line, itemList, token.sessionId);
          onPendingSessionPatch?.(token.sessionId, {
            lifecycle: 'awaiting_confirmation',
            inputId: d.input.id,
            clarifySnapshot: pendingClarify,
          });
          processedSessionIds.add(token.sessionId);
          continue;
        } else {
          const extra = buildClarifyFromPostResponse(d, line, itemList, token.sessionId);
          ingestClarifyQueueRef.current.push(extra);
          bumpQueueSig();
          onPendingSessionPatch?.(token.sessionId, {
            lifecycle: 'awaiting_confirmation',
            inputId: d.input.id,
            clarifySnapshot: extra,
          });
          processedSessionIds.add(token.sessionId);
          continue;
        }
      }
      for (const token of pendingTokens) {
        if (!processedSessionIds.has(token.sessionId)) {
          onPendingResolved?.(token.sessionId);
        }
      }
      if (pendingClarify) {
        const firstClarify = pendingClarify;
        setIngestClarify((prev) => {
          if (!prev) return firstClarify;
          ingestClarifyQueueRef.current.push(firstClarify);
          return prev;
        });
        bumpQueueSig();
      }
    } catch {
      for (const token of pendingTokens) {
        if (!processedSessionIds.has(token.sessionId)) {
          onPendingSessionPatch?.(token.sessionId, {
            lifecycle: 'failed',
            errorMessage: '创建记录失败',
          });
        }
      }
      onError(formatErrorWithTrace('创建记录失败，请重试', submitTraceId));
    }
  };

  const handleSubmit = () => {
    if (!rawText.trim()) return;

    const trimmedInput = rawText.trim();
    const chineseChars = (trimmedInput.match(/[\u4e00-\u9fa5]/g) || []).length;
    const hasPinyinLike = /[a-z]{2,}/.test(trimmedInput) && !/\b(km|kg|mb|gb|tb|pm|am)\b/i.test(trimmedInput);
    if (chineseChars < 1 && hasPinyinLike) {
      if (!window.confirm(`输入内容看起来像拼音"${trimmedInput}"，是否确认提交？\n（语音识别可能出错，建议重新输入中文）`)) {
        return;
      }
    }

    if (!resolveIngestV2ForClient()) {
      onError(
        '未启用 Ingest V2 录入：请在 .env.local 设置 NEXT_PUBLIC_INGEST_V2=true，或使用开发模式（NEXT_PUBLIC_DEV_MODE=true）。'
      );
      return;
    }

    const capturedRaw = trimmedInput;
    const submitTraceId = genTraceId();
    const capturedType = type;
    const capturedItemId = selectedItemId;
    const capturedSubItemId = selectedSubItemId;
    const capturedTagIds = [...selectedTagIds];
    const capturedDate = selectedDate;
    const multiLines = capturedRaw.split('\n').map((l) => l.trim()).filter(Boolean);
    const linesToProcess = multiLines.length >= 2 ? multiLines : [capturedRaw];
    const pendingTokens = linesToProcess.map((line) => ({
      sessionId:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      line,
    }));

    resetSubmitDraft();
    for (const token of pendingTokens) {
      onPendingCreated?.(token.sessionId, token.line, capturedDate);
    }

    void runIngestJob({
      submitTraceId,
      linesToProcess,
      pendingTokens,
      capturedDate,
      capturedType,
      capturedItemId,
      capturedSubItemId,
      capturedTagIds,
      itemList: items,
    });
  };

  // ================================
  // 键盘：Enter 提交，Shift+Enter 换行
  // ================================
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const clarifyQ = ingestClarify?.question;
  const isCompoundConfirm =
    Boolean(
      clarifyQ &&
        (clarifyQ.clarify_class === 'compound_confirm' ||
          (clarifyQ.field === '_confirm' &&
            !clarifyQ.clarify_class &&
            clarifyQ.kind === 'select' &&
            clarifyQ.options?.some((o) => o.value === 'split')))
    );
  const isLowConfidenceConfirm =
    Boolean(clarifyQ?.clarify_class === 'field_clarify' && clarifyQ?.clarify_subtype === 'low_confidence_confirm');
  const isTwoWayConfirmSelect =
    Boolean(clarifyQ && clarifyQ.kind === 'select' && clarifyQ.field === '_confirm' && !isCompoundConfirm) &&
    Boolean(
      clarifyQ!.options?.length &&
        clarifyQ!.options!.every((o) => o.value === 'confirm' || o.value === 'rewrite')
    );
  const clarifyPanelTitle = (() => {
    if (!clarifyQ) return '';
    if (isCompoundConfirm) return '复合句：请确认如何保存';
    if (clarifyQ.clarify_class === 'boundary_confirm') return '归类边界确认';
    if (isLowConfidenceConfirm) return '解析不确定，请确认';
    return '补充一项即可保存';
  })();

  // ================================
  // 渲染
  // ================================
  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm space-y-2">

      {/* 拆分成功提示条 */}
      {splitNotice && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700 animate-in fade-in">
          <Split className="h-3.5 w-3.5 shrink-0" />
          {splitNotice}
        </div>
      )}

      {ingestClarify && (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-3 space-y-2 outline-none"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              void cancelIngestFlow();
            }
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-emerald-800">{clarifyPanelTitle}</span>
            {ingestBusy && <span className="text-[10px] text-emerald-600">处理中…</span>}
          </div>
          <div className="text-[11px] text-slate-600 whitespace-pre-wrap break-words">
            <span className="font-medium text-emerald-700">原文：</span>
            {ingestClarify.rawContext}
          </div>
          <p className="text-[11px] text-slate-800 leading-snug">{ingestClarify.question.prompt}</p>
          {isCompoundConfirm &&
            ingestClarify.splitPreview &&
            ingestClarify.splitPreview.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-white/80 px-2.5 py-2 space-y-1">
                <div className="text-[10px] font-medium text-emerald-700">
                  拆分预览（将分别入库）
                </div>
                {ingestClarify.splitPreview.map((u, idx) => (
                  <div key={`${idx}-${u.text}`} className="text-[10px] text-slate-700 space-y-0.5">
                    <div>
                      {idx + 1}. {u.type ? `【${u.type}】` : ''}
                      {u.text}
                    </div>
                    <div className="text-slate-500">
                      时间：{u.time || '未解析'} | 归属：{u.ownerHint || '未指定'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          {ingestClarify.question.ai_guess != null && String(ingestClarify.question.ai_guess).length > 0 && (
            <div className="text-[10px] text-amber-700 bg-amber-50/80 rounded px-2 py-1 border border-amber-100">
              AI 推测：{String(ingestClarify.question.ai_guess)}
            </div>
          )}
          {ingestClarify.question.kind === 'select' &&
            isCompoundConfirm &&
            ingestClarify.question.options && (
              <div className="grid grid-cols-2 gap-2">
                {['split', 'keep_single', 'cancel', 'defer'].map((key) => {
                  const opt = ingestClarify.question.options?.find((o) => o.value === key);
                  if (!opt) return null;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={ingestBusy}
                      onClick={() => void submitIngestClarify(opt.value)}
                      className="text-left rounded-lg border border-emerald-200 bg-white px-2.5 py-2 text-[11px] text-slate-800 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          {ingestClarify.question.kind === 'select' &&
            isTwoWayConfirmSelect &&
            ingestClarify.question.options && (
              <div className="grid grid-cols-2 gap-2">
                {ingestClarify.question.options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={ingestBusy}
                    onClick={() => void submitIngestClarify(opt.value)}
                    className="text-left rounded-lg border border-emerald-200 bg-white px-2.5 py-2 text-[11px] text-slate-800 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          {ingestClarify.question.kind === 'select' &&
            !isCompoundConfirm &&
            !isTwoWayConfirmSelect &&
            ingestClarify.question.options && (
            <div className="flex flex-col gap-1.5">
              {ingestClarify.question.options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={ingestBusy}
                  onClick={() => void submitIngestClarify(opt.value)}
                  className="text-left rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-800 hover:bg-emerald-50 disabled:opacity-50"
                >
                  {opt.label}
                  {opt.hint && <span className="block text-[10px] text-slate-400">{opt.hint}</span>}
                </button>
              ))}
            </div>
          )}
          {(ingestClarify.question.kind === 'number' ||
            ingestClarify.question.kind === 'text' ||
            ingestClarify.question.kind === 'datetime') && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type={ingestClarify.question.kind === 'number' ? 'number' : 'text'}
                className="min-w-[8rem] flex-1 rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-[11px] text-slate-800"
                placeholder={ingestClarify.question.placeholder ?? ''}
                value={ingestTextDraft}
                disabled={ingestBusy}
                onChange={(e) => setIngestTextDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const q = ingestClarify.question;
                    const v =
                      q.kind === 'number'
                        ? Number(ingestTextDraft)
                        : ingestTextDraft;
                    if (q.kind === 'number' && !Number.isFinite(v as number)) return;
                    if (q.kind !== 'number' && !String(ingestTextDraft).trim()) return;
                    void submitIngestClarify(v as string | number);
                  }
                }}
              />
              <button
                type="button"
                disabled={
                  ingestBusy ||
                  (ingestClarify.question.kind === 'number'
                    ? !Number.isFinite(Number(ingestTextDraft)) || ingestTextDraft.trim() === ''
                    : !ingestTextDraft.trim())
                }
                onClick={() => {
                  const q = ingestClarify.question;
                  const v = q.kind === 'number' ? Number(ingestTextDraft) : ingestTextDraft;
                  void submitIngestClarify(v);
                }}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:bg-slate-300"
              >
                确认
              </button>
            </div>
          )}
          {ingestClarify.question.field !== '_confirm' && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={ingestBusy}
              onClick={() => void skipIngestClarify()}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              跳过此题
            </button>
            <button
              type="button"
              disabled={ingestBusy}
              onClick={() => void cancelIngestFlow()}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            >
              取消本轮录入
            </button>
          </div>
          )}
        </div>
      )}

      {/* 主输入区：textarea + 优化 + 发送 */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={rawText}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="记下正在发生的... （回车保存，Shift+回车换行）"
          rows={2}
          disabled={optimizeLoading}
          className="flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-70"
        />
        <button
          onClick={handleOptimizeInput}
          disabled={!rawText.trim() || optimizeLoading}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 shadow-sm hover:bg-violet-200 disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none transition-colors"
          aria-label="优化输入"
          title="优化输入：整理模糊表达为清晰记录"
        >
          <Sparkles className={`h-4 w-4 ${optimizeLoading ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={handleSubmit}
          disabled={!rawText.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white shadow-sm hover:bg-blue-600 disabled:bg-slate-300 disabled:shadow-none transition-colors"
          aria-label="记录"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      {/* 解析芯片区（可编辑 — 仅本地规则即时预览，与 AI 解析原文分离） */}
      {chips.length > 0 && (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1.5 items-center">
            {chips.map((chip) => (
              <ParsedChip
                key={chip.key}
                chip={chip}
                onRemove={() => handleChipRemove(chip.key)}
                onEdit={(value) => handleChipEdit(chip.key, value)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowParseDetail(!showParseDetail)}
            className="text-[11px] text-slate-500 hover:text-blue-600 underline-offset-2 hover:underline"
          >
            {showParseDetail ? '收起本地清分说明' : '查看本地清分说明（规则预览，非 AI 依据）'}
          </button>
        </div>
      )}

      {/* 解析详情弹出面板 */}
      {showParseDetail && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 space-y-2 text-xs animate-in fade-in">
          {/* 标题栏 */}
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-700">解析详情</span>
            <button
              type="button"
              onClick={() => setShowParseDetail(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {/* 本地规则解析 */}
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">本地识别</span>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {parsed.cost !== undefined && <DetailRow label="金额" value={`¥${parsed.cost}`} />}
              {parsed.duration !== undefined && <DetailRow label="时长" value={`${parsed.duration}分钟`} />}
              {parsed.metric_value !== undefined && (
                <DetailRow label="指标" value={`${parsed.metric_object || ''} ${parsed.metric_value}${parsed.metric_unit || ''}`} />
              )}
              {parsed.time_hint && <DetailRow label="时间" value={parsed.time_hint} />}
              {parsed.type_hint && <DetailRow label="类型" value={parsed.type_hint} />}
              {parsed.mood_hint && <DetailRow label="心情" value={parsed.mood_hint} />}
              {parsed.energy_hint && <DetailRow label="能量" value={parsed.energy_hint} />}
              {parsed.status_hint && <DetailRow label="状态" value={parsed.status_hint} />}
              {parsed.body_state_hint && <DetailRow label="身体" value={parsed.body_state_hint} />}
              {parsed.location_hint && <DetailRow label="地点" value={parsed.location_hint} />}
              {parsed.suggested_item_name && <DetailRow label="事项" value={parsed.suggested_item_name} />}
              {parsed.content_hint && <DetailRow label="主题" value={parsed.content_hint} />}
              {parsed.date_hint && <DetailRow label="日期锚点" value={parsed.date_hint} />}
              {parsed.time_precision_hint && <DetailRow label="时间精度" value={parsed.time_precision_hint} />}
            </div>
          </div>

          {/* AI 语义结构（如有） */}
          {parsed.parsed_semantic && (
            <div className="space-y-1 border-t border-slate-200 pt-2">
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">AI 语义结构</span>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {parsed.parsed_semantic.subject && <DetailRow label="主语" value={parsed.parsed_semantic.subject} />}
                {parsed.parsed_semantic.action && <DetailRow label="动作" value={parsed.parsed_semantic.action} />}
                {parsed.parsed_semantic.object && <DetailRow label="宾语" value={parsed.parsed_semantic.object} />}
                {parsed.parsed_semantic.action_text && <DetailRow label="动作描述" value={parsed.parsed_semantic.action_text} />}
                {parsed.parsed_semantic.event_text && <DetailRow label="事件" value={parsed.parsed_semantic.event_text} />}
                {parsed.parsed_semantic.manner && <DetailRow label="方式" value={parsed.parsed_semantic.manner} />}
                {parsed.parsed_semantic.state && <DetailRow label="状态" value={parsed.parsed_semantic.state} />}
                {parsed.parsed_semantic.cause_text && <DetailRow label="原因" value={parsed.parsed_semantic.cause_text} />}
                {parsed.parsed_semantic.result_text && <DetailRow label="结果" value={parsed.parsed_semantic.result_text} />}
                {parsed.parsed_semantic.outcome_type && <DetailRow label="结果类型" value={parsed.parsed_semantic.outcome_type} />}
              </div>
            </div>
          )}

          {/* 置信度标注 */}
          {parsed.parsed_semantic?.field_confidence && Object.keys(parsed.parsed_semantic.field_confidence).length > 0 && (
            <div className="space-y-1 border-t border-slate-200 pt-2">
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">字段置信度</span>
              <div className="flex flex-wrap gap-1">
                {Object.entries(parsed.parsed_semantic.field_confidence).map(([field, level]) => (
                  <span
                    key={field}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                      level === 'certain'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    <span className={`w-1 h-1 rounded-full ${level === 'certain' ? 'bg-green-500' : 'bg-amber-500'}`} />
                    {field}: {level === 'certain' ? '确定' : '推测'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 整体置信度 */}
          {parsed.parsed_semantic?.confidence !== undefined && (
            <div className="border-t border-slate-200 pt-2">
              <span className="text-[10px] text-slate-500">
                整体置信度: <span className={parsed.parsed_semantic.confidence >= 0.7 ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>
                  {(parsed.parsed_semantic.confidence * 100).toFixed(0)}%
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* 内容主题提示 */}
      {parsed.content_hint && parsed.content_hint !== rawText.trim() && (
        <div className="text-[11px] text-slate-400">
          主题: <span className="text-blue-500">{parsed.content_hint}</span>
        </div>
      )}

      {/* 复合句拆分建议（仅展示，不影响提交行为） */}
      {parsed.split_suggestion && (
        <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-700">
          <Split className="h-3.5 w-3.5 shrink-0" />
          <span>检测到 {parsed.split_suggestion.parts.length} 条意图</span>
          <span className="text-amber-400">·</span>
          {parsed.split_suggestion.parts.map((part, i) => (
            <span key={i} className="inline-flex items-center gap-0.5 rounded bg-white border border-amber-200 px-1 py-0.5 text-[10px]">
              <span className={`rounded px-0.5 text-[9px] ${part.type_hint === '发生' ? 'bg-green-100 text-green-700' : part.type_hint === '计划' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{part.type_hint}</span>
              {part.content_hint || part.text.slice(0, 8)}
            </span>
          ))}
        </div>
      )}

      {/* 操作栏：展开修正 + 类型快速切 */}
      <div className="flex items-center justify-between pt-0.5">
        <div className="flex items-center gap-2">
          {/* 类型快速标签 */}
          <div className="flex gap-1">
            {RECORD_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  type === t
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? '收起修正' : '展开修正'}
        </button>
      </div>

      {/* 展开修正区 */}
      {expanded && (
        <div className="space-y-3 border-t border-slate-100 pt-3">

          {/* 内容主题 */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">
              内容主题（留空则用原文）
            </label>
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={parsed.content_hint || '如：午饭、跑步、开会...'}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* 关联事项 */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">
              关联事项
              {parsed.suggested_item_name && !selectedItemId && (
                <span className="ml-1 text-blue-500">（推荐：{parsed.suggested_item_name}）</span>
              )}
            </label>
            <select
              value={selectedItemId}
              onChange={(e) => {
                setSelectedItemId(e.target.value);
                // 事项变化时清空子项选择
                setSelectedSubItemId('');
              }}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">不关联事项</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>

          {/* 关联子项 — 仅当选中了有子项的事项时显示 */}
          {selectedItemId && subItemsForSelectedItem.length > 0 && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">
                关联子项
                <span className="ml-1 text-slate-400 font-normal">（可选）</span>
              </label>
              {loadingSubItems ? (
                <div className="text-[11px] text-slate-400 py-1">加载子项...</div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setSelectedSubItemId('')}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      !selectedSubItemId
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    暂不选择
                  </button>
                  {subItemsForSelectedItem.map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => setSelectedSubItemId(sub.id)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        selectedSubItemId === sub.id
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <Layers className="inline h-2.5 w-2.5 mr-0.5" />
                      {sub.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 标签多选 */}
          {tags.length > 0 && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">标签</label>
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => setSelectedTagIds(prev =>
                      prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                    )}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      selectedTagIds.includes(tag.id)
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ================================
// 解析详情行组件
// ================================
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] text-slate-400 shrink-0">{label}</span>
      <span className="text-[11px] text-slate-700 truncate">{value}</span>
    </div>
  );
}
