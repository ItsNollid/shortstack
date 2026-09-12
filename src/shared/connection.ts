// One answer to "are we connected?", because there are two underlying facts and they can disagree:
// whether a usable Google grant is stored, and whether we know which channel it belongs to. Showing
// them as one thing is how the app came to display "Not connected" directly above "Connected".
import type { Tone } from './presentation';

export type ConnectionStage =
  | 'no_credentials'
  | 'disconnected'
  | 'expired'
  | 'offline'
  | 'channel_unknown'
  | 'connected';

export interface ConnectionFacts {
  state: 'ok' | 'expired' | 'offline' | 'disconnected';
  hasClientSecret: boolean;
  hasChannel: boolean;
}

export function connectionStage(facts: ConnectionFacts): ConnectionStage {
  if (!facts.hasClientSecret) return 'no_credentials';
  if (facts.state === 'expired') return 'expired';
  if (facts.state === 'offline') return 'offline';
  if (facts.state === 'disconnected') return 'disconnected';
  // Signed in, but the channel lookup never succeeded. Saying "connected" hides that the app does
  // not yet know whose channel it is holding a key to.
  return facts.hasChannel ? 'connected' : 'channel_unknown';
}

export interface ConnectionCopy {
  headline: string;
  /** A word or two for a status pill, never a repeat of the headline. */
  badge: string;
  detail: string;
  tone: Tone;
  /** True when reconnecting is the thing that would help. */
  offerConnect: boolean;
}

export function describeConnection(
  stage: ConnectionStage,
  options: { channelTitle?: string | null; dryRun?: boolean } = {}
): ConnectionCopy {
  const title = options.channelTitle ?? null;
  switch (stage) {
    case 'no_credentials':
      return {
        headline: 'No Google credentials yet',
        badge: 'No credentials',
        detail: 'ShortStack needs the client_secret.json from your own Google Cloud project before it can connect.',
        tone: 'waiting',
        offerConnect: false
      };
    case 'disconnected':
      return {
        headline: 'No channel yet',
        badge: 'Not connected',
        detail: 'Connect a channel to upload and schedule.',
        tone: 'neutral',
        offerConnect: true
      };
    case 'expired':
      return {
        headline: 'Connection expired',
        badge: 'Expired',
        detail: 'Google stopped accepting the saved sign-in. Reconnecting fixes it.',
        tone: 'attention',
        offerConnect: true
      };
    case 'offline':
      return {
        headline: 'Cannot reach YouTube',
        badge: 'Offline',
        detail: 'The sign-in is still saved. ShortStack will keep trying.',
        tone: 'waiting',
        offerConnect: false
      };
    case 'channel_unknown':
      return {
        headline: 'Signed in, but the channel is unknown',
        badge: 'Channel unknown',
        detail: options.dryRun === true
          ? 'ShortStack is in dry-run mode, so it never asked YouTube which channel this is. Nothing will upload in this mode.'
          : 'The sign-in worked, but reading the channel did not. Try again, or reconnect.',
        tone: 'attention',
        offerConnect: true
      };
    case 'connected':
      return {
        headline: title ?? 'Connected',
        badge: 'Connected',
        detail: 'Ready to upload and schedule.',
        tone: 'live',
        offerConnect: false
      };
  }
}
