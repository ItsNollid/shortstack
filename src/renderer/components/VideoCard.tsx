import React from 'react';
import { QueueItem } from '../../shared/types';
import StatusBadge from './StatusBadge';

interface VideoCardProps {
  queueItem: QueueItem;
  selected: boolean;
  onSelect: (id: number, selected: boolean) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onEdit: (item: QueueItem) => void;
}

export default function VideoCard({ queueItem, selected, onSelect, onApprove, onReject, onEdit }: VideoCardProps) {
  return (
    <div className="video-card animate-fade-in">
      <div className="video-card-header">
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <input 
            type="checkbox" 
            checked={selected} 
            onChange={(e) => onSelect(queueItem.id, e.target.checked)}
            style={{ width: '16px', height: '16px', marginTop: '2px' }}
          />
          <div>
            <div className="video-card-title">{queueItem.filename || queueItem.title}</div>
            <div className="video-card-meta">
              Video
            </div>
          </div>
        </div>
        <StatusBadge status={queueItem.video_status || (queueItem.approved ? 'approved' : 'pending')} />
      </div>

      <div className="video-card-tags">
        {(() => {
          const tagsArray = JSON.parse(queueItem.tags || '[]');
          return (
            <>
              {tagsArray.slice(0, 3).map((tag: string) => (
                <span key={tag} className="tag-chip">#{tag}</span>
              ))}
              {tagsArray.length > 3 && (
                <span className="tag-chip">+{tagsArray.length - 3}</span>
              )}
            </>
          );
        })()}
      </div>

      <div className="video-card-actions">
        {!queueItem.approved && (
          <>
            <button className="btn-primary" onClick={() => onApprove(queueItem.id)}>Approve</button>
            <button className="btn-danger" onClick={() => onReject(queueItem.id)}>Reject</button>
          </>
        )}
        <button className="btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => onEdit(queueItem)}>Edit</button>
      </div>
    </div>
  );
}
