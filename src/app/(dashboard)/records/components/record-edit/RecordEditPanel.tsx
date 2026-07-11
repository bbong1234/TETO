'use client';

import type { Goal, Item, Record, Tag } from '@/types/teto';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import RecordSourceSection from './RecordSourceSection';
import RecordMetaSection from './RecordMetaSection';
import RecordAttributionSection from './RecordAttributionSection';
import RecordGoalSection from './RecordGoalSection';
import RecordFinanceSection from './RecordFinanceSection';
import RecordAttributesSection from './RecordAttributesSection';
import RecordNoteSection from './RecordNoteSection';
import RecordEditLinksSection from './RecordEditLinksSection';
import RecordDetailSection from './RecordDetailSection';

interface RecordEditPanelProps {
  record: Record;
  form: RecordEditFormState;
  items: Item[];
  tags: Tag[];
  goals?: Goal[];
  onPatch: (patch: Partial<RecordEditFormState>) => void;
  onContextSubItemsLoaded: (count: number) => void;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onTagCreated?: (tag: Tag) => void;
  onCreateError?: (message: string) => void;
  onRecordPatched?: (record: Record) => void;
}

export default function RecordEditPanel({
  record,
  form,
  items,
  tags,
  goals,
  onPatch,
  onContextSubItemsLoaded,
  onItemsChange,
  onItemCreated,
  onTagCreated,
  onCreateError,
  onRecordPatched,
}: RecordEditPanelProps) {
  const hasLinks = !!(record.linked_records && record.linked_records.length > 0);

  return (
    <div className="space-y-3">
      <RecordSourceSection record={record} form={form} onPatch={onPatch} />
      <RecordMetaSection form={form} originalRecord={record} onPatch={onPatch} />
      <RecordAttributionSection
        form={form}
        items={items}
        tags={tags}
        onPatch={onPatch}
        onContextSubItemsLoaded={onContextSubItemsLoaded}
        onItemsChange={onItemsChange}
        onItemCreated={onItemCreated}
        onTagCreated={onTagCreated}
        onCreateError={onCreateError}
      />
      <RecordGoalSection
        form={form}
        items={items}
        goals={goals}
        goalBadge={record.goal ?? null}
        onPatch={onPatch}
      />
      <RecordFinanceSection form={form} onPatch={onPatch} />
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
  );
}
