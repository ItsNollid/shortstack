// Temporary diagnostics console. It exercises the real backend through the typed contract while
// the designed interface is built, so every commit leaves a runnable app.
import React, { useCallback, useEffect, useState } from 'react';
import type { QueueItemDTO } from '../shared/dto';
import type { AiStatus, AppInfo, AuthStatus, Result, SchedulerStatus } from '../shared/ipc';
import type { AppSettings } from '../shared/settings';

function useResult<T>(load: () => Promise<Result<T>>): [T | null, string | null, () => void] {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    void load().then((result) => {
      if (result.ok) {
        setValue(result.data);
        setError(null);
      } else {
        setError(result.error.message);
      }
    });
  }, [load]);
  useEffect(refresh, [refresh]);
  return [value, error, refresh];
}

const listQueue = () => window.api.queueList();
const readStatus = () => window.api.schedulerStatus();
const readSettings = () => window.api.settingsGetAll();
const readAuth = () => window.api.authStatus();
const readAi = () => window.api.aiStatus();

export default function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [queue, queueError, refreshQueue] = useResult<QueueItemDTO[]>(listQueue);
  const [status, , refreshStatus] = useResult<SchedulerStatus>(readStatus);
  const [settings] = useResult<AppSettings>(readSettings);
  const [auth] = useResult<AuthStatus>(readAuth);
  const [ai] = useResult<AiStatus>(readAi);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    void window.api.appInfo().then(setInfo);
    return window.api.on('queue:changed', () => {
      refreshQueue();
      refreshStatus();
    });
  }, [refreshQueue, refreshStatus]);

  const run = async (label: string, action: () => Promise<Result<unknown>>): Promise<void> => {
    setBusy(label);
    const result = await action();
    setBusy(null);
    if (!result.ok) window.alert(result.error.message);
    refreshQueue();
    refreshStatus();
  };

  const toggle = (id: number): void =>
    setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  return (
    <div className="shell">
      <header className="titlebar">
        <span className="mark" aria-hidden="true" />
        <strong>ShortStack</strong>
        <span className="muted">{info === null ? 'starting' : `${info.profile} profile · uploads ${info.uploads} · v${info.version}`}</span>
      </header>

      <main>
        <section className="panel">
          <h2>Scheduler</h2>
          {status === null ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              <p>
                {status.paused ? 'Paused' : 'Running'} · connection {status.auth} ·{' '}
                {status.nextPublishAt === null ? 'nothing scheduled' : `next publish ${new Date(status.nextPublishAt).toLocaleString()}`}
              </p>
              <p className="muted">
                {Object.entries(status.counts)
                  .map(([state, count]) => `${state}: ${count}`)
                  .join(' · ') || 'queue empty'}
              </p>
              <div className="row">
                <button
                  onClick={() => void run('pause', () => (status.paused ? window.api.schedulerResume() : window.api.schedulerPause()))}
                >
                  {status.paused ? 'Resume uploads' : 'Pause uploads'}
                </button>
                <button onClick={() => void run('scan', () => window.api.videosScan())}>Scan folder</button>
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <h2>Connection</h2>
          <p>
            {auth === null
              ? 'Loading…'
              : `${auth.state}${auth.channel === null ? '' : ` · ${auth.channel.title}`}${
                  auth.hasClientSecret ? '' : ' · no client secret installed'
                }`}
          </p>
          {auth !== null && auth.missingScopes.length > 0 && (
            <p className="warn">Reconnect needed for {auth.missingScopes.length} new permission(s)</p>
          )}
          <p className="muted">AI: {ai === null ? 'checking…' : ai.message}</p>
          <p className="muted">Folder: {settings === null || settings.shorts_folder === '' ? 'not chosen yet' : settings.shorts_folder}</p>
          <p className="muted">
            Upload method: {settings?.upload_method ?? '…'} · default visibility {settings?.default_privacy ?? '…'}
          </p>
        </section>

        <section className="panel">
          <h2>Queue {queue === null ? '' : `(${queue.length})`}</h2>
          {queueError !== null && <p className="warn">{queueError}</p>}
          <div className="row">
            <button disabled={selected.length === 0} onClick={() => void run('approve', () => window.api.queueApprove(selected))}>
              Approve selected
            </button>
            <button disabled={selected.length === 0} onClick={() => void run('unapprove', () => window.api.queueUnapprove(selected))}>
              Unapprove
            </button>
            <button disabled={selected.length === 0} onClick={() => void run('reject', () => window.api.queueReject(selected))}>
              Reject
            </button>
            {busy !== null && <span className="muted">working: {busy}…</span>}
          </div>
          <table>
            <thead>
              <tr>
                <th />
                <th>Video</th>
                <th>State</th>
                <th>Visibility</th>
                <th>Scheduled</th>
                <th>Length</th>
              </tr>
            </thead>
            <tbody>
              {(queue ?? []).map((item) => (
                <tr key={item.id}>
                  <td>
                    <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
                  </td>
                  <td>
                    {item.title}
                    <div className="muted">{item.filename}</div>
                    {item.attention_code !== null && (
                      <div className="warn">
                        {item.attention_code}: {item.last_error}
                      </div>
                    )}
                  </td>
                  <td>{item.state}</td>
                  <td>{item.privacy}</td>
                  <td>
                    {item.scheduled_for === null ? '—' : new Date(item.scheduled_for).toLocaleString()}
                    {item.schedule_source !== null && <div className="muted">{item.schedule_source}</div>}
                  </td>
                  <td>
                    {item.duration_s === null ? '—' : `${item.duration_s.toFixed(1)}s`}
                    <div className="muted">{item.width === null ? '' : `${item.width}×${item.height}`}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {queue !== null && queue.length === 0 && <p className="muted">Nothing in the queue yet. Choose a folder, then scan.</p>}
        </section>
      </main>
    </div>
  );
}
