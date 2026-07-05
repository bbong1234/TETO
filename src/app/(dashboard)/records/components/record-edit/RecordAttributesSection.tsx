'use client';

import { useMemo } from 'react';
import { Activity, MapPin, Smile, Users, Zap } from 'lucide-react';
import MoodPicker, { MOOD_LEVELS } from '@/components/records/MoodPicker';
import ToolLabelField from '@/components/records/ToolLabelField';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import { CompactInput } from './CompactInput';
import EditableChipRow, { SectionLabel } from './EditableChipRow';
import RecordAttributesMoreSection from './RecordAttributesMoreSection';

interface RecordAttributesSectionProps {
  form: RecordEditFormState;
  onPatch: (patch: Partial<RecordEditFormState>) => void;
}

function moodDisplay(mood: string): string {
  if (!mood) return '';
  const level = MOOD_LEVELS.find((m) => m.value === mood);
  if (level) return `${level.emoji} ${level.label}`;
  return mood;
}

export default function RecordAttributesSection({ form, onPatch }: RecordAttributesSectionProps) {
  const feelingParts = useMemo(() => {
    const parts: string[] = [];
    const m = moodDisplay(form.mood);
    if (m) parts.push(m);
    if (form.energy.trim()) parts.push(`精力:${form.energy}`);
    if (form.bodyState.trim()) parts.push(`身体:${form.bodyState}`);
    return parts;
  }, [form.mood, form.energy, form.bodyState]);

  return (
    <section className="space-y-2">
      <SectionLabel>属性</SectionLabel>

      <div className="space-y-2">
        <div className="flex flex-wrap items-start gap-2">
          <span className="w-8 shrink-0 pt-1 text-[10px] text-slate-400">感受</span>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            <EditableChipRow
              label=""
              value={feelingParts.join(' ') || ''}
              placeholder="+ 感受"
            >
              <div className="space-y-2 min-w-[10rem]">
                <MoodPicker
                  value={/^[1-5]$/.test(form.mood) ? form.mood : null}
                  onChange={(v) => onPatch({ mood: v ?? (/^[1-5]$/.test(form.mood) ? '' : form.mood) })}
                  size="sm"
                />
                <CompactInput
                  icon={<Smile className="h-3 w-3" />}
                  label="心情文字"
                  value={/^[1-5]$/.test(form.mood) ? '' : form.mood}
                  onChange={(v) => onPatch({ mood: v })}
                  placeholder="如：不开心"
                />
                <CompactInput
                  icon={<Zap className="h-3 w-3" />}
                  label="精力"
                  value={form.energy}
                  onChange={(v) => onPatch({ energy: v })}
                />
                <CompactInput
                  icon={<Activity className="h-3 w-3" />}
                  label="身体"
                  value={form.bodyState}
                  onChange={(v) => onPatch({ bodyState: v })}
                />
              </div>
            </EditableChipRow>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-8 shrink-0 text-[10px] text-slate-400">运转</span>
          <EditableChipRow value={form.status} placeholder="+ 状态">
            <CompactInput
              icon={<Activity className="h-3 w-3" />}
              label="运转"
              value={form.status}
              onChange={(v) => onPatch({ status: v })}
              placeholder="专注/低效…"
            />
          </EditableChipRow>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-8 shrink-0 text-[10px] text-slate-400">地点</span>
          <EditableChipRow value={form.location} placeholder="+ 地点">
            <CompactInput
              icon={<MapPin className="h-3 w-3" />}
              label="地点"
              value={form.location}
              onChange={(v) => onPatch({ location: v })}
            />
          </EditableChipRow>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-8 shrink-0 text-[10px] text-slate-400">人物</span>
          <EditableChipRow value={form.peopleStr} placeholder="+ 人物">
            <CompactInput
              icon={<Users className="h-3 w-3" />}
              label="人物"
              value={form.peopleStr}
              onChange={(v) => onPatch({ peopleStr: v })}
              placeholder="逗号分隔"
            />
          </EditableChipRow>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-8 shrink-0 text-[10px] text-slate-400">工具</span>
          <div className="min-w-0 flex-1">
            <ToolLabelField
              value={form.toolLabel}
              onChange={(v) => onPatch({ toolLabel: v })}
              compact
              hideLabel
            />
          </div>
        </div>
      </div>

      <RecordAttributesMoreSection form={form} onPatch={onPatch} />
    </section>
  );
}
