import React from 'react';
import { Banner, Button } from '../components/ui';
import { useAppStatus } from './status';

/** Conditions that affect everything, shown above whichever page is open. Each one names the fix
 *  rather than only the problem. */
export function Banners(): React.JSX.Element | null {
  const { auth, scheduler, settings } = useAppStatus();
  const banners: React.JSX.Element[] = [];

  if (auth !== null && auth.state !== 'ok') {
    const text =
      auth.state === 'disconnected'
        ? 'ShortStack is not connected to a YouTube channel yet.'
        : auth.state === 'expired'
          ? 'The connection to YouTube expired. Nothing will upload until you reconnect.'
          : 'YouTube is unreachable right now. ShortStack will keep trying.';
    banners.push(
      <Banner key="auth" kind={auth.state === 'offline' ? 'info' : 'warning'} title="YouTube connection">
        {text}
      </Banner>
    );
  }

  if (auth !== null && auth.state === 'ok' && auth.missingScopes.length > 0) {
    banners.push(
      <Banner key="scopes" kind="warning" title="Reconnect to grant new permissions">
        ShortStack needs {auth.missingScopes.length} additional permission
        {auth.missingScopes.length === 1 ? '' : 's'} before it can change a video after upload.
      </Banner>
    );
  }

  if (settings !== null && settings.shorts_folder === '') {
    banners.push(
      <Banner key="folder" kind="info" title="No folder chosen">
        Pick the folder your finished Shorts land in, and ShortStack will watch it for new files.
      </Banner>
    );
  }

  if (scheduler !== null && scheduler.uploadQuotaUntil !== null) {
    banners.push(
      <Banner key="quota" kind="warning" title="YouTube upload limit reached">
        Uploading resumes after {new Date(scheduler.uploadQuotaUntil).toLocaleString()}.
      </Banner>
    );
  }

  if (settings !== null && settings.upload_method === 'assisted') {
    banners.push(
      <Banner
        key="assisted"
        kind="info"
        dismissKey="assisted-uploads"
        title="Assisted uploads"
        actions={
          <Button size="small" onClick={() => void window.api.openExternal('https://support.google.com/youtube/contact/yt_api_form')}>
            About the audit
          </Button>
        }
      >
        ShortStack prepares each video and walks you through uploading it in YouTube Studio. Automatic
        uploads stay switched off until your Google Cloud project passes YouTube&apos;s API audit —
        before that, anything uploaded through the API is locked private for good.
      </Banner>
    );
  }

  return banners.length === 0 ? null : <>{banners}</>;
}
