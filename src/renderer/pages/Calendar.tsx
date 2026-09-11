import React from 'react';

export default function Calendar() {
  const days = Array.from({ length: 35 }, (_, i) => i + 1);

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Schedule</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn-secondary">&lt; Prev</button>
          <span style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}>October 2026</span>
          <button className="btn-secondary">Next &gt;</button>
        </div>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(7, 1fr)', 
        gap: '1px', 
        backgroundColor: 'var(--border-subtle)', 
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        flex: 1
      }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} style={{ backgroundColor: 'var(--bg-elevated)', padding: '1rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {day}
          </div>
        ))}
        {days.map((day, i) => {
          // just mock visual days
          const date = i - 3; // start from somewhat previous month
          const isCurrentMonth = date > 0 && date <= 31;
          const displayDate = date <= 0 ? 30 + date : date > 31 ? date - 31 : date;
          
          return (
            <div key={i} style={{ 
              backgroundColor: 'var(--bg-main)', 
              padding: '0.5rem', 
              minHeight: '120px',
              color: isCurrentMonth ? 'var(--text-primary)' : 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <span style={{ alignSelf: 'flex-end', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{displayDate}</span>
              {/* Mock items */}
              {isCurrentMonth && date % 5 === 0 && (
                <div style={{ 
                  backgroundColor: 'rgba(124, 58, 237, 0.2)', 
                  border: '1px solid var(--accent-primary)',
                  borderRadius: 'var(--radius-sm)', 
                  padding: '4px 8px', 
                  fontSize: '0.75rem',
                  color: 'var(--accent-light)',
                  cursor: 'grab'
                }}>
                  Short_Video_{date}.mp4
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
