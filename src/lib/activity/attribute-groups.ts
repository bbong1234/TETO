import type { RecordEditFormState } from '@/lib/activity/record-form';
import { MOOD_LEVELS } from '@/components/records/MoodPicker';
import {
  OUTCOME_DIRECTION_LABELS,
  OUTCOME_TYPE_LABELS,
  PLACE_TYPE_LABELS,
} from '@/types/teto';

export type AttributeGroupId =
  | 'bodyMind'
  | 'status'
  | 'place'
  | 'people'
  | 'causality'
  | 'object'
  | 'tool'
  | 'metrics';

export interface AttributeGroupDef {
  id: AttributeGroupId;
  label: string;
}

export const ATTRIBUTE_GROUPS: AttributeGroupDef[] = [
  { id: 'bodyMind', label: '身心' },
  { id: 'status', label: '状态' },
  { id: 'place', label: '地点' },
  { id: 'people', label: '人物' },
  { id: 'causality', label: '因果' },
  { id: 'object', label: '对象' },
  { id: 'tool', label: '工具' },
  { id: 'metrics', label: '量化' },
];

function moodChip(mood: string): string {
  if (!mood.trim()) return '';
  const level = MOOD_LEVELS.find((m) => m.value === mood);
  if (level) return `${level.emoji} ${level.label}`;
  return mood.trim();
}

export function attributeGroupHasValue(form: RecordEditFormState, id: AttributeGroupId): boolean {
  switch (id) {
    case 'bodyMind':
      return !!(form.mood.trim() || form.energy.trim() || form.bodyState.trim());
    case 'status':
      return !!form.status.trim();
    case 'place':
      return !!(form.location.trim() || form.placeType);
    case 'people':
      return !!(form.peopleStr.trim() || form.relationRolesStr.trim());
    case 'causality':
      return !!(
        form.causeText.trim() ||
        form.resultText.trim() ||
        form.outcomeType ||
        form.outcomeDirection
      );
    case 'object':
      return !!(form.objectText.trim() || form.relatedObjectsStr.trim());
    case 'tool':
      return !!form.toolLabel.trim();
    case 'metrics':
      return !!(form.metricName.trim() || form.metricValue.trim() || form.metricUnit.trim());
    default:
      return false;
  }
}

export function formatAttributeGroupSummary(form: RecordEditFormState, id: AttributeGroupId): string {
  switch (id) {
    case 'bodyMind': {
      const parts = [moodChip(form.mood), form.energy.trim(), form.bodyState.trim()].filter(Boolean);
      return parts.join(' · ');
    }
    case 'status':
      return form.status.trim();
    case 'place': {
      const loc = form.location.trim();
      const pt = form.placeType ? PLACE_TYPE_LABELS[form.placeType] ?? form.placeType : '';
      return [loc, pt].filter(Boolean).join(' · ');
    }
    case 'people': {
      const p = form.peopleStr.trim();
      const r = form.relationRolesStr.trim();
      return [p, r].filter(Boolean).join(' · ');
    }
    case 'causality': {
      const parts: string[] = [];
      if (form.causeText.trim()) parts.push(`因：${form.causeText.trim()}`);
      if (form.outcomeType) parts.push(OUTCOME_TYPE_LABELS[form.outcomeType] ?? form.outcomeType);
      if (form.outcomeDirection)
        parts.push(OUTCOME_DIRECTION_LABELS[form.outcomeDirection] ?? form.outcomeDirection);
      if (form.resultText.trim()) parts.push(form.resultText.trim());
      return parts.join(' · ');
    }
    case 'object': {
      const parts = [form.objectText.trim(), form.relatedObjectsStr.trim()].filter(Boolean);
      return parts.join(' · ');
    }
    case 'tool':
      return form.toolLabel.trim();
    case 'metrics': {
      const v = form.metricValue.trim();
      const n = form.metricName.trim();
      const u = form.metricUnit.trim();
      if (!v && !n) return '';
      return `${v}${u}${n ? ` ${n}` : ''}`.trim();
    }
    default:
      return '';
  }
}

export function visibleAttributeGroups(form: RecordEditFormState): AttributeGroupDef[] {
  return ATTRIBUTE_GROUPS.filter((g) => attributeGroupHasValue(form, g.id));
}
