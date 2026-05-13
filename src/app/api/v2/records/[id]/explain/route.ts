import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { getRecordById } from '@/lib/db/records';
import { getInputById, getInputUnitById, listInputUnits } from '@/lib/db/inputs';
import { handleApiError } from '@/lib/api/error-handler';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { isEligible } from '@/lib/stats/stats-eligibility';

/** GET /api/v2/records/:id/explain — 单条记录的统计资格与溯源字段摘要 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const record = await getRecordById(userId, id);
    if (!record) {
      return apiError(ERROR_CODES.RECORD_NOT_FOUND, '记录不存在', ctx.traceId, 404);
    }

    const displayEligibility = isEligible(record, 'display');
    const insightEligibility = isEligible(record, 'insight');

    let inputSummary: { id: string; raw_input: string; status: string } | null = null;
    const rootInputId = record.parent_input_id || record.input_id;
    const pureUuid =
      rootInputId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rootInputId);

    if (pureUuid) {
      const inp = await getInputById(userId, rootInputId);
      if (inp) {
        inputSummary = {
          id: inp.id,
          raw_input: inp.raw_input?.slice(0, 300) ?? '',
          status: inp.status,
        };
      }
    }

    let ingest_clearing: {
      root_input_id: string | null;
      root_raw_input_preview: string | null;
      unit_id: string | null;
      unit_index: number | null;
      peer_unit_count: number | null;
      classifier_content_summary: string | null;
      unit_status: string | null;
    } | null = null;

    const unitId = record.input_unit_id;
    const unitUuid =
      unitId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(unitId);

    if (unitUuid) {
      const unitRow = await getInputUnitById(userId, unitId);
      if (unitRow) {
        const decision = (unitRow.classifier_decision ?? {}) as Record<string, unknown>;
        const summary =
          typeof decision.content_summary === 'string'
            ? decision.content_summary
            : typeof unitRow.unit_text === 'string'
              ? unitRow.unit_text
              : null;
        const siblings = await listInputUnits(userId, unitRow.input_id);
        let rootPreview = inputSummary?.raw_input ?? null;
        if (!rootPreview) {
          const rootInp = await getInputById(userId, unitRow.input_id);
          rootPreview = rootInp?.raw_input?.slice(0, 300) ?? null;
        }
        ingest_clearing = {
          root_input_id: unitRow.input_id,
          root_raw_input_preview: rootPreview,
          unit_id: unitRow.id,
          unit_index: unitRow.unit_index,
          peer_unit_count: siblings.length,
          classifier_content_summary: summary,
          unit_status: unitRow.status,
        };
      }
    }

    return apiSuccess(
      {
        record_id: record.id,
        content_preview: record.content?.slice(0, 120) ?? '',
        type: record.type,
        review_status: record.review_status,
        record_quality_tag: record.record_quality_tag ?? null,
        input_source: record.input_source ?? null,
        input_id: record.input_id ?? null,
        parent_input_id: record.parent_input_id ?? null,
        input_unit_id: record.input_unit_id ?? null,
        input_summary: inputSummary,
        ingest_clearing,
        eligibility_display: displayEligibility,
        eligibility_insight: insightEligibility,
      },
      ctx.traceId
    );
  } catch (e) {
    return handleApiError(e);
  }
}
