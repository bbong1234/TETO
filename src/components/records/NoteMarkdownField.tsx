'use client';

import { useState } from 'react';
import { Eye, Pencil } from 'lucide-react';
import { renderSimpleMarkdown } from '@/lib/activity/simple-markdown';

interface NoteMarkdownFieldProps {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  compact?: boolean;
  hideLabel?: boolean;
}

export default function NoteMarkdownField({
  value,
  onChange,
  rows = 3,
  placeholder = '支持 **粗体**、*斜体*、`代码`、- 列表',
  compact = false,
  hideLabel = false,
}: NoteMarkdownFieldProps) {
  const [preview, setPreview] = useState(false);

  return (
    <div className="space-y-1">
      {!hideLabel && (
        <div className="flex items-center justify-between">
          <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-slate-400`}>
            {preview ? '（预览）' : ''}
          </span>
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-blue-600"
          >
            {preview ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {preview ? '编辑' : '预览'}
          </button>
        </div>
      )}
      {hideLabel && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-blue-600"
          >
            {preview ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </button>
        </div>
      )}
      {preview ? (
        <div
          className="min-h-[4rem] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
          dangerouslySetInnerHTML={{
            __html: value.trim() ? renderSimpleMarkdown(value) : '<span class="text-slate-300">（空）</span>',
          }}
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none font-mono"
        />
      )}
    </div>
  );
}
