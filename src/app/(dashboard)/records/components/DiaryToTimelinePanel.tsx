'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, PenLine, X } from 'lucide-react';
import type { Item, Record as TetoRecord, Tag } from '@/types/teto';
import type { UserRule } from '@/lib/db/user-rules';
import {
  filterDuplicateCandidates,
  normalizeExtractCandidates,
  type DiaryExtractCandidate,
} from '@/lib/activity/diary-extract-records';
import { sortCandidatesForCreation } from '@/lib/activity/diary-candidate-time';
import { normalizeExtractCandidate } from '@/lib/activity/diary-time-normalize';
import { buildRecordPayloadFromCandidateWithParse } from '@/lib/activity/diary-create-from-candidate';
import { summarizeRecordsForChat } from '@/lib/activity/diary-document';
import { postManualRecord } from '@/lib/activity/post-manual-record';
import { notifyRecordsChanged } from '@/hooks/use-records-changed';

const CONFIDENCE_THRESHOLD = 0.6;

interface EditableCandidate extends DiaryExtractCandidate {
  selected: boolean;
}

interface DiaryToTimelinePanelProps {
  open: boolean;
  onClose: () => void;
  date: string;
  diaryPlainText: string;
  linkedRecordIds: string[];
  dayRecords: TetoRecord[];
  items: Item[];
  tags: Tag[];
  userRules: UserRule[];
  onError: (message: string) => void;
  onRecordsCreated: (records: TetoRecord[]) => void;
}

function formatCandidatePreview(candidate: DiaryExtractCandidate): string {
  const timePart =
    candidate.time_precision === 'fuzzy'
      ? candidate.time_text ?? '时段未明'
      : candidate.time_text ?? '时间未明';
  const anchorPart = candidate.afterExcerpt ? `（在「${candidate.afterExcerpt}」之后）` : '';
  return `${timePart} ${candidate.raw_input}${anchorPart}`.trim();
}

