'use client';

import React, { useState, useCallback, useRef } from 'react';
import { X, Download, FileSpreadsheet, AlertCircle } from 'lucide-react';
import type { TaskDefinition } from '@/types/tasks';
import type { ParsedRow } from '@/lib/excel/parser';
import type { ValidatedRow, ValidationResult } from '@/lib/excel/validator';
import { parseExcelFile } from '@/lib/excel/parser';
import { validateRows, getValidRows, generateErrorReportData } from '@/lib/excel/validator';
import ExcelUploadZone from './ExcelUploadZone';
import ExcelPreviewTable from './ExcelPreviewTable';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userTasks: TaskDefinition[];
  existingRecords: Array<{ date: string; taskId: string }>;
  onImport: (records: Array<{
    date: string;
    taskId: string;
    valueBoolean: boolean | null;
    valueNumber: number | null;
  }>, overrideConflicts: boolean) => Promise<{ success: number; skipped: number; updated: number }>;
}

type Step = 'upload' | 'preview' | 'importing' | 'result';

export default function ExcelImportModal({
  isOpen,
  onClose,
  userTasks,
  existingRecords,
  onImport,
}: ExcelImportModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<{ success: number; skipped: number; updated: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [overrideConflicts, setOverrideConflicts] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const checkConflict = useCallback(
    async (date: string, taskId: string): Promise<boolean> => {
      return existingRecords.some(r => r.date === date && r.taskId === taskId);
    },
    [existingRecords]
  );

  const handleFileSelect = useCallback(
    async (file: File) => {
      setIsLoading(true);
      setError('');
      setFileName(file.name);

      try {
        const arrayBuffer = await file.arrayBuffer();
        const parseResult = parseExcelFile(arrayBuffer);

        if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
          setError(parseResult.errors[0].message);
          setIsLoading(false);
          return;
        }

        const result = await validateRows(parseResult.data, userTasks, checkConflict);
        setValidationResult(result);
        setStep('preview');
      } catch (err) {
        setError('文件解析失败，请检查文件格式');
      } finally {
        setIsLoading(false);
      }
    },
    [userTasks, checkConflict]
  );

  const handleImport = useCallback(async () => {
    if (!validationResult) return;

    // 当选择覆盖时，包含冲突行
    const rowsToImport = overrideConflicts 
      ? validationResult.rows.filter(r => r.status === 'valid' || r.status === 'conflict')
      : getValidRows(validationResult.rows);

    if (rowsToImport.length === 0) {
      setError('没有有效数据可导入');
      return;
    }

    setStep('importing');
    setError('');

    try {
      const records = rowsToImport.map(row => ({
        date: row.date,
        taskId: row.taskId!,
        valueBoolean: row.valueBoolean,
        valueNumber: row.valueNumber,
      }));

      const result = await onImport(records, overrideConflicts);
      setImportResult(result);
      setStep('result');
    } catch (err) {
      setError('导入失败，请重试');
      setStep('preview');
    }
  }, [validationResult, onImport, overrideConflicts]);

  const handleDownloadTemplate = useCallback(() => {
    const csvContent = '日期,任务名称,完成状态,数值\n2024-01-01,晨跑,是,5\n2024-01-01,阅读,是,\n2024-01-02,晨跑,否,0';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '任务记录导入模板.csv';
    link.click();
  }, []);

  const handleDownloadErrorReport = useCallback(() => {
    if (!validationResult) return;
    const errorData = generateErrorReportData(validationResult.rows);
    if (errorData.length === 0) return;

    const csvContent = ['行号,日期,任务名称,错误原因', ...errorData.map(r => `${r.rowIndex},${r.date},${r.taskName},${r.errorMessage}`)].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '导入错误报告.csv';
    link.click();
  }, [validationResult]);

  const handleReset = useCallback(() => {
    setStep('upload');
    setFileName('');
    setValidationResult(null);
    setImportResult(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleClose = useCallback(() => {
    handleReset();
    onClose();
  }, [handleReset, onClose]);

  if (!isOpen) return null;

  const validCount = validationResult?.stats.valid || 0;
  const errorCount = validationResult?.stats.error || 0;
  const conflictCount = validationResult?.stats.conflict || 0;
  const totalCount = validationResult?.stats.total || 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-slate-900">
            {step === 'upload' && '导入任务记录'}
            {step === 'preview' && '导入预览'}
            {step === 'importing' && '导入中...'}
            {step === 'result' && '导入完成'}
          </h2>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            disabled={step === 'importing'}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {step === 'upload' && (
            <div className="space-y-6">
              <ExcelUploadZone onFileSelect={handleFileSelect} isLoading={isLoading} />

              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">使用说明</span>
                </div>
                <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside">
                  <li>下载模板，按格式填写数据</li>
                  <li>任务名称必须与系统中已有任务完全匹配</li>
                  <li>日期格式：2024-01-01 或 2024/01/01</li>
                  <li>完成状态：是/否 或 1/0</li>
                </ol>
                <button
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Download className="h-4 w-4" />
                  下载 CSV 模板
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && validationResult && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-semibold text-slate-900">{totalCount}</div>
                  <div className="text-xs text-slate-500">总计</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-semibold text-green-600">{validCount}</div>
                  <div className="text-xs text-green-600">有效</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-semibold text-red-600">{errorCount}</div>
                  <div className="text-xs text-red-600">错误</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-semibold text-orange-600">{conflictCount}</div>
                  <div className="text-xs text-orange-600">冲突</div>
                </div>
              </div>

              {fileName && (
                <div className="text-sm text-slate-600">
                  文件: <span className="font-medium">{fileName}</span>
                </div>
              )}

              {conflictCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <input
                        type="checkbox"
                        id="override-conflicts"
                        checked={overrideConflicts}
                        onChange={(e) => setOverrideConflicts(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="override-conflicts" className="font-medium text-amber-800 mb-1 block">
                        覆盖冲突记录
                      </label>
                      <p className="text-sm text-amber-600">
                        选择后，将覆盖 {conflictCount} 条已存在的记录
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <ExcelPreviewTable rows={validationResult.rows} />

              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-slate-600">正在导入数据...</p>
            </div>
          )}

          {step === 'result' && importResult && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">导入完成</h3>
              <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-3xl font-semibold text-green-600">{importResult.success}</div>
                  <div className="text-sm text-green-600">成功导入</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <div className="text-3xl font-semibold text-orange-600">{importResult.skipped}</div>
                  <div className="text-sm text-orange-600">跳过(冲突)</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-3xl font-semibold text-blue-600">{importResult.updated}</div>
                  <div className="text-sm text-blue-600">覆盖更新</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50">
          {step === 'preview' && (
            <>
              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  重新选择
                </button>
                {(errorCount > 0 || conflictCount > 0) && (
                  <button
                    onClick={handleDownloadErrorReport}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    下载错误报告
                  </button>
                )}
              </div>
              <button
                onClick={handleImport}
                disabled={validCount === 0}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                确认导入 {validCount > 0 ? `(${validCount}条)` : ''}
              </button>
            </>
          )}

          {step === 'upload' && (
            <div className="ml-auto">
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
              >
                取消
              </button>
            </div>
          )}

          {step === 'result' && (
            <div className="ml-auto">
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                完成
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
