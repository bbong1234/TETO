/**
 * design/loader.ts — TETO 1.6 设计令牌加载器
 *
 * 从 tokens.json 读取所有设计变量，导出为 Tailwind CSS `extend` 兼容格式。
 * 所有 UI 组件必须通过 loader 引用令牌值，禁止硬编码颜色/间距/字号等。
 *
 * 使用方式：
 *   import { tailwindExtend } from '@/design/loader';
 *   // tailwind.config.cjs 中：module.exports = { theme: { extend: tailwindExtend } };
 */

import tokens from './tokens.json';

/** 将 JSON tokens 转换为 Tailwind extend 格式 */
export function tailwindExtend(): Record<string, unknown> {
  return {
    colors: {
      // 语义颜色（直接使用 tokens 中的 hex 值）
      'teto-active': tokens.color.status.active,
      'teto-progressing': tokens.color.status.progressing,
      'teto-slowing': tokens.color.status.slowing,
      'teto-stagnant': tokens.color.status.stagnant,
      'teto-completed': tokens.color.status.completed,
      'teto-shelved': tokens.color.status.shelved,

      'teto-confidence-high': tokens.color.confidence.high,
      'teto-confidence-medium': tokens.color.confidence.medium,
      'teto-confidence-low': tokens.color.confidence.low,

      'teto-trust-trusted': tokens.color.trust.trusted,
      'teto-trust-reviewed': tokens.color.trust.reviewed,
      'teto-trust-unchecked': tokens.color.trust.unchecked,
      'teto-trust-disputed': tokens.color.trust.disputed,

      'teto-semantic-success': tokens.color.semantic.success,
      'teto-semantic-warning': tokens.color.semantic.warning,
      'teto-semantic-error': tokens.color.semantic.error,
      'teto-semantic-info': tokens.color.semantic.info,

      'teto-neutral': tokens.color.neutral,
    },

    fontFamily: {
      'teto-sans': tokens.font.family.sans.split(', ').map(f => f.replace(/^'|'$/g, '')),
      'teto-mono': tokens.font.family.mono.split(', ').map(f => f.replace(/^'|'$/g, '')),
    },

    fontSize: {
      'teto-xs': tokens.font.size.xs,
      'teto-sm': tokens.font.size.sm,
      'teto-base': tokens.font.size.base,
      'teto-lg': tokens.font.size.lg,
      'teto-xl': tokens.font.size.xl,
      'teto-2xl': tokens.font.size['2xl'],
      'teto-3xl': tokens.font.size['3xl'],
    },

    fontWeight: {
      'teto-normal': tokens.font.weight.normal,
      'teto-medium': tokens.font.weight.medium,
      'teto-semibold': tokens.font.weight.semibold,
      'teto-bold': tokens.font.weight.bold,
    },

    spacing: {
      'teto-1': tokens.spacing['1'],
      'teto-2': tokens.spacing['2'],
      'teto-3': tokens.spacing['3'],
      'teto-4': tokens.spacing['4'],
      'teto-6': tokens.spacing['6'],
      'teto-8': tokens.spacing['8'],
      'teto-12': tokens.spacing['12'],
      'teto-16': tokens.spacing['16'],
    },

    borderRadius: {
      'teto-sm': tokens.radius.sm,
      'teto-md': tokens.radius.md,
      'teto-lg': tokens.radius.lg,
      'teto-xl': tokens.radius.xl,
      'teto-full': tokens.radius.full,
    },

    boxShadow: {
      'teto-sm': tokens.shadow.sm,
      'teto-md': tokens.shadow.md,
      'teto-lg': tokens.shadow.lg,
    },

    opacity: {
      'teto-disabled': tokens.opacity.disabled,
      'teto-hover': tokens.opacity.hover,
      'teto-muted': tokens.opacity.muted,
    },

    transitionDuration: {
      'teto-fast': tokens.motion.duration.fast,
      'teto-normal': tokens.motion.duration.normal,
      'teto-slow': tokens.motion.duration.slow,
    },

    transitionTimingFunction: {
      'teto-default': tokens.motion.easing.default,
      'teto-in': tokens.motion.easing.in,
      'teto-out': tokens.motion.easing.out,
    },

    zIndex: {
      'teto-base': tokens.zIndex.base,
      'teto-dropdown': tokens.zIndex.dropdown,
      'teto-sticky': tokens.zIndex.sticky,
      'teto-overlay': tokens.zIndex.overlay,
      'teto-modal': tokens.zIndex.modal,
      'teto-toast': tokens.zIndex.toast,
      'teto-tooltip': tokens.zIndex.tooltip,
    },

    screens: {
      'teto-sm': tokens.breakpoint.sm,
      'teto-md': tokens.breakpoint.md,
      'teto-lg': tokens.breakpoint.lg,
      'teto-xl': tokens.breakpoint.xl,
      'teto-2xl': tokens.breakpoint['2xl'],
    },
  };
}

/** 获取单个令牌值（便捷访问） */
export function token(path: string): string | undefined {
  const parts = path.split('.');
  let current: unknown = tokens;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

/** 直接导出 tokens 对象供运行时使用 */
export { tokens };
