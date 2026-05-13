/**
 * GET /api/v2/diagnose/trends?days=30
 *
 * TETO 1.6 错误聚类与趋势 API（P1）
 *
 * 聚合 decision_logs 中的错误数据，按 error_code 聚类统计，
 * 输出趋势分析（rising/falling/stable）和用户修正模式。
 *
 * 用法：
 *   GET /api/v2/diagnose/trends
 *   GET /api/v2/diagnose/trends?days=7
 *   GET /api/v2/diagnose/trends?days=30&domain=RECORD
 */

import { NextRequest } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import { withTrace, apiSuccess, apiError } from '@/lib/api/handler-wrapper';
import { createClient } from '@/lib/supabase/server';
import { ERROR_CODES } from '@/lib/observability/id-registry';
import { logger } from '@/lib/observability/logger';

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

interface ErrorCluster {
  errorCode: string;
  count: number;
  trend: 'rising' | 'falling' | 'stable';
  trendPercentage: number; // 与前周期比较的变化百分比
  firstSeen: string;
  lastSeen: string;
  /** 该错误最常出现的阶段 */
  topStage: string;
  /** 关联的 rule_id */
  ruleIds: string[];
}

interface CorrectionPattern {
  fieldCorrected: string;
  count: number;
  examples: { oldValue: string; newValue: string }[];
}

interface TrendsResult {
  periodDays: number;
  totalErrors: number;
  totalCorrections: number;
  clusters: ErrorCluster[];
  correctionPatterns: CorrectionPattern[];
  generatedAt: string;
}

// ═══════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════

/** 根据当前周期和前周期计数判定趋势 */
function determineTrend(current: number, previous: number): { trend: 'rising' | 'falling' | 'stable'; percentage: number } {
  if (previous === 0) {
    return { trend: current > 0 ? 'rising' : 'stable', percentage: current > 0 ? 100 : 0 };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 20) return { trend: 'rising', percentage: pct };
  if (pct < -20) return { trend: 'falling', percentage: pct };
  return { trend: 'stable', percentage: pct };
}

