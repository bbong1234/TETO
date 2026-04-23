'use client';

import { Pencil, Trash2, History, Target, ArrowUpRight } from 'lucide-react';
import type { Phase, PhaseStatus } from '@/types/teto';

interface PhaseCardProps {
  phase: Phase;
  goalTitle?: string | null; // 关联目标标题
  onEdit: (phase: Phase) => void;
  onDelete: (phaseId: string) => void;
  onPromoteToItem?: (phase: Phase) => void;
}

// 状态中文映射（直接使用中文值）
const STATUS_LABELS: Record<PhaseStatus, string> = {
  '进行中': '进行中',
  '已结束': '已结束',
  '停滞': '停滞',
};

// 状态颜色映射
const STATUS_COLORS: Record<PhaseStatus, string> = {
  '进行中': 'bg-blue-100 text-blue-700',
  '已结束': 'bg-slate-100 text-slate-500',
  '停滞': 'bg-orange-100 text-orange-700',
};

export default function PhaseCard({ phase, goalTitle, onEdit, onDelete, onPromoteToItem }: PhaseCardProps) {
  // 格式化日期显示
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '未设置';
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // 格式化日期范围
  const formatDateRange = (): string => {
    const start = formatDate(phase.start_date);
    const end = formatDate(phase.end_date);
    if (phase.start_date && phase.end_date) {
      return `${start} ~ ${end}`;
    } else if (phase.start_date) {
      return `${start} 开始`;
    } else if (phase.end_date) {
      return `至 ${end}`;
    }
    return '时间未设置';
  };

  return (
    <div className={`rounded-xl p-4 shadow-sm border transition-all hover:shadow-md ${
      phase.is_historical
        ? 'bg-amber-50/50 border-amber-200 hover:border-amber-300'
        : 'bg-white border-slate-200 hover:border-blue-200'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* 时间范围 — 最醒目，放第一行 */}
          <p className={`text-[13px] font-semibold mb-1 ${
            phase.is_historical ? 'text-amber-700' : 'text-slate-700'
          }`}>
            {formatDateRange()}
          </p>

          {/* 标题 + 历史标签 */}
          <div className="flex items-center gap-2 mb-1">
            <h4 className={`text-sm font-medium truncate ${
              phase.is_historical ? 'text-amber-900' : 'text-slate-900'
            }`}>{phase.title}</h4>
            {phase.is_historical && (
              <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                <History className="h-3 w-3" />
                历史
              </span>
            )}
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[phase.status]}`}>
              {STATUS_LABELS[phase.status]}
            </span>
          </div>
          
          {/* 描述 */}
          {phase.description && (
            <p className="text-xs text-slate-500 line-clamp-2 mb-1">{phase.description}</p>
          )}
          
          {/* 关联目标（1.4 中目标通过 goals.phase_id 反向关联，此处留作未来展示位） */}
          {goalTitle && (
            <div className="flex items-center gap-1 mt-1">
              <Target className="h-3 w-3 text-purple-400" />
              <span className="text-[10px] text-purple-600 truncate">{goalTitle}</span>
            </div>
          )}
        </div>
        
        {/* 操作 */}
        <div className="flex items-center gap-1 shrink-0">
          {onPromoteToItem && (
            <button
              onClick={() => onPromoteToItem(phase)}
              className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
              title="升级为事项"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => onEdit(phase)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            title="编辑"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(phase.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
            title="删除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
