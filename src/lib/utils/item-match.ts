/**
 * item-match.ts
 * 智能事项匹配引擎
 *
 * 三层匹配策略：
 * 1. AI hint 精确/包含匹配 + 核心关键词验证 → 高置信度（自动归类）
 * 2. AI hint 匹配但无关键词验证 → 中等置信度（弹框确认）
 * 3. 无 AI hint 时，用输入文本中的字母数字关键词扫描事项列表 → 中等置信度（弹框确认）
 *
 * 核心关键词提取避免单字误匹配：
 * - "teto开发" → ["teto", "开发"]  → "teto项目开发" 包含 "teto" → 匹配
 * - "吃早饭" → ["吃早饭", "吃早", "早饭"] → "早上问好" 不含任何 → 不匹配
 */

export interface ItemMatchResult {
  itemId: string;
  itemTitle: string;
  subItemId?: string;
  subItemTitle?: string;
  confidence: 'high' | 'medium';
  matchType: string;
  /** 匹配解释文本，说明为什么匹配成功 */
  explain?: string;
}

import { genBehaviorId, genDecisionId } from '@/lib/observability/id-registry';
import { logItemMatch } from '@/lib/observability/decision-logger';

/**
 * Levenshtein 编辑距离
 * 用于模糊匹配，如 "tetc" → "teto"（编辑距离 1）
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * 从事项标题中提取核心关键词，用于验证输入文本是否与事项相关
 *
 * 规则：
 * - 字母数字序列 >= 2字符：如 "teto", "AI", "GPT4"
 * - 中文序列 >= 2字符：如 "开发", "英语", "编程"
 * - 中文序列 >= 3字符时，额外提取 2字符滑窗：如 "吃早饭" → ["吃早饭", "吃早", "早饭"]
 * - 避免 1字符关键词（如 "早"）防止误匹配
 */
export function extractCoreKeywords(title: string): string[] {
  const keywords: string[] = [];

  // 提取字母数字序列（英文单词、缩写、数字）
  const alphaMatches = title.match(/[a-zA-Z0-9]+/g);
  if (alphaMatches) {
    keywords.push(...alphaMatches.filter(w => w.length >= 2));
  }

  // 提取中文字符序列
  const chineseSeqs = title.match(/[\u4e00-\u9fa5]+/g) || [];
  for (const seq of chineseSeqs) {
    if (seq.length >= 2) {
      keywords.push(seq);
    }
    // 长中文序列额外提取 2字符滑窗，覆盖子词匹配
    if (seq.length >= 3) {
      for (let i = 0; i <= seq.length - 2; i++) {
        const sub = seq.substring(i, i + 2);
        if (!keywords.includes(sub)) {
          keywords.push(sub);
        }
      }
    }
  }

  // 兜底：如果没提取到任何关键词，且标题 >= 2字符，用整个标题
  if (keywords.length === 0 && title.length >= 2) {
    keywords.push(title);
  }

  return keywords;
}

/**
 * 智能事项匹配（含子项匹配）
 *
 * @param hint     AI 返回的 item_hint（通常是事项标题）
 * @param items    用户的事项列表 [{id, title}]
 * @param inputText 用户原始输入文本
 * @param subItems 用户的子项列表 [{id, title, item_id}]，可选
 * @returns 匹配结果，null 表示无匹配
 */
