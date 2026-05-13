import { Suspense } from 'react';
import RecordsClient from './RecordsClient';

export default function RecordsPage() {
  return (
    <Suspense>
      <RecordsClient />
    </Suspense>
  );
}
