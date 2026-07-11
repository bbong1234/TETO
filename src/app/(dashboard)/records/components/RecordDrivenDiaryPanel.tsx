'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, BookOpen, Sparkles, Save, RefreshCw } from 'lucide-react';
import type { Record as TetoRecord } from '@/types/teto';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDuration(mins: number | null | undefined) {
  if (!mins || mins <= 0) return '';
  if (mins < 60) return `${mins}分钟`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function buildSkeleton(records: TetoRecord[]): string {
  const eventRecords = records.filter(
    (r) => r.type === '发生' && !r.id.startsWith('session:') && !r.id.startsWith('pending:')
  );
  if (eventRecords.length === 0) return '';

  const lines: string[] = [];
  for (const r of eventRecords) {
    const parts: string[] = [];
    if (r.item?.title) parts.push(`${r.item.title}：`);
    parts.push(r.content || r.raw_input || '');
    const dur = formatDuration(r.duration_minutes);
    if (dur) parts.push(`（${dur}）`);
    if (r.cost != null && r.cost > 0) parts.push(`花费¥${r.cost}`);
    lines.push(parts.join(''));
  }

  const items = [...new Set(eventRecords.map((r) => r.item?.title).filter(Boolean))];
  const intro =
    items.length > 0
      ? `今天主要投入在${items.slice(0, 3).join('、')}上。`
      : '今天的记录如下。';

  return intro + '\n\n' + lines.map((l) => `- ${l}`).join('\n');
}

interface RecordDrivenDiaryPanelProps {
  date?: string;
  onDiarySaved?: (record: TetoRecord) => void;
  onError?: (msg: string) => void;
}

export default function RecordDrivenDiaryPanel({
  date,
  onDiarySaved,
  onError,
}: RecordDrivenDiaryPanelProps) {
  const targetDate = date ?? todayStr();
  const [records, setRecords] = useState<TetoRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [skeleton, setSkeleton] = useState('');
  const [userSupplement, setUserSupplement] = useState('');
  const [finalDiary, setFinalDiary] = useState('');
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadRecords = useCallback(async () => {
    setLoadingRecords(true);
    try {
      const res = await fetch(`/api/v2/records?date_from=${targetDate}&date_to=${targetDate}&limit=100`);
      const data = await res.json();
      const recs: TetoRecord[] = Array.isArray(data.data) ? data.data : [];
      setRecords(recs);
      setSkeleton(buildSkeleton(recs));
    } catch {
      onError?.('加载记录失败');
    } finally {
      setLoadingRecords(false);
    }
  }, [targetDate, onError]);

  useEffect(() => { void loadRecords(); }, [loadRecords]);

  const generateDraft = async () => {
    if (!skeleton.trim() && !userSupplement.trim()) return;
    setGeneratingDraft(true);
    try {
      const prompt = [
        skeleton.trim() && `今天的事实记录：\n${skeleton}`,
        userSupplement.trim() && `我的补充：\n${userSupplement}`,
      ].filter(Boolean).join('\n\n');

      const res = await fetch('/api/v2/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: `请根据以下内容，整理成一篇自然流畅的个人日记（100-200字）。保留所有关键事实和感受，用第一人称：\n\n${prompt}`,
          date: targetDate,
          mode: 'diary',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const units = data.data?.parsed?.units ?? [];
        const aiText = units[0]?.main_text ?? units[0]?.action_text ?? '';
        if (aiText) {
          setFinalDiary(aiText);
        } else {
          setFinalDiary([skeleton.trim(), userSupplement.trim()].filter(Boolean).join('\n\n'));
        }
      } else {
        setFinalDiary([skeleton.trim(), userSupplement.trim()].filter(Boolean).join('\n\n'));
      }
    } catch {
      setFinalDiary([skeleton.trim(), userSupplement.trim()].filter(Boolean).join('\n\n'));
    } finally {
      setGeneratingDraft(false);
    }
  };

  const saveDiary = async () => {
    const content = finalDiary.trim() || [skeleton.trim(), userSupplement.trim()].filter(Boolean).join('\n\n');
    if (!content) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v2/records?enhance=client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          type: '总结',
          date: targetDate,
          raw_input: content,
          input_source: 'manual',
          review_status: 'confirmed',
          lifecycle_status: 'completed',
        }),
      });
      if (!res.ok) throw new Error('保存失败');
      const data = await res.json();
      onDiarySaved?.(data.data as TetoRecord);
      setSaved(true);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const eventRecords = records.filter((r) => r.type === '发生' && !r.id.startsWith('session:'));
  const planRecords = records.filter((r) => r.type === '计划');

  return (
    <div className="space-y-4">
      {/* 今日概览 */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-600">今天已记录</span>
          <button
            type="button"
            onClick={loadRecords}
            disabled={loadingRecords}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingRecords ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {loadingRecords ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        ) : eventRecords.length === 0 && planRecords.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">今天还没有记录</p>
        ) : (
          <div className="space-y-1">
            {eventRecords.slice(0, 6).map((r) => (
              <div key={r.id} className="flex items-start gap-2 text-xs text-slate-600">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-green-400 shrink-0" />
                <span className="flex-1 leading-snug">
                  {r.content || r.raw_input || ''}
                  {r.duration_minutes != null && r.duration_minutes > 0 && (
                    <span className="ml-1 text-slate-400">{formatDuration(r.duration_minutes)}</span>
                  )}
                </span>
              </div>
            ))}
            {eventRecords.length > 6 && (
              <p className="text-[10px] text-slate-400">还有 {eventRecords.length - 6} 条…</p>
            )}
          </div>
        )}
      </div>

      {/* 用户补充 */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          补充感受、原因、明日计划…
        </label>
        <textarea
          value={userSupplement}
          onChange={(e) => setUserSupplement(e.target.value)}
          placeholder="今天状态一般，下午有些累。A项目卡在客户反馈慢。明天继续完善方案。"
          rows={4}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 resize-none transition-colors"
        />
      </div>

      {/* 生成按钮 */}
      {!finalDiary && (
        <button
          type="button"
          onClick={generateDraft}
          disabled={generatingDraft || (eventRecords.length === 0 && !userSupplement.trim())}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm text-slate-500 hover:border-blue-300 hover:text-blue-600 disabled:opacity-50 transition-colors"
        >
          {generatingDraft ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {generatingDraft ? 'AI 整理中…' : '生成日记草稿'}
        </button>
      )}

      {/* 日记草稿编辑 */}
      {finalDiary && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-600">日记草稿</label>
            <button
              type="button"
              onClick={() => setFinalDiary('')}
              className="text-[10px] text-slate-400 hover:text-slate-600 underline"
            >
              重新生成
            </button>
          </div>
          <textarea
            value={finalDiary}
            onChange={(e) => setFinalDiary(e.target.value)}
            rows={8}
            className="w-full rounded-xl border border-blue-200 bg-blue-50/30 px-3 py-2.5 text-sm text-slate-800 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none transition-colors"
          />
          <button
            type="button"
            onClick={saveDiary}
            disabled={saving || saved}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-2.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <>
                <BookOpen className="h-4 w-4" />
                已保存
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                保存日记
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
