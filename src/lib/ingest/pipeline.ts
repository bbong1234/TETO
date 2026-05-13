import type { CreateRecordPayload } from '@/types/teto';
import type { ClassificationResult } from '@/types/semantic';
import { classifyForIngest } from './classifier';
import { mapUnitToRecordPayload } from './field-mapper';
import { generateContentSummary } from '@/lib/utils/record-unit-mapper';

export interface IngestFullParams {
  userId: string;
  rawInput: string;
  date: string;
  traceId?: string;
}

export interface IngestUnitProposal {
  unitIndex: number;
  payload: CreateRecordPayload;
}

export interface IngestFullResult {
  classification: ClassificationResult;
  proposals: IngestUnitProposal[];
}

/**
 * full 模式：自由文本 → classify → unit payload 提案
 */
export async function ingestFull(params: IngestFullParams): Promise<IngestFullResult> {
  const classification = await classifyForIngest({
    userId: params.userId,
    content: params.rawInput,
    date: params.date,
    traceId: params.traceId,
  });

  const proposals = classification.unitProposals.map((unit) => {
    const payload = mapUnitToRecordPayload(unit.fields, {
      content: generateContentSummary(
        unit.fields as Record<string, unknown>,
        unit.contentSummary || params.rawInput
      ),
      date: params.date,
      type:
        unit.fields.type === '发生' ||
        unit.fields.type === '计划' ||
        unit.fields.type === '想法' ||
        unit.fields.type === '总结'
          ? (unit.fields.type as CreateRecordPayload['type'])
          : '发生',
      parsed_semantic: classification.rawParsed as CreateRecordPayload['parsed_semantic'],
    });

    return {
      unitIndex: unit.unitIndex,
      payload,
    };
  });

  return { classification, proposals };
}

/**
 * lightweight 模式：结构化输入直接转 payload（CSV 已有结构化字段）
 */
export function ingestLightweight(payload: CreateRecordPayload): CreateRecordPayload {
  return {
    ...payload,
    type: payload.type ?? '发生',
    input_source: payload.input_source ?? 'import',
  };
}