export function matchItemSmart(
  hint: string,
  items: Array<{ id: string; title: string }>,
  inputText: string,
  subItems?: Array<{ id: string; title: string; item_id: string }>
): ItemMatchResult | null {
  genBehaviorId('B-060'); // matchItemSmart 入口追踪
  if (items.length === 0) return null;

  const hintLower = hint.trim().toLowerCase();
  const inputLower = inputText.toLowerCase();

  // ═══════════════════════════════════════════════════════
  // 辅助：尝试子项匹配
  // ═══════════════════════════════════════════════════════
  function tryMatchSubItem(
    base: Omit<ItemMatchResult, 'subItemId' | 'subItemTitle' | 'explain'>
  ): ItemMatchResult {
    let subMatch: { id: string; title: string; item_id: string } | null = null;
    let subMatchType = '';

    if (hintLower && subItems && subItems.length > 0) {
      const candidateSubs = subItems.filter(si => si.item_id === base.itemId);

      // 精确匹配子项标题
      const exactSub = candidateSubs.find(si => si.title.toLowerCase() === hintLower);
      if (exactSub) {
        subMatch = exactSub;
        subMatchType = 'sub_exact';
      }

      // 包含匹配：hint 包含子项标题
      if (!subMatch) {
        const hintContainsSub = candidateSubs.find(si => {
          const t = si.title.toLowerCase();
          return t.length >= 2 && hintLower.includes(t);
        });
        if (hintContainsSub) {
          subMatch = hintContainsSub;
          subMatchType = 'sub_hint_contains';
        }
      }

      // 包含匹配：子项标题包含 hint
      if (!subMatch) {
        const subContainsHint = candidateSubs.find(si => {
          const t = si.title.toLowerCase();
          return hintLower.length >= 2 && t.includes(hintLower);
        });
        if (subContainsHint) {
          subMatch = subContainsHint;
          subMatchType = 'sub_title_contains';
        }
      }
    }

    const explainParts: string[] = [];
    explainParts.push(`事项「${base.itemTitle}」匹配方式: ${base.matchType}`);
    if (subMatch) {
      explainParts.push(`子项「${subMatch.title}」匹配方式: ${subMatchType}`);
    }
    if (base.confidence === 'medium') {
      explainParts.push('(中等置信度，建议用户确认)');
    }

    return {
      ...base,
      subItemId: subMatch?.id,
      subItemTitle: subMatch?.title,
      matchType: subMatch ? `${base.matchType}→${subMatchType}` : base.matchType,
      explain: explainParts.join('；'),
    };
  }

  // ==============================
  // Phase 1: 基于 AI hint 的匹配（hint 非空时执行）
  // ==============================

  if (hintLower) {
    let matched: { id: string; title: string; matchType: string } | null = null;

    // 1a. 精确匹配（忽略大小写）
    const exactMatch = items.find(i => i.title.toLowerCase() === hintLower);
    if (exactMatch) {
      matched = { id: exactMatch.id, title: exactMatch.title, matchType: 'exact' };
      genDecisionId('ITEM_MATCH');
    }

    // 1b. 包含匹配：hint 包含事项标题（AI 返回了更具体的名称）
    if (!matched) {
      const hintContains = items.find(i => {
        const t = i.title.toLowerCase();
        return t.length >= 2 && hintLower.includes(t);
      });
      if (hintContains) {
        matched = { id: hintContains.id, title: hintContains.title, matchType: 'hint_contains_title' };
        genDecisionId('ITEM_MATCH');
      }
    }

    // 1c. 包含匹配：事项标题包含 hint（AI 返回了部分名称）
    if (!matched) {
      const titleContains = items.find(i => {
        const t = i.title.toLowerCase();
        return hintLower.length >= 2 && t.includes(hintLower);
      });
      if (titleContains) {
        matched = { id: titleContains.id, title: titleContains.title, matchType: 'title_contains_hint' };
        genDecisionId('ITEM_MATCH');
      }
    }

    // 1d. 模糊匹配：Levenshtein 编辑距离 <= 1（如 "tetc" → "teto"）
    if (!matched && hintLower.length >= 3) {
      let bestFuzzy: { id: string; title: string; dist: number } | null = null;
      for (const item of items) {
        const itemKeywords = (item.title.match(/[a-zA-Z0-9]+/g) || []).filter(w => w.length >= 2);
        for (const kw of itemKeywords) {
          const kwLower = kw.toLowerCase();
          // 编辑距离比较：hint 与关键词，或关键词与 hint
          if (Math.abs(kwLower.length - hintLower.length) <= 1) {
            const dist = levenshteinDistance(hintLower, kwLower);
            if (dist === 1 && (!bestFuzzy || dist < bestFuzzy.dist)) {
              bestFuzzy = { id: item.id, title: item.title, dist };
            }
          }
        }
      }
      if (bestFuzzy) {
        matched = { id: bestFuzzy.id, title: bestFuzzy.title, matchType: 'fuzzy_levenshtein' };
        genDecisionId('ITEM_MATCH');
      }
    }

    if (matched) {
      // 核心关键词验证：检查事项标题的核心关键词是否出现在输入文本中
      const coreKeywords = extractCoreKeywords(matched.title);
      const hasKeywordInInput = coreKeywords.some(kw => inputLower.includes(kw.toLowerCase()));

      if (hasKeywordInInput) {
        return tryMatchSubItem({
          itemId: matched.id,
          itemTitle: matched.title,
          confidence: 'high',
          matchType: matched.matchType,
        });
      }

      // AI 匹配了事项但输入中找不到核心关键词 → 中等置信度，需确认
      return tryMatchSubItem({
        itemId: matched.id,
        itemTitle: matched.title,
        confidence: 'medium',
        matchType: matched.matchType,
      });
    }
  } // end if (hintLower)

  // ==============================
  // Phase 2: 无 AI hint 匹配时的回退扫描
  // ==============================
  // 仅扫描字母数字关键词（中文关键词无 AI 指引时误匹配风险高）
  const candidateItems: Array<{ id: string; title: string; keyword: string }> = [];

  for (const item of items) {
    const alphaKeywords = (item.title.match(/[a-zA-Z0-9]+/g) || []).filter(w => w.length >= 2);
    for (const kw of alphaKeywords) {
      if (inputLower.includes(kw.toLowerCase())) {
        candidateItems.push({ id: item.id, title: item.title, keyword: kw });
      }
    }
  }

  // 只有唯一匹配时才建议（避免多个候选造成歧义）
  if (candidateItems.length === 1) {
    genDecisionId('ITEM_MATCH');
    return tryMatchSubItem({
      itemId: candidateItems[0].id,
      itemTitle: candidateItems[0].title,
      confidence: 'medium',
      matchType: `fallback_keyword:${candidateItems[0].keyword}`,
    });
  }

  // Phase 2b: 回退模糊匹配 — 输入文本中的英文词与事项关键词编辑距离 <= 1
  if (candidateItems.length === 0) {
    const inputWords = (inputLower.match(/[a-zA-Z0-9]+/g) || []).filter(w => w.length >= 3);
    const fuzzyCandidates: Array<{ id: string; title: string; keyword: string }> = [];
    for (const item of items) {
      const itemKeywords = (item.title.match(/[a-zA-Z0-9]+/g) || []).filter(w => w.length >= 2);
      for (const kw of itemKeywords) {
        const kwLower = kw.toLowerCase();
        for (const word of inputWords) {
          if (Math.abs(word.length - kwLower.length) <= 1 && levenshteinDistance(word, kwLower) <= 1) {
            fuzzyCandidates.push({ id: item.id, title: item.title, keyword: kw });
          }
        }
      }
    }
    if (fuzzyCandidates.length === 1) {
      genDecisionId('ITEM_MATCH');
      return tryMatchSubItem({
        itemId: fuzzyCandidates[0].id,
        itemTitle: fuzzyCandidates[0].title,
        confidence: 'medium',
        matchType: `fallback_fuzzy:${fuzzyCandidates[0].keyword}`,
      });
    }
  }

  return null;
}
