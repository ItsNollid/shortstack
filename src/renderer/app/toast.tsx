// Short-lived confirmations, and the one place an undoable action offers its undo.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui';
import styles from './Toast.module.css';

export interface ToastRequest {
  text: string;
  kind?: 'info' | 'bad';
  action?: { label: string; run: () => void };
  /** Milliseconds before it disappears. Anything with an action gets longer. */
  duration?: number;
}

interface Toast extends ToastRequest {
  id: number;
}

const ToastContext = createContext<((toast: ToastRequest) => void) | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((request: ToastRequest) => {
    const id = nextId.current++;
    setToasts((current) => {
      // Only the newest undo is offered. Two Undo buttons on screen is a coin toss about which
      // change you are reversing.
      const kept = request.action === undefined ? current : current.filter((toast) => toast.action === undefined);
      return [...kept.slice(-2), { ...request, id }];
    });
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.layer} aria-live="polite">
        {toasts.map((toast) => (
          <ToastRow key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }): React.JSX.Element {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, toast.duration ?? (toast.action === undefined ? 3500 : 8000));
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div className={`${styles.toast} ${toast.kind === 'bad' ? styles.bad : ''}`} role="status">
      <span className={styles.text}>{toast.text}</span>
      {toast.action !== undefined && (
        <Button
          size="small"
          onClick={() => {
            toast.action?.run();
            onDismiss();
          }}
        >
          {toast.action.label}
        </Button>
      )}
    </div>
  );
}

export function useToast(): (toast: ToastRequest) => void {
  const show = useContext(ToastContext);
  if (show === null) throw new Error('useToast must be used inside ToastProvider');
  return show;
}
