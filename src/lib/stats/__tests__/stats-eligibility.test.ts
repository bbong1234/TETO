/**
 * stats-eligibility 测试 — 双口径过滤
 */
import { describe, it, expect } from 'vitest';
import { isEligible } from '../stats-eligibility';
import type { EligibilityCaliber } from '../stats-eligibility';
import type { Record } from '@/types/teto';

type RecordFields = Pick<
  Record,
  'type' | 'lifecycle_status' | 'data_nature' | 'is_period_rule' | 'review_status'
>;

describe('isEligible (双口径)', () => {
  const baseRecord: RecordFields = {
    type: '发生',
    lifecycle_status: 'active',
    data_nature: 'fact',
    is_period_rule: false,
    review_status: 'confirmed',
  };

  // ── display 口径 ──
  describe('display 口径', () => {
    const caliber: EligibilityCaliber = 'display';

    it('正常记录 → eligible', () => {
      expect(isEligible(baseRecord, caliber).eligible).toBe(true);
    });

    it('cancelled → 排除', () => {
      const r = isEligible({ ...baseRecord, lifecycle_status: 'cancelled' }, caliber);
      expect(r.eligible).toBe(false);
      expect(r.exclusionReason).toContain('已取消');
    });

    it('is_period_rule=true → 排除', () => {
      const r = isEligible({ ...baseRecord, is_period_rule: true }, caliber);
      expect(r.eligible).toBe(false);
      expect(r.exclusionReason).toContain('规律概括');
    });

    it('inferred → display 通过（不排除）', () => {
      const r = isEligible({ ...baseRecord, data_nature: 'inferred' }, caliber);
      expect(r.eligible).toBe(true);
    });

    it('type="计划" → display 通过', () => {
      const r = isEligible({ ...baseRecord, type: '计划' }, caliber);
      expect(r.eligible).toBe(true);
    });

    it('type="想法" → display 通过', () => {
      const r = isEligible({ ...baseRecord, type: '想法' }, caliber);
      expect(r.eligible).toBe(true);
    });
  });

  // ── insight 口径 ──
  describe('insight 口径', () => {
    const caliber: EligibilityCaliber = 'insight';

    it('正常发生记录 → eligible', () => {
      expect(isEligible(baseRecord, caliber).eligible).toBe(true);
    });

    it('正常总结记录 → eligible', () => {
      const summaryRecord: RecordFields = { ...baseRecord, type: '总结' };
      expect(isEligible(summaryRecord, caliber).eligible).toBe(true);
    });

    it('cancelled → 排除', () => {
      const r = isEligible({ ...baseRecord, lifecycle_status: 'cancelled' }, caliber);
      expect(r.eligible).toBe(false);
    });

    it('type="计划" → 排除', () => {
      const r = isEligible({ ...baseRecord, type: '计划' }, caliber);
      expect(r.eligible).toBe(false);
      expect(r.exclusionReason).toContain('非"发生"或"总结"');
    });

    it('type="想法" → 排除', () => {
      const r = isEligible({ ...baseRecord, type: '想法' }, caliber);
      expect(r.eligible).toBe(false);
      expect(r.exclusionReason).toContain('非"发生"或"总结"');
    });

    it('data_nature="inferred" → 排除', () => {
      const r = isEligible({ ...baseRecord, data_nature: 'inferred' }, caliber);
      expect(r.eligible).toBe(false);
      expect(r.exclusionReason).toContain('AI 推断');
    });

    it('review_status="unchecked" → 排除', () => {
      const r = isEligible({ ...baseRecord, review_status: 'unchecked' }, caliber);
      expect(r.eligible).toBe(false);
      expect(r.exclusionReason).toContain('未确认');
    });

    it('is_period_rule=true → 排除', () => {
      const r = isEligible({ ...baseRecord, is_period_rule: true }, caliber);
      expect(r.eligible).toBe(false);
    });
  });

  // ── 双口径对比 ──
  describe('口径差异对比', () => {
    it('cancelled：双口径都排除', () => {
      const r: RecordFields = { ...baseRecord, lifecycle_status: 'cancelled' };
      expect(isEligible(r, 'display').eligible).toBe(false);
      expect(isEligible(r, 'insight').eligible).toBe(false);
    });

    it('计划类型：display 通过，insight 排除', () => {
      const r: RecordFields = { ...baseRecord, type: '计划' };
      expect(isEligible(r, 'display').eligible).toBe(true);
      expect(isEligible(r, 'insight').eligible).toBe(false);
    });

    it('inferred：display 通过，insight 排除', () => {
      const r: RecordFields = { ...baseRecord, data_nature: 'inferred' };
      expect(isEligible(r, 'display').eligible).toBe(true);
      expect(isEligible(r, 'insight').eligible).toBe(false);
    });
  });
});
