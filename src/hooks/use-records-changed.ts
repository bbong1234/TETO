'use client';

import { useEffect } from 'react';

const RECORDS_CHANGED_EVENT = 'teto-records-changed';

export interface RecordsChangedDetail {
  date?: string;
  recordId?: string;
}

export function notifyRecordsChanged(detail: RecordsChangedDetail = {}) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<RecordsChangedDetail>(RECORDS_CHANGED_EVENT, { detail }));
  }
}

export function useRecordsChanged(
  onChanged: (detail: RecordsChangedDetail) => void
) {
  useEffect(() => {
    const handler = (event: Event) => {
      onChanged((event as CustomEvent<RecordsChangedDetail>).detail ?? {});
    };
    window.addEventListener(RECORDS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(RECORDS_CHANGED_EVENT, handler);
  }, [onChanged]);
}
