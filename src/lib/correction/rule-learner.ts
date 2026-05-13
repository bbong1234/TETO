/**
 * TETO 1.6 规则学习器
 *
 * 从 corrections 表中学习用户纠错模式，自动沉淀为 user_rules。
 * 当同一类错误积累到阈值（3次）时，自动生成规则供 classifyInput 消费。
 *
 * 规则类型映射：
 *   item_id 纠错     → item_mapping 规则
 *   sub_item_id 纠错  → sub_item_mapping 规则
 *   type 纠错         → type_routing 规则
 *   其他字段纠错      → fuzzy_resolution 规则
 *
 * 工作流：
 *   用户纠错 → corrections 写入
 *   → learnRulesFromCorrections(userId)
 *   → 分组统计同类错误
 *   → 达到阈值 → 创建/更新 user_rule
 *   → 标记 corrections.rule_id → 建立可追溯链路
 */

import { createClient } from '@/lib/supabase/server';
import {
  createUserRule,
  updateUserRule,
  getUserRules,
  type RuleType,
  type RuleConfidence,
} from '@/lib/db/user-rules';
import { createComponentLogger } from '@/lib/observability/logger';

const log = createComponentLogger('rule-learner');

/** 错误聚类的阈值：同类错误出现 N 次后自动创建规则 */
const CORRECTION_THRESHOLD = 3;

/** 字段→规则类型映射 */
const FIELD_TO_RULE_TYPE: Record<string, RuleType> = {
  item_id: 'item_mapping',
  sub_item_id: 'sub_item_mapping',
  type: 'type_routing',
  // 其他字段统一归为 fuzzy_resolution
};

/** 字段→target_type 映射 */
const FIELD_TO_TARGET_TYPE: Record<string, 'item' | 'sub_item'> = {
  item_id: 'item',
  sub_item_id: 'sub_item',
};

export interface LearnRulesResult {
  /** 新生成的规则数 */
  rulesCreated: number;
  /** 更新的规则数 */
  rulesUpdated: number;
  /** 处理的纠错记录数 */
  correctionsProcessed: number;
  /** 学习到的规则详情（供日志/审计） */
  learnedRules: Array<{
    ruleId: string;
    ruleType: RuleType;
    triggerPattern: string;
    targetId: string | null;
    confidence: RuleConfidence;
    correctionCount: number;
  }>;
}

/**
 * 从纠错记录中学习规则
 *
 * 在每次用户纠错后调用（异步，不影响主流程）。
 *
 * @param userId - 用户 ID
 * @returns 学习结果摘要
 */
