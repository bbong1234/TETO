'use client';

import { useState, useEffect } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import type { Phase, CreatePhasePayload, UpdatePhasePayload } from '@/types/teto';

interface PhaseFormProps {
  itemId: string;
  phase?: Phase | null;
  defaultHistorical?: boolean;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}

export default function PhaseForm({ itemId, phase, defaultHistorical, onClose, onSaved, onError }: PhaseFormProps) {
  const isEditMode = !!phase;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (phase) {
      setTitle(phase.title);
      setDescription(phase.description || '');
      setStartDate(phase.start_date ? phase.start_date.split('T')[0] : '');
      setEndDate(phase.end_date ? phase.end_date.split('T')[0] : '');
    } else {
      setTitle('');
      setDescription('');
      setStartDate('');
      setEndDate('');
    }
  }, [phase]);

  const handleSave = async () => {
    if (!title.trim()) { onError('请输入阶段标题'); return; }
    setSaving(true);
    try {
      if (isEditMode && phase) {
        const payload: UpdatePhasePayload = {
          title: title.trim(),
          description: description || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          status: phase.status,
          is_historical: phase.is_historical,
        };
        const res = await fetch(`/api/v2/phases/${phase.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) { onSaved(); } else { const e = await res.json(); onError(e.error || '保存失败'); }
      } else {
        const payload: CreatePhasePayload = {
          item_id: itemId,
          title: title.trim(),
          description: description || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          status: '进行中',
          is_historical: defaultHistorical ?? false,
        };
        const res = await fetch('/api/v2/phases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) { onSaved(); } else { const e = await res.json(); onError(e.error || '创建失败'); }
      }
    } catch { onError('保存失败，请重试'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!phase || !confirm('确定删除此阶段？')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v2/phases/${phase.id}`, { method: 'DELETE' });
      if (res.ok) { onSaved(); } else { const e = await res.json(); onError(e.error || '删除失败'); }
    } catch { onError('删除失败，请重试'); } finally { setDeleting(false); }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-y-auto bg-white shadow-xl lg:rounded-l-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">{isEditMode ? '编辑阶段' : '新建阶段'}</h2>
          <div className="flex items-center gap-2">
            {isEditMode && (
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />删除
              </button>
            )}
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">标题 <span className="text-red-500">*</span></label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} autoFocus
              placeholder="如：基础搭建期、备考冲刺"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">开始日期</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">结束日期</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">备注</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="这段时间的整体情况..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-slate-200 bg-white px-5 py-4">
          <button onClick={handleSave} disabled={saving || !title.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600 disabled:bg-blue-300 transition-colors">
            <Save className="h-4 w-4" />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </>
  );
}
