'use client';

import { useState } from 'react';
import { Lightbulb, Sparkles, Loader2, ExternalLink } from 'lucide-react';
import type { InsightFact } from '@/types/teto';

interface FactSourcePanelProps {
  facts: InsightFact[];
}

export default function FactSourcePanel({ facts }: FactSourcePanelProps) {
  const [showTrace, setShowTrace] = useState(false);
  const [polished, setPolished] = useState<string | null>(null);
  const [polishing, setPolishing] = useState(false);

  if (facts.length === 0) return null;

  const handlePolish = async () => {
    if (polishing) return;
    setPolishing(true);
    try {
      const res = await fetch('/api/v2/insights/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facts: facts.map(f => f.text) }),
      });
      const json = await res.json();
      if (json.data?.polished) {
        setPolished(json.data.polished);
      }
    } catch {
      // 润色失败不影响展示
    } finally {
      setPolishing(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-bold text-slate-700">事实来源</h3>
        <span className="text-[10px] text-slate-400 ml-auto">基于规则生成</span>
        <button
          onClick={() => setShowTrace(!showTrace)}
          className={`ml-1 text-[10px] px-2 py-0.5 rounded-full transition-colors ${showTrace ? 'bg-slate-100 text-slate-600' : 'bg-transparent text-slate-400 hover:bg-slate-50'}`}
        >
          {showTrace ? '隐藏依据' : '显示依据'}
        </button>
        <button
          onClick={handlePolish}
          disabled={polishing}
          className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-purple-50 text-purple-600 hover:bg-purple-100 disabled:opacity-50 transition-colors"
        >
          {polishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {polishing ? '润色中...' : 'AI润色'}
        </button>
      </div>

      {polished ? (
        <div>
          <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{polished}</p>
          <button
            onClick={() => setPolished(null)}
            className="mt-2 text-[10px] text-slate-400 hover:text-slate-600"
          >
            查看原始事实列表
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {facts.map((fact, i) => (
            <li key={i}>
              <p className="text-xs text-slate-600 leading-relaxed">{fact.text}</p>
              {showTrace && (
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                  <span>时间：{fact.timeScope}</span>
                  <span className="text-slate-300">|</span>
                  <span>来源：{fact.source}</span>
                  {fact.itemId && (
                    <>
                      <span className="text-slate-300">|</span>
                      <a href={`/items/${fact.itemId}`} className="inline-flex items-center gap-0.5 text-blue-500 hover:text-blue-600">
                        <ExternalLink className="h-2.5 w-2.5" />
                        查看事项
                      </a>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-slate-300 mt-3">润色仅改写表达，不新增事实、不修改数字、不做推断</p>
    </div>
  );
}
