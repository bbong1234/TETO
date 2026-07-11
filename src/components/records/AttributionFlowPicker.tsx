'use client';

import { memo, useEffect, useState, Fragment } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { Item, SubItem } from '@/types/teto';
import type { ActivityContextValue } from '@/lib/activity/activity-context-types';
import { useActivityContextData } from '@/hooks/use-activity-context-data';
import GraceProgressChip from './GraceProgressChip';

export type ContextHintKind = 'cost' | 'location' | 'content';

interface AttributionFlowPickerProps {
  items: Item[];
  value: ActivityContextValue;
  onChange: (value: ActivityContextValue) => void;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onCreateError?: (message: string) => void;
  onSubItemsLoaded?: (subItems: SubItem[]) => void;
  itemsLoading?: boolean;
  onContextHintSelect?: (hint: { kind: ContextHintKind; value: string | number }) => void;
  /** 计时等场景：L1 已由外部选定，只展示二/三层 */
  hideCategoryLevel?: boolean;
  /** 入口拆分布局：只展示一类，大类下事项由另一块展示 */
  hideItemLevels?: boolean;
  /** 选中后未选项淡化，仍可见可切换 */
  dimUnselected?: boolean;
  /** 块时间 5 秒撤销窗：选中标签展示倒计时进度 */
  graceActive?: boolean;
  graceExpiresAt?: number | null;
  /** 进度条内点击：按层级在 grace 内局部撤销（不 pop 整段） */
  onItemGraceUndo?: (level: 'l2' | 'l3') => void;
}

