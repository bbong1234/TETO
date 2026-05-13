'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Shield, AlertTriangle, Database, Activity, RefreshCw,
  Loader2, CheckCircle2, XCircle, ArrowRight, FileText,
  Trash2, Plus,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// Debug Dashboard — 统一接入所有诊断/管理 API
// ═══════════════════════════════════════════════════════════

interface IntegrityReport {
  totalRecords: number;
  orphanedRecords: number;
  missingItemRecords: number;
  uncheckedRecords: number;
  duplicateRecords: number;
  details?: Array<{ table: string; issue: string; count: number }>;
}

interface ErrorCluster {
  errorCode: string;
  count: number;
  trend: 'rising' | 'falling' | 'stable';
  trendPercentage: number;
  topStage: string;
  ruleIds: string[];
}

interface DiagnoseTrends {
  periodDays: number;
  totalErrors: number;
  totalCorrections: number;
  clusters: ErrorCluster[];
  correctionPatterns: Array<{
    fieldCorrected: string;
    count: number;
    examples: Array<{ oldValue: string; newValue: string }>;
  }>;
}

interface UserRule {
  id: string;
  rule_code: string;
  rule_type: string;
  source: string;
  value: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

interface RecordDay {
  id: string;
  date: string;
  record_count: number;
  summary: string | null;
}

// ═══════════════════════════════════════════════════════════
// Panel: 数据完整性检查
// ═══════════════════════════════════════════════════════════
function IntegrityPanel() {
  const [data, setData] = useState<IntegrityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/diagnostics/integrity');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.data as IntegrityReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-slate-400" />;
  if (error) return <span className="text-red-400 text-xs">{error}</span>;
  if (!data) return <span className="text-slate-400 text-xs">无数据</span>;

  const issues = [
    { label: '记录总数', value: data.totalRecords, ok: true },
    { label: '孤立记录', value: data.orphanedRecords, ok: data.orphanedRecords === 0 },
    { label: '缺失事项', value: data.missingItemRecords, ok: data.missingItemRecords === 0 },
    { label: '未审核', value: data.uncheckedRecords, ok: data.uncheckedRecords === 0 },
    { label: '疑似重复', value: data.duplicateRecords, ok: data.duplicateRecords === 0 },
  ];

  return (
    <div className="space-y-2">
      {issues.map(issue => (
        <div key={issue.label} className="flex items-center justify-between text-xs">
          <span className="text-slate-400">{issue.label}</span>
          <span className={`font-mono ${issue.ok ? 'text-emerald-500' : 'text-amber-500'}`}>
            {issue.value}
            {issue.ok ? <CheckCircle2 className="inline h-3 w-3 ml-1" /> : <AlertTriangle className="inline h-3 w-3 ml-1" />}
          </span>
        </div>
      ))}
      {data.details && data.details.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-100">
          {data.details.map((d, i) => (
            <div key={i} className="text-[10px] text-slate-500 flex justify-between">
              <span>{d.table}: {d.issue}</span>
              <span className="font-mono">{d.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Panel: 诊断趋势（错误聚类）
// ═══════════════════════════════════════════════════════════
function DiagnoseTrendsPanel() {
  const [data, setData] = useState<DiagnoseTrends | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v2/diagnose/trends?days=30');
        if (!res.ok) return;
        const json = await res.json();
        setData(json.data as DiagnoseTrends);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-slate-400" />;
  if (!data) return <span className="text-slate-400 text-xs">无数据</span>;

  return (
    <div className="space-y-2">
      <div className="flex gap-3 text-xs">
        <span className="text-slate-400">错误 <span className="font-mono text-red-400">{data.totalErrors}</span></span>
        <span className="text-slate-400">纠错 <span className="font-mono text-amber-400">{data.totalCorrections}</span></span>
      </div>
      {data.clusters.slice(0, 5).map(c => (
        <div key={c.errorCode} className="flex items-center justify-between text-xs border-b border-slate-50 pb-1">
          <div>
            <code className="text-[10px] bg-red-50 text-red-600 px-1 rounded">{c.errorCode}</code>
            <span className="ml-1.5 text-slate-500">{c.topStage}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-slate-600">{c.count}</span>
            <span className={`text-[10px] ${
              c.trend === 'rising' ? 'text-red-400' : c.trend === 'falling' ? 'text-emerald-400' : 'text-slate-400'
            }`}>
              {c.trend === 'rising' ? '↑' : c.trend === 'falling' ? '↓' : '→'}
              {Math.abs(c.trendPercentage)}%
            </span>
          </div>
        </div>
      ))}
      {data.correctionPatterns.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 mb-1">高频纠错字段</p>
          {data.correctionPatterns.slice(0, 3).map(p => (
            <div key={p.fieldCorrected} className="text-[10px] text-slate-500 flex justify-between">
              <span>{p.fieldCorrected}</span>
              <span className="font-mono">{p.count}次</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Panel: 用户规则管理
// ═══════════════════════════════════════════════════════════
function UserRulesPanel() {
  const [rules, setRules] = useState<UserRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCode, setNewCode] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newType, setNewType] = useState('item_alias');

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/user-rules');
      if (!res.ok) return;
      const json = await res.json();
      setRules(json.data as UserRule[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRules(); }, []);

  const addRule = async () => {
    if (!newCode || !newValue) return;
    try {
      const res = await fetch('/api/v2/user-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule_code: newCode,
          rule_type: newType,
          value: newValue,
          description: newValue,
        }),
      });
      if (res.ok) {
        setNewCode('');
        setNewValue('');
        fetchRules();
      }
    } catch { /* ignore */ }
  };

  const deleteRule = async (id: string) => {
    try {
      await fetch(`/api/v2/user-rules?id=${id}`, { method: 'DELETE' });
      fetchRules();
    } catch { /* ignore */ }
  };

  const resetAll = async () => {
    try {
      await fetch('/api/v2/user-rules?reset=all', { method: 'DELETE' });
      fetchRules();
    } catch { /* ignore */ }
  };

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-slate-400" />;

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <input
          placeholder="规则编码"
          value={newCode}
          onChange={e => setNewCode(e.target.value)}
          className="flex-1 rounded border border-slate-200 px-2 py-1 text-[10px] font-mono"
        />
        <select
          value={newType}
          onChange={e => setNewType(e.target.value)}
          className="rounded border border-slate-200 px-1 py-1 text-[10px]"
        >
          <option value="item_alias">item_alias</option>
          <option value="sub_item_alias">sub_item_alias</option>
          <option value="field_override">field_override</option>
          <option value="type_hint">type_hint</option>
        </select>
        <input
          placeholder="值"
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          className="w-24 rounded border border-slate-200 px-2 py-1 text-[10px]"
        />
        <button
          onClick={addRule}
          className="rounded bg-blue-500 px-2 py-1 text-white text-[10px] hover:bg-blue-600"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {rules.length > 0 ? (
        <div className="max-h-48 overflow-y-auto space-y-1">
          {rules.map(r => (
            <div key={r.id} className="flex items-center justify-between text-xs border-b border-slate-50 pb-1">
              <div className="flex-1 min-w-0">
                <code className="text-[10px] bg-slate-100 px-1 rounded">{r.rule_code}</code>
                <span className="ml-1 text-slate-500 truncate">{r.value}</span>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <span className="text-[9px] text-slate-400">{r.rule_type}</span>
                <button
                  onClick={() => deleteRule(r.id)}
                  className="text-red-400 hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <span className="text-xs text-slate-400">暂无自定义规则</span>
      )}
      {rules.length > 0 && (
        <button onClick={resetAll} className="text-[10px] text-red-400 hover:text-red-600">
          重置全部
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Panel: 记录日摘要
// ═══════════════════════════════════════════════════════════
function RecordDaysPanel() {
  const [days, setDays] = useState<RecordDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v2/record-days');
        if (!res.ok) return;
        const json = await res.json();
        setDays((json.data as RecordDay[]).slice(0, 10));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-slate-400" />;

  return (
    <div className="space-y-1 max-h-40 overflow-y-auto">
      {days.length > 0 ? days.map(d => (
        <div key={d.id} className="flex items-center justify-between text-xs">
          <span className="text-slate-500">{d.date}</span>
          <span className="font-mono text-slate-600">{d.record_count} 条</span>
          {d.summary && <span className="text-[10px] text-slate-400 ml-2 truncate">{d.summary}</span>}
        </div>
      )) : (
        <span className="text-xs text-slate-400">暂无记录日数据</span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 主页面
// ═══════════════════════════════════════════════════════════
export default function DebugDashboardPage() {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-500" />
          <h1 className="text-xl font-bold text-slate-900">系统诊断</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/debug/trace"
            className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-medium"
          >
            链路追踪 <ArrowRight className="h-3 w-3" />
          </Link>
          <Link
            href="/debug/search"
            className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-medium"
          >
            ID 搜索 <ArrowRight className="h-3 w-3" />
          </Link>
          <Link
            href="/debug/errors"
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-medium"
          >
            错误日志 <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 数据完整性 */}
        <div className="rounded-xl bg-white border border-slate-100 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-slate-800">数据完整性</h3>
            </div>
            <button onClick={() => window.location.reload()} className="text-slate-400 hover:text-slate-600">
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
          <IntegrityPanel />
        </div>

        {/* 诊断趋势 */}
        <div className="rounded-xl bg-white border border-slate-100 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-800">错误趋势</h3>
            </div>
            <span className="text-[10px] text-slate-400">近30天</span>
          </div>
          <DiagnoseTrendsPanel />
        </div>

        {/* 用户规则管理 */}
        <div className="rounded-xl bg-white border border-slate-100 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-slate-800">用户规则</h3>
          </div>
          <UserRulesPanel />
        </div>

        {/* 记录日摘要 */}
        <div className="rounded-xl bg-white border border-slate-100 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-slate-800">记录日摘要</h3>
          </div>
          <RecordDaysPanel />
        </div>
      </div>
    </div>
  );
}
