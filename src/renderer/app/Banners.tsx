import React from 'react';
import type { QueueItemDTO } from '../../shared/dto';
import type { Result } from '../../shared/ipc';
import { scheduleCapacity } from '../../shared/capacity';
import { useApiQuery } from '../hooks/useApi';
import { Banner, Button } from '../components/ui';
import { useAppStatus } from './status';

/** Conditions that affect everything, shown above whichever page is open. Each one names the fix
 *  rather than only the problem. */
const readQueue = (): Promise<Result<QueueItemDTO[]>> => window.api.queueList();

export function Banners(): React.JSX.Element | null {
  const { auth, scheduler, settings } = useAppStatus();
  const queue = useApiQuery(readQueue, { key: 'queue', invalidateOn: ['queue:changed'] });
  const banners: React.JSX.Element[] = [];

  // Auto-scheduling stops at a fixed horizon. Without this the extra videos simply never get a
  // date, with nothing on screen to say why.
  if (settings !== null && queue.data !== null) {
    const items = queue.data;
    const waiting = items.filter(
      (item) => item.state === 'approved' && item.scheduled_for === null && item.privacy === 'public'
    ).length;
    const capacity = scheduleCapacity({
      uploadTimes: settings.upload_times,
      taken: items.map((item) => item.scheduled_for).filter((at): at is string => at !== null),
      now: new Date(),
      waiting
    });
    if (capacity.stranded > 0) {
      banners.push(
        <Banner key="capacity" kind="warning" title={`${capacity.stranded} approved videos have nowhere to go`}>
          Your daily times are booked solid through {capacity.horizonEnd.toLocaleDateString()}. At{' '}
          {settings.upload_times.length} a day this backlog needs {capacity.daysToClear} days to clear. Add more
          daily times in Settings, or leave them; they will take dates as space appears.
        </Banner>
      );
    }
  }

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
