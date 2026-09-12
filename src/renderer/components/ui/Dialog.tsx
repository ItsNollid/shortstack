import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import styles from './Dialog.module.css';

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Built on the native dialog element, which gives focus trapping, Escape, and the backdrop
 *  without reimplementing any of them. */
export function Dialog({ open, title, onClose, children, footer }: DialogProps): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Clicking the backdrop lands on the dialog element itself, never on its contents.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className={styles.inner}>
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer !== undefined && <div className={styles.foot}>{footer}</div>}
      </div>
    </dialog>
  );
}
