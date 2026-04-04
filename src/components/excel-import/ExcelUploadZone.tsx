'use client';

import React, { useCallback } from 'react';
import { Upload, FileSpreadsheet } from 'lucide-react';

interface ExcelUploadZoneProps {
  onFileSelect: (file: File) => void;
  isLoading?: boolean;
}

export default function ExcelUploadZone({ onFileSelect, isLoading }: ExcelUploadZoneProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer"
    >
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileInput}
        className="hidden"
        id="excel-upload"
        disabled={isLoading}
      />
      <label htmlFor="excel-upload" className="cursor-pointer block">
        {isLoading ? (
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600 mb-3"></div>
            <p className="text-slate-600">解析中...</p>
          </div>
        ) : (
          <>
            <FileSpreadsheet className="mx-auto h-12 w-12 text-slate-400 mb-3" />
            <p className="text-slate-600 mb-2">
              <span className="font-medium text-blue-600">点击选择文件</span> 或拖拽到此处
            </p>
            <p className="text-sm text-slate-400">支持 .xlsx, .xls 格式</p>
          </>
        )}
      </label>
    </div>
  );
}
