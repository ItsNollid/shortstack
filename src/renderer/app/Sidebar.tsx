import React from 'react';
import { Activity, CalendarDays, ChartColumn, LayoutGrid, ListVideo, Pause, Play, ScrollText, Settings } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { Avatar, Button } from '../components/ui';
import { useApiMutation } from '../hooks/useApi';
import { connectionStage, describeConnection } from '../../shared/connection';
import { useAppStatus } from './status';
import styles from './Sidebar.module.css';

const ICON = 18;

const LINKS = [
  { to: '/queue', label: 'Queue', icon: <ListVideo size={ICON} /> },
  { to: '/review', label: 'Review', icon: <LayoutGrid size={ICON} /> },
  { to: '/calendar', label: 'Calendar', icon: <CalendarDays size={ICON} /> },
  { to: '/history', label: 'History', icon: <ScrollText size={ICON} /> },
  { to: '/analytics', label: 'Analytics', icon: <ChartColumn size={ICON} /> },
  { to: '/settings', label: 'Settings', icon: <Settings size={ICON} /> }
];

const DIAGNOSTICS = { to: '/diagnostics', label: 'Diagnostics', icon: <Activity size={ICON} /> };

const subscriberLabel = (count: number | null): string =>
  count === null ? 'connected' : `${count.toLocaleString()} subscriber${count === 1 ? '' : 's'}`;

export function Sidebar(): React.JSX.Element {
  const { auth, info, scheduler, refreshScheduler } = useAppStatus();
  const channel = auth?.channel ?? null;
  const connection =
    auth === null
      ? null
      : describeConnection(
          connectionStage({ state: auth.state, hasClientSecret: auth.hasClientSecret, hasChannel: channel !== null }),
          { channelTitle: channel?.title, dryRun: info?.uploads === 'dry-run' }
        );
  const paused = scheduler?.paused ?? true;

  const pause = useApiMutation(() => window.api.schedulerPause(), { onDone: refreshScheduler });
  const resume = useApiMutation(() => window.api.schedulerResume(), { onDone: refreshScheduler });
  const busy = pause.pending || resume.pending;

  const waiting = (scheduler?.counts.pending ?? 0) + (scheduler?.counts.needs_attention ?? 0);
  // There is no address bar in the app, so the maintenance screen needs a way in on dev builds.
  const links = info?.profile === 'dev' ? [...LINKS, DIAGNOSTICS] : LINKS;

  return (
    <nav className={styles.sidebar} aria-label="Sections">
      <div className={styles.channel}>
        <Avatar src={channel?.avatarUrl} name={channel?.title} size={32} />
        <div className={styles.channelText}>
          <div className={styles.channelName}>{connection?.headline ?? 'Loading…'}</div>
          <div className={styles.channelMeta}>
            {channel === null ? (connection?.badge ?? '') : (channel.handle ?? subscriberLabel(channel.subscriberCount))}
          </div>
        </div>
      </div>

      <div className={styles.nav}>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
          >
            {link.icon}
            {link.label}
            {link.to === '/queue' && waiting > 0 && <span className={styles.badge}>{waiting}</span>}
          </NavLink>
        ))}
      </div>

      <div className={styles.spacer} />

      <div className={styles.footer}>
        <Button
          size="small"
          icon={paused ? <Play size={14} /> : <Pause size={14} />}
          disabled={busy}
          onClick={() => void (paused ? resume.run() : pause.run())}
        >
          {paused ? 'Resume uploads' : 'Pause uploads'}
        </Button>
        {/* Pausing stops ShortStack, not YouTube: anything already scheduled there still goes out. */}
        <span className={styles.note}>
          {paused ? 'Videos already scheduled on YouTube still publish on time.' : 'Uploads and scheduling are running.'}
        </span>
        <NavLink to="/settings#legal" className={styles.legal}>
          Privacy, terms &amp; your data
        </NavLink>
      </div>
    </nav>
  );
}
