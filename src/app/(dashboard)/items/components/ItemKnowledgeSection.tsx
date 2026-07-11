'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Loader2, Plus, X } from 'lucide-react';
import type { ProjectNote, ProjectNoteType } from '@/types/teto';

interface ItemKnowledgeSectionProps {
  itemId: string;
}

const NOTE_TYPE_LABELS: Record<ProjectNoteType, string> = {
  knowledge: '知识',
  review: '复盘',
  insight: '洞察',
  reflection: '反思',
  milestone: '里程碑',
};

const NOTE_TYPE_STYLES: Record<ProjectNoteType, string> = {
  knowledge: 'bg-blue-50 text-blue-600',
  review: 'bg-indigo-50 text-indigo-600',
  insight: 'bg-purple-50 text-purple-600',
  reflection: 'bg-slate-100 text-slate-600',
  milestone: 'bg-green-50 text-green-600',
};

export default function ItemKnowledgeSection({ itemId }: ItemKnowledgeSectionProps) {
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/project-notes?item_id=${itemId}&limit=50`);
      const data = await res.json();
      if (res.ok) setNotes(data.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async () => {
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v2/project-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, content, note_type: 'knowledge' }),
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setNotes((prev) => [data.data, ...prev]);
        setDraft('');
        setAdding(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/v2/project-notes?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-medium text-slate-800">知识库</h3>
          {!loading && notes.length > 0 && (
            <span className="text-[11px] text-slate-400 tabular-nums">{notes.length}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-500 hover:border-blue-300 hover:text-blue-600"
        >
          <Plus className="h-3 w-3" />
          记一条
        </button>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-400">
        计时中报备的想法与里程碑会自动沉淀到这里
      </p>

      {adding && (
        <div className="mt-2 flex items-start gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="记录一条知识 / 心得…"
            rows={2}
            className="min-w-0 flex-1 resize-none rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-300 focus:outline-none"
          />
          <button
            type="button"
            disabled={saving || !draft.trim()}
            onClick={() => void handleAdd()}
            className="rounded-lg bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '保存'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="mt-2 text-[11px] text-slate-400">加载中…</p>
      ) : notes.length === 0 ? (
        <p className="mt-2 text-[11px] text-slate-400">暂无知识沉淀</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className="group flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2"
            >
              <span
                className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  NOTE_TYPE_STYLES[note.note_type] ?? NOTE_TYPE_STYLES.knowledge
                }`}
              >
                {NOTE_TYPE_LABELS[note.note_type] ?? '知识'}
              </span>
              <p className="min-w-0 flex-1 break-words text-xs text-slate-700">{note.content}</p>
              <button
                type="button"
                onClick={() => void handleDelete(note.id)}
                className="shrink-0 text-slate-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                aria-label="删除"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
