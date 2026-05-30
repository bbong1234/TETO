'use client';

import { Loader2 } from 'lucide-react';

function Bone({ className }: { className: string }) {
  return <div className={`rounded bg-slate-200 ${className}`} />;
}

/** 当前活动卡片占位 */
export function CurrentActivityCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <Bone className="h-4 w-24" />
        <Bone className="h-6 w-16 rounded-full" />
      </div>
      <Bone className="h-10 w-full rounded-xl" />
      <div className="flex gap-2">
        <Bone className="h-8 flex-1 rounded-lg" />
        <Bone className="h-8 flex-1 rounded-lg" />
        <Bone className="h-8 w-20 rounded-lg" />
      </div>
    </div>
  );
}

/** 记录页：单日时间线 + 统计占位 */
export function RecordsDayContentSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Bone className="h-4 w-4 rounded" />
          <Bone className="h-4 w-28" />
          <Bone className="h-3 w-8 ml-auto" />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3">
            <Bone className="h-3 w-10 shrink-0" />
            <Bone className="h-12 flex-1 rounded-xl" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <Bone className="h-4 w-32" />
        <div className="flex gap-2">
          <Bone className="h-8 flex-1 rounded-lg" />
          <Bone className="h-8 flex-1 rounded-lg" />
          <Bone className="h-8 flex-1 rounded-lg" />
        </div>
        <Bone className="h-2 w-full rounded-full" />
      </div>
      <div className="flex items-center justify-center gap-2 pt-1 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        加载记录…
      </div>
    </div>
  );
}

/** 记录页：多日横向列占位 */
export function RecordsMultiDaySkeleton() {
  return (
    <div className="flex h-full gap-3 px-4 py-4 animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex-shrink-0 w-[380px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3"
        >
          <Bone className="h-4 w-24 mx-auto" />
          <Bone className="h-16 w-full rounded-xl" />
          <Bone className="h-12 w-full rounded-xl" />
          <Bone className="h-12 w-full rounded-xl" />
          <Bone className="h-10 w-full rounded-xl" />
        </div>
      ))}
      <div className="flex flex-col items-center justify-center gap-2 px-4 text-sm text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
        加载记录…
      </div>
    </div>
  );
}

/** 事项桌面：大类分组占位 */
export function ItemsDesktopSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass rounded-2xl p-5 shadow-soft space-y-4">
          <div className="flex items-center justify-between">
            <Bone className="h-4 w-20" />
            <Bone className="h-3 w-16" />
          </div>
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
            {[1, 2, 3, 4].map((j) => (
              <Bone key={j} className="h-[120px] rounded-3xl" />
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
        加载事项…
      </div>
    </div>
  );
}

/** 洞察页：各面板占位 */
export function InsightsPageSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {[1, 2].map((i) => (
        <div key={`tl-${i}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <Bone className="h-4 w-32" />
          {[1, 2, 3].map((j) => (
            <Bone key={j} className="h-10 w-full rounded-xl" />
          ))}
        </div>
      ))}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Bone className="h-4 w-28 mb-4" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 28 }).map((_, k) => (
            <Bone key={k} className="h-6 w-full rounded" />
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
        <Bone className="h-4 w-24" />
        <Bone className="h-16 w-full rounded-xl" />
        <Bone className="h-16 w-full rounded-xl" />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <Bone className="h-4 w-20" />
        <div className="flex gap-2">
          <Bone className="h-8 w-16 rounded-lg" />
          <Bone className="h-8 w-16 rounded-lg" />
          <Bone className="h-8 w-16 rounded-lg" />
        </div>
        <Bone className="h-40 w-full rounded-xl" />
      </div>
      <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        加载洞察…
      </div>
    </div>
  );
}
