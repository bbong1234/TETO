'use client';

import { Plus, Trash2 } from 'lucide-react';
import NoteMarkdownField from '@/components/records/NoteMarkdownField';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import RecordDetailSection from './RecordDetailSection';

interface RecordNoteSectionProps {
  form: RecordEditFormState;
  onPatch: (patch: Partial<RecordEditFormState>) => void;
}

export default function RecordNoteSection({ form, onPatch }: RecordNoteSectionProps) {
  const notes = form.notes.length > 0 ? form.notes : [''];

  const updateNote = (index: number, value: string) => {
    const next = [...notes];
    next[index] = value;
    onPatch({ notes: next });
  };

  const addNote = () => onPatch({ notes: [...notes, ''] });

  const removeNote = (index: number) => {
    if (notes.length <= 1) {
      onPatch({ notes: [''] });
      return;
    }
    onPatch({ notes: notes.filter((_, i) => i !== index) });
  };

  return (
    <RecordDetailSection title="笔记">
      <div className="space-y-2">
        {notes.map((note, index) => (
          <div key={index} className="relative">
            <NoteMarkdownField
              value={note}
              onChange={(v) => updateNote(index, v)}
              rows={3}
              compact
              hideLabel
            />
            {notes.length > 1 && (
              <button
                type="button"
                onClick={() => removeNote(index)}
                className="absolute right-2 top-2 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                aria-label="删除笔记"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addNote}
          className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-blue-600"
        >
          <Plus className="h-3 w-3" />
          添加笔记
        </button>
      </div>
    </RecordDetailSection>
  );
}
