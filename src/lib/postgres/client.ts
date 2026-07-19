import { createServerPostgresClient } from '@/lib/postgres/client-server';

export type PostgresClient = ReturnType<typeof createPostgresClient>;

export function createPostgresClient() {
  return createServerPostgresClient();
}
