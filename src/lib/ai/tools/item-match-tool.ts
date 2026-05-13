/**
 * TETO 1.6 Tool — item.match
 *
 * 封装 matchItemSmart() 为 ITool 接口实现。
 * Agent 调用此 Tool 进行智能事项匹配，无需直接依赖 item-match.ts。
 *
 * 匹配策略（由 matchItemSmart 内部实现）：
 *   1. AI hint 精确/包含匹配 + 核心关键词验证 → 高置信度
 *   2. AI hint 匹配但无关键词验证 → 中等置信度
 *   3. 无 AI hint 时扫描输入文本中的关键词 → 中等置信度
 *
 * 原则6 合规：Tool 内部不调用 LLM，只执行。
 */

import { matchItemSmart, type ItemMatchResult } from '@/lib/utils/item-match';
import type {
  ITool,
  ToolCallInput,
  ToolCallOutput,
} from '../tool-protocol';

// ═══════════════════════════════════════════════════════════
// 输入/输出类型
// ═══════════════════════════════════════════════════════════

export interface ItemMatchToolInput {
  /** AI 返回的事项 hint（来自 parseSemantic 的 item_hint） */
  hint: string;
  /** 用户已有的事项列表 */
  items: Array<{ id: string; title: string }>;
  /** 用户原始输入文本（用于无 hint 时的全文扫描） */
  inputText: string;
}

export type ItemMatchToolOutput = ItemMatchResult | null;

// ═══════════════════════════════════════════════════════════
// JSON Schema
// ═══════════════════════════════════════════════════════════

const INPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    hint: {
      type: 'string',
      description: 'AI 推测的事项名称（来自 parseSemantic 的 item_hint），可能为空',
    },
    items: {
      type: 'array',
      description: '用户已有的事项列表',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['id', 'title'],
      },
    },
    inputText: {
      type: 'string',
      description: '用户原始输入文本，用于无 hint 时的全文关键词扫描',
    },
  },
  required: ['hint', 'items', 'inputText'],
};

const OUTPUT_SCHEMA: Record<string, unknown> = {
  oneOf: [
    { type: 'null' },
    {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: '匹配到的事项 ID' },
        itemTitle: { type: 'string', description: '匹配到的事项标题' },
        confidence: {
          type: 'string',
          enum: ['high', 'medium'],
          description: '匹配置信度',
        },
        matchType: { type: 'string', description: '匹配类型' },
      },
    },
  ],
};

// ═══════════════════════════════════════════════════════════
// Tool 实现
// ═══════════════════════════════════════════════════════════

export class ItemMatchTool implements ITool<ItemMatchToolInput, ItemMatchToolOutput> {
  readonly toolName = 'item.match';
  readonly inputSchema = INPUT_SCHEMA;
  readonly outputSchema = OUTPUT_SCHEMA;

  async invoke(
    call: ToolCallInput<ItemMatchToolInput>,
  ): Promise<ToolCallOutput<ItemMatchToolOutput>> {
    const t0 = Date.now();
    const { hint, items, inputText } = call.input;
    const spanId = `tool-${this.toolName}-${Date.now()}`;

    // 输入校验
    if (!Array.isArray(items) || items.length === 0) {
      return {
        ok: true,
        output: null,
        validationResults: [],
        durationMs: Date.now() - t0,
        spanId,
      };
    }

    try {
      const result = matchItemSmart(hint, items, inputText);
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
        errorCode: 'ITEM_MATCH_ERROR',
        errorMessage: err.message,
        validationResults: [],
        durationMs: Date.now() - t0,
        spanId,
      };
    }
  }

  async validate(
    call: ToolCallInput<ItemMatchToolInput>,
  ): Promise<ToolCallOutput<never>> {
    const t0 = Date.now();
    const spanId = `tool-${this.toolName}-validate-${Date.now()}`;

    if (!Array.isArray(call.input.items)) {
      return {
        ok: false,
        output: undefined as never,
        errorCode: 'ITEM_MATCH_INVALID_ITEMS',
        errorMessage: 'items 必须是数组',
        validationResults: [{
          field: 'items',
          severity: 'blocking',
          ruleId: 'ITEM_MATCH_INVALID_ITEMS',
          message: 'items 必须是数组',
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

/** 默认单例 */
export const itemMatchTool = new ItemMatchTool();
