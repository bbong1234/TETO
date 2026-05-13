'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, TrendingUp, TrendingDown, ShieldAlert, Loader2 } from 'lucide-react';

interface ErrorCluster {
  type: string;
  count: number;
  fields: string[];
}

interface TrendsData {
  total: number;
  topFields: Array<{ field: string; count: number }>;
  errorClusters: {
    byDecisionType: ErrorCluster[];
    byRule: ErrorCluster[];
  };
  dateTrend: Array<{ date: string; count: number }>;
  problematicInputs: Array<{
    inputId: string;
    correctionCount: number;
    affectedFields: string[];
  }>;
}

export default function CorrectionsTrendsPanel() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchTrends() {
      try {
        const res = await fetch('/api/v2/corrections/trends?days=30&limit=10');
        if (!res.ok) throw new Error('加载失败');
        const json = await res.json();
        if (!cancelled) {
          setData(json.data as TrendsData);
        }
      } catch {
        // 静默失败 — 纠错趋势是辅助信息
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchTrends();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl bg-white border border-slate-100 p-4">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="h-3 w-3 animate-spin" />
          纠错趋势加载中...
        </div>
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="rounded-xl bg-white border border-slate-100 p-4">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <ShieldAlert className="h-4 w-4" />
          近期无纠错记录 — 数据质量良好
        </div>
      </div>
    );
  }

  const getTrendIcon = () => {
    if (data.dateTrend.length < 2) return null;
    const newest = data.dateTrend[data.dateTrend.length - 1]?.count ?? 0;
    const oldest = data.dateTrend[0]?.count ?? 0;
    if (newest > oldest) return <TrendingUp className="h-4 w-4 text-red-400" />;
    if (newest < oldest) return <TrendingDown className="h-4 w-4 text-emerald-400" />;
    return null;
  };

  return (
    <div className="rounded-xl bg-white border border-amber-100 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-800">纠错趋势</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>近30天 {data.total} 次纠错</span>
          {getTrendIcon()}
        </div>
      </div>

      {/* 高频纠错字段 */}
      {data.topFields.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-400 mb-1.5">高频纠错字段</p>
          <div className="flex flex-wrap gap-1">
            {data.topFields.slice(0, 5).map(f => (
              <span key={f.field}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-medium"
              >
                {f.field}
                <span className="ml-1 text-amber-400">{f.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 决策类型聚类 */}
      {data.errorClusters?.byDecisionType?.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-400 mb-1.5">按决策类型</p>
          <div className="space-y-1">
            {data.errorClusters.byDecisionType.slice(0, 4).map(c => (
              <div key={c.type} className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600">{c.type.replace('DEC-', '')}</span>
                <span className="text-slate-400">{c.count} 次</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 问题输入 */}
      {data.problematicInputs.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-400 mb-1.5">同一输入多次纠错</p>
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {data.problematicInputs.slice(0, 3).map(p => (
              <div key={p.inputId} className="text-[10px] text-slate-500 truncate">
                <code className="text-[9px] bg-slate-100 px-1 py-0.5 rounded">{p.inputId.slice(-8)}</code>
                <span className="ml-1.5">被纠错 {p.correctionCount} 次</span>
                <span className="ml-1 text-slate-400">({p.affectedFields.join(', ')})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
