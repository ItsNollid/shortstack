import { useState, useEffect, useCallback } from 'react';
import { QueueItem } from '../../shared/types';
import { useIPC } from './useIPC';

export function useQueue() {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const { data: queueItems = [], loading, error, refetch } = useIPC<QueueItem[]>(() => window.api.getQueue());

  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 30000); // 30 seconds refresh
    return () => clearInterval(interval);
  }, [refetch]);

  const selectItem = (id: number, selected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const selectAll = (selected: boolean, items: QueueItem[]) => {
    if (selected) {
      setSelectedIds(new Set(items.map(item => item.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const approveSelected = async () => {
    for (const id of Array.from(selectedIds)) {
      await window.api.approveQueueItem(id);
    }
    setSelectedIds(new Set());
    refetch();
  };

  const rejectSelected = async () => {
    for (const id of Array.from(selectedIds)) {
      await window.api.rejectQueueItem(id);
    }
    setSelectedIds(new Set());
    refetch();
  };

  return {
    queueItems,
    loading,
    error,
    refetch,
    selectedIds,
    selectItem,
    selectAll,
    approveSelected,
    rejectSelected
  };
}
