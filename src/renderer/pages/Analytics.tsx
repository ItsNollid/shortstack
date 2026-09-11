import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

export default function Analytics() {
  const [data, setData] = useState<any[] | null>(null);

  useEffect(() => {
    window.api.getChannelAnalytics().then((res: any[]) => setData(res));
  }, []);

  if (!data) {
    return <div>Loading Analytics...</div>;
  }

  const totalViews = data.reduce((sum, item) => sum + (item.views || 0), 0);
  const totalWatchTime = data.reduce((sum, item) => sum + (item.watchTime || 0), 0);
  const totalSubscribers = data.reduce((sum, item) => sum + (item.subs || 0), 0);

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <h1>Analytics</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div style={{ padding: '1.5rem', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Total Views</h3>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{totalViews.toLocaleString()}</div>
        </div>
        <div style={{ padding: '1.5rem', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Total Watch Time (hours)</h3>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{totalWatchTime.toLocaleString()}</div>
        </div>
        <div style={{ padding: '1.5rem', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
          <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Total Subs Gained</h3>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{totalSubscribers.toLocaleString()}</div>
        </div>
      </div>
      
      <div style={{ padding: '2rem', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', height: '400px' }}>
        <h2 style={{ marginBottom: '2rem', fontSize: '1.25rem' }}>Views Over Time</h2>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis dataKey="date" stroke="var(--text-secondary)" />
            <YAxis stroke="var(--text-secondary)" />
            <Tooltip 
              contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }} 
              itemStyle={{ color: 'var(--text-primary)' }}
            />
            <Line type="monotone" dataKey="views" stroke="var(--accent-primary)" strokeWidth={3} dot={{ fill: 'var(--bg-card)', stroke: 'var(--accent-primary)', strokeWidth: 2 }} activeDot={{ r: 8 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
