// Approval is the one action that puts a video on a path to YouTube, so it goes through a single
// place: one consent dialog, one call, wherever it was triggered from.
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { QueueItemDTO } from '../../shared/dto';
import { ApproveDialog } from '../components/ApproveDialog';
import { useApiMutation } from '../hooks/useApi';

type RequestApproval = (items: readonly QueueItemDTO[], onApproved?: () => void) => void;

const ApprovalContext = createContext<RequestApproval | null>(null);

export function ApprovalProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [items, setItems] = useState<readonly QueueItemDTO[]>([]);
  // Held in a ref so the caller's cleanup (clearing a selection, say) survives re-renders of the
  // page that opened the dialog.
  const afterApproval = useRef<(() => void) | null>(null);
  const approve = useApiMutation((ids: number[]) => window.api.queueApprove(ids), {
    onDone: () => {
      afterApproval.current?.();
      afterApproval.current = null;
      setItems([]);
    }
  });

  const request = useCallback<RequestApproval>((next, onApproved) => {
    if (next.length === 0) return;
    afterApproval.current = onApproved ?? null;
    setItems(next);
  }, []);

  return (
    <ApprovalContext.Provider value={request}>
      {children}
      <ApproveDialog
        items={items}
        pending={approve.pending}
        problem={approve.error}
        onCancel={() => {
          approve.clearError();
          afterApproval.current = null;
          setItems([]);
        }}
        onConfirm={() => void approve.run(items.map((item) => item.id))}
      />
    </ApprovalContext.Provider>
  );
}

export function useRequestApproval(): RequestApproval {
  const request = useContext(ApprovalContext);
  if (request === null) throw new Error('useRequestApproval must be used inside ApprovalProvider');
  return request;
}
