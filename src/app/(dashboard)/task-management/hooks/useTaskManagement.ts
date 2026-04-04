'use client';

import { useState, useEffect, useCallback } from 'react';
import type { TaskDefinition, TaskRecordFormValues, NewTaskFormValues, TaskRecord, TaskGoal, TaskGoalFormValues } from '@/types/tasks';

export function useTaskManagement() {
  // 日期状态
  const [currentDate, setCurrentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  // 任务列表状态
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  
  // 任务记录状态
  const [taskRecords, setTaskRecords] = useState<Record<string, TaskRecordFormValues>>({});
  
  // 加载状态
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  
  // 弹窗状态
  const [showTaskModal, setShowTaskModal] = useState<boolean>(false);
  const [editingTask, setEditingTask] = useState<TaskDefinition | null>(null);
  
  // 目标值状态
  const [taskGoals, setTaskGoals] = useState<Record<string, TaskGoal>>({});
  
  // 周期内累计值状态
  const [taskAccumulatedValues, setTaskAccumulatedValues] = useState<Record<string, { booleanValue: boolean; numberValue: number }>>({});
  
  // Toast 提示
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success',
  });

  // 记录视图状态
  const [recordViewMode, setRecordViewMode] = useState<'today' | 'total'>('today');
  const [totalTaskRecords, setTotalTaskRecords] = useState<TaskRecord[]>([]);
  const [isLoadingTotalRecords, setIsLoadingTotalRecords] = useState(false);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  // 加载任务和记录
  useEffect(() => {
    if (recordViewMode === 'today') {
      loadTodayTasksAndRecords();
    }
  }, [currentDate, recordViewMode]);

  // 加载今日任务和记录
  const loadTodayTasksAndRecords = useCallback(async () => {
    setIsLoading(true);
    try {
      // 加载任务列表
      const tasksResponse = await fetch('/api/tasks');
      
      if (!tasksResponse.ok) {
        console.error('获取任务失败，状态码:', tasksResponse.status);
        showToast('获取任务失败', 'error');
        return;
      }
      
      const tasksResult = await tasksResponse.json();
      console.log('tasks api result:', tasksResult);

      let tasksArray: TaskDefinition[] = [];
      if (Array.isArray(tasksResult)) {
        tasksArray = tasksResult.map((task: any) => ({
          ...task,
          name: task.name || '',
          task_type: task.task_type || 'boolean',
          unit_name: task.unit_name || '',
          include_in_stats: task.include_in_stats ?? true,
          include_in_completion: task.include_in_completion ?? true,
          include_in_project: task.include_in_project ?? true,
          status: task.status || 'active',
          is_long_term: task.is_long_term ?? false,
          start_date: task.start_date || '',
          end_date: task.end_date || '',
        }));
      } else if (Array.isArray(tasksResult.tasks)) {
        tasksArray = tasksResult.tasks.map((task: any) => ({
          ...task,
          name: task.name || '',
          task_type: task.task_type || 'boolean',
          unit_name: task.unit_name || '',
          include_in_stats: task.include_in_stats ?? true,
          include_in_completion: task.include_in_completion ?? true,
          include_in_project: task.include_in_project ?? true,
          status: task.status || 'active',
          is_long_term: task.is_long_term ?? false,
          start_date: task.start_date || '',
          end_date: task.end_date || '',
        }));
      } else if (Array.isArray(tasksResult.data)) {
        tasksArray = tasksResult.data.map((task: any) => ({
          ...task,
          name: task.name || '',
          task_type: task.task_type || 'boolean',
          unit_name: task.unit_name || '',
          include_in_stats: task.include_in_stats ?? true,
          include_in_completion: task.include_in_completion ?? true,
          include_in_project: task.include_in_project ?? true,
          status: task.status || 'active',
          is_long_term: task.is_long_term ?? false,
          start_date: task.start_date || '',
          end_date: task.end_date || '',
        }));
      } else {
        console.error('获取任务失败，响应格式不正确:', tasksResult);
        showToast('获取任务失败，响应格式不正确', 'error');
        return;
      }
      setTasks(tasksArray);

      // 加载任务目标值
      const goalsMap: Record<string, TaskGoal> = {};
      for (const task of tasksArray) {
        try {
          const goalResponse = await fetch(`/api/task-goals?task_id=${task.id}`);
          if (goalResponse.ok) {
            const goal = await goalResponse.json();
            goalsMap[task.id] = goal;
          }
        } catch (error) {
          console.error(`加载任务 ${task.id} 的目标值失败:`, error);
        }
      }
      setTaskGoals(goalsMap);

      // 加载周期内累计记录
      const accumulatedValuesMap: Record<string, { booleanValue: boolean; numberValue: number }> = {};
      for (const task of tasksArray) {
        const goal = goalsMap[task.id];
        if (goal && goal.is_enabled && task.task_type !== 'boolean') {
          try {
            const response = await fetch('/api/task-records/accumulated', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                task_id: task.id,
                period: goal.period,
                custom_period_days: goal.custom_period_days,
                base_date: currentDate,
              }),
            });
            if (response.ok) {
              const accumulated = await response.json();
              accumulatedValuesMap[task.id] = accumulated;
            }
          } catch (error) {
            console.error(`加载任务 ${task.id} 的累计记录失败:`, error);
          }
        }
      }
      setTaskAccumulatedValues(accumulatedValuesMap);

      // 加载当日记录
      const recordsResponse = await fetch(`/api/task-records?date=${currentDate}`);
      const loadedRecords = await recordsResponse.json();
      console.log('records api result:', loadedRecords);
      
      const recordsFormValues: Record<string, TaskRecordFormValues> = {};
      if (typeof loadedRecords === 'object' && loadedRecords !== null) {
        Object.entries(loadedRecords).forEach(([taskId, record]) => {
          const r = record as { value_boolean?: boolean; value_number?: number };
          recordsFormValues[taskId] = {
            value_boolean: r.value_boolean,
            value_number: r.value_number,
          };
        });
      }
      setTaskRecords(recordsFormValues);
    } catch (error) {
      console.error('加载任务和记录失败:', error);
      showToast('加载失败', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [currentDate]);

  // 加载总表任务记录（支持加载所有记录）
  const loadTotalTaskRecords = useCallback(async (loadAll: boolean = false) => {
    setIsLoadingTotalRecords(true);
    try {
      // 加载任务列表
      const tasksResponse = await fetch('/api/tasks');
      
      if (!tasksResponse.ok) {
        console.error('获取任务失败，状态码:', tasksResponse.status);
        showToast('获取任务失败', 'error');
        return;
      }
      
      const tasksResult = await tasksResponse.json();
      console.log('tasks api result:', tasksResult);
      
      let tasksArray: TaskDefinition[] = [];
      if (Array.isArray(tasksResult)) {
        tasksArray = tasksResult.map((task: any) => ({
          ...task,
          name: task.name || '',
          task_type: task.task_type || 'boolean',
          unit_name: task.unit_name || '',
          include_in_stats: task.include_in_stats ?? true,
          include_in_completion: task.include_in_completion ?? true,
          include_in_project: task.include_in_project ?? true,
          status: task.status || 'active',
          is_long_term: task.is_long_term ?? false,
          start_date: task.start_date || '',
          end_date: task.end_date || '',
        }));
      } else if (Array.isArray(tasksResult.tasks)) {
        tasksArray = tasksResult.tasks.map((task: any) => ({
          ...task,
          name: task.name || '',
          task_type: task.task_type || 'boolean',
          unit_name: task.unit_name || '',
          include_in_stats: task.include_in_stats ?? true,
          include_in_completion: task.include_in_completion ?? true,
          include_in_project: task.include_in_project ?? true,
          status: task.status || 'active',
          is_long_term: task.is_long_term ?? false,
          start_date: task.start_date || '',
          end_date: task.end_date || '',
        }));
      } else if (Array.isArray(tasksResult.data)) {
        tasksArray = tasksResult.data.map((task: any) => ({
          ...task,
          name: task.name || '',
          task_type: task.task_type || 'boolean',
          unit_name: task.unit_name || '',
          include_in_stats: task.include_in_stats ?? true,
          include_in_completion: task.include_in_completion ?? true,
          include_in_project: task.include_in_project ?? true,
          status: task.status || 'active',
          is_long_term: task.is_long_term ?? false,
          start_date: task.start_date || '',
          end_date: task.end_date || '',
        }));
      } else {
        console.error('获取任务失败，响应格式不正确:', tasksResult);
        showToast('获取任务失败，响应格式不正确', 'error');
        return;
      }
      setTasks(tasksArray);

      // 加载记录
      let recordsResponse;
      if (loadAll) {
        // 加载所有记录
        recordsResponse = await fetch('/api/task-records?all=true');
      } else {
        // 加载日期范围内的记录
        recordsResponse = await fetch(`/api/task-records?start_date=${dateRange.start}&end_date=${dateRange.end}`);
      }
      const loadedRecords = await recordsResponse.json();
      console.log('total records api result:', loadedRecords);
      
      setTotalTaskRecords(loadedRecords);

      // 如果加载所有记录，更新日期范围为所有记录的范围
      if (loadAll && loadedRecords.length > 0) {
        const dates = loadedRecords.map((r: any) => r.record_date);
        const minDate = dates.reduce((a: string, b: string) => new Date(a) < new Date(b) ? a : b);
        const maxDate = dates.reduce((a: string, b: string) => new Date(a) > new Date(b) ? a : b);
        setDateRange({ start: minDate, end: maxDate });
      }
    } catch (error) {
      console.error('加载总表任务记录失败:', error);
      showToast('加载失败', 'error');
    } finally {
      setIsLoadingTotalRecords(false);
    }
  }, [dateRange.start, dateRange.end]);

  // 切换记录视图
  const switchRecordView = async (mode: 'today' | 'total') => {
    setRecordViewMode(mode);
    if (mode === 'total') {
      await loadTotalTaskRecords();
    }
  };

  // 更新日期范围
  const updateDateRange = async (start: string, end: string) => {
    setDateRange({ start, end });
    if (recordViewMode === 'total') {
      await loadTotalTaskRecords();
    }
  };

  // 日期切换
  const handlePreviousDay = () => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() - 1);
    setCurrentDate(date.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + 1);
    setCurrentDate(date.toISOString().split('T')[0]);
  };

  const handleBackToToday = () => {
    setCurrentDate(new Date().toISOString().split('T')[0]);
  };

  // 任务记录值变更
  const handleRecordChange = (taskId: string, values: TaskRecordFormValues) => {
    setTaskRecords(prev => ({
      ...prev,
      [taskId]: values,
    }));
  };

  // 保存单个任务记录
  const handleSaveRecord = async (taskId: string) => {
    const recordValues = taskRecords[taskId];
    if (!recordValues) return;

    try {
      const response = await fetch('/api/task-records', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task_id: taskId,
          record_date: currentDate,
          value_boolean: recordValues.value_boolean,
          value_number: recordValues.value_number,
        }),
      });

      if (response.ok) {
        showToast('记录保存成功', 'success');
      } else {
        showToast('记录保存失败', 'error');
      }
    } catch (error) {
      console.error('保存记录失败:', error);
      showToast('记录保存失败', 'error');
    }
  };

  // 保存所有记录
  const handleSaveAllRecords = async () => {
    setIsSaving(true);
    try {
      const savePromises = Object.entries(taskRecords).map(([taskId, values]) =>
        fetch('/api/task-records', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            task_id: taskId,
            record_date: currentDate,
            value_boolean: values.value_boolean,
            value_number: values.value_number,
          }),
        })
      );

      await Promise.all(savePromises);
      showToast('所有记录保存成功', 'success');
    } catch (error) {
      console.error('保存记录失败:', error);
      showToast('保存记录失败', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // 新建任务
  const handleNewTask = () => {
    setEditingTask(null);
    setShowTaskModal(true);
  };

  // 编辑任务
  const handleEditTask = (task: TaskDefinition) => {
    setEditingTask(task);
    setShowTaskModal(true);
  };

  // 保存任务（新建或编辑）
  const handleSaveTask = async (taskData: NewTaskFormValues) => {
    try {
      if (editingTask) {
        // 编辑任务
        const response = await fetch(`/api/tasks/${editingTask.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(taskData),
        });

        if (response.ok) {
          try {
            const updatedTask = await response.json();
            setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
          } catch (jsonError) {
            console.error('解析响应失败:', jsonError);
            // 即使解析失败，也要重新加载任务列表
            loadTodayTasksAndRecords();
          }
          showToast('任务更新成功', 'success');
        } else {
          showToast('任务更新失败', 'error');
        }
      } else {
        // 新建任务
        const response = await fetch('/api/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(taskData),
        });

        if (response.ok) {
          try {
            const newTask = await response.json();
            setTasks(prev => [newTask, ...prev]);
          } catch (jsonError) {
            console.error('解析响应失败:', jsonError);
            // 即使解析失败，也要重新加载任务列表
            loadTodayTasksAndRecords();
          }
          showToast('任务创建成功', 'success');
        } else {
          showToast('任务创建失败', 'error');
        }
      }
    } catch (error) {
      console.error('保存任务失败:', error);
      showToast('保存任务失败', 'error');
    }
  };

  // 保存目标值
  const handleSaveGoal = async (goalData: TaskGoalFormValues) => {
    try {
      if (editingTask) {
        // 检查任务是否已有目标值
        const existingGoal = taskGoals[editingTask.id];
        
        if (existingGoal) {
          // 更新现有目标值
          const response = await fetch(`/api/task-goals/${existingGoal.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(goalData),
          });

          if (response.ok) {
            const updatedGoal = await response.json();
            setTaskGoals(prev => ({
              ...prev,
              [editingTask.id]: updatedGoal,
            }));
            showToast('目标值更新成功', 'success');
          } else {
            showToast('目标值更新失败', 'error');
          }
        } else if (goalData.is_enabled) {
          // 创建新目标值
          const response = await fetch('/api/task-goals', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              task_id: editingTask.id,
              ...goalData,
            }),
          });

          if (response.ok) {
            const newGoal = await response.json();
            setTaskGoals(prev => ({
              ...prev,
              [editingTask.id]: newGoal,
            }));
            showToast('目标值创建成功', 'success');
          } else {
            showToast('目标值创建失败', 'error');
          }
        }
      }
    } catch (error) {
      console.error('保存目标值失败:', error);
      showToast('保存目标值失败', 'error');
    }
  };

  // 停用/启用任务
  const handleDeactivateTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const action = task.status === 'active' ? '停用' : '启用';
    if (!confirm(`确定要${action}此任务吗？`)) return;
    
    try {
      const response = await fetch(`/api/tasks/${taskId}/deactivate`, {
        method: 'POST',
      });

      if (response.ok) {
        // 更新任务状态
        setTasks(prev => prev.map(t => 
          t.id === taskId ? { ...t, status: t.status === 'active' ? 'inactive' : 'active' } : t
        ));
        showToast(`任务已${action}`, 'success');
      } else {
        showToast(`${action}任务失败`, 'error');
      }
    } catch (error) {
      console.error(`${action}任务失败:`, error);
      showToast(`${action}任务失败`, 'error');
    }
  };

  // 删除任务
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('确定要删除此任务吗？删除后将无法恢复！')) return;
    
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // 从列表中移除已删除的任务
        setTasks(prev => prev.filter(t => t.id !== taskId));
        showToast('任务已删除', 'success');
      } else {
        showToast('删除任务失败', 'error');
      }
    } catch (error) {
      console.error('删除任务失败:', error);
      showToast('删除任务失败', 'error');
    }
  };

  // 显示提示
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 3000);
  };

  return {
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
    recordViewMode,
    dateRange,
    toast,
    loadTodayTasksAndRecords,
    loadTotalTaskRecords,
    switchRecordView,
    updateDateRange,
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
    setShowTaskModal,
  };
}
