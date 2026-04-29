'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Save, Trash2, DollarSign, Timer, BarChart3, Plus, MapPin, Users, Smile, Zap, Activity, Link2, Search, RefreshCw, Layers, HelpCircle } from 'lucide-react';
import type { Record, Tag, Item, RecordType, UpdateRecordPayload, RecordLinkType, SubItem } from '@/types/teto';
import type { ParsedSemantic } from '@/types/semantic';
import { RECORD_TYPES } from '@/types/teto';
import type { RecordLinkWithPeer } from '@/lib/db/record-links';
import { generateContentSummary } from '@/lib/utils/generate-content-summary';

// ================================
// 紧凑 Input（统一样式）
// ================================
function CompactInput({
  icon,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 focus-within:border-blue-400 focus-within:bg-white transition-colors">
      <span className="text-slate-400 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="block text-[9px] text-slate-400 leading-none mb-0.5">{label}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-300 focus:outline-none"
        />
      </div>
    </div>
  );
}

// ================================
// 主组件
// ================================
interface RecordEditDrawerProps {
  record: Record;
  tags: Tag[];
  items: Item[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onError: (message: string) => void;
}

export default function RecordEditDrawer({
  record,
  tags,
  items,
  onClose,
  onSaved,
  onDeleted,
  onError,
}: RecordEditDrawerProps) {
  // --- 状态 ---
  const [content, setContent] = useState(record.content);
  const [type, setType] = useState<RecordType>(record.type);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    record.tags?.map((t) => t.id) || []
  );
  const [selectedItemId, setSelectedItemId] = useState(record.item_id || '');
  const [selectedSubItemId, setSelectedSubItemId] = useState(record.sub_item_id || '');
  const [subItemsForSelectedItem, setSubItemsForSelectedItem] = useState<SubItem[]>([]);
  const [loadingSubItems, setLoadingSubItems] = useState(false);
  const [occurredAt, setOccurredAt] = useState(() => {
    if (!record.occurred_at) return '';
    const d = new Date(record.occurred_at);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [mood, setMood] = useState(record.mood || '');
  const [energy, setEnergy] = useState(record.energy || '');
  const [status, setStatus] = useState(record.status || '');
  const [note, setNote] = useState(record.note || '');
  const [location, setLocation] = useState(record.location || '');
  const [peopleStr, setPeopleStr] = useState((record.people || []).join(', '));
  const [cost, setCost] = useState(record.cost != null ? String(record.cost) : '');
  const [metricName, setMetricName] = useState(record.metric_name || '');
  const [metricValue, setMetricValue] = useState(record.metric_value != null ? String(record.metric_value) : '');
  const [metricUnit, setMetricUnit] = useState(record.metric_unit || '');
  const [durationMinutes, setDurationMinutes] = useState(record.duration_minutes != null ? String(record.duration_minutes) : '');

  // 原始输入编辑
  const [rawInput, setRawInput] = useState(record.raw_input || '');
  const [isEditingRawInput, setIsEditingRawInput] = useState(false);
  const [isReParsing, setIsReParsing] = useState(false);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // --- 关联记录 ---
  const [linkedRecords, setLinkedRecords] = useState<RecordLinkWithPeer[]>([]);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkSearchResults, setLinkSearchResults] = useState<{ id: string; content: string; type: string; occurred_at: string | null }[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [showLinkSearch, setShowLinkSearch] = useState(false);

  // 选事项后，动态拉取该事项的子项列表
  useEffect(() => {
    const itemId = selectedItemId;
    if (!itemId) {
      setSubItemsForSelectedItem([]);
      return;
    }
    setLoadingSubItems(true);
    fetch(`/api/v2/sub-items?item_id=${itemId}`)
      .then(res => res.ok ? res.json() : { data: [] })
      .then(json => setSubItemsForSelectedItem(json.data || []))
      .catch(() => setSubItemsForSelectedItem([]))
      .finally(() => setLoadingSubItems(false));
  }, [selectedItemId]);

  // 加载关联记录
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/v2/record-links?record_id=${record.id}`);
        if (res.ok) {
          const json = await res.json();
          setLinkedRecords(json.data || []);
        }
      } catch { /* 静默 */ }
    })();
  }, [record.id]);

  // 搜索记录（用于手动添加关联）
  const searchRecords = async (q: string) => {
    if (!q.trim()) { setLinkSearchResults([]); return; }
    setLinkSearching(true);
    try {
      const res = await fetch(`/api/v2/records?search=${encodeURIComponent(q)}&limit=8`);
      if (res.ok) {
        const json = await res.json();
        const alreadyLinked = new Set(linkedRecords.map(l => l.peer_id));
        setLinkSearchResults(
          (json.data || []).filter((r: any) => r.id !== record.id && !alreadyLinked.has(r.id))
            .map((r: any) => ({ id: r.id, content: r.content, type: r.type, occurred_at: r.occurred_at }))
        );
      }
    } catch { /* 静默 */ }
    setLinkSearching(false);
  };

  // 添加关联
  const addLink = async (targetId: string) => {
    try {
      const res = await fetch('/api/v2/record-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: record.id,
          target_id: targetId,
          link_type: 'related_to' as RecordLinkType,
        }),
      });
      if (res.ok) {
        // 重新加载关联列表
        const listRes = await fetch(`/api/v2/record-links?record_id=${record.id}`);
        if (listRes.ok) {
          const json = await listRes.json();
          setLinkedRecords(json.data || []);
        }
        setLinkSearch('');
        setLinkSearchResults([]);
        setShowLinkSearch(false);
      }
    } catch { /* 静默 */ }
  };

  // 删除关联
  const removeLink = async (linkId: string) => {
    try {
      const res = await fetch(`/api/v2/record-links?id=${linkId}`, { method: 'DELETE' });
      if (res.ok) {
        setLinkedRecords(prev => prev.filter(l => l.id !== linkId));
      }
    } catch { /* 静默 */ }
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  // --- 重新 AI 解析原始输入 ---
  const handleReParse = async () => {
    if (!rawInput.trim() || isReParsing) return;
    setIsReParsing(true);
    try {
      const date = record.date || new Date().toISOString().split('T')[0];
      // 获取近期记录作为上下文
      let recentRecords: Array<{ id: string; content: string; date: string; type: string }> | undefined;
      try {
        const now = new Date();
        const threeDaysAgo = new Date(now);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const recentRes = await fetch(`/api/v2/records?date_from=${fmtDate(threeDaysAgo)}&date_to=${fmtDate(now)}`);
        if (recentRes.ok) {
          const recentJson = await recentRes.json();
          if (Array.isArray(recentJson.data)) {
            recentRecords = recentJson.data.map((r: { id: string; content: string; date: string; type: string }) => ({
              id: r.id, content: r.content, date: r.date, type: r.type,
            }));
          }
        }
      } catch { /* 获取近期记录失败不影响重解析 */ }

      const parseRes = await fetch('/api/v2/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: rawInput.trim(),
          date,
          recent_records: recentRecords,
          items: items.map(i => ({ id: i.id, title: i.title })),
        }),
      });
      if (!parseRes.ok) { onError('AI 解析失败'); return; }
      const json = await parseRes.json();
      if (!json?.data?.parsed?.units?.[0]) { onError('AI 解析返回空结果'); return; }

      const unit = json.data.parsed.units[0] as ParsedSemantic;
      const typeHint = json.data.type_hints?.[0] as string | undefined;

      // 用 AI 解析结果覆盖所有结构化字段
      const newContent = generateContentSummary(unit, rawInput);
      if (newContent) setContent(newContent);
      if (typeHint && ['发生', '计划', '想法', '总结'].includes(typeHint)) setType(typeHint as RecordType);
      if (unit.mood) setMood(unit.mood);
      if (unit.energy) setEnergy(unit.energy);
      if (unit.location) setLocation(unit.location);
      if (unit.people && unit.people.length > 0) setPeopleStr(unit.people.join(', '));
      if (unit.cost != null && unit.cost > 0) setCost(String(unit.cost));
      if (unit.duration_minutes != null && unit.duration_minutes > 0) setDurationMinutes(String(unit.duration_minutes));
      if (unit.metric) {
        if (unit.metric.name) setMetricName(unit.metric.name);
        if (unit.metric.value != null) setMetricValue(String(unit.metric.value));
        if (unit.metric.unit) setMetricUnit(unit.metric.unit);
      }
      // item_hint 匹配
      if (unit.item_hint) {
        const hint = unit.item_hint.toLowerCase();
        const matched = items.find(i => i.title.toLowerCase() === hint)
          || items.find(i => i.title.toLowerCase().includes(hint))
          || items.find(i => hint.includes(i.title.toLowerCase()) && i.title.length >= 2);
        if (matched) setSelectedItemId(matched.id);
      }

      setIsEditingRawInput(false);
    } catch {
      onError('AI 重新解析失败，请重试');
    } finally {
      setIsReParsing(false);
    }
  };

  // --- 保存 ---
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload: UpdateRecordPayload = {
        content,
        type,
        tag_ids: selectedTagIds,
        mood: mood || undefined,
        energy: energy || undefined,
        status: status || undefined,
        note: note || undefined,
        location: location.trim() || null,
        people: peopleStr.trim()
          ? peopleStr.split(/[,，、]/).map(s => s.trim()).filter(Boolean)
          : null,
        cost: cost ? parseFloat(cost) : null,
        metric_value: metricValue ? parseFloat(metricValue) : null,
        metric_unit: metricUnit.trim() || null,
        metric_name: metricName.trim() || null,
        duration_minutes: durationMinutes ? parseInt(durationMinutes, 10) : null,
      };

      if (occurredAt) {
        const dateStr = record.occurred_at
          ? record.occurred_at.split('T')[0]
          : new Date().toISOString().split('T')[0];
        const tzOffset = -new Date().getTimezoneOffset();
        const sign = tzOffset >= 0 ? '+' : '-';
        const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
        const tzStr = `${sign}${pad(tzOffset / 60)}:${pad(tzOffset % 60)}`;
        payload.occurred_at = `${dateStr}T${occurredAt}:00${tzStr}`;
      } else {
        payload.occurred_at = null;
      }

      payload.item_id = selectedItemId || null;
      payload.sub_item_id = selectedSubItemId || null;

      // 如果原始输入被编辑过，也传回 raw_input
      if (rawInput && rawInput !== record.raw_input) {
        payload.raw_input = rawInput;
      }

      // 清除 needs_clarification 标记（用户手动编辑 = 已确认）
      const ps = record.parsed_semantic as { needs_clarification?: boolean } | null;
      if (ps?.needs_clarification) {
        payload.parsed_semantic = { ...ps, needs_clarification: false } as any;
      }

      const res = await fetch(`/api/v2/records/${record.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onSaved();
      } else {
        const err = await res.json();
        onError(err.error || '保存失败');
      }
    } catch {
      onError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  // --- 删除 ---
  const handleDelete = async () => {
    if (deleting) return;
    if (!confirm('确定要删除这条记录吗？')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v2/records/${record.id}`, { method: 'DELETE' });
      if (res.ok) {
        onDeleted();
      } else {
        const err = await res.json();
        onError(err.error || '删除失败');
      }
    } catch {
      onError('删除失败，请重试');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* 抽屉 */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto bg-white shadow-xl lg:rounded-l-2xl">
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h2 className="text-sm font-bold text-slate-900">编辑记录</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </button>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* ================================ */}
          {/* 区块 1: 核心内容 */}
          {/* ================================ */}
          {/* 原始输入（可编辑 + 重新解析） */}
          {(rawInput || record.raw_input) && (
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-slate-400">原始输入</span>
                {!isEditingRawInput ? (
                  <button
                    onClick={() => setIsEditingRawInput(true)}
                    className="text-[10px] text-blue-500 hover:text-blue-600"
                  >
                    编辑
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleReParse}
                      disabled={isReParsing || !rawInput.trim()}
                      className="flex items-center gap-0.5 rounded-md bg-indigo-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                    >
                      <RefreshCw className={`h-2.5 w-2.5 ${isReParsing ? 'animate-spin' : ''}`} />
                      {isReParsing ? '解析中...' : '重新解析'}
                    </button>
                    <button
                      onClick={() => { setRawInput(record.raw_input || ''); setIsEditingRawInput(false); }}
                      className="text-[10px] text-slate-400 hover:text-slate-600"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
              {isEditingRawInput ? (
                <textarea
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none resize-none"
                />
              ) : (
                <p className="text-xs text-slate-500 leading-relaxed">{rawInput}</p>
              )}
            </div>
          )}

          {/* 内容（大文本框） */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">内容</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* ================================ */}
          {/* 区块 2: 基础属性（类型 + 时间 并排，事项全行） */}
          {/* ================================ */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              {/* 类型 */}
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">类型</label>
                <div className="flex flex-wrap gap-1">
                  {RECORD_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                        type === t
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              {/* 时间 */}
              <div className="w-28 shrink-0">
                <label className="mb-1 block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">时间</label>
                <input
                  type="time"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            {/* 关联事项 */}
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">关联事项</label>
              <select
                value={selectedItemId}
                onChange={(e) => {
                  setSelectedItemId(e.target.value);
                  setSelectedSubItemId(''); // 事项变化时清空子项
                }}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                <option value="">不选择</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
            </div>

            {/* 关联子项 — 仅当选中了有子项的事项时显示 */}
            {selectedItemId && subItemsForSelectedItem.length > 0 && (
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  关联子项 <span className="font-normal text-slate-400">（可选）</span>
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

            {/* 关联记录 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">关联记录</label>
                <button
                  onClick={() => setShowLinkSearch(v => !v)}
                  className="flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-600"
                >
                  <Plus className="h-3 w-3" />添加
                </button>
              </div>

              {/* 已关联列表 */}
              {linkedRecords.length > 0 ? (
                <div className="space-y-1">
                  {linkedRecords.map((link) => {
                    const timeStr = link.peer_occurred_at
                      ? new Date(link.peer_occurred_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '';
                    return (
                      <div key={link.id} className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5 group">
                        <Link2 className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="flex-1 min-w-0 text-xs text-slate-700 truncate">
                          {link.peer_content}
                        </span>
                        {timeStr && <span className="text-[10px] text-slate-400 shrink-0">{timeStr}</span>}
                        <span className="text-[9px] text-slate-300 shrink-0">{link.link_type}</span>
                        <button
                          onClick={() => removeLink(link.id)}
                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity shrink-0"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-slate-300">暂无关联记录</p>
              )}

              {/* 搜索添加 */}
              {showLinkSearch && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
                    <Search className="h-3 w-3 text-slate-400" />
                    <input
                      type="text"
                      value={linkSearch}
                      onChange={(e) => { setLinkSearch(e.target.value); searchRecords(e.target.value); }}
                      placeholder="搜索记录内容..."
                      className="flex-1 bg-transparent text-xs text-slate-900 placeholder:text-slate-300 focus:outline-none"
                      autoFocus
                    />
                  </div>
                  {linkSearching && <p className="text-[10px] text-slate-400">搜索中...</p>}
                  {linkSearchResults.map((r) => {
                    const t = r.occurred_at
                      ? new Date(r.occurred_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
                      : '';
                    return (
                      <button
                        key={r.id}
                        onClick={() => addLink(r.id)}
                        className="flex items-center gap-1.5 w-full rounded-lg px-2 py-1.5 text-left hover:bg-blue-50 transition-colors"
                      >
                        <span className="text-xs text-slate-700 truncate flex-1">{r.content}</span>
                        {t && <span className="text-[10px] text-slate-400 shrink-0">{t}</span>}
                        <span className="text-[10px] text-blue-400 shrink-0">{r.type}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ================================ */}
          {/* 区块 3: 结构化详情（AI 动态能力区） */}
          {/* ================================ */}
          <div>
            <label className="mb-2 block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">结构化详情</label>

            {/* 待确认澄清区域 */}
            {(() => {
              const ps = record.parsed_semantic as { needs_clarification?: boolean; clarification_issues?: Array<{ type: string; message: string; reason: string; options?: Array<{ label: string; value: string }>; sharedContext?: { field: string; value: unknown; raw: string } }> } | null;
              if (!ps?.needs_clarification) return null;
              const issues = ps.clarification_issues || [];
              if (issues.length === 0) return null;
              return (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 mb-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="text-xs font-semibold text-amber-700">AI 解析存在歧义，请确认</span>
                  </div>
                  {issues.map((issue, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="text-[10px] text-amber-600">原因：{issue.reason}</div>
                      <div className="text-[11px] text-slate-700">{issue.message}</div>
                      {issue.type === 'shared_duration' && issue.sharedContext && (
                        <div className="text-[10px] text-amber-500">共享时长：{String(issue.sharedContext.raw)}（请在下方"时长"字段手动补充）</div>
                      )}
                      {issue.type === 'sub_item_ambiguous' && issue.options && (
                        <div className="text-[10px] text-amber-500">请在下方"子项"下拉框中选择正确的子项</div>
                      )}
                      {issue.type === 'item_missing' && (
                        <div className="text-[10px] text-amber-500">请在下方"事项"下拉框中选择关联事项</div>
                      )}
                      {issue.type === 'low_confidence' && (
                        <div className="text-[10px] text-amber-500">请核对下方结构化字段是否正确</div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* AI 判断理由回显 */}
            {(() => {
              const ps = record.parsed_semantic as { reasoning?: string } | null;
              if (!ps?.reasoning) return null;
              return (
                <div className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2.5 mb-2">
                  <div className="flex items-start gap-1.5">
                    <HelpCircle className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-medium text-blue-600">AI 判断理由</span>
                      <p className="text-[11px] text-blue-700 mt-0.5">{ps.reasoning}</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* AI 低置信度提示 */}
            {(() => {
              const ps = record.parsed_semantic;
              const confidence = ps && typeof ps.confidence === 'number' ? ps.confidence : null;
              const fieldConf = ps?.field_confidence || {};
              const guessedFields = Object.entries(fieldConf).filter(([, v]) => v === 'guess').map(([k]) => k);
              if (confidence !== null && confidence < 0.7) {
                const labelMap: { [key: string]: string } = {
                  mood: '心情', energy: '能量', item_hint: '关联事项',
                  type_hint: '类型', location: '地点', people: '关系人',
                  record_link_hint: '关联记录',
                };
                return (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 mb-2">
                    <p className="text-xs font-medium text-amber-700 mb-1">AI 无法确定以下信息，请手动补充</p>
                    {guessedFields.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {guessedFields.map(f => (
                          <span key={f} className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-600">{labelMap[f] || f}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-amber-500">解析置信度较低（{Math.round(confidence * 100)}%），请核对结构化字段</p>
                    )}
                  </div>
                );
              }
              return null;
            })()}
            <div className="grid grid-cols-2 gap-2">
              <CompactInput
                icon={<DollarSign className="h-3 w-3" />}
                label="花费"
                value={cost}
                onChange={setCost}
                placeholder="0"
                type="number"
              />
              <CompactInput
                icon={<Timer className="h-3 w-3" />}
                label="时长(分钟)"
                value={durationMinutes}
                onChange={setDurationMinutes}
                placeholder="0"
                type="number"
              />
              <CompactInput
                icon={<MapPin className="h-3 w-3" />}
                label="地点"
                value={location}
                onChange={setLocation}
                placeholder="如：公司"
              />
              <CompactInput
                icon={<Users className="h-3 w-3" />}
                label="关系人"
                value={peopleStr}
                onChange={setPeopleStr}
                placeholder="逗号分隔"
              />
              <CompactInput
                icon={<Smile className="h-3 w-3" />}
                label="心情"
                value={mood}
                onChange={setMood}
                placeholder="如：开心"
              />
              <CompactInput
                icon={<Zap className="h-3 w-3" />}
                label="能量"
                value={energy}
                onChange={setEnergy}
                placeholder="如：充沛"
              />
              <CompactInput
                icon={<Activity className="h-3 w-3" />}
                label="状态"
                value={status}
                onChange={setStatus}
                placeholder="如：进行中"
              />
            </div>
            {/* 指标（三列一行） */}
            <div className="mt-2 flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 flex-1 focus-within:border-blue-400 focus-within:bg-white transition-colors">
                <BarChart3 className="h-3 w-3 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="block text-[9px] text-slate-400 leading-none mb-0.5">指标</span>
                  <div className="flex items-center gap-1">
                    <input type="text" value={metricName} onChange={(e) => setMetricName(e.target.value)} placeholder="对象"
                      className="w-12 bg-transparent text-xs text-slate-900 placeholder:text-slate-300 focus:outline-none" />
                    <input type="number" value={metricValue} onChange={(e) => setMetricValue(e.target.value)} placeholder="值"
                      className="w-10 bg-transparent text-xs text-slate-900 placeholder:text-slate-300 focus:outline-none" />
                    <input type="text" value={metricUnit} onChange={(e) => setMetricUnit(e.target.value)} placeholder="单位"
                      className="w-10 bg-transparent text-xs text-slate-900 placeholder:text-slate-300 focus:outline-none" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ================================ */}
          {/* 区块 4: 标签 */}
          {/* ================================ */}
          {tags.length > 0 && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">标签</label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      selectedTagIds.includes(tag.id)
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ================================ */}
          {/* 区块 5: 备注 */}
          {/* ================================ */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">备注</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="补充说明..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* 底部保存 */}
        <div className="sticky bottom-0 border-t border-slate-200 bg-white px-5 py-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-600 disabled:bg-blue-300 transition-colors"
          >
            <Save className="h-4 w-4" />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </>
  );
}

