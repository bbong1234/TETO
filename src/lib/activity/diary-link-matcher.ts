import type { Record as TetoRecord } from '@/types/teto';
import { resolveRecordOriginalText } from '@/lib/activity/record-form';
import {
  createDiaryLinkId,
  getLinkedRecordIds,
  isLinkableRecord,
  normalizeLinkSurroundingSpaces,
  type DiaryDocument,
  type DiaryLinkSpan,
} from '@/lib/activity/diary-document';

const TIME_PREFIX_RE =
  /^((?:今天|昨天|明天|上午|下午|中午|晚上|凌晨|早间|午间|晚间)?\s*(?:\d{1,2}[:：]\d{2}|\d{1,2}点(?:\d{1,2}分?)?)?\s*)/;

const TIME_WORDS = new Set([
  '今天',
  '昨天',
  '明天',
  '早上',
  '上午',
  '中午',
  '下午',
  '晚上',
  '凌晨',
  '早间',
  '午间',
  '晚间',
]);

function extractTokens(text: string): string[] {
  const normalized = text.replace(/[，。！？、；：\s\d:：]+/g, ' ');
  const tokens: string[] = [];
  const han = normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  for (const token of han) {
    if (!TIME_WORDS.has(token)) tokens.push(token);
  }
  return tokens;
}

function stripTimePrefix(text: string): string {
  return text.replace(TIME_PREFIX_RE, '').trim();
}

function inferPeriodWord(record: TetoRecord): string {
  const clock = record.occurred_at?.slice(11, 16) ?? record.time_text ?? '';
  const [hStr] = clock.split(':');
  const hour = Number(hStr);
  if (!Number.isFinite(hour)) return '今天';
  if (hour < 6) return '凌晨';
  if (hour < 11) return '早上';
  if (hour < 13) return '中午';
  if (hour < 18) return '下午';
  return '晚上';
}

export function phraseForRecord(record: TetoRecord): string {
  const raw = stripTimePrefix(resolveRecordOriginalText(record));
  if (raw.length >= 2) return raw;
  const period = inferPeriodWord(record);
  const fallback = resolveRecordOriginalText(record) || record.content || '做了件事';
  return `${period}${stripTimePrefix(fallback) || '做了件事'}`;
}

function sortRecordsByTime(records: TetoRecord[]): TetoRecord[] {
  return [...records].sort((a, b) => {
    const ta = a.occurred_at ?? a.created_at ?? '';
    const tb = b.occurred_at ?? b.created_at ?? '';
    return ta.localeCompare(tb);
  });
}

function overlaps(a: DiaryLinkSpan, start: number, end: number): boolean {
  return a.start < end && a.end > start;
}

function overlapsAny(links: DiaryLinkSpan[], start: number, end: number): boolean {
  return links.some((link) => overlaps(link, start, end));
}

function findExactPhraseMatch(
  body: string,
  phrase: string,
  links: DiaryLinkSpan[]
): { start: number; end: number } | null {
  if (phrase.length < 2) return null;
  let idx = body.indexOf(phrase);
  while (idx !== -1) {
    const start = idx;
    const end = start + phrase.length;
    if (!overlapsAny(links, start, end)) {
      return { start, end };
    }
    idx = body.indexOf(phrase, idx + 1);
  }
  return null;
}

function findBestMatchInBody(body: string, record: TetoRecord, links: DiaryLinkSpan[]): { start: number; end: number } | null {
  const phrase = phraseForRecord(record);
  const exact = findExactPhraseMatch(body, phrase, links);
  if (exact) return exact;

  const recordTokens = extractTokens(resolveRecordOriginalText(record));
  if (recordTokens.length === 0) return null;

  let best: { start: number; end: number; score: number } | null = null;

  for (let i = 0; i < body.length; i++) {
    for (let j = i + 2; j <= body.length; j++) {
      const slice = body.slice(i, j);
      if (/^[，。！？、；：\s]+$/.test(slice)) continue;
      const sliceTokens = extractTokens(slice);
      if (sliceTokens.length === 0) continue;

      const overlap = recordTokens.filter((token) =>
        sliceTokens.some((st) => st.includes(token) || token.includes(st))
      ).length;
      if (overlap === 0) continue;

      const score = overlap * 1000 - slice.length;
      if (overlapsAny(links, i, j)) continue;
      if (!best || score > best.score) {
        best = { start: i, end: j, score };
      }
    }
  }

  return best ? { start: best.start, end: best.end } : null;
}

