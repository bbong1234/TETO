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
import RecordContextSection from './RecordContextSection';
import RecordEditLinksSection from './RecordEditLinksSection';
import { SectionLabel } from './EditableChipRow';

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
}: RecordEditPanelProps) {
  const hasLinks = !!(record.linked_records && record.linked_records.length > 0);
  const eventInMore = !!form.eventText.trim();

  return (
    <div className="space-y-4">
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
      <RecordAttributesSection form={form} onPatch={onPatch} />
      <RecordNoteSection form={form} onPatch={onPatch} />
      <RecordContextSection form={form} onPatch={onPatch} hideEventInContext={eventInMore} />
      {hasLinks && (
        <section>
          <SectionLabel>关联记录 ({record.linked_records!.length})</SectionLabel>
          <RecordEditLinksSection recordId={record.id} />
        </section>
      )}
    </div>
  );
}
