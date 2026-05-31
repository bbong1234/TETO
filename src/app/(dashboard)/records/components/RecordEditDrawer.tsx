'use client';

import { Save, Trash2, X } from 'lucide-react';
import type { Goal, Item, Record, Tag } from '@/types/teto';
import RecordEditAdvancedFields from './record-edit/RecordEditAdvancedFields';
import RecordEditClarifyBanner from './record-edit/RecordEditClarifyBanner';
import RecordEditCoreFields from './record-edit/RecordEditCoreFields';
import RecordEditExplainPanel from './record-edit/RecordEditExplainPanel';
import RecordEditLinksSection from './record-edit/RecordEditLinksSection';
import RecordEditOrgFields from './record-edit/RecordEditOrgFields';
import RecordEditRawInputSection from './record-edit/RecordEditRawInputSection';
import { useRecordEditForm } from './record-edit/useRecordEditForm';

interface RecordEditDrawerProps {
  record: Record;
  tags: Tag[];
  items: Item[];
  goals?: Goal[];
  onClose: () => void;
  onSaved: (updated: Record) => void;
  onDeleted: (id: string) => void;
  onError: (message: string) => void;
  onItemsChange?: () => void | Promise<void>;
  onItemCreated?: (item: Item) => void;
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
  onError,
  onItemsChange,
  onItemCreated,
  onCreateError,
}: RecordEditDrawerProps) {
  const {
    form,
    patchForm,
    save,
    remove,
    reParse,
    saving,
    deleting,
    showAdvanced,
    setShowAdvanced,
    isEditingRawInput,
    setIsEditingRawInput,
    isReParsing,
    setContextSubItemsCount,
  } = useRecordEditForm({ record, items, onSaved, onDeleted, onError });

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto bg-white shadow-xl lg:rounded-l-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h2 className="text-sm font-bold text-slate-900">编辑记录</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <RecordEditRawInputSection
            rawInput={form.rawInput}
            originalRawInput={record.raw_input}
            isEditing={isEditingRawInput}
            isReParsing={isReParsing}
            onRawInputChange={(v) => patchForm({ rawInput: v })}
            onStartEdit={() => setIsEditingRawInput(true)}
            onCancelEdit={() => {
              patchForm({ rawInput: record.raw_input || '' });
              setIsEditingRawInput(false);
            }}
            onReParse={reParse}
          />

          <RecordEditCoreFields form={form} originalRecord={record} onPatch={patchForm} />

          <RecordEditExplainPanel recordId={record.id} />

          <RecordEditOrgFields
            form={form}
            items={items}
            tags={tags}
            goals={goals}
            goalBadge={record.goal ?? null}
            onPatch={patchForm}
            onContextSubItemsLoaded={setContextSubItemsCount}
            onItemsChange={onItemsChange}
            onItemCreated={onItemCreated}
            onCreateError={onCreateError ?? onError}
          />

          <RecordEditLinksSection recordId={record.id} />

          <RecordEditAdvancedFields
            form={form}
            open={showAdvanced}
            onToggle={() => setShowAdvanced((v) => !v)}
            onPatch={patchForm}
          />

          <RecordEditClarifyBanner record={record} />
        </div>

        <div className="sticky bottom-0 border-t border-slate-200 bg-white px-5 py-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-600 disabled:bg-blue-300 transition-colors"
          >
            <Save className="h-4 w-4" />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </>
  );
}
