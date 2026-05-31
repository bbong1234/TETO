'use client';

import { useEffect, useState } from 'react';
import { Link2, Plus, Search, X } from 'lucide-react';
import type { RecordLinkType } from '@/types/teto';
import type { RecordLinkWithPeer } from '@/lib/db/record-links';

interface RecordEditLinksSectionProps {
  recordId: string;
}

export default function RecordEditLinksSection({ recordId }: RecordEditLinksSectionProps) {
  const [linkedRecords, setLinkedRecords] = useState<RecordLinkWithPeer[]>([]);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkSearchResults, setLinkSearchResults] = useState<
    { id: string; content: string; type: string; occurred_at: string | null }[]
  >([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [showLinkSearch, setShowLinkSearch] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/v2/record-links?record_id=${recordId}`);
        if (res.ok) {
          const json = await res.json();
          setLinkedRecords(json.data || []);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [recordId]);

  const reloadLinks = async () => {
    const listRes = await fetch(`/api/v2/record-links?record_id=${recordId}`);
    if (listRes.ok) {
      const json = await listRes.json();
      setLinkedRecords(json.data || []);
    }
  };

  const searchRecords = async (q: string) => {
    if (!q.trim()) {
      setLinkSearchResults([]);
      return;
    }
    setLinkSearching(true);
    try {
      const res = await fetch(`/api/v2/records?search=${encodeURIComponent(q)}&limit=8`);
      if (res.ok) {
        const json = await res.json();
        const alreadyLinked = new Set(linkedRecords.map((l) => l.peer_id));
        setLinkSearchResults(
          (json.data || [])
            .filter((r: { id: string }) => r.id !== recordId && !alreadyLinked.has(r.id))
            .map((r: { id: string; content: string; type: string; occurred_at: string | null }) => ({
              id: r.id,
              content: r.content,
              type: r.type,
              occurred_at: r.occurred_at,
            }))
        );
      }
    } catch {
      /* ignore */
    }
    setLinkSearching(false);
  };

  const addLink = async (targetId: string) => {
    try {
      const res = await fetch('/api/v2/record-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: recordId,
          target_id: targetId,
          link_type: 'related_to' as RecordLinkType,
        }),
      });
      if (res.ok) {
        await reloadLinks();
        setLinkSearch('');
        setLinkSearchResults([]);
        setShowLinkSearch(false);
      }
    } catch {
      /* ignore */
    }
  };

  const removeLink = async (linkId: string) => {
    try {
      const res = await fetch(`/api/v2/record-links?id=${linkId}`, { method: 'DELETE' });
      if (res.ok) setLinkedRecords((prev) => prev.filter((l) => l.id !== linkId));
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] text-slate-400">关联记录</label>
        <button
          type="button"
          onClick={() => setShowLinkSearch((v) => !v)}
          className="flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-600"
        >
          <Plus className="h-3 w-3" />
          添加
        </button>
      </div>

      {linkedRecords.length > 0 ? (
        <div className="space-y-1">
          {linkedRecords.map((link) => {
            const timeStr = link.peer_occurred_at
              ? new Date(link.peer_occurred_at).toLocaleDateString('zh-CN', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '';
            return (
              <div key={link.id} className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5 group">
                <Link2 className="h-3 w-3 text-slate-400 shrink-0" />
                <span className="flex-1 min-w-0 text-xs text-slate-700 truncate">{link.peer_content}</span>
                {timeStr && <span className="text-[10px] text-slate-400 shrink-0">{timeStr}</span>}
                <span className="text-[9px] text-slate-300 shrink-0">{link.link_type}</span>
                <button
                  type="button"
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

      {showLinkSearch && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
            <Search className="h-3 w-3 text-slate-400" />
            <input
              type="text"
              value={linkSearch}
              onChange={(e) => {
                setLinkSearch(e.target.value);
                void searchRecords(e.target.value);
              }}
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
                type="button"
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
  );
}
