'use client';

import type { Record as TetoRecord } from '@/types/teto';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import { resolveRecordSourceKind } from '@/lib/activity/resolve-record-source-kind';
import SessionLogPanel from './SessionLogPanel';
import { SectionLabel } from './EditableChipRow';

interface RecordSourceSectionProps {
  record: TetoRecord;
  form: RecordEditFormState;
  onPatch: (patch: Partial<RecordEditFormState>) => void;
}

export default function RecordSourceSection({ record, form, onPatch }: RecordSourceSectionProps) {
  const kind = resolveRecordSourceKind(record);
  const isBlock = kind === 'blocktime';

  return (
    <section className="space-y-2">
      <SectionLabel>{isBlock ? '记录摘要 / 原始记录' : '原始记录'}</SectionLabel>

      {isBlock && (
        <div>
          <span className="mb-1 block text-[10px] text-slate-500">AI 总结</span>
          <input
            type="text"
            value={form.content}
            onChange={(e) => onPatch({ content: e.target.value })}
            placeholder="一句话总结本段块时间…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      <div>
        {!isBlock && (
          <span className="mb-1 block text-[10px] text-slate-500">用户输入</span>
        )}
        {isBlock && (
          <span className="mb-1 block text-[10px] text-slate-500">原始记录</span>
        )}
        {isBlock ? (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
            <SessionLogPanel sessionId={record.id} />
          </div>
        ) : (
          <textarea
            value={form.rawInput || form.content}
            onChange={(e) => onPatch({ rawInput: e.target.value, content: e.target.value })}
            rows={3}
            placeholder="随手记原文…"
            className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        )}
      </div>
    </section>
  );
}
