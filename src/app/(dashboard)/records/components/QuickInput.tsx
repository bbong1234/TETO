'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ChevronDown, ChevronUp, Clock, DollarSign, Timer, BarChart3, FolderOpen, X, Smile, Zap, Activity, Split, MapPin, Users, CheckCircle2, Layers, AlertTriangle, Pencil } from 'lucide-react';
import type { Tag, Item, RecordType, SubItem } from '@/types/teto';
import type { ParsedSemantic, ClarificationNeeded, ClarificationIssue, SharedContextItem } from '@/types/semantic';
import { RECORD_TYPES } from '@/types/teto';
import { parseNaturalInput, ParsedInput } from '@/lib/utils/parseNaturalInput';
import { generateContentSummary } from '@/lib/utils/generate-content-summary';

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
// 语义卡片芯片数据（保留 ChipData 类型供芯片逻辑使用）
// ================================
interface ChipData {
  key: string;
  label: string;
  value: string;
  icon?: React.ReactNode;
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
  const [selectedSubItemId, setSelectedSubItemId] = useState<string>('');
  const [subItemsForSelectedItem, setSubItemsForSelectedItem] = useState<SubItem[]>([]);
  const [loadingSubItems, setLoadingSubItems] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [splitMode, setSplitMode] = useState(false); // 是否处于拆分提交模式
  const [splitIndex, setSplitIndex] = useState(0); // 当前提交到第几条
  const [splitNotice, setSplitNotice] = useState<string | null>(null); // 拆分成功提示
  const [splitPreview, setSplitPreview] = useState<{
    recordId: string;
    inputText: string;
    date: string;
    units: Array<Record<string, unknown>>;
    typeHints: string[];
    batchId: string;
  } | null>(null); // AI 复合句拆分预览
  const [clarification, setClarification] = useState<ClarificationNeeded | null>(null);
  const [clarificationTimeout, setClarificationTimeoutRef] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null); // 降级模式提示
  const [durationInputs, setDurationInputs] = useState<Record<string, string>>({}); // 共享时长分配输入
  const [selectedClarifyOption, setSelectedClarifyOption] = useState<Record<string, string>>({}); // 澄清选项选择
  const lastInteractionRef = useRef(Date.now());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
      // 使用 ref 避免 debounce 闭包过期导致覆盖用户已选择的内容
      if (result.suggested_item_id && !selectedItemIdRef.current) {
        setSelectedItemId(result.suggested_item_id);
      }
    }, 300);
  }, [items]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleTextChange = (text: string) => {
    setRawText(text);
    lastInteractionRef.current = Date.now();
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
      setSelectedSubItemId('');
    }
    setParsed(newParsed);
  };

  // ================================
  // 确认 AI 拆分，创建额外记录
  // ================================
  const confirmSplitUnits = async () => {
    if (!splitPreview) return;
    const { recordId, date, units, typeHints, batchId } = splitPreview;

    for (let i = 1; i < units.length; i++) {
      const extraUnit = units[i];
      const extraUpdate = buildUnitUpdate(extraUnit, typeHints[i], batchId);
      // 复合句拆分：用标准化摘要作为 content
      const extraSummary = generateContentSummary(extraUnit as unknown as ParsedSemantic, splitPreview.inputText);
      const newContent = extraSummary || (() => {
        const action = typeof extraUnit.action === 'string' ? extraUnit.action : '';
        const obj = typeof extraUnit.object === 'string' ? extraUnit.object : '';
        return obj ? `${action}${obj}` : action || splitPreview.inputText;
      })();

      const createBody: Record<string, unknown> = {
        content: newContent,
        raw_input: splitPreview.inputText,  // 拆分记录也保留原始输入
        date,
        type: extraUpdate.type || '发生',
        batch_id: batchId,
        parsed_semantic: extraUnit,
        ...extraUpdate,
      };

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
            await fetch('/api/v2/record-links', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ source_id: newRecord.id, target_id: recordId, link_type: 'derived_from' }),
            }).catch(() => {});

            // 子项匹配：优先用 AI 返回的 sub_item_hint，其次用 action 匹配
            const matchedItemId = extraUpdate.item_id as string | undefined;
            if (matchedItemId && !extraUpdate.sub_item_id) {
              try {
                const subRes = await fetch(`/api/v2/sub-items?item_id=${matchedItemId}`);
                if (subRes.ok) {
                  const subJson = await subRes.json();
                  const subs: Array<{ id: string; title: string }> = subJson.data || [];
                  if (subs.length > 0) {
                    // 优先1: AI 的 sub_item_hint 精确匹配
                    const subItemHint = typeof extraUnit.sub_item_hint === 'string' ? extraUnit.sub_item_hint : '';
                    let subMatch: { id: string; title: string } | undefined;
                    if (subItemHint) {
                      const hintLower = subItemHint.toLowerCase();
                      subMatch = subs.find(s => s.title.toLowerCase() === hintLower)
                        || subs.find(s => s.title.toLowerCase().includes(hintLower) || hintLower.includes(s.title.toLowerCase()));
                    }
                    // 优先2: action 包含关键词匹配子项（如“复习”→“英语单词复习”，“新学”→“英语单词新学”）
                    if (!subMatch) {
                      const action = typeof extraUnit.action === 'string' ? extraUnit.action : '';
                      if (action) {
                        const actionLower = action.toLowerCase();
                        subMatch = subs.find(s => s.title.toLowerCase().includes(actionLower));
                      }
                    }
                    // 优先3: metric_name 兜底匹配
                    if (!subMatch) {
                      const metricName = typeof extraUnit.metric === 'object' && extraUnit.metric !== null
                        ? (extraUnit.metric as Record<string, unknown>).name as string | undefined
                        : undefined;
                      if (metricName) {
                        const metricLower = metricName.toLowerCase();
                        subMatch = subs.find(s => s.title.toLowerCase() === metricLower)
                          || subs.find(s => s.title.toLowerCase().includes(metricLower))
                          || subs.find(s => metricLower.includes(s.title.toLowerCase()) && s.title.length >= 2);
                      }
                    }
                    if (subMatch) {
                      await fetch(`/api/v2/records/${newRecord.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sub_item_id: subMatch.id }),
                      });
                    }
                  }
                }
              } catch { /* 子项匹配失败不影响主流程 */ }
            }
          }
        }
      } catch { /* 静默处理 */ }
    }

    const extraCount = units.length - 1;
    setSplitNotice(`已创建 ${units.length} 条独立记录（+${extraCount} 条）`);
    setTimeout(() => setSplitNotice(null), 4000);
    setSplitPreview(null);
    onRecordCreated();
  };

  const dismissSplitPreview = () => {
    setSplitNotice('已取消拆分，仅保留主记录');
    setTimeout(() => setSplitNotice(null), 3000);
    setSplitPreview(null);
  };

  // ================================
  // 澄清框用户操作
  // ================================
  const handleClarifyConfirm = async () => {
    if (!clarification) return;
    if (clarificationTimeout) clearTimeout(clarificationTimeout);

    const updateData: Record<string, unknown> = {};

    for (const issue of clarification.issues) {
      if (issue.type === 'shared_duration') {
        // 检查用户是否手动填了时长
        const durInput = durationInputs[`${issue.unitIndex}_0`];
        const durInput2 = durationInputs[`${issue.unitIndex}_1`];
        if (durInput && durInput2) {
          // 用户分配了时长，给第一条记录设时长
          updateData.duration_minutes = parseInt(durInput, 10) || undefined;
          // 给拆分记录也写时长
          const secondRecordId = clarification.recordIds.length > 1 ? clarification.recordIds[1] : null;
          if (secondRecordId) {
            const dur2 = parseInt(durInput2, 10) || undefined;
            if (dur2) {
              await fetch(`/api/v2/records/${secondRecordId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duration_minutes: dur2 }),
              });
            }
          }
        }
        // 如果选了"平均分配"或"不需要补充时长"，不设 duration_minutes
      } else if (issue.type === 'sub_item_ambiguous') {
        const selected = selectedClarifyOption[`sub_item_${issue.unitIndex}`];
        if (selected && selected !== 'none') {
          updateData.sub_item_id = selected;
        }
      } else if (issue.type === 'item_missing') {
        const selected = selectedClarifyOption[`item_${issue.unitIndex}`];
        if (selected && selected !== 'none') {
          updateData.item_id = selected;
        }
      } else if (issue.type === 'fuzzy_insufficient') {
        // B类模糊：如果用户选了"修改原文"，走编辑流程
        if (selectedClarifyOption[`fuzzy_insufficient_${issue.unitIndex}`] === 'edit') {
          // 将在确认后切换到编辑原文模式
        }
        // 否则允许低精度落地，不需要额外回写
      } else if (issue.type === 'medium_risk') {
        // 中风险：如果用户选了"修改原文"，走编辑流程
        if (selectedClarifyOption[`medium_risk_${issue.unitIndex}`] === 'edit') {
          // 将在确认后切换到编辑原文模式
        }
        // 否则按AI推测结果确认，不需要额外回写
      }
      // low_confidence / high_risk / fuzzy_unintelligible / fuzzy_unreasonable: 确认=按AI推测结果保留，不需要额外回写
    }

    // 检查是否有需要走"修改原文"的模糊类型
    const needsEditOriginal = clarification.issues.some(issue =>
      (issue.type === 'fuzzy_unintelligible' || issue.type === 'fuzzy_unreasonable') ||
      (issue.type === 'fuzzy_insufficient' && selectedClarifyOption[`fuzzy_insufficient_${issue.unitIndex}`] === 'edit') ||
      (issue.type === 'medium_risk' && selectedClarifyOption[`medium_risk_${issue.unitIndex}`] === 'edit')
    );
    if (needsEditOriginal) {
      // 直接走编辑原文流程
      handleClarifyEditOriginal();
      return;
    }

    // 清除 needs_clarification 标记
    updateData.parsed_semantic = { needs_clarification: false };

    if (Object.keys(updateData).length > 1) { // >1 因为 parsed_semantic 始终在
      await fetch(`/api/v2/records/${clarification.recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
    }

    setClarification(null);
    setDurationInputs({});
    setSelectedClarifyOption({});
    onRecordCreated();
  };

  const handleClarifySkip = () => {
    if (clarificationTimeout) clearTimeout(clarificationTimeout);
    setClarification(null);
    setDurationInputs({});
    setSelectedClarifyOption({});
    // 记录卡片上保留"待确认"标记（已由 enhanceRecord 写入）
  };

  const handleClarifyEditOriginal = async () => {
    if (!clarification) return;
    if (clarificationTimeout) clearTimeout(clarificationTimeout);

    // 删除本次提交已创建的所有记录
    for (const rid of clarification.recordIds) {
      try {
        await fetch(`/api/v2/records/${rid}`, { method: 'DELETE' });
      } catch { /* 删除失败静默处理 */ }
    }

    // 原始输入回到 QuickInput
    setRawText(clarification.originalInput);
    setClarification(null);
    setDurationInputs({});
    setSelectedClarifyOption({});
    onRecordCreated();
  };

  const handleClarifyCancel = () => {
    if (clarificationTimeout) clearTimeout(clarificationTimeout);
    setClarification(null);
    setDurationInputs({});
    setSelectedClarifyOption({});
    // 保留原始记录，结构化字段留空
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
    setSelectedSubItemId('');
    setSubItemsForSelectedItem([]);
    setSelectedTagIds([]);
    setExpanded(false);
    setSplitMode(false);
    setSplitIndex(0);
    setSplitPreview(null);
    setFallbackMessage(null);
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

      // 处理降级模式响应
      const isFallback = json.data.is_fallback === true;
      if (isFallback) {
        setFallbackMessage(json.data.message || '智能解析暂不可用，已切换基础模式');
        setTimeout(() => setFallbackMessage(null), 5000); // 5秒后自动关闭
      }

      const { parsed: llmResult, type_hints } = (isFallback ? json.data : json.data) as {
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

      // AI 增强后用标准化摘要覆盖 content
      const aiSummary = generateContentSummary(unit as unknown as ParsedSemantic, inputText);
      if (aiSummary && aiSummary !== inputText) {
        update.content = aiSummary;
      }

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

      // --- 子项自动匹配：AI 确定了 item_id 后，用 sub_item_hint > action > metric_name 在子项列表中查找 ---
      const resolvedItemId2 = (update.item_id as string | undefined) ?? undefined;
      if (resolvedItemId2) {
        try {
          const subRes = await fetch(`/api/v2/sub-items?item_id=${resolvedItemId2}`);
          if (subRes.ok) {
            const subJson = await subRes.json();
            const subs: Array<{ id: string; title: string }> = subJson.data || [];
            if (subs.length > 0) {
              let subMatch: { id: string; title: string } | undefined;

              // 优先1: AI 的 sub_item_hint 精确匹配
              const subItemHint = typeof unit.sub_item_hint === 'string' ? unit.sub_item_hint : '';
              if (subItemHint) {
                const hintLower = subItemHint.toLowerCase();
                subMatch = subs.find(s => s.title.toLowerCase() === hintLower)
                  || subs.find(s => s.title.toLowerCase().includes(hintLower) || hintLower.includes(s.title.toLowerCase()));
              }

              // 优先2: action 包含关键词匹配子项
              if (!subMatch) {
                const action = typeof unit.action === 'string' ? unit.action : '';
                if (action) {
                  const actionLower = action.toLowerCase();
                  subMatch = subs.find(s => s.title.toLowerCase().includes(actionLower));
                }
              }

              // 优先3: metric_name 兜底匹配
              if (!subMatch) {
                const metricName = typeof unit.metric === 'object' && unit.metric !== null
                  ? (unit.metric as Record<string, unknown>).name as string | undefined
                  : undefined;
                if (metricName) {
                  const metricLower = metricName.toLowerCase();
                  subMatch = subs.find(s => s.title.toLowerCase() === metricLower)
                    || subs.find(s => s.title.toLowerCase().includes(metricLower))
                    || subs.find(s => metricLower.includes(s.title.toLowerCase()) && s.title.length >= 2);
                }
              }

              if (subMatch) {
                await fetch(`/api/v2/records/${recordId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sub_item_id: subMatch.id }),
                });
              }
            }
          }
        } catch { /* 子项匹配失败不影响主流程 */ }
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
      // 收紧关联逻辑：completes/derived_from 自动建关联；
      // related_to 需要 reason 中包含时间指代词才建关联（避免同事项同天的并发记录被误关联）
      if (unit.record_link_hint && typeof unit.record_link_hint === 'object') {
        const hint = unit.record_link_hint as { target_id?: string; link_type?: string; reason?: string };
        const shouldCreateLink = hint.target_id && (() => {
          const lt = hint.link_type || 'related_to';
          if (lt === 'completes' || lt === 'derived_from' || lt === 'postponed_from') return true;
          // related_to 类型：检查 reason 是否包含时间指代词
          if (lt === 'related_to' && hint.reason) {
            const timeWords = ['昨天', '前天', '昨天', '上次', '之前', '之前那次', '那次', '早上的', '上午的', '下午的', '晚上的'];
            return timeWords.some(w => hint.reason!.includes(w));
          }
          return false;
        })();

        if (shouldCreateLink) {
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

      // --- 歧义检测（按优先级：共享时长 > 子项归属 > 事项归属 > 低置信度） ---
      const clarifyIssues: ClarificationIssue[] = [];

      // 优先级1：共享时长
      const sharedDuration = (unit as Record<string, unknown>).shared_context as Array<SharedContextItem> | null | undefined;
      const sharedDurItem = sharedDuration?.find(sc => sc.field === 'duration_minutes');
      if (sharedDurItem) {
        clarifyIssues.push({
          type: 'shared_duration',
          unitIndex: 0,
          message: `"${sharedDurItem.raw}"无法确定如何分配`,
          reason: `原话中"${sharedDurItem.raw}"无法确定属于哪个子行动`,
          sharedContext: sharedDurItem,
        });
      }

      // 优先级2：子项归属歧义（metric_name 匹配到多个子项）
      const metricObj = (unit as Record<string, unknown>).metric as Record<string, unknown> | null;
      const metricName = metricObj?.name as string | undefined;
      const resolvedItemId4Clarify = (update.item_id as string | undefined) ?? undefined;
      if (metricName && resolvedItemId4Clarify && subItemsForSelectedItem.length > 1) {
        const needle = metricName.toLowerCase();
        const matchedSubs = subItemsForSelectedItem.filter(s =>
          s.title.toLowerCase().includes(needle) || needle.includes(s.title.toLowerCase())
        );
        if (matchedSubs.length > 1) {
          clarifyIssues.push({
            type: 'sub_item_ambiguous',
            unitIndex: 0,
            message: `"${metricName}"属于哪个子项？`,
            reason: `"${metricName}"同时匹配到${matchedSubs.map(s => '"' + s.title + '"').join('和')}两个子项`,
            options: matchedSubs.map(s => ({ label: s.title, value: s.id })),
          });
        }
      }

      // 优先级3：事项归属缺失
      if (!update.item_id && !(unit as Record<string, unknown>).item_hint) {
        clarifyIssues.push({
          type: 'item_missing',
          unitIndex: 0,
          message: '未匹配到事项',
          reason: 'AI未能从输入中识别出关联的事项名称',
          options: items.slice(0, 5).map(i => ({ label: i.title, value: i.id })),
        });
      }

      // 优先级4：高风险记录（risk_level=high）
      const unitRiskLevel = (unit as Record<string, unknown>).risk_level as string | undefined;
      if (clarifyIssues.length === 0 && unitRiskLevel === 'high') {
        clarifyIssues.push({
          type: 'high_risk',
          unitIndex: 0,
          message: '此输入错误代价较高，需要确认',
          reason: '内容涉及历史概括/批量推断，自动处理可能导致数据失真',
        });
      }

      // 优先级5：低置信度（仅当前四种都不触发时）
      if (clarifyIssues.length === 0 && llmResult.confidence < 0.7) {
        const fc = (unit as Record<string, unknown>).field_confidence as Record<string, string> | undefined;
        const guessFields = fc ? Object.entries(fc).filter(([, v]) => v === 'guess').map(([k]) => k) : [];
        if (guessFields.length > 0 || !(unit as Record<string, unknown>).action) {
          clarifyIssues.push({
            type: 'low_confidence',
            unitIndex: 0,
            message: '部分信息AI不太确定',
            reason: '输入过于模糊，AI无法准确识别关键字段',
          });
        }
      }

      // --- 有歧义：弹出澄清框 ---
      if (clarifyIssues.length > 0) {
        const clarify: ClarificationNeeded = {
          recordId,
          recordIds: [recordId],
          issues: clarifyIssues,
          timestamp: Date.now(),
          originalInput: inputText,
        };

        // 判断用户是否仍在页面（5秒内）
        const timeSinceInteraction = Date.now() - lastInteractionRef.current;
        if (timeSinceInteraction <= 5000) {
          setClarification(clarify);
          // 30秒超时自动关闭
          const tid = setTimeout(() => {
            setClarification(null);
            setDurationInputs({});
            setSelectedClarifyOption({});
          }, 30000);
          setClarificationTimeoutRef(tid);
        }
        // >5秒：不弹框，记录卡片上标“待确认”由 RecordItem 组件处理
      }

      // --- 复合句拆分预览：拦截 units[1..N]，让用户确认 ---
      if (batchId && llmResult.units.length > 1) {
        setSplitPreview({
          recordId,
          inputText,
          date,
          units: llmResult.units as Array<Record<string, unknown>>,
          typeHints: type_hints,
          batchId,
        });
      }

      // 刷新列表显示 AI 增强结果
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
    // sub_item_hint 匹配：AI 返回的子项提示词匹配子项
    // 注意：这里用 subItemsForSelectedItem 是基于闭包，可能陈旧
    // 实际子项匹配在 enhanceWithAi 中已用 API 重新获取，这里仅作首次快速匹配
    if (typeof unit.sub_item_hint === 'string' && unit.sub_item_hint && update.item_id) {
      const hint = unit.sub_item_hint.toLowerCase();
      // 优先用 action 匹配子项
      const action = typeof unit.action === 'string' ? unit.action : '';
      const actionLower = action.toLowerCase();
      const subMatch =
        (actionLower ? subItemsForSelectedItem.find(s => s.title.toLowerCase().includes(actionLower)) : undefined) ||
        subItemsForSelectedItem.find(s => s.title.toLowerCase() === hint) ||
        subItemsForSelectedItem.find(s => s.title.toLowerCase().includes(hint) || hint.includes(s.title.toLowerCase()));
      if (subMatch) update.sub_item_id = subMatch.id;
    }
    // sub_item 兜底：有 item_id 但没有 sub_item_id 时，用 action > metric.name 匹配子项
    if (update.item_id && !update.sub_item_id && unit.metric && typeof unit.metric === 'object') {
      const action = typeof unit.action === 'string' ? unit.action : '';
      const actionLower = action.toLowerCase();
      // 优先 action 匹配
      let subMatch = actionLower
        ? subItemsForSelectedItem.find(s => s.title.toLowerCase().includes(actionLower))
        : undefined;
      // 兜底 metric.name 匹配
      if (!subMatch) {
        const metricName = (unit.metric as Record<string, unknown>).name as string | undefined;
        if (metricName) {
          const needle = metricName.toLowerCase();
          subMatch =
            subItemsForSelectedItem.find(s => s.title.toLowerCase() === needle) ||
            subItemsForSelectedItem.find(s => s.title.toLowerCase().includes(needle) || needle.includes(s.title.toLowerCase()));
        }
      }
      if (subMatch) update.sub_item_id = subMatch.id;
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
    const capturedSubItemId = selectedSubItemId;
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
        // 拆分模式：也传 time_anchor_date 以便后端正确归属 record_day
        if (capturedParsed.date_hint) body.time_anchor_date = capturedParsed.date_hint;

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
        // content 生成优先级：用户手写 > AI摘要 > 本地content_hint > 原始输入
        const localSummary = capturedParsed.parsed_semantic
          ? generateContentSummary(capturedParsed.parsed_semantic, capturedRaw)
          : null;
        const body: Record<string, unknown> = {
          content: capturedContent || localSummary || capturedParsed.content_hint || capturedRaw,
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

        // 子项
        if (capturedSubItemId) {
          body.sub_item_id = capturedSubItemId;
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
      {splitNotice && !splitPreview && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700 animate-in fade-in">
          <Split className="h-3.5 w-3.5 shrink-0" />
          {splitNotice}
        </div>
      )}

      {/* 降级模式提示条 */}
      {fallbackMessage && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 animate-in fade-in">
          <Zap className="h-3.5 w-3.5 shrink-0" />
          {fallbackMessage}
        </div>
      )}

      {/* AI 复合句拆分预览（用户确认后才创建额外记录） */}
      {splitPreview && (
        <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <Split className="h-4 w-4 text-indigo-500 shrink-0" />
            <span className="text-xs font-semibold text-indigo-700">
              AI 检测到 {splitPreview.units.length} 条独立记录，确认后一次性创建
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {splitPreview.units.map((unit, i) => {
              const action = typeof unit.action === 'string' ? unit.action : '';
              const obj = typeof unit.object === 'string' ? unit.object : '';
              const label = obj ? `${action}${obj}` : (action || `第${i + 1}条`);
              const typeHint = splitPreview.typeHints[i] || '发生';
              const metric = unit.metric && typeof unit.metric === 'object'
                ? (unit.metric as Record<string, unknown>)
                : null;
              const itemHint = typeof unit.item_hint === 'string' ? unit.item_hint : null;
              const sharedCtx = Array.isArray(unit.shared_context) ? unit.shared_context as Array<{ field: string; value: unknown; raw: string }> : null;
              const fieldConf = unit.field_confidence as Record<string, string> | undefined;
              const hasGuess = fieldConf && Object.values(fieldConf).some(v => v === 'guess');
              return (
                <div key={i} className="rounded-lg bg-white border border-indigo-100 px-2 py-1.5 text-[10px] space-y-0.5">
                  <div className="flex items-center gap-1">
                    <span className={`rounded px-1 py-0 text-[9px] font-medium ${
                      typeHint === '发生' ? 'bg-green-100 text-green-700' :
                      typeHint === '计划' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{typeHint}</span>
                    <span className="text-slate-700 font-medium truncate">{label}</span>
                    {hasGuess && (
                      <span className="inline-flex items-center shrink-0 text-amber-500" title="AI 对部分字段不确定">
                        <Activity className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  {metric && (
                    <div className="text-indigo-500">
                      +{String(metric.value ?? '')}{String(metric.unit ?? '')} {String(metric.name ?? '')}
                    </div>
                  )}
                  {itemHint && (
                    <div className="text-slate-400 truncate">{itemHint}</div>
                  )}
                  {sharedCtx && sharedCtx.length > 0 && (
                    <div className="text-amber-500 truncate">
                      共享：{sharedCtx.map(sc => sc.raw).join('、')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={confirmSplitUnits}
              className="flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-indigo-600 transition-colors"
            >
              <CheckCircle2 className="h-3 w-3" />
              确认全部提交
            </button>
            <button
              onClick={dismissSplitPreview}
              className="flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-[11px] text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <X className="h-3 w-3" />
              仅保留主记录
            </button>
          </div>
        </div>
      )}

      {/* AI 歧义澄清框 */}
      {clarification && (
        <div
          className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-3 space-y-3"
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleClarifyConfirm(); }
            if (e.key === 'Escape') { e.preventDefault(); handleClarifySkip(); }
          }}
          tabIndex={0}
        >
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-xs font-semibold text-amber-700">
              {fallbackMessage ? '基础模式 — 需要手动确认归类' : 'AI 解析结果需要确认'}
            </span>
          </div>
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
                      onChange={(e) => setDurationInputs(prev => ({ ...prev, [`${issue.unitIndex}_0`]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Tab') return; }}
                    />
                    <span className="text-slate-400">分钟，</span>
                    <input
                      type="number"
                      placeholder="分钟"
                      className="w-16 rounded border border-amber-200 bg-white px-1.5 py-0.5 text-[11px] focus:border-amber-400 focus:outline-none"
                      value={durationInputs[`${issue.unitIndex}_1`] || ''}
                      onChange={(e) => setDurationInputs(prev => ({ ...prev, [`${issue.unitIndex}_1`]: e.target.value }))}
                    />
                    <span className="text-slate-400">分钟</span>
                  </div>
                  <div className="flex gap-2 text-[10px]">
                    <button
                      className="rounded bg-amber-100 px-2 py-0.5 text-amber-700 hover:bg-amber-200 transition-colors"
                      onClick={() => {
                        const total = typeof issue.sharedContext!.value === 'number' ? issue.sharedContext!.value : 0;
                        const half = Math.round(total / 2);
                        setDurationInputs(prev => ({ ...prev, [`${issue.unitIndex}_0`]: String(half), [`${issue.unitIndex}_1`]: String(total - half) }));
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
                          onChange={(e) => setSelectedClarifyOption(prev => ({ ...prev, [`sub_item_${issue.unitIndex}`]: e.target.value }))}
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
                        onChange={(e) => setSelectedClarifyOption(prev => ({ ...prev, [`sub_item_${issue.unitIndex}`]: e.target.value }))}
                      />
                      不指定子项
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
                          onChange={(e) => setSelectedClarifyOption(prev => ({ ...prev, [`item_${issue.unitIndex}`]: e.target.value }))}
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
                        onChange={(e) => setSelectedClarifyOption(prev => ({ ...prev, [`item_${issue.unitIndex}`]: e.target.value }))}
                      />
                      不关联事项
                    </label>
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
                        onChange={(e) => setSelectedClarifyOption(prev => ({ ...prev, [`low_conf_${issue.unitIndex}`]: e.target.value }))}
                      />
                      按AI推测结果确认
                    </label>
                    <label className="flex items-center gap-1.5 text-slate-500 cursor-pointer">
                      <input
                        type="radio"
                        name={`low_conf_${issue.unitIndex}`}
                        value="reject"
                        checked={selectedClarifyOption[`low_conf_${issue.unitIndex}`] === 'reject'}
                        onChange={(e) => setSelectedClarifyOption(prev => ({ ...prev, [`low_conf_${issue.unitIndex}`]: e.target.value }))}
                      />
                      忽略不确定字段
                    </label>
                  </div>
                </div>
              )}

              {/* 高风险场景 */}
              {issue.type === 'high_risk' && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-red-600 font-medium">
                    <AlertTriangle className="h-3 w-3" />
                    {issue.message}
                  </div>
                  <div className="text-[11px] text-slate-500">{issue.reason}</div>
                  <div className="flex gap-3 text-[11px]">
                    <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name={`high_risk_${issue.unitIndex}`}
                        value="accept"
                        checked={selectedClarifyOption[`high_risk_${issue.unitIndex}`] !== 'reject'}
                        onChange={(e) => setSelectedClarifyOption(prev => ({ ...prev, [`high_risk_${issue.unitIndex}`]: e.target.value }))}
                      />
                      确认无误，继续
                    </label>
                    <label className="flex items-center gap-1.5 text-slate-500 cursor-pointer">
                      <input
                        type="radio"
                        name={`high_risk_${issue.unitIndex}`}
                        value="reject"
                        checked={selectedClarifyOption[`high_risk_${issue.unitIndex}`] === 'reject'}
                        onChange={(e) => setSelectedClarifyOption(prev => ({ ...prev, [`high_risk_${issue.unitIndex}`]: e.target.value }))}
                      />
                      取消自动处理
                    </label>
                  </div>
                </div>
              )}

              {/* 中风险场景 - 候选确认 */}
              {issue.type === 'medium_risk' && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-600 font-medium">
                    <AlertTriangle className="h-3 w-3" />
                    {issue.message}
                  </div>
                  <div className="text-[11px] text-slate-500">{issue.reason}</div>
                  <div className="flex gap-3 text-[11px]">
                    <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name={`medium_risk_${issue.unitIndex}`}
                        value="accept"
                        checked={selectedClarifyOption[`medium_risk_${issue.unitIndex}`] !== 'edit'}
                        onChange={(e) => setSelectedClarifyOption(prev => ({ ...prev, [`medium_risk_${issue.unitIndex}`]: e.target.value }))}
                      />
                      按AI推测结果确认
                    </label>
                    <label className="flex items-center gap-1.5 text-slate-500 cursor-pointer">
                      <input
                        type="radio"
                        name={`medium_risk_${issue.unitIndex}`}
                        value="edit"
                        checked={selectedClarifyOption[`medium_risk_${issue.unitIndex}`] === 'edit'}
                        onChange={(e) => setSelectedClarifyOption(prev => ({ ...prev, [`medium_risk_${issue.unitIndex}`]: e.target.value }))}
                      />
                      修改原文
                    </label>
                  </div>
                </div>
              )}

              {/* 模糊输入 - 无法理解（A类） */}
              {issue.type === 'fuzzy_unintelligible' && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-red-500 font-medium">
                    <AlertTriangle className="h-3 w-3" />
                    无法理解你的输入
                  </div>
                  <div className="text-[11px] text-slate-500">{issue.reason}</div>
                  <div className="rounded bg-red-50 px-2 py-1.5 text-[11px] text-red-600">
                    请补充你做了什么，或重新描述一下
                  </div>
                </div>
              )}

              {/* 模糊输入 - 信息不足（B类） */}
              {issue.type === 'fuzzy_insufficient' && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-600 font-medium">
                    <AlertTriangle className="h-3 w-3" />
                    信息不足
                  </div>
                  <div className="text-[11px] text-slate-500">{issue.reason}</div>
                  <div className="flex gap-3 text-[11px]">
                    <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name={`fuzzy_insufficient_${issue.unitIndex}`}
                        value="accept_low_precision"
                        checked={selectedClarifyOption[`fuzzy_insufficient_${issue.unitIndex}`] !== 'edit'}
                        onChange={(e) => setSelectedClarifyOption(prev => ({ ...prev, [`fuzzy_insufficient_${issue.unitIndex}`]: e.target.value }))}
                      />
                      先收为低精度记录
                    </label>
                    <label className="flex items-center gap-1.5 text-slate-500 cursor-pointer">
                      <input
                        type="radio"
                        name={`fuzzy_insufficient_${issue.unitIndex}`}
                        value="edit"
                        checked={selectedClarifyOption[`fuzzy_insufficient_${issue.unitIndex}`] === 'edit'}
                        onChange={(e) => setSelectedClarifyOption(prev => ({ ...prev, [`fuzzy_insufficient_${issue.unitIndex}`]: e.target.value }))}
                      />
                      修改原文
                    </label>
                  </div>
                </div>
              )}

              {/* 模糊输入 - 不合理（C类） */}
              {issue.type === 'fuzzy_unreasonable' && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-orange-600 font-medium">
                    <AlertTriangle className="h-3 w-3" />
                    内容过多或存在冲突
                  </div>
                  <div className="text-[11px] text-slate-500">{issue.reason}</div>
                  <div className="rounded bg-orange-50 px-2 py-1.5 text-[11px] text-orange-600">
                    建议将内容拆分为多条记录，或简化后重新输入
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* 操作按钮 */}
          {/* A类(unintelligible)和C类(unreasonable)模糊只能修改原文或取消 */}
          {(() => {
            const isFuzzyBlocked = clarification.issues.some(i => i.type === 'fuzzy_unintelligible' || i.type === 'fuzzy_unreasonable');
            return isFuzzyBlocked ? (
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleClarifyEditOriginal}
                  className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-amber-600 transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                  修改原文
                </button>
                <button
                  onClick={handleClarifyCancel}
                  className="flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-[11px] text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleClarifyConfirm}
                  className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-amber-600 transition-colors"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  确认
                </button>
                <button
                  onClick={handleClarifyEditOriginal}
                  className="flex items-center gap-1 rounded-lg bg-white border border-amber-200 px-3 py-1.5 text-[11px] text-amber-600 hover:bg-amber-50 transition-colors"
                >
                  修改原文
                </button>
                <button
                  onClick={handleClarifyCancel}
                  className="flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-[11px] text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  取消
                </button>
              </div>
            );
          })()}
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

      {/* 语义卡片区：分层展示（主体行+上下文行+数据行+修饰行+关联行） */}
      {chips.length > 0 && (
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 space-y-1.5">
          {/* 主体行 + 上下文行 */}
          <div className="flex items-center flex-wrap gap-1.5">
            {parsed.suggested_item_name && (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 cursor-pointer hover:bg-blue-100 transition-colors" onClick={() => {
                const match = items.find(i => i.title === parsed.suggested_item_name);
                if (match) setSelectedItemId(match.id);
              }}>
                <FolderOpen className="h-2.5 w-2.5" />
                {parsed.suggested_item_name}
              </span>
            )}
            {parsed.content_hint && parsed.content_hint !== rawText.trim() && !splitMode && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                {parsed.content_hint}
              </span>
            )}
            {parsed.type_hint && parsed.type_hint !== '\u53D1\u751F' && (
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                parsed.type_hint === '\u8BA1\u5212' ? 'bg-blue-100 text-blue-700' :
                parsed.type_hint === '\u60F3\u6CD5' ? 'bg-purple-100 text-purple-700' :
                parsed.type_hint === '\u603B\u7ED3' ? 'bg-amber-100 text-amber-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                {parsed.type_hint}
              </span>
            )}
          </div>

          {/* 数据行 */}
          <div className="flex items-center flex-wrap gap-1.5">
            {parsed.metric_value !== undefined && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[11px] text-emerald-700 cursor-pointer hover:bg-emerald-100 transition-colors" onClick={() => {}}>
                <BarChart3 className="h-2.5 w-2.5" />
                {parsed.metric_object ? `${parsed.metric_object} ` : ''}{parsed.metric_value}{parsed.metric_unit || ''}
              </span>
            )}
            {parsed.duration !== undefined && (
              <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[11px] text-violet-700 cursor-pointer hover:bg-violet-100 transition-colors" onClick={() => {}}>
                <Timer className="h-2.5 w-2.5" />
                {(() => { const h = Math.floor(parsed.duration! / 60); const m = parsed.duration! % 60; return h > 0 ? `${h}h${m > 0 ? m + 'min' : ''}` : `${m}\u5206\u949F`; })()}
              </span>
            )}
            {parsed.cost !== undefined && (
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[11px] text-rose-700 cursor-pointer hover:bg-rose-100 transition-colors" onClick={() => {}}>
                <DollarSign className="h-2.5 w-2.5" />
                \u00A5{parsed.cost}
              </span>
            )}
          </div>

          {/* 修饰行 */}
          <div className="flex items-center flex-wrap gap-1.5">
            {parsed.date_hint && (
              <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 border border-orange-200 px-1.5 py-0.5 text-[11px] text-orange-700">
                <Clock className="h-2.5 w-2.5" />
                {parsed.date_hint}
              </span>
            )}
            {parsed.time_hint && (
              <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 border border-orange-200 px-1.5 py-0.5 text-[11px] text-orange-700">
                <Clock className="h-2.5 w-2.5" />
                {parsed.time_hint}
              </span>
            )}
            {parsed.mood_hint && (
              <span className="inline-flex items-center gap-1 rounded-md bg-pink-50 border border-pink-200 px-1.5 py-0.5 text-[11px] text-pink-700">
                <Smile className="h-2.5 w-2.5" />
                {parsed.mood_hint}
              </span>
            )}
            {parsed.energy_hint && (
              <span className="inline-flex items-center gap-1 rounded-md bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 text-[11px] text-yellow-700">
                <Zap className="h-2.5 w-2.5" />
                {parsed.energy_hint}
              </span>
            )}
            {parsed.location_hint && (
              <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 border border-teal-200 px-1.5 py-0.5 text-[11px] text-teal-700">
                <MapPin className="h-2.5 w-2.5" />
                {parsed.location_hint}
              </span>
            )}
            {parsed.people_hint && parsed.people_hint.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-cyan-50 border border-cyan-200 px-1.5 py-0.5 text-[11px] text-cyan-700">
                <Users className="h-2.5 w-2.5" />
                {parsed.people_hint.join(', ')}
              </span>
            )}
            {parsed.status_hint && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600">
                <Activity className="h-2.5 w-2.5" />
                {parsed.status_hint}
              </span>
            )}
          </div>
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
                    不指定子项
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
