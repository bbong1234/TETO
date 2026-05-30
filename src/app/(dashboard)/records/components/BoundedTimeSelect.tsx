'use client';

import { useEffect, useMemo } from 'react';

function parseHHMM(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function compareHHMM(a: string, b: string): number {
  return parseHHMM(a) - parseHHMM(b);
}

function addMinutesHHMM(time: string, delta: number): string {
  return formatMinutes(parseHHMM(time) + delta);
}

export function buildTimeOptions(min: string, max: string): string[] {
  if (compareHHMM(min, max) > 0) return [];
  const options: string[] = [];
  for (let m = parseHHMM(min); m <= parseHHMM(max); m++) {
    options.push(formatMinutes(m));
  }
  return options;
}

/** 空白时段内「开始」可选分钟：至少留 1 分钟给结束 */
export function buildGapStartOptions(
  gapMin: string,
  gapMax: string,
  endTime?: string
): string[] {
  let max = addMinutesHHMM(gapMax, -1);
  if (compareHHMM(max, gapMin) < 0) return [];
  if (endTime) {
    const endCap = addMinutesHHMM(endTime, -1);
    if (compareHHMM(endCap, max) < 0) max = endCap;
  }
  if (compareHHMM(max, gapMin) < 0) return [];
  return buildTimeOptions(gapMin, max);
}

/** 空白时段内「结束」可选分钟：必须晚于开始至少 1 分钟 */
export function buildGapEndOptions(
  gapMin: string,
  gapMax: string,
  startTime?: string
): string[] {
  let min = addMinutesHHMM(gapMin, 1);
  if (compareHHMM(min, gapMax) > 0) return [];
  if (startTime) {
    const startFloor = addMinutesHHMM(startTime, 1);
    if (compareHHMM(startFloor, min) > 0) min = startFloor;
  }
  if (compareHHMM(min, gapMax) > 0) return [];
  return buildTimeOptions(min, gapMax);
}

interface BoundedTimeSelectProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}

export default function BoundedTimeSelect({
  value,
  options,
  onChange,
  disabled,
  id,
}: BoundedTimeSelectProps) {
  const safeValue = useMemo(() => {
    if (options.length === 0) return '';
    if (value && options.includes(value)) return value;
    return options[0]!;
  }, [value, options]);

  useEffect(() => {
    if (options.length === 0) return;
    if (safeValue && safeValue !== value) {
      onChange(safeValue);
    }
  }, [safeValue, value, options.length, onChange]);

  if (options.length === 0) {
    return (
      <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm text-slate-400">
        时段过短，无法补记
      </div>
    );
  }

  return (
    <select
      id={id}
      value={safeValue}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm focus:border-blue-400 focus:outline-none"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
