/**
 * record-invariants 测试 — 12 条规则全覆盖
 */
import { describe, it, expect } from 'vitest';
import { validateRecordInvariants } from '../record-invariants';

describe('validateRecordInvariants', () => {
  // ── 规则 1: sub_item_id 存在时必须有 item_id ──
  describe('规则1: sub_item_id 需要 item_id', () => {
    it('有 sub_item_id 无 item_id → blocking', () => {
      const issues = validateRecordInvariants({ sub_item_id: 'sub1', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_SUB_ITEM_REQUIRES_ITEM' && i.severity === 'blocking')).toBe(true);
    });

    it('有 sub_item_id 也有 item_id → 不报错', () => {
      const issues = validateRecordInvariants({ sub_item_id: 'sub1', item_id: 'item1', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_SUB_ITEM_REQUIRES_ITEM')).toBe(false);
    });

    it('无 sub_item_id → 不报错', () => {
      const issues = validateRecordInvariants({ item_id: 'item1', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_SUB_ITEM_REQUIRES_ITEM')).toBe(false);
    });
  });

  // ── 规则 2: phase_id 存在时必须有 item_id ──
  describe('规则2: phase_id 需要 item_id', () => {
    it('有 phase_id 无 item_id → blocking', () => {
      const issues = validateRecordInvariants({ phase_id: 'p1', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_PHASE_REQUIRES_ITEM' && i.severity === 'blocking')).toBe(true);
    });

    it('有 phase_id 也有 item_id → 不报错', () => {
      const issues = validateRecordInvariants({ phase_id: 'p1', item_id: 'item1', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_PHASE_REQUIRES_ITEM')).toBe(false);
    });
  });

  // ── 规则 3: data_nature='inferred' 时无 period_source_id → blocking ──
  describe('规则3: inferred 需要 period_source_id', () => {
    it('inferred 且无 period_source_id → blocking', () => {
      const issues = validateRecordInvariants({ data_nature: 'inferred', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INFERRED_NO_SOURCE' && i.severity === 'blocking')).toBe(true);
    });

    it('inferred 且有 period_source_id → 不报错', () => {
      const issues = validateRecordInvariants({ data_nature: 'inferred', period_source_id: 'rec1', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INFERRED_NO_SOURCE')).toBe(false);
    });

    it('data_nature=fact → 不报错', () => {
      const issues = validateRecordInvariants({ data_nature: 'fact', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INFERRED_NO_SOURCE')).toBe(false);
    });
  });

  // ── 规则 4: period_source_id 存在时标记 stats_exclusion ──
  describe('规则4: period_source_id → stats_exclusion', () => {
    it('有 period_source_id → stats_exclusion', () => {
      const issues = validateRecordInvariants({ period_source_id: 'rec1', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_DERIVED_FROM_PERIOD' && i.severity === 'stats_exclusion')).toBe(true);
    });

    it('无 period_source_id → 不标记', () => {
      const issues = validateRecordInvariants({ time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_DERIVED_FROM_PERIOD')).toBe(false);
    });
  });

  // ── 规则 5: is_period_rule=true 但缺少解释字段 → warning ──
  describe('规则5: period_rule 缺少解释字段', () => {
    it('is_period_rule=true 但所有解释字段为空 → warning', () => {
      const issues = validateRecordInvariants({ is_period_rule: true, time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_PERIOD_RULE_INCOMPLETE' && i.severity === 'warning')).toBe(true);
    });

    it('is_period_rule=true 且有 content → 不报错', () => {
      const issues = validateRecordInvariants({ is_period_rule: true, content: '每天跑步', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_PERIOD_RULE_INCOMPLETE')).toBe(false);
    });

    it('is_period_rule=true 且有 period_frequency → 不报错', () => {
      const issues = validateRecordInvariants({ is_period_rule: true, period_frequency: '每天', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_PERIOD_RULE_INCOMPLETE')).toBe(false);
    });

    it('is_period_rule=false → 不检查', () => {
      const issues = validateRecordInvariants({ is_period_rule: false, time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_PERIOD_RULE_INCOMPLETE')).toBe(false);
    });
  });

  // ── 规则 6: lifecycle_status='cancelled' → stats_exclusion ──
  describe('规则6: cancelled → stats_exclusion', () => {
    it('lifecycle_status=cancelled → stats_exclusion', () => {
      const issues = validateRecordInvariants({ lifecycle_status: 'cancelled', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_CANCELLED' && i.severity === 'stats_exclusion')).toBe(true);
    });

    it('lifecycle_status=active → 不标记', () => {
      const issues = validateRecordInvariants({ lifecycle_status: 'active', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_CANCELLED')).toBe(false);
    });
  });

  // ── 规则 7: review_status='unchecked' → stats_exclusion ──
  describe('规则7: unchecked → stats_exclusion', () => {
    it('review_status=unchecked → stats_exclusion', () => {
      const issues = validateRecordInvariants({ review_status: 'unchecked', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_UNCHECKED' && i.severity === 'stats_exclusion')).toBe(true);
    });

    it('review_status=checked → 不标记', () => {
      const issues = validateRecordInvariants({ review_status: 'checked', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_UNCHECKED')).toBe(false);
    });
  });

  // ── 规则 8: type 不在 RECORD_TYPES 内 → blocking ──
  describe('规则8: type 枚举校验', () => {
    it('type="发生" → 合法', () => {
      const issues = validateRecordInvariants({ type: '发生', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_TYPE')).toBe(false);
    });

    it('type="计划" → 合法', () => {
      const issues = validateRecordInvariants({ type: '计划', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_TYPE')).toBe(false);
    });

    it('type="想法" → 合法', () => {
      const issues = validateRecordInvariants({ type: '想法', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_TYPE')).toBe(false);
    });

    it('type="总结" → 合法', () => {
      const issues = validateRecordInvariants({ type: '总结', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_TYPE')).toBe(false);
    });

    it('type="无效类型" → blocking', () => {
      const issues = validateRecordInvariants({ type: '无效类型', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_TYPE' && i.severity === 'blocking')).toBe(true);
    });

    it('type=null → 不报错（允许为空）', () => {
      const issues = validateRecordInvariants({ type: null, time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_TYPE')).toBe(false);
    });
  });

  // ── 规则 9: lifecycle_status 不在 LIFECYCLE_STATUSES 内 → blocking ──
  describe('规则9: lifecycle_status 枚举校验', () => {
    it('lifecycle_status="active" → 合法', () => {
      const issues = validateRecordInvariants({ lifecycle_status: 'active', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_LIFECYCLE')).toBe(false);
    });

    it('lifecycle_status="completed" → 合法', () => {
      const issues = validateRecordInvariants({ lifecycle_status: 'completed', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_LIFECYCLE')).toBe(false);
    });

    it('lifecycle_status="postponed" → 合法', () => {
      const issues = validateRecordInvariants({ lifecycle_status: 'postponed', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_LIFECYCLE')).toBe(false);
    });

    it('lifecycle_status="cancelled" → 合法', () => {
      const issues = validateRecordInvariants({ lifecycle_status: 'cancelled', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_LIFECYCLE')).toBe(false);
    });

    it('lifecycle_status="invalid" → blocking', () => {
      const issues = validateRecordInvariants({ lifecycle_status: 'invalid', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_LIFECYCLE' && i.severity === 'blocking')).toBe(true);
    });
  });

  // ── 规则 10: data_nature 不在 ['fact','inferred'] 内 → blocking ──
  describe('规则10: data_nature 枚举校验', () => {
    it('data_nature="fact" → 合法', () => {
      const issues = validateRecordInvariants({ data_nature: 'fact', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_DATA_NATURE')).toBe(false);
    });

    it('data_nature="inferred" → 合法', () => {
      const issues = validateRecordInvariants({ data_nature: 'inferred', period_source_id: 'r1', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_DATA_NATURE')).toBe(false);
    });

    it('data_nature="unknown" → blocking', () => {
      const issues = validateRecordInvariants({ data_nature: 'unknown', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_DATA_NATURE' && i.severity === 'blocking')).toBe(true);
    });
  });

  // ── 规则 11: period_frequency 不在合法枚举内且非 null → blocking ──
  describe('规则11: period_frequency 枚举校验', () => {
    it('period_frequency="daily" → 合法', () => {
      const issues = validateRecordInvariants({ period_frequency: 'daily', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_PERIOD_FREQUENCY')).toBe(false);
    });

    it('period_frequency="weekly" → 合法', () => {
      const issues = validateRecordInvariants({ period_frequency: 'weekly', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_PERIOD_FREQUENCY')).toBe(false);
    });

    it('period_frequency="每小时" → blocking', () => {
      const issues = validateRecordInvariants({ period_frequency: '每小时', time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_PERIOD_FREQUENCY' && i.severity === 'blocking')).toBe(true);
    });

    it('period_frequency=null → 不报错', () => {
      const issues = validateRecordInvariants({ period_frequency: null, time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_INVALID_PERIOD_FREQUENCY')).toBe(false);
    });
  });

  // ── 规则 12: time_anchor_date 为空（创建时）→ warning ──
  describe('规则12: time_anchor_date 缺失', () => {
    it('创建且无 time_anchor_date → warning', () => {
      const issues = validateRecordInvariants({});
      expect(issues.some(i => i.code === 'RECORD_NO_TIME_ANCHOR' && i.severity === 'warning')).toBe(true);
    });

    it('创建且有 time_anchor_date → 不报错', () => {
      const issues = validateRecordInvariants({ time_anchor_date: '2026-01-01' });
      expect(issues.some(i => i.code === 'RECORD_NO_TIME_ANCHOR')).toBe(false);
    });

    it('更新且无 time_anchor_date → 不报错', () => {
      const issues = validateRecordInvariants({}, { isUpdate: true });
      expect(issues.some(i => i.code === 'RECORD_NO_TIME_ANCHOR')).toBe(false);
    });
  });
});
