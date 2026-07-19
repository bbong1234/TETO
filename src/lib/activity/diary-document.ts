import type { Record as TetoRecord } from '@/types/teto';
import { resolveRecordOriginalText } from '@/lib/activity/record-form';
import { isDraftRecordId } from '@/lib/activity/record-day-summary';

/** @deprecated v2 block — kept for migration only */
export type DiaryTextBlock = {
  type: 'text';
  id: string;
  text: string;
};

/** @deprecated v2 block — kept for migration only */
export type DiaryRecordBlock = {
  type: 'record';
  id: string;
  recordId: string;
  text: string;
};

/** @deprecated v2 block — kept for migration only */
export type DiaryBlock = DiaryTextBlock | DiaryRecordBlock;

export interface DiaryLinkSpan {
  id: string;
  recordId: string;
  start: number;
  end: number;
}

export interface DiaryDocument {
  version: 3;
  body: string;
  links: DiaryLinkSpan[];
  contextNotes: string;
}

let idCounter = 0;

export function createDiaryLinkId(prefix = 'link'): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export function isLinkableRecord(record: TetoRecord): boolean {
  if (!record.id || record.id.startsWith('session:') || isDraftRecordId(record.id)) {
    return false;
  }
  return true;
}

function normalizeLinks(links: DiaryLinkSpan[], bodyLength: number): DiaryLinkSpan[] {
  return links
    .filter(
      (link) =>
        typeof link.recordId === 'string' &&
        typeof link.start === 'number' &&
        typeof link.end === 'number' &&
        link.start >= 0 &&
        link.end > link.start &&
        link.end <= bodyLength
    )
    .map((link) => ({
      id: link.id || createDiaryLinkId(),
      recordId: link.recordId,
      start: link.start,
      end: link.end,
    }))
    .sort((a, b) => a.start - b.start);
}

function migrateBlocksToV3(
  blocks: DiaryBlock[],
  contextNotes: string
): DiaryDocument {
  let body = '';
  const links: DiaryLinkSpan[] = [];

  for (const block of blocks) {
    if (block.type === 'text') {
      body += block.text;
      continue;
    }
    const start = body.length;
    body += block.text;
    links.push({
      id: block.id || createDiaryLinkId('record'),
      recordId: block.recordId,
      start,
      end: body.length,
    });
  }

  return {
    version: 3,
    body,
    links: normalizeLinks(links, body.length),
    contextNotes,
  };
}

export function parseDiaryDocument(raw: string | null | undefined): DiaryDocument {
  if (!raw?.trim()) {
    return { version: 3, body: '', links: [], contextNotes: '' };
  }

  try {
    const parsed = JSON.parse(raw) as {
      version?: number;
      body?: string;
      links?: DiaryLinkSpan[];
      blocks?: DiaryBlock[];
      diary?: string;
      contextNotes?: string;
    };

    if (parsed && typeof parsed === 'object') {
      const contextNotes = typeof parsed.contextNotes === 'string' ? parsed.contextNotes : '';

      if (parsed.version === 3 && typeof parsed.body === 'string') {
        return {
          version: 3,
          body: parsed.body,
          links: normalizeLinks(Array.isArray(parsed.links) ? parsed.links : [], parsed.body.length),
          contextNotes,
        };
      }

      if (parsed.version === 2 && Array.isArray(parsed.blocks)) {
        return migrateBlocksToV3(parsed.blocks, contextNotes);
      }

      if ('diary' in parsed && typeof parsed.diary === 'string') {
        return { version: 3, body: parsed.diary, links: [], contextNotes };
      }
    }
  } catch {
    /* legacy plain text */
  }

  return { version: 3, body: raw, links: [], contextNotes: '' };
}

export function serializeDiaryDocument(doc: DiaryDocument): string {
  return JSON.stringify({
    version: 3,
    body: doc.body,
    links: doc.links,
    contextNotes: doc.contextNotes,
  });
}

export function diaryDocumentToPlainText(doc: DiaryDocument): string {
  return doc.body;
}

export function getLinkedRecordIds(links: DiaryLinkSpan[]): Set<string> {
  return new Set(links.map((link) => link.recordId));
}

export function getLinkText(doc: DiaryDocument, link: DiaryLinkSpan): string {
  return doc.body.slice(link.start, link.end);
}

export function removeLinksForRecordIds(
  doc: DiaryDocument,
  recordIds: Set<string>
): DiaryDocument {
  return {
    ...doc,
    links: doc.links.filter((link) => !recordIds.has(link.recordId)),
  };
}

