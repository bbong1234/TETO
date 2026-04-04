'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { TaskDefinition, TaskRecordFormValues, NewTaskFormValues } from '@/types/tasks';
import type { Project } from '@/types/projects';
import TaskFormModal from './components/TaskFormModal';
import TaskRow from './components/TaskRow';
import ExcelImportModal from '@/components/excel-import/ExcelImportModal';
import DraggableTaskRow from '@/components/ui/draggable-task-row';
import DraggableTaskItem from '@/components/ui/draggable-task-item';
import DraggableColumnHeader from '@/components/ui/draggable-column-header';
import ResizableColumnHeader from '@/components/ui/resizable-column-header';
import ResizableTableHeader from '@/components/ui/resizable-table-header';
import RowResizer from '@/components/ui/row-resizer';
import { useTaskManagement } from './hooks/useTaskManagement';
import { calculateCompletion, getCompletionColor, formatCompletion } from './utils/taskUtils';
import { Upload, Edit2, Trash2 } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export default function TaskManagementClient() {
  const {
    currentDate,
    setCurrentDate,
    tasks,
    taskRecords,
    totalTaskRecords,
    taskGoals,
    taskAccumulatedValues,
    isLoading,
    isLoadingTotalRecords,
    isSaving,
    showTaskModal,
    editingTask,
    dateRange,
    toast,
    loadTodayTasksAndRecords,
    loadTotalTaskRecords,
    handlePreviousDay,
    handleNextDay,
    handleBackToToday,
    handleRecordChange,
    handleSaveRecord,
    handleSaveAllRecords,
    handleNewTask,
    handleEditTask,
    handleSaveTask,
    handleSaveGoal,
    handleDeactivateTask,
    handleDeleteTask,
    updateDateRange,
    setShowTaskModal,
  } = useTaskManagement();

  // 视图状态
  const [viewMode, setViewMode] = useState<'tasks' | 'today' | 'total'>('tasks');
  
  // 项目列表状态
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(false);
  
  // 加载项目列表
  const loadProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const response = await fetch('/api/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('加载项目列表失败:', error);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  // 处理视图切换
  const handleViewModeChange = (mode: 'tasks' | 'today' | 'total') => {
    setViewMode(mode);
    if (mode === 'tasks') {
      loadTodayTasksAndRecords();
    } else if (mode === 'today') {
      loadTodayTasksAndRecords();
    } else if (mode === 'total') {
      loadTotalTaskRecords();
    }
  };

  // 任务列表筛选状态
  const [taskFilter, setTaskFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // 排序状态
  const [sortConfig, setSortConfig] = useState<{ key: keyof TaskDefinition; direction: 'asc' | 'desc' }>({ key: 'created_at', direction: 'desc' });

  // Excel 导入弹窗状态
  const [showImportModal, setShowImportModal] = useState(false);
  
  // 总表视图模式
  const [totalViewMode, setTotalViewMode] = useState<'30days' | 'all'>('30days');

  // 总表列排序相关状态
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [isSavingColumnOrder, setIsSavingColumnOrder] = useState<boolean>(false);
  const prevActiveTaskIdsRef = React.useRef<string[]>([]);

  // 任务排序相关状态
  const [taskOrder, setTaskOrder] = useState<string[]>([]);
  const [isSavingTaskOrder, setIsSavingTaskOrder] = useState<boolean>(false);
  const prevTaskOrderRef = React.useRef<string[]>([]);
  
  // 行高状态
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});
  
  // 列宽状态
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  
  // 处理行高变化
  const handleRowHeightChange = (rowId: string, height: number) => {
    setRowHeights(prev => ({
      ...prev,
      [rowId]: height
    }));
  };
  
  // 处理列宽变化
  const handleColumnWidthChange = (columnId: string, width: number) => {
    setColumnWidths(prev => ({
      ...prev,
      [columnId]: width
    }));
  };

  // 拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor)
  );







  // 保存任务排序
  const saveTaskOrder = useCallback(async (newOrder: string[]) => {
    setIsSavingTaskOrder(true);
    try {
      const response = await fetch('/api/tasks/sort', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskIds: newOrder }),
      });

      if (response.ok) {
        return true;
      } else {
        console.error('保存任务顺序失败');
        return false;
      }
    } catch (error) {
      console.error('保存任务排序失败:', error);
      return false;
    } finally {
      setIsSavingTaskOrder(false);
    }
  }, []);

  // 处理总表列拖拽结束
  const handleColumnDragEnd = useCallback((event: any) => {
    const { active, over } = event;
    
    if (!over) return;
    
    // 从事件中获取当前的顺序，而不是依赖外部状态
    const currentOrder = [...columnOrder];
    const oldIndex = currentOrder.indexOf(active.id);
    const newIndex = currentOrder.indexOf(over.id);
    
    if (oldIndex !== newIndex) {
      const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
      setColumnOrder(newOrder);
      // 这里可以保存列顺序到数据库
    }
  }, [columnOrder]);

  // 组件挂载时加载项目列表和任务
  useEffect(() => {
    loadProjects();
    loadTodayTasksAndRecords();
  }, [loadTodayTasksAndRecords]);

  // 筛选任务（不依赖 taskOrder 进行排序）
  const filteredTasks = tasks.filter(task => {
    // 状态筛选
    if (taskFilter === 'active' && task.status !== 'active') return false;
    if (taskFilter === 'inactive' && task.status !== 'inactive') return false;
    
    // 搜索筛选
    if (searchQuery && !task.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    
    return true;
  });

  // 当任务列表变化时，初始化任务排序
  useEffect(() => {
    if (tasks.length > 0) {
      // 初始顺序使用任务的创建时间
      const initialOrder = [...tasks]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map(task => task.id);
      setTaskOrder(initialOrder);
      prevTaskOrderRef.current = initialOrder;
    }
  }, [tasks]);

  // 当过滤后的任务变化时，更新总表列顺序
  useEffect(() => {
    if (filteredTasks.length > 0) {
      const activeTaskIds = filteredTasks
        .filter(task => task.status === 'active')
        .map(task => task.id);
      
      // 只有当顺序真正改变时才更新，避免无限循环
      if (JSON.stringify(activeTaskIds) !== JSON.stringify(prevActiveTaskIdsRef.current)) {
        setColumnOrder(activeTaskIds);
        prevActiveTaskIdsRef.current = activeTaskIds;
      }
    }
  }, [filteredTasks]);

  // 处理任务拖拽结束
  const handleTaskDragEnd = useCallback((event: any) => {
    const { active, over } = event;
    
    if (!over) return;
    
    // 使用 taskOrder 的当前顺序来计算索引
    const oldIndex = taskOrder.indexOf(active.id);
    const newIndex = taskOrder.indexOf(over.id);
    
    if (oldIndex !== newIndex) {
      const newOrder = arrayMove(taskOrder, oldIndex, newIndex);
      setTaskOrder(newOrder);
      // 保存新的排序顺序
      saveTaskOrder(newOrder);
    }
  }, [taskOrder, saveTaskOrder]);

  // 处理排序
  const handleSort = (key: keyof TaskDefinition) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // 生成日期范围内的所有日期（倒序）
  const generateDateRange = (start: string, end: string): string[] => {
    const dates: string[] = [];
    const current = new Date(start);
    const last = new Date(end);
    
    while (current <= last) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    
    // 反转数组，使最新日期在前面
    return dates.reverse();
  };

  // 获取指定日期和任务的记录值
  const getRecordValue = (date: string, taskId: string) => {
    const record = totalTaskRecords.find(r => r.record_date === date && r.task_id === taskId);
    return record;
  };

  // 处理总表单元格编辑
  const handleTotalRecordChange = async (date: string, taskId: string, value: any) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    let recordValues: any = {};
    if (task.task_type === 'boolean') {
      recordValues = { value_boolean: value, value_number: undefined };
    } else {
      recordValues = { value_boolean: undefined, value_number: parseFloat(value) || 0 };
    }

    try {
      const response = await fetch('/api/task-records', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task_id: taskId,
          record_date: date,
          ...recordValues,
        }),
      });

      if (response.ok) {
        // 重新加载总表数据
        await fetch(`/api/task-records?start_date=${dateRange.start}&end_date=${dateRange.end}`)
          .then(res => res.json())
          .then(data => {
            // 这里需要通过useTaskManagement的方法更新数据
            // 暂时通过刷新页面来模拟
            window.location.reload();
          });
      }
    } catch (error) {
      console.error('保存记录失败:', error);
    }
  };

  // 加载所有任务记录（用于冲突检测）
  const loadAllTaskRecords = useCallback(async () => {
    try {
      const response = await fetch('/api/task-records?all=true');
      if (response.ok) {
        const records = await response.json();
        return records;
      }
      return [];
    } catch (error) {
      console.error('加载所有任务记录失败:', error);
      return [];
    }
  }, []);

  // 处理 Excel 导入
  const handleImport = useCallback(async (records: Array<{
    date: string;
    taskId: string;
    valueBoolean: boolean | null;
    valueNumber: number | null;
  }>, overrideConflicts: boolean) => {
    const response = await fetch('/api/task-records/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records, overrideConflicts }),
    });

    if (!response.ok) {
      throw new Error('导入失败');
    }

    const result = await response.json();

    // 刷新数据
    if (viewMode === 'today') {
      await loadTodayTasksAndRecords();
    } else if (viewMode === 'total') {
      await loadTotalTaskRecords();
    }

    return result;
  }, [viewMode, loadTodayTasksAndRecords, loadTotalTaskRecords]);





  return (
    <div className="max-w-7xl mx-auto p-4">
      {/* 页面标题 */}
      <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">任务管理</h1>
          <div className="flex items-center space-x-3">
            {/* 视图切换 */}
            <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => handleViewModeChange('tasks')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === 'tasks' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
              >
                任务列表
              </button>
              <button
                onClick={() => handleViewModeChange('today')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === 'today' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
              >
                今日数据表
              </button>
              <button
                onClick={() => handleViewModeChange('total')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === 'total' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
              >
                记录总表
              </button>
            </div>
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            导入记录
          </button>
          <button
            onClick={handleNewTask}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            + 新建任务
          </button>
        </div>
      </div>

      {/* 日期切换区 */}
      <div className="mb-6 flex items-center justify-between bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={handlePreviousDay}
            className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            ← 前一天
          </button>
          <input
            type="date"
            value={currentDate}
            onChange={(e) => setCurrentDate(e.target.value)}
            className="px-3 py-1 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleNextDay}
            className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            后一天 →
          </button>
        </div>
        <button
          onClick={handleBackToToday}
          className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          回到今天
        </button>
      </div>

      {/* 内容区块 */}
      <div className="space-y-6">
            {/* 任务列表区块 */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                {viewMode === 'tasks' ? (
                  // 任务列表视图
                  isLoading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4"></div>
                      <p className="text-slate-500">加载中...</p>
                    </div>
                  ) : (
                    <>
                      {/* 任务列表筛选和搜索 */}
                      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
                        {/* 状态筛选 */}
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-slate-600">状态:</span>
                          <div className="flex space-x-1">
                            <button
                              onClick={() => setTaskFilter('all')}
                              className={`px-2 py-1 text-xs rounded ${taskFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}
                            >
                              全部
                            </button>
                            <button
                              onClick={() => setTaskFilter('active')}
                              className={`px-2 py-1 text-xs rounded ${taskFilter === 'active' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}
                            >
                              启用中
                            </button>
                            <button
                              onClick={() => setTaskFilter('inactive')}
                              className={`px-2 py-1 text-xs rounded ${taskFilter === 'inactive' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-600'}`}
                            >
                              已停用
                            </button>
                          </div>
                        </div>
                        
                        {/* 搜索框 */}
                        <div className="w-full md:w-64">
                          <input
                            type="text"
                            placeholder="搜索任务..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      
                      {/* 任务列表 */}
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleTaskDragEnd}
                      >
                        <div className="overflow-x-auto">
                          <SortableContext
                            items={taskOrder}
                            strategy={verticalListSortingStrategy}
                          >
                            <table className="w-full border-collapse" style={{ lineHeight: '1.5' }}>
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                  <ResizableTableHeader
                                    columnId="drag"
                                    title={
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="text-slate-500"
                                      >
                                        <line x1="8" y1="6" x2="21" y2="6" />
                                        <line x1="8" y1="12" x2="21" y2="12" />
                                        <line x1="8" y1="18" x2="21" y2="18" />
                                        <line x1="3" y1="6" x2="3.01" y2="6" />
                                        <line x1="3" y1="12" x2="3.01" y2="12" />
                                        <line x1="3" y1="18" x2="3.01" y2="18" />
                                      </svg>
                                    }
                                    width={columnWidths['drag'] || 48}
                                    minWidth={48}
                                    maxWidth={100}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200"
                                  />
                                  <ResizableTableHeader
                                    columnId="name"
                                    title={
                                      <>
                                        任务名称
                                        {sortConfig.key === 'name' && (
                                          <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                      </>
                                    }
                                    width={columnWidths['name'] || 180}
                                    minWidth={100}
                                    maxWidth={300}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200 cursor-pointer hover:bg-slate-100"
                                  />
                                  <ResizableTableHeader
                                    columnId="task_type"
                                    title={
                                      <>
                                        类型
                                        {sortConfig.key === 'task_type' && (
                                          <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                      </>
                                    }
                                    width={columnWidths['task_type'] || 100}
                                    minWidth={80}
                                    maxWidth={200}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200 cursor-pointer hover:bg-slate-100"
                                  />
                                  <ResizableTableHeader
                                    columnId="unit_name"
                                    title={
                                      <>
                                        单位
                                        {sortConfig.key === 'unit_name' && (
                                          <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                      </>
                                    }
                                    width={columnWidths['unit_name'] || 80}
                                    minWidth={60}
                                    maxWidth={150}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200 cursor-pointer hover:bg-slate-100"
                                  />
                                  <ResizableTableHeader
                                    columnId="record_method"
                                    title="记录方式"
                                    width={columnWidths['record_method'] || 100}
                                    minWidth={80}
                                    maxWidth={200}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200"
                                  />
                                  <ResizableTableHeader
                                    columnId="include_in_stats"
                                    title={
                                      <>
                                        统计
                                        {sortConfig.key === 'include_in_stats' && (
                                          <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                      </>
                                    }
                                    width={columnWidths['include_in_stats'] || 80}
                                    minWidth={60}
                                    maxWidth={150}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200 cursor-pointer hover:bg-slate-100"
                                  />
                                  <ResizableTableHeader
                                    columnId="project"
                                    title={
                                      <>
                                        项目
                                        {sortConfig.key === 'include_in_project' && (
                                          <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                      </>
                                    }
                                    width={columnWidths['project'] || 120}
                                    minWidth={80}
                                    maxWidth={250}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200 cursor-pointer hover:bg-slate-100"
                                  />
                                  <ResizableTableHeader
                                    columnId="include_in_completion"
                                    title={
                                      <>
                                        完成度
                                        {sortConfig.key === 'include_in_completion' && (
                                          <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                      </>
                                    }
                                    width={columnWidths['include_in_completion'] || 80}
                                    minWidth={60}
                                    maxWidth={150}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200 cursor-pointer hover:bg-slate-100"
                                  />
                                  <ResizableTableHeader
                                    columnId="status"
                                    title={
                                      <>
                                        状态
                                        {sortConfig.key === 'status' && (
                                          <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                      </>
                                    }
                                    width={columnWidths['status'] || 80}
                                    minWidth={60}
                                    maxWidth={150}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200 cursor-pointer hover:bg-slate-100"
                                  />
                                  <ResizableTableHeader
                                    columnId="goal"
                                    title="目标值"
                                    width={columnWidths['goal'] || 120}
                                    minWidth={80}
                                    maxWidth={200}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200"
                                  />
                                  <ResizableTableHeader
                                    columnId="time_type"
                                    title="时间类型"
                                    width={columnWidths['time_type'] || 120}
                                    minWidth={80}
                                    maxWidth={200}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200"
                                  />
                                  <ResizableTableHeader
                                    columnId="actions"
                                    title="操作"
                                    width={columnWidths['actions'] || 100}
                                    minWidth={80}
                                    maxWidth={150}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600"
                                  />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {filteredTasks.length === 0 ? (
                                  <tr>
                                    <td colSpan={12} className="px-4 py-8 text-center text-slate-500">
                                      暂无任务
                                    </td>
                                  </tr>
                                                                                                                ) : (
                                  // 根据 taskOrder 排序 filteredTasks
                                  [...filteredTasks]
                                    .sort((a, b) => {
                                      const aIndex = taskOrder.indexOf(a.id);
                                      const bIndex = taskOrder.indexOf(b.id);
                                      
                                      if (aIndex !== -1 && bIndex !== -1) {
                                        return aIndex - bIndex;
                                      }
                                      if (aIndex !== -1) return -1;
                                      if (bIndex !== -1) return 1;
                                      
                                      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                                    })
                                    .map((task) => (
                                      <DraggableTaskRow key={task.id} id={task.id} className="hover:bg-slate-50" style={{ height: `${rowHeights[task.id] || 60}px` }}>
                                        <td className="px-4 py-3 text-sm text-slate-900 border-r border-slate-200">{task.name}</td>
                                        <td className="px-4 py-3 text-sm text-slate-900 border-r border-slate-200">
                                          {task.task_type === 'boolean' ? '完成/未完成' : 
                                           task.task_type === 'count' ? '次数型' : '数值型'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-900 border-r border-slate-200">{task.unit_name}</td>
                                        <td className="px-4 py-3 text-sm text-slate-900 border-r border-slate-200">
                                          {task.task_type === 'boolean' ? '勾选' : '输入'}
                                        </td>
                                        <td className="px-4 py-3 text-sm border-r border-slate-200">
                                          {task.include_in_stats ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                是
                                              </span>
                                          ) : (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                否
                                              </span>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 text-sm border-r border-slate-200">
                                          {(() => {
                                            const project = projects.find(p => p.id === task.project_id);
                                            return project ? project.name : '未关联项目';
                                          })()}
                                        </td>
                                        <td className="px-4 py-3 text-sm border-r border-slate-200">
                                          {task.include_in_completion ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                是
                                              </span>
                                          ) : (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                否
                                              </span>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 text-sm border-r border-slate-200">
                                          {task.status === 'active' ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                启用中
                                              </span>
                                          ) : (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                已停用
                                              </span>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 text-sm border-r border-slate-200">
                                          {taskGoals[task.id] ? (
                                            <div className="text-xs">
                                              {taskGoals[task.id].goal_value} {task.unit_name}
                                              <div className="text-slate-500">
                                                {{ day: '每日', week: '每周', month: '每月', year: '每年', custom: `每${taskGoals[task.id].custom_period_days || 7}天` }[taskGoals[task.id].period]}
                                              </div>
                                            </div>
                                          ) : (
                                            <span className="text-xs text-slate-500">无目标</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 text-sm border-r border-slate-200">
                                          {task.is_long_term ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                长期项目
                                              </span>
                                          ) : task.start_date && task.end_date ? (
                                            <div className="text-xs text-slate-600">
                                              {task.start_date} 至 {task.end_date}
                                            </div>
                                          ) : (
                                            <span className="text-xs text-slate-500">未设置</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                          <div className="flex space-x-2">
                                            <button
                                              onClick={() => handleEditTask(task)}
                                              className="text-blue-600 hover:text-blue-800"
                                            >
                                              编辑
                                            </button>
                                            <button
                                              onClick={() => handleDeactivateTask(task.id)}
                                              className="text-orange-600 hover:text-orange-800"
                                            >
                                              {task.status === 'active' ? '停用' : '启用'}
                                            </button>
                                            <button
                                              onClick={() => handleDeleteTask(task.id)}
                                              className="text-red-600 hover:text-red-800"
                                            >
                                              删除
                                            </button>
                                          </div>
                                        </td>
                                        <td className="relative">
                                          <div 
                                            className="absolute bottom-0 left-0 right-0 h-1 bg-slate-200 cursor-row-resize hover:bg-slate-400 transition-colors"
                                            onMouseDown={(e) => {
                                              e.preventDefault();
                                              const startY = e.clientY;
                                              const startHeight = rowHeights[task.id] || 60;
                                              
                                              const handleMouseMove = (e: MouseEvent) => {
                                                const deltaY = e.clientY - startY;
                                                let newHeight = startHeight + deltaY;
                                                newHeight = Math.max(40, Math.min(200, newHeight));
                                                setRowHeights(prev => ({
                                                  ...prev,
                                                  [task.id]: newHeight
                                                }));
                                              };
                                              
                                              const handleMouseUp = () => {
                                                document.removeEventListener('mousemove', handleMouseMove);
                                                document.removeEventListener('mouseup', handleMouseUp);
                                              };
                                              
                                              document.addEventListener('mousemove', handleMouseMove);
                                              document.addEventListener('mouseup', handleMouseUp);
                                            }}
                                          />
                                        </td>
                                      </DraggableTaskRow>
                                    ))
                                )}
                              </tbody>
                            </table>
                          </SortableContext>
                        </div>
                      </DndContext>
                    </>
                  )
                ) : null}
              </div>

            {/* 今日数据表区块 */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                {viewMode === 'today' ? (
                  // 今日数据表视图
                  isLoading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4"></div>
                      <p className="text-slate-500">加载中...</p>
                    </div>
                  ) : tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <p className="text-slate-500 mb-4">暂无任务</p>
                      <button
                        onClick={handleNewTask}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                      >
                        新建第一个任务
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* 任务列表 - 支持拖拽排序和列宽调整 */}
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleTaskDragEnd}
                      >
                        <SortableContext
                          items={taskOrder}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse" style={{ lineHeight: '1.5' }}>
                              <thead className="sticky top-0 bg-slate-50 z-10">
                                <tr className="border-b border-slate-200">
                                  <ResizableTableHeader
                                    columnId="drag"
                                    title=""
                                    width={columnWidths['drag'] || 48}
                                    minWidth={48}
                                    maxWidth={100}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200"
                                  />
                                  <ResizableTableHeader
                                    columnId="name"
                                    title="任务名称"
                                    width={columnWidths['name'] || 200}
                                    minWidth={100}
                                    maxWidth={300}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200"
                                  />
                                  <ResizableTableHeader
                                    columnId="unit"
                                    title="单位"
                                    width={columnWidths['unit'] || 100}
                                    minWidth={60}
                                    maxWidth={150}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200"
                                  />
                                  <ResizableTableHeader
                                    columnId="goal"
                                    title="目标"
                                    width={columnWidths['goal'] || 120}
                                    minWidth={80}
                                    maxWidth={200}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200"
                                  />
                                  <ResizableTableHeader
                                    columnId="current"
                                    title="当前值"
                                    width={columnWidths['current'] || 100}
                                    minWidth={80}
                                    maxWidth={150}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200"
                                  />
                                  <ResizableTableHeader
                                    columnId="today"
                                    title="今日值"
                                    width={columnWidths['today'] || 120}
                                    minWidth={80}
                                    maxWidth={200}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200"
                                  />
                                  <ResizableTableHeader
                                    columnId="completion"
                                    title="完成度"
                                    width={columnWidths['completion'] || 100}
                                    minWidth={80}
                                    maxWidth={150}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200"
                                  />
                                  <ResizableTableHeader
                                    columnId="actions"
                                    title="操作"
                                    width={columnWidths['actions'] || 100}
                                    minWidth={80}
                                    maxWidth={150}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600"
                                  />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {taskOrder
                                  .map(taskId => tasks.find(task => task.id === taskId && task.status === 'active'))
                                  .filter((task): task is TaskDefinition => task !== undefined)
                                  .map((task) => {
                                    const project = projects.find(p => p.id === task.project_id);
                                    const projectName = project ? project.name : '未关联项目';
                                    const record = taskRecords[task.id] || {};
                                    const goal = taskGoals[task.id] || null;
                                    // 优先使用用户输入的实时值，而不是 API 返回的累计值
                                    const currentValue = record.value_number ?? (taskAccumulatedValues[task.id]?.numberValue ?? 0);
                                    // 创建一个临时的 accumulatedValue 对象，使用实时值
                                    const accumulatedValue = {
                                      booleanValue: record.value_boolean || false,
                                      numberValue: currentValue
                                    };
                                    const completion = calculateCompletion(task, record, goal, accumulatedValue);
                                    const completionColor = getCompletionColor(completion);
                                    const currentAccumulated = accumulatedValue.numberValue;
                                    
                                    return (
                                      <DraggableTaskRow key={task.id} id={task.id} className="hover:bg-slate-50" style={{ height: `${rowHeights[task.id] || 60}px` }} showHandle={true}>
                                        <td className="px-4 py-3 border-r border-slate-200">
                                          <div className="flex items-center space-x-2">
                                            <span className="font-medium text-slate-900">{task.name}</span>
                                            <span className="text-xs text-slate-500">
                                              {task.task_type === 'boolean' ? '完成/未完成' : task.task_type === 'count' ? '次数型' : '数值型'}
                                            </span>
                                          </div>
                                          <div className="text-xs text-slate-400 mt-1">
                                            项目：{projectName || '未关联项目'}
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 border-r border-slate-200">
                                          {task.unit_name || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 border-r border-slate-200">
                                          {goal && goal.is_enabled ? (
                                            <div className="text-sm">
                                              <span className="font-medium">{goal.goal_value}</span>
                                              <span className="text-xs text-slate-500 ml-1">
                                                {{ day: '每日', week: '每周', month: '每月', year: '每年', custom: `每${goal.custom_period_days || 7}天` }[goal.period]}
                                              </span>
                                            </div>
                                          ) : (
                                            <span className="text-xs text-slate-400">无目标</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 border-r border-slate-200">
                                          {goal && goal.is_enabled && task.task_type !== 'boolean' ? (
                                            <div className="text-sm">
                                              <span className="font-medium">{currentAccumulated}</span>
                                              <span className="text-xs text-slate-500 ml-1">{task.unit_name}</span>
                                            </div>
                                          ) : (
                                            <span className="text-xs text-slate-400">-</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 border-r border-slate-200">
                                          {task.task_type === 'boolean' ? (
                                            <label className="flex items-center space-x-2 cursor-pointer">
                                              <input
                                                type="checkbox"
                                                checked={record.value_boolean || false}
                                                onChange={(e) => {
                                                  handleRecordChange(task.id, { value_boolean: e.target.checked });
                                                  setTimeout(() => handleSaveRecord(task.id), 100);
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
                                                  handleRecordChange(task.id, { value_number: value });
                                                }}
                                                onBlur={() => handleSaveRecord(task.id)}
                                                placeholder="0"
                                                className="w-20 px-2 py-1 text-sm rounded border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                              />
                                              <span className="text-sm text-slate-500">{task.unit_name}</span>
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 border-r border-slate-200">
                                          <div className="flex items-center space-x-2">
                                            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                              <div
                                                className={`h-full rounded-full transition-all ${completionColor}`}
                                                style={{ width: `${completion}%` }}
                                              />
                                            </div>
                                            <span className="text-xs text-slate-500 w-8">{formatCompletion(completion)}</span>
                                          </div>
                                        </td>
                                        <td className="px-4 py-3">
                                          <div className="flex items-center justify-end space-x-2">
                                            <button
                                              onClick={() => handleEditTask(task)}
                                              className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                              title="编辑任务"
                                            >
                                              <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                              onClick={() => handleDeactivateTask(task.id)}
                                              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                              title="停用任务"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          </div>
                                        </td>
                                      </DraggableTaskRow>
                                    );
                                  })}
                              </tbody>
                            </table>
                          </div>
                        </SortableContext>
                      </DndContext>

                      {/* 底部保存按钮 */}
                      <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
                        <button
                          onClick={handleSaveAllRecords}
                          disabled={isSaving}
                          className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {isSaving ? '保存中...' : '保存今日所有记录'}
                        </button>
                      </div>
                    </>
                  )
                ) : null}
              </div>

            {/* 记录总表区块 */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                {viewMode === 'total' ? (
                  // 记录总表视图 - Excel式二维表格
                  isLoadingTotalRecords ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4"></div>
                      <p className="text-slate-500">加载中...</p>
                    </div>
                  ) : (
                    <>
                      {/* 日期范围选择 */}
                      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <div className="text-sm text-slate-600">
                          日期范围: {dateRange.start} 至 {dateRange.end}
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => {
                              const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                              const end = new Date().toISOString().split('T')[0];
                              updateDateRange(start, end);
                              setTotalViewMode('30days');
                            }}
                            className={`px-3 py-1 text-sm rounded border ${totalViewMode === '30days' ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                          >
                            最近30天
                          </button>
                          <button
                            onClick={() => {
                              loadTotalTaskRecords(true);
                              setTotalViewMode('all');
                            }}
                            className={`px-3 py-1 text-sm rounded border ${totalViewMode === 'all' ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                          >
                            查看所有数据
                          </button>
                        </div>
                      </div>
                      
                      {/* Excel式二维表格 */}
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleColumnDragEnd}
                      >
                        <div className="overflow-x-auto max-h-[600px]">
                          <SortableContext
                            items={columnOrder}
                            strategy={horizontalListSortingStrategy}
                          >
                            <table className="w-full border-collapse" style={{ lineHeight: '1.5' }}>
                              <thead className="sticky top-0 bg-slate-50 z-10">
                                <tr className="border-b border-slate-200">
                                  <ResizableTableHeader
                                    columnId="date"
                                    title="日期"
                                    width={columnWidths['date'] || 120}
                                    minWidth={80}
                                    maxWidth={200}
                                    onWidthChange={handleColumnWidthChange}
                                    className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200"
                                  />
                                  {columnOrder.map((taskId) => {
                                    const task = filteredTasks.find(t => t.id === taskId);
                                    if (!task) return null;
                                    return (
                                      <ResizableTableHeader
                                        key={task.id}
                                        columnId={task.id}
                                        title={
                                          <>
                                            {task.name}
                                            <div className="text-xs text-slate-400">{task.unit_name}</div>
                                          </>
                                        }
                                        width={columnWidths[task.id] || 120}
                                        minWidth={80}
                                        maxWidth={300}
                                        onWidthChange={handleColumnWidthChange}
                                        className="px-4 py-3 text-left text-sm font-medium text-slate-600 border-r border-slate-200"
                                      >
                                        <DraggableColumnHeader id={task.id} className="ml-2">
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="text-slate-500"
                                          >
                                            <line x1="8" y1="12" x2="16" y2="12" />
                                            <line x1="12" y1="8" x2="12" y2="16" />
                                          </svg>
                                        </DraggableColumnHeader>
                                      </ResizableTableHeader>
                                    );
                                  })}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {/* 根据模式生成日期 */}
                                {(() => {
                                  // 从日期范围生成日期
                                  const rangeDates = generateDateRange(dateRange.start, dateRange.end);
                                  // 按日期降序排序
                                  return rangeDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
                                })().map((date) => (
                                  <tr key={date} style={{ height: `${rowHeights[date] || 60}px` }} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 text-sm text-slate-900 border-r border-slate-200 font-medium">{date}</td>
                                    {columnOrder.map((taskId) => {
                                      const task = filteredTasks.find(t => t.id === taskId);
                                      if (!task) return null;
                                      const record = getRecordValue(date, task.id);
                                      return (
                                        <td key={`${date}-${task.id}`} className="px-4 py-3 border-r border-slate-200">
                                          {task.task_type === 'boolean' ? (
                                            <input
                                              type="checkbox"
                                              checked={record?.value_boolean || false}
                                              onChange={(e) => handleTotalRecordChange(date, task.id, e.target.checked)}
                                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                            />
                                          ) : (
                                            <input
                                              type="number"
                                              min="0"
                                              step={task.task_type === 'count' ? '1' : '0.1'}
                                              value={record?.value_number ?? ''}
                                              onChange={(e) => handleTotalRecordChange(date, task.id, e.target.value)}
                                              className="w-full px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td className="relative">
                                      <div 
                                        className="absolute bottom-0 left-0 right-0 h-1 bg-slate-200 cursor-row-resize hover:bg-slate-400 transition-colors"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          const startY = e.clientY;
                                          const startHeight = rowHeights[date] || 60;
                                          
                                          const handleMouseMove = (e: MouseEvent) => {
                                            const deltaY = e.clientY - startY;
                                            let newHeight = startHeight + deltaY;
                                            newHeight = Math.max(40, Math.min(200, newHeight));
                                            setRowHeights(prev => ({
                                              ...prev,
                                              [date]: newHeight
                                            }));
                                          };
                                          
                                          const handleMouseUp = () => {
                                            document.removeEventListener('mousemove', handleMouseMove);
                                            document.removeEventListener('mouseup', handleMouseUp);
                                          };
                                          
                                          document.addEventListener('mousemove', handleMouseMove);
                                          document.addEventListener('mouseup', handleMouseUp);
                                        }}
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </SortableContext>
                        </div>
                      </DndContext>
                    </>
                  )
                ) : null}
              </div>
      </div>

      {/* 任务表单弹窗 */}
      {showTaskModal && (
        <TaskFormModal
          task={editingTask}
          goal={editingTask ? taskGoals[editingTask.id] || null : null}
          projects={projects}
          onSave={handleSaveTask}
          onSaveGoal={handleSaveGoal}
          onClose={() => setShowTaskModal(false)}
        />
      )}

      {/* Excel 导入弹窗 */}
      <ExcelImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        userTasks={tasks}
        existingRecords={totalTaskRecords.map(r => ({
          date: r.record_date,
          taskId: r.task_id,
        }))}
        onImport={handleImport}
      />

      {/* Toast 提示 */}
      {toast.show && (
        <div
          className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg transition-all ${
            toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
