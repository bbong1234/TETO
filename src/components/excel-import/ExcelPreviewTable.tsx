'use client';

import React from 'react';
import type { ValidatedRow } from '@/lib/excel/validator';

interface ExcelPreviewTableProps {
  rows: ValidatedRow[];
  maxRows?: number;
}

const statusConfig = {
  valid: {
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    icon: '✅',
    label: '有效',
  },
  error: {
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: '❌',
    label: '错误',
  },
  conflict: {
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: '🔶',
    label: '冲突',
  },
};

export default function ExcelPreviewTable({ rows, maxRows = 20 }: ExcelPreviewTableProps) {
  const displayRows = rows.slice(0, maxRows);
  const hasMore = rows.length > maxRows;

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        暂无数据
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto max-h-80">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600 border-b">行号</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600 border-b">日期</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600 border-b">任务名称</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600 border-b">完成状态</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600 border-b">数值</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600 border-b">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {displayRows.map((row) => {
              const config = statusConfig[row.status];
              return (
                <tr
                  key={row.rowIndex}
                  className={`${config.bgColor} ${row.errorMessage ? 'cursor-help' : ''}`}
                  title={row.errorMessage || ''}
                >
                  <td className="px-3 py-2 text-slate-600">{row.rowIndex}</td>
                  <td className="px-3 py-2 text-slate-900">{row.date}</td>
                  <td className="px-3 py-2 text-slate-900">{row.taskName}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {row.valueBoolean === null ? '-' : row.valueBoolean ? '是' : '否'}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {row.valueNumber === null ? '-' : row.valueNumber}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center text-xs">
                      <span className="mr-1">{config.icon}</span>
                      <span className={row.status === 'error' ? 'text-red-600 font-medium' : ''}>
                        {config.label}
                      </span>
                    </span>
                    {row.errorMessage && (
                      <div className="text-xs text-red-500 mt-0.5 max-w-xs truncate">
                        {row.errorMessage}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="px-3 py-2 bg-slate-50 text-xs text-slate-500 text-center border-t">
          仅显示前 {maxRows} 条，共 {rows.length} 条数据
        </div>
      )}
    </div>
  );
}
