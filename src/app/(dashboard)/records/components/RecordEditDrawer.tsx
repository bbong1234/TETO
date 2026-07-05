'use client';

import { Trash2, X } from 'lucide-react';
import type { Goal, Item, Record, Tag } from '@/types/teto';
import { formatRecordDisplayNo } from '@/lib/activity/format-record-display-no';
import RecordEditPanel from './record-edit/RecordEditPanel';
import { useRecordEditForm } from './record-edit/useRecordEditForm';

interface RecordEditDrawerProps {
  record: Record;
  tags: Tag[];
  items: Item[];
  goals?: Goal[];
  onClose: () => void;
  onSaved: (updated: Record) => void;
  onDeleted: (id: string) => void;
  onDeleteFailed?: (record: Record) => void;
  onError: (message: string) => void;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
  onTagCreated?: (tag: Tag) => void;
  onCreateError?: (message: string) => void;
}

export default function RecordEditDrawer({
  record,
  tags,
  items,
  goals,
  onClose,
  onSaved,
  onDeleted,
  onDeleteFailed,
  onError,
  onItemsChange,
  onItemCreated,
  onTagCreated,
  onCreateError,
}: RecordEditDrawerProps) {
  const {
    form,
    patchForm,
    remove,
    deleting,
    saving,
    saveStatus,
    setContextSubItemsCount,
  } = useRecordEditForm({ record, items, onSaved, onDeleted, onDeleteFailed, onError });

  const displayNo = formatRecordDisplayNo(record);

  const statusText =
    saveStatus === 'saving' ? '保存中…' : saveStatus === 'saved' ? '已保存' : '';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto bg-white shadow-xl lg:rounded-l-2xl">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white px-5 py-3">
          <h2 className="shrink-0 text-sm font-bold text-slate-900">记录详情</h2>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(displayNo)}
              className="font-mono text-[11px] text-slate-400 hover:text-slate-600 tabular-nums"
              title="点击复制编号"
            >
              {displayNo}
            </button>
            {statusText && (
              <span className={`text-[10px] ${saving ? 'text-blue-500' : 'text-green-600'}`}>
                {statusText}
              </span>
            )}
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4">
          <RecordEditPanel
            record={record}
            form={form}
            items={items}
            tags={tags}
            goals={goals}
            onPatch={patchForm}
            onContextSubItemsLoaded={setContextSubItemsCount}
            onItemsChange={onItemsChange}
            onItemCreated={onItemCreated}
            onTagCreated={onTagCreated}
            onCreateError={onCreateError ?? onError}
          />
        </div>
      </div>
    </>
  );
}
