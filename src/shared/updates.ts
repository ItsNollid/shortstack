// The shape of "is there a newer version, and what is it doing about it". Shared so the banner and
// the main process cannot disagree about what state the update is in.

export type UpdateChannel = 'development' | 'release';

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  /** Nothing newer. Carries the time so the UI can say when it last looked. */
  | { kind: 'current'; checkedAt: string }
  | { kind: 'available'; version: string; notes: string | null }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }
  /** Somebody's machine has no network, or GitHub is down. Never fatal, never a dialog. */
  | { kind: 'failed'; reason: string };

export interface UpdateStatus {
  channel: UpdateChannel;
  state: UpdateState;
  /** Development only: how far the source folder has moved past this build. */
  commitsBehind?: number;
  /** Development only: what the source is at now. */
  sourceCommit?: string;
}

/** Whether there is anything worth showing the user about updates right now. */
export function updateWorthShowing(status: UpdateStatus | null): boolean {
  if (status === null) return false;
  switch (status.state.kind) {
    case 'available':
    case 'downloading':
    case 'ready':
      return true;
    case 'idle':
    case 'checking':
    case 'current':
    case 'failed':
      // A failed check is the normal state of a laptop on a train. Saying so unprompted is noise;
      // Settings still shows it for anyone who goes looking.
      return (status.commitsBehind ?? 0) > 0;
    default:
      return false;
  }
}

export function describeUpdate(status: UpdateStatus): string {
  const { state } = status;
  switch (state.kind) {
    case 'idle':
      return 'Not checked yet';
    case 'checking':
      return 'Checking for updates…';
    case 'current':
      return `Up to date, checked ${new Date(state.checkedAt).toLocaleTimeString()}`;
    case 'available':
      return `Version ${state.version} is available`;
    case 'downloading':
      return `Downloading ${state.version} — ${Math.round(state.percent)}%`;
    case 'ready':
      return `Version ${state.version} is ready to install`;
    case 'failed':
      return state.reason;
    default:
      return 'Unknown';
  }
}
