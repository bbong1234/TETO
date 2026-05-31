'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Zap, Loader2, X } from 'lucide-react';
import type { Item, Record as TetoRecord, UserTool } from '@/types/teto';
import { buildRecentSwitchEntries, type QuickSwitchEntry } from '@/lib/activity/quick-switch-utils';
import { buildOptimisticActiveRecord, type ActivitySwitchPayload } from '@/lib/activity/records-mutation';
import { shouldPromptQuickSwitchToolPicker } from '@/lib/activity/item-tree';
import { persistToolOptionIfNeeded } from '@/components/records/ToolLabelField';
import QuickSwitchToolPicker from './QuickSwitchToolPicker';

export interface ActivitySwitchResult {
  record: TetoRecord | null;
  stopped: TetoRecord[];
}

/** 最多展示条数（约 3 行） */
const QUICK_SWITCH_MAX_VISIBLE = 9;
/** 候选池：删几条后还能补满 */
const QUICK_SWITCH_POOL = 24;
const DISMISS_STORAGE_KEY = 'teto_quick_switch_dismissed';

function loadDismissedKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveDismissedKeys(keys: Set<string>) {
  try {
    localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    /* ignore */
  }
}

interface QuickSwitchPanelProps {
  /** 当日记录（立即可用，无需等 7 日请求） */
  supplementRecords?: TetoRecord[];
  items?: Item[];
  userTools?: UserTool[];
  toolsLoading?: boolean;
  onSwitched?: (data: ActivitySwitchResult) => void;
  onError?: (message: string) => void;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function QuickSwitchPanel({
  supplementRecords = [],
  items = [],
  userTools: userToolsProp,
  toolsLoading: toolsLoadingProp,
  onSwitched,
  onError,
}: QuickSwitchPanelProps) {
  const useExternalTools = userToolsProp !== undefined;
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<TetoRecord[]>([]);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(() => loadDismissedKeys());
  const [subItemTitles, setSubItemTitles] = useState<Map<string, string>>(new Map());
  const [localUserTools, setLocalUserTools] = useState<UserTool[]>([]);
  const [localToolsLoading, setLocalToolsLoading] = useState(!useExternalTools);
  const userTools = useExternalTools ? userToolsProp! : localUserTools;
  const toolsLoading = useExternalTools ? (toolsLoadingProp ?? false) : localToolsLoading;
  const [pendingEntry, setPendingEntry] = useState<QuickSwitchEntry | null>(null);

  const mergedRecords = useMemo(() => {
    const byId = new Map<string, TetoRecord>();
    for (const r of [...supplementRecords, ...historyRecords]) {
      byId.set(r.id, r);
    }
    return Array.from(byId.values());
  }, [supplementRecords, historyRecords]);

  const itemIdsForSubItems = useMemo(() => {
    const ids = new Set<string>();
    for (const r of mergedRecords) {
      if (r.item_id && r.sub_item_id) ids.add(r.item_id);
    }
    return [...ids];
  }, [mergedRecords]);

  useEffect(() => {
    if (useExternalTools) return;
    let cancelled = false;
    void (async () => {
      setLocalToolsLoading(true);
      try {
        const res = await fetch('/api/v2/tools');
        const data = await res.json();
        if (!cancelled && res.ok) setLocalUserTools(data.data ?? []);
      } catch {
        if (!cancelled) setLocalUserTools([]);
      } finally {
        if (!cancelled) setLocalToolsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useExternalTools]);

  useEffect(() => {
    if (itemIdsForSubItems.length === 0) {
      setSubItemTitles(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      const next = new Map<string, string>();
      await Promise.all(
        itemIdsForSubItems.map(async (itemId) => {
          try {
            const res = await fetch(`/api/v2/sub-items?item_id=${itemId}`);
            const data = await res.json();
            if (!res.ok) return;
            for (const sub of data.data ?? []) {
              if (sub?.id && sub?.title) next.set(sub.id, sub.title);
            }
          } catch {
            /* ignore */
          }
        })
      );
      if (!cancelled) setSubItemTitles(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [itemIdsForSubItems.join('|')]);

  const visibleEntries = useMemo(() => {
    const pool = buildRecentSwitchEntries(mergedRecords, items, QUICK_SWITCH_POOL, subItemTitles);
    return pool.filter((e) => !dismissedKeys.has(e.key)).slice(0, QUICK_SWITCH_MAX_VISIBLE);
  }, [mergedRecords, items, dismissedKeys, subItemTitles]);

  const dismissEntry = useCallback((key: string) => {
    setDismissedKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      saveDismissedKeys(next);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setHistoryLoading(true);
      try {
        const end = formatDate(new Date());
        const start = new Date();
        start.setDate(start.getDate() - 6);
        const params = new URLSearchParams({
          date_from: formatDate(start),
          date_to: end,
          type: '发生',
          limit: '80',
        });
        const res = await fetch(`/api/v2/records?${params.toString()}`);
        if (cancelled) return;
        const data = await res.json();
        setHistoryRecords(data.data ?? []);
      } catch {
        if (!cancelled) setHistoryRecords([]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const handleSwitch = (payload: {
    item_id?: string | null;
    sub_item_id?: string | null;
    tool_label?: string | null;
  }) => {
    const today = formatDate(new Date());
    const optimistic = buildOptimisticActiveRecord({
      item_id: payload.item_id,
      sub_item_id: payload.sub_item_id,
      tool_label: payload.tool_label,
      items,
      date: today,
    });
    onSwitched?.({ record: optimistic, stopped: [] });

    void (async () => {
      try {
        const res = await fetch('/api/v2/activities/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const d = await res.json();
        if (!res.ok) {
          throw new Error(d.error?.message ?? '切换失败');
        }
        if (payload.tool_label?.trim()) {
          void persistToolOptionIfNeeded(payload.tool_label);
        }
        onSwitched?.(d.data as ActivitySwitchResult);
      } catch (e) {
        onError?.(e instanceof Error ? e.message : '切换失败');
      }
    })();
  };

  const runSwitch = (entry: QuickSwitchEntry, toolLabel: string | null) => {
    handleSwitch({
      item_id: entry.item_id,
      sub_item_id: entry.sub_item_id,
      tool_label: toolLabel,
    });
  };

  const handleQuickSwitch = (entry: QuickSwitchEntry) => {
    if (
      shouldPromptQuickSwitchToolPicker(entry, items, userTools.length) &&
      !toolsLoading
    ) {
      setPendingEntry(entry);
      return;
    }
    runSwitch(entry, null);
  };

  if (!historyLoading && visibleEntries.length === 0) {
    return null;
  }

  const userToolTitles = userTools.map((t) => t.title);

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-800">快速切换</h2>
        </div>

        {historyLoading && visibleEntries.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            加载最近使用…
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleEntries.map((entry) => (
                <div
                  key={entry.key}
                  className="flex max-w-full items-center gap-0.5 rounded-full border border-slate-200 bg-white pl-3 pr-1 py-1.5 shadow-sm hover:border-blue-300 hover:bg-blue-50"
                >
                  <button
                    type="button"
                    onClick={() => handleQuickSwitch(entry)}
                    className="flex min-w-0 items-center gap-1.5 text-xs text-slate-700"
                  >
                    <span className="max-w-[12rem] truncate">{entry.label}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissEntry(entry.key)}
                    className="shrink-0 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-500"
                    aria-label="从快速切换移除"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {pendingEntry && (
        <QuickSwitchToolPicker
          entryLabel={pendingEntry.label}
          contextTools={pendingEntry.contextToolLabels}
          allTools={userToolTitles}
          loading={toolsLoading}
          onSelect={(tool) => {
            const entry = pendingEntry;
            setPendingEntry(null);
            runSwitch(entry, tool);
          }}
          onClose={() => setPendingEntry(null)}
        />
      )}
    </>
  );
}
