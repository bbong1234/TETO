/** 时间线：事项标签整块（一级/二级/三级） */
export const TIMELINE_ITEM_TAG_BLOCK =
  'rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-800 ring-1 ring-inset ring-indigo-100';

/** 时间线：动作标签 */
export const TIMELINE_ACTION_TAG_BLOCK =
  'rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-inset ring-amber-100';

export function splitTimelineTagPath(tagPath: string): string[] {
  return tagPath
    .split('-')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function formatTimelineItemTagPath(parts: string[]): string {
  return parts.join('/');
}
