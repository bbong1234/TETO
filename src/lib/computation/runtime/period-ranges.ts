import { fmtLocalDate } from '@/lib/computation/runtime/helpers';
import type { WalletPeriodKey } from '@/types/teto';

export interface WalletPeriodRange {
  period: WalletPeriodKey;
  label: string;
  date_from: string;
  date_to: string;
}

function parseReferenceDate(referenceDate?: string): Date {
  if (referenceDate) {
    return new Date(`${referenceDate}T00:00:00`);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function computeWeekRange(now: Date): { date_from: string; date_to: string } {
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    date_from: fmtLocalDate(monday),
    date_to: fmtLocalDate(sunday),
  };
}

function computeMonthRange(now: Date): { date_from: string; date_to: string } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  return {
    date_from: fmtLocalDate(firstDay),
    date_to: fmtLocalDate(lastDay),
  };
}

function computeYearRange(now: Date): { date_from: string; date_to: string } {
  const year = now.getFullYear();
  return {
    date_from: `${year}-01-01`,
    date_to: `${year}-12-31`,
  };
}

export function getWalletPeriodRanges(referenceDate?: string): WalletPeriodRange[] {
  const now = parseReferenceDate(referenceDate);
  const today = fmtLocalDate(now);

  return [
    {
      period: 'today',
      label: '今日',
      date_from: today,
      date_to: today,
    },
    {
      period: 'week',
      label: '本周',
      ...computeWeekRange(now),
    },
    {
      period: 'month',
      label: '本月',
      ...computeMonthRange(now),
    },
    {
      period: 'year',
      label: '本年',
      ...computeYearRange(now),
    },
  ];
}

export function isDateInRange(date: string, dateFrom: string, dateTo: string): boolean {
  return date >= dateFrom && date <= dateTo;
}
