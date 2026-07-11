'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Item } from '@/types/teto';
import MoodPicker from '@/components/records/MoodPicker';
import ItemAttributionChips from '@/components/records/ItemAttributionChips';
import { loadLastActivityContext } from '@/lib/activity/recent-context';

export interface StopActivityCapture {
  mood: string | null;
  cost: number | null;
  money_direction: 'expense' | 'none';
  item_id?: string | null;
}

interface StopActivitySheetProps {
  open: boolean;
  loading?: boolean;
  needsAttribution?: boolean;
  items?: Item[];
  initialMood?: string | null;
  initialCost?: number | null;
  onConfirm: (capture: StopActivityCapture) => void;
  onCancel: () => void;
}

export default function StopActivitySheet({
  open,
  loading = false,
  needsAttribution = false,
  items = [],
  initialMood = null,
  initialCost = null,
  onConfirm,
  onCancel,
}: StopActivitySheetProps) {
  const [mood, setMood] = useState<string | null>(null);
  const [spent, setSpent] = useState(false);
  const [costText, setCostText] = useState('');
  const [itemId, setItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMood(initialMood);
    const hasCost = initialCost != null && initialCost > 0;
    setSpent(hasCost);
    setCostText(hasCost ? String(initialCost) : '');
    setItemId(null);
  }, [open, initialMood, initialCost]);

  if (!open) return null;

  const handleConfirm = () => {
    const cost = spent && costText.trim() ? Number.parseFloat(costText) : null;
    onConfirm({
      mood,
      cost: cost != null && !Number.isNaN(cost) && cost > 0 ? cost : null,
      money_direction: cost != null && cost > 0 ? 'expense' : 'none',
      item_id: needsAttribution ? itemId : undefined,
    });
    setMood(null);
    setSpent(false);
    setCostText('');
    setItemId(null);
  };

  const lastContext = loadLastActivityContext();

  return (
    <div className="border-t border-slate-100 px-4 py-3 space-y-3 bg-slate-50/50">
      <p className="text-xs font-medium text-slate-600">这次感觉？</p>
      <MoodPicker value={mood} onChange={setMood} size="sm" />

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500">花钱了？</span>
        <button
          type="button"
          onClick={() => {
            setSpent(false);
            setCostText('');
          }}
          className={[
            'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
            !spent ? 'bg-slate-200 text-slate-700' : 'bg-white border border-slate-200 text-slate-500',
          ].join(' ')}
        >
          没有
        </button>
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-400">¥</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={costText}
            onChange={(e) => {
              setCostText(e.target.value);
              if (e.target.value) setSpent(true);
            }}
            onFocus={() => setSpent(true)}
            placeholder="金额"
            className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs tabular-nums focus:border-blue-300 focus:outline-none"
          />
        </div>
      </div>

      {needsAttribution && items.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-500">归个类？</p>
          <ItemAttributionChips
            items={items}
            selectedId={itemId}
            onSelect={setItemId}
            recentContext={lastContext}
            limit={3}
            showSkip
            skipLabel="稍后"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={handleConfirm}
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          完成停止
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
        >
          继续
        </button>
      </div>
    </div>
  );
}
