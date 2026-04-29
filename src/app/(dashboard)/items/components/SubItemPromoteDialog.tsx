'use client';

import { useState } from 'react';
import { X, ArrowUpRight, Loader2, FileText, AlertTriangle } from 'lucide-react';
import type { SubItem } from '@/types/teto';

interface SubItemPromoteDialogProps {
  subItem: SubItem;
  onConfirm: (migrateRecords: boolean) => void;
  onClose: () => void;
  promoting?: boolean;
}

/**
 * 子项升格确认对话框
 * 根据功能方案：
 * - 显示子项名称 → 新事项名称预览
 * - 选项：「迁移历史记录到新事项」（默认勾选）
 * - 提示：原子项将保留在原事项下
 */
export default function SubItemPromoteDialog({ subItem, onConfirm, onClose, promoting }: SubItemPromoteDialogProps) {
  const [migrateRecords, setMigrateRecords] = useState(true);

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* 对话框 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="glass-heavy rounded-3xl shadow-soft-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
          {/* 头部 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500">
                <ArrowUpRight className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-slate-900">升格为独立事项</h2>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              disabled={promoting}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 内容 */}
          <div className="px-6 py-5 space-y-4">
            {/* 预览 */}
            <div className="rounded-xl bg-slate-50/80 p-4 border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">子项</span>
                  <span className="text-sm font-medium text-slate-700">「{subItem.title}」</span>
                </div>
                <ArrowUpRight className="h-4 w-4 text-indigo-400 shrink-0" />
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">事项</span>
                  <span className="text-sm font-bold text-indigo-700">「{subItem.title}」</span>
                </div>
              </div>
              {subItem.description && (
                <p className="text-xs text-slate-400 mt-2 line-clamp-2">{subItem.description}</p>
              )}
            </div>

            {/* 迁移选项 */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={migrateRecords}
                onChange={(e) => setMigrateRecords(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-500"
              />
              <div>
                <span className="text-sm font-medium text-slate-700">迁移历史记录到新事项</span>
                <p className="text-xs text-slate-400 mt-0.5">
                  将该子项下的所有记录转移到新事项下。取消勾选则记录保留在原事项。
                </p>
              </div>
            </label>

            {/* 提示 */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                原子项将保留在原事项下（它是原事项历史的一部分，不能被删除）。关联的目标也会一并迁移到新事项。
              </p>
            </div>
          </div>

          {/* 底部按钮 */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
            <button
              onClick={onClose}
              disabled={promoting}
              className="rounded-xl bg-white/60 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-white/80 transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={() => onConfirm(migrateRecords)}
              disabled={promoting}
              className="rounded-xl bg-indigo-500 hover:bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {promoting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  升格中...
                </>
              ) : (
                <>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  确认升格
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
