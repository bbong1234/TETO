'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Goal, Item, Record, Tag } from '@/types/teto';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import { resolveRecordSourceKind } from '@/lib/activity/resolve-record-source-kind';
import RecordGoalSection from './RecordGoalSection';
import RecordAttributesSection from './RecordAttributesSection';
import RecordNoteSection from './RecordNoteSection';
import RecordEditLinksSection from './RecordEditLinksSection';
import RecordDetailSection from './RecordDetailSection';
import SessionLogPanel from './SessionLogPanel';

interface RecordEditMoreSectionProps {
  record: Record;
  form: RecordEditFormState;
  items: Item[];
  goals?: Goal[];
  onPatch: (patch: Partial<RecordEditFormState>) => void;
  onContextSubItemsLoaded: (count: number) => void;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onTagCreated?: (tag: Tag) => void;
  onCreateError?: (message: string) => void;
  onRecordPatched?: (record: Record) => void;
}

export default function RecordEditMoreSection({
  record,
  form,
  items,
  goals,
  onPatch,
  onContextSubItemsLoaded,
  onItemsChange,
  onItemCreated,
  onTagCreated,
  onCreateError,
  onRecordPatched,
}: RecordEditMoreSectionProps) {
  const [open, setOpen] = useState(false);
  const hasLinks = !!(record.linked_records && record.linked_records.length > 0);
  const isBlock = resolveRecordSourceKind(record) === 'blocktime';

  return (
    <section className="rounded-xl border border-slate-100 bg-white px-3 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">更多</span>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          {isBlock && (
            <RecordDetailSection title="块时间对话">
              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                <SessionLogPanel sessionId={record.id} />
              </div>
            </RecordDetailSection>
          )}

          <RecordGoalSection
            form={form}
            items={items}
            goals={goals}
            goalBadge={record.goal ?? null}
            onPatch={onPatch}
          />

          <RecordAttributesSection
            record={record}
            form={form}
            items={items}
            onPatch={onPatch}
            onRecordPatched={onRecordPatched}
            onError={onCreateError}
          />

          <RecordNoteSection form={form} onPatch={onPatch} />

          {hasLinks && (
            <RecordDetailSection title={`关联记录 (${record.linked_records!.length})`}>
              <RecordEditLinksSection recordId={record.id} />
            </RecordDetailSection>
          )}
        </div>
      )}
    </section>
  );
}
