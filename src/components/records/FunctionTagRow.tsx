'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Tag } from '@/types/teto';
import GraceProgressChip from './GraceProgressChip';

interface FunctionTagRowProps {
  tags: Tag[];
  selectedTagId: string | null;
  onSelect: (tagId: string | null) => void;
  onTagCreated?: (tag: Tag) => void;
  className?: string;
  hideLabel?: boolean;
  /** outline：白底描边，与事项标签一致；indigo：默认职能色 */
  chipVariant?: 'indigo' | 'outline';
  graceActive?: boolean;
  graceExpiresAt?: number | null;
  onGraceUndo?: () => void;
  /** 选中项不在当前动作池时也保持展示（切换事项加载中） */
  pinnedSelectedTag?: Tag | null;
}

/**
 * 职能标签单选行
 * - 只展示 type==='function' 的标签
 * - 点击已选中的标签可取消选中
 * - 支持快捷新建职能标签
 */
export default function FunctionTagRow({
  tags,
  selectedTagId,
  onSelect,
  onTagCreated,
  className = '',
  hideLabel = false,
  chipVariant = 'indigo',
  graceActive = false,
  graceExpiresAt = null,
  onGraceUndo,
  pinnedSelectedTag = null,
}: FunctionTagRowProps) {
  const baseFunctionTags = tags.filter((t) => t.type === 'function');
  const functionTags =
    pinnedSelectedTag &&
    pinnedSelectedTag.type === 'function' &&
    !baseFunctionTags.some((t) => t.id === pinnedSelectedTag.id)
      ? [pinnedSelectedTag, ...baseFunctionTags]
      : baseFunctionTags;
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
        body: JSON.stringify({ name, type: 'function' }),
      });
      const data = await res.json();
      if (res.ok && data.data) {
        onTagCreated?.(data.data);
        onSelect(data.data.id);
        setNewName('');
        setCreating(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const chipClass = (isSelected: boolean) => {
    if (chipVariant === 'outline') {
      return isSelected
        ? 'rounded-full border border-blue-400 bg-blue-500 px-2.5 py-0.5 text-[11px] font-medium text-white'
        : 'rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:border-blue-300';
    }
    return isSelected
      ? 'rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-indigo-500 text-white'
      : 'rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100';
  };

  if (functionTags.length === 0 && !creating) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        {!hideLabel && <span className="text-[11px] text-slate-400 shrink-0">动作</span>}
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
        >
          <Plus className="h-3 w-3" />
          新建动作标签
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      {!hideLabel && <span className="text-[11px] text-slate-400 shrink-0">动作</span>}
      {functionTags.map((tag) => {
        const isSelected = tag.id === selectedTagId;
        const cls = chipClass(isSelected);
        if (isSelected && graceActive && graceExpiresAt) {
          return (
            <GraceProgressChip
              key={tag.id}
              label={tag.name}
              onClick={() => {
                if (isSelected && onGraceUndo) onGraceUndo();
                else onSelect(isSelected ? null : tag.id);
              }}
              graceActive={graceActive}
              graceExpiresAt={graceExpiresAt}
              className={cls}
              accent={chipVariant === 'outline' ? 'blue' : 'indigo'}
            />
          );
        }
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => {
              onSelect(isSelected ? null : tag.id);
            }}
            className={cls}
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
            placeholder="动作名称"
            className="w-20 rounded border border-indigo-300 px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={saving || !newName.trim()}
            className="rounded px-1.5 py-0.5 text-[11px] bg-indigo-500 text-white disabled:opacity-50"
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
          className="flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
