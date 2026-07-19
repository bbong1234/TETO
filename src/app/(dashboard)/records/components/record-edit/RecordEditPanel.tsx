'use client';

import type { Goal, Item, Record, Tag } from '@/types/teto';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import RecordSourceSection from './RecordSourceSection';
import RecordMetaSection from './RecordMetaSection';
import RecordAttributionSection from './RecordAttributionSection';
import RecordFinanceSection from './RecordFinanceSection';
import RecordEditMoreSection from './RecordEditMoreSection';

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
      <RecordFinanceSection form={form} onPatch={onPatch} onError={onCreateError} />
      <RecordEditMoreSection
        record={record}
        form={form}
        items={items}
        goals={goals}
        onPatch={onPatch}
        onContextSubItemsLoaded={onContextSubItemsLoaded}
        onItemsChange={onItemsChange}
        onItemCreated={onItemCreated}
        onTagCreated={onTagCreated}
        onCreateError={onCreateError}
        onRecordPatched={onRecordPatched}
      />
    </div>
  );
}
