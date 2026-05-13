import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { listRecords, getRecordById } from '@/lib/db/records';
import { createClient } from '@/lib/supabase/server';
import { createRecordSafely } from '@/lib/domain/record-service';
import type { RecordsQuery, CreateRecordPayload } from '@/types/teto';
import { RECORD_TYPES, LIFECYCLE_STATUSES, normalizeRecordType } from '@/types/teto';
import { classifyInput } from '@/lib/ai/classify-input';
import type { ClarificationNeeded, ClassificationResult } from '@/types/semantic';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES, genInputId, genUnitId } from '@/lib/observability/id-registry';
import { createComponentLogger } from '@/lib/observability/logger';
import { persistTraceSummary } from '@/lib/observability/trace';

const log = createComponentLogger('api-records');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 校验记录 payload，返回错误消息字符串，通过则返回 null */
function validateRecordPayload(body: CreateRecordPayload): string | null {
  if (!body.content) return 'content 为必填字段';
  if (!body.date) return 'date 为必填字段';
  if (!DATE_REGEX.test(body.date)) return 'date 格式无效，应为 YYYY-MM-DD';
  // 旧类型归一化（情绪/花费/结果 → 发生）
  if (body.type) {
    body.type = normalizeRecordType(body.type);
  }
  if (body.type && !RECORD_TYPES.includes(body.type as typeof RECORD_TYPES[number])) {
    return `type 必须为以下之一: ${RECORD_TYPES.join(', ')}`;
  }
  if (body.occurred_at && isNaN(Date.parse(body.occurred_at))) return 'occurred_at 格式无效，需为ISO-8601';
  if (body.lifecycle_status && !LIFECYCLE_STATUSES.includes(body.lifecycle_status as typeof LIFECYCLE_STATUSES[number])) {
    return `lifecycle_status 必须为以下之一: ${LIFECYCLE_STATUSES.join(', ')}`;
  }
  if (body.metric_value !== undefined && body.metric_value !== null && body.metric_value < 0) return 'metric_value 不能为负数';
  if (body.duration_minutes !== undefined && body.duration_minutes !== null && body.duration_minutes < 0) return 'duration_minutes 不能为负数';
  if (body.cost !== undefined && body.cost !== null && body.cost < 0) return 'cost 不能为负数';
  if (body.sort_order !== undefined && body.sort_order < 0) return 'sort_order 不能为负数';
  if (body.time_anchor_date && !DATE_REGEX.test(body.time_anchor_date)) return 'time_anchor_date 格式无效，应为 YYYY-MM-DD';
  // 过滤 time_precision 的前端专用值 'inherited'，数据库 CHECK 约束不包含此值
  if (body.time_precision === 'inherited') {
    body.time_precision = 'approx';
  }
  if (body.data_nature && !['fact', 'inferred'].includes(body.data_nature)) return 'data_nature 必须为 fact 或 inferred';
  if (body.period_frequency && !['daily', 'weekly', 'monthly', 'irregular'].includes(body.period_frequency)) return 'period_frequency 必须为 daily/weekly/monthly/irregular';
  if (body.period_start_date && !DATE_REGEX.test(body.period_start_date)) return 'period_start_date 格式无效，应为 YYYY-MM-DD';
  if (body.period_end_date && !DATE_REGEX.test(body.period_end_date)) return 'period_end_date 格式无效，应为 YYYY-MM-DD';
  if (body.tag_ids) {
    if (!Array.isArray(body.tag_ids)) return 'tag_ids 必须为数组';
    for (const tagId of body.tag_ids) {
      if (typeof tagId !== 'string' || !UUID_REGEX.test(tagId)) return `无效的 tag_id: ${tagId}`;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);

    const query: RecordsQuery = {};
    const date = searchParams.get('date');
    const date_from = searchParams.get('date_from');
    const date_to = searchParams.get('date_to');
    const item_id = searchParams.get('item_id');
    const sub_item_id = searchParams.get('sub_item_id');
    const type = searchParams.get('type');
    const tag_id = searchParams.get('tag_id');
    const is_starred = searchParams.get('is_starred');
    const search = searchParams.get('search');
    const limit = searchParams.get('limit');

    if (date && !DATE_REGEX.test(date)) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'date 格式无效，应为 YYYY-MM-DD', ctx.traceId);
    }
    if (date) query.date = date;
    if (date_from && !DATE_REGEX.test(date_from)) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'date_from 格式无效，应为 YYYY-MM-DD', ctx.traceId);
    }
    if (date_from) query.date_from = date_from;
    if (date_to && !DATE_REGEX.test(date_to)) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'date_to 格式无效，应为 YYYY-MM-DD', ctx.traceId);
    }
    if (date_to) query.date_to = date_to;
    if (item_id && !UUID_REGEX.test(item_id)) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'item_id 格式无效', ctx.traceId);
    }
    if (item_id) query.item_id = item_id;
    if (sub_item_id) query.sub_item_id = sub_item_id;
    if (type) query.type = type as RecordsQuery['type'];
    if (tag_id) query.tag_id = tag_id;
    if (is_starred !== null) query.is_starred = is_starred === 'true';
    if (search) query.search = search;
    if (limit) {
      const parsed = parseInt(limit, 10);
      if (isNaN(parsed) || parsed < 0) {
        return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, 'limit 必须为非负整数', ctx.traceId);
      }
      query.limit = parsed;
    }

    const result = await listRecords(userId, query);
    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const body: CreateRecordPayload = await request.json();

    // 生成本次输入编号（input_id 体系）
    const inputId = genInputId();
    (body as unknown as Record<string, unknown>).input_id = inputId;

    // 基础校验：必填字段和格式
    const validationError = validateRecordPayload(body);
    if (validationError) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, validationError, ctx.traceId, 400);
    }

    const supabase = await createClient();

    // 判断是否需要跳过 AI 清分（?enhance=client 或客户端已预解析）
    const enhanceMode = new URL(request.url).searchParams.get('enhance');
    const alreadyParsed = !!(body as unknown as Record<string, unknown>).parsed_semantic;

    if (enhanceMode === 'client' || alreadyParsed) {
      // 客户端增强模式：直接入库（不走服务端 AI 清分）
      // 设置默认 review_status，客户端增强的数据标记为 unchecked
      if (!(body as unknown as Record<string, unknown>).review_status) {
        (body as unknown as Record<string, unknown>).review_status = 'unchecked';
      }
      const result = await createRecordSafely({ userId, payload: body, supabase });
      if (!result.ok) {
        return apiError(
          ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED,
          result.errors.map(e => e.message).join('; '),
          ctx.traceId, 400,
          result.errors.map(e => ({ code: e.code, message: e.message }))
        );
      }

      persistTraceSummary({ supabase, userId, traceId: ctx.traceId, operation: 'record_create', status: 'ok' });
      return apiSuccess(
        result.data,
        ctx.traceId, 201,
        result.warnings.map(w => ({ code: w.code, message: w.message }))
      );
    }

    // ════════════════════════════════════════════════════════
    // 正常流程：AI 清分 → 判断可入库 → 入库
    // ════════════════════════════════════════════════════════

    // ① AI 清分（不入库，纯分析）— 必须用用户原文 raw_input，避免用摘要 content 喂模型
    const rawForClassify =
      typeof body.raw_input === 'string' && body.raw_input.trim().length > 0
        ? body.raw_input.trim()
        : body.content;

    const classification: ClassificationResult = await classifyInput(
      userId, rawForClassify, body.date, ctx.traceId
    );

    // ② 需要确认 → 返回确认卡片，不入库
    if (classification.needsConfirmation) {
      persistTraceSummary({ supabase, userId, traceId: ctx.traceId, operation: 'record_classify', status: 'partial' });
      return apiSuccess(
        { _clarification: classification.clarification, _compound: { detected: classification.isCompound, unitsCount: classification.unitsCount } },
        ctx.traceId, 200
      );
    }

    // ③ 可入库 → 按 unit 逐条创建记录（高置信度，直接入库）
    const createdRecords: Record<string, unknown>[] = [];
    const splitRecordIds: string[] = [];
    const batchId = classification.isCompound ? crypto.randomUUID() : undefined;
    const proposals = classification.unitProposals;

    for (let i = 0; i < proposals.length; i++) {
      const proposal = proposals[i];
      const isMainRecord = i === 0;

      const createPayload: Record<string, unknown> = {
        content: proposal.contentSummary || body.content,
        raw_input: body.raw_input ?? rawForClassify,
        date: body.date,
        type: (proposal.fields.type as string) || '发生',
        input_id: isMainRecord ? inputId : genUnitId(inputId, i),
        ...(isMainRecord ? {} : { parent_input_id: inputId }),
        ...(batchId ? { batch_id: batchId } : {}),
        parsed_semantic: classification.rawParsed,
        review_status: 'confirmed',
        confidence_level: 'high',
        input_source: 'ai',
        ...proposal.fields,
      };

      // 保留客户端传入的字段（如有）
      if (body.type && !createPayload.type) createPayload.type = body.type;

      const result = await createRecordSafely({
        userId,
        payload: createPayload as unknown as CreateRecordPayload,
        supabase,
      });

      if (!result.ok) {
        log.error('记录创建失败', { details: { unitIndex: i, errors: result.errors.map(e => e.message) } });
        // 首个 unit 失败则整体失败
        if (isMainRecord) {
          return apiError(
            ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED,
            result.errors.map(e => e.message).join('; '),
            ctx.traceId, 400,
            result.errors.map(e => ({ code: e.code, message: e.message }))
          );
        }
        continue; // 子记录失败不阻塞主记录
      }

      const record = result.data as unknown as Record<string, unknown>;
      createdRecords.push(record);

      // 子记录建立 derived_from 关联
      if (!isMainRecord && record.id) {
        splitRecordIds.push(record.id as string);
        const mainRecordId = createdRecords[0]?.id;
        if (mainRecordId) {
          await supabase.from('record_links').insert({
            source_id: record.id,
            target_id: mainRecordId,
            link_type: 'derived_from',
            user_id: userId,
          }).select('id').maybeSingle();
        }
      }
    }

    if (createdRecords.length === 0) {
      return apiError(ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED, '所有记录创建失败', ctx.traceId, 500);
    }

    // 持久化决策日志（可回放审计链路）
    if (classification.decisions.length > 0) {
      const decisionRows = classification.decisions.map(d => ({
        decision_id: d.decisionId,
        trace_id: ctx.traceId,
        decision_type: d.type,
        input_summary: d.explain,
        output_summary: JSON.stringify(proposals[d.unitIndex]?.fields ?? {}),
        metadata: d.detail ?? {},
      }));
      const { error: decErr } = await supabase.from('decision_logs').insert(decisionRows);
      if (decErr) {
        log.warn('决策日志写入失败（非致命）', { details: { error: decErr.message } });
      }
    }

    // 持久化 trace
    persistTraceSummary({ supabase, userId, traceId: ctx.traceId, operation: 'record_create', status: 'ok' });

    return apiSuccess(
      {
        ...createdRecords[0],
        _compound: classification.isCompound
          ? { detected: true, unitsCount: classification.unitsCount, splitRecordIds }
          : undefined,
        _decisions: classification.decisions,
      },
      ctx.traceId, 201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
