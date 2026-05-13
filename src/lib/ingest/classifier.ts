import { classifyInput } from '@/lib/ai/classify-input';
import type { ClassificationResult } from '@/types/semantic';

export interface IngestClassifyInput {
  userId: string;
  content: string;
  date: string;
  traceId?: string;
}

/**
 * Ingest 层分类入口。
 * 当前先复用 classifyInput，后续可替换为新的 pipeline-runner。
 */
export async function classifyForIngest(params: IngestClassifyInput): Promise<ClassificationResult> {
  const { userId, content, date, traceId } = params;
  return classifyInput(userId, content, date, traceId);
}

