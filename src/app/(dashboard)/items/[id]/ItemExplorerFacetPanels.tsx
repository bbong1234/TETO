'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { ItemExplorerActionFacet, ItemExplorerProjectFacet } from '@/types/teto';

const newButtonClass =
  'flex shrink-0 items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-400 hover:border-blue-300 hover:text-blue-500';

function FlowConnector() {
  return (
    <div className="flex pl-3" aria-hidden>
      <div className="h-1.5 w-px bg-slate-200" />
    </div>
  );
}

function l2ChipClass(selected: boolean, dimmed: boolean) {
  const base = selected
    ? 'shrink-0 rounded-full border border-blue-400 bg-blue-500 px-2 py-0.5 text-[11px] font-medium text-white'
    : 'shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-blue-300';
  return dimmed ? `${base} opacity-40 hover:opacity-70` : base;
}

function l3ChipClass(selected: boolean, dimmed: boolean) {
  const base = selected
    ? 'shrink-0 rounded-full border border-emerald-400 bg-emerald-500 px-2 py-0.5 text-[10px] font-medium text-white'
    : 'shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:border-emerald-300';
  return dimmed ? `${base} opacity-40 hover:opacity-70` : base;
}

interface ItemExplorerFacetPanelsProps {
  rootItemId: string;
  projectFacets: ItemExplorerProjectFacet[];
  actionFacets: ItemExplorerActionFacet[];
  projectId: string | null;
  subItemId: string | null;
  functionTagId: string | null;
  onProjectFilter: (facet: ItemExplorerProjectFacet | null) => void;
  onActionFilter: (id: string | null) => void;
  onMutated: () => void;
  onError: (message: string) => void;
}

type CreateLevel = 'l2' | 'l3' | null;

