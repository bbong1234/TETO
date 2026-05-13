/**
 * TETO 1.6 Tool — record.enhance
 *
 * 封装 enhanceRecord() 为 ITool 接口实现。
 * Agent 调用此 Tool 对已保存的记录进行异步 AI 增强：
 *   1. 调用 DeepSeek 解析语义
 *   2. 通过规则中心回写 AI 解析结果
 *   3. 自动匹配 item_hint 并归属事项
 *   4. 检测歧义条件，返回 ClarificationNeeded
 *
 * 原则6 合规：Tool 内部调用 LLM（通过 enhanceRecord → parseSemantic），
 * 但 Tool 本身不推理 — 仅包装现有服务，将结果转为 ToolCallOutput。
 *
 * ⚠ 注意：此 Tool 会产生副作用（写入 DB），dryRun 模式下不调用。
 */

import { enhanceRecord } from '../enhance-record';
import type {
  ITool,
  ToolCallInput,
  ToolCallOutput,
} from '../tool-protocol';

// ═══════════════════════════════════════════════════════════
// 输入/输出类型
// ═══════════════════════════════════════════════════════════

export interface EnhanceToolInput {
  /** 用户 ID */
  userId: string;
  /** 记录 ID */
  recordId: string;
  /** 记录内容 */
  content: string;
  /** 记录日期（ISO string） */
  date: string;
}

/** enhanceRecord 返回的歧义检测结果 */
export type EnhanceToolOutput = Awaited<ReturnType<typeof enhanceRecord>> | null;

// ═══════════════════════════════════════════════════════════
// JSON Schema
// ═══════════════════════════════════════════════════════════

const INPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    userId: {
      type: 'string',
      description: '当前用户 ID',
    },
    recordId: {
      type: 'string',
      description: '需要增强的记录 ID',
    },
    content: {
      type: 'string',
      description: '记录原始内容文本',
    },
    date: {
      type: 'string',
      description: '记录日期（ISO 格式，如 2026-05-05）',
    },
  },
  required: ['userId', 'recordId', 'content', 'date'],
};

const OUTPUT_SCHEMA: Record<string, unknown> = {
  oneOf: [
    { type: 'null', description: '增强完成，无歧义' },
    {
      type: 'object',
      description: 'ClarificationNeeded — 需要用户澄清',
    },
  ],
};

// ═══════════════════════════════════════════════════════════
// Tool 实现
// ═══════════════════════════════════════════════════════════

export class EnhanceTool implements ITool<EnhanceToolInput, EnhanceToolOutput> {
  readonly toolName = 'record.enhance';
  readonly inputSchema = INPUT_SCHEMA;
  readonly outputSchema = OUTPUT_SCHEMA;

  async invoke(
    call: ToolCallInput<EnhanceToolInput>,
  ): Promise<ToolCallOutput<EnhanceToolOutput>> {
    const t0 = Date.now();
    const { userId, recordId, content, date } = call.input;
    const spanId = `tool-${this.toolName}-${Date.now()}`;

    // dryRun 时不产生副作用
    if (call.dryRun) {
      return {
        ok: true,
        output: null,
        validationResults: [],
        durationMs: Date.now() - t0,
        spanId,
      };
    }

    // 输入校验
    const validationIssues: Array<{ field: string; ruleId: string; message: string }> = [];
    if (!userId) {
      validationIssues.push({ field: 'userId', ruleId: 'ENHANCE_USER_ID_REQUIRED', message: 'userId 不能为空' });
    }
    if (!recordId) {
      validationIssues.push({ field: 'recordId', ruleId: 'ENHANCE_RECORD_ID_REQUIRED', message: 'recordId 不能为空' });
    }
    if (!content || !content.trim()) {
      validationIssues.push({ field: 'content', ruleId: 'ENHANCE_CONTENT_REQUIRED', message: 'content 不能为空' });
    }

    if (validationIssues.length > 0) {
      return {
        ok: false,
        output: null,
        errorCode: 'ENHANCE_VALIDATION_FAILED',
        errorMessage: validationIssues.map((i) => i.message).join('; '),
        validationResults: validationIssues.map((i) => ({
          field: i.field,
          severity: 'blocking' as const,
          ruleId: i.ruleId,
          message: i.message,
        })),
        durationMs: Date.now() - t0,
        spanId,
      };
    }

    try {
      const result = await enhanceRecord(userId, recordId, content.trim(), date, undefined);
      return {
        ok: true,
        output: result,
        validationResults: [],
        durationMs: Date.now() - t0,
        spanId,
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      return {
        ok: false,
        output: null,
        errorCode: 'ENHANCE_TOOL_ERROR',
        errorMessage: err.message,
        validationResults: [],
        durationMs: Date.now() - t0,
        spanId,
      };
    }
  }

  async validate(
    call: ToolCallInput<EnhanceToolInput>,
  ): Promise<ToolCallOutput<never>> {
    const t0 = Date.now();
    const spanId = `tool-${this.toolName}-validate-${Date.now()}`;

    const issues: Array<{ field: string; ruleId: string; message: string }> = [];
    if (!call.input.userId) issues.push({ field: 'userId', ruleId: 'ENHANCE_USER_ID_REQUIRED', message: 'userId 不能为空' });
    if (!call.input.recordId) issues.push({ field: 'recordId', ruleId: 'ENHANCE_RECORD_ID_REQUIRED', message: 'recordId 不能为空' });
    if (!call.input.content?.trim()) issues.push({ field: 'content', ruleId: 'ENHANCE_CONTENT_REQUIRED', message: 'content 不能为空' });

    return {
      ok: issues.length === 0,
      output: undefined as never,
      errorCode: issues.length > 0 ? 'ENHANCE_VALIDATION_FAILED' : undefined,
      errorMessage: issues.length > 0 ? issues.map((i) => i.message).join('; ') : undefined,
      validationResults: issues.map((i) => ({
        field: i.field,
        severity: 'blocking' as const,
        ruleId: i.ruleId,
        message: i.message,
      })),
      durationMs: Date.now() - t0,
      spanId,
    };
  }
}

/** 默认单例 */
export const enhanceTool = new EnhanceTool();
