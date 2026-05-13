/**
 * GET /api/v2/corrections/trends
 *
 * 错误趋势分析 — 查询用户纠错模式，辅助规则中心自优化
 *
 * 返回：
 *   - total: 总纠错次数
 *   - byField: 按字段的纠错分布（哪些字段最常被纠正）
 *   - byDate: 按日期的纠错趋势
 *   - recentCorrections: 最近 N 条纠错记录
 *
 * 查询参数：
 *   - days (optional): 统计最近 N 天，默认 30
 *   - limit (optional): 最近记录条数，默认 10
 */

import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { createClient } from '@/lib/supabase/server';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { createComponentLogger } from '@/lib/observability/logger';

const log = createComponentLogger('corrections-trends');

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const supabase = await createClient();

    const { searchParams } = new URL(request.url);
    const days = Math.max(1, Math.min(365, parseInt(searchParams.get('days') || '30', 10) || 30));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '10', 10) || 10));

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const sinceISO = sinceDate.toISOString();

    // 预查询用户的所有 record IDs（用于 corrections 表 RLS 过滤）
    const { data: userRecordIds } = await supabase
      .from('records')
      .select('id')
      .eq('user_id', userId);
    const recordIds = (userRecordIds ?? []).map((r: { id: string }) => r.id);

    if (recordIds.length === 0) {
      return apiSuccess(
        { total: 0, topFields: [], dateTrend: [], recentCorrections: [], problematicInputs: [], meta: { days, since: sinceISO } },
        ctx.traceId,
        200
      );
    }

    // ── 1. 总纠错次数 ──
    const { count: total, error: countError } = await supabase
      .from('corrections')
      .select('*', { count: 'exact', head: true })
      .in('record_id', recordIds);

    if (countError) {
      log.error('查询 corrections 总数失败', { details: { error: countError.message } });
    }

    // ── 2. 按字段分布 ──
    const { data: byFieldData, error: fieldError } = await supabase
      .from('corrections')
      .select('field_corrected')
      .in('record_id', recordIds)
      .gte('created_at', sinceISO);

    const byField: Record<string, number> = {};
    if (byFieldData) {
      for (const row of byFieldData) {
        const field = row.field_corrected;
        byField[field] = (byField[field] || 0) + 1;
      }
    }

    // 排序取 top 10
    const topFields = Object.entries(byField)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([field, count]) => ({ field, count }));

    // ── 3. 按日期趋势 ──
    const { data: dateData, error: dateError } = await supabase
      .from('corrections')
      .select('created_at')
      .in('record_id', recordIds)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: true });

    const byDate: Record<string, number> = {};
    if (dateData) {
      for (const row of dateData) {
        const day = (row.created_at as string).slice(0, 10); // YYYY-MM-DD
        byDate[day] = (byDate[day] || 0) + 1;
      }
    }

    const dateTrend = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    // ── 4. 最近纠错记录 ──
    const { data: recent, error: recentError } = await supabase
      .from('corrections')
      .select('id, record_id, decision_id, decision_type, rule_id, field_corrected, old_value, new_value, input_id, created_at')
      .in('record_id', recordIds)
      .order('created_at', { ascending: false })
      .limit(limit);

    // ── 5. 按 input_id 聚类的错误模式（同一输入多次纠错 = 系统性问题）──
    const { data: inputPatterns, error: patternError } = await supabase
      .from('corrections')
      .select('input_id, field_corrected')
      .in('record_id', recordIds)
      .not('input_id', 'is', null)
      .gte('created_at', sinceISO);

    const inputPatternMap: Record<string, { inputId: string; fields: Set<string>; count: number }> = {};
    if (inputPatterns) {
      for (const row of inputPatterns) {
        const key = row.input_id as string;
        if (!inputPatternMap[key]) {
          inputPatternMap[key] = { inputId: key, fields: new Set(), count: 0 };
        }
        inputPatternMap[key].fields.add(row.field_corrected);
        inputPatternMap[key].count++;
      }
    }

    const problematicInputs = Object.values(inputPatternMap)
      .filter(p => p.count >= 2) // 同一输入被纠错 ≥2 次 = 值得关注
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(p => ({
        inputId: p.inputId,
        correctionCount: p.count,
        affectedFields: [...p.fields],
      }));

    // ── 6. 按决策类型聚类（哪些决策类型最容易出错）──
    const { data: decisionTypeData } = await supabase
      .from('corrections')
      .select('decision_type, field_corrected')
      .in('record_id', recordIds)
      .not('decision_type', 'is', null)
      .gte('created_at', sinceISO);

    const decisionTypeClusters: Record<string, { count: number; fields: Set<string> }> = {};
    if (decisionTypeData) {
      for (const row of decisionTypeData) {
        const dt = row.decision_type as string;
        if (!decisionTypeClusters[dt]) {
          decisionTypeClusters[dt] = { count: 0, fields: new Set() };
        }
        decisionTypeClusters[dt].count++;
        decisionTypeClusters[dt].fields.add(row.field_corrected);
      }
    }

    const topDecisionTypes = Object.entries(decisionTypeClusters)
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([decisionType, cluster]) => ({
        decisionType,
        correctionCount: cluster.count,
        affectedFields: [...cluster.fields],
      }));

    // ── 7. 按规则聚类（哪些规则最常导致纠错）──
    const { data: ruleData } = await supabase
      .from('corrections')
      .select('rule_id, field_corrected, decision_type')
      .in('record_id', recordIds)
      .not('rule_id', 'is', null)
      .gte('created_at', sinceISO);

    const ruleClusters: Record<string, { count: number; fields: Set<string>; decisionTypes: Set<string> }> = {};
    if (ruleData) {
      for (const row of ruleData) {
        const rid = row.rule_id as string;
        if (!ruleClusters[rid]) {
          ruleClusters[rid] = { count: 0, fields: new Set(), decisionTypes: new Set() };
        }
        ruleClusters[rid].count++;
        ruleClusters[rid].fields.add(row.field_corrected);
        if (row.decision_type) ruleClusters[rid].decisionTypes.add(row.decision_type as string);
      }
    }

    const topRules = Object.entries(ruleClusters)
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([ruleId, cluster]) => ({
        ruleId,
        correctionCount: cluster.count,
        affectedFields: [...cluster.fields],
        affectedDecisionTypes: [...cluster.decisionTypes],
      }));

    return apiSuccess(
      {
        total: total ?? 0,
        topFields,
        dateTrend,
        recentCorrections: recent ?? [],
        problematicInputs,
        errorClusters: {
          byDecisionType: topDecisionTypes,
          byRule: topRules,
        },
        meta: {
          days,
          since: sinceISO,
        },
      },
      ctx.traceId,
      200
    );
  } catch (error) {
    log.error('查询纠错趋势失败', { details: { error: String(error) } });
    return apiError(
      ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED,
      error instanceof Error ? error.message : '查询纠错趋势失败',
      ctx.traceId,
      500
    );
  }
}
