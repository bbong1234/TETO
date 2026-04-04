'use client';

import React from 'react';
import type { TaskDefinition, TaskRecordFormValues, TaskGoal } from '@/types/tasks';
import { Edit2, Trash2 } from 'lucide-react';
import { calculateCompletion, getCompletionColor, formatCompletion } from '../utils/taskUtils';

interface TaskRowProps {
  task: TaskDefinition;
  record: TaskRecordFormValues;
  goal?: TaskGoal | null;
  accumulatedValue?: { booleanValue: boolean; numberValue: number };
  projectName?: string;
  onRecordChange: (values: TaskRecordFormValues) => void;
  onSaveRecord: () => void;
  onEdit: () => void;
  onDeactivate: () => void;
  columnWidths?: Record<string, number>;
}

export default function TaskRow({
  task,
  record,
  goal,
  accumulatedValue,
  projectName,
  onRecordChange,
  onSaveRecord,
  onEdit,
  onDeactivate,
  columnWidths = {},
}: TaskRowProps) {
  const completion = calculateCompletion(task, record, goal, accumulatedValue);
  const completionColor = getCompletionColor(completion);
  
  // 计算当前累计值
  const currentAccumulated = accumulatedValue?.numberValue ?? (record.value_number ?? 0);

  // 任务类型中文映射
  const taskTypeMap = {
    boolean: '完成/未完成',
    count: '次数型',
    number: '数值型'
  };

  // 周期中文映射
  const periodMap = {
    day: '每日',
    week: '每周',
    month: '每月',
    year: '每年',
    custom: '自定义'
  };

  return (
    <div className="flex items-center hover:bg-slate-50 transition-colors pl-12">
      {/* 任务名称 */}
      <div style={{ width: `${columnWidths['name'] || 200}px`, padding: '0 1rem' }}>
        <div className="flex items-center space-x-2">
          <span className="font-medium text-slate-900">{task.name}</span>
          <span className="ml-2 text-xs text-slate-500">
            {taskTypeMap[task.task_type]}
          </span>
        </div>
        <div className="text-xs text-slate-400 mt-1">
          项目：{projectName || '未关联项目'}
        </div>
      </div>

      {/* 单位 */}
      <div style={{ width: `${columnWidths['unit'] || 100}px`, padding: '0 1rem' }} className="text-slate-600">
        {task.unit_name || '-'}
      </div>

      {/* 目标 */}
      <div style={{ width: `${columnWidths['goal'] || 120}px`, padding: '0 1rem' }} className="text-slate-600">
        {goal && goal.is_enabled ? (
          <div className="text-sm">
            <span className="font-medium">{goal.goal_value}</span>
            <span className="text-xs text-slate-500 ml-1">
              {periodMap[goal.period]}
              {goal.period === 'custom' && goal.custom_period_days ? `(${goal.custom_period_days}天)` : ''}
            </span>
          </div>
        ) : (
          <span className="text-xs text-slate-400">无目标</span>
        )}
      </div>

      {/* 当前值 */}
      <div style={{ width: `${columnWidths['current'] || 100}px`, padding: '0 1rem' }} className="text-slate-600">
        {goal && goal.is_enabled && task.task_type !== 'boolean' ? (
          <div className="text-sm">
            <span className="font-medium">{currentAccumulated}</span>
            <span className="text-xs text-slate-500 ml-1">{task.unit_name}</span>
          </div>
        ) : (
          <span className="text-xs text-slate-400">-</span>
        )}
      </div>

      {/* 今日值输入 */}
      <div style={{ width: `${columnWidths['today'] || 120}px`, padding: '0 1rem' }}>
        {task.task_type === 'boolean' ? (
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={record.value_boolean || false}
              onChange={(e) => {
                onRecordChange({ value_boolean: e.target.checked });
                // 自动保存
                setTimeout(onSaveRecord, 100);
              }}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-600">
              {record.value_boolean ? '已完成' : '未完成'}
            </span>
          </label>
        ) : (
          <div className="flex items-center space-x-2">
            <input
              type="number"
              value={record.value_number ?? ''}
              onChange={(e) => {
                const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                onRecordChange({ value_number: value });
              }}
              onBlur={onSaveRecord}
              placeholder="0"
              className="w-20 px-2 py-1 text-sm rounded border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-500">{task.unit_name}</span>
          </div>
        )}
      </div>

      {/* 完成度 */}
      <div style={{ width: `${columnWidths['completion'] || 100}px`, padding: '0 1rem' }}>
        <div className="flex items-center space-x-2">
          <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${completionColor}`}
              style={{ width: `${completion}%` }}
            />
          </div>
          <span className="text-xs text-slate-500 w-8">{formatCompletion(completion)}</span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div style={{ width: `${columnWidths['actions'] || 100}px`, padding: '0 1rem' }} className="flex items-center justify-end space-x-2">
        <button
          onClick={onEdit}
          className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="编辑任务"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button
          onClick={onDeactivate}
          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          title="停用任务"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
