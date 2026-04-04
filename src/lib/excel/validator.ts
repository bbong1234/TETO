import type { TaskDefinition } from '@/types/tasks';
import type { ParsedRow, ParseError } from './parser';

export type RowStatus = 'valid' | 'error' | 'conflict';

export interface ValidatedRow extends ParsedRow {
  status: RowStatus;
  errorMessage?: string;
  taskId?: string;
  taskType?: string;
}

export interface ValidationResult {
  rows: ValidatedRow[];
  stats: {
    total: number;
    valid: number;
    error: number;
    conflict: number;
  };
}

/**
 * 验证解析后的数据
 */
export async function validateRows(
  parsedRows: ParsedRow[],
  userTasks: TaskDefinition[],
  checkConflict: (date: string, taskId: string) => Promise<boolean>
): Promise<ValidationResult> {
  const rows: ValidatedRow[] = [];
  const taskMap = new Map(userTasks.map(t => [t.name, t]));

  for (const row of parsedRows) {
    const validatedRow: ValidatedRow = { ...row, status: 'valid' };

    // 检查任务是否存在
    const task = taskMap.get(row.taskName);
    if (!task) {
      validatedRow.status = 'error';
      validatedRow.errorMessage = `任务 "${row.taskName}" 不存在`;
      rows.push(validatedRow);
      continue;
    }

    validatedRow.taskId = task.id;
    validatedRow.taskType = task.task_type;

    // 根据任务类型验证数据
    if (task.task_type === 'boolean') {
      if (row.valueBoolean === null) {
        validatedRow.status = 'error';
        validatedRow.errorMessage = '布尔型任务必须填写完成状态';
        rows.push(validatedRow);
        continue;
      }
    } else {
      // count 或 number 类型
      if (row.valueNumber === null) {
        validatedRow.status = 'error';
        validatedRow.errorMessage = '数值型任务必须填写数值';
        rows.push(validatedRow);
        continue;
      }
    }

    // 检查冲突
    const hasConflict = await checkConflict(row.date, task.id);
    if (hasConflict) {
      validatedRow.status = 'conflict';
      validatedRow.errorMessage = '该日期已有记录';
    }

    rows.push(validatedRow);
  }

  const stats = {
    total: rows.length,
    valid: rows.filter(r => r.status === 'valid').length,
    error: rows.filter(r => r.status === 'error').length,
    conflict: rows.filter(r => r.status === 'conflict').length,
  };

  return { rows, stats };
}

/**
 * 获取有效行（用于导入）
 */
export function getValidRows(rows: ValidatedRow[]): ValidatedRow[] {
  return rows.filter(r => r.status === 'valid');
}

/**
 * 获取错误行
 */
export function getErrorRows(rows: ValidatedRow[]): ValidatedRow[] {
  return rows.filter(r => r.status === 'error');
}

/**
 * 获取冲突行
 */
export function getConflictRows(rows: ValidatedRow[]): ValidatedRow[] {
  return rows.filter(r => r.status === 'conflict');
}

/**
 * 生成错误报告数据
 */
export function generateErrorReportData(rows: ValidatedRow[]): Array<{ rowIndex: number; date: string; taskName: string; errorMessage: string }> {
  return rows
    .filter(r => r.status === 'error' || r.status === 'conflict')
    .map(r => ({
      rowIndex: r.rowIndex,
      date: r.date,
      taskName: r.taskName,
      errorMessage: r.errorMessage || '',
    }));
}
