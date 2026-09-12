import React from 'react';
import { FolderOpen, RefreshCw } from 'lucide-react';
import { Avatar, Banner, Button } from '../../components/ui';
import { useAppStatus } from '../../app/status';
import { useApiMutation } from '../../hooks/useApi';
import type { SettingsWriter } from './useSettings';
import { Section } from './parts';
import styles from './Settings.module.css';

export function ChannelSection({ onDisconnect }: { onDisconnect: () => void }): React.JSX.Element {
  const { auth, refreshAuth } = useAppStatus();
  const connect = useApiMutation(() => window.api.authConnect(), { onDone: refreshAuth });
  const importSecret = useApiMutation(() => window.api.authImportClientSecret(), { onDone: refreshAuth });
  const channel = auth?.channel ?? null;
  const connected = auth?.state === 'ok';

  return (
    <Section id="channel" title="YouTube channel">
      {auth !== null && !auth.hasClientSecret && (
        <Banner kind="warning" title="No Google credentials installed">
          ShortStack needs the client_secret.json from your own Google Cloud project before it can
          connect. This keeps your channel tied to credentials you control.
        </Banner>
      )}
      {auth !== null && !auth.tokensEncrypted && (
        <Banner kind="danger" title="Sign-in tokens are not encrypted on this computer">
          Windows did not offer secure storage, so ShortStack had to write them to disk in the clear.
          Anything running as you can read them. Disconnecting deletes them.
        </Banner>
      )}
      {auth !== null && auth.missingScopes.length > 0 && (
        <Banner kind="warning" title="Reconnect to grant new permissions">
          Missing: {auth.missingScopes.join(', ')}
        </Banner>
      )}
      {connect.error !== null && (
        <Banner kind="danger" title="Could not connect">
          {connect.error}
        </Banner>
      )}
      {importSecret.error !== null && (
        <Banner kind="danger" title="Could not read those credentials">
          {importSecret.error}
        </Banner>
      )}

      <div className={styles.row}>
        <Avatar src={channel?.avatarUrl} name={channel?.title} size={40} />
        <div className={styles.grow}>
          <div>{channel?.title ?? 'Not connected'}</div>
          <div className={styles.sectionText}>
            {connected
              ? (channel?.handle ?? 'Connected')
              : auth?.state === 'expired'
                ? 'The connection expired. Reconnect to carry on.'
                : 'Connect to upload and schedule.'}
          </div>
        </div>
        <Button onClick={() => void importSecret.run()} disabled={importSecret.pending}>
          {auth?.hasClientSecret === true ? 'Replace credentials' : 'Install credentials'}
        </Button>
        <Button
          variant={connected ? 'secondary' : 'primary'}
          disabled={connect.pending || auth?.hasClientSecret !== true}
          onClick={() => void connect.run()}
        >
          {connect.pending ? 'Waiting for Google…' : connected ? 'Reconnect' : 'Connect'}
        </Button>
      </div>

      {connected && (
        <div className={styles.row}>
          <Button variant="danger" size="small" onClick={onDisconnect}>
            Disconnect and delete YouTube data
          </Button>
        </div>
      )}
    </Section>
  );
}

export function FolderSection({ writer }: { writer: SettingsWriter }): React.JSX.Element {
  const { settings } = writer;
  const choose = useApiMutation(() => window.api.selectFolder(), {
    onDone: (folder) => {
      if (folder !== null) writer.set('shorts_folder', folder);
    }
  });
  const scan = useApiMutation(() => window.api.videosScan());
  const summary = scan.data;

  return (
    <Section
      title="Videos folder"
      text="ShortStack watches this folder and adds anything new to the queue. It never moves or deletes your files."
    >
      <div className={styles.row}>
        <div className={`${styles.path} ${settings?.shorts_folder === '' ? styles.unset : ''}`}>
          {settings === null || settings.shorts_folder === '' ? 'No folder chosen yet' : settings.shorts_folder}
        </div>
        <Button icon={<FolderOpen size={15} />} disabled={choose.pending} onClick={() => void choose.run()}>
          Choose folder
        </Button>
        <Button
          icon={<RefreshCw size={15} />}
          disabled={scan.pending || settings?.shorts_folder === ''}
          onClick={() => void scan.run()}
        >
          {scan.pending ? 'Scanning…' : 'Scan now'}
        </Button>
      </div>
      {writer.problemFor('shorts_folder') !== null && (
        <div className={styles.problem}>{writer.problemFor('shorts_folder')}</div>
      )}
      {summary !== null && (
        <div className={styles.sectionText}>
          {summary.status === 'no_folder'
            ? 'Choose a folder first.'
            : summary.status === 'folder_unavailable'
              ? 'That folder is not available right now. If it is on a removable drive, plug it back in.'
              : `${summary.added} added, ${summary.updated} updated, ${summary.unchanged} unchanged${summary.missing > 0 ? `, ${summary.missing} missing` : ''}.`}
        </div>
      )}
    </Section>
  );
}
