'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search } from 'lucide-react';

interface LookupResult {
  query: string;
  record: { id: string; content: string; date?: string; type: string } | null;
  input: { id: string; raw_input: string; status: string; created_at: string } | null;
  trace: {
    trace_id: string;
    operation: string;
    status: string | null;
    created_at: string;
  } | null;
}

export default function DebugSearchPage() {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LookupResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    const t = q.trim();
    if (!t) return;
    setLoading(true);
    setErr(null);
    setData(null);
    try {
      const res = await fetch(`/api/v2/debug/lookup?q=${encodeURIComponent(t)}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json.data as LookupResult);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <Link href="/debug" className="text-slate-500 hover:text-slate-800 text-sm inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> 诊断首页
      </Link>
      <h1 className="text-xl font-bold text-slate-900">ID / trace 搜索</h1>
      <p className="text-xs text-slate-500">
        依次匹配：记录 UUID、输入 UUID、trace_id（如 TETO trace 或 x-trace-id）
      </p>
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
        若在记录页点了「暂时不确认」，对应 input 不会入库；请把当时的 <span className="font-mono">input_id</span> 粘到这里找回状态（仍在澄清中的 input 可查原文与 status）。
      </p>

      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void run()}
          placeholder="粘贴 ID 或 trace_id"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading || !q.trim()}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-slate-300"
        >
          <Search className="h-4 w-4" /> 查询
        </button>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      {data && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 text-sm">
          <div>
            <span className="text-slate-400 text-xs">记录</span>
            {data.record ? (
              <pre className="mt-1 text-xs bg-slate-50 p-2 rounded overflow-x-auto">
                {JSON.stringify(data.record, null, 2)}
              </pre>
            ) : (
              <p className="text-slate-400 text-xs mt-1">无匹配</p>
            )}
          </div>
          <div>
            <span className="text-slate-400 text-xs">输入</span>
            {data.input ? (
              <pre className="mt-1 text-xs bg-slate-50 p-2 rounded overflow-x-auto">
                {JSON.stringify(data.input, null, 2)}
              </pre>
            ) : (
              <p className="text-slate-400 text-xs mt-1">无匹配</p>
            )}
          </div>
          <div>
            <span className="text-slate-400 text-xs">trace_summaries</span>
            {data.trace ? (
              <pre className="mt-1 text-xs bg-slate-50 p-2 rounded overflow-x-auto">
                {JSON.stringify(data.trace, null, 2)}
              </pre>
            ) : (
              <p className="text-slate-400 text-xs mt-1">无匹配</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
