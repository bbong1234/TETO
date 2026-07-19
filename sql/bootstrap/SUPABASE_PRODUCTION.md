# Supabase 生产环境初始化

本地开发使用 `sql/bootstrap/` 全量脚本（含关 RLS、dev 用户）。**Supabase 生产请按本文执行**，不要执行 `005_disable_rls_dev.sql` 与 `006_dev_user.sql`。

## 前置

- 已有 Supabase 项目（空库或需补 migration）
- Vercel 将配置 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`（及可选 `SUPABASE_SERVICE_ROLE_KEY`）
- **不要**在 Vercel 配置 `DATABASE_URL` / `DEV_MODE`

## 1. 执行 SQL（Dashboard → SQL Editor）

按顺序执行（项目完全为空时）：

| 顺序 | 文件 | 说明 |
|------|------|------|
| 1 | [`002_baseline.sql`](002_baseline.sql) | 核心表结构 |
| 2 | [`003_incremental_016_040.sql`](003_incremental_016_040.sql) | 016–040 增量 |
| 3 | [`004_rpc.sql`](004_rpc.sql) | RPC 函数 |

**跳过：**

- `001_extensions_and_auth.sql` — Supabase 自带 `auth` schema
- `005_disable_rls_dev.sql` — 仅本地 dev
- `006_dev_user.sql` — 仅本地固定 dev 用户

若基线已存在，对照 [`../migrations_history.txt`](../migrations_history.txt) 只补跑缺失的 `sql/016_*.sql` … `sql/040_*.sql` 与 `sql/rpc/*.sql`。

## 2. Row Level Security

生产库必须启用 RLS。若 `002_baseline` 未包含完整策略，参考：

- [`../保留存档sql/sql1.1-1.4/001_teto_1_3_records_model.sql`](../保留存档sql/sql1.1-1.4/001_teto_1_3_records_model.sql)

核心原则：`auth.uid() = user_id`（或等价的 join 策略）。

在 SQL Editor 验证：

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('records', 'items', 'tags');
```

`rowsecurity` 应为 `true`。

## 3. Supabase Auth URL

Authentication → URL Configuration：

- **Site URL**：`https://你的-vercel-域名`
- **Redirect URLs**：`https://你的-vercel-域名/auth/callback`

## 4. 验证

1. 部署 Vercel 后访问 `/login`，应显示密码登录（非「开发模式」）
2. 注册测试用户 → Supabase Authentication 可见用户
3. 创建一条记录 → Table Editor `records` 中 `user_id` 为对应 auth 用户
4. 第二账号登录，不应看到第一账号数据（RLS）

## 5. 与本地 dev 的关系

| | 本地 `npm run dev` | Vercel 生产 |
|--|--|--|
| 数据库 | 本机 Postgres | Supabase Postgres |
| 认证 | DEV_MODE 跳过 | 邮箱/密码 |
| 数据 | 隔离 | 隔离 |

本地数据不会自动同步到 Supabase。