export default function ItemExplorerFacetPanels({
  rootItemId,
  projectFacets,
  actionFacets,
  projectId,
  subItemId,
  functionTagId,
  onProjectFilter,
  onActionFilter,
  onMutated,
  onError,
}: ItemExplorerFacetPanelsProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [creating, setCreating] = useState<CreateLevel>(null);
  const [createText, setCreateText] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingAction, setCreatingAction] = useState(false);
  const [newActionName, setNewActionName] = useState('');
  const [actionSaving, setActionSaving] = useState(false);

  const l2Facets = useMemo(
    () => projectFacets.filter((f) => f.level === 2),
    [projectFacets]
  );
  const l3Facets = useMemo(
    () => projectFacets.filter((f) => f.level === 3),
    [projectFacets]
  );

  const activeL2Id = useMemo(() => {
    if (subItemId) {
      const sub = l3Facets.find((f) => f.kind === 'sub_item' && f.id === subItemId);
      return sub?.parent_id ?? null;
    }
    if (projectId) {
      const hit = projectFacets.find((f) => f.id === projectId);
      if (!hit) return null;
      if (hit.level === 2) return hit.id;
      return hit.parent_id;
    }
    return null;
  }, [subItemId, projectId, l3Facets, projectFacets]);

  const l3Options = useMemo(() => {
    if (!activeL2Id) return [];
    return l3Facets.filter((f) => f.parent_id === activeL2Id);
  }, [activeL2Id, l3Facets]);

  const l2SelectedId =
    projectId && !subItemId && l2Facets.some((f) => f.id === projectId) ? projectId : activeL2Id;
  const l3SelectedId = subItemId ?? (projectId && l3Facets.some((f) => f.id === projectId) ? projectId : null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusyKey(key);
    try {
      await fn();
      onMutated();
    } catch (err) {
      onError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusyKey(null);
    }
  };

  const cancelCreate = () => {
    setCreating(null);
    setCreateText('');
    setCreateError(null);
  };

  const submitCreate = async () => {
    const title = createText.trim();
    if (!title || !creating) return;
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      if (creating === 'l2') {
        const res = await fetch('/api/v2/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, parent_item_id: rootItemId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || json.errors?.[0]?.message || '创建失败');
      } else if (creating === 'l3') {
        if (!activeL2Id) throw new Error('请先选择第二标签');
        const res = await fetch('/api/v2/sub-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: activeL2Id, title }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || json.errors?.[0]?.message || '创建失败');
      }
      cancelCreate();
      onMutated();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreateSubmitting(false);
    }
  };

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

  const pickL2 = (facet: ItemExplorerProjectFacet) => {
    const active = l2SelectedId === facet.id && !subItemId;
    onProjectFilter(active ? null : facet);
  };

  const pickL3 = (facet: ItemExplorerProjectFacet) => {
    const active =
      facet.kind === 'sub_item'
        ? subItemId === facet.id
        : projectId === facet.id && !subItemId;
    onProjectFilter(active ? null : facet);
  };

  const deleteProjectFacet = (facet: ItemExplorerProjectFacet, e: React.MouseEvent) => {
    e.stopPropagation();
    const hint =
      facet.record_count > 0
        ? `\n\n关联 ${facet.record_count} 条记录，删除后将解除归属。`
        : '';
    if (!confirm(`确定删除「${facet.path_label}」？${hint}`)) return;

    void run(`del-${facet.kind}-${facet.id}`, async () => {
      const url =
        facet.kind === 'sub_item'
          ? `/api/v2/sub-items/${facet.id}`
          : `/api/v2/items/${facet.id}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || json.errors?.[0]?.message || '删除失败');
      }
      if (
        (facet.kind === 'sub_item' && subItemId === facet.id) ||
        (facet.kind === 'item' && projectId === facet.id)
      ) {
        onProjectFilter(null);
      }
    });
  };

  const deleteAction = (facet: ItemExplorerActionFacet) => {
    if (facet.record_count > 0) {
      onError(`动作标签「${facet.name}」仍关联 ${facet.record_count} 条记录，无法删除`);
      return;
    }
    if (!confirm(`确定删除动作标签「${facet.name}」？`)) return;
    void run(`del-action-${facet.id}`, async () => {
      const res = await fetch(`/api/v2/tags/${facet.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || json.errors?.[0]?.message || '删除失败');
      }
      if (functionTagId === facet.id) onActionFilter(null);
    });
  };

  const createAction = async () => {
    const name = newActionName.trim();
    if (!name) return;
    setActionSaving(true);
    try {
      const res = await fetch('/api/v2/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: 'function', scope_item_id: rootItemId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.errors?.[0]?.message || '创建失败');
      setNewActionName('');
      setCreatingAction(false);
      onMutated();
    } catch (err) {
      onError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setActionSaving(false);
    }
  };

  const actionChipClass = (selected: boolean) =>
    selected
      ? 'rounded-full border border-blue-400 bg-blue-500 px-2.5 py-0.5 text-[11px] font-medium text-white'
      : 'rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:border-blue-300';

  const hasL2Selection = Boolean(l2SelectedId);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="glass rounded-2xl p-4 shadow-soft">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium text-slate-500">事项（可选，单选）</span>
          <span className="text-[10px] text-slate-400">项目/主题线</span>
        </div>

        <div className="inline-flex w-full max-w-full flex-col gap-0.5">
          <div className="inline-flex w-full max-w-full flex-col gap-0.5 rounded-lg border border-slate-100 bg-slate-50/50 px-2 py-1.5">
            {/* 第二标签 — 同记录页二类 */}
            <div className="flex flex-wrap items-center gap-1">
              {creating === 'l2' ? (
                renderCreateRow('新事项名称')
              ) : l2Facets.length === 0 ? (
                <span className="text-[10px] text-slate-400">暂无事项</span>
              ) : (
                l2Facets.map((facet) => (
                  <span key={facet.id} className="group inline-flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => pickL2(facet)}
                      className={l2ChipClass(
                        l2SelectedId === facet.id && !subItemId,
                        hasL2Selection && l2SelectedId !== facet.id
                      )}
                    >
                      {facet.title}
                      {facet.record_count > 0 ? ` (${facet.record_count})` : ''}
                    </button>
                    <button
                      type="button"
                      title="删除"
                      disabled={busyKey === `del-${facet.kind}-${facet.id}`}
                      onClick={(e) => deleteProjectFacet(facet, e)}
                      className="rounded p-0.5 text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-500 disabled:opacity-40"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
              {creating !== 'l2' && (
                <button
                  type="button"
                  onClick={() => {
                    setCreating('l2');
                    setCreateText('');
                    setCreateError(null);
                  }}
                  className={[newButtonClass, hasL2Selection ? 'opacity-40 hover:opacity-70' : ''].join(' ')}
                >
                  <Plus className="h-3 w-3" />
                  新建
                </button>
              )}
            </div>

            {/* 第三标签 — 选中二类后展示，同记录页子项行 */}
            {activeL2Id && (
              <>
                <FlowConnector />
                <div className="flex flex-wrap items-center gap-1 border-l-2 border-emerald-100 pl-2">
                  {creating === 'l3' ? (
                    renderCreateRow('新子项名称')
                  ) : l3Options.length === 0 ? (
                    <span className="text-[10px] text-slate-400">暂无子项</span>
                  ) : (
                    l3Options.map((facet) => (
                      <span key={`${facet.kind}-${facet.id}`} className="group inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => pickL3(facet)}
                          className={l3ChipClass(
                            (facet.kind === 'sub_item' && subItemId === facet.id) ||
                              (facet.kind === 'item' && projectId === facet.id),
                            Boolean(l3SelectedId) &&
                              !(
                                (facet.kind === 'sub_item' && subItemId === facet.id) ||
                                (facet.kind === 'item' && projectId === facet.id)
                              )
                          )}
                        >
                          {facet.title}
                          {facet.record_count > 0 ? ` (${facet.record_count})` : ''}
                        </button>
                        <button
                          type="button"
                          title="删除"
                          disabled={busyKey === `del-${facet.kind}-${facet.id}`}
                          onClick={(e) => deleteProjectFacet(facet, e)}
                          className="rounded p-0.5 text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-500 disabled:opacity-40"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                  {creating !== 'l3' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!activeL2Id) {
                          onError('请先选择第二标签');
                          return;
                        }
                        setCreating('l3');
                        setCreateText('');
                        setCreateError(null);
                      }}
                      className={[
                        newButtonClass,
                        l3SelectedId ? 'opacity-40 hover:opacity-70' : '',
                      ].join(' ')}
                    >
                      <Plus className="h-3 w-3" />
                      新建
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="glass rounded-2xl p-4 shadow-soft">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium text-slate-500">动作（可选，单选）</span>
          <span className="text-[10px] text-slate-400">行为线</span>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {actionFacets.map((facet) => (
              <span key={facet.id} className="group inline-flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onActionFilter(functionTagId === facet.id ? null : facet.id)}
                  className={actionChipClass(functionTagId === facet.id)}
                >
                  {facet.name}
                  {facet.record_count > 0 ? ` (${facet.record_count})` : ''}
                </button>
                <button
                  type="button"
                  title="删除"
                  disabled={busyKey === `del-action-${facet.id}` || facet.record_count > 0}
                  onClick={() => deleteAction(facet)}
                  className="rounded p-0.5 text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-500 disabled:opacity-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
            {creatingAction ? (
              <div className="flex items-center gap-1 min-w-[140px]">
                <input
                  type="text"
                  value={newActionName}
                  onChange={(e) => setNewActionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void createAction();
                    if (e.key === 'Escape') {
                      setCreatingAction(false);
                      setNewActionName('');
                    }
                  }}
                  placeholder="新动作名称"
                  autoFocus
                  className="flex-1 min-w-0 rounded border border-blue-200 px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-300"
                />
                <button
                  type="button"
                  disabled={!newActionName.trim() || actionSaving}
                  onClick={() => void createAction()}
                  className="rounded bg-blue-500 px-1.5 py-1 text-[10px] text-white disabled:opacity-50"
                >
                  {actionSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : '确定'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreatingAction(true)}
                className="flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-400 hover:border-blue-400 hover:text-blue-500"
              >
                <Plus className="h-3 w-3" />
                新建
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
