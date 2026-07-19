import { Suspense } from 'react';
import ItemRecordExplorerClient from './ItemRecordExplorerClient';

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ItemRecordExplorerClient itemId={id} />
    </Suspense>
  );
}
