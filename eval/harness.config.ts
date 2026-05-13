/**
 * eval/harness.config.ts — Eval Harness 配置
 */

export const harnessConfig = {
  /** API 基础 URL */
  baseUrl: process.env.EVAL_BASE_URL ?? 'http://localhost:3000',

  /** 测试超时（ms） */
  timeout: 10_000,

  /** 测试报告输出目录 */
  reportDir: 'eval/reports',

  /** 测试用例目录 */
  casesDir: {
    fromProduction: 'eval/test-cases/from-production',
    golden: 'eval/test-cases/golden',
    regression: 'eval/test-cases/regression',
  },

  /** 场景模板目录 */
  scenariosDir: 'eval/scenarios/scenario-templates',
} as const;