function SelectedChip({
  label,
  onClick,
  variant = 'blue',
}: {
  label: string;
  onClick: () => void;
  variant?: 'blue' | 'emerald';
}) {
  const styles =
    variant === 'emerald'
      ? 'bg-emerald-500 text-white'
      : 'bg-blue-500 text-white';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80 ${styles}`}
    >
      {label}
    </button>
  );
}

function FlowConnector() {
  return (
    <div className="flex pl-3" aria-hidden>
      <div className="h-1.5 w-px bg-slate-200" />
    </div>
  );
}

const hintChipClass =
  'shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-100';

function AttributionFlowPicker({
  items,
  value,
  onChange,
  onItemsChange,
  onItemCreated,
  onCreateError,
  onSubItemsLoaded,
  itemsLoading = false,
  onContextHintSelect,
  hideCategoryLevel = false,
  hideItemLevels = false,
  dimUnselected = false,
  graceActive = false,
  graceExpiresAt = null,
  onItemGraceUndo,
}: AttributionFlowPickerProps) {
  const [recordContext, setRecordContext] = useState<{
    costs: number[];
    locations: string[];
    contents: string[];
  } | null>(null);

  const {
    activeCategoryId,
    categoryItems,
    childItems,
    level3Items,
    subItems,
    subLoading,
    isL2Selected,
    creating,
    createText,
    setCreateText,
    createSubmitting,
    createError,
    l3SelectedId,
    l2SelectedId,
    hasL3Content,
    setCategory,
    setItem,
    startCreate,
    cancelCreate,
    submitCreate,
    pickL2Item,
    pickL3Option,
  } = useActivityContextData({
    items,
    value,
    onChange,
    onItemsChange,
    onItemCreated,
    onCreateError,
    onSubItemsLoaded,
  });

  useEffect(() => {
    if (!value.itemId || creating || !onContextHintSelect) {
      setRecordContext(null);
      return;
    }
    let cancelled = false;
    void fetch(`/api/v2/items/${value.itemId}/record-context`)
      .then((res) => res.json())
      .then((data: { data?: { costs?: number[]; locations?: string[]; contents?: string[] } }) => {
        if (cancelled) return;
        setRecordContext({
          costs: data.data?.costs ?? [],
          locations: data.data?.locations ?? [],
          contents: data.data?.contents ?? [],
        });
      })
      .catch(() => {
        if (!cancelled) setRecordContext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value.itemId, creating, onContextHintSelect]);

  const l3Options = [
    ...level3Items.map((l3) => ({ id: l3.id, label: l3.title, kind: 'item' as const })),
    ...subItems.map((sub) => ({ id: sub.id, label: sub.title, kind: 'sub' as const })),
  ];

  const selectedCategory = categoryItems.find((c) => c.id === activeCategoryId);
  const selectedL2 = l2SelectedId
    ? childItems.find((c) => c.id === l2SelectedId)
    : undefined;
  const selectedL3 = l3Options.find((o) => o.id === l3SelectedId);

  const showL1 = !hideCategoryLevel || !activeCategoryId;
  const showL2 = Boolean(!hideItemLevels && activeCategoryId && creating !== 'category');
  // 只要二类已选中就展示三类行（无子项时也显示「新建」入口）
  const showL3 = Boolean(!hideItemLevels && isL2Selected && value.itemId && creating !== 'item');

  const l3HasSelection = Boolean(l3SelectedId);

  const newButtonClass =
    'flex shrink-0 items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-400 hover:border-blue-300 hover:text-blue-500';

  const optionButtonClass =
    'shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-blue-300';

  const optionClass = (selected: boolean, dimmed: boolean, accent: 'blue' | 'emerald' = 'blue') => {
    const size = accent === 'emerald' ? 'text-[10px]' : 'text-[11px]';
    if (selected) {
      return accent === 'emerald'
        ? `shrink-0 rounded-full border border-emerald-400 bg-emerald-500 px-2 py-0.5 ${size} font-medium text-white`
        : `shrink-0 rounded-full border border-blue-400 bg-blue-500 px-2 py-0.5 ${size} font-medium text-white`;
    }
    return [
      accent === 'emerald'
        ? `shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 ${size} font-medium text-slate-600 hover:border-emerald-300`
        : optionButtonClass,
      dimmed ? 'opacity-40 hover:opacity-70' : '',
    ].join(' ');
  };

  const handleSelectedChipClick = (level: 'l2' | 'l3', deselect: () => void) => {
    if (graceActive && graceExpiresAt && onItemGraceUndo) {
      onItemGraceUndo(level);
      return;
    }
    deselect();
  };

  const renderPickerChip = (
    selected: boolean,
    label: string,
    onClick: () => void,
    dimmed: boolean,
    accent: 'blue' | 'emerald' = 'blue'
  ) => {
    const cls = optionClass(selected, dimmed, accent);
    if (selected && graceActive && graceExpiresAt) {
      return (
        <GraceProgressChip
          label={label}
          onClick={onClick}
          graceActive={graceActive}
          graceExpiresAt={graceExpiresAt}
          className={cls}
          accent={accent}
        />
      );
    }
    return (
      <button type="button" onClick={onClick} className={cls}>
        {label}
      </button>
    );
  };

  const hasHints =
    Boolean(recordContext) &&
    (recordContext!.costs.length > 0 ||
      recordContext!.locations.length > 0 ||
      recordContext!.contents.length > 0);

  const renderCreateRow = (placeholder: string) => (
    <div className="flex flex-col gap-0.5 min-w-[160px]">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={createText}
          onChange={(e) => setCreateText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitCreate();
            if (e.key === 'Escape') cancelCreate();
          }}
          placeholder={placeholder}
          autoFocus
          className="flex-1 min-w-0 rounded border border-blue-200 px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-300"
        />
        <button
          type="button"
          disabled={!createText.trim() || createSubmitting}
          onClick={() => void submitCreate()}
          className="rounded bg-blue-500 px-1.5 py-1 text-[10px] font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {createSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : '确定'}
        </button>
        <button
          type="button"
          onClick={cancelCreate}
          className="rounded px-1.5 py-1 text-[10px] text-slate-400 hover:bg-slate-100"
        >
          取消
        </button>
      </div>
      {createError && <p className="text-[10px] text-red-500">{createError}</p>}
    </div>
  );

  return (
    <div className="inline-flex w-fit max-w-full flex-col gap-0.5">
      <div className="inline-flex w-fit max-w-full flex-col gap-0.5 rounded-lg border border-slate-100 bg-slate-50/50 px-2 py-1">
        {/* 一类 */}
        {showL1 && (
        <div className="flex flex-wrap items-center gap-1">
          {creating === 'category' ? (
            renderCreateRow('新一类名称')
          ) : activeCategoryId && selectedCategory && !dimUnselected ? (
            <SelectedChip
              label={selectedCategory.title}
              onClick={() => setCategory('', undefined)}
            />
          ) : activeCategoryId && selectedCategory && dimUnselected ? (
            categoryItems.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  if (cat.id === activeCategoryId) setCategory('', undefined);
                  else setCategory(cat.id, cat.title);
                }}
                className={optionClass(cat.id === activeCategoryId, cat.id !== activeCategoryId)}
              >
                {cat.title}
              </button>
            ))
          ) : (
            <>
              {categoryItems.length === 0 && items.length === 0 && itemsLoading && (
                <span className="text-[10px] text-slate-400">加载…</span>
              )}
              {categoryItems.length === 0 && items.length === 0 && !itemsLoading && (
                <span className="text-[10px] text-slate-400">暂无一类</span>
              )}
              {categoryItems.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    if (cat.id === activeCategoryId) setCategory('', undefined);
                    else setCategory(cat.id, cat.title);
                  }}
                  className={optionClass(cat.id === activeCategoryId, false)}
                >
                  {cat.title}
                </button>
              ))}
              <button type="button" onClick={() => startCreate('category')} className={newButtonClass}>
                <Plus className="h-3 w-3" />
                新建
              </button>
            </>
          )}
        </div>
        )}

        {/* 二类 */}
        {showL2 && (
          <>
            {showL1 && <FlowConnector />}
            <div
              className={`flex flex-wrap items-center gap-1 ${showL1 ? 'border-l-2 border-blue-100 pl-2' : ''}`}
            >
              {creating === 'item' ? (
                renderCreateRow('新事项名称')
              ) : dimUnselected ? (
                <>
                  {childItems.map((child) => (
                    <Fragment key={child.id}>
                      {renderPickerChip(
                        l2SelectedId === child.id,
                        child.title,
                        () => {
                          if (l2SelectedId === child.id) {
                            handleSelectedChipClick('l2', () => setItem('', undefined));
                          } else {
                            pickL2Item(child.id);
                          }
                        },
                        Boolean(l2SelectedId) && l2SelectedId !== child.id
                      )}
                    </Fragment>
                  ))}
                  <button
                    type="button"
                    onClick={() => startCreate('item')}
                    className={[newButtonClass, l2SelectedId ? 'opacity-40 hover:opacity-70' : ''].join(' ')}
                  >
                    <Plus className="h-3 w-3" />
                    新建
                  </button>
                </>
              ) : value.itemId && selectedL2 ? (
                <SelectedChip label={selectedL2.title} onClick={() => setItem('', undefined)} />
              ) : (
                <>
                  {childItems.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => {
                        if (l2SelectedId === child.id) {
                          setItem('', undefined);
                        } else {
                          pickL2Item(child.id);
                        }
                      }}
                      className={optionButtonClass}
                    >
                      {child.title}
                    </button>
                  ))}
                  <button type="button" onClick={() => startCreate('item')} className={newButtonClass}>
                    <Plus className="h-3 w-3" />
                    新建
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* 子项 */}
        {showL3 && (
          <>
            <FlowConnector />
            <div className="flex flex-wrap items-center gap-1 border-l-2 border-emerald-100 pl-2">
              {creating === 'subItem' ? (
                renderCreateRow('新子项名称')
              ) : subLoading ? (
                <span className="flex shrink-0 items-center gap-1 text-[10px] text-slate-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  加载…
                </span>
              ) : dimUnselected ? (
                <>
                  {l3Options.length === 0 && (
                    <span className="text-[10px] text-slate-400">暂无子项</span>
                  )}
                  {l3Options.map((opt) => (
                    <Fragment key={opt.id}>
                      {renderPickerChip(
                        l3SelectedId === opt.id,
                        opt.label,
                        () => {
                          if (l3SelectedId === opt.id) {
                            handleSelectedChipClick('l3', () =>
                              onChange({ ...value, subItemId: '', subItemTitle: undefined })
                            );
                          } else {
                            pickL3Option(opt.id);
                          }
                        },
                        l3HasSelection && l3SelectedId !== opt.id,
                        'emerald'
                      )}
                    </Fragment>
                  ))}
                  <button
                    type="button"
                    onClick={() => startCreate('subItem')}
                    className={[newButtonClass, l3HasSelection ? 'opacity-40 hover:opacity-70' : ''].join(' ')}
                  >
                    <Plus className="h-3 w-3" />
                    新建
                  </button>
                </>
              ) : l3SelectedId && selectedL3 ? (
                <SelectedChip
                  label={selectedL3.label}
                  variant="emerald"
                  onClick={() => onChange({ ...value, subItemId: '', subItemTitle: undefined })}
                />
              ) : (
                <>
                  {l3Options.length === 0 && (
                    <span className="text-[10px] text-slate-400">暂无子项</span>
                  )}
                  {l3Options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        if (l3SelectedId === opt.id) {
                          onChange({ ...value, subItemId: '', subItemTitle: undefined });
                        } else {
                          pickL3Option(opt.id);
                        }
                      }}
                      className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:border-emerald-300"
                    >
                      {opt.label}
                    </button>
                  ))}
                  <button type="button" onClick={() => startCreate('subItem')} className={newButtonClass}>
                    <Plus className="h-3 w-3" />
                    新建
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {value.itemId && hasHints && onContextHintSelect && (
        <div className="flex flex-wrap items-center gap-1 pl-0.5">
          {recordContext!.costs.map((cost) => (
            <button
              key={`cost-${cost}`}
              type="button"
              onClick={() => onContextHintSelect({ kind: 'cost', value: cost })}
              className={hintChipClass}
            >
              ¥{cost}
            </button>
          ))}
          {recordContext!.locations.map((loc) => (
            <button
              key={`loc-${loc}`}
              type="button"
              onClick={() => onContextHintSelect({ kind: 'location', value: loc })}
              className={hintChipClass}
            >
              {loc}
            </button>
          ))}
          {recordContext!.contents.map((snippet) => (
            <button
              key={`content-${snippet}`}
              type="button"
              onClick={() => onContextHintSelect({ kind: 'content', value: snippet })}
              className={hintChipClass}
            >
              {snippet}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(AttributionFlowPicker);
