'use client';

import type { Record as TetoRecord } from '@/types/teto';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import { resolveRecordOriginalText } from '@/lib/activity/record-form';
import { resolveRecordSourceKind } from '@/lib/activity/resolve-record-source-kind';

interface RecordSourceSectionProps {
  record: TetoRecord;
  form: RecordEditFormState;
  onPatch: (patch: Partial<RecordEditFormState>) => void;
}

export default function RecordSourceSection({ record, form, onPatch }: RecordSourceSectionProps) {
  const kind = resolveRecordSourceKind(record);
  const isBlock = kind === 'blocktime';
  const fallback = resolveRecordOriginalText(record, form);
  const value = isBlock ? form.content || fallback : form.rawInput || fallback;

  return (
    <textarea
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        if (isBlock) {
          onPatch({ content: next });
        } else {
          onPatch({ rawInput: next });
        }
      }}
      rows={5}
      placeholder="记录内容…"
      className="w-full min-h-[6rem] resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
    />
  );
}
