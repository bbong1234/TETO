#!/usr/bin/env node
/**
 * Apply sql/bootstrap/*.sql using DATABASE_URL from .env.local
 * Usage: node scripts/apply-bootstrap.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim();
    }
  }
}

const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error('缺少 DATABASE_URL（见 .env.local）');
  process.exit(1);
}
if (baseUrl.includes('YOUR_PASSWORD')) {
  console.error('请先在 .env.local 把 DATABASE_URL 中的 YOUR_PASSWORD 换成真实 Postgres 密码');
  process.exit(1);
}

const adminUrl = baseUrl.replace(/\/[^/]+$/, '/postgres');
const bootDir = path.join(root, 'sql/bootstrap');
const files = fs.readdirSync(bootDir).filter((f) => /^00\d_.*\.sql$/.test(f)).sort();

async function run() {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const { rows } = await admin.query(`SELECT 1 FROM pg_database WHERE datname = 'teto'`);
  if (!rows.length) {
    await admin.query(`CREATE DATABASE teto WITH ENCODING 'UTF8' TEMPLATE template0`);
    console.log('Created database teto');
  }
  await admin.end();

  const dbUrl = baseUrl.includes('/teto') ? baseUrl : baseUrl.replace(/\/[^/]+$/, '/teto');
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(bootDir, file), 'utf8');
    console.log('==>', file);
    await client.query(sql);
  }

  const { rows: tables } = await client.query(
    `SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`
  );
  console.log('public tables:', tables[0].n);
  await client.end();
  console.log('Bootstrap complete.');
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