// ═══════════════════════════════════════════════════════════
// Handler
// ═══════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const ctx = withTrace(request);
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '30', 10) || 30, 1), 365);
    const domain = searchParams.get('domain') ?? undefined;

    const supabase = await createClient();

    // 时间窗口
    const now = new Date();
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousPeriodStart = new Date(periodStart.getTime() - days * 24 * 60 * 60 * 1000);

    // ═══════════════════════════════════════════════════════════
    // 1. 查询 decision_logs 错误数据
    // ═══════════════════════════════════════════════════════════

    let query = supabase
      .from('decision_logs')
      .select('error_code, stage, created_at, rule_ids, decision_type, input_summary, output_summary')
      .gte('created_at', previousPeriodStart.toISOString())
      .order('created_at', { ascending: false });

    // 仅查错误日志（有 error_code 的）
    query = query.not('error_code', 'is', null);

    const { data: decisions, error: decisionsError } = await query;

    // 如果表不存在或无数据，返回空结果（不报错）
    if (decisionsError) {
      logger.warn('[diagnose/trends] decision_logs 查询返回空（表可能尚未创建或无数据）', {
        errorCode: decisionsError.code,
        details: { message: decisionsError.message },
      });

      return apiSuccess(
        {
          periodDays: days,
          totalErrors: 0,
          totalCorrections: 0,
          clusters: [],
          correctionPatterns: [],
          generatedAt: new Date().toISOString(),
          _note: 'decision_logs 表尚无数据。执行 018_decision_logs.sql 后，数据将开始累积。',
        } as TrendsResult,
        ctx.traceId
      );
    }

    // ═══════════════════════════════════════════════════════════
    // 2. 按 error_code 聚类
    // ═══════════════════════════════════════════════════════════

    const allDecisions = (decisions ?? []) as Array<{
      error_code: string;
      stage: string;
      created_at: string;
      rule_ids: string[];
      decision_type: string;
      input_summary: string;
      output_summary: string;
    }>;

    // 按周期分组
    const currentPeriod = allDecisions.filter(
      (d) => new Date(d.created_at) >= periodStart
    );
    const previousPeriod = allDecisions.filter(
      (d) => new Date(d.created_at) >= previousPeriodStart && new Date(d.created_at) < periodStart
    );

    // 按 error_code 聚合
    const clusterMap = new Map<string, {
      current: typeof currentPeriod;
      previous: typeof previousPeriod;
      stages: Map<string, number>;
      ruleIds: Set<string>;
      firstSeen: string;
      lastSeen: string;
    }>();

    for (const d of allDecisions) {
      if (!d.error_code) continue;
      if (domain && !d.error_code.toLowerCase().includes(domain.toLowerCase())) continue;

      let cluster = clusterMap.get(d.error_code);
      if (!cluster) {
        cluster = {
          current: [],
          previous: [],
          stages: new Map(),
          ruleIds: new Set(),
          firstSeen: d.created_at,
          lastSeen: d.created_at,
        };
        clusterMap.set(d.error_code, cluster);
      }

      if (new Date(d.created_at) >= periodStart) {
        cluster.current.push(d);
      } else {
        cluster.previous.push(d);
      }

      // 更新阶段统计
      cluster.stages.set(d.stage, (cluster.stages.get(d.stage) ?? 0) + 1);

      // 更新规则 ID
      if (d.rule_ids) {
        for (const rid of d.rule_ids) {
          cluster.ruleIds.add(rid);
        }
      }

      // 更新首末时间
      if (d.created_at < cluster.firstSeen) cluster.firstSeen = d.created_at;
      if (d.created_at > cluster.lastSeen) cluster.lastSeen = d.created_at;
    }

    // 构建 clusters 输出
    const clusters: ErrorCluster[] = [];
    for (const [errorCode, data] of clusterMap.entries()) {
      const { trend, percentage } = determineTrend(data.current.length, data.previous.length);

      // 找出现次数最多的 stage
      let topStage = 'unknown';
      let topStageCount = 0;
      for (const [stage, count] of data.stages.entries()) {
        if (count > topStageCount) {
          topStageCount = count;
          topStage = stage;
        }
      }

      clusters.push({
        errorCode,
        count: data.current.length,
        trend,
        trendPercentage: percentage,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
        topStage,
        ruleIds: Array.from(data.ruleIds),
      });
    }

    // 按错误数量降序排列
    clusters.sort((a, b) => b.count - a.count);

    // ═══════════════════════════════════════════════════════════
    // 3. 查询 correction 模式
    // ═══════════════════════════════════════════════════════════

    let correctionPatterns: CorrectionPattern[] = [];

    try {
      const { data: corrections } = await supabase
        .from('corrections')
        .select('field_corrected, old_value, new_value')
        .gte('created_at', periodStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      if (corrections && corrections.length > 0) {
        const correctionMap = new Map<string, { count: number; examples: { oldValue: string; newValue: string }[] }>();

        for (const c of corrections as Array<{ field_corrected: string; old_value: string; new_value: string }>) {
          let entry = correctionMap.get(c.field_corrected);
          if (!entry) {
            entry = { count: 0, examples: [] };
            correctionMap.set(c.field_corrected, entry);
          }
          entry.count++;
          if (entry.examples.length < 3) {
            entry.examples.push({ oldValue: c.old_value, newValue: c.new_value });
          }
        }

        correctionPatterns = Array.from(correctionMap.entries()).map(([field, data]) => ({
          fieldCorrected: field,
          count: data.count,
          examples: data.examples,
        }));

        correctionPatterns.sort((a, b) => b.count - a.count);
      }
    } catch {
      // corrections 表可能也不存在 — 静默处理
    }

    // ═══════════════════════════════════════════════════════════
    // 4. 输出
    // ═══════════════════════════════════════════════════════════

    const result: TrendsResult = {
      periodDays: days,
      totalErrors: currentPeriod.length,
      totalCorrections: correctionPatterns.reduce((sum, p) => sum + p.count, 0),
      clusters,
      correctionPatterns,
      generatedAt: new Date().toISOString(),
    };

    return apiSuccess(result, ctx.traceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : '趋势分析内部错误';
    logger.error('[diagnose/trends] 错误聚类查询失败', {
      errorCode: ERROR_CODES.GOAL_CALCULATION_ERROR,
      details: { error: message },
    });

    return apiError(ERROR_CODES.GOAL_CALCULATION_ERROR, message, ctx.traceId, 500);
  }
}
