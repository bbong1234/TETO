'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ChevronDown, ChevronUp, Clock, DollarSign, Timer, BarChart3, FolderOpen, X, Smile, Zap, Activity, Split, MapPin, Users } from 'lucide-react';
import type { Tag, Item, RecordType } from '@/types/teto';
import { RECORD_TYPES } from '@/types/teto';
import { parseNaturalInput, ParsedInput } from '@/lib/utils/parseNaturalInput';

// ================================
// Props
// ================================
interface QuickInputProps {
  selectedDate: string;
  tags: Tag[];
  items: Item[];
  onRecordCreated: () => void;
  onAiStart?: (recordId: string) => void;
  onAiDone?: (recordId: string) => void;
  onError: (message: string) => void;
}

// ================================
// 可编辑芯片
// ================================
interface ChipData {
  key: string;
  label: string;
  value: string;
  icon?: React.ReactNode;
}

function ParsedChip({
  chip,
  onRemove,
  onEdit,
}: {
  chip: ChipData;
  onRemove: () => void;
  onEdit: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(chip.value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setEditValue(chip.value);
  }, [chip.value]);

  const handleConfirm = () => {
    onEdit(editValue);
    setEditing(false);
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[11px]">
        {chip.icon}
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleConfirm}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); }
            if (e.key === 'Escape') { setEditValue(chip.value); setEditing(false); }
          }}
          className="w-16 bg-transparent text-blue-700 text-[11px] focus:outline-none border-b border-blue-300"
        />
      </span>
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 cursor-pointer hover:bg-blue-100 transition-colors"
    >
      {chip.icon}
      {chip.label} {chip.value}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="ml-0.5 text-blue-400 hover:text-blue-600"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

