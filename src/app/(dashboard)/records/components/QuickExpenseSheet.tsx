'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import type { Item, Record as TetoRecord } from '@/types/teto';
import { postManualRecord } from '@/lib/activity/post-manual-record';
import {
  PAYMENT_SOURCES,
  type PaymentSource,
  getRecentItemsForChips,
  loadLastActivityContext,
  loadLastPaymentSource,
  saveLastPaymentSource,
} from '@/lib/activity/recent-context';
import { resolveTargetItemId } from '@/lib/activity/item-tree';

const EXPENSE_CATEGORIES = ['咖啡', '饮食', '交通', '购物', '其他'] as const;

interface QuickExpenseSheetProps {
  open: boolean;
  date: string;
  items: Item[];
  currentActivity?: TetoRecord | null;
  onClose: () => void;
  onRecorded: () => void;
  onError?: (message: string) => void;
}

export default function QuickExpenseSheet({
  open,
  date,
  items,
  currentActivity = null,
  onClose,
  onRecorded,
  onError,
}: QuickExpenseSheetProps) {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [itemId, setItemId] = useState<string | null>(null);
  const [paymentSource, setPaymentSource] = useState<PaymentSource>(loadLastPaymentSource);
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  const lastContext = useMemo(() => loadLastActivityContext(), [open]);
  const currentActivityItemId = currentActivity?.item_id ?? null;

  const recentItems = useMemo(() => {
    const base = getRecentItemsForChips(items, [], lastContext, 4);
    if (!currentActivityItemId) return base;
    const currentItem = items.find((i) => i.id === currentActivityItemId);
    if (!currentItem || base.some((i) => i.id === currentActivityItemId)) return base;
    return [currentItem, ...base].slice(0, 4);
  }, [items, lastContext, currentActivityItemId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setPaymentSource(loadLastPaymentSource());
    const ctxItemId = lastContext ? resolveTargetItemId(lastContext) : null;
    setItemId(currentActivityItemId ?? ctxItemId);
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, lastContext, currentActivityItemId]);

  const handleSubmit = async () => {
    const cost = Number.parseFloat(amount);
    if (!amount.trim() || Number.isNaN(cost) || cost <= 0) {
      onError?.('请输入有效金额');
      return;
    }
    setSubmitting(true);
    try {
      await postManualRecord({
        content: category,
        type: '发生',
        date,
        cost,
        money_direction: 'expense',
        money_currency: 'CNY',
        item_id: itemId ?? undefined,
        tool_label: paymentSource,
        input_source: 'manual',
        review_status: 'confirmed',
        lifecycle_status: 'completed',
      });
      saveLastPaymentSource(paymentSource);
      setAmount('');
      setCategory(EXPENSE_CATEGORIES[0]);
      onRecorded();
      onClose();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : '记录失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[100] bg-black/30"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        className={[
          'fixed inset-x-0 z-[101] rounded-t-2xl border-t border-slate-200 bg-white p-4 shadow-2xl',
          'bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-0',
          'lg:max-w-md lg:mx-auto',
        ].join(' ')}
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">记一笔花费</h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-baseline gap-1 mb-4">
          <span className="text-lg text-slate-400">¥</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            autoFocus
            className="flex-1 border-0 bg-transparent text-3xl font-semibold tabular-nums text-slate-900 focus:outline-none focus:ring-0"
          />
        </div>

        <p className="text-[10px] text-slate-400 mb-1.5">类别</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {EXPENSE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={[
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                category === c
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {c}
            </button>
          ))}
        </div>

        {recentItems.length > 0 && (
          <>
            <p className="text-[10px] text-slate-400 mb-1.5">关联事项（可选）</p>
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                onClick={() => setItemId(null)}
                className={[
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  itemId === null
                    ? 'bg-slate-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                ].join(' ')}
              >
                不关联
              </button>
              {recentItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setItemId(item.id)}
                  className={[
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    itemId === item.id
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {item.title}
                  {item.id === currentActivityItemId && (
                    <span className="ml-0.5 opacity-80">· 当前</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        <p className="text-[10px] text-slate-400 mb-1.5">支付方式（可选）</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {PAYMENT_SOURCES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPaymentSource(p)}
              className={[
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                paymentSource === p
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {p}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={submitting || !amount.trim()}
          onClick={() => void handleSubmit()}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          记录
        </button>
      </div>
    </>,
    document.body
  );
}
