import { Suspense } from 'react';
import ItemDetailClient from './ItemDetailClient';

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ItemDetailClient itemId={id} />
    </Suspense>
  );
}
