'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Link2, Loader2, Save } from 'lucide-react';
import type { Record as TetoRecord } from '@/types/teto';
import {
  appendPlainText,
  parseDiaryDocument,
  pruneLinksForMissingRecords,
  reconcileLinksAfterBodyEdit,
  serializeDiaryDocument,
  normalizeLinkSurroundingSpaces,
  updateLinkText,
  type DiaryDocument,
  type DiaryLinkSpan,
} from '@/lib/activity/diary-document';
import { importRecordsIntoDiary, matchLinksInBody } from '@/lib/activity/diary-link-matcher';
import { notifyRecordsChanged } from '@/hooks/use-records-changed';
import { usePersistedRatio } from '@/hooks/use-persisted-ratio';
import ResizableSplit from '@/components/ui/ResizableSplit';
import DiaryLinkedEditor from './DiaryLinkedEditor';
import DiaryAiCompanion from './DiaryAiCompanion';

const AUTO_SAVE_MS = 600;
const RECORD_SYNC_MS = 600;

interface RecordsDiaryFooterProps {
  date: string;
  dayRecords?: TetoRecord[];
  onError: (message: string) => void;
  onRecordPatched?: (record: TetoRecord) => void;
  focusedRecordId?: string | null;
  onFocusRecord?: (recordId: string | null) => void;
  layout?: 'footer' | 'panel';
}

