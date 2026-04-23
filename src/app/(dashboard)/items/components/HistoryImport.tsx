'use client';

import { useState, useCallback } from 'react';
import { X, Upload, FileJson, FileSpreadsheet, History, Plus, CheckCircle, AlertCircle, Loader2, Download } from 'lucide-react';
import type { CreateRecordPayload, RecordType } from '@/types/teto';
import { RECORD_TYPES } from '@/types/teto';
import * as XLSX from 'xlsx';
import PhaseForm from './PhaseForm';

interface HistoryImportProps {
  itemId: string;
  itemTitle: string;
  onClose: () => void;
  onRecordsImported: () => void;
  onPhaseImported: () => void;
  onError: (message: string) => void;
}

// 历史记录导入项类型
interface HistoryRecordItem {
  content: string;
  date?: string;
  type?: string;
  occurred_at?: string;
  note?: string;
}

// 导入结果统计
interface ImportResult {
  total: number;
  success: number;
  failed: number;
  errors: string[];
}

// 导入模式
 type ImportMode = 'select' | 'records' | 'phase';

// 文件输入类型
 type InputType = 'paste' | 'file';

export default function HistoryImport({ 
  itemId, 
  itemTitle, 
  onClose, 
  onRecordsImported, 
  onPhaseImported,
  onError 
}: HistoryImportProps) {
  // 模式状态
  const [mode, setMode] = useState<ImportMode>('select');
  
  // 记录导入状态
  const [inputType, setInputType] = useState<InputType>('paste');
  const [jsonText, setJsonText] = useState('');
  const [csvText, setCsvText] = useState('');
  const [parsedRecords, setParsedRecords] = useState<HistoryRecordItem[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  
  // 阶段表单状态
  const [showPhaseForm, setShowPhaseForm] = useState(false);

  // 验证并解析记录类型（只允许 4 个收敛类型）
  const validateRecordType = (type: string | undefined): RecordType => {
    if (!type) return '发生';
    const normalizedType = type.trim();
    // 匹配收敛后的 4 种类型
    if ((RECORD_TYPES as readonly string[]).includes(normalizedType)) {
      return normalizedType as RecordType;
    }
    // 尝试匹配常见变体
    const typeMap: Record<string, RecordType> = {
      'occurrence': '发生',
      'plan': '计划',
      'thought': '想法',
      'summary': '总结',
    };
    return typeMap[normalizedType.toLowerCase()] || '发生';
  };

  // 解析 JSON 数据
  const parseJSON = useCallback((text: string): HistoryRecordItem[] => {
    try {
      const data = JSON.parse(text.trim());
      if (!Array.isArray(data)) {
        throw new Error('JSON 数据必须是数组格式');
      }
      return data.map((item, index) => {
        if (!item.content || typeof item.content !== 'string') {
          throw new Error(`第 ${index + 1} 条记录缺少 content 字段`);
        }
        return {
          content: item.content.trim(),
          type: item.type,
          occurred_at: item.occurred_at,
        };
      });
    } catch (err) {
      throw new Error(`JSON 解析失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, []);

  // RFC 4180 兼容的 CSV 行解析（支持引号内逗号）
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  // 解析 CSV 数据
  const parseCSV = useCallback((text: string): HistoryRecordItem[] => {
    const lines = text.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV 数据至少需要包含表头和一行数据');
    }
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const contentIndex = headers.indexOf('content');
    const typeIndex = headers.indexOf('type');
    const occurredAtIndex = headers.indexOf('occurred_at');

    if (contentIndex === -1) {
      throw new Error('CSV 必须包含 content 列');
    }

    const records: HistoryRecordItem[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const content = values[contentIndex];
      if (!content) {
        throw new Error(`第 ${i + 1} 行缺少 content 值`);
      }
      records.push({
        content,
        type: typeIndex !== -1 ? values[typeIndex] : undefined,
        occurred_at: occurredAtIndex !== -1 ? values[occurredAtIndex] : undefined,
      });
    }
    return records;
  }, []);

  // 解析 Excel 数据
  const parseExcel = useCallback((data: ArrayBuffer): HistoryRecordItem[] => {
    try {
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('Excel 文件中没有工作表');
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      if (rows.length === 0) throw new Error('Excel 文件中没有数据行');
      return rows.map((row, index) => {
        const content = String(row['content'] || '').trim();
        if (!content) throw new Error(`第 ${index + 2} 行缺少 content 列`);
        return {
          content,
          date: row['date'] ? String(row['date']).trim() : undefined,
          type: row['type'] ? String(row['type']).trim() : undefined,
          occurred_at: row['occurred_at'] ? String(row['occurred_at']).trim() : undefined,
          note: row['note'] ? String(row['note']).trim() : undefined,
        };
      });
    } catch (err) {
      throw new Error(`Excel 解析失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, []);

  // 下载模板
  const downloadTemplate = useCallback((format: 'csv' | 'xlsx') => {
    if (format === 'csv') {
      // 直接下载静态 CSV 模板
      const link = document.createElement('a');
      link.href = '/templates/history-record-import-template.csv';
      link.download = 'history-record-import-template.csv';
      link.click();
    } else {
      // 用 xlsx 库动态生成 Excel 模板
      const headers = ['content', 'date', 'type', 'note'];
      const example = ['示例记录内容', '2024-03-15', '发生', '可选备注'];
      const ws = XLSX.utils.aoa_to_sheet([headers, example]);
      // 设置列宽
      ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 20 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '导入模板');
      XLSX.writeFile(wb, 'history-record-import-template.xlsx');
    }
  }, []);

  // 处理粘贴的数据
  const handleParse = useCallback(() => {
    setIsParsing(true);
    setParseError('');
    setParsedRecords([]);
    
    try {
      const text = inputType === 'paste' ? jsonText : csvText;
      if (!text.trim()) {
        throw new Error('请输入数据');
      }
      
      // 自动检测格式
      const trimmedText = text.trim();
      let records: HistoryRecordItem[];
      
      if (trimmedText.startsWith('[') || trimmedText.startsWith('{')) {
        // 尝试解析为 JSON
        records = parseJSON(trimmedText);
      } else if (trimmedText.includes(',')) {
        // 尝试解析为 CSV
        records = parseCSV(trimmedText);
      } else {
        throw new Error('无法识别数据格式，请使用 JSON 或 CSV 格式');
      }
      
      if (records.length === 0) {
        throw new Error('未找到有效记录');
      }
      
      setParsedRecords(records);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : '解析失败');
    } finally {
      setIsParsing(false);
    }
  }, [jsonText, csvText, inputType, parseJSON, parseCSV]);

  // 处理文件上传
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.xlsx')) {
      // Excel 用 ArrayBuffer 读取
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = event.target?.result as ArrayBuffer;
          const records = parseExcel(data);
          setParsedRecords(records);
          setParseError('');
        } catch (err) {
          setParseError(err instanceof Error ? err.message : 'Excel 解析失败');
          setParsedRecords([]);
        }
      };
      reader.onerror = () => {
        onError('文件读取失败');
      };
      reader.readAsArrayBuffer(file);
    } else {
      // JSON / CSV 用文本读取
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setParseError('');
        try {
          if (file.name.endsWith('.json')) {
            setJsonText(content);
            setInputType('paste');
            const records = parseJSON(content);
            setParsedRecords(records);
          } else if (file.name.endsWith('.csv')) {
            setCsvText(content);
            setInputType('file');
            const records = parseCSV(content);
            setParsedRecords(records);
          }
        } catch (err) {
          setParseError(err instanceof Error ? err.message : '解析失败');
          setParsedRecords([]);
        }
      };
      reader.onerror = () => {
        onError('文件读取失败');
      };
      reader.readAsText(file);
    }
  }, [onError, parseExcel, parseJSON, parseCSV]);

  // 执行导入
  const handleImport = useCallback(async () => {
    if (parsedRecords.length === 0) return;
    
    setImporting(true);
    setImportResult(null);
    
    const result: ImportResult = {
      total: parsedRecords.length,
      success: 0,
      failed: 0,
      errors: [],
    };
    
    // 逐条导入记录
    for (let i = 0; i < parsedRecords.length; i++) {
      const record = parsedRecords[i];
      try {
        // 提取日期：优先使用 record.date，其次从 occurred_at 提取
        let date = record.date || new Date().toISOString().slice(0, 10);
        let occurredAt = record.occurred_at;
        
        if (occurredAt) {
          const dateObj = new Date(occurredAt);
          if (!isNaN(dateObj.getTime())) {
            if (!record.date) date = dateObj.toISOString().slice(0, 10);
          }
        } else {
          occurredAt = record.date ? `${record.date}T00:00:00` : new Date().toISOString();
        }
        
        const payload: CreateRecordPayload = {
          content: record.content,
          date,
          type: validateRecordType(record.type),
          occurred_at: occurredAt,
          item_id: itemId,
          note: record.note || undefined,
        };
        
        const res = await fetch('/api/v2/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        
        if (res.ok) {
          result.success++;
        } else {
          const errData = await res.json().catch(() => ({ error: '请求失败' }));
          result.failed++;
          result.errors.push(`第 ${i + 1} 条: ${errData.error || '导入失败'}`);
        }
      } catch (err) {
        result.failed++;
        result.errors.push(`第 ${i + 1} 条: ${err instanceof Error ? err.message : '导入失败'}`);
      }
    }
    
    setImportResult(result);
    setImporting(false);
    
    if (result.success > 0) {
      onRecordsImported();
    }
  }, [parsedRecords, itemId, onRecordsImported]);

  // 处理阶段保存成功
  const handlePhaseSaved = () => {
    setShowPhaseForm(false);
    onPhaseImported();
    // 关闭导入面板
    onClose();
  };

  // 渲染模式选择
  const renderModeSelect = () => (
    <div className="space-y-4">
      {/* 主导文案 */}
      <div className="text-center py-2">
        <p className="text-sm font-medium text-slate-700">这段过去的内容，是清晰明细，还是模糊概括？</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {/* 历史具体记录 */}
        <button
          onClick={() => setMode('records')}
          className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all text-left"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50">
            <FileJson className="h-6 w-6 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">历史具体记录</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              每天做了什么、花了多少时间、来自旧表格或日志 — 按记录进入系统
            </p>
          </div>
          <Plus className="h-5 w-5 text-slate-300" />
        </button>
        
        {/* 历史阶段概括 */}
        <button
          onClick={() => {
            setMode('phase');
            setShowPhaseForm(true);
          }}
          className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 bg-white hover:border-amber-300 hover:shadow-sm transition-all text-left"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50">
            <History className="h-6 w-6 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">历史阶段概括</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              持续数月甚至数年的长期现实，无法拆到每天，但确实存在 — 按阶段进入系统
            </p>
          </div>
          <Plus className="h-5 w-5 text-slate-300" />
        </button>
      </div>
      
      <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
        <p className="text-[11px] text-slate-400 text-center">
          历史内容按同一骨架纳入系统：清晰的走记录，模糊的走阶段。
        </p>
      </div>
    </div>
  );

  // 渲染记录导入界面
  const renderRecordsImport = () => (
    <div className="space-y-4">
      {/* 返回按钮 */}
      <button
        onClick={() => {
          setMode('select');
          setParsedRecords([]);
          setParseError('');
          setImportResult(null);
        }}
        className="text-xs text-slate-500 hover:text-blue-600 flex items-center gap-1"
      >
        ← 返回选择
      </button>

      {/* 语义说明 */}
      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
        <p className="text-xs text-blue-700">清晰的历史内容，按记录进入系统。后续可在事项时间线中统一回看。</p>
      </div>
      
      {/* 输入方式切换 */}
      {!parsedRecords.length && !importResult && (
        <>
          <div className="flex gap-2">
            <button
              onClick={() => setInputType('paste')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
                inputType === 'paste'
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              粘贴数据
            </button>
            <button
              onClick={() => setInputType('file')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
                inputType === 'file'
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              上传文件
            </button>
          </div>
          
          {inputType === 'paste' ? (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">
                粘贴 JSON 或 CSV 数据
              </label>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                placeholder={`支持格式示例：

JSON:
[
  { "content": "背了50个单词", "type": "发生", "occurred_at": "2024-03-15T10:00:00" },
  { "content": "完成了听力练习", "type": "发生", "occurred_at": "2024-03-16T14:00:00" }
]

CSV:
content,type,occurred_at
背了50个单词,发生,2024-03-15
完成了听力练习,发生,2024-03-16`}
                rows={10}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none font-mono"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">
                上传文件
              </label>
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-blue-300 transition-colors">
                <input
                  type="file"
                  accept=".json,.csv,.xlsx"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="history-file-upload"
                />
                <label
                  htmlFor="history-file-upload"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="h-8 w-8 text-slate-300" />
                  <span className="text-xs text-slate-500">点击选择 .json / .csv / .xlsx 文件</span>
                </label>
              </div>
              {/* 模板下载 + 格式说明 */}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-slate-400">下载模板：</span>
                <button
                  onClick={() => downloadTemplate('csv')}
                  className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  <Download className="h-3 w-3" />
                  CSV 模板
                </button>
                <button
                  onClick={() => downloadTemplate('xlsx')}
                  className="flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1 text-[10px] font-medium text-green-700 hover:bg-green-100 transition-colors"
                >
                  <Download className="h-3 w-3" />
                  Excel 模板
                </button>
              </div>
              <p className="mt-2 text-[10px] text-slate-400 text-center">
                支持 JSON / CSV / Excel(.xlsx)，若不确定格式，请先下载模板填写后再导入
              </p>
            </div>
          )}
          
          {parseError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}
          
          <button
            onClick={handleParse}
            disabled={isParsing || (!jsonText.trim() && inputType === 'paste')}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:bg-blue-300 transition-colors"
          >
            {isParsing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                解析中...
              </>
            ) : (
              <>
                <FileJson className="h-4 w-4" />
                解析数据
              </>
            )}
          </button>
        </>
      )}
      
      {/* 预览区域 */}
      {parsedRecords.length > 0 && !importResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-slate-900">
              预览 ({parsedRecords.length} 条记录)
            </h4>
            <button
              onClick={() => {
                setParsedRecords([]);
                setParseError('');
              }}
              className="text-xs text-slate-500 hover:text-red-600"
            >
              重新输入
            </button>
          </div>
          
          <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50">
            <div className="divide-y divide-slate-200">
              {parsedRecords.slice(0, 10).map((record, index) => (
                <div key={index} className="px-3 py-2 text-xs">
                  <p className="text-slate-800 truncate">{record.content}</p>
                  <div className="flex items-center gap-2 mt-1 text-slate-400">
                    <span className="bg-slate-200 px-1.5 py-0.5 rounded">
                      {validateRecordType(record.type)}
                    </span>
                    {record.occurred_at && (
                      <span>{new Date(record.occurred_at).toLocaleDateString('zh-CN')}</span>
                    )}
                  </div>
                </div>
              ))}
              {parsedRecords.length > 10 && (
                <div className="px-3 py-2 text-xs text-slate-400 text-center">
                  还有 {parsedRecords.length - 10} 条记录...
                </div>
              )}
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => setParsedRecords([])}
              className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:bg-blue-300 transition-colors"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  导入中...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  确认导入
                </>
              )}
            </button>
          </div>
        </div>
      )}
      
      {/* 导入结果 */}
      {importResult && (
        <div className="space-y-4">
          <div className={`rounded-lg p-4 ${importResult.failed === 0 ? 'bg-green-50' : importResult.success === 0 ? 'bg-red-50' : 'bg-amber-50'}`}>
            <div className="flex items-center gap-2 mb-3">
              {importResult.failed === 0 ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : importResult.success === 0 ? (
                <AlertCircle className="h-5 w-5 text-red-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-500" />
              )}
              <span className={`text-sm font-medium ${
                importResult.failed === 0 ? 'text-green-700' : importResult.success === 0 ? 'text-red-700' : 'text-amber-700'
              }`}>
                导入完成
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white rounded-lg p-2">
                <p className="text-lg font-bold text-slate-700">{importResult.total}</p>
                <p className="text-[10px] text-slate-400">总计</p>
              </div>
              <div className="bg-white rounded-lg p-2">
                <p className="text-lg font-bold text-green-600">{importResult.success}</p>
                <p className="text-[10px] text-slate-400">成功</p>
              </div>
              <div className="bg-white rounded-lg p-2">
                <p className="text-lg font-bold text-red-600">{importResult.failed}</p>
                <p className="text-[10px] text-slate-400">失败</p>
              </div>
            </div>
          </div>
          
          {importResult.errors.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-medium text-red-700 mb-2">错误详情：</p>
              <ul className="space-y-1">
                {importResult.errors.slice(0, 5).map((error, index) => (
                  <li key={index} className="text-xs text-red-600">{error}</li>
                ))}
                {importResult.errors.length > 5 && (
                  <li className="text-xs text-red-400">还有 {importResult.errors.length - 5} 条错误...</li>
                )}
              </ul>
            </div>
          )}
          
          <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors"
          >
            查看事项时间线
          </button>
          <button
            onClick={() => {
              setImportResult(null);
              setParsedRecords([]);
              setJsonText('');
              setCsvText('');
              setParseError('');
            }}
            className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors"
          >
            继续导入
          </button>
          </div>
        </div>
      )}
    </div>
  );

  // 渲染阶段补录界面
  const renderPhaseImport = () => (
    <div className="space-y-4">
      {/* 返回按钮 */}
      <button
        onClick={() => {
          setMode('select');
          setShowPhaseForm(false);
        }}
        className="text-xs text-slate-500 hover:text-blue-600 flex items-center gap-1"
      >
        ← 返回选择
      </button>
        
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
        <p className="text-xs text-amber-700">
          你正在补录过去的一段长期现实。不要求精确到每天，重点是概括“那段时间整体是什么样子”。
        </p>
      </div>
      
      {/* 显示 PhaseForm */}
      {showPhaseForm && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <PhaseForm
            itemId={itemId}
            phase={null}
            defaultHistorical={true}
            onClose={() => {
              setShowPhaseForm(false);
              setMode('select');
            }}
            onSaved={handlePhaseSaved}
            onError={onError}
          />
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      
      {/* 抽屉 */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto bg-white shadow-xl lg:rounded-l-2xl">
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">导入历史</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">{itemTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        
        {/* 内容 */}
        <div className="px-5 py-4">
          {mode === 'select' && renderModeSelect()}
          {mode === 'records' && renderRecordsImport()}
          {mode === 'phase' && renderPhaseImport()}
        </div>
      </div>
    </>
  );
}
