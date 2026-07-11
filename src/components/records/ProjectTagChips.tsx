'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Tag } from '@/types/teto';

interface ProjectTagChipsProps {
  tags: Tag[];
  selectedTagIds: string[];
  onToggle: (tagId: string) => void;
  onTagCreated?: (tag: Tag) => void;
  className?: string;
}

/**
 * 项目标签多选行
 * - 只展示 type==='project' 的标签
 * - 点击已选中的标签可取消选中（多选）
 * - 支持快捷新建项目标签
 */
export default function ProjectTagChips({
  tags,
  selectedTagIds,
  onToggle,
  onTagCreated,
  className = '',
}: ProjectTagChipsProps) {
  const projectTags = tags.filter((t) => t.type === 'project');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v2/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: 'project' }),
      });
      const data = await res.json();
      if (res.ok && data.data) {
        onTagCreated?.(data.data);
        onToggle(data.data.id);
        setNewName('');
        setCreating(false);
      }
    } finally {
      setSaving(false);
    }
  };

  if (projectTags.length === 0 && !creating) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <span className="text-[11px] text-slate-400 shrink-0">项目标签</span>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-400 hover:border-emerald-400 hover:text-emerald-500 transition-colors"
        >
          <Plus className="h-3 w-3" />
          新建项目标签
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      <span className="text-[11px] text-slate-400 shrink-0">项目标签</span>
      {projectTags.map((tag) => {
        const isSelected = selectedTagIds.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => onToggle(tag.id)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
              isSelected
                ? 'bg-emerald-500 text-white'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            {tag.name}
          </button>
        );
      })}
      {creating ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
              if (e.key === 'Escape') { setCreating(false); setNewName(''); }
            }}
            placeholder="标签名称"
            className="w-20 rounded border border-emerald-300 px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-300"
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={saving || !newName.trim()}
            className="rounded px-1.5 py-0.5 text-[11px] bg-emerald-500 text-white disabled:opacity-50"
          >
            {saving ? '…' : '确定'}
          </button>
          <button
            type="button"
            onClick={() => { setCreating(false); setNewName(''); }}
            className="rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:text-slate-600"
          >
            取消
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-400 hover:border-emerald-400 hover:text-emerald-500 transition-colors"
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
