'use client';

import { useState } from 'react';
import { Plus, X, Pencil, Check, Trash2, ArrowUpRight, HelpCircle } from 'lucide-react';
import type { SubItem } from '@/types/teto';

interface SubItemTabBarProps {
  subItems: SubItem[];
  activeSubItemId: string | null;  // null = 全部, '__orphan__' = 未归类
  orphanCount?: number;  // 未归类记录数
  onTabChange: (subItemId: string | null) => void;
  onAdd: () => void;
  onEdit: (subItem: SubItem) => void;
  onPromote: (subItem: SubItem) => void;
}

export default function SubItemTabBar({
  subItems,
  activeSubItemId,
  orphanCount = 0,
  onTabChange,
  onAdd,
  onEdit,
  onPromote,
}: SubItemTabBarProps) {
  if (subItems.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* 全部 Tab */}
      <button
        onClick={() => onTabChange(null)}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          activeSubItemId === null
            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800'
        }`}
      >
        全部
      </button>

      {/* 子项 Tab */}
      {subItems.map((sub) => (
        <div key={sub.id} className="group relative">
          <button
            onClick={() => onTabChange(sub.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeSubItemId === sub.id
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            {sub.title}
          </button>
          {/* 操作按钮：hover 时显示 */}
          <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(sub); }}
              className="p-0.5 rounded bg-white dark:bg-gray-800 shadow text-gray-400 hover:text-blue-500"
              title="编辑"
            >
              <Pencil size={10} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onPromote(sub); }}
              className="p-0.5 rounded bg-white dark:bg-gray-800 shadow text-gray-400 hover:text-green-500"
              title="升格为独立事项"
            >
              <ArrowUpRight size={10} />
            </button>
          </div>
        </div>
      ))}

      {/* 未归类 Tab — 有游离记录时显示 */}
      {orphanCount > 0 && (
        <button
          onClick={() => onTabChange('__orphan__')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-dashed ${
            activeSubItemId === '__orphan__'
              ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700'
              : 'text-amber-400 hover:text-amber-600 hover:bg-amber-50 border-amber-200 dark:text-amber-500 dark:hover:bg-amber-900/20 dark:border-amber-700'
          }`}
        >
          <HelpCircle size={12} />
          未归类
          <span className="rounded-full bg-amber-200/60 dark:bg-amber-800/40 px-1.5 py-0.5 text-[10px] leading-none">{orphanCount}</span>
        </button>
      )}

      {/* 新建子项 */}
      <button
        onClick={onAdd}
        className="px-2 py-1.5 rounded-lg text-sm text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