export function matchLinksInBody(
  body: string,
  records: TetoRecord[],
  existingLinks: DiaryLinkSpan[] = []
): DiaryLinkSpan[] {
  const links = [...existingLinks];
  const linked = getLinkedRecordIds(links);

  for (const record of records.filter(isLinkableRecord)) {
    if (linked.has(record.id)) continue;
    const match = findBestMatchInBody(body, record, links);
    if (!match) continue;
    links.push({
      id: createDiaryLinkId(),
      recordId: record.id,
      start: match.start,
      end: match.end,
    });
    linked.add(record.id);
  }

  return links.sort((a, b) => a.start - b.start);
}

export function importRecordsIntoDiary(
  doc: DiaryDocument,
  records: TetoRecord[]
): { document: DiaryDocument; added: number } {
  const linkable = sortRecordsByTime(records.filter(isLinkableRecord));
  const linked = getLinkedRecordIds(doc.links);
  const unlinked = linkable.filter((record) => !linked.has(record.id));

  if (unlinked.length === 0) {
    return { document: doc, added: 0 };
  }

  let body = doc.body;
  let links = [...doc.links];
  let added = 0;

  if (!body.trim()) {
    const phrases = unlinked.map((record) => phraseForRecord(record));
    body = phrases.join('，') + '。';
    let offset = 0;
    for (let i = 0; i < unlinked.length; i++) {
      const phrase = phrases[i];
      const start = offset;
      const end = start + phrase.length;
      links.push({
        id: createDiaryLinkId(),
        recordId: unlinked[i].id,
        start,
        end,
      });
      offset = end + (i < unlinked.length - 1 ? 1 : 0);
      added += 1;
    }
    const sortedLinks = links.sort((a, b) => a.start - b.start);
    const normalized = normalizeLinkSurroundingSpaces(body, sortedLinks);
    return {
      document: { ...doc, body: normalized.body, links: normalized.links },
      added,
    };
  }

  const beforeMatchCount = links.length;
  links = matchLinksInBody(body, unlinked, links);
  added += links.length - beforeMatchCount;
  linked.clear();
  for (const link of links) linked.add(link.recordId);

  const stillUnlinked = unlinked.filter((record) => !linked.has(record.id));
  for (const record of stillUnlinked) {
    const phrase = phraseForRecord(record);
    const prefix = body.length > 0 && !/[，。！？]$/.test(body.trim()) ? '，' : body.length > 0 ? '，' : '';
    const start = body.length + prefix.length;
    body = body + prefix + phrase;
    links.push({
      id: createDiaryLinkId(),
      recordId: record.id,
      start,
      end: start + phrase.length,
    });
    added += 1;
  }

  const sortedLinks = links.sort((a, b) => a.start - b.start);
  const normalized = normalizeLinkSurroundingSpaces(body, sortedLinks);
  return {
    document: { ...doc, body: normalized.body, links: normalized.links },
    added,
  };
}

export function buildBodySegments(
  body: string,
  links: DiaryLinkSpan[]
): Array<
  | { type: 'plain'; text: string }
  | { type: 'link'; text: string; link: DiaryLinkSpan }
> {
  const sorted = [...links].sort((a, b) => a.start - b.start);
  const segments: Array<
    | { type: 'plain'; text: string }
    | { type: 'link'; text: string; link: DiaryLinkSpan }
  > = [];
  let cursor = 0;

  for (const link of sorted) {
    if (link.start > cursor) {
      segments.push({ type: 'plain', text: body.slice(cursor, link.start) });
    }
    if (link.end > link.start) {
      segments.push({
        type: 'link',
        text: body.slice(link.start, link.end),
        link,
      });
    }
    cursor = Math.max(cursor, link.end);
  }

  if (cursor < body.length) {
    segments.push({ type: 'plain', text: body.slice(cursor) });
  }

  return segments;
}
