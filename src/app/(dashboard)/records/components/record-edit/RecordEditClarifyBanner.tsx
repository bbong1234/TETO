'use client';

import { Activity } from 'lucide-react';
import type { Record } from '@/types/teto';

interface RecordEditClarifyBannerProps {
  record: Record;
}

export default function RecordEditClarifyBanner({ record }: RecordEditClarifyBannerProps) {
  const ps = record.parsed_semantic as {
    needs_clarification?: boolean;
    clarification_issues?: Array<{ type: string; message: string; reason: string }>;
    confidence?: number;
  } | null;

  const needsClarification = ps?.needs_clarification && (ps.clarification_issues?.length ?? 0) > 0;
  const lowConfidence = typeof ps?.confidence === 'number' && ps.confidence < 0.7;

  if (!needsClarification && !lowConfidence) return null;

  return (
    <>
      {needsClarification && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="text-xs font-semibold text-amber-700">AI 解析存在歧义，请确认</span>
          </div>
          {(ps?.clarification_issues ?? []).map((issue, idx) => (
            <div key={idx} className="space-y-1">
              <div className="text-[10px] text-amber-600">原因：{issue.reason}</div>
              <div className="text-[11px] text-slate-700">{issue.message}</div>
            </div>
          ))}
        </div>
      )}
      {lowConfidence && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
          <p className="text-xs font-medium text-amber-700 mb-1">AI 部分信息不太确定，请手动补充</p>
          <p className="text-[10px] text-amber-500">
            解析置信度较低（{Math.round((ps!.confidence as number) * 100)}%），请核对结构化字段
          </p>
        </div>
      )}
    </>
  );
}
