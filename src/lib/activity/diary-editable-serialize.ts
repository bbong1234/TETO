import type { DiaryLinkSpan } from '@/lib/activity/diary-document';
import { buildBodySegments } from '@/lib/activity/diary-link-matcher';

export type EditableSegment =
  | { type: 'plain'; text: string }
  | { type: 'link'; text: string; link: DiaryLinkSpan };

export interface ParsedEditableRoot {
  body: string;
  links: DiaryLinkSpan[];
  linkTexts: Map<string, string>;
}

export function buildEditableSegments(body: string, links: DiaryLinkSpan[]): EditableSegment[] {
  return buildBodySegments(body, links);
}

function walkEditableNode(
  node: Node,
  knownLinks: Map<string, DiaryLinkSpan>,
  state: { body: string; links: DiaryLinkSpan[]; linkTexts: Map<string, string> }
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    state.body += node.textContent ?? '';
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as HTMLElement;
  const linkId = element.getAttribute('data-diary-link-id');
  if (linkId && element.hasAttribute('data-diary-record-id')) {
    const known = knownLinks.get(linkId);
    const recordId = element.getAttribute('data-diary-record-id') ?? known?.recordId ?? '';
    const text = element.textContent ?? '';
    const start = state.body.length;
    state.body += text;
    const end = state.body.length;
    const link: DiaryLinkSpan = {
      id: linkId,
      recordId,
      start,
      end,
    };
    state.links.push(link);
    state.linkTexts.set(linkId, text);
    return;
  }

  if (element.tagName === 'BR') {
    state.body += '\n';
    return;
  }

  for (const child of element.childNodes) {
    walkEditableNode(child, knownLinks, state);
  }
}

export function parseEditableRoot(
  root: HTMLElement | null,
  knownLinks: DiaryLinkSpan[] = []
): ParsedEditableRoot {
  const known = new Map(knownLinks.map((link) => [link.id, link]));
  const state = {
    body: '',
    links: [] as DiaryLinkSpan[],
    linkTexts: new Map<string, string>(),
  };

  if (root) {
    for (const child of root.childNodes) {
      walkEditableNode(child, known, state);
    }
  }

  return {
    body: state.body,
    links: state.links.sort((a, b) => a.start - b.start),
    linkTexts: state.linkTexts,
  };
}

function findLinkElement(node: Node | null, root: HTMLElement): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as HTMLElement;
      if (element.hasAttribute('data-diary-link-id')) {
        return element;
      }
    }
    current = current.parentNode;
  }
  return null;
}

export function getActiveLinkFromSelection(
  root: HTMLElement | null
): { linkId: string; recordId: string } | null {
  if (!root || typeof window === 'undefined') return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const anchor = selection.anchorNode;
  if (!anchor || !root.contains(anchor)) return null;

  const element = findLinkElement(anchor, root);
  if (!element) return null;

  const linkId = element.getAttribute('data-diary-link-id');
  const recordId = element.getAttribute('data-diary-record-id');
  if (!linkId || !recordId) return null;
  return { linkId, recordId };
}

export function populateEditableRoot(
  root: HTMLElement,
  body: string,
  links: DiaryLinkSpan[],
  focusedRecordId?: string | null
): void {
  root.innerHTML = '';
  const segments = buildEditableSegments(body, links);

  if (segments.length === 0 && !body) {
    return;
  }

  for (const segment of segments) {
    if (segment.type === 'plain') {
      root.appendChild(document.createTextNode(segment.text));
      continue;
    }
    const span = document.createElement('span');
    span.setAttribute('data-diary-link-id', segment.link.id);
    span.setAttribute('data-diary-record-id', segment.link.recordId);
    span.className =
      focusedRecordId === segment.link.recordId
        ? 'diary-record-link diary-record-link--focused'
        : 'diary-record-link';
    span.textContent = segment.text;
    root.appendChild(span);
  }
}

export function isCursorAtEndOfLink(linkEl: HTMLElement, range: Range): boolean {
  if (!linkEl.contains(range.startContainer)) return false;
  const probe = range.cloneRange();
  probe.collapse(true);
  const endRange = document.createRange();
  endRange.selectNodeContents(linkEl);
  endRange.collapse(false);
  return probe.compareBoundaryPoints(Range.START_TO_START, endRange) === 0;
}

export function insertPlainTextAfterLink(
  linkEl: HTMLElement,
  text: string,
  selection: Selection
): Text | null {
  const parent = linkEl.parentNode;
  if (!parent) return null;

  let textNode: Text;
  const next = linkEl.nextSibling;
  if (next?.nodeType === Node.TEXT_NODE) {
    textNode = next as Text;
    textNode.textContent = (textNode.textContent ?? '') + text;
  } else {
    textNode = document.createTextNode(text);
    parent.insertBefore(textNode, linkEl.nextSibling);
  }

  const range = document.createRange();
  range.setStart(textNode, textNode.textContent?.length ?? 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return textNode;
}

export function ensurePlainSpaceBeforeLink(linkEl: HTMLElement): void {
  const parent = linkEl.parentNode;
  if (!parent) return;

  const prev = linkEl.previousSibling;
  if (prev?.nodeType === Node.TEXT_NODE) {
    const content = prev.textContent ?? '';
    if (!content.endsWith(' ')) {
      prev.textContent = content + ' ';
    }
    return;
  }

  parent.insertBefore(document.createTextNode(' '), linkEl);
}

export function ensurePlainSpaceAfterLink(linkEl: HTMLElement, selection: Selection): void {
  const next = linkEl.nextSibling;
  if (next?.nodeType === Node.TEXT_NODE) {
    const content = next.textContent ?? '';
    if (!content.startsWith(' ')) {
      next.textContent = ' ' + content;
    }
    const range = document.createRange();
    range.setStart(next, 1);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }

  insertPlainTextAfterLink(linkEl, ' ', selection);
}

function isSelectionInsideElement(element: HTMLElement, selection: Selection): boolean {
  if (selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  return element.contains(range.startContainer);
}

/** When cursor is inside a link and its text ends with "  ", consume exit gesture and leave one plain space after. */
export function exitLinkOnTrailingDoubleSpace(
  root: HTMLElement,
  selection: Selection | null
): { exited: boolean; linkId?: string; trimmedText?: string } {
  if (!selection || selection.rangeCount === 0) return { exited: false };

  const linkElements = root.querySelectorAll('[data-diary-link-id]');
  for (const node of linkElements) {
    const linkEl = node as HTMLElement;
    const linkId = linkEl.getAttribute('data-diary-link-id');
    if (!linkId) continue;

    const text = linkEl.textContent ?? '';
    if (!text.endsWith('  ')) continue;
    if (!isSelectionInsideElement(linkEl, selection)) continue;

    const trimmed = text.slice(0, -2);
    linkEl.textContent = trimmed;
    ensurePlainSpaceBeforeLink(linkEl);
    ensurePlainSpaceAfterLink(linkEl, selection);

    for (const span of root.querySelectorAll('[data-diary-link-id]')) {
      span.classList.remove('diary-record-link--focused');
    }

    return { exited: true, linkId, trimmedText: trimmed };
  }

  return { exited: false };
}

export function diffLinkTexts(
  previous: Map<string, string>,
  next: Map<string, string>
): string[] {
  const changed: string[] = [];
  for (const [linkId, text] of next) {
    if (previous.get(linkId) !== text) {
      changed.push(linkId);
    }
  }
  return changed;
}
