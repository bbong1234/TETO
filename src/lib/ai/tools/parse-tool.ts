/**
 * TETO 1.6 Tool — parse.semantic
 *
 * 封装 parseSemantic() 为 ITool 接口实现。
 * Agent 调用此 Tool 进行自然语言语义解析，无需直接依赖 parse-semantic.ts。
 *
 * 原则6 合规：
 *   - Tool 内部不调用 LLM（LLM 由 parseSemantic 内部调用，此为现有行为）
 *   - 输入输出明确
 *   - 失败返回 error_code
 */

import { parseSemantic } from '../parse-semantic';
import { toValidationResults } from '../tool-protocol';
import type {
  ITool,
  ToolCallInput,
  ToolCallOutput,
  ToolValidationResult,
} from '../tool-protocol';
import type { ParseSemanticResult } from '../parse-semantic';

// ═══════════════════════════════════════════════════════════
// 输入/输出类型
// ═══════════════════════════════════════════════════════════

export interface ParseToolInput {
  /** 用户自然语言输入 */
  input: string;
  /** 可选：当天日期 ISO string */
  date?: string;
  /** 可选：近期记录（供 LLM 做语义关联） */
  recentRecords?: Array<{ id: string; content: string; date: string; type: string }>;
  /** 可选：事项列表 */
  items?: Array<{ id: string; title: string }>;
  /** 可选：子项列表 */
  subItems?: Array<{ id: string; title: string; item_id: string }>;
}

export type ParseToolOutput = ParseSemanticResult;

// ═══════════════════════════════════════════════════════════
// JSON Schema（供 LLM function calling 描述）
// ═══════════════════════════════════════════════════════════

const INPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    input: {
      type: 'string',
      description: '用户输入的自然语言文本',
    },
    date: {
      type: 'string',
      description: '可选，当天日期（ISO 格式，如 2026-05-05）',
    },
    recentRecords: {
      type: 'array',
      description: '可选，用户最近的记录（供 LLM 做语义关联）',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          content: { type: 'string' },
          date: { type: 'string' },
          type: { type: 'string' },
        },
      },
    },
    items: {
      type: 'array',
      description: '可选，用户事项列表',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
        },
      },
    },
    subItems: {
      type: 'array',
      description: '可选，用户子项列表',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          item_id: { type: 'string' },
        },
      },
    },
  },
  required: ['input'],
};

const OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    parsed: {
      type: 'object',
      description: '解析结果（ParsedResult）',
    },
    type_hints: {
      type: 'array',
      items: { type: 'string' },
      description: '每个 unit 的主类型提示',
    },
  },
};

// ═══════════════════════════════════════════════════════════
// Tool 实现
// ═══════════════════════════════════════════════════════════

export class ParseTool implements ITool<ParseToolInput, ParseToolOutput> {
  readonly toolName = 'parse.semantic';
  readonly inputSchema = INPUT_SCHEMA;
  readonly outputSchema = OUTPUT_SCHEMA;

  async invoke(
    call: ToolCallInput<ParseToolInput>,
  ): Promise<ToolCallOutput<ParseToolOutput>> {
    const t0 = Date.now();
    const { input, date, recentRecords, items, subItems } = call.input;
    const spanId = `tool-${this.toolName}-${Date.now()}`;

    // 输入校验
    if (!input || !input.trim()) {
      return {
        ok: false,
        output: { parsed: { is_compound: false, units: [], relations: [], confidence: 0 }, type_hints: [], thinking: [], violations: [], degraded: false },
        errorCode: 'PARSE_INPUT_EMPTY',
        errorMessage: 'input 不能为空',
        validationResults: [{
          field: 'input',
          severity: 'blocking',
          ruleId: 'PARSE_INPUT_EMPTY',
          message: 'input 不能为空',
        }],
        durationMs: Date.now() - t0,
        spanId,
      };
    }

    try {
      const result = await parseSemantic(input.trim(), date, recentRecords, items, subItems);
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
        output: { parsed: { is_compound: false, units: [], relations: [], confidence: 0 }, type_hints: [], thinking: [], violations: [], degraded: false },
        errorCode: err.message.includes('DeepSeek') ? 'PARSE_LLM_ERROR' : 'PARSE_TOOL_ERROR',
        errorMessage: err.message,
        validationResults: [],
        durationMs: Date.now() - t0,
        spanId,
      };
    }
  }

  async validate(
    call: ToolCallInput<ParseToolInput>,
  ): Promise<ToolCallOutput<never>> {
    const t0 = Date.now();
    const spanId = `tool-${this.toolName}-validate-${Date.now()}`;

    if (!call.input.input || !call.input.input.trim()) {
      return {
        ok: false,
        output: undefined as never,
        errorCode: 'PARSE_INPUT_EMPTY',
        errorMessage: 'input 不能为空',
        validationResults: [{
          field: 'input',
          severity: 'blocking',
          ruleId: 'PARSE_INPUT_EMPTY',
          message: 'input 不能为空',
        }],
        durationMs: Date.now() - t0,
        spanId,
      };
    }

    return {
      ok: true,
      output: undefined as never,
      validationResults: [],
      durationMs: Date.now() - t0,
      spanId,
    };
  }
}

/** 默认单例，供直接使用 */
export const parseTool = new ParseTool();
