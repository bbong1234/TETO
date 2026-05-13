'use client';

import { useState } from 'react';
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import type { InsightFact } from '@/types/teto';

export default function InsightSummaryPanel({ facts }: { facts: InsightFact[] }) {
  const [showTrace, setShowTrace] = useState(false);

  if (facts.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <h2 className="text-base font-semibold text-slate-800">本期摘要</h2>
        </div>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-8 text-center">
          <p className="text-sm text-slate-400">暂无足够数据生成摘要。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        <h2 className="text-base font-semibold text-slate-800">本期摘要</h2>
        <button
          onClick={() => setShowTrace(!showTrace)}
          className={`ml-auto text-[10px] px-2 py-0.5 rounded-full transition-colors ${showTrace ? 'bg-slate-100 text-slate-600' : 'bg-transparent text-slate-400 hover:bg-slate-50'}`}
        >
          {showTrace ? '隐藏依据' : '显示依据'}
        </button>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
        <ul className="space-y-2">
          {facts.map((fact, i) => (
            <li key={i}>
              <p className="text-sm text-slate-700 leading-relaxed">{fact.text}</p>
              {showTrace && (
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                  <span>时间：{fact.timeScope}</span>
                  <span className="text-slate-300">|</span>
                  <span>来源：{fact.source}</span>
                  {fact.itemId && (
                    <>
                      <span className="text-slate-300">|</span>
                      <a href={`/items/${fact.itemId}`} className="text-blue-500 hover:text-blue-600">查看事项</a>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