export default function RecordsDiaryFooter({
  date,
  dayRecords = [],
  onError,
  onRecordPatched,
  focusedRecordId = null,
  onFocusRecord,
  layout = 'footer',
}: RecordsDiaryFooterProps) {
  const isPanel = layout === 'panel';
  const [diaryRowRatio, setDiaryRowRatio] = usePersistedRatio('records-layout-diary-row', 0.66);
  const [document, setDocument] = useState<DiaryDocument>(() => parseDiaryDocument(null));
  const [loading, setLoading] = useState(true);
  const [contentReady, setContentReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const documentRef = useRef(document);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordSyncTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  documentRef.current = document;

  const setDocumentState = useCallback((next: DiaryDocument) => {
    documentRef.current = next;
    setDocument(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setContentReady(false);
    setSaveStatus('idle');
    void fetch(`/api/v2/record-days?date=${date}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message ?? '加载日记失败');
        if (!cancelled) {
          setDocumentState(parseDiaryDocument(json.data?.summary));
        }
      })
      .catch((cause) => {
        if (!cancelled) onError(cause instanceof Error ? cause.message : '加载日记失败');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          requestAnimationFrame(() => {
            if (!cancelled) setContentReady(true);
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date, onError, setDocumentState]);

  useEffect(() => {
    setDocument((prev) => pruneLinksForMissingRecords(prev, dayRecords));
  }, [dayRecords]);

  const persist = useCallback(async () => {
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/v2/record-days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          summary: serializeDiaryDocument(documentRef.current),
        }),
      });
      if (!res.ok) throw new Error('保存失败');
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : '保存失败');
      setSaveStatus('idle');
    }
  }, [date, onError]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persist();
    }, AUTO_SAVE_MS);
  }, [persist]);

  const syncRecordRawInput = useCallback(
    (recordId: string, text: string) => {
      const timers = recordSyncTimersRef.current;
      const existing = timers.get(recordId);
      if (existing) clearTimeout(existing);
      timers.set(
        recordId,
        setTimeout(() => {
          timers.delete(recordId);
          void (async () => {
            try {
              const res = await fetch(`/api/v2/records/${recordId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ raw_input: text }),
              });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error?.message ?? '同步记录失败');
              if (json.data) {
                onRecordPatched?.(json.data as TetoRecord);
                notifyRecordsChanged({ date });
              }
            } catch (cause) {
              onError(cause instanceof Error ? cause.message : '同步记录失败');
            }
          })();
        }, RECORD_SYNC_MS)
      );
    },
    [date, onError, onRecordPatched]
  );

  const applyDocument = useCallback(
    (doc: DiaryDocument) => {
      const normalized = normalizeLinkSurroundingSpaces(doc.body, doc.links);
      const next = { ...doc, body: normalized.body, links: normalized.links };
      setDocumentState(next);
      setSaveStatus('idle');
      scheduleSave();
      return next;
    },
    [scheduleSave, setDocumentState]
  );

  const handleBodyChange = useCallback(
    (body: string, links?: DiaryLinkSpan[]) => {
      const base = links
        ? { ...documentRef.current, body, links }
        : { ...documentRef.current, body };
      const reconciled = links ? base : reconcileLinksAfterBodyEdit(base, dayRecords);
      const rematched = links
        ? reconciled
        : {
            ...reconciled,
            links: matchLinksInBody(reconciled.body, dayRecords, reconciled.links),
          };
      applyDocument(rematched);
    },
    [applyDocument, dayRecords]
  );

  const handleLinkTextChange = useCallback(
    (linkId: string, text: string) => {
      const updated = updateLinkText(documentRef.current, linkId, text);
      if (!updated) return;
      applyDocument(updated);
      const link = updated.links.find((item) => item.id === linkId);
      if (link) syncRecordRawInput(link.recordId, text);
    },
    [applyDocument, syncRecordRawInput]
  );

  const handleImportFromTimeline = useCallback(() => {
    const { document: next, added } = importRecordsIntoDiary(documentRef.current, dayRecords);
    if (added === 0) {
      onError('没有可写入的新时间线记录');
      return;
    }
    applyDocument(next);
  }, [applyDocument, dayRecords, onError]);

  const handleAppendFromAi = useCallback(
    (text: string) => {
      setDocumentState(appendPlainText(documentRef.current, text));
      setSaveStatus('idle');
      scheduleSave();
    },
    [scheduleSave, setDocumentState]
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        void persist();
      }
      for (const timer of recordSyncTimersRef.current.values()) {
        clearTimeout(timer);
      }
      recordSyncTimersRef.current.clear();
    };
  }, [persist]);

  const toolbar = (
    <div
      className={`flex items-center justify-between gap-2 px-1 transition-opacity duration-200 ${
        loading ? 'opacity-70' : 'opacity-100'
      } ${isPanel ? 'sticky top-0 z-10 shrink-0 bg-white pb-2 pt-1' : 'mb-1.5'}`}
    >
      <span className="text-xs font-semibold text-slate-600">日记</span>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {loading && (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            加载中…
          </span>
        )}
        {saveStatus === 'saving' && <span className="text-[10px] text-blue-500">保存中…</span>}
        {saveStatus === 'saved' && <span className="text-[10px] text-green-600">已保存</span>}
        <button
          type="button"
          onClick={handleImportFromTimeline}
          disabled={loading}
          className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-40"
        >
          <Link2 className="h-3 w-3" />
          从时间线写入
        </button>
        <button
          type="button"
          onClick={() => void persist()}
          disabled={saveStatus === 'saving' || loading}
          className="flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-[11px] text-white hover:bg-slate-900 disabled:opacity-40"
        >
          {saveStatus === 'saved' ? <BookOpen className="h-3 w-3" /> : <Save className="h-3 w-3" />}
          保存
        </button>
      </div>
    </div>
  );

  const shellClass = isPanel
    ? 'flex h-full min-h-0 flex-1 flex-col bg-white px-1 py-2'
    : 'shrink-0 border-t border-slate-200 bg-white px-1 py-3';

  const editor = (
    <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="relative min-h-0 flex-1">
        <DiaryLinkedEditor
          document={document}
          loading={loading}
          contentReady={contentReady}
          focusedRecordId={focusedRecordId}
          onFocusRecord={onFocusRecord}
          onBodyChange={handleBodyChange}
          onLinkTextChange={handleLinkTextChange}
        />
        {loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-white/60">
            <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
          </div>
        )}
      </div>
    </div>
  );

  if (!isPanel) {
    return <div className={shellClass}>{editor}</div>;
  }

  return (
    <div className={shellClass}>
      <ResizableSplit
        direction="vertical"
        ratio={diaryRowRatio}
        onRatioChange={setDiaryRowRatio}
        first={editor}
        second={
          <DiaryAiCompanion
            date={date}
            body={document.body}
            dayRecords={dayRecords}
            onAppendToDiary={handleAppendFromAi}
            onError={onError}
            fillHeight
          />
        }
        minFirstPx={160}
        minSecondPx={120}
        handleLabel="拖动调整日记与 AI 助手"
        className="min-h-0 flex-1"
        firstClassName="flex min-h-0 flex-col"
        secondClassName="flex min-h-0 flex-col"
      />
    </div>
  );
}
