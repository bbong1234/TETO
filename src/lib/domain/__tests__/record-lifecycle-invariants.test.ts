/**
 * record-lifecycle-invariants 测试 — 5 条生命周期规则
 */
import { describe, it, expect } from 'vitest';
import { validateLifecycleTransition } from '../record-lifecycle-invariants';

describe('validateLifecycleTransition', () => {
  // ── 规则 1: 仅计划可完成 ──
  describe('规则1: 仅计划类型可完成', () => {
    it('type="计划" → 合法', () => {
      const issues = validateLifecycleTransition({ type: '计划' }, 'complete');
      expect(issues.some(i => i.code === 'LIFECYCLE_COMPLETE_REQUIRES_PLAN')).toBe(false);
    });

    it('type="发生" → blocking', () => {
      const issues = validateLifecycleTransition({ type: '发生' }, 'complete');
      expect(issues.some(i => i.code === 'LIFECYCLE_COMPLETE_REQUIRES_PLAN' && i.severity === 'blocking')).toBe(true);
    });

    it('type="想法" → blocking', () => {
      const issues = validateLifecycleTransition({ type: '想法' }, 'complete');
      expect(issues.some(i => i.code === 'LIFECYCLE_COMPLETE_REQUIRES_PLAN')).toBe(true);
    });

    it('type="总结" → blocking', () => {
      const issues = validateLifecycleTransition({ type: '总结' }, 'complete');
      expect(issues.some(i => i.code === 'LIFECYCLE_COMPLETE_REQUIRES_PLAN')).toBe(true);
    });
  });

  // ── 规则 2: 仅计划可推迟 ──
  describe('规则2: 仅计划类型可推迟', () => {
    it('type="计划" → 合法', () => {
      const issues = validateLifecycleTransition({ type: '计划' }, 'postpone');
      expect(issues.some(i => i.code === 'LIFECYCLE_POSTPONE_REQUIRES_PLAN')).toBe(false);
    });

    it('type="发生" → blocking', () => {
      const issues = validateLifecycleTransition({ type: '发生' }, 'postpone');
      expect(issues.some(i => i.code === 'LIFECYCLE_POSTPONE_REQUIRES_PLAN' && i.severity === 'blocking')).toBe(true);
    });
  });

  // ── 规则 3: 仅计划可取消 ──
  describe('规则3: 仅计划类型可取消', () => {
    it('type="计划" → 合法', () => {
      const issues = validateLifecycleTransition({ type: '计划' }, 'cancel');
      expect(issues.some(i => i.code === 'LIFECYCLE_CANCEL_REQUIRES_PLAN')).toBe(false);
    });

    it('type="想法" → blocking', () => {
      const issues = validateLifecycleTransition({ type: '想法' }, 'cancel');
      expect(issues.some(i => i.code === 'LIFECYCLE_CANCEL_REQUIRES_PLAN' && i.severity === 'blocking')).toBe(true);
    });
  });

  // ── 规则 4: 终态不可操作 ──
  describe('规则4: 终态阻止操作', () => {
    it('lfs=completed → 阻止完成', () => {
      const issues = validateLifecycleTransition({ type: '计划', lifecycle_status: 'completed' }, 'complete');
      expect(issues.some(i => i.code === 'LIFECYCLE_ALREADY_TERMINAL')).toBe(true);
    });

    it('lfs=postponed → 阻止取消', () => {
      const issues = validateLifecycleTransition({ type: '计划', lifecycle_status: 'postponed' }, 'cancel');
      expect(issues.some(i => i.code === 'LIFECYCLE_ALREADY_TERMINAL')).toBe(true);
    });

    it('lfs=cancelled → 阻止推迟', () => {
      const issues = validateLifecycleTransition({ type: '计划', lifecycle_status: 'cancelled' }, 'postpone');
      expect(issues.some(i => i.code === 'LIFECYCLE_ALREADY_TERMINAL')).toBe(true);
    });

    it('lfs=active → 允许完成', () => {
      const issues = validateLifecycleTransition({ type: '计划', lifecycle_status: 'active' }, 'complete');
      expect(issues.some(i => i.code === 'LIFECYCLE_ALREADY_TERMINAL')).toBe(false);
    });

    it('lfs=null → 允许取消', () => {
      const issues = validateLifecycleTransition({ type: '计划', lifecycle_status: null }, 'cancel');
      expect(issues.some(i => i.code === 'LIFECYCLE_ALREADY_TERMINAL')).toBe(false);
    });
  });

  // ── 规则 5: 推迟操作需要 new_date（逻辑声明，不做运行时断言） ──
  describe('规则5: 推迟操作声明', () => {
    it('推迟操作不产生额外错误（new_date 在调用层校验）', () => {
      const issues = validateLifecycleTransition({ type: '计划' }, 'postpone');
      expect(issues.length).toBe(0);
    });
  });
});
