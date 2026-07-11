'use client';

/**
 * 内置词典种子：首次使用时写入基础关键词规则。
 * 规则仅在用户的事项列表中存在同名事项时生效（target_id 需在客户端查找）。
 * 无同名事项时仍写入规则（target_id = null），待事项创建后手动关联。
 */

export interface SeedRule {
  trigger_pattern: string;
  /** 期望匹配的事项标题（模糊匹配用户已有事项） */
  item_title_hint: string;
}

export const SEED_RULES: SeedRule[] = [
  { trigger_pattern: '早饭', item_title_hint: '吃饭' },
  { trigger_pattern: '早餐', item_title_hint: '吃饭' },
  { trigger_pattern: '吃早饭', item_title_hint: '吃饭' },
  { trigger_pattern: '午饭', item_title_hint: '吃饭' },
  { trigger_pattern: '午餐', item_title_hint: '吃饭' },
  { trigger_pattern: '晚饭', item_title_hint: '吃饭' },
  { trigger_pattern: '晚餐', item_title_hint: '吃饭' },
  { trigger_pattern: '开车', item_title_hint: '通勤' },
  { trigger_pattern: '地铁', item_title_hint: '通勤' },
  { trigger_pattern: '公交', item_title_hint: '通勤' },
  { trigger_pattern: '通勤', item_title_hint: '通勤' },
  { trigger_pattern: '跑步', item_title_hint: '运动' },
  { trigger_pattern: '健身', item_title_hint: '运动' },
  { trigger_pattern: '游泳', item_title_hint: '运动' },
  { trigger_pattern: '锻炼', item_title_hint: '运动' },
  { trigger_pattern: '睡觉', item_title_hint: '休息' },
  { trigger_pattern: '入睡', item_title_hint: '休息' },
  { trigger_pattern: '午休', item_title_hint: '休息' },
];

const SEED_INITIALIZED_KEY = 'teto_seed_rules_v1';

/** 同会话内防重入（React Strict Mode 双挂载） */
let seedInFlight = false;

function findItemForHint(
  items: Array<{ id: string; title: string }>,
  hint: string
): { id: string; title: string } | undefined {
  const lower = hint.toLowerCase();
  return items.find(
    (i) =>
      i.title.toLowerCase().includes(lower) ||
      lower.includes(i.title.toLowerCase())
  );
}

/**
 * 在客户端检查并写入词典种子（幂等，每设备只执行一次）。
 * 延迟 + 串行写入，避免首屏 bootstrap 并发打爆 Supabase。
 */
export function initSeedRulesOnce(
  items: Array<{ id: string; title: string }>
): void {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(SEED_INITIALIZED_KEY) || seedInFlight) return;

  seedInFlight = true;
  // 乐观标记，防止 Strict Mode 双挂载或快速刷新重复触发
  localStorage.setItem(SEED_INITIALIZED_KEY, '1');

  const run = async () => {
    // 等首屏 bootstrap 完成后再写种子规则
    await new Promise((r) => setTimeout(r, 2500));

    for (const seed of SEED_RULES) {
      const matchedItem = findItemForHint(items, seed.item_title_hint);
      try {
        await fetch('/api/v2/user-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rule_type: 'item_mapping',
            trigger_pattern: seed.trigger_pattern,
            target_id: matchedItem?.id ?? null,
            target_type: matchedItem ? 'item' : null,
            source: 'preset',
            confidence: 'high',
            is_active: true,
          }),
        });
      } catch {
        /* 单条失败不阻断 */
      }
      // 小间隔，避免连接池瞬时打满
      await new Promise((r) => setTimeout(r, 80));
    }
  };

  void run().finally(() => {
    seedInFlight = false;
  });
}
