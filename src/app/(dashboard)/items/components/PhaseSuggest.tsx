'use client';

import { useState, useEffect } from 'react';
import { Loader2, Check, Pencil, X, Sparkles, Calendar } from 'lucide-react';

interface PhaseSuggestion {
  title: string;
  start_date: string;
  end_date: string;
  reason: string;
}

interface PhaseSuggestProps {
  itemId: string;
  onClose: () => void;
  onPhaseCreated: () => void;
  onError: (message: string) => void;
}

export default function PhaseSuggest({ itemId, onClose, onPhaseCreated, onError }: PhaseSuggestProps) {
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<PhaseSuggestion[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v2/phases/suggest?item_id=${itemId}`);
        if (res.ok) {
          const json = await res.json();
          setSuggestions(json.data || []);
        } else {
          const err = await res.json();
          onError(err.error || '获取建议失败');
        }
      } catch {
        onError('获取建议失败，请重试');
      } finally {
        setLoading(false);
      }
    })();
  }, [itemId]);

  const handleAdopt = async (suggestion: PhaseSuggestion) => {
    setCreating(suggestion.title);
    try {
      const res = await fetch('/api/v2/phases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: itemId,
          title: suggestion.title,
          start_date: suggestion.start_date,
          end_date: suggestion.end_date,
          status: '已结束',
        }),
      });
      if (res.ok) {
        setSuggestions(prev => prev.filter(s => s.title !== suggestion.title));
        onPhaseCreated();
      } else {
        const err = await res.json();
        onError(err.error || '创建阶段失败');
      }
    } catch {
      onError('创建阶段失败，请重试');
    } finally {
      setCreating(null);
    }
  };

  const handleEditAndAdopt = async (original: PhaseSuggestion, editedTitle: string, editedStart: string, editedEnd: string) => {
    setCreating(original.title);
    try {
      const res = await fetch('/api/v2/phases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: itemId,
          title: editedTitle.trim(),
          start_date: editedStart,
          end_date: editedEnd,
          status: '已结束',
        }),
      });
      if (res.ok) {
        setSuggestions(prev => prev.filter(s => s !== original));
        setEditingIdx(null);
        onPhaseCreated();
      } else {
        const err = await res.json();
        onError(err.error || '创建阶段失败');
      }
    } catch {
      onError('创建阶段失败，请重试');
    } finally {
      setCreating(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative bg-white rounded-3xl shadow-xl w-[520px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-800">从记录生成阶段</h3>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                <span className="ml-2 text-sm text-slate-400">分析记录模式中...</span>
              </div>
            ) : suggestions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Sparkles className="h-8 w-8 text-slate-300 mb-2" />
                <p className="text-sm">暂无可建议的阶段</p>
                <p className="text-xs text-slate-300 mt-1">记录不够多或已有阶段已覆盖</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-400 mb-2">
                  根据记录密度和趋势分析，以下时间段值得归纳为阶段。你可以直接采纳，或修改后创建。
                </p>
                {suggestions.map((s, idx) => {
                  const isEditing = editingIdx === idx;
                  return isEditing ? (
                    <EditCard
                      key={idx}
                      suggestion={s}
                      onSave={(title, start, end) => handleEditAndAdopt(s, title, start, end)}
                      onCancel={() => setEditingIdx(null)}
                    />
                  ) : (
                    <div key={idx} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-slate-800">{s.title}</h4>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
                            <Calendar className="h-3 w-3" />
                            {s.start_date} — {s.end_date}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleAdopt(s)}
                            disabled={creating === s.title}
                            className="flex items-center gap-1 rounded-lg bg-indigo-500 px-2.5 py-1.5 text-[10px] font-medium text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                          >
                            {creating === s.title ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            采纳
                          </button>
                          <button
                            onClick={() => setEditingIdx(idx)}
                            className="flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                          >
                            <Pencil className="h-3 w-3" />
                            修改
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500">{s.reason}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function EditCard({
  suggestion,
  onSave,
  onCancel,
}: {
  suggestion: PhaseSuggestion;
  onSave: (title: string, start: string, end: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(suggestion.title);
  const [startDate, setStartDate] = useState(suggestion.start_date);
  const [endDate, setEndDate] = useState(suggestion.end_date);

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-2">
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
        autoFocus
      />
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
        />
        <span className="text-xs text-slate-400">—</span>
        <input
          type="date"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
        />
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button onClick={onCancel} className="rounded-lg px-3 py-1 text-[10px] text-slate-500 hover:text-slate-700">取消</button>
        <button
          onClick={() => onSave(title, startDate, endDate)}
          className="rounded-lg bg-indigo-500 px-3 py-1 text-[10px] font-medium text-white hover:bg-indigo-600"
        >
          创建
        </button>
      </div>
    </div>
  );
}