export async function learnRulesFromCorrections(
  userId: string
): Promise<LearnRulesResult> {
  const supabase = await createClient();

  // ── 1. 获取未处理的纠错记录（rule_id 为空）──
  const { data: unprocessed, error: fetchErr } = await supabase
    .from('corrections')
    .select('id, field_corrected, old_value, new_value, record_id, decision_type')
    .eq('user_id', userId)
    .is('rule_id', null)
    .order('created_at', { ascending: true });

  if (fetchErr || !unprocessed) {
    log.warn('获取未处理纠错记录失败', { details: { error: fetchErr?.message } });
    return {
      rulesCreated: 0,
      rulesUpdated: 0,
      correctionsProcessed: 0,
      learnedRules: [],
    };
  }

  if (unprocessed.length === 0) {
    return {
      rulesCreated: 0,
      rulesUpdated: 0,
      correctionsProcessed: 0,
      learnedRules: [],
    };
  }

  // ── 2. 按 field_corrected + old_value 分组 ──
  const groups = new Map<
    string,
    {
      fieldCorrected: string;
      oldValue: string;
      corrections: typeof unprocessed;
      /** 最常见的 new_value 及其出现次数 */
      newValueCounts: Map<string, number>;
    }
  >();

  for (const c of unprocessed) {
    const key = `${c.field_corrected}::${c.old_value ?? '__null__'}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        fieldCorrected: c.field_corrected,
        oldValue: c.old_value ?? '',
        corrections: [],
        newValueCounts: new Map(),
      };
      groups.set(key, group);
    }
    group.corrections.push(c);
    const nv = c.new_value ?? '';
    group.newValueCounts.set(nv, (group.newValueCounts.get(nv) || 0) + 1);
  }

  // ── 3. 对达到阈值的组，生成/更新规则 ──
  const result: LearnRulesResult = {
    rulesCreated: 0,
    rulesUpdated: 0,
    correctionsProcessed: 0,
    learnedRules: [],
  };

  // 获取现有的活跃规则（用于去重）
  const existingRules = await getUserRules(userId, { is_active: true });

  for (const [, group] of groups) {
    if (group.corrections.length < CORRECTION_THRESHOLD) continue;

    const ruleType = FIELD_TO_RULE_TYPE[group.fieldCorrected] || 'fuzzy_resolution';
    const targetType = FIELD_TO_TARGET_TYPE[group.fieldCorrected] || null;

    // 取出现次数最多的 new_value 作为 target_id
    let bestNewValue = '';
    let bestCount = 0;
    for (const [nv, count] of group.newValueCounts) {
      if (count > bestCount) {
        bestCount = count;
        bestNewValue = nv;
      }
    }

    // 空 target 的规则无意义（用户只是清空了字段）
    if (!bestNewValue) continue;

    // 置信度：同类错误越多，置信度越高
    const confidence: RuleConfidence =
      group.corrections.length >= 8 ? 'high' :
      group.corrections.length >= 5 ? 'medium' : 'low';

    const triggerPattern = group.oldValue;

    // 检查是否已有相同 trigger_pattern + rule_type 的规则
    const existingRule = existingRules.find(
      r => r.rule_type === ruleType && r.trigger_pattern === triggerPattern
    );

    let ruleId: string;

    if (existingRule) {
      // 更新已有规则（增加置信度）
      await updateUserRule(userId, existingRule.id, {
        target_id: bestNewValue,
        target_type: targetType,
        confidence,
        is_active: true,
      });
      ruleId = existingRule.id;
      result.rulesUpdated++;
      log.info('更新已有规则', {
        details: { ruleId, ruleType, triggerPattern, confidence, correctionCount: group.corrections.length },
      });
    } else {
      // 创建新规则
      const newRule = await createUserRule(userId, {
        rule_type: ruleType,
        trigger_pattern: triggerPattern,
        target_id: bestNewValue,
        target_type: targetType,
        confidence,
        source: 'ai_learned',
        is_active: true,
      });
      ruleId = newRule.id;
      result.rulesCreated++;
      log.info('创建新规则', {
        details: { ruleId, ruleType, triggerPattern, targetId: bestNewValue, confidence },
      });
    }

    // ── 4. 标记所有相关 corrections 的 rule_id ──
    const correctionIds = group.corrections.map(c => c.id);
    await supabase
      .from('corrections')
      .update({ rule_id: ruleId })
      .in('id', correctionIds);

    result.correctionsProcessed += correctionIds.length;
    result.learnedRules.push({
      ruleId,
      ruleType,
      triggerPattern,
      targetId: bestNewValue,
      confidence,
      correctionCount: group.corrections.length,
    });
  }

  if (result.correctionsProcessed > 0) {
    log.info('规则学习完成', {
      details: {
        created: result.rulesCreated,
        updated: result.rulesUpdated,
        processed: result.correctionsProcessed,
      },
    });
  }

  return result;
}

/**
 * 快速触发规则学习（在纠错 API 中调用，不阻塞主流程）
 */
export function scheduleRuleLearning(userId: string): void {
  // 异步执行，不等待结果
  learnRulesFromCorrections(userId).catch(err => {
    log.error('后台规则学习失败', { details: { error: String(err) } });
  });
}
