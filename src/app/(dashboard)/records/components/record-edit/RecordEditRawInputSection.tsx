'use client';

import { RefreshCw } from 'lucide-react';

interface RecordEditRawInputSectionProps {
  rawInput: string;
  originalRawInput?: string | null;
  isEditing: boolean;
  isReParsing: boolean;
  onRawInputChange: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onReParse: () => void;
}

export default function RecordEditRawInputSection({
  rawInput,
  originalRawInput,
  isEditing,
  isReParsing,
  onRawInputChange,
  onStartEdit,
  onCancelEdit,
  onReParse,
}: RecordEditRawInputSectionProps) {
  if (!rawInput && !originalRawInput) return null;

  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] text-slate-400">原始输入</span>
        {!isEditing ? (
          <button type="button" onClick={onStartEdit} className="text-[10px] text-blue-500 hover:text-blue-600">
            编辑
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onReParse}
              disabled={isReParsing || !rawInput.trim()}
              className="flex items-center gap-0.5 rounded-md bg-indigo-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-2.5 w-2.5 ${isReParsing ? 'animate-spin' : ''}`} />
              {isReParsing ? '解析中...' : '重新解析'}
            </button>
            <button type="button" onClick={onCancelEdit} className="text-[10px] text-slate-400 hover:text-slate-600">
              取消
            </button>
          </div>
        )}
      </div>
      {isEditing ? (
        <textarea
          value={rawInput}
          onChange={(e) => onRawInputChange(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none resize-none"
        />
      ) : (
        <p className="text-xs text-slate-500 leading-relaxed">{rawInput}</p>
      )}
    </div>
  );
}
