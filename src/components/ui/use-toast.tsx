'use client';

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, X } from 'lucide-react';
import { normalizeErrorMessage } from '@/lib/api/client-errors';

export interface Toast {
  id: number;
  message: string;
}

let toastId = 0;

/**
 * 最小统一错误提示 hook
 * - showError: 显示一条错误 Toast，3 秒自动消失
 * - toasts / dismissToast: 供 ToastContainer 渲染用
 */
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showError = useCallback((message: string) => {
    const text = normalizeErrorMessage(message);
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message: text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, showError, dismissToast };
}

/**
 * 统一错误 Toast 容器
 * 固定在页面顶部居中，自动消失，可手动关闭
 */
export default function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (toasts.length === 0 || !mounted) return null;

  return createPortal(
    <div
      className="fixed left-1/2 z-[500] flex w-[min(100vw-2rem,24rem)] -translate-x-1/2 flex-col items-stretch gap-2 pointer-events-none"
      style={{ top: 'max(1rem, calc(env(safe-area-inset-top, 0px) + 3.5rem))' }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className="pointer-events-auto flex items-start gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-lg"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1 leading-snug break-words">{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="ml-1 shrink-0 rounded p-0.5 hover:bg-red-700 transition-colors"
            aria-label="关闭"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
