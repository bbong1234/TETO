'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings, Trash2, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

interface UserRule {
  id: string;
  rule_type: string;
  trigger_pattern: string;
  target_id: string | null;
  target_type: string | null;
  confidence: string;
  source: string;
  is_active: boolean;
  created_at: string;
}

const RULE_TYPE_LABELS: Record<string, string> = {
  item_mapping: '事项映射',
  sub_item_mapping: '子项映射',
  type_routing: '类型路由',
  fuzzy_resolution: '模糊解析',
};

const SOURCE_LABELS: Record<string, string> = {
  ai_learned: 'AI学习',
  user_set: '手动设置',
  system_default: '系统默认',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'text-green-600 bg-green-50',
  medium: 'text-amber-600 bg-amber-50',
  low: 'text-red-600 bg-red-50',
};

export default function RulePanel() {
  const [rules, setRules] = useState<UserRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');

  const fetchRules = useCallback(async () => {
    try {
      const url = filterType !== 'all' ? `/api/v2/user-rules?rule_type=${filterType}` : '/api/v2/user-rules';
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setRules(json.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条规则？')) return;
    try {
      await fetch(`/api/v2/user-rules?id=${id}`, { method: 'DELETE' });
      setRules(prev => prev.filter(r => r.id !== id));
    } catch {
      // ignore
    }
  };

  const handleReset = async (type?: string) => {
    const msg = type ? `确定重置所有「${RULE_TYPE_LABELS[type] || type}」规则？` : '确定重置所有规则？此操作不可恢复！';
    if (!confirm(msg)) return;
    try {
      const url = type ? `/api/v2/user-rules?reset=${type}` : '/api/v2/user-rules?reset=all';
      await fetch(url, { method: 'DELETE' });
      await fetchRules();
    } catch {
      // ignore
    }
  };

  const learnedCount = rules.filter(r => r.source === 'ai_learned').length;
  const userSetCount = rules.filter(r => r.source === 'user_set').length;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm">
      {/* Header - 始终可见 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-5 hover:bg-slate-50 transition-colors rounded-2xl"
      >
        <Settings className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-bold text-slate-700">学习规则</h3>
        <span className="text-[10px] text-slate-400">
          {rules.length} 条规则（{learnedCount} 学习 / {userSetCount} 手动）
        </span>
        <span className="ml-auto">
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </span>
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-slate-100">
          {/* 筛选 + 操作栏 */}
          <div className="flex items-center gap-2 mt-3 mb-3">
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="text-[11px] rounded-lg border border-slate-200 px-2 py-1 text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="all">全部类型</option>
              <option value="item_mapping">事项映射</option>
              <option value="sub_item_mapping">子项映射</option>
              <option value="type_routing">类型路由</option>
              <option value="fuzzy_resolution">模糊解析</option>
            </select>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => handleReset('item_mapping')}
                className="text-[10px] text-slate-400 hover:text-amber-600 px-2 py-0.5 rounded hover:bg-amber-50 transition-colors"
              >
                清除映射
              </button>
              <button
                onClick={() => handleReset()}
                className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-red-600 px-2 py-0.5 rounded hover:bg-red-50 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                全部重置
              </button>
            </div>
          </div>

          {/* 规则列表 */}
          {loading ? (
            <p className="text-xs text-slate-400 py-4 text-center">加载中...</p>
          ) : rules.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">暂无规则（修正AI解析结果时将自动学习）</p>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {rules.map(rule => (
                <div key={rule.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-[10px] font-medium text-slate-500 w-16 flex-shrink-0">
                    {RULE_TYPE_LABELS[rule.rule_type] || rule.rule_type}
                  </span>
                  <span className="text-[11px] text-slate-700 flex-1 truncate" title={rule.trigger_pattern}>
                    {rule.trigger_pattern}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CONFIDENCE_COLORS[rule.confidence] || 'text-slate-500 bg-slate-50'}`}>
                    {rule.confidence}
                  </span>
                  <span className="text-[10px] text-slate-400 w-14 text-right">
                    {SOURCE_LABELS[rule.source] || rule.source}
                  </span>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
