import React from 'react';
import type { Result } from '../../shared/ipc';
import { describeUpdate, updateWorthShowing, type UpdateStatus } from '../../shared/updates';
import { useApiMutation, useApiQuery } from '../hooks/useApi';
import { Banner, Button } from './ui';

const readStatus = (): Promise<Result<UpdateStatus>> => window.api.updateStatus();

/**
 * Only ever appears when there is genuinely something newer. A failed check is the normal state of
 * a laptop with no signal, and a banner about it every launch would train people to ignore banners.
 */
export function UpdateBanner(): React.JSX.Element | null {
  const status = useApiQuery(readStatus, { key: 'updates', invalidateOn: ['update:changed'] });
  const download = useApiMutation(() => window.api.updateDownload());
  const install = useApiMutation(() => window.api.updateInstall());
  const rebuild = useApiMutation(() => window.api.updateRebuild());

  if (!updateWorthShowing(status.data)) return null;
  const current = status.data as UpdateStatus;
  const behind = current.commitsBehind ?? 0;

  if (current.channel === 'development' && behind > 0 && current.state.kind !== 'ready') {
    return (
      <Banner
        kind="info"
        title={`This build is ${behind} commit${behind === 1 ? '' : 's'} behind your source`}
        actions={
          <Button onClick={() => void rebuild.run()} disabled={rebuild.pending}>
            {rebuild.pending ? 'Starting…' : 'Rebuild and restart'}
          </Button>
        }
      >
        {rebuild.error ?? 'ShortStack will close while it rebuilds, then start again on its own.'}
      </Banner>
    );
  }

  const action =
    current.state.kind === 'available' ? (
      <Button variant="primary" onClick={() => void download.run()} disabled={download.pending}>
        {download.pending ? 'Starting…' : 'Download'}
      </Button>
    ) : current.state.kind === 'ready' ? (
      <Button variant="primary" onClick={() => void install.run()} disabled={install.pending}>
        Restart and install
      </Button>
    ) : null;

  return (
    <Banner kind="info" title={describeUpdate(current)} actions={action}>
      {download.error ?? install.error ?? (current.state.kind === 'available' ? "What's new is shown after it installs." : null)}
    </Banner>
  );
}
