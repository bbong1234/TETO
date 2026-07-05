'use client';

import { Activity, TrendingUp } from 'lucide-react';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import { CompactInput } from './CompactInput';
import { SectionLabel } from './EditableChipRow';

interface RecordContextSectionProps {
  form: RecordEditFormState;
  onPatch: (patch: Partial<RecordEditFormState>) => void;
  /** 语境已在属性·更多展示 event_text 时避免重复 */
  hideEventInContext?: boolean;
}

export default function RecordContextSection({
  form,
  onPatch,
  hideEventInContext = false,
}: RecordContextSectionProps) {
  const contextEvent = hideEventInContext ? '' : form.eventText;

  return (
    <section className="space-y-2">
      <SectionLabel>上下文</SectionLabel>
      {!hideEventInContext && (
        <CompactInput
          icon={<Activity className="h-3 w-3" />}
          label="语境"
          value={contextEvent}
          onChange={(v) => onPatch({ eventText: v })}
          placeholder="叙述性补充"
        />
      )}
      {hideEventInContext && form.timeText.trim() && (
        <CompactInput
          icon={<Activity className="h-3 w-3" />}
          label="语境"
          value={form.timeText}
          onChange={(v) => onPatch({ timeText: v })}
        />
      )}
      <CompactInput
        icon={<Activity className="h-3 w-3" />}
        label="原因"
        value={form.causeText}
        onChange={(v) => onPatch({ causeText: v })}
      />
      <CompactInput
        icon={<TrendingUp className="h-3 w-3" />}
        label="结果"
        value={form.resultText}
        onChange={(v) => onPatch({ resultText: v })}
      />
    </section>
  );
}