export function pruneLinksForMissingRecords(
  doc: DiaryDocument,
  records: TetoRecord[]
): DiaryDocument {
  const validIds = new Set(records.filter(isLinkableRecord).map((record) => record.id));
  return {
    ...doc,
    links: doc.links.filter((link) => validIds.has(link.recordId)),
  };
}

/** Apply a delta at [start, end) and shift links after the edit */
export function applyBodyEdit(
  doc: DiaryDocument,
  start: number,
  end: number,
  replacement: string
): DiaryDocument {
  const delta = replacement.length - (end - start);
  const body = doc.body.slice(0, start) + replacement + doc.body.slice(end);
  const links = doc.links
    .map((link) => {
      if (link.end <= start || link.start >= end) {
        if (link.start >= end) {
          return { ...link, start: link.start + delta, end: link.end + delta };
        }
        return link;
      }
      return null;
    })
    .filter((link): link is DiaryLinkSpan => link != null);
  return {
    ...doc,
    body,
    links: normalizeLinks(links, body.length),
  };
}

export function updateLinkText(
  doc: DiaryDocument,
  linkId: string,
  newText: string
): DiaryDocument | null {
  const link = doc.links.find((item) => item.id === linkId);
  if (!link) return null;
  const delta = newText.length - (link.end - link.start);
  const body = doc.body.slice(0, link.start) + newText + doc.body.slice(link.end);
  const links = doc.links
    .map((item) => {
      if (item.id === linkId) {
        return { ...item, end: item.start + newText.length };
      }
      if (item.start >= link.end) {
        return { ...item, start: item.start + delta, end: item.end + delta };
      }
      if (item.end <= link.start) {
        return item;
      }
      return null;
    })
    .filter((item): item is DiaryLinkSpan => item != null);
  return {
    ...doc,
    body,
    links: normalizeLinks(links, body.length),
  };
}

export function appendPlainText(doc: DiaryDocument, text: string): DiaryDocument {
  const trimmed = text.trim();
  if (!trimmed) return doc;
  const prefix = doc.body.trim() ? '，' : '';
  const insertion = prefix + trimmed;
  return {
    ...doc,
    body: doc.body + insertion,
  };
}

export function reconcileLinksAfterBodyEdit(
  doc: DiaryDocument,
  records: TetoRecord[]
): DiaryDocument {
  const validIds = new Set(records.filter(isLinkableRecord).map((record) => record.id));
  const links = doc.links.filter((link) => {
    if (!validIds.has(link.recordId)) return false;
    const slice = doc.body.slice(link.start, link.end);
    return slice.length > 0 && link.end <= doc.body.length;
  });
  return { ...doc, links: normalizeLinks(links, doc.body.length) };
}

/** Ensure each link span has one plain space before and after in body (not part of link text). */
export function normalizeLinkSurroundingSpaces(
  body: string,
  links: DiaryLinkSpan[]
): { body: string; links: DiaryLinkSpan[] } {
  if (links.length === 0) return { body, links };

  let nextBody = body;
  const nextLinks = links.map((link) => ({ ...link }));
  const order = [...nextLinks].sort((a, b) => b.start - a.start);

  for (const link of order) {
    const current = nextLinks.find((item) => item.id === link.id);
    if (!current) continue;

    if (current.end >= nextBody.length || nextBody[current.end] !== ' ') {
      nextBody = nextBody.slice(0, current.end) + ' ' + nextBody.slice(current.end);
      for (const other of nextLinks) {
        if (other.id === current.id) continue;
        if (other.start >= current.end) {
          other.start += 1;
          other.end += 1;
        }
      }
    }

    if (current.start === 0 || nextBody[current.start - 1] !== ' ') {
      nextBody = nextBody.slice(0, current.start) + ' ' + nextBody.slice(current.start);
      for (const other of nextLinks) {
        if (other.start >= current.start) {
          other.start += 1;
          other.end += 1;
        }
      }
    }
  }

  return {
    body: nextBody,
    links: normalizeLinks(nextLinks, nextBody.length),
  };
}

export function summarizeRecordsForChat(records: TetoRecord[]): string {
  return records
    .filter(isLinkableRecord)
    .map((record) => {
      const text = resolveRecordOriginalText(record);
      const time = record.occurred_at?.slice(11, 16) ?? record.time_text ?? '';
      return `- [${record.type}${time ? ` ${time}` : ''}] ${text || record.content}`;
    })
    .join('\n');
}
