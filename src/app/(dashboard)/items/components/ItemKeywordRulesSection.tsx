'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import type { UserRule } from '@/lib/db/user-rules';
import type { Tag } from '@/types/teto';

interface ItemKeywordRulesSectionProps {
  itemId: string;
  /** 当前默认职能标签 id */
  defaultFunctionTagId?: string | null;
  /** 当前默认工具 */
  defaultToolLabel?: string | null;
  /** 保存默认预设后回调（用于父级更新本地 item 状态） */
  onDefaultsSaved?: (patch: { default_function_tag_id?: string | null; default_tool_label?: string | null }) => void;
}

export default function ItemKeywordRulesSection({
  itemId,
  defaultFunctionTagId = null,
  defaultToolLabel = null,
  onDefaultsSaved,
}: ItemKeywordRulesSectionProps) {
  const [rules, setRules] = useState<UserRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPattern, setNewPattern] = useState('');
  const [saving, setSaving] = useState(false);

  const [functionTags, setFunctionTags] = useState<Tag[]>([]);
  const [selectedFnTag, setSelectedFnTag] = useState<string | null>(defaultFunctionTagId);
  const [toolText, setToolText] = useState(defaultToolLabel ?? '');
  const [savingDefaults, setSavingDefaults] = useState(false);

  useEffect(() => {
    setSelectedFnTag(defaultFunctionTagId);
  }, [defaultFunctionTagId]);
  useEffect(() => {
    setToolText(defaultToolLabel ?? '');
  }, [defaultToolLabel]);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/v2/user-rules?rule_type=item_mapping&is_active=true`
      );
      const data = await res.json();
      if (res.ok && Array.isArray(data.data)) {
        setRules(
          (data.data as UserRule[]).filter(
            (r) => r.target_id === itemId && r.target_type === 'item'
          )
        );
      }
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  const loadFunctionTags = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/items/${itemId}/function-tags`);
      const data = await res.json();
      const all: Tag[] = data.data?.all ?? [];
      const frequent: Tag[] = data.data?.frequent ?? [];
      const ids = new Set(frequent.map((t) => t.id));
      setFunctionTags([...frequent, ...all.filter((t) => !ids.has(t.id))]);
    } catch {
      setFunctionTags([]);
    }
  }, [itemId]);

  useEffect(() => {
    void loadRules();
    void loadFunctionTags();
  }, [loadRules, loadFunctionTags]);

  const handleAdd = async () => {
    const pattern = newPattern.trim();
    if (!pattern || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v2/user-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule_type: 'item_mapping',
          trigger_pattern: pattern,
          target_id: itemId,
          target_type: 'item',
          confidence: 'high',
          source: 'user_set',
        }),
      });
      if (res.ok) {
        setNewPattern('');
        await loadRules();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ruleId: string) => {
    await fetch(`/api/v2/user-rules?id=${encodeURIComponent(ruleId)}`, {
      method: 'DELETE',
    });
    await loadRules();
  };

  const saveDefaults = async (patch: { default_function_tag_id?: string | null; default_tool_label?: string | null }) => {
    setSavingDefaults(true);
    try {
      const res = await fetch(`/api/v2/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        onDefaultsSaved?.(patch);
      }
    } finally {
      setSavingDefaults(false);
    }
  };

  const handleSelectFnTag = (tagId: string | null) => {
    const next = selectedFnTag === tagId ? null : tagId;
    setSelectedFnTag(next);
    void saveDefaults({ default_function_tag_id: next });
  };

  const handleToolBlur = () => {
    const trimmed = toolText.trim();
    if ((trimmed || null) !== (defaultToolLabel ?? null)) {
      void saveDefaults({ default_tool_label: trimmed || null });
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-slate-800">默认预设</h3>
          {savingDefaults && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
        </div>
        <p className="mt-0.5 text-[11px] text-slate-400">
          选中此事项计时时，自动带出动作与工具，无需每次重选
        </p>

        {functionTags.length > 0 && (
          <div className="mt-2">
            <span className="text-[10px] font-medium text-slate-500">默认动作</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {functionTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => handleSelectFnTag(tag.id)}
                  className={[
                    'rounded-full px-2.5 py-1 text-[11px] transition-colors',
                    selectedFnTag === tag.id
                      ? 'bg-blue-500 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-300',
                  ].join(' ')}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-2">
          <span className="text-[10px] font-medium text-slate-500">默认工具</span>
          <input
            type="text"
            value={toolText}
            onChange={(e) => setToolText(e.target.value)}
            onBlur={handleToolBlur}
            placeholder="如：VS Code、不背单词"
            className="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-300 focus:outline-none"
          />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <h3 className="text-sm font-medium text-slate-800">快捷关键词</h3>
        <p className="mt-0.5 text-[11px] text-slate-400">
          录入时提到这些词，将自动归属到此事项
        </p>
        {loading ? (
          <p className="mt-2 text-[11px] text-slate-400">加载中…</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {rules.map((rule) => (
              <span
                key={rule.id}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
              >
                {rule.trigger_pattern}
                <button
                  type="button"
                  onClick={() => void handleDelete(rule.id)}
                  className="text-slate-400 hover:text-red-500"
                  aria-label="删除关键词"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAdd();
                }}
                placeholder="新关键词"
                className="w-24 rounded border border-slate-200 px-2 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-200"
              />
              <button
                type="button"
                disabled={!newPattern.trim() || saving}
                onClick={() => void handleAdd()}
                className="flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[10px] text-slate-500 hover:border-blue-300 disabled:opacity-50"
              >
                <Plus className="h-3 w-3" />
                添加
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
