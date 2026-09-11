import React, { useState } from 'react';
import { useQueue } from '../hooks/useQueue';
import VideoCard from '../components/VideoCard';
import MetadataEditor from '../components/MetadataEditor';
import { QueueItem } from '../../shared/types';

export default function Queue() {
  const { queueItems, loading, refetch, selectedIds, selectItem, selectAll, approveSelected, rejectSelected } = useQueue();
  const [filter, setFilter] = useState('All');
  const [editingItem, setEditingItem] = useState<QueueItem | null>(null);

  const filteredItems = queueItems.filter(item => {
    if (filter === 'All') return true;
    if (filter === 'Pending') return !item.approved;
    if (filter === 'Approved') return item.approved && item.video_status !== 'uploaded';
    if (filter === 'Scheduled') return item.scheduled_for != null;
    return true;
  });

  const handleScan = async () => {
    await window.api.scanFolder();
    refetch();
  };

  const handleSaveMetadata = async (id: number, data: Partial<QueueItem>) => {
    await window.api.updateQueueItem(id, data);
    refetch();
  };

  const handleBulkApprove = async () => {
    await approveSelected();
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Upload Queue</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-secondary" onClick={handleScan}>🔄 Scan Folder</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          {['All', 'Pending', 'Approved', 'Scheduled'].map(f => (
            <button 
              key={f}
              className={filter === f ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        
        {selectedIds.size > 0 && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              {selectedIds.size} selected
            </span>
            <button className="btn-primary" onClick={handleBulkApprove}>Approve Selected</button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="empty-state">Loading queue...</div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">
          <h3>No videos found</h3>
          <p>Drop some videos in your shorts folder or click Scan Folder.</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
                onChange={(e) => selectAll(e.target.checked, filteredItems)}
              />
              Select All
            </label>
          </div>
          <div className="queue-grid">
            {filteredItems.map(item => (
              <VideoCard 
                key={item.id}
                queueItem={item}
                selected={selectedIds.has(item.id)}
                onSelect={selectItem}
                onApprove={async (id) => { await window.api.approveQueueItem(id); refetch(); }}
                onReject={async (id) => { await window.api.rejectQueueItem(id); refetch(); }}
                onEdit={(item) => setEditingItem(item)}
              />
            ))}
          </div>
        </>
      )}

      {editingItem && (
        <MetadataEditor 
          item={editingItem}
          isOpen={true}
          onClose={() => setEditingItem(null)}
          onSave={handleSaveMetadata}
        />
      )}
    </div>
  );
}
