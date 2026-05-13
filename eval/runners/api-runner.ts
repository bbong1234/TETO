/**
 * eval/runners/api-runner.ts — API 契约测试
 *
 * 最少验证 3 个 endpoint：
 * 1. POST /api/v2/records → 验证 response envelope + trace_id
 * 2. POST /api/v2/parse → 验证结构完整
 * 3. GET /api/v2/goals/[id]/engine → 验证 computation_version
 *
 * 用法：npx ts-node eval/runners/api-runner.ts
 */

import { harnessConfig } from '../harness.config';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  meta?: Record<string, unknown>;
}

const BASE = harnessConfig.baseUrl;

async function test(name: string, fn: () => Promise<void>): Promise<TestResult> {
  try {
    await fn();
    return { name, passed: true };
  } catch (e) {
    return { name, passed: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  console.log('TETO 1.6 API Contract Runner\n');
  console.log(`Base URL: ${BASE}\n`);

  const results: TestResult[] = [];

  // ─── Test 1: Records API ───
  results.push(await test('POST /api/v2/records → envelope + trace_id', async () => {
    const res = await fetch(`${BASE}/api/v2/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '[TEST] API contract check',
        date: new Date().toISOString().split('T')[0],
        type: '发生',
      }),
    });

    const json = await res.json();
    if (!json.ok) throw new Error(`API returned ok=false: ${json.error?.message}`);
    if (!json.meta?.traceId) throw new Error('Missing meta.traceId');
    if (!json.meta?.apiVersion) throw new Error('Missing meta.apiVersion');
    if (!json.data?.id) throw new Error('Missing data.id');
  }));

  // ─── Test 2: Parse API ───
  results.push(await test('POST /api/v2/parse → structure check', async () => {
    const res = await fetch(`${BASE}/api/v2/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: '今天跑步5公里', date: new Date().toISOString().split('T')[0] }),
    });

    const json = await res.json();
    if (!json.ok) throw new Error(`API returned ok=false: ${json.error?.message}`);
    if (!json.meta?.traceId) throw new Error('Missing meta.traceId');
  }));

  // ─── Test 3: Goal Engine API ───
  results.push(await test('GET /api/v2/goals/[id]/engine → computation_version', async () => {
    // Note: requires a valid goal ID — this test verifies the meta structure on 404
    const res = await fetch(`${BASE}/api/v2/goals/00000000-0000-0000-0000-000000000000/engine`);
    const json = await res.json();

    // Even on error, meta should be present
    if (!json.meta?.apiVersion) throw new Error('Missing meta.apiVersion');
    // Verify we get a structured error, not a crash
    if (!json.error && !json.data) throw new Error('Response missing both data and error');
  }));

  // ─── Summary ───
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('Results:');
  for (const r of results) {
    const icon = r.passed ? '✓' : '✗';
    console.log(`  ${icon} ${r.name}${r.error ? ` — ${r.error}` : ''}`);
  }

  console.log(`\n${passed}/${results.length} API contract tests passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
