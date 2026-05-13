/**
 * tag-invariants 测试 — 3 条规则（名称校验）
 */
import { describe, it, expect } from 'vitest';
import { validateTagInvariants } from '../tag-invariants';

describe('validateTagInvariants', () => {
  // ── 规则 1: 名称不能为空 ──
  describe('规则1: 名称不能为空', () => {
    it('无 name → blocking', () => {
      const issues = validateTagInvariants({});
      expect(issues.some(i => i.code === 'TAG_NAME_REQUIRED' && i.severity === 'blocking')).toBe(true);
    });

    it('name="" → blocking', () => {
      const issues = validateTagInvariants({ name: '' });
      expect(issues.some(i => i.code === 'TAG_NAME_REQUIRED')).toBe(true);
    });

    it('name="  " → blocking', () => {
      const issues = validateTagInvariants({ name: '  ' });
      expect(issues.some(i => i.code === 'TAG_NAME_REQUIRED')).toBe(true);
    });

    it('name="标签1" → 合法', () => {
      const issues = validateTagInvariants({ name: '标签1' });
      expect(issues.some(i => i.code === 'TAG_NAME_REQUIRED')).toBe(false);
    });
  });

  // ── 规则 2: 名称长度不能超过 100 字符 ──
  describe('规则2: 名称不超过100字符', () => {
    it('name=100 字符 → 合法', () => {
      const issues = validateTagInvariants({ name: 'a'.repeat(100) });
      expect(issues.some(i => i.code === 'TAG_NAME_TOO_LONG')).toBe(false);
    });

    it('name=101 字符 → warning', () => {
      const issues = validateTagInvariants({ name: 'a'.repeat(101) });
      expect(issues.some(i => i.code === 'TAG_NAME_TOO_LONG' && i.severity === 'warning')).toBe(true);
    });
  });

  // ── 规则 3: type 必须合法 ──
  describe('规则3: type 枚举校验', () => {
    it.each(['content', 'emotion', 'location', 'person', 'custom', null])('type="%s" → 合法', (type) => {
      const issues = validateTagInvariants({ name: 'x', type });
      expect(issues.some(i => i.code === 'TAG_TYPE_INVALID')).toBe(false);
    });

    it('type="invalid" → warning', () => {
      const issues = validateTagInvariants({ name: 'x', type: 'invalid' });
      expect(issues.some(i => i.code === 'TAG_TYPE_INVALID' && i.severity === 'warning')).toBe(true);
    });

    it('type=undefined → 合法', () => {
      const issues = validateTagInvariants({ name: 'x' });
      expect(issues.some(i => i.code === 'TAG_TYPE_INVALID')).toBe(false);
    });
  });
});