// ================================
// 主组件
// ================================
export default function QuickInput({
  selectedDate,
  tags,
  items,
  onRecordCreated,
  onAiStart,
  onAiDone,
  onError,
}: QuickInputProps) {
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ParsedInput>({});
  const [type, setType] = useState<RecordType>('发生');
  const [content, setContent] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [splitMode, setSplitMode] = useState(false); // 是否处于拆分提交模式
  const [splitIndex, setSplitIndex] = useState(0); // 当前提交到第几条
  const [splitNotice, setSplitNotice] = useState<string | null>(null); // 拆分成功提示
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      // 自动设置类型
      if (result.type_hint) setType(result.type_hint);
      // 自动推荐事项（仅当用户未手动选时）
      if (result.suggested_item_id && !selectedItemId) {
        setSelectedItemId(result.suggested_item_id);
      }
    }, 300);
  }, [items, selectedItemId]);

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
    chips.push({ key: 'cost', label: '花费', value: `¥${parsed.cost}`, icon: <DollarSign className="h-2.5 w-2.5" /> });
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
    }
    setParsed(newParsed);
  };

  // ================================
  // 重置输入状态
  // ================================
  const resetState = () => {
    setRawText('');
    setParsed({});
    setType('发生');
    setContent('');
    setSelectedItemId('');
    setSelectedTagIds([]);
    setExpanded(false);
    setSplitMode(false);
    setSplitIndex(0);
  };

  // ================================
  // 从时间键词解析目标日期（用于 AI 返回的 time_anchor.raw）
  // ================================
  const resolveAnchorDate = (raw: string, baseDate: string): string | null => {
    const base = new Date(baseDate + 'T00:00:00');
    const offsetMap: Record<string, number> = {
      '前天': -2, '昨天': -1, '昨日': -1,
      '今天': 0, '今日': 0, '当天': 0,
      '明天': 1, '明日': 1, '后天': 2, '大后天': 3,
      '下周': 7, '下礼拜': 7, '上周': -7, '上礼拜': -7,
    };
    for (const [kw, offset] of Object.entries(offsetMap)) {
      if (raw.includes(kw)) {
        const target = new Date(base);
        target.setDate(target.getDate() + offset);
        return `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(target.getDate()).padStart(2,'0')}`;
      }
    }
    return null;
  };

  // ================================
  // 异步 AI 增强（fire-and-forget，不阻塞用户）
  // 支持复合句拆分：若 AI 返回多个 units，自动创建额外记录并建立关联
  // ================================
  const enhanceWithAi = async (recordId: string, inputText: string, date: string) => {
    onAiStart?.(recordId);
    try {
      // --- 获取近 3 天记录作为近期记忆上下文 ---
      let recentRecords: Array<{ id: string; content: string; date: string; type: string }> | undefined;
      try {
        const now = new Date();
        const threeDaysAgo = new Date(now);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const fromDate = fmtDate(threeDaysAgo);
        const toDate = fmtDate(now);
        const recentRes = await fetch(`/api/v2/records?date_from=${fromDate}&date_to=${toDate}`);
        if (recentRes.ok) {
          const recentJson = await recentRes.json();
          if (Array.isArray(recentJson.data)) {
            recentRecords = recentJson.data.map((r: Record<string, unknown>) => ({
              id: r.id as string,
              content: r.content as string,
              date: r.date as string,
              type: r.type as string,
            }));
          }
        }
      } catch { /* 获取近期记录失败不影响主流程 */ }

      const parseRes = await fetch('/api/v2/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: inputText,
          date,
          recent_records: recentRecords,
          items: items.map(i => ({ id: i.id, title: i.title })),
        }),
      });
      if (!parseRes.ok) return;
      const json = await parseRes.json();
      if (!json?.data) return;

      const { parsed: llmResult, type_hints } = json.data as {
        parsed: { is_compound: boolean; units: Array<Record<string, unknown>>; relations: unknown[]; confidence: number };
        type_hints: string[];
      };

      const unit = llmResult.units[0];
      if (!unit) return;

      // 生成 batch_id（若是复合句，所有拆分记录共享）
      const batchId = llmResult.is_compound && llmResult.units.length > 1
        ? crypto.randomUUID()
        : undefined;

      // --- 第一条记录：更新原记录 ---
      const update = buildUnitUpdate(unit, type_hints[0], batchId);
      await applyAutoThreading(update, unit);
      update.parsed_semantic = unit;

      // 处理第一条记录的 time_anchor（计划投影）
      if (unit.time_anchor && typeof unit.time_anchor === 'object') {
        const anchor = unit.time_anchor as Record<string, unknown>;
        if (anchor.direction === 'future' || anchor.direction === 'past') {
          const rawAnchor = typeof anchor.raw === 'string' ? anchor.raw : '';
          const resolvedDate = resolveAnchorDate(rawAnchor, date);
          if (resolvedDate && resolvedDate !== date) {
            update.time_anchor_date = resolvedDate;
          }
        }
      }

      if (Object.keys(update).length > 0) {
        await fetch(`/api/v2/records/${recordId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        });
      }

      // --- metric_name 对齐：AI 确定了 item_id 后，把 metric_name 对齐到目标配置 ---
      const resolvedItemId = (update.item_id as string | undefined) ?? undefined;
      if (resolvedItemId) {
        // 优先用本地解析的 metric_name，其次用 AI 解析的 metric.name
        const localMetricName = typeof unit.metric === 'object' && unit.metric !== null
          ? (unit.metric as Record<string, unknown>).name as string | undefined
          : undefined;
        // 从已提交的记录里取 metric_name（本地解析时已写入）
        try {
          const recRes = await fetch(`/api/v2/records/${recordId}`);
          if (recRes.ok) {
            const recJson = await recRes.json();
            const savedMetricName: string | null = recJson.data?.metric_name ?? null;
            const metricNameToAlign = savedMetricName || localMetricName;
            if (metricNameToAlign) {
              await alignMetricName(recordId, resolvedItemId, metricNameToAlign);
            }
          }
        } catch { /* 对齐失败不影响主流程 */ }
      }

      // --- AI 语义关联 + 双向数据互补 ---
      if (unit.record_link_hint && typeof unit.record_link_hint === 'object') {
        const hint = unit.record_link_hint as { target_id?: string; link_type?: string; reason?: string };
        if (hint.target_id) {
          // 1. 创建关联
          try {
            await fetch('/api/v2/record-links', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                source_id: recordId,
                target_id: hint.target_id,
                link_type: hint.link_type || 'related_to',
              }),
            });
          } catch { /* 关联创建失败静默处理 */ }

          // 2. 双向数据互补：当前记录和关联记录互相补全缺失字段
          try {
            const targetRes = await fetch(`/api/v2/records/${hint.target_id}`);
            if (targetRes.ok) {
              const targetJson = await targetRes.json();
              const target = targetJson.data as Record<string, unknown> | null;
              if (target) {
                // 可互补的字段列表
                const complementFields = [
                  'cost', 'location', 'people', 'mood', 'energy',
                  'duration_minutes', 'item_id'
                  // 注意：不包含 metric_value/metric_unit/metric_name，这些是用户录入的量化数据，不应从关联记录继承
                ] as const;

                // 当前记录的字段值（来自 update 载荷）
                const currentFields: Record<string, unknown> = { ...update };

                // 用关联记录的字段补全当前记录
                const complementForCurrent: Record<string, unknown> = {};
                for (const f of complementFields) {
                  const targetVal = target[f];
                  const currentVal = currentFields[f];
                  // 关联记录有值，当前记录没有 → 补全当前
                  if (targetVal != null && (currentVal == null || currentVal === '')) {
                    if (f === 'people') {
                      if (Array.isArray(targetVal) && targetVal.length > 0) complementForCurrent[f] = targetVal;
                    } else {
                      complementForCurrent[f] = targetVal;
                    }
                  }
                }
                if (Object.keys(complementForCurrent).length > 0) {
                  await fetch(`/api/v2/records/${recordId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(complementForCurrent),
                  });
                }

                // 用当前记录的字段补全关联记录
                const complementForTarget: Record<string, unknown> = {};
                for (const f of complementFields) {
                  const currentVal = currentFields[f];
                  const targetVal = target[f];
                  // 当前记录有值，关联记录没有 → 补全关联
                  if (currentVal != null && currentVal !== '' && (targetVal == null || targetVal === '')) {
                    if (f === 'people') {
                      if (Array.isArray(currentVal) && currentVal.length > 0) complementForTarget[f] = currentVal;
                    } else {
                      complementForTarget[f] = currentVal;
                    }
                  }
                }
                if (Object.keys(complementForTarget).length > 0) {
                  await fetch(`/api/v2/records/${hint.target_id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(complementForTarget),
                  });
                }
              }
            }
          } catch (err) {
            console.error('双向互补失败:', err);
          }
        }
      }

      // --- 复合句拆分：为 units[1..N] 创建新记录 + 关联 ---
      if (batchId && llmResult.units.length > 1) {
        for (let i = 1; i < llmResult.units.length; i++) {
          const extraUnit = llmResult.units[i];
          const extraUpdate = buildUnitUpdate(extraUnit, type_hints[i], batchId);
          // 构建新记录的 content
          const action = typeof extraUnit.action === 'string' ? extraUnit.action : '';
          const obj = typeof extraUnit.object === 'string' ? extraUnit.object : '';
          const newContent = obj ? `${action}${obj}` : action || inputText;

          const createBody: Record<string, unknown> = {
            content: newContent,
            date,
            type: extraUpdate.type || '发生',
            batch_id: batchId,
            parsed_semantic: extraUnit,
            ...extraUpdate,
          };

          // 时间锚点处理
          if (extraUnit.time_anchor && typeof extraUnit.time_anchor === 'object') {
            const anchor = extraUnit.time_anchor as Record<string, unknown>;
            if (anchor.direction === 'future' || anchor.direction === 'past') {
              const rawAnchor = typeof anchor.raw === 'string' ? anchor.raw : '';
              const resolvedDate = resolveAnchorDate(rawAnchor, date);
              if (resolvedDate && resolvedDate !== date) {
                createBody.time_anchor_date = resolvedDate;
              }
            }
          }

          try {
            const createRes = await fetch('/api/v2/records', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(createBody),
            });
            if (createRes.ok) {
              const { data: newRecord } = await createRes.json();
              if (newRecord?.id) {
                // 建立 derived_from 关联
                await fetch('/api/v2/record-links', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    source_id: newRecord.id,
                    target_id: recordId,
                    link_type: 'derived_from',
                  }),
                });
                // AI 语义关联（额外 unit 也可能关联近期记录）
                if (extraUnit.record_link_hint && typeof extraUnit.record_link_hint === 'object') {
                  const hint = extraUnit.record_link_hint as { target_id?: string; link_type?: string };
                  if (hint.target_id) {
                    try {
                      await fetch('/api/v2/record-links', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          source_id: newRecord.id,
                          target_id: hint.target_id,
                          link_type: hint.link_type || 'related_to',
                        }),
                      });
                    } catch { /* 关联创建失败静默处理 */ }
                  }
                }
              }
            }
          } catch { /* 拆分创建失败静默处理 */ }
        }
      }

      // 拆分成功提示
      if (batchId && llmResult.units.length > 1) {
        const extraCount = llmResult.units.length - 1;
        setSplitNotice(`AI 已将输入拆分为 ${llmResult.units.length} 条独立记录（+${extraCount} 条新记录）`);
        setTimeout(() => setSplitNotice(null), 4000);
      }
      // 刷新列表显示 AI 增强/拆分结果
      onRecordCreated();
    } catch (err) {
      console.error('AI 解析失败:', err);
      // 记录仍以纯文本存在
    } finally {
      onAiDone?.(recordId);
    }
  };

  /** 从单个 unit 构建更新载荷（AI 增强用，不覆盖用户已输入的内容和量化字段） */
  const buildUnitUpdate = (unit: Record<string, unknown>, typeHint: string | undefined, batchId?: string): Record<string, unknown> => {
    const update: Record<string, unknown> = {};
    if (typeof unit.location === 'string' && unit.location) update.location = unit.location;
    if (Array.isArray(unit.people) && unit.people.length > 0) update.people = unit.people;
    if (typeof unit.mood === 'string' && unit.mood) update.mood = unit.mood;
    if (typeof unit.energy === 'string' && unit.energy) update.energy = unit.energy;
    if (typeof unit.cost === 'number' && unit.cost > 0) update.cost = unit.cost;
    if (typeof unit.duration_minutes === 'number' && unit.duration_minutes > 0) update.duration_minutes = unit.duration_minutes;
    // type_hint
    if (typeHint && ['发生', '计划', '想法', '总结'].includes(typeHint)) {
      update.type = typeHint;
    }
    // item_hint 匹配：精确 → 包含 → action 兜底（去掉字符碰撞，误匹配率太高）
    if (typeof unit.item_hint === 'string' && unit.item_hint) {
      const hint = unit.item_hint.toLowerCase();
      const matched =
        items.find(i => i.title.toLowerCase() === hint) ||
        items.find(i => i.title.toLowerCase().includes(hint)) ||
        items.find(i => hint.includes(i.title.toLowerCase()) && i.title.length >= 2) ||
        (typeof unit.action === 'string'
          ? items.find(i => i.title.toLowerCase().includes(unit.action as string))
          : undefined);
      if (matched) update.item_id = matched.id;
    }
    // batch_id
    if (batchId) update.batch_id = batchId;
    return update;
  };

  /** metric_name 对齐：把记录的 metric_name 对齐到该事项目标里最接近的 metric_name */
  const alignMetricName = async (recordId: string, itemId: string, currentMetricName: string) => {
    try {
      const res = await fetch(`/api/v2/goals?item_id=${itemId}`);
      if (!res.ok) return;
      const json = await res.json();
      const goals: Array<{ metric_name: string | null; measure_type: string }> = json.data ?? [];
      const candidates = goals
        .filter(g => g.measure_type === 'numeric' && g.metric_name)
        .map(g => g.metric_name as string);
      if (candidates.length === 0) return;

      const needle = currentMetricName.toLowerCase();
      // 精确匹配
      let aligned = candidates.find(c => c.toLowerCase() === needle);
      // 包含匹配
      if (!aligned) aligned = candidates.find(c => c.toLowerCase().includes(needle) || needle.includes(c.toLowerCase()));
      if (!aligned || aligned === currentMetricName) return;

      await fetch(`/api/v2/records/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metric_name: aligned }),
      });
    } catch (err) {
      console.error('metric_name 对齐失败:', err);
    }
  };

  /** Auto-Threading: 搜索近 48h 相同主题记录获取 item_id */
  const applyAutoThreading = async (update: Record<string, unknown>, unit: Record<string, unknown>) => {
    if (!update.item_id && typeof unit.action === 'string') {
      try {
        const now = new Date();
        const twoDaysAgo = new Date(now);
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        const fmtD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const fromDate = fmtD(twoDaysAgo);
        const toDate = fmtD(now);
        const recentRes = await fetch(`/api/v2/records?date_from=${fromDate}&date_to=${toDate}`);
        if (recentRes.ok) {
          const recentJson = await recentRes.json();
          const recentRecords = recentJson.data as Array<{ item_id?: string | null; content?: string }>;
          if (recentRecords && recentRecords.length > 0) {
            const actionLower = (unit.action as string).toLowerCase();
            const objectLower = typeof unit.object === 'string' ? (unit.object as string).toLowerCase() : '';
            const keyword = objectLower || actionLower;
            const threadMatch = recentRecords.find(r =>
              r.item_id && r.content && r.content.toLowerCase().includes(keyword)
            );
            if (threadMatch?.item_id) {
              update.item_id = threadMatch.item_id;
            }
          }
        }
      } catch { /* 忽略 auto-threading 失败 */ }
    }
  };

  // ================================
  // 提交保存（即时保存，不等 AI）
  // ================================
  const handleSubmit = async () => {
    if (!rawText.trim() || submitting) return;
    setSubmitting(true);

    // 在清除状态前捕获当前值
    const capturedRaw = rawText.trim();
    const capturedParsed = { ...parsed };
    const capturedType = type;
    const capturedContent = content;
    const capturedItemId = selectedItemId;
    const capturedTagIds = [...selectedTagIds];
    const capturedDate = selectedDate;

    try {
      // 拆分模式：按子句逐条提交
      if (splitMode && capturedParsed.split_suggestion && splitIndex < capturedParsed.split_suggestion.parts.length) {
        const part = capturedParsed.split_suggestion.parts[splitIndex];
        const body: Record<string, unknown> = {
          content: part.content_hint || part.text,
          raw_input: part.text,
          date: capturedDate,
          type: part.type_hint,
        };
        if (capturedParsed.time_hint) {
          body.occurred_at = `${capturedDate}T${capturedParsed.time_hint}:00+08:00`;
        }
        if (capturedItemId) body.item_id = capturedItemId;
        if (capturedTagIds.length > 0) body.tag_ids = capturedTagIds;

        const res = await fetch('/api/v2/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const { data: created } = await res.json();
          const nextIdx = splitIndex + 1;
          if (nextIdx < capturedParsed.split_suggestion.parts.length) {
            setSplitIndex(nextIdx);
          } else {
            resetState();
          }
          onRecordCreated();
          // 每条拆分记录都异步 AI 增强
          if (created?.id) enhanceWithAi(created.id, part.text, capturedDate);
        } else {
          const err = await res.json();
          onError(err.error || '创建记录失败');
        }
      } else {
        // 正常提交 — 仅用本地解析结果，即时入库
        const body: Record<string, unknown> = {
          content: capturedContent || capturedParsed.content_hint || capturedRaw,
          raw_input: capturedRaw,
          date: capturedDate,
          type: capturedType,
        };

        // 发生时间
        if (capturedParsed.time_hint) {
          body.occurred_at = `${capturedDate}T${capturedParsed.time_hint}:00+08:00`;
        }

        // 事项
        if (capturedItemId) {
          body.item_id = capturedItemId;
        } else if (capturedParsed.suggested_item_id) {
          body.item_id = capturedParsed.suggested_item_id;
        }

        // 标签
        if (capturedTagIds.length > 0) body.tag_ids = capturedTagIds;

        // 本地解析的量化字段（这些是即时可用的）
        if (capturedParsed.cost !== undefined && capturedParsed.cost > 0) body.cost = capturedParsed.cost;
        if (capturedParsed.duration !== undefined && capturedParsed.duration > 0) body.duration_minutes = capturedParsed.duration;
        if (capturedParsed.metric_value !== undefined) body.metric_value = capturedParsed.metric_value;
        if (capturedParsed.metric_unit) body.metric_unit = capturedParsed.metric_unit;
        if (capturedParsed.metric_object) body.metric_name = capturedParsed.metric_object;

        // 本地解析的语义字段
        if (capturedParsed.mood_hint) body.mood = capturedParsed.mood_hint;
        if (capturedParsed.energy_hint) body.energy = capturedParsed.energy_hint;
        if (capturedParsed.status_hint) body.status = capturedParsed.status_hint;
        if (capturedParsed.location_hint) body.location = capturedParsed.location_hint;
        if (capturedParsed.people_hint && capturedParsed.people_hint.length > 0) body.people = capturedParsed.people_hint;
        if (capturedParsed.date_hint) body.time_anchor_date = capturedParsed.date_hint;

        const res = await fetch('/api/v2/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const { data: created } = await res.json();
          // 【即时】重置输入框 + 刷新列表
          resetState();
          onRecordCreated();
          // 【后台】异步 AI 增强（不阻塞用户）
          if (created?.id && capturedRaw.length >= 4) {
            enhanceWithAi(created.id, capturedRaw, capturedDate);
          }
        } else {
          const err = await res.json();
          onError(err.error || '创建记录失败');
        }
      }
    } catch {
      onError('创建记录失败，请重试');
    } finally {
      setSubmitting(false);
    }
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

      {/* 主输入区：textarea + 发送 */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={rawText}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="记下正在发生的... （回车保存，Shift+回车换行）"
          rows={2}
          className="flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleSubmit}
          disabled={!rawText.trim() || submitting}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white shadow-sm hover:bg-blue-600 disabled:bg-slate-300 disabled:shadow-none transition-colors"
          aria-label="记录"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      {/* 解析芯片区（可编辑 — 仅本地即时解析结果） */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <ParsedChip
              key={chip.key}
              chip={chip}
              onRemove={() => handleChipRemove(chip.key)}
              onEdit={(value) => handleChipEdit(chip.key, value)}
            />
          ))}
        </div>
      )}

      {/* 内容主题提示 */}
      {parsed.content_hint && parsed.content_hint !== rawText.trim() && !splitMode && (
        <div className="text-[11px] text-slate-400">
          主题: <span className="text-blue-500">{parsed.content_hint}</span>
        </div>
      )}

      {/* 复合句拆分建议 */}
      {parsed.split_suggestion && !splitMode && (
        <button
          onClick={() => { setSplitMode(true); setSplitIndex(0); setType(parsed.split_suggestion!.parts[0].type_hint); }}
          className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 transition-colors w-full"
        >
          <Split className="h-3.5 w-3.5 shrink-0" />
          <span>检测到 {parsed.split_suggestion.parts.length} 条意图</span>
          <span className="text-amber-500">→</span>
          {parsed.split_suggestion.parts.map((part, i) => (
            <span key={i} className="inline-flex items-center gap-0.5 rounded bg-white border border-amber-200 px-1 py-0.5 text-[10px]">
              <span className={`rounded px-0.5 text-[9px] ${part.type_hint === '发生' ? 'bg-green-100 text-green-700' : part.type_hint === '计划' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{part.type_hint}</span>
              {part.content_hint || part.text.slice(0, 8)}
            </span>
          ))}
          <span className="ml-auto text-amber-500">点击拆分为 {parsed.split_suggestion.parts.length} 条记录</span>
        </button>
      )}

      {/* 拆分模式进度提示 */}
      {splitMode && parsed.split_suggestion && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 text-[11px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-medium text-amber-700">拆分提交中 ({splitIndex + 1}/{parsed.split_suggestion.parts.length})</span>
            <button
              onClick={() => { setSplitMode(false); setSplitIndex(0); setType(parsed.type_hint || '发生'); }}
              className="text-amber-500 hover:text-amber-700 text-[10px]"
            >
              取消拆分
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {parsed.split_suggestion.parts.map((part, i) => (
              <span key={i} className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] ${
                i < splitIndex ? 'bg-green-100 text-green-700 line-through' : i === splitIndex ? 'bg-amber-200 text-amber-900 font-medium' : 'bg-white text-slate-500'
              }`}>
                <span className={`rounded px-0.5 text-[9px] ${part.type_hint === '发生' ? 'bg-green-100 text-green-700' : part.type_hint === '计划' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{part.type_hint}</span>
                {part.content_hint || part.text.slice(0, 10)}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-amber-600">
            当前提交: {parsed.split_suggestion.parts[splitIndex]?.content_hint || parsed.split_suggestion.parts[splitIndex]?.text}
          </p>
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
              onChange={(e) => setSelectedItemId(e.target.value)}
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
