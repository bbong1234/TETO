'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Info, Loader2 } from 'lucide-react';
import { parseClientApiJson } from '@/lib/observability/client-request';

export type RecordExplainPayload = {
  record_id: string;
  content_preview: string;
  type: string;
  review_status: string;
  record_quality_tag: string | null;
  input_source: string | null;
  input_id: string | null;
  parent_input_id: string | null;
  input_unit_id: string | null;
  input_summary: { id: string; raw_input: string; status: string } | null;
  ingest_clearing: {
    root_input_id: string | null;
    root_raw_input_preview: string | null;
    unit_id: string | null;
    unit_index: number | null;
    peer_unit_count: number | null;
    classifier_content_summary: string | null;
    unit_status: string | null;
  } | null;
  eligibility_display: { eligible: boolean; caliber: string; exclusionReason?: string };
  eligibility_insight: { eligible: boolean; caliber: string; exclusionReason?: string };
};

interface RecordEditExplainPanelProps {
  recordId: string;
}

export default function RecordEditExplainPanel({ recordId }: RecordEditExplainPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RecordExplainPayload | null>(null);
  const [fetchErr, setFetchErr] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setFetchErr(null);
  }, [recordId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setFetchErr(null);
    fetch(`/api/v2/records/${recordId}/explain`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          const pe = parseClientApiJson(j);
          throw new Error(pe.message || '加载失败');
        }
        const env = parseClientApiJson(j);
        return env.data as RecordExplainPayload | undefined;
      })
      .then((d) => {
        if (!cancelled) setData(d ?? null);
      })
      .catch((e) => {
        if (!cancelled) setFetchErr(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, recordId]);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-100/80 transition-colors"
      >
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          <Info className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          解析与统计口径
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-slate-200 bg-white px-3 py-2.5 space-y-2 text-[11px] text-slate-600">
          {loading && (
            <div className="flex items-center gap-1.5 text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              加载中…
            </div>
          )}
          {fetchErr && !loading && <p className="text-red-600">{fetchErr}</p>}
          {data && !loading && (
            <div className="grid gap-2">
              <div>
                <span className="text-slate-400">审核</span>
                <span className="ml-2 text-slate-800">{data.review_status}</span>
              </div>
              <div>
                <span className="text-slate-400">质量标签</span>
                <span className="ml-2 text-slate-800">{data.record_quality_tag ?? '—'}</span>
              </div>
              <div>
                <span className="text-slate-400">溯源 input</span>
                <span className="ml-2 break-all text-slate-800">{data.input_id ?? '—'}</span>
              </div>
              {data.input_summary && (
                <div className="rounded bg-slate-50 px-2 py-1.5 text-[10px] text-slate-500 space-y-0.5">
                  <div className="font-medium text-slate-600">录入原文摘要</div>
                  <div className="whitespace-pre-wrap break-words">{data.input_summary.raw_input || '（空）'}</div>
                  <div>状态：{data.input_summary.status}</div>
                </div>
              )}
              {data.ingest_clearing && (
                <div className="rounded border border-indigo-100 bg-indigo-50/50 px-2 py-1.5 space-y-1">
                  <div className="text-[10px] font-semibold text-indigo-800">清分说明（input_unit）</div>
                  <div className="text-[10px] text-slate-600 space-y-0.5">
                    <div>
                      <span className="text-slate-400">根 input</span>{' '}
                      <span className="break-all">{data.ingest_clearing.root_input_id ?? '—'}</span>
                    </div>
                    {data.ingest_clearing.root_raw_input_preview && (
                      <div className="whitespace-pre-wrap break-words text-slate-500">
                        原文预览：{data.ingest_clearing.root_raw_input_preview}
                      </div>
                    )}
                    <div>
                      单元序号：{data.ingest_clearing.unit_index ?? '—'}（同批共 {data.ingest_clearing.peer_unit_count ?? '—'} 个）
                    </div>
                    <div className="break-all">单元 ID：{data.ingest_clearing.unit_id ?? '—'}</div>
                    <div>单元状态：{data.ingest_clearing.unit_status ?? '—'}</div>
                  </div>
                </div>
              )}
              <div className="rounded border border-slate-100 bg-slate-50/50 px-2 py-1.5 space-y-0.5">
                <div className="font-medium text-slate-700">展示口径</div>
                <p>
                  {data.eligibility_display.eligible
                    ? '计入列表与展示聚合'
                    : `不计入 — ${data.eligibility_display.exclusionReason ?? ''}`}
                </p>
              </div>
              <div className="rounded border border-slate-100 bg-slate-50/50 px-2 py-1.5 space-y-0.5">
                <div className="font-medium text-slate-700">洞察口径</div>
                <p>
                  {data.eligibility_insight.eligible
                    ? '计入洞察与统计'
                    : `不计入 — ${data.eligibility_insight.exclusionReason ?? ''}`}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
