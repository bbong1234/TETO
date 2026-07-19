/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
  buildEditableSegments,
  diffLinkTexts,
  exitLinkOnTrailingDoubleSpace,
  insertPlainTextAfterLink,
  parseEditableRoot,
  populateEditableRoot,
} from '@/lib/activity/diary-editable-serialize';
import type { DiaryLinkSpan } from '@/lib/activity/diary-document';

function makeLink(id: string, recordId: string, start: number, end: number): DiaryLinkSpan {
  return { id, recordId, start, end };
}

describe('diary-editable-serialize', () => {
  it('buildEditableSegments mirrors body segments', () => {
    const body = '打发外热同法国法人的该法人';
    const links = [makeLink('l1', 'rec-1', 5, 9)];
    const segments = buildEditableSegments(body, links);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toMatchObject({ type: 'plain', text: '打发外热同' });
    expect(segments[1]).toMatchObject({ type: 'link', text: '法国法人' });
    expect(segments[2]).toMatchObject({ type: 'plain', text: '的该法人' });
  });

  it('parseEditableRoot round-trips mixed plain and link spans', () => {
    const body = '早上吃了汤包，中午吃了黄焖鸡，晚上没吃。';
    const links = [
      makeLink('l1', 'rec-1', 0, 6),
      makeLink('l2', 'rec-2', 7, 14),
    ];
    const root = document.createElement('div');
    populateEditableRoot(root, body, links);

    const parsed = parseEditableRoot(root, links);
    expect(parsed.body).toBe(body);
    expect(parsed.links).toHaveLength(2);
    expect(parsed.linkTexts.get('l1')).toBe('早上吃了汤包');
    expect(parsed.linkTexts.get('l2')).toBe('中午吃了黄焖鸡');
  });

  it('detects link text changes separately from plain text', () => {
    const links = [makeLink('l1', 'rec-1', 5, 9)];
    const root = document.createElement('div');
    populateEditableRoot(root, '打发外热同法国法人的该法人', links);

    const before = parseEditableRoot(root, links);
    root.childNodes[0].textContent = '打发外热同X';
    const afterPlain = parseEditableRoot(root, links);
    expect(diffLinkTexts(before.linkTexts, afterPlain.linkTexts)).toEqual([]);

    const linkSpan = root.querySelector('[data-diary-link-id]');
    if (linkSpan) linkSpan.textContent = '法国企业';
    const afterLink = parseEditableRoot(root, links);
    expect(diffLinkTexts(before.linkTexts, afterLink.linkTexts)).toEqual(['l1']);
    expect(afterLink.linkTexts.get('l1')).toBe('法国企业');
  });

  it('recomputes offsets after link span edit', () => {
    const links = [makeLink('l1', 'rec-1', 0, 4)];
    const root = document.createElement('div');
    populateEditableRoot(root, '法国法人后续', links);
    const span = root.querySelector('[data-diary-link-id]');
    if (span) span.textContent = '法国法人集团';
    const parsed = parseEditableRoot(root, links);
    expect(parsed.body).toBe('法国法人集团后续');
    expect(parsed.links[0]).toMatchObject({ start: 0, end: 6 });
  });

  it('insertPlainTextAfterLink appends plain text outside link span', () => {
    const links = [makeLink('l1', 'rec-1', 0, 4)];
    const root = document.createElement('div');
    populateEditableRoot(root, '法国法人', links);
    const span = root.querySelector('[data-diary-link-id]') as HTMLElement;
    const selection = window.getSelection()!;
    insertPlainTextAfterLink(span, '  ', selection);
    const parsed = parseEditableRoot(root, links);
    expect(parsed.body).toBe('法国法人  ');
    expect(parsed.links[0]).toMatchObject({ start: 0, end: 4 });
  });

  it('exitLinkOnTrailingDoubleSpace consumes spaces and keeps following plain text adjacent', () => {
    const links = [makeLink('l1', 'rec-1', 0, 5)];
    const root = document.createElement('div');
    document.body.appendChild(root);
    populateEditableRoot(root, '的法地方的', links);
    const span = root.querySelector('[data-diary-link-id]') as HTMLElement;
    span.textContent = '的法地方的  ';

    const range = document.createRange();
    range.setStart(span.firstChild!, span.textContent!.length);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const result = exitLinkOnTrailingDoubleSpace(root, selection);
    expect(result.exited).toBe(true);
    expect(result.trimmedText).toBe('的法地方的');
    expect(span.textContent).toBe('的法地方的');
    expect(span.previousSibling?.textContent).toBe(' ');
    expect(span.nextSibling?.textContent).toBe(' ');

    const plain = document.createTextNode('法的份额为');
    span.parentNode?.insertBefore(plain, span.nextSibling?.nextSibling ?? null);

    const parsed = parseEditableRoot(root, links);
    expect(parsed.body).toBe(' 的法地方的 法的份额为');
    expect(parsed.linkTexts.get('l1')).toBe('的法地方的');
    expect(parsed.body.slice(parsed.links[0].start, parsed.links[0].end)).toBe('的法地方的');

    root.remove();
  });
});
