'use client';

import { useCallback, useMemo, useState } from 'react';
import { Loader2, Sparkles, Activity, BarChart3, MapPin, Smile, Target, Users, Zap } from 'lucide-react';
import MoodPicker from '@/components/records/MoodPicker';
import ToolLabelField from '@/components/records/ToolLabelField';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import {
  ATTRIBUTE_GROUPS,
  type AttributeGroupId,
  formatAttributeGroupSummary,
  visibleAttributeGroups,
} from '@/lib/activity/attribute-groups';
import {
  OUTCOME_DIRECTION_LABELS,
  OUTCOME_TYPE_LABELS,
  PLACE_TYPE_LABELS,
} from '@/types/teto';
import { triggerAiEnhance } from '@/lib/activity/ai-enhance-trigger';
import type { Item, Record as TetoRecord } from '@/types/teto';
import RecordDetailSection from './RecordDetailSection';
import AttributeGroupCard from './AttributeGroupCard';
import { CompactInput } from './CompactInput';

interface RecordAttributesSectionProps {
  record: TetoRecord;
  form: RecordEditFormState;
  items: Item[];
  onPatch: (patch: Partial<RecordEditFormState>) => void;
  onRecordPatched?: (record: TetoRecord) => void;
  onError?: (msg: string) => void;
}