export default function DiaryToTimelinePanel({
  open,
  onClose,
  date,
  diaryPlainText,
  linkedRecordIds,
  dayRecords,
  items,
  tags,
  userRules,
  onError,
  onRecordsCreated,
}: DiaryToTimelinePanelProps) {
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [candidates, setCandidates] = useState<EditableCandidate[]>([]);

  const loadCandidates = useCallback(async () => {
    if (!diaryPlainText.trim()) {
      onError('日记为空，无法分析');
      return;
    }

    setLoading(true);
    setIsFallback(false);
    try {
      const res = await fetch('/api/v2/record-days/extract-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          diaryPlainText,
          recordsSummary: summarizeRecordsForChat(dayRecords),
          linkedRecordIds,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? '分析日记失败');

      const rawCandidates = normalizeExtractCandidates(
        (json.data?.candidates ?? []) as DiaryExtractCandidate[]
      );
      const filtered = filterDuplicateCandidates(rawCandidates, dayRecords);
      const editable = filtered.map((candidate) => ({
        ...candidate,
        selected:
          !candidate.skipReason &&
          candidate.confidence >= CONFIDENCE_THRESHOLD,
      }));
      setCandidates(editable);
      setIsFallback(Boolean(json.data?.is_fallback));
      if (editable.length === 0) {
        onError(
          json.data?.is_fallback
            ? 'AI 不可用或未识别到可写入的事件'
            : '没有可写入时间线的新事件'
        );
      }
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : '分析日记失败');
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [date, dayRecords, diaryPlainText, linkedRecordIds, onError]);

  useEffect(() => {
    if (open) {
      void loadCandidates();
    } else {
      setCandidates([]);
      setIsFallback(false);
    }
  }, [open, loadCandidates]);

  const selectedCount = useMemo(
    () => candidates.filter((candidate) => candidate.selected && !candidate.skipReason).length,
    [candidates]
  );

  const handleToggle = (id: string) => {
    setCandidates((prev) =>
      prev.map((candidate) =>
        candidate.id === id ? { ...candidate, selected: !candidate.selected } : candidate
      )
    );
  };

  const handleRawInputChange = (id: string, raw_input: string) => {
    setCandidates((prev) =>
      prev.map((candidate) =>
        candidate.id === id
          ? { ...normalizeExtractCandidate({ ...candidate, raw_input }), selected: candidate.selected }
          : candidate
      )
    );
  };

  const handleWriteSelected = async () => {
    const selected = sortCandidatesForCreation(
      candidates.filter((candidate) => candidate.selected && !candidate.skipReason)
    );
    if (selected.length === 0) {
      onError('请至少选择一条事件');
      return;
    }

    setWriting(true);
    const created: TetoRecord[] = [];
    const failed: string[] = [];
    let lastError: string | undefined;

    try {
      for (const candidate of selected) {
        try {
          const payload = await buildRecordPayloadFromCandidateWithParse({
            candidate: normalizeExtractCandidate(candidate),
            anchorDate: date,
            items,
            tags,
            userRules,
            dayRecords,
            createdInBatch: created,
          });
          const record = await postManualRecord(payload);
          created.push(record);
        } catch (err) {
          failed.push(candidate.raw_input);
          lastError = err instanceof Error ? err.message : '写入失败';
        }
      }

      if (created.length > 0) {
        notifyRecordsChanged({ date });
        onRecordsCreated(created);
      }

      if (failed.length > 0) {
        onError(
          lastError
            ? `${failed.length} 条写入失败：${lastError}`
            : `${failed.length} 条写入失败，已成功 ${created.length} 条`
        );
      } else if (created.length > 0) {
        onClose();
      }
    } finally {
      setWriting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-indigo-900">从日记写入时间线</p>
          <p className="mt-0.5 text-[10px] text-indigo-700/80">
            AI 分析日记中的可确定事件，确认后写入今日时间线并关联日记。
          </p>
          {isFallback && (
            <p className="mt-1 text-[10px] text-amber-700">AI 不可用或未返回结果，请稍后重试。</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-slate-500 hover:bg-white/80"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在分析日记…
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-indigo-200 bg-white/70 px-3 py-6 text-center text-xs text-slate-500">
          暂无可写入的事件。
          <button
            type="button"
            onClick={() => void loadCandidates()}
            className="ml-2 text-indigo-600 hover:underline"
          >
            重新分析
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="max-h-[min(320px,40vh)] space-y-2 overflow-y-auto pr-1">
            {candidates.map((candidate) => (
              <label
                key={candidate.id}
                className={[
                  'block rounded-lg border bg-white p-2.5',
                  candidate.skipReason ? 'border-slate-200 opacity-60' : 'border-indigo-100',
                ].join(' ')}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={candidate.selected}
                    disabled={Boolean(candidate.skipReason)}
                    onChange={() => handleToggle(candidate.id)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-[11px] text-slate-500">原文：{candidate.sourceExcerpt}</p>
                    <input
                      type="text"
                      value={candidate.raw_input}
                      disabled={Boolean(candidate.skipReason)}
                      onChange={(event) => handleRawInputChange(candidate.id, event.target.value)}
                      className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200 disabled:bg-slate-50"
                    />
                    <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
                      {candidate.time_text && (
                        <span>
                          时段：
                          {candidate.time_precision === 'fuzzy' ? candidate.time_text : candidate.time_text}
                        </span>
                      )}
                      {candidate.afterExcerpt && (
                        <span>顺序：在「{candidate.afterExcerpt}」之后</span>
                      )}
                      {candidate.location && <span>地点：{candidate.location}</span>}
                      <span>置信度：{Math.round(candidate.confidence * 100)}%</span>
                      {candidate.skipReason && (
                        <span className="text-amber-700">{candidate.skipReason}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-indigo-700">
                      预览：{formatCandidatePreview(candidate)}
                    </p>
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => void loadCandidates()}
              disabled={writing}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              重新分析
            </button>
            <button
              type="button"
              onClick={() => void handleWriteSelected()}
              disabled={writing || selectedCount === 0}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              {writing ? <Loader2 className="h-3 w-3 animate-spin" /> : <PenLine className="h-3 w-3" />}
              写入 {selectedCount} 条
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
