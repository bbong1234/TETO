'use client';

import { Loader2, Plus, X } from 'lucide-react';
import { useState } from 'react';

interface QuickSwitchToolPickerProps {
  entryLabel: string;
  /** 该上下文曾用过的工具（优先展示） */
  contextTools: string[];
  /** 用户工具库全部选项 */
  allTools: string[];
  loading?: boolean;
  onSelect: (toolLabel: string | null) => void;
  onClose: () => void;
}

export default function QuickSwitchToolPicker({
  entryLabel,
  contextTools,
  allTools,
  loading = false,
  onSelect,
  onClose,
}: QuickSwitchToolPickerProps) {
  const [creating, setCreating] = useState(false);
  const [createText, setCreateText] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const contextSet = new Set(contextTools);
  const otherTools = allTools.filter((t) => !contextSet.has(t));
  const orderedTools = [...contextTools, ...otherTools];

  const submitCreate = async () => {
    const title = createText.trim();
    if (!title) return;
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/v2/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? '创建失败');
      const toolTitle = data.data?.title as string | undefined;
      if (!toolTitle) throw new Error('创建成功但未返回数据');
      onSelect(toolTitle);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setCreateSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-switch-tool-title"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id="quick-switch-tool-title" className="text-sm font-semibold text-slate-800">
              选择工具
            </h3>
            <p className="mt-0.5 truncate text-xs text-slate-500">{entryLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载工具…
          </div>
        ) : creating ? (
          <div className="space-y-2">
            <input
              type="text"
              value={createText}
              onChange={(e) => setCreateText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitCreate();
                if (e.key === 'Escape') setCreating(false);
              }}
              placeholder="新工具名称"
              autoFocus
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
            {createError && <p className="text-xs text-red-500">{createError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!createText.trim() || createSubmitting}
                onClick={() => void submitCreate()}
                className="flex-1 rounded-lg bg-blue-500 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {createSubmitting ? '创建中…' : '确定'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setCreateText('');
                  setCreateError(null);
                }}
                className="rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-slate-100"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            >
              不选择工具
            </button>
            {orderedTools.map((tool) => (
              <button
                key={tool}
                type="button"
                onClick={() => onSelect(tool)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-xs font-medium text-slate-800 hover:border-blue-300 hover:bg-blue-50"
              >
                {tool}
                {contextSet.has(tool) && (
                  <span className="ml-1.5 text-[10px] font-normal text-slate-400">最近用过</span>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600"
            >
              <Plus className="h-3.5 w-3.5" />
              新建工具
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
