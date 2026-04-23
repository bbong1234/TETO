'use client';

import { useState, useCallback } from 'react';
import { AlertCircle, X } from 'lucide-react';

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
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message }]);
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
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="ml-1 shrink-0 rounded p-0.5 hover:bg-red-700 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
