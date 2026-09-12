import React from 'react';
import { Banner, Button, Dialog } from '../../components/ui';
import { useAppStatus } from '../../app/status';
import { useApiMutation } from '../../hooks/useApi';
import type { SettingChange, SettingsWriter } from './useSettings';
import styles from './Settings.module.css';

/** Turning on automatic approval hands ShortStack the decision the manual gate exists to protect,
 *  so it is spelled out in full and switched on only by an explicit yes. */
export function AutoApproveDialog({
  open,
  writer,
  onClose
}: {
  open: boolean;
  writer: SettingsWriter;
  onClose: () => void;
}): React.JSX.Element {
  const confirm = (): void => {
    void writer
      .setSequence([
        ['auto_approve_consented_at', new Date().toISOString()],
        ['auto_approve', true]
      ])
      .then((done) => {
        if (done) onClose();
      });
  };

  return (
    <Dialog
      open={open}
      title="Approve new videos automatically?"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={writer.pending} onClick={confirm}>
            Turn it on
          </Button>
        </>
      }
    >
      <div className={styles.sectionText}>From then on, without asking you again:</div>
      <ul>
        <li>Every new file found in your folder is approved as soon as it is added.</li>
        <li>Each one takes the next free time from your daily schedule.</li>
        <li>
          It is prepared with your default title, description, tags and visibility, which is currently
          <strong> {writer.settings?.default_privacy ?? 'private'}</strong>.
        </li>
      </ul>
      <Banner kind="warning" title="You will not see them first">
        A file dropped in that folder by mistake is treated like any other. You can still unapprove
        anything before it goes out, and this can be switched off again at any time.
      </Banner>
    </Dialog>
  );
}

/** Automatic uploads stay locked until the user states their Cloud project passed the audit,
 *  because an upload from an unaudited project is locked private permanently. */
export function ApiModeDialog({
  open,
  writer,
  onClose
}: {
  open: boolean;
  writer: SettingsWriter;
  onClose: () => void;
}): React.JSX.Element {
  const alreadyAudited = writer.settings?.api_audit_confirmed_at != null;

  const confirm = (): void => {
    const changes: SettingChange[] = alreadyAudited
      ? [['upload_method', 'api']]
      : [
          ['api_audit_confirmed_at', new Date().toISOString()],
          ['upload_method', 'api']
        ];
    void writer.setSequence(changes).then((done) => {
      if (done) onClose();
    });
  };

  return (
    <Dialog
      open={open}
      title="Switch to automatic uploads?"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={writer.pending} onClick={confirm}>
            {alreadyAudited ? 'Switch' : 'My project passed the audit'}
          </Button>
        </>
      }
    >
      {!alreadyAudited && (
        <Banner kind="warning" title="Only after the audit">
          Until a Google Cloud project passes YouTube&apos;s API audit, every video uploaded through
          the API is locked private for good. There is no way to publish it afterwards, and no appeal.
        </Banner>
      )}
      <div className={styles.sectionText}>
        Switch this on only if Google has told you your project passed. ShortStack will then upload each
        approved video itself, as private, and set its publish time.
      </div>
      <button
        type="button"
        className={styles.link}
        onClick={() => void window.api.openExternal('https://support.google.com/youtube/contact/yt_api_form')}
      >
        Open the YouTube API audit form
      </button>
    </Dialog>
  );
}

export function DisconnectDialog({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const { refreshAuth } = useAppStatus();
  const disconnect = useApiMutation(() => window.api.authDisconnect(), {
    onDone: () => {
      refreshAuth();
      onClose();
    }
  });

  return (
    <Dialog
      open={open}
      title="Disconnect and delete YouTube data?"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={disconnect.pending} onClick={() => void disconnect.run()}>
            {disconnect.pending ? 'Disconnecting…' : 'Disconnect and delete'}
          </Button>
        </>
      }
    >
      {disconnect.error !== null && (
        <Banner kind="danger" title="Could not finish disconnecting">
          {disconnect.error}
        </Banner>
      )}
      <div className={styles.sectionText}>ShortStack will, straight away:</div>
      <ul>
        <li>Withdraw its access to your Google account.</li>
        <li>Delete the stored sign-in tokens, your channel details, channel picture and analytics.</li>
        <li>Stop uploading and scheduling.</li>
      </ul>
      <div className={styles.sectionText}>
        Your videos on YouTube are untouched, including anything already scheduled there. Your queue and
        settings stay on this computer; videos already uploaded keep a marker so they can never be
        uploaded twice.
      </div>
    </Dialog>
  );
}
