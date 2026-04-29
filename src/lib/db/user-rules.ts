import { createClient } from '@/lib/supabase/server';
import type { RuleType, RuleSource, RuleConfidence } from '@/types/teto';

// ================================
// 类型定义
// ================================

export const RULE_TYPES = ['item_mapping', 'sub_item_mapping', 'type_routing', 'fuzzy_resolution'] as const;
export type { RuleType };

export const RULE_SOURCES = ['ai_learned', 'user_set', 'system_default'] as const;
export type { RuleSource };

export const RULE_CONFIDENCES = ['high', 'medium', 'low'] as const;
export type { RuleConfidence };

export interface UserRule {
  id: string;
  user_id: string;
  rule_type: RuleType;
  trigger_pattern: string;
  target_id: string | null;
  target_type: 'item' | 'sub_item' | null;
  confidence: RuleConfidence;
  source: RuleSource;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserRulePayload {
  rule_type: RuleType;
  trigger_pattern: string;
  target_id?: string | null;
  target_type?: 'item' | 'sub_item' | null;
  confidence?: RuleConfidence;
  source?: RuleSource;
  is_active?: boolean;
}

export interface UpdateUserRulePayload {
  rule_type?: RuleType;
  trigger_pattern?: string;
  target_id?: string | null;
  target_type?: 'item' | 'sub_item' | null;
  confidence?: RuleConfidence;
  source?: RuleSource;
  is_active?: boolean;
}

export interface UserRulesQuery {
  rule_type?: RuleType;
  is_active?: boolean;
  source?: RuleSource;
}

// ================================
// CRUD 操作
// ================================

/**
 * 获取用户的所有规则（可按类型/状态过滤）
 */
export async function getUserRules(
  userId: string,
  query?: UserRulesQuery
): Promise<UserRule[]> {
  const supabase = await createClient();

  let q = supabase
    .from('user_rules')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (query?.rule_type) q = q.eq('rule_type', query.rule_type);
  if (query?.is_active !== undefined) q = q.eq('is_active', query.is_active);
  if (query?.source) q = q.eq('source', query.source);

  const { data, error } = await q;

  if (error) {
    throw new Error(`获取用户规则失败: ${error.message}`);
  }

  return (data || []) as UserRule[];
}

/**
 * 获取单条规则
 */
export async function getUserRuleById(
  userId: string,
  ruleId: string
): Promise<UserRule | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('user_rules')
    .select('*')
    .eq('id', ruleId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`获取规则失败: ${error.message}`);
  }

  return data as UserRule;
}

/**
 * 按触发模式查找匹配的活跃规则（用于解析时快速匹配）
 */
export async function findMatchingRules(
  userId: string,
  triggerPattern: string
): Promise<UserRule[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('user_rules')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('trigger_pattern', triggerPattern);

  if (error) {
    throw new Error(`查找匹配规则失败: ${error.message}`);
  }

  return (data || []) as UserRule[];
}

/**
 * 按规则类型查找所有活跃规则（用于解析时批量匹配）
 */
export async function getActiveRulesByType(
  userId: string,
  ruleType: RuleType
): Promise<UserRule[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('user_rules')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('rule_type', ruleType);

  if (error) {
    throw new Error(`获取活跃规则失败: ${error.message}`);
  }

  return (data || []) as UserRule[];
}

/**
 * 创建用户规则
 */
export async function createUserRule(
  userId: string,
  payload: CreateUserRulePayload
): Promise<UserRule> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('user_rules')
    .insert({
      user_id: userId,
      rule_type: payload.rule_type,
      trigger_pattern: payload.trigger_pattern,
      target_id: payload.target_id ?? null,
      target_type: payload.target_type ?? null,
      confidence: payload.confidence ?? 'high',
      source: payload.source ?? 'ai_learned',
      is_active: payload.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`创建用户规则失败: ${error.message}`);
  }

  return data as UserRule;
}

/**
 * 更新用户规则
 */
export async function updateUserRule(
  userId: string,
  ruleId: string,
  payload: UpdateUserRulePayload
): Promise<UserRule> {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = {};
  if (payload.rule_type !== undefined) updateData.rule_type = payload.rule_type;
  if (payload.trigger_pattern !== undefined) updateData.trigger_pattern = payload.trigger_pattern;
  if (payload.target_id !== undefined) updateData.target_id = payload.target_id;
  if (payload.target_type !== undefined) updateData.target_type = payload.target_type;
  if (payload.confidence !== undefined) updateData.confidence = payload.confidence;
  if (payload.source !== undefined) updateData.source = payload.source;
  if (payload.is_active !== undefined) updateData.is_active = payload.is_active;

  const { data, error } = await supabase
    .from('user_rules')
    .update(updateData)
    .eq('id', ruleId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`更新用户规则失败: ${error.message}`);
  }

  return data as UserRule;
}

/**
 * 删除用户规则
 */
export async function deleteUserRule(
  userId: string,
  ruleId: string
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('user_rules')
    .delete()
    .eq('id', ruleId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`删除用户规则失败: ${error.message}`);
  }
}

/**
 * 重置用户所有规则（删除全部或按类型删除）
 */
export async function resetUserRules(
  userId: string,
  ruleType?: RuleType
): Promise<number> {
  const supabase = await createClient();

  let q = supabase
    .from('user_rules')
    .delete()
    .eq('user_id', userId);

  if (ruleType) q = q.eq('rule_type', ruleType);

  const { data, error } = await q.select();

  if (error) {
    throw new Error(`重置用户规则失败: ${error.message}`);
  }

  return data?.length ?? 0;
}
