import type { Item, Tag } from '@/types/teto';

export interface TagSuggestResult {
  tag: Tag;
  score: number;
}

export interface ItemSuggestResult {
  item: Item;
  score: number;
}

/** 从输入文本提取可用于匹配的 token（2 字及以上） */
export function extractMatchTokens(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const tokens = new Set<string>();
  const parts = trimmed.split(/[\s,，、；;。.!！?？]+/).filter(Boolean);
  for (const p of parts) {
    if (p.length >= 2) tokens.add(p.toLowerCase());
  }
  if (trimmed.length >= 2) tokens.add(trimmed.toLowerCase());
  return [...tokens];
}

export function suggestTags(text: string, tags: Tag[], limit = 6): TagSuggestResult[] {
  const tokens = extractMatchTokens(text);
  if (tokens.length === 0) return [];

  const scored: TagSuggestResult[] = [];
  for (const tag of tags) {
    const name = tag.name.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (name === token) score += 10;
      else if (name.includes(token) || token.includes(name)) score += 5;
    }
    if (score > 0) scored.push({ tag, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function suggestItems(text: string, items: Item[], limit = 4): ItemSuggestResult[] {
  const tokens = extractMatchTokens(text);
  if (tokens.length === 0) return [];

  const scored: ItemSuggestResult[] = [];
  for (const item of items) {
    const title = item.title.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (title === token) score += 10;
      else if (title.includes(token) || token.includes(title)) score += 5;
    }
    if (score > 0) scored.push({ item, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
