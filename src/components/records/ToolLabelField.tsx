'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { UserTool } from '@/types/teto';

const NO_TOOL_OPTION = '__no_tool__';
const CREATE_TOOL_OPTION = '__create_tool__';

interface ToolLabelFieldProps {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  /** 父级已加载工具列表时传入，避免重复请求 */
  tools?: UserTool[];
  toolsLoading?: boolean;
  onToolsChange?: (tools: UserTool[]) => void;
}

export default function ToolLabelField({
  value,
  onChange,
  compact = false,
  tools: toolsProp,
  toolsLoading: toolsLoadingProp,
  onToolsChange,
}: ToolLabelFieldProps) {
  const [localTools, setLocalTools] = useState<UserTool[]>([]);
  const [localLoading, setLocalLoading] = useState(toolsProp === undefined);
  const useExternal = toolsProp !== undefined;
  const tools = useExternal ? toolsProp : localTools;
  const loading = useExternal ? (toolsLoadingProp ?? false) : localLoading;

  const setTools = useCallback(
    (next: UserTool[] | ((prev: UserTool[]) => UserTool[])) => {
      if (useExternal) {
        const resolved = typeof next === 'function' ? next(toolsProp ?? []) : next;
        onToolsChange?.(resolved);
      } else {
        setLocalTools(next);
      }
    },
    [useExternal, onToolsChange, toolsProp]
  );

  const fetchTools = useCallback(async () => {
    if (useExternal) return;
    setLocalLoading(true);
    try {
      const res = await fetch('/api/v2/tools');
      const data = await res.json();
      if (res.ok) setLocalTools(data.data ?? []);
    } catch {
      setLocalTools([]);
    } finally {
      setLocalLoading(false);
    }
  }, [useExternal]);

  useEffect(() => {
    if (useExternal) return;
    void fetchTools();
  }, [fetchTools, useExternal]);

  const [creating, setCreating] = useState(false);
  const [createText, setCreateText] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const toolTitles = tools.map((t) => t.title);
  const hasOrphanValue = Boolean(value && !toolTitles.includes(value));

  const selectClass =
    'flex-1 min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-200 disabled:opacity-50';

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
      const tool: UserTool | null = data.data ?? null;
      if (!tool?.title) throw new Error('创建成功但未返回数据');
      setTools((prev) => (prev.some((t) => t.id === tool.id) ? prev : [...prev, tool]));
      onChange(tool.title);
      setCreating(false);
      setCreateText('');
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setCreateSubmitting(false);
    }
  };

  if (creating) {
    return (
      <div className={compact ? 'flex items-center gap-2' : 'space-y-1'}>
        {compact ? (
          <span className="text-[10px] text-slate-400 w-10 shrink-0">工具</span>
        ) : (
          <label className="text-[10px] text-slate-400">工具/载体</label>
        )}
        <div className="flex flex-1 items-center gap-1.5 min-w-0">
          <input
            type="text"
            value={createText}
            onChange={(e) => setCreateText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitCreate();
              if (e.key === 'Escape') {
                setCreating(false);
                setCreateText('');
                setCreateError(null);
              }
            }}
            placeholder="新工具名称，如：不背单词"
            autoFocus
            className={selectClass}
          />
          <button
            type="button"
            disabled={!createText.trim() || createSubmitting}
            onClick={() => void submitCreate()}
            className="rounded-lg bg-blue-500 px-2 py-1.5 text-[10px] font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {createSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : '确定'}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setCreateText('');
              setCreateError(null);
            }}
            className="rounded-lg px-2 py-1.5 text-[10px] text-slate-400 hover:bg-slate-100"
          >
            取消
          </button>
        </div>
        {createError && <p className="text-[10px] text-red-500 pl-10">{createError}</p>}
      </div>
    );
  }

  return (
    <div className={compact ? 'flex items-center gap-2' : 'space-y-1'}>
      {!compact && <label className="text-[10px] text-slate-400">工具/载体</label>}
      <div className="flex flex-1 items-center gap-1.5 min-w-0">
        {compact && <span className="text-[10px] text-slate-400 w-10 shrink-0">工具</span>}
        <select
          value={value || NO_TOOL_OPTION}
          onChange={(e) => {
            if (e.target.value === CREATE_TOOL_OPTION) {
              setCreating(true);
              return;
            }
            if (e.target.value === NO_TOOL_OPTION) {
              onChange('');
              return;
            }
            onChange(e.target.value);
          }}
          disabled={loading}
          className={selectClass}
        >
          <option value={NO_TOOL_OPTION}>{loading ? '加载中…' : '不选择工具'}</option>
          {hasOrphanValue && <option value={value}>{value}（历史）</option>}
          {tools.map((tool) => (
            <option key={tool.id} value={tool.title}>
              {tool.title}
            </option>
          ))}
          <option value={CREATE_TOOL_OPTION}>+ 新建工具</option>
        </select>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="shrink-0 flex items-center gap-0.5 rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-[10px] text-slate-400 hover:border-blue-300 hover:text-blue-500"
          aria-label="新建工具"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/** 记录保存时：若选了工具且不在库中，补建选项（兼容旧数据） */
export async function persistToolOptionIfNeeded(title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return;
  try {
    await fetch('/api/v2/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trimmed }),
    });
  } catch {
    /* 非阻塞 */
  }
}
