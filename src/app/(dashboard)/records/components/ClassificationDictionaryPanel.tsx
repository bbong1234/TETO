'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, BookMarked } from 'lucide-react';
import type { UserRule } from '@/lib/db/user-rules';
import type { Item, Tag } from '@/types/teto';

interface ClassificationDictionaryPanelProps {
  items: Item[];
  onError?: (msg: string) => void;
}

export default function ClassificationDictionaryPanel({
  items,
  onError,
}: ClassificationDictionaryPanelProps) {
  const [rules, setRules] = useState<UserRule[]>([]);
  const [functionTags, setFunctionTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPattern, setNewPattern] = useState('');
  const [newItemId, setNewItemId] = useState('');
  const [newFnTagId, setNewFnTagId] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, tagsRes] = await Promise.all([
        fetch('/api/v2/user-rules?is_active=true'),
        fetch('/api/v2/tags?type=function'),
      ]);
      const rulesJson = await rulesRes.json();
      const tagsJson = await tagsRes.json();
      setRules(Array.isArray(rulesJson.data) ? rulesJson.data : []);
      setFunctionTags(Array.isArray(tagsJson.data) ? tagsJson.data : []);
    } catch {
      onError?.('加载词典失败');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { void load(); }, [load]);

  const addRule = async () => {
    if (!newPattern.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        rule_type: 'item_mapping',
        trigger_pattern: newPattern.trim(),
        target_id: newItemId || null,
        target_type: newItemId ? 'item' : null,
        confidence: 'high',
        source: 'user_set',
        is_active: true,
      };
      if (newFnTagId) {
        body.metadata = { function_tag_id: newFnTagId };
      }
      const res = await fetch('/api/v2/user-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setRules((prev) => [...prev, data.data as UserRule]);
        setNewPattern('');
        setNewItemId('');
        setNewFnTagId('');
      }
    } catch {
      onError?.('添加规则失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/v2/user-rules/${id}`, { method: 'DELETE' });
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch {
      onError?.('删除规则失败');
    } finally {
      setDeletingId(null);
    }
  };

  const itemMappingRules = rules.filter((r) => r.rule_type === 'item_mapping');
  const functionMappingRules = rules.filter((r) => r.rule_type === 'function_mapping');
  const otherRules = rules.filter((r) => r.rule_type !== 'item_mapping' && r.rule_type !== 'function_mapping');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      </div>
    );
  }

  const renderRuleRow = (rule: UserRule) => {
    const targetItem = rule.target_id ? items.find((i) => i.id === rule.target_id) : null;
    const targetFnTag = rule.metadata?.function_tag_id
      ? functionTags.find((t) => t.id === rule.metadata?.function_tag_id)
      : null;
    return (
      <div key={rule.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
        <span className="font-mono text-xs text-slate-800 bg-white border border-slate-200 rounded px-1.5 py-0.5">
          {rule.trigger_pattern}
        </span>
        <span className="text-slate-400 text-[10px]">→</span>
        {targetItem && (
          <span className="text-xs text-blue-600 font-medium">{targetItem.title}</span>
        )}
        {targetFnTag && (
          <span className="text-xs text-teal-600 font-medium">· {targetFnTag.name}</span>
        )}
        {!targetItem && !targetFnTag && (
          <span className="text-xs text-slate-400">{rule.target_type || rule.rule_type}</span>
        )}
        <span className={`ml-auto text-[9px] rounded-full px-1.5 py-0.5 ${
          rule.source === 'user_set' ? 'bg-slate-200 text-slate-600' : 'bg-blue-50 text-blue-500'
        }`}>
          {rule.source === 'user_set' ? '手动' : 'AI学习'}
        </span>
        <button
          type="button"
          disabled={deletingId === rule.id}
          onClick={() => deleteRule(rule.id)}
          className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50"
        >
          {deletingId === rule.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* 新增规则 */}
      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BookMarked className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">新增关键词规则</span>
        </div>
        <p className="text-xs text-slate-500">
          当输入中包含关键词时，自动建议归属到指定事项或动作。
        </p>
        <div className="space-y-2">
          <input
            type="text"
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            placeholder="关键词（如：英语听读、报价格、A公司）"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          <select
            value={newItemId}
            onChange={(e) => setNewItemId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            <option value="">关联事项（可选）</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </select>
          <select
            value={newFnTagId}
            onChange={(e) => setNewFnTagId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            <option value="">关联动作（可选）</option>
            {functionTags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!newPattern.trim() || saving}
            onClick={addRule}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            添加规则
          </button>
        </div>
      </div>

      {/* 事项映射规则 */}
      {itemMappingRules.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">事项关键词</p>
          {itemMappingRules.map(renderRuleRow)}
        </div>
      )}

      {/* 职能映射规则 */}
      {functionMappingRules.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">动作关键词</p>
          {functionMappingRules.map(renderRuleRow)}
        </div>
      )}

      {/* 其他规则 */}
      {otherRules.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">其他规则</p>
          {otherRules.map(renderRuleRow)}
        </div>
      )}

      {rules.length === 0 && (
        <p className="text-center text-sm text-slate-400 py-6">
          还没有关键词规则。添加规则后，系统会根据关键词自动建议归属。
        </p>
      )}
    </div>
  );
}
