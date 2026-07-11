'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Minus, Plus } from 'lucide-react';
import type { Item, SubItem } from '@/types/teto';
import {
  type ActivityContextValue,
  EMPTY_ACTIVITY_CONTEXT,
} from '@/lib/activity/activity-context-types';
import { useActivityContextData } from '@/hooks/use-activity-context-data';

export type { ActivityContextValue };
export { EMPTY_ACTIVITY_CONTEXT };

interface ActivityContextPickerProps {
  items: Item[];
  value: ActivityContextValue;
  onChange: (value: ActivityContextValue) => void;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onCreateError?: (message: string) => void;
  onSubItemsLoaded?: (subItems: SubItem[]) => void;
  compact?: boolean;
  itemsLoading?: boolean;
  levelScope?: 'all' | 'category' | 'item';
  /** 隐藏底部「编程 → 公司系统开发」路径摘要（编辑页控件已表达归属） */
  hidePathSummary?: boolean;
}

const PLACEHOLDER_PHASE_OPTION = '__no_phase__';

interface ContextLevelSelectOption {
  id: string;
  label: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ContextLevelSelect({
  selectedId,
  emptyLabel,
  createLabel,
  options,
  onPick,
  onClear,
  onCreate,
  triggerClassName,
  ariaLabel,
  fallbackLabel,
  disabled = false,
}: {
  selectedId: string;
  emptyLabel: string;
  createLabel: string;
  options: ContextLevelSelectOption[];
  onPick: (id: string) => void;
  onClear: () => void;
  onCreate: () => void;
  triggerClassName: string;
  ariaLabel: string;
  /** 选项列表尚未加载或未命中时，显示可读名称而非 UUID */
  fallbackLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [selectedId, options.length]);

  const selectedLabel = selectedId
    ? (options.find((o) => o.id === selectedId)?.label ??
        fallbackLabel ??
        (UUID_RE.test(selectedId) ? '未知事项' : selectedId))
    : emptyLabel;

  const handleOptionClick = (id: string) => {
    if (id === selectedId) {
      onClear();
    } else {
      onPick(id);
    }
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative flex-1 min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`${triggerClassName} flex w-full items-center justify-between gap-2 text-left`}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <li>
            <button
              type="button"
              onClick={() => {
                onCreate();
                setOpen(false);
              }}
              className="w-full px-2.5 py-1.5 text-left text-xs text-blue-600 hover:bg-slate-50"
            >
              {createLabel}
            </button>
          </li>
          {options.map((opt) => (
            <li key={opt.id}>
              <button
                type="button"
                role="option"
                aria-selected={opt.id === selectedId}
                onClick={() => handleOptionClick(opt.id)}
                className={[
                  'w-full px-2.5 py-1.5 text-left text-xs hover:bg-slate-50',
                  opt.id === selectedId ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-700',
                ].join(' ')}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityContextPicker({
  items,
  value,
  onChange,
  onItemsChange,
  onItemCreated,
  onCreateError,
  onSubItemsLoaded,
  compact = false,
  itemsLoading = false,
  levelScope = 'all',
  hidePathSummary = false,
}: ActivityContextPickerProps) {
  const ctx = useActivityContextData({
    items,
    value,
    onChange,
    onItemsChange,
    onItemCreated,
    onCreateError,
    onSubItemsLoaded,
  });

  const {
    activeCategoryId,
    categoryItems,
    childItems,
    level3Items,
    subItems,
    subLoading,
    phaseLoading,
    phaseOptions,
    phaseHostItemId,
    isL2Selected,
    creating,
    createText,
    setCreateText,
    createSubmitting,
    createError,
    pathParts,
    l3SelectedId,
    l3FallbackLabel,
    l2SelectedId,
    l2FallbackLabel,
    hasL3Content,
    setCategory,
    setItem,
    setPhase,
    startCreate,
    cancelCreate,
    submitCreate,
    clearL3Selection,
    pickL2Item,
    pickL3Option,
    itemDepth,
  } = ctx;

  const labelClass = compact
    ? 'text-[10px] text-slate-400 w-8 shrink-0'
    : 'text-[10px] text-slate-400 w-10 shrink-0';

  const selectClass =
    'flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-200 disabled:opacity-50 min-w-0';

  const renderCreateRow = (placeholder: string) => (
    <div className="flex flex-col gap-1 flex-1 min-w-0">
      <div className="flex items-center gap-1.5">
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
          className="flex-1 min-w-0 rounded-lg border border-blue-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
        />
        <button
          type="button"
          disabled={!createText.trim() || createSubmitting}
          onClick={() => void submitCreate()}
          className="rounded-lg bg-blue-500 px-2 py-1.5 text-[10px] font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {createSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : '确定'}
        </button>
        <button
          type="button"
          onClick={cancelCreate}
          className="rounded-lg px-2 py-1.5 text-[10px] text-slate-400 hover:bg-slate-100"
        >
          取消
        </button>
      </div>
      {createError && <p className="text-[10px] text-red-500">{createError}</p>}
    </div>
  );

  const showL3Row = isL2Selected && hasL3Content;
  const showPhaseRow = !!phaseHostItemId && !!value.itemId && itemDepth >= 1;
  const showCategoryLevel = levelScope !== 'item';
  const showItemLevels = levelScope !== 'category';

  const l3Options = useMemo(
    () => [
      ...level3Items.map((l3) => ({ id: l3.id, label: l3.title })),
      ...subItems.map((sub) => ({ id: sub.id, label: sub.title })),
    ],
    [level3Items, subItems]
  );

  return (
    <div className="space-y-2">
      {showCategoryLevel && (
      <div className="space-y-1.5">
        {!compact && (
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">一类</p>
        )}

        {creating === 'category' ? (
          renderCreateRow('新一类名称')
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {categoryItems.length === 0 && items.length === 0 && itemsLoading && (
              <span className="text-[11px] text-slate-400 py-0.5">加载…</span>
            )}
            {categoryItems.length === 0 && items.length === 0 && !itemsLoading && (
              <span className="text-[11px] text-slate-400 py-0.5">暂无一类，请新建</span>
            )}
            {categoryItems.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() =>
                  setCategory(
                    activeCategoryId === cat.id ? '' : cat.id,
                    activeCategoryId === cat.id ? undefined : cat.title
                  )
                }
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  activeCategoryId === cat.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.title}
              </button>
            ))}
            <button
              type="button"
              onClick={() => startCreate('category')}
              className="flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-400 hover:border-blue-300 hover:text-blue-500"
            >
              <Plus className="h-3 w-3" />
              新建
            </button>
          </div>
        )}

      </div>
      )}

      {showItemLevels && (
      <div className="space-y-1.5">
        {activeCategoryId ? (
          <div className="flex items-center gap-1.5 min-w-0">
            {levelScope === 'all' && <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" aria-hidden />}
            {creating === 'item' ? (
              renderCreateRow('新二类名称')
            ) : (
              <>
                <ContextLevelSelect
                  selectedId={l2SelectedId}
                  emptyLabel="不选二类"
                  createLabel="+ 新建二类"
                  options={childItems.map((child) => ({ id: child.id, label: child.title }))}
                  fallbackLabel={l2FallbackLabel}
                  onPick={pickL2Item}
                  onClear={() => setItem('', undefined)}
                  onCreate={() => startCreate('item')}
                  triggerClassName={selectClass}
                  ariaLabel="二类"
                />
                {l2SelectedId ? (
                  <button
                    type="button"
                    onClick={() => setItem('', undefined)}
                    className="shrink-0 flex items-center rounded-lg border border-slate-200 px-2 py-1.5 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    aria-label="取消二类"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">请先选择一类</p>
        )}

        {isL2Selected && showL3Row && creating !== 'subItem' && (
          <div className="flex items-center gap-1.5 min-w-0">
            <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" aria-hidden />
            {subLoading ? (
              <>
                <ContextLevelSelect
                  selectedId=""
                  emptyLabel="不选三类"
                  createLabel="+ 新建三类"
                  options={[]}
                  onPick={() => {}}
                  onClear={() => {}}
                  onCreate={() => {}}
                  triggerClassName={selectClass}
                  ariaLabel="三类"
                  disabled
                />
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-300" aria-hidden />
              </>
            ) : subItems.length === 0 && level3Items.length === 0 ? (
              <ContextLevelSelect
                selectedId=""
                emptyLabel="不选三类"
                createLabel="+ 新建三类"
                options={[]}
                onPick={() => {}}
                onClear={() => {}}
                onCreate={() => startCreate('subItem')}
                triggerClassName={selectClass}
                ariaLabel="三类"
              />
            ) : (
              <>
                <ContextLevelSelect
                  selectedId={l3SelectedId}
                  emptyLabel="不选三类"
                  createLabel="+ 新建三类"
                  options={l3Options}
                  fallbackLabel={l3FallbackLabel}
                  onPick={pickL3Option}
                  onClear={clearL3Selection}
                  onCreate={() => startCreate('subItem')}
                  triggerClassName={selectClass}
                  ariaLabel="三类"
                />
                {l3SelectedId ? (
                  <button
                    type="button"
                    onClick={clearL3Selection}
                    className="shrink-0 flex items-center rounded-lg border border-slate-200 px-2 py-1.5 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    aria-label="取消三类"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                ) : null}
              </>
            )}
          </div>
        )}

        {isL2Selected && creating === 'subItem' && (
          <div className="flex items-center gap-1.5 min-w-0">
            <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" aria-hidden />
            {renderCreateRow('新三类名称')}
          </div>
        )}

        {showPhaseRow && (
          <div className="flex items-center gap-1.5 min-w-0">
            <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" aria-hidden />
            <span className={labelClass}>阶段</span>
            {phaseLoading ? (
              <>
                <select disabled className={`${selectClass} opacity-60`}>
                  <option>不关联阶段</option>
                </select>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-300" aria-hidden />
              </>
            ) : phaseOptions.length === 0 ? (
              <span className="text-[11px] text-slate-400 flex-1">
                暂无进行中阶段（可在事项详情创建）
              </span>
            ) : (
              <select
                value={value.phaseId || PLACEHOLDER_PHASE_OPTION}
                onChange={(e) => {
                  if (e.target.value === PLACEHOLDER_PHASE_OPTION) {
                    setPhase('', undefined);
                    return;
                  }
                  const phase = phaseOptions.find((p) => p.id === e.target.value);
                  setPhase(e.target.value, phase?.title);
                }}
                className={selectClass}
              >
                <option value={PLACEHOLDER_PHASE_OPTION}>不关联阶段</option>
                {phaseOptions.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>
      )}

      {(pathParts.length > 0 || value.phaseTitle) && !hidePathSummary && (
        <p className="text-[10px] text-slate-400">
          {[pathParts.join(' → '), value.phaseTitle].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}

export default memo(ActivityContextPicker);
