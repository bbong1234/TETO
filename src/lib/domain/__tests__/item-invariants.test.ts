/**
 * item-invariants 测试 — 8 条规则（状态转换 + 唯一性）
 */
import { describe, it, expect } from 'vitest';
import { validateItemInvariants } from '../item-invariants';

describe('validateItemInvariants', () => {
  // ── 规则 1: 标题不能为空 ──
  describe('规则1: 标题不能为空', () => {
    it('无 title → blocking', () => {
      const issues = validateItemInvariants({});
      expect(issues.some(i => i.code === 'ITEM_TITLE_REQUIRED' && i.severity === 'blocking')).toBe(true);
    });

    it('title="" → blocking', () => {
      const issues = validateItemInvariants({ title: '' });
      expect(issues.some(i => i.code === 'ITEM_TITLE_REQUIRED')).toBe(true);
    });

    it('title="  " → blocking', () => {
      const issues = validateItemInvariants({ title: '  ' });
      expect(issues.some(i => i.code === 'ITEM_TITLE_REQUIRED')).toBe(true);
    });

    it('title="项目A" → 合法', () => {
      const issues = validateItemInvariants({ title: '项目A' });
      expect(issues.some(i => i.code === 'ITEM_TITLE_REQUIRED')).toBe(false);
    });
  });

  // ── 规则 2: 标题不超过 200 字符 ──
  describe('规则2: 标题不超过200字符', () => {
    it('title=199 字符 → 合法', () => {
      const issues = validateItemInvariants({ title: 'a'.repeat(199) });
      expect(issues.some(i => i.code === 'ITEM_TITLE_TOO_LONG')).toBe(false);
    });

    it('title=200 字符 → 合法', () => {
      const issues = validateItemInvariants({ title: 'a'.repeat(200) });
      expect(issues.some(i => i.code === 'ITEM_TITLE_TOO_LONG')).toBe(false);
    });

    it('title=201 字符 → blocking', () => {
      const issues = validateItemInvariants({ title: 'a'.repeat(201) });
      expect(issues.some(i => i.code === 'ITEM_TITLE_TOO_LONG' && i.severity === 'blocking')).toBe(true);
    });
  });

  // ── 规则 3: status 必须在 ITEM_STATUSES 内 ──
  describe('规则3: status 枚举校验', () => {
    it.each(['活跃', '推进中', '放缓', '停滞', '已完成', '已搁置'])('status="%s" → 合法', (status) => {
      const issues = validateItemInvariants({ status, title: 'x' });
      expect(issues.some(i => i.code === 'ITEM_INVALID_STATUS')).toBe(false);
    });

    it('status="无效状态" → blocking', () => {
      const issues = validateItemInvariants({ status: '无效状态', title: 'x' });
      expect(issues.some(i => i.code === 'ITEM_INVALID_STATUS' && i.severity === 'blocking')).toBe(true);
    });
  });

  // ── 规则 4: 已搁置/已完成不可修改 title/status ──
  describe('规则4: 终态不可修改核心字段', () => {
    it('已搁置项修改 title → blocking', () => {
      const issues = validateItemInvariants(
        { title: 'new', _existingStatus: '已搁置', _existingTitle: 'old' },
        { isUpdate: true }
      );
      expect(issues.some(i => i.code === 'ITEM_ARCHIVED_IMMUTABLE' && i.severity === 'blocking')).toBe(true);
    });

    it('已完成项修改 status → blocking', () => {
      const issues = validateItemInvariants(
        { status: '活跃', _existingStatus: '已完成', _existingTitle: 'old' },
        { isUpdate: true }
      );
      expect(issues.some(i => i.code === 'ITEM_ARCHIVED_IMMUTABLE')).toBe(true);
    });

    it('非终态修改 title → 合法', () => {
      const issues = validateItemInvariants(
        { title: 'new', _existingStatus: '活跃', _existingTitle: 'old' },
        { isUpdate: true }
      );
      expect(issues.some(i => i.code === 'ITEM_ARCHIVED_IMMUTABLE')).toBe(false);
    });

    it('创建时 → 不检查终态', () => {
      const issues = validateItemInvariants({ title: 'new', status: '已完成' }, { isCreate: true });
      expect(issues.some(i => i.code === 'ITEM_ARCHIVED_IMMUTABLE')).toBe(false);
    });
  });

  // ── 规则 5: ended_at 不能早于 started_at ──
  describe('规则5: 结束日期≥开始日期', () => {
    it('ended_at < started_at → warning', () => {
      const issues = validateItemInvariants({ started_at: '2026-05-01', ended_at: '2026-04-01', title: 'x' });
      expect(issues.some(i => i.code === 'ITEM_ENDED_BEFORE_STARTED' && i.severity === 'warning')).toBe(true);
    });

    it('ended_at >= started_at → 合法', () => {
      const issues = validateItemInvariants({ started_at: '2026-04-01', ended_at: '2026-05-01', title: 'x' });
      expect(issues.some(i => i.code === 'ITEM_ENDED_BEFORE_STARTED')).toBe(false);
    });
  });

  // ── 规则 6: description 不超过 2000 字符 ──
  describe('规则6: description 不超过2000字符', () => {
    it('description=2000 字符 → 合法', () => {
      const issues = validateItemInvariants({ description: 'a'.repeat(2000), title: 'x' });
      expect(issues.some(i => i.code === 'ITEM_DESCRIPTION_TOO_LONG')).toBe(false);
    });

    it('description=2001 字符 → warning', () => {
      const issues = validateItemInvariants({ description: 'a'.repeat(2001), title: 'x' });
      expect(issues.some(i => i.code === 'ITEM_DESCRIPTION_TOO_LONG' && i.severity === 'warning')).toBe(true);
    });
  });

  // ── 规则 7: color 必须是合法 hex ──
  describe('规则7: color 合法 hex 校验', () => {
    it('color="#ff5733" → 合法', () => {
      const issues = validateItemInvariants({ color: '#ff5733', title: 'x' });
      expect(issues.some(i => i.code === 'ITEM_COLOR_INVALID')).toBe(false);
    });

    it('color="#FFF" → 合法（3位缩写）', () => {
      const issues = validateItemInvariants({ color: '#FFF', title: 'x' });
      expect(issues.some(i => i.code === 'ITEM_COLOR_INVALID')).toBe(false);
    });

    it('color="red" → warning', () => {
      const issues = validateItemInvariants({ color: 'red', title: 'x' });
      expect(issues.some(i => i.code === 'ITEM_COLOR_INVALID' && i.severity === 'warning')).toBe(true);
    });

    it('color="#XYZ123" → warning', () => {
      const issues = validateItemInvariants({ color: '#XYZ123', title: 'x' });
      expect(issues.some(i => i.code === 'ITEM_COLOR_INVALID')).toBe(true);
    });
  });
});
