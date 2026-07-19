import 'server-only';

import { TableQuery, callRpc } from '@/lib/postgres/query-builder';
import { createBrowserPostgresClient } from '@/lib/postgres/client-browser';

export type PostgresClient = ReturnType<typeof createServerPostgresClient>;

/** 服务端 PostgreSQL 客户端（pg 连接池 + 查询构建器） */
export function createServerPostgresClient() {
  const browserStub = createBrowserPostgresClient();

  return {
    from(table: string) {
      return new TableQuery(table);
    },
    rpc(functionName: string, params: Record<string, unknown>) {
      return callRpc(functionName, params);
    },
    auth: browserStub.auth,
  };
}
