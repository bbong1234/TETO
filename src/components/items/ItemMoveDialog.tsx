'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, Loader2, X } from 'lucide-react';
import type { Item, SubItem } from '@/types/teto';
import {
  getCategoryItems,
  getChildItems,
  getItemDepth,
  getItemPath,
} from '@/lib/activity/item-tree';
import {
  buildReparentPathLabel,
  getItemLevel,
  getSubtreeDepthSpan,
  listReparentTargets,
  type ItemLevel,
} from '@/lib/activity/item-reparent';

export type MoveNode =
  | { kind: 'item'; item: Item }
  | { kind: 'subItem'; subItem: SubItem; hostItem?: Item };

interface ItemMoveDialogProps {
  open: boolean;
  onClose: () => void;
  items: Item[];
  node: MoveNode | null;
  onMoved?: () => void | Promise<void>;
  onError?: (message: string) => void;
}

type MoveMode = 'as_l2' | 'as_l3' | 'as_l1';

export default function ItemMoveDialog({
  open,
  onClose,
  items,
  node,
  onMoved,
  onError,
}: ItemMoveDialogProps) {
  const [expandedL1, setExpandedL1] = useState<Set<string>>(new Set());
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState<MoveMode>('as_l2');
  const [submitting, setSubmitting] = useState(false);

  const categoryItems = useMemo(() => getCategoryItems(items), [items]);

  const itemNode = node?.kind === 'item' ? node.item : null;
  const subItemNode = node?.kind === 'subItem' ? node.subItem : null;

  const currentPath = useMemo(() => {
    if (itemNode) return buildReparentPathLabel(items, itemNode.id);
    if (subItemNode && node?.kind === 'subItem') {
      const host = items.find((i) => i.id === subItemNode.item_id);
      if (host) return `${buildReparentPathLabel(items, host.id)} / ${subItemNode.title}`;
      return subItemNode.title;
    }
    return '';
  }, [itemNode, subItemNode, node, items]);

  const currentLevel = itemNode ? getItemLevel(items, itemNode.id) : 3;

  const canPromoteToL1 = useMemo(() => {
    if (!itemNode) return false;
    const span = getSubtreeDepthSpan(items, itemNode.id);
    return span <= 2 && getItemDepth(items, itemNode.id) > 0;
  }, [itemNode, items]);

  const validTargets = useMemo(() => {
    if (!itemNode) return [];
    if (moveMode === 'as_l1') return [];
    const asLevel: ItemLevel = moveMode === 'as_l2' ? 2 : 3;
    return listReparentTargets(itemNode.id, items, asLevel);
  }, [itemNode, items, moveMode]);

  const l2HostsForSubItem = useMemo(() => {
    if (!subItemNode) return [];
    return items
      .filter((i) => getItemDepth(items, i.id) === 1)
      .map((item) => ({
        item,
        disabled: item.id === subItemNode.item_id,
        reason: item.id === subItemNode.item_id ? '当前所在' : undefined,
      }))
      .sort((a, b) => a.item.title.localeCompare(b.item.title, 'zh-CN'));
  }, [subItemNode, items]);

  if (!open || !node) return null;

  const toggleL1 = (id: string) => {
    setExpandedL1((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (node.kind === 'subItem') {
        if (!selectedParentId) {
          onError?.('请选择目标二类标签');
          return;
        }
        const res = await fetch(`/api/v2/sub-items/${node.subItem.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: selectedParentId }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.message ?? data.error ?? '移动失败');
        }
      } else {
        let parentId: string | null = selectedParentId;
        let asLevel: ItemLevel | undefined;
        if (moveMode === 'as_l1') {
          parentId = null;
          asLevel = 1;
        } else if (moveMode === 'as_l2') {
          asLevel = 2;
        } else {
          asLevel = 3;
        }
        if (moveMode !== 'as_l1' && !parentId) {
          onError?.('请选择目标位置');
          return;
        }
        const res = await fetch(`/api/v2/items/${node.item.id}/reparent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_item_id: parentId, as_level: asLevel }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.message ?? data.error ?? '移动失败');
        }
      }
      await onMoved?.();
      onClose();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '移动失败');
    } finally {
      setSubmitting(false);
    }
  };

  const renderTargetButton = (
    id: string,
    label: string,
    disabled: boolean,
    reason?: string,
    indent = 0
  ) => (
    <button
      key={id}
      type="button"
      disabled={disabled}
      title={reason}
      onClick={() => setSelectedParentId(id)}
      className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors ${
        selectedParentId === id
          ? 'bg-indigo-100 text-indigo-800 font-medium'
          : disabled
            ? 'text-slate-300 cursor-not-allowed'
            : 'text-slate-700 hover:bg-slate-50'
      }`}
      style={{ paddingLeft: `${8 + indent * 12}px` }}
    >
      <Folder className="h-3 w-3 shrink-0 opacity-60" />
      <span className="truncate">{label}</span>
      {reason && disabled && (
        <span className="ml-auto text-[9px] text-slate-400 shrink-0">{reason}</span>
      )}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">移动到…</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3 max-h-[60vh] overflow-y-auto">
          <p className="text-[11px] text-slate-500">
            当前：<span className="font-medium text-slate-700">{currentPath}</span>
            {currentLevel && (
              <span className="ml-1 text-slate-400">（{currentLevel} 类）</span>
            )}
          </p>

          {itemNode && (
            <div className="flex flex-wrap gap-1.5">
              {currentLevel !== 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMoveMode('as_l2');
                      setSelectedParentId(null);
                    }}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                      moveMode === 'as_l2'
                        ? 'bg-indigo-500 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    作为二类
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoveMode('as_l3');
                      setSelectedParentId(null);
                    }}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                      moveMode === 'as_l3'
                        ? 'bg-indigo-500 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    作为三类
                  </button>
                </>
              )}
              {canPromoteToL1 && (
                <button
                  type="button"
                  onClick={() => {
                    setMoveMode('as_l1');
                    setSelectedParentId(null);
                  }}
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                    moveMode === 'as_l1'
                      ? 'bg-indigo-500 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  升格为一类
                </button>
              )}
            </div>
          )}

          {itemNode && moveMode === 'as_l1' && (
            <p className="text-[11px] text-slate-500">
              将「{itemNode.title}」提升为顶层一类标签，其下子项与记录保持不变。
            </p>
          )}

          {itemNode && moveMode !== 'as_l1' && (
            <div className="rounded-xl border border-slate-100 p-1.5 space-y-0.5">
              {moveMode === 'as_l2' &&
                categoryItems.map((l1) => {
                  const target = validTargets.find((t) => t.item.id === l1.id);
                  const disabled = !target || target.disabled;
                  return renderTargetButton(
                    l1.id,
                    l1.title,
                    disabled,
                    target?.reason ?? (disabled ? '不可用' : undefined)
                  );
                })}
              {moveMode === 'as_l3' &&
                categoryItems.map((l1) => {
                  const children = getChildItems(items, l1.id);
                  const hasValidChild = children.some((l2) =>
                    validTargets.some((t) => t.item.id === l2.id && !t.disabled)
                  );
                  if (children.length === 0) return null;
                  const expanded = expandedL1.has(l1.id);
                  return (
                    <div key={l1.id}>
                      <button
                        type="button"
                        onClick={() => toggleL1(l1.id)}
                        className="flex w-full items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 rounded-lg"
                      >
                        {expanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        {l1.title}
                        {!hasValidChild && (
                          <span className="ml-auto text-[9px] text-slate-300 font-normal">
                            无可用二类
                          </span>
                        )}
                      </button>
                      {expanded &&
                        children.map((l2) => {
                          const target = validTargets.find((t) => t.item.id === l2.id);
                          const disabled = !target || target.disabled;
                          return renderTargetButton(
                            l2.id,
                            l2.title,
                            disabled,
                            target?.reason,
                            2
                          );
                        })}
                    </div>
                  );
                })}
              {validTargets.filter((t) => !t.disabled).length === 0 && (
                <p className="text-[11px] text-amber-600 px-2 py-1">
                  没有可用的目标位置。若含下级节点，请先移走或选择「作为二类」。
                </p>
              )}
            </div>
          )}

          {subItemNode && (
            <div className="rounded-xl border border-slate-100 p-1.5 space-y-0.5">
              <p className="text-[10px] text-slate-400 px-2 pb-1">选择目标二类标签</p>
              {categoryItems.map((l1) => {
                const children = getChildItems(items, l1.id);
                if (children.length === 0) return null;
                const expanded = expandedL1.has(l1.id);
                return (
                  <div key={l1.id}>
                    <button
                      type="button"
                      onClick={() => toggleL1(l1.id)}
                      className="flex w-full items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 rounded-lg"
                    >
                      {expanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      {l1.title}
                    </button>
                    {expanded &&
                      children.map((l2) => {
                        const entry = l2HostsForSubItem.find((h) => h.item.id === l2.id);
                        return renderTargetButton(
                          l2.id,
                          l2.title,
                          entry?.disabled ?? false,
                          entry?.reason,
                          2
                        );
                      })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
          >
            取消
          </button>
          <button
            type="button"
            disabled={
              submitting ||
              Boolean(itemNode && moveMode !== 'as_l1' && !selectedParentId) ||
              Boolean(subItemNode && !selectedParentId)
            }
            onClick={() => void handleSubmit()}
            className="rounded-xl bg-indigo-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1.5"
          >
            {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
            确认移动
          </button>
        </div>
      </div>
    </div>
  );
}

export function formatItemMovePath(items: Item[], itemId: string): string {
  return getItemPath(items, itemId)
    .map((i) => i.title)
    .join(' / ');
}