function GroupEditor({
  groupId,
  form,
  onPatch,
}: {
  groupId: AttributeGroupId;
  form: RecordEditFormState;
  onPatch: (patch: Partial<RecordEditFormState>) => void;
}) {
  switch (groupId) {
    case 'action':
      return (
        <div className="space-y-2">
          <CompactInput label="动作" value={form.actionText} onChange={(v) => onPatch({ actionText: v })} placeholder="如：学习、吃饭" />
          <CompactInput label="事件" value={form.eventText} onChange={(v) => onPatch({ eventText: v })} placeholder="如：完成听写" />
          <CompactInput icon={<Target className="h-3 w-3" />} label="对象" value={form.objectText} onChange={(v) => onPatch({ objectText: v })} placeholder="如：英语、早饭" />
        </div>
      );
    case 'bodyMind':
      return (
        <div className="space-y-2">
          <MoodPicker
            value={/^[1-5]$/.test(form.mood) ? form.mood : null}
            onChange={(v) => onPatch({ mood: v ?? '' })}
            size="sm"
          />
          <CompactInput
            icon={<Smile className="h-3 w-3" />}
            label="心情"
            value={/^[1-5]$/.test(form.mood) ? '' : form.mood}
            onChange={(v) => onPatch({ mood: v })}
            placeholder="如：一般、烦躁"
          />
          <CompactInput icon={<Zap className="h-3 w-3" />} label="精力" value={form.energy} onChange={(v) => onPatch({ energy: v })} />
          <CompactInput icon={<Activity className="h-3 w-3" />} label="身体" value={form.bodyState} onChange={(v) => onPatch({ bodyState: v })} />
        </div>
      );
    case 'status':
      return (
        <CompactInput icon={<Activity className="h-3 w-3" />} label="状态" value={form.status} onChange={(v) => onPatch({ status: v })} />
      );
    case 'place':
      return (
        <div className="space-y-2">
          <CompactInput icon={<MapPin className="h-3 w-3" />} label="地点" value={form.location} onChange={(v) => onPatch({ location: v })} />
          <select
            value={form.placeType}
            onChange={(e) => onPatch({ placeType: e.target.value })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          >
            <option value="">地点类型</option>
            {Object.entries(PLACE_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      );
    case 'people':
      return (
        <div className="space-y-2">
          <CompactInput icon={<Users className="h-3 w-3" />} label="人物" value={form.peopleStr} onChange={(v) => onPatch({ peopleStr: v })} />
          <CompactInput label="关系角色" value={form.relationRolesStr} onChange={(v) => onPatch({ relationRolesStr: v })} />
        </div>
      );
    case 'causality':
      return (
        <div className="space-y-2">
          <CompactInput label="原因" value={form.causeText} onChange={(v) => onPatch({ causeText: v })} />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.outcomeType}
              onChange={(e) => onPatch({ outcomeType: e.target.value })}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            >
              <option value="">结果类型</option>
              {Object.entries(OUTCOME_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <div className="flex gap-1">
              {(['positive', 'neutral', 'negative'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onPatch({ outcomeDirection: form.outcomeDirection === d ? '' : d })}
                  className={`flex-1 rounded px-1 py-1 text-[9px] ${
                    form.outcomeDirection === d ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {OUTCOME_DIRECTION_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
          <CompactInput label="结果" value={form.resultText} onChange={(v) => onPatch({ resultText: v })} />
        </div>
      );
    case 'object':
      return (
        <div className="space-y-2">
          <CompactInput icon={<Target className="h-3 w-3" />} label="对象" value={form.objectText} onChange={(v) => onPatch({ objectText: v })} />
          <CompactInput label="关联线索" value={form.relatedObjectsStr} onChange={(v) => onPatch({ relatedObjectsStr: v })} />
        </div>
      );
    case 'tool':
      return <ToolLabelField value={form.toolLabel} onChange={(v) => onPatch({ toolLabel: v })} compact />;
    case 'metrics':
      return (
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
          <BarChart3 className="h-3 w-3 text-slate-400" />
          <input type="text" value={form.metricName} onChange={(e) => onPatch({ metricName: e.target.value })} placeholder="指标名" className="w-16 text-xs focus:outline-none" />
          <input type="number" value={form.metricValue} onChange={(e) => onPatch({ metricValue: e.target.value })} placeholder="值" className="w-12 text-xs focus:outline-none" />
          <input type="text" value={form.metricUnit} onChange={(e) => onPatch({ metricUnit: e.target.value })} placeholder="单位" className="w-12 text-xs focus:outline-none" />
        </div>
      );
    default:
      return null;
  }
}

export default function RecordAttributesSection({
  record,
  form,
  items,
  onPatch,
  onRecordPatched,
  onError,
}: RecordAttributesSectionProps) {
  const [openGroups, setOpenGroups] = useState<Set<AttributeGroupId>>(() => new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reextracting, setReextracting] = useState(false);

  const visible = useMemo(() => visibleAttributeGroups(form), [form]);

  const displayedGroups = useMemo(() => {
    const ids = new Set<AttributeGroupId>();
    for (const g of visible) ids.add(g.id);
    for (const id of openGroups) ids.add(id);
    return ATTRIBUTE_GROUPS.filter((g) => ids.has(g.id));
  }, [visible, openGroups]);

  const toggleGroup = useCallback((id: AttributeGroupId) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const addGroup = (id: AttributeGroupId) => {
    setOpenGroups((prev) => new Set(prev).add(id));
    setPickerOpen(false);
  };

  const handleReextract = async () => {
    const text = (form.rawInput || record.raw_input || '').trim();
    if (!text) return;
    setReextracting(true);
    try {
      await triggerAiEnhance({
        recordId: record.id,
        inputText: text,
        date: form.recordDate,
        items,
        existingItemId: record.item_id,
        inputSource: record.input_source === 'quick' ? 'quick' : undefined,
        onFieldsUpdated: (_patch, updated) => {
          if (updated) onRecordPatched?.(updated);
        },
        onError: (msg) => onError?.(msg),
      });
    } finally {
      setReextracting(false);
    }
  };

  const hiddenGroups = ATTRIBUTE_GROUPS.filter((g) => !displayedGroups.some((d) => d.id === g.id));

  return (
    <RecordDetailSection
      title="属性"
      action={
        (form.rawInput || record.raw_input)?.trim() ? (
          <button
            type="button"
            disabled={reextracting}
            onClick={() => void handleReextract()}
            className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-blue-600 disabled:opacity-50"
          >
            {reextracting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            从原文识别
          </button>
        ) : null
      }
    >
      {visible.length === 0 && !pickerOpen && (
        <p className="text-[11px] text-slate-400">从输入中未识别到属性，可手动添加</p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {displayedGroups.map((g) => (
          <AttributeGroupCard
            key={g.id}
            label={g.label}
            summary={formatAttributeGroupSummary(form, g.id)}
            open={openGroups.has(g.id)}
            onToggle={() => toggleGroup(g.id)}
          >
            <GroupEditor groupId={g.id} form={form} onPatch={onPatch} />
          </AttributeGroupCard>
        ))}
      </div>

      <div className="relative mt-2">
        <button type="button" onClick={() => setPickerOpen((v) => !v)} className="text-[10px] font-medium text-slate-400 hover:text-slate-600">
          + 添加属性
        </button>
        {pickerOpen && hiddenGroups.length > 0 && (
          <div className="absolute left-0 top-full z-10 mt-1 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-md">
            {hiddenGroups.map((g) => (
              <button key={g.id} type="button" onClick={() => addGroup(g.id)} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 hover:bg-blue-50">
                {g.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </RecordDetailSection>
  );
}
