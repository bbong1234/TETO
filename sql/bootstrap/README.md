# 本地 PostgreSQL Bootstrap

从零建 `teto` 库（不导入 Supabase 云旧数据）。

## pgAdmin

1. 创建数据库 `teto`（UTF8，template0）
2. 连接到 `teto`，按顺序执行：
   - `001_extensions_and_auth.sql`
   - `002_baseline.sql`
   - `003_incremental_016_040.sql`
   - `004_rpc.sql`
   - `005_disable_rls_dev.sql`
   - `006_dev_user.sql`

## 命令行

```bash
export DATABASE_URL='postgresql://postgres:你的密码@127.0.0.1:5432/postgres'
bash scripts/apply-bootstrap.sh
```

## 重新生成 bootstrap 文件

修改 `sql/` 后运行：

```bash
node scripts/build-bootstrap-sql.mjs
```

## 验证

```sql
SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';
SELECT * FROM auth.users;
```

## Supabase 生产环境

Vercel 部署使用 Supabase 云库（非本机 Postgres）。见 [SUPABASE_PRODUCTION.md](./SUPABASE_PRODUCTION.md)。
