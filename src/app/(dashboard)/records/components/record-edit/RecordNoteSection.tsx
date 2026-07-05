'use client';

import NoteMarkdownField from '@/components/records/NoteMarkdownField';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import { SectionLabel } from './EditableChipRow';

interface RecordNoteSectionProps {
  form: RecordEditFormState;
  onPatch: (patch: Partial<RecordEditFormState>) => void;
}

export default function RecordNoteSection({ form, onPatch }: RecordNoteSectionProps) {
  return (
    <section>
      <SectionLabel>笔记</SectionLabel>
      <NoteMarkdownField value={form.note} onChange={(v) => onPatch({ note: v })} rows={3} compact />
    </section>
  );
}
