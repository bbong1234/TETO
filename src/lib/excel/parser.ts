import * as XLSX from 'xlsx';

export interface ExcelRow {
  日期: string;
  任务名称: string;
  完成状态: string;
  数值: string | number;
}

export interface ParsedRow {
  rowIndex: number;
  date: string;
  taskName: string;
  valueBoolean: boolean | null;
  valueNumber: number | null;
}

export interface ParseResult {
  data: ParsedRow[];
  errors: ParseError[];
}

export interface ParseError {
  rowIndex: number;
  field: string;
  message: string;
}

/**
 * 解析 Excel 文件
 */
export function parseExcelFile(file: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(file, { type: 'array' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

  if (jsonData.length < 2) {
    return { data: [], errors: [{ rowIndex: 0, field: 'file', message: '文件为空或缺少数据' }] };
  }

  const headers = jsonData[0] as string[];
  const requiredColumns = ['日期', '任务名称'];
  
  // 检查必要列
  for (const col of requiredColumns) {
    if (!headers.includes(col)) {
      return { data: [], errors: [{ rowIndex: 0, field: 'header', message: `缺少必要列: ${col}` }] };
    }
  }

  const data: ParsedRow[] = [];
  const errors: ParseError[] = [];

  // 从第2行开始解析（跳过表头）
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    const rowIndex = i + 1;

    if (row.length === 0 || row.every(cell => cell === undefined || cell === '')) {
      continue; // 跳过空行
    }

    const dateIndex = headers.indexOf('日期');
    const taskNameIndex = headers.indexOf('任务名称');
    const statusIndex = headers.indexOf('完成状态');
    const numberIndex = headers.indexOf('数值');

    const dateValue = row[dateIndex];
    const taskNameValue = row[taskNameIndex];
    const statusValue = statusIndex >= 0 ? row[statusIndex] : undefined;
    const numberValue = numberIndex >= 0 ? row[numberIndex] : undefined;

    // 验证日期
    if (!dateValue) {
      errors.push({ rowIndex, field: '日期', message: '日期不能为空' });
      continue;
    }

    const parsedDate = parseDate(dateValue);
    if (!parsedDate) {
      errors.push({ rowIndex, field: '日期', message: '日期格式错误，支持格式: 2024-01-01 或 2024/01/01' });
      continue;
    }

    // 验证任务名称
    if (!taskNameValue || String(taskNameValue).trim() === '') {
      errors.push({ rowIndex, field: '任务名称', message: '任务名称不能为空' });
      continue;
    }

    // 解析完成状态
    let valueBoolean: boolean | null = null;
    if (statusValue !== undefined && statusValue !== '') {
      const status = String(statusValue).trim().toLowerCase();
      if (status === '是' || status === '1' || status === 'true' || status === 'yes') {
        valueBoolean = true;
      } else if (status === '否' || status === '0' || status === 'false' || status === 'no') {
        valueBoolean = false;
      }
    }

    // 解析数值
    let valueNumber: number | null = null;
    if (numberValue !== undefined && numberValue !== '') {
      const num = parseFloat(String(numberValue));
      if (isNaN(num)) {
        errors.push({ rowIndex, field: '数值', message: '数值格式错误' });
        continue;
      }
      valueNumber = num;
    }

    data.push({
      rowIndex,
      date: parsedDate,
      taskName: String(taskNameValue).trim(),
      valueBoolean,
      valueNumber,
    });
  }

  return { data, errors };
}

/**
 * 解析日期字符串
 */
function parseDate(value: any): string | null {
  if (!value) return null;

  const str = String(value).trim();

  // 尝试解析 YYYY-MM-DD 或 YYYY/MM/DD
  const dateRegex = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/;
  const match = str.match(dateRegex);

  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);

    // 验证日期有效性
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // 尝试解析 Excel 序列号日期
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
  }

  // 尝试标准日期解析
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * 生成错误报告 CSV
 */
export function generateErrorReport(errors: ParseError[]): string {
  const headers = ['行号', '字段', '错误原因'];
  const rows = errors.map(e => [e.rowIndex, e.field, e.message]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}
