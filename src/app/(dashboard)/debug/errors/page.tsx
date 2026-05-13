'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';

interface ErrorRow {
  id: string;
  error_code: string;
  message: string;
  source: string;
  severity: string;
  trace_id: string | null;
  record_id: string | null;
  input_id: string | null;
  url: string | null;
  occurred_at: string;
}

export default function DebugErrorsPage() {
  const [items, setItems] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v2/errors?limit=200');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setItems((json.data?.items ?? []) as ErrorRow[]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/debug" className="text-slate-500 hover:text-slate-800 text-sm inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> 诊断首页
        </Link>
      </div>
      <h1 className="text-xl font-bold text-slate-900">运行时错误（errors 表）</h1>
      <p className="text-xs text-slate-500">仅当前用户可见；由客户端上报与服务端写入汇总。</p>

      {loading && (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> 加载中…
        </div>
      )}
      {err && (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="h-4 w-4" /> {err}
        </div>
      )}

      {!loading && !err && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 font-medium">时间</th>
                <th className="px-3 py-2 font-medium">码</th>
                <th className="px-3 py-2 font-medium">级别</th>
                <th className="px-3 py-2 font-medium">信息</th>
                <th className="px-3 py-2 font-medium">trace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                    暂无错误记录
                  </td>
                </tr>
              ) : (
                items.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                      {new Date(r.occurred_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <code className="bg-red-50 text-red-700 px-1 rounded">{r.error_code}</code>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.severity}</td>
                    <td className="px-3 py-2 text-slate-800 max-w-md truncate" title={r.message}>
                      {r.message}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-500 max-w-[120px] truncate" title={r.trace_id ?? ''}>
                      {r.trace_id ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
