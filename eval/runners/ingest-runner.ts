/**
 * eval/runners/ingest-runner.ts — Golden 用例回放（ingest /api/v2/inputs）
 *
 * 仅执行 golden JSON 中 endpoint 含 /api/v2/inputs 的用例。
 * 用法：npx ts-node eval/runners/ingest-runner.ts（需 EVAL_BASE_URL 可访问，本地先 npm run dev）
 */

import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { harnessConfig } from '../harness.config';

const BASE = harnessConfig.baseUrl;
const GOLDEN_DIR = join(process.cwd(), harnessConfig.casesDir.golden);

function parseGoldenFile(raw: string): Record<string, unknown> {
  const start = raw.indexOf('{');
  if (start < 0) throw new Error('未找到 JSON 对象起始');
  return JSON.parse(raw.slice(start)) as Record<string, unknown>;
}

interface RunResult {
  name: string;
  passed: boolean;
  skipped?: boolean;
  error?: string;
}

async function runOne(file: string): Promise<RunResult> {
  const name = file;
  const full = join(GOLDEN_DIR, file);
  let raw: string;
  try {
    raw = await readFile(full, 'utf8');
  } catch (e) {
    return { name, passed: false, error: e instanceof Error ? e.message : String(e) };
  }

  let doc: Record<string, unknown>;
  try {
    doc = parseGoldenFile(raw);
  } catch (e) {
    return { name, passed: false, error: `JSON 解析失败: ${e instanceof Error ? e.message : e}` };
  }

  const input = doc.input as Record<string, unknown> | undefined;
  const endpoint = String(input?.endpoint ?? '');
  if (!endpoint.includes('/api/v2/inputs')) {
    return { name, passed: true, skipped: true };
  }

  const body = input?.body;
  const expected = doc.expected as Record<string, unknown> | undefined;
  const acceptable = (expected?.acceptableErrorCodes as string[] | undefined) ?? [];

  const m = endpoint.match(/^POST\s+(\S+)/i);
  const path = m ? m[1] : '/api/v2/inputs';
  const url = path.startsWith('http') ? path : `${BASE}${path.startsWith('/') ? path : `/${path}`}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const meta = json.meta as Record<string, unknown> | undefined;
  if (expected?.hasMetaTraceId === true) {
    if (typeof meta?.traceId !== 'string' || !meta.traceId) {
      return { name, passed: false, error: '缺少 meta.traceId' };
    }
  }

  const statusAny = expected?.httpStatusAnyOf as number[] | undefined;
  if (statusAny?.length) {
    if (!statusAny.includes(res.status)) {
      return { name, passed: false, error: `HTTP ${res.status}，期望之一: ${statusAny.join(',')}` };
    }
  } else if (expected?.status != null && res.status !== expected.status) {
    return { name, passed: false, error: `HTTP ${res.status}，期望 ${expected.status}` };
  }

  if (json.ok !== true) {
    if (json.ok === false) {
      const err = json.error as Record<string, unknown> | undefined;
      const code =
        typeof err?.errorCode === 'string'
          ? err.errorCode
          : typeof err?.code === 'string'
            ? err.code
            : '';
      if (acceptable.includes(code)) {
        return { name, passed: true };
      }
      return { name, passed: false, error: `ok=false: ${err?.message ?? JSON.stringify(err)}` };
    }
    return { name, passed: false, error: '响应缺少 ok: true' };
  }

  const data = json.data as Record<string, unknown> | undefined;
  const keys = expected?.dataKeysContain as string[] | undefined;
  if (keys?.length) {
    if (!data) {
      return { name, passed: false, error: 'ok=true 但缺少 data' };
    }
    for (const k of keys) {
      if (!(k in data)) {
        return { name, passed: false, error: `data 缺少字段: ${k}` };
      }
    }
  }

  return { name, passed: true };
}

async function main() {
  console.log('TETO 1.6 Ingest Golden Runner\n');
  console.log(`Base URL: ${BASE}`);
  console.log(`Golden dir: ${GOLDEN_DIR}\n`);

  let files: string[];
  try {
    files = await readdir(GOLDEN_DIR);
  } catch {
    console.error('无法读取 golden 目录');
    process.exit(1);
    return;
  }

  const jsonFiles = files.filter((f) => f.endsWith('.json')).sort();
  const results: RunResult[] = [];

  for (const f of jsonFiles) {
    const r = await runOne(f);
    results.push(r);
  }

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  console.log('Results:');
  for (const r of results) {
    if (r.skipped) {
      skipped++;
      console.log(`  … ${r.name}（跳过：非 inputs 用例）`);
      continue;
    }
    if (r.passed) {
      passed++;
      console.log(`  ✓ ${r.name}`);
    } else {
      failed++;
      console.log(`  ✗ ${r.name} — ${r.error ?? '失败'}`);
    }
  }

  const ran = results.filter((r) => !r.skipped).length;
  console.log(`\n${passed}/${ran} ingest golden 通过（另有 ${skipped} 个跳过）`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
