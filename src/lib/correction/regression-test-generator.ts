/**
 * TETO 1.6 纠错自动回归测试生成器
 *
 * 原则："纠错即测试"——每次用户纠错 = 一个免费的、人工验证过的回归测试用例。
 *
 * 工作流：
 *   用户通过 POST /api/v2/records/[id]/correct 纠错
 *   → 自动调用 generateRegressionTest()
 *   → 生成 TCASE-xxx.json
 *   → 存入 eval/test-cases/from-production/
 */

import { genDecisionId } from '@/lib/observability/id-registry';
import { createComponentLogger } from '@/lib/observability/logger';

const log = createComponentLogger('test-generator');

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

export interface CorrectionContext {
  traceId: string;
  recordId: string;
  decisionId: string;
  fieldCorrected: string;
  oldValue: string | null;
  newValue: string | null;
  userInput?: string; // 用户的原始输入（如果有）
}

export interface GeneratedTestCase {
  testCaseId: string;
  source: 'user_correction';
  status: 'auto_verified' | 'pending_verification';
  sourceTraceId: string;
  sourceDecisionId: string;
  description: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  actualProduction: Record<string, unknown>;
  generatedAt: string;
}

// ═══════════════════════════════════════════════════════════
// 生成逻辑
// ═══════════════════════════════════════════════════════════

/**
 * 从用户纠错上下文生成回归测试用例
 *
 * expected = 用户修正后的结果（人工验证过的正确行为）
 * actual_production = 原错误行为
 */
export function generateRegressionTest(ctx: CorrectionContext): GeneratedTestCase {
  const testCaseId = `TCASE-${genDecisionId('FIX').slice(4)}`; // 复用 ID 格式

  return {
    testCaseId,
    source: 'user_correction',
    status: 'auto_verified', // 用户已经人工验证了正确的行为
    sourceTraceId: ctx.traceId,
    sourceDecisionId: ctx.decisionId,
    description: `用户将 "${ctx.fieldCorrected}" 从 "${ctx.oldValue}" 修正为 "${ctx.newValue}"`,
    input: {
      recordId: ctx.recordId,
      userInput: ctx.userInput ?? null,
    },
    expected: {
      [ctx.fieldCorrected]: ctx.newValue,
    },
    actualProduction: {
      [ctx.fieldCorrected]: ctx.oldValue,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════
// 文件写入（Node 环境）
// ═══════════════════════════════════════════════════════════

const fs = typeof window === 'undefined' ? require('fs') : null;
const path = typeof window === 'undefined' ? require('path') : null;

const TEST_CASES_DIR = path?.join(process.cwd(), 'eval', 'test-cases', 'from-production');

/**
 * 将生成的测试用例写入 eval/test-cases/from-production/ 目录
 * 仅在 Node 服务端环境可调用
 */
export function writeTestCaseToDisk(testCase: GeneratedTestCase): void {
  if (!fs || !path) return; // 非 Node 环境跳过

  if (!fs.existsSync(TEST_CASES_DIR)) {
    fs.mkdirSync(TEST_CASES_DIR, { recursive: true });
  }

  const filePath = path.join(TEST_CASES_DIR, `${testCase.testCaseId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(testCase, null, 2), 'utf-8');
  log.info('回归测试用例已生成', { details: { testCaseId: testCase.testCaseId } });
}
