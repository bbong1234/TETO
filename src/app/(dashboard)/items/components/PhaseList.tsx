'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Loader2, Layers, Filter } from 'lucide-react';
import type { Phase } from '@/types/teto';
import PhaseCard from './PhaseCard';

type PhaseFilter = 'all' | 'current' | 'historical';

interface PhaseListProps {
  itemId: string;
  onEditPhase: (phase: Phase) => void;
  onCreatePhase: () => void;
  onPromoteToItem?: (phase: Phase) => void;
  refreshKey?: number;
  goalMap?: Record<string, string>; // goal_id → goal_title 映射
}

export default function PhaseList({ itemId, onEditPhase, onCreatePhase, onPromoteToItem, refreshKey = 0, goalMap }: PhaseListProps) {
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PhaseFilter>('all');

  const fetchPhases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/phases?item_id=${itemId}`);
      const data = await res.json();
      if (data.data) {
        // 按 start_date 升序排序（最早的在上面）
        const sorted = [...data.data].sort((a: Phase, b: Phase) => {
          const dateA = a.start_date || a.created_at;
          const dateB = b.start_date || b.created_at;
          return new Date(dateA).getTime() - new Date(dateB).getTime();
        });
        setPhases(sorted);
      }
    } catch (err) {
      console.error('加载阶段失败:', err);
      setError('加载阶段失败');
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    fetchPhases();
  }, [fetchPhases, refreshKey]);

  // 根据筛选条件过滤阶段
  const filteredPhases = useMemo(() => {
    switch (filter) {
      case 'current':
        return phases.filter(p => !p.is_historical);
      case 'historical':
        return phases.filter(p => p.is_historical);
      default:
        return phases;
    }
  }, [phases, filter]);

  // 统计数量
  const currentCount = phases.filter(p => !p.is_historical).length;
  const historicalCount = phases.filter(p => p.is_historical).length;

  const handleDelete = async (phaseId: string) => {
    if (!confirm('确定删除此阶段？此操作不可恢复。')) return;
    try {
      const res = await fetch(`/api/v2/phases/${phaseId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchPhases();
      } else {
        const errData = await res.json();
        alert(errData.error || '删除失败');
      }
    } catch (err) {
      console.error('删除阶段失败:', err);
      alert('删除失败，请重试');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={fetchPhases}
          className="mt-2 text-xs text-red-600 hover:text-red-700 underline"
        >
          重试
        </button>
      </div>
    );
  }

  if (phases.length === 0) {
    return (
      <div className="rounded-xl bg-slate-50 p-6 text-center border border-dashed border-slate-200">
        <Layers className="h-8 w-8 mx-auto text-slate-300 mb-2" />
        <p className="text-sm text-slate-500">暂无阶段</p>
        <p className="text-xs text-slate-400 mt-1">当这个事项的某段时间值得被单独概括时，再来创建。</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 筛选按钮 */}
      <div className="flex items-center gap-2 mb-3">
        <Filter className="h-3.5 w-3.5 text-slate-400" />
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
              filter === 'all'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            全部 ({phases.length})
          </button>
          <button
            onClick={() => setFilter('current')}
            className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
              filter === 'current'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            当前 ({currentCount})
          </button>
          <button
            onClick={() => setFilter('historical')}
            className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
              filter === 'historical'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            历史 ({historicalCount})
          </button>
        </div>
      </div>

      {/* 阶段列表 */}
      {filteredPhases.length === 0 ? (
        <div className="rounded-xl bg-slate-50 p-4 text-center border border-dashed border-slate-200">
          <p className="text-sm text-slate-400">
            {filter === 'current' ? '暂无当前阶段' : filter === 'historical' ? '暂无历史阶段' : '暂无阶段'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPhases.map((phase) => (
            <PhaseCard
              key={phase.id}
              phase={phase}
              goalTitle={null}
              onEdit={onEditPhase}
              onDelete={handleDelete}
              onPromoteToItem={onPromoteToItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}
