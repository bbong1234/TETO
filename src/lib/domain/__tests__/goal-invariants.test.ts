/**
 * goal-invariants 测试 — 10 条规则（状态转换 + 完成锁）
 */
import { describe, it, expect } from 'vitest';
import { validateGoalInvariants } from '../goal-invariants';

describe('validateGoalInvariants', () => {
  // ── 规则 1: 标题不能为空 ──
  describe('规则1: 标题不能为空', () => {
    it('无 title → blocking', () => {
      const issues = validateGoalInvariants({});
      expect(issues.some(i => i.code === 'GOAL_TITLE_REQUIRED' && i.severity === 'blocking')).toBe(true);
    });

    it('title="" → blocking', () => {
      const issues = validateGoalInvariants({ title: '' });
      expect(issues.some(i => i.code === 'GOAL_TITLE_REQUIRED')).toBe(true);
    });

    it('title="目标A" → 合法', () => {
      const issues = validateGoalInvariants({ title: '目标A' });
      expect(issues.some(i => i.code === 'GOAL_TITLE_REQUIRED')).toBe(false);
    });
  });

  // ── 规则 2: status 必须在 GOAL_STATUSES 内 ──
  describe('规则2: status 枚举校验', () => {
    it.each(['草稿', '进行中', '已完成', '暂停', '放弃'])('status="%s" → 合法', (status) => {
      const issues = validateGoalInvariants({ status, title: 'x' });
      expect(issues.some(i => i.code === 'GOAL_INVALID_STATUS')).toBe(false);
    });

    it('status="无效" → blocking', () => {
      const issues = validateGoalInvariants({ status: '无效', title: 'x' });
      expect(issues.some(i => i.code === 'GOAL_INVALID_STATUS' && i.severity === 'blocking')).toBe(true);
    });
  });

  // ── 规则 3: rule_type 枚举 ──
  describe('规则3: rule_type 枚举校验', () => {
    it.each(['一次性完成', '周期性达成', '周期性限制'])('rule_type="%s" → 合法', (rt) => {
      const issues = validateGoalInvariants({ rule_type: rt, title: 'x' });
      expect(issues.some(i => i.code === 'GOAL_INVALID_RULE_TYPE')).toBe(false);
    });

    it('rule_type="未知类型" → blocking', () => {
      const issues = validateGoalInvariants({ rule_type: '未知类型', title: 'x' });
      expect(issues.some(i => i.code === 'GOAL_INVALID_RULE_TYPE' && i.severity === 'blocking')).toBe(true);
    });
  });

  // ── 规则 4: operator 枚举 ──
  describe('规则4: operator 枚举校验', () => {
    it.each(['>=', '<=', '=', 'between', 'before', 'after', 'complete'])('operator="%s" → 合法', (op) => {
      const issues = validateGoalInvariants({ operator: op, title: 'x' });
      expect(issues.some(i => i.code === 'GOAL_INVALID_OPERATOR')).toBe(false);
    });

    it('operator=">" → blocking', () => {
      const issues = validateGoalInvariants({ operator: '>', title: 'x' });
      expect(issues.some(i => i.code === 'GOAL_INVALID_OPERATOR')).toBe(true);
    });
  });

  // ── 规则 5: period 枚举 ──
  describe('规则5: period 枚举校验', () => {
    it('period="本周" → 合法（示例）', () => {
      const issues = validateGoalInvariants({ period: '本周', title: 'x' });
      expect(issues.some(i => i.code === 'GOAL_INVALID_PERIOD')).toBe(false);
    });

    it('period="无效周期" → blocking', () => {
      const issues = validateGoalInvariants({ period: '无效周期', title: 'x' });
      expect(issues.some(i => i.code === 'GOAL_INVALID_PERIOD' && i.severity === 'blocking')).toBe(true);
    });
  });

  // ── 规则 6: source 枚举 ──
  describe('规则6: source 枚举校验', () => {
    it('source="手动创建" → 合法', () => {
      const issues = validateGoalInvariants({ source: '手动创建', title: 'x' });
      expect(issues.some(i => i.code === 'GOAL_SOURCE_INVALID')).toBe(false);
    });

    it('source="unknown" → warning', () => {
      const issues = validateGoalInvariants({ source: 'unknown', title: 'x' });
      expect(issues.some(i => i.code === 'GOAL_SOURCE_INVALID' && i.severity === 'warning')).toBe(true);
    });
  });

  // ── 规则 7: 已完成目标锁定 ──
  describe('规则7: 已完成目标锁定', () => {
    it('已完成目标修改 title → blocking', () => {
      const issues = validateGoalInvariants(
        { title: 'new', _existingStatus: '已完成' },
        { isUpdate: true }
      );
      expect(issues.some(i => i.code === 'GOAL_COMPLETED_LOCKED' && i.severity === 'blocking')).toBe(true);
    });

    it('已完成目标回退到"放弃" → 合法', () => {
      const issues = validateGoalInvariants(
        { status: '放弃', _existingStatus: '已完成' },
        { isUpdate: true }
      );
      expect(issues.some(i => i.code === 'GOAL_COMPLETED_LOCKED')).toBe(false);
    });

    it('已完成目标回退到"暂停" → 合法', () => {
      const issues = validateGoalInvariants(
        { status: '暂停', _existingStatus: '已完成' },
        { isUpdate: true }
      );
      expect(issues.some(i => i.code === 'GOAL_COMPLETED_LOCKED')).toBe(false);
    });

    it('已完成目标回退到"草稿" → blocking', () => {
      const issues = validateGoalInvariants(
        { status: '草稿', _existingStatus: '已完成' },
        { isUpdate: true }
      );
      expect(issues.some(i => i.code === 'GOAL_COMPLETED_LOCKED')).toBe(true);
    });
  });

  // ── 规则 8: 创建时必须有 target ──
  describe('规则8: 创建时 target 必填', () => {
    it('创建无 target → blocking', () => {
      const issues = validateGoalInvariants({ title: 'x' }, { isCreate: true });
      expect(issues.some(i => i.code === 'GOAL_TARGET_REQUIRED' && i.severity === 'blocking')).toBe(true);
    });

    it('创建有 target_value → 合法', () => {
      const issues = validateGoalInvariants({ title: 'x', target_value: 10 }, { isCreate: true });
      expect(issues.some(i => i.code === 'GOAL_TARGET_REQUIRED')).toBe(false);
    });

    it('创建有 target_min → 合法', () => {
      const issues = validateGoalInvariants({ title: 'x', target_min: 5 }, { isCreate: true });
      expect(issues.some(i => i.code === 'GOAL_TARGET_REQUIRED')).toBe(false);
    });

    it('周期性限制有 target_max 无 target_value → 合法', () => {
      const issues = validateGoalInvariants(
        { title: 'x', rule_type: '周期性限制', target_max: 100 },
        { isCreate: true }
      );
      expect(issues.some(i => i.code === 'GOAL_TARGET_REQUIRED')).toBe(false);
    });
  });

  // ── 规则 9: confirmation_required 的目标必须为草稿 ──
  describe('规则9: 需确认的目标必须为草稿', () => {
    it('confirmation_required=true 且 status=草稿 → 合法', () => {
      const issues = validateGoalInvariants({ confirmation_required: true, status: '草稿', title: 'x' });
      expect(issues.some(i => i.code === 'GOAL_CONFIRM_ONLY_DRAFT')).toBe(false);
    });

    it('confirmation_required=true 且 status=进行中 → blocking', () => {
      const issues = validateGoalInvariants({ confirmation_required: true, status: '进行中', title: 'x' });
      expect(issues.some(i => i.code === 'GOAL_CONFIRM_ONLY_DRAFT' && i.severity === 'blocking')).toBe(true);
    });

    it('confirmation_required=false → 不检查', () => {
      const issues = validateGoalInvariants({ confirmation_required: false, status: '进行中', title: 'x' });
      expect(issues.some(i => i.code === 'GOAL_CONFIRM_ONLY_DRAFT')).toBe(false);
    });
  });

  // ── 规则 10: progress_source 枚举 ──
  describe('规则10: progress_source 枚举校验', () => {
    it('progress_source="记录统计" → 合法', () => {
      const issues = validateGoalInvariants({ progress_source: '记录统计', title: 'x' });
      expect(issues.some(i => i.code === 'GOAL_INVALID_PROGRESS_SOURCE')).toBe(false);
    });

    it('progress_source="invalid" → warning', () => {
      const issues = validateGoalInvariants({ progress_source: 'invalid', title: 'x' });
      expect(issues.some(i => i.code === 'GOAL_INVALID_PROGRESS_SOURCE' && i.severity === 'warning')).toBe(true);
    });
  });
});
