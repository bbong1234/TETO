'use client';

import { useMemo } from 'react';
import type { Item, Tag } from '@/types/teto';
import { suggestItems, suggestTags } from '@/lib/activity/tag-suggest';
import { TAG_TYPE_LABELS, type TagType } from '@/types/teto';

interface InputSuggestChipsProps {
  text: string;
  tags: Tag[];
  items: Item[];
  selectedTagIds?: string[];
  onSelectTag?: (tag: Tag) => void;
  onSelectItem?: (item: Item) => void;
}

function tagTypeLabel(type: string | null | undefined): string {
  if (!type) return '';
  if (type in TAG_TYPE_LABELS) return TAG_TYPE_LABELS[type as TagType];
  return type;
}

export default function InputSuggestChips({
  text,
  tags,
  items,
  selectedTagIds = [],
  onSelectTag,
  onSelectItem,
}: InputSuggestChipsProps) {
  const tagSuggestions = useMemo(() => suggestTags(text, tags, 5), [text, tags]);
  const itemSuggestions = useMemo(() => suggestItems(text, items, 4), [text, items]);

  const visibleTags = tagSuggestions.filter((s) => !selectedTagIds.includes(s.tag.id));
  const hasSuggestions = visibleTags.length > 0 || itemSuggestions.length > 0;

  if (!hasSuggestions || text.trim().length < 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] text-slate-400 shrink-0">匹配</span>
      {visibleTags.map(({ tag }) => (
        <button
          key={tag.id}
          type="button"
          onClick={() => onSelectTag?.(tag)}
          className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100"
        >
          {tag.name}
          {tag.type && (
            <span className="ml-1 text-[9px] text-blue-400">{tagTypeLabel(tag.type)}</span>
          )}
        </button>
      ))}
      {itemSuggestions.map(({ item }) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelectItem?.(item)}
          className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100"
        >
          {item.title}
          <span className="ml-1 text-[9px] text-violet-400">事项</span>
        </button>
      ))}
    </div>
  );
}
