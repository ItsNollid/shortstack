import React from 'react';

export default function StatusBadge({ status }: { status: string }) {
  const isUploading = status === 'uploading';
  
  return (
    <span className={`status-badge ${status} ${isUploading ? 'animate-pulse' : ''}`}>
      {status === 'pending' && '⏳'}
      {status === 'approved' && '✅'}
      {status === 'uploading' && '🚀'}
      {status === 'uploaded' && '🎉'}
      {status === 'failed' && '❌'}
      {status}
    </span>
  );
}
