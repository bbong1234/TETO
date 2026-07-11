'use client';

/** 1–5 级情绪，存库为字符串数字 */
export const MOOD_LEVELS = [
  { value: '1', emoji: '😞', label: '很差' },
  { value: '2', emoji: '😐', label: '一般' },
  { value: '3', emoji: '😊', label: '还行' },
  { value: '4', emoji: '😄', label: '不错' },
  { value: '5', emoji: '🤩', label: '很好' },
] as const;

export function moodValueToEmoji(value: string | null | undefined): string | null {
  if (!value) return null;
  return MOOD_LEVELS.find((m) => m.value === value)?.emoji ?? null;
}

export function averageMoodValue(values: (string | null | undefined)[]): number | null {
  const nums = values
    .map((v) => (v ? Number.parseInt(v, 10) : NaN))
    .filter((n) => !Number.isNaN(n) && n >= 1 && n <= 5);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function formatAverageMoodEmoji(avg: number | null): string {
  if (avg == null) return '—';
  const rounded = Math.round(avg);
  return moodValueToEmoji(String(rounded)) ?? '—';
}

interface MoodPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export default function MoodPicker({ value, onChange, size = 'md', className = '' }: MoodPickerProps) {
  const btnClass = size === 'sm' ? 'h-8 w-8 text-base' : 'h-9 w-9 text-lg';

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {MOOD_LEVELS.map((m) => {
        const selected = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            title={m.label}
            aria-label={m.label}
            aria-pressed={selected}
            onClick={() => onChange(selected ? null : m.value)}
            className={[
              'rounded-full transition-all',
              btnClass,
              selected
                ? 'bg-blue-50 ring-2 ring-blue-300 scale-110'
                : 'hover:bg-slate-50 opacity-70 hover:opacity-100',
            ].join(' ')}
          >
            {m.emoji}
          </button>
        );
      })}
    </div>
  );
}
