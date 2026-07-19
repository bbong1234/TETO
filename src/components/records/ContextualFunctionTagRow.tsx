'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Tag } from '@/types/teto';
import FunctionTagRow from './FunctionTagRow';

interface ContextualFunctionTagRowProps {
  itemId: string | null;
  /** 未选事项或 API 无数据时的全局职能池 */
  fallbackTags?: Tag[];
  selectedTagId: string | null;
  onSelect: (tagId: string | null) => void;
  onTagCreated?: (tag: Tag) => void;
  className?: string;
  hideLabel?: boolean;
  chipVariant?: 'indigo' | 'outline';
  graceActive?: boolean;
  graceExpiresAt?: number | null;
  onGraceUndo?: () => void;
  /** 切换事项加载中仍展示已选动作 */
  pinnedSelectedTag?: Tag | null;
  /** 切换事项加载新动作池时不闪空 */
  keepVisibleWhileLoading?: boolean;
  /** 有上下文时只展示该上下文历史动作；空态允许新建 */
  strictScope?: boolean;
  /** 当前归属对应的一类事项，用于新建及过滤动作标签 */
  scopeItemId?: string | null;
}

/**
 * 职能标签行：与归属并行；已选事项时优先展示历史职能，否则用全局池。
 */
export default function ContextualFunctionTagRow({
  itemId,
  fallbackTags = [],
  selectedTagId,
  onSelect,
  onTagCreated,
  className = '',
  hideLabel = false,
  chipVariant = 'indigo',
  graceActive = false,
  graceExpiresAt = null,
  onGraceUndo,
  pinnedSelectedTag = null,
  keepVisibleWhileLoading = false,
  strictScope = false,
  scopeItemId = null,
}: ContextualFunctionTagRowProps) {
  const [frequent, setFrequent] = useState<Tag[]>([]);
  const [all, setAll] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const lastStableTagsRef = useRef<Tag[]>([]);

  useEffect(() => {
    if (!itemId) {
      setFrequent([]);
      setAll([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void fetch(`/api/v2/items/${itemId}/function-tags`)
      .then((res) => res.json())
      .then((data: { data?: { frequent?: Tag[]; all?: Tag[] } }) => {
        if (cancelled) return;
        setFrequent(data.data?.frequent ?? []);
        setAll(data.data?.all ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setFrequent([]);
          setAll([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const globalFunctionTags = useMemo(
    () => fallbackTags.filter((t) => t.type === 'function'),
    [fallbackTags]
  );

  const scopedFallbackTags = useMemo(() => {
    if (!scopeItemId) return globalFunctionTags;
    return globalFunctionTags.filter(
      (t) => !t.scope_item_id || t.scope_item_id === scopeItemId
    );
  }, [globalFunctionTags, scopeItemId]);

  const displayTags = useMemo(() => {
    if (!itemId) return scopedFallbackTags;
    const frequentIds = new Set(frequent.map((t) => t.id));
    const more = all.filter((t) => !frequentIds.has(t.id));
    const contextual = [...frequent, ...more];
    if (!strictScope) return contextual.length > 0 ? contextual : scopedFallbackTags;
    if (contextual.length === 0 && (loading || scopedFallbackTags.length > 0)) {
      return scopedFallbackTags;
    }
    const selected =
      pinnedSelectedTag ??
      globalFunctionTags.find((t) => t.id === selectedTagId) ??
      null;
    if (selected && !contextual.some((t) => t.id === selected.id)) {
      return [selected, ...contextual];
    }
    return contextual;
  }, [itemId, frequent, all, scopedFallbackTags, strictScope, pinnedSelectedTag, selectedTagId, loading, scopeItemId]);

  if (displayTags.length > 0) {
    lastStableTagsRef.current = displayTags;
  }

  const visibleTags =
    keepVisibleWhileLoading && loading && displayTags.length === 0
      ? lastStableTagsRef.current.length > 0
        ? lastStableTagsRef.current
        : scopedFallbackTags
      : displayTags;

  if (!keepVisibleWhileLoading && loading && itemId && visibleTags.length === 0) {
    return (
      <p className={`text-[11px] text-slate-400 ${className}`}>加载动作…</p>
    );
  }

  return (
    <FunctionTagRow
      tags={visibleTags}
      selectedTagId={selectedTagId}
      onSelect={onSelect}
      onTagCreated={(tag) => {
        setAll((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
        onTagCreated?.(tag);
      }}
      className={className}
      hideLabel={hideLabel}
      chipVariant={chipVariant}
      graceActive={graceActive}
      graceExpiresAt={graceExpiresAt}
      onGraceUndo={onGraceUndo}
      pinnedSelectedTag={pinnedSelectedTag}
      scopeItemId={scopeItemId}
    />
  );
}
