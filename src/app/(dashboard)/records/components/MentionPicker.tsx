'use client';

import type { Item, Tag } from '@/types/teto';

export interface MentionToken {
  type: 'item' | 'function_tag' | 'sub_item';
  id: string;
  label: string;
  /** sub_item 时：记录切换需要的 parent item_id */
  parentItemId?: string;
}

export interface PickerSubItem {
  id: string;
  title: string;
  /** 所属的 L2 item id */
  parentItemId: string;
  /** 展示用的 L2 item 标题 */
  parentItemTitle: string;
}

interface MentionPickerProps {
  items: Item[];
  functionTags: Tag[];
  /** 三类：L3 Item + SubItem 合并列表 */
  subItems?: PickerSubItem[];
  /** 近期使用的动作词（无对应 tag 对象） */
  recentActions?: string[];
  /** 块内历史顺序，优先排序 */
  recentItemIds?: string[];
  filterText?: string;
  mode?: 'switch' | 'action';
  onSelect: (token: MentionToken) => void;
}

export default function MentionPicker({
  items,
  functionTags,
  subItems = [],
  recentActions = [],
  recentItemIds = [],
  filterText = '',
  mode = 'switch',
  onSelect,
}: MentionPickerProps) {
  const lower = filterText.toLowerCase();

  const candidateItems =
    mode === 'action'
      ? []
      : [...items]
          .sort((a, b) => {
            const ai = recentItemIds.indexOf(a.id);
            const bi = recentItemIds.indexOf(b.id);
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return -1;
            if (bi !== -1) return 1;
            return 0;
          })
          .filter((i) => !lower || i.title.toLowerCase().includes(lower))
          .slice(0, 8);

  const candidateSubItems =
    mode === 'action'
      ? []
      : subItems
          .filter((s) =>
            !lower ||
            s.title.toLowerCase().includes(lower) ||
            s.parentItemTitle.toLowerCase().includes(lower)
          )
          .slice(0, 8);

  const candidateTags = functionTags
    .filter((t) => !lower || t.name.toLowerCase().includes(lower))
    .slice(0, 5);

  // 最近动作：过滤掉与 candidateTags 重名的项目，避免重复
  const tagNames = new Set(candidateTags.map((t) => t.name.toLowerCase()));
  const candidateRecentActions = recentActions
    .filter((a) => !tagNames.has(a.toLowerCase()) && (!lower || a.toLowerCase().includes(lower)))
    .slice(0, 5);

  const hasAny =
    candidateItems.length > 0 ||
    candidateSubItems.length > 0 ||
    candidateTags.length > 0 ||
    candidateRecentActions.length > 0;

  if (!hasAny) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 z-50 mb-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
      {/* 二类 */}
      {candidateItems.length > 0 && (
        <div>
          <p className="mb-1 px-1 text-[10px] font-medium text-slate-400">二类事项</p>
          <div className="flex flex-wrap gap-1.5">
            {candidateItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect({ type: 'item', id: item.id, label: item.title })}
                className={[
                  'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                  lower && item.title.toLowerCase().includes(lower)
                    ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700',
                ].join(' ')}
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 三类（L3 Item + SubItem） */}
      {candidateSubItems.length > 0 && (
        <div className={candidateItems.length > 0 ? 'mt-2' : ''}>
          <p className="mb-1 px-1 text-[10px] font-medium text-slate-400">三类</p>
          <div className="flex flex-wrap gap-1.5">
            {candidateSubItems.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() =>
                  onSelect({
                    type: 'sub_item',
                    id: sub.id,
                    label: sub.title,
                    parentItemId: sub.parentItemId,
                  })
                }
                className={[
                  'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                  lower && (sub.title.toLowerCase().includes(lower) || sub.parentItemTitle.toLowerCase().includes(lower))
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700 font-medium'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700',
                ].join(' ')}
              >
                <span className="text-slate-400">{sub.parentItemTitle} · </span>
                {sub.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 动作标签（事项历史或全局标签） */}
      {(candidateTags.length > 0 || candidateRecentActions.length > 0) && (
        <div className={candidateItems.length > 0 || candidateSubItems.length > 0 ? 'mt-2' : ''}>
          <p className="mb-1 px-1 text-[10px] font-medium text-slate-400">动作</p>
          <div className="flex flex-wrap gap-1.5">
            {candidateTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => onSelect({ type: 'function_tag', id: tag.id, label: tag.name })}
                className={[
                  'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                  lower && tag.name.toLowerCase().includes(lower)
                    ? 'border-purple-400 bg-purple-50 text-purple-700 font-medium'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700',
                ].join(' ')}
              >
                {tag.name}
              </button>
            ))}
            {/* 近期使用的动作词（无绑定 tag，以 label 传递） */}
            {candidateRecentActions.map((word) => (
              <button
                key={`recent-${word}`}
                type="button"
                onClick={() => onSelect({ type: 'function_tag', id: word, label: word })}
                className={[
                  'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                  lower && word.toLowerCase().includes(lower)
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-700 font-medium'
                    : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700',
                ].join(' ')}
                title="近期使用的动作"
              >
                {word}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
