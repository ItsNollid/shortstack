import React from 'react';
import { useIPC } from '../hooks/useIPC';
import { Upload } from '../../shared/types';
import StatusBadge from '../components/StatusBadge';

export default function History() {
  const { data: uploads, loading } = useIPC<Upload[]>(() => window.api.getUploads());

  if (loading) return <div className="page-container">Loading history...</div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Upload History</h1>
      </div>

      {!uploads || uploads.length === 0 ? (
        <div className="empty-state">
          <h3>No uploads yet</h3>
          <p>Approved videos that finish uploading will appear here.</p>
        </div>
      ) : (
        <table className="history-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Uploaded At</th>
              <th>Status</th>
              <th>YouTube Link</th>
            </tr>
          </thead>
          <tbody>
            {uploads.sort((a, b) => new Date(b.uploaded_at || 0).getTime() - new Date(a.uploaded_at || 0).getTime()).map(upload => (
              <tr key={upload.id}>
                <td style={{ fontWeight: 500 }}>{upload.title}</td>
                <td style={{ color: 'var(--text-secondary)' }}>
                  {upload.uploaded_at ? new Date(upload.uploaded_at).toLocaleString() : 'N/A'}
                </td>
                <td>
                  <StatusBadge status={upload.status} />
                </td>
                <td>
                  {upload.youtube_video_id ? (
                    <a href={`https://youtube.com/shorts/${upload.youtube_video_id}`} target="_blank" rel="noreferrer">
                      Watch ↗
                    </a>
                  ) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
