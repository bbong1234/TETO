'use client';

import { ChevronDown, ChevronRight, Clock, DollarSign, MapPin, Users } from 'lucide-react';
import {
  MONEY_DIRECTION_LABELS,
  OUTCOME_DIRECTION_LABELS,
  OUTCOME_TYPE_LABELS,
  PLACE_TYPE_LABELS,
} from '@/types/teto';
import type { RecordEditFormState } from '@/lib/activity/record-form';
import { CompactInput } from './CompactInput';
import RecordEditSemanticFields from './RecordEditSemanticFields';

interface RecordEditAdvancedFieldsProps {
  form: RecordEditFormState;
  open: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<RecordEditFormState>) => void;
}

export default function RecordEditAdvancedFields({
  form,
  open,
  onToggle,
  onPatch,
}: RecordEditAdvancedFieldsProps) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">更多</span>
        {open ? <ChevronDown className="h-3 w-3 text-slate-400" /> : <ChevronRight className="h-3 w-3 text-slate-400" />}
      </button>
      {open && (
        <div className="px-3 py-3 space-y-4 border-t border-slate-100">
          <RecordEditSemanticFields form={form} onPatch={onPatch} />
          <div className="space-y-2 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
            <Clock className="h-3 w-3 text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="block text-[9px] text-slate-400 leading-none mb-0.5">时间精度</span>
              <select
                value={form.timePrecision}
                onChange={(e) => onPatch({ timePrecision: e.target.value })}
                className="w-full bg-transparent text-xs text-slate-900 focus:outline-none"
              >
                <option value="">未设定</option>
                <option value="exact">精确</option>
                <option value="approx">大约</option>
                <option value="fuzzy">模糊</option>
                <option value="unknown">未知</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
            <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="block text-[9px] text-slate-400 leading-none mb-0.5">地点类型</span>
              <select
                value={form.placeType}
                onChange={(e) => onPatch({ placeType: e.target.value })}
                className="w-full bg-transparent text-xs text-slate-900 focus:outline-none"
              >
                <option value="">未设定</option>
                {Object.keys(PLACE_TYPE_LABELS).map((k) => (
                  <option key={k} value={k}>{PLACE_TYPE_LABELS[k as keyof typeof PLACE_TYPE_LABELS]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
              <span className="text-[9px] text-slate-400 shrink-0">结果类型</span>
              <select value={form.outcomeType} onChange={(e) => onPatch({ outcomeType: e.target.value })} className="flex-1 bg-transparent text-[11px] text-slate-700 focus:outline-none">
                <option value="">未设定</option>
                {Object.keys(OUTCOME_TYPE_LABELS).map((k) => (
                  <option key={k} value={k}>{OUTCOME_TYPE_LABELS[k as keyof typeof OUTCOME_TYPE_LABELS]}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
              <span className="text-[9px] text-slate-400 shrink-0">结果方向</span>
              <div className="flex gap-1">
                {(['positive', 'neutral', 'negative'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onPatch({ outcomeDirection: form.outcomeDirection === d ? '' : d })}
                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                      form.outcomeDirection === d
                        ? d === 'positive'
                          ? 'bg-green-500 text-white'
                          : d === 'negative'
                            ? 'bg-red-500 text-white'
                            : 'bg-slate-500 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {OUTCOME_DIRECTION_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3 w-3 text-slate-400 shrink-0" />
            <span className="text-[9px] text-slate-400">资金方向</span>
            <div className="flex gap-1">
              {(['expense', 'income', 'none'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onPatch({ moneyDirection: form.moneyDirection === d ? '' : d })}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    form.moneyDirection === d
                      ? d === 'expense'
                        ? 'bg-red-500 text-white'
                        : d === 'income'
                          ? 'bg-green-500 text-white'
                          : 'bg-slate-500 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {MONEY_DIRECTION_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          <CompactInput icon={<DollarSign className="h-3 w-3" />} label="币种" value={form.moneyCurrency} onChange={(v) => onPatch({ moneyCurrency: v })} placeholder="CNY" />
          <CompactInput icon={<Users className="h-3 w-3" />} label="关系角色" value={form.relationRolesStr} onChange={(v) => onPatch({ relationRolesStr: v })} placeholder="如：同事, 朋友" />
          </div>
        </div>
      )}
    </div>
  );
}
