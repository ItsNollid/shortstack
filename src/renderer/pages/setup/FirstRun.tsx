import React from 'react';
import { firstRunStage } from '../../../shared/firstRun';
import { buildInfo } from '../../../shared/buildInfo';
import { LEGAL_VERSION } from '../../../shared/legal';
import { legalChangesSince } from '../../../shared/whatsNew';
import { useAppStatus } from '../../app/status';
import { useApiMutation } from '../../hooks/useApi';
import { LegalGate } from './LegalGate';
import { SetupChecklist } from './SetupChecklist';

/** Covers the app until the policies are accepted and setup is done. Null once it is reachable. */
export function FirstRun(): React.JSX.Element | null {
  const { settings, refreshSettings } = useAppStatus();
  const write = useApiMutation(
    (key: 'legal_accepted_version' | 'setup_complete', value: unknown) => window.api.settingsSet(key, value),
    { onDone: refreshSettings }
  );

  const stage = firstRunStage(settings, LEGAL_VERSION);
  if (stage === null) return null;

  if (stage === 'legal') {
    return (
      <LegalGate
        pending={write.pending}
        problem={write.error}
        returning={settings?.legal_accepted_version != null}
        changes={legalChangesSince(settings?.last_seen_version ?? null, buildInfo().version)}
        onAccept={(version) => void write.run('legal_accepted_version', version)}
      />
    );
  }

  return <SetupChecklist pending={write.pending} onFinish={() => void write.run('setup_complete', true)} />;
}
