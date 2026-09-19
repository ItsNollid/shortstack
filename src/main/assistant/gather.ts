// Collecting what the assistant may say for a scope, from the database and the analytics already pulled. It only
// reads: nothing here asks YouTube for anything or spends quota.
import type Database from 'better-sqlite3';
import type { Pulled } from '../../shared/analyticsRefresh';
import { channelFacts } from '../../shared/assistant/channelFacts';
import { compareToTypical } from '../../shared/assistant/compare';
import { planFacts } from '../../shared/assistant/plan';
import type { AssistantFact, AssistantScope } from '../../shared/assistant/types';
import { stuckFacts, videoFacts } from '../../shared/assistant/videoFacts';
import { parseBrief, type VideoStat } from '../../shared/insights';
import { transcriptText } from '../../shared/transcript';
import { storedReport } from '../ai/lookAtVideo';
import { readActiveChannel } from '../db/channelRepo';
import { getQueueItem, listQueueItems } from '../db/queueRepo';
import { readSettings } from '../db/settingsRepo';
import { readTranscript } from '../db/transcriptRepo';
import { previewFill } from '../scheduler/fill';

export interface GatherDeps {
  db: Database.Database;
  /** The newest per-video figures Analytics pulled this session, if it has pulled any. */
  videoStats(): Pulled<VideoStat[]> | null;
  now: Date;
}

export interface Gathered {
  facts: AssistantFact[];
  channelName: string | null;
  /** A few words on what an answer can draw on, for the panel's Based on line. */
  basedOn: string;
}

/** How much of the channel summary rides along when the question is about something narrower. */
const CHANNEL_SUMMARY = 6;
/** What was said in a video, cut to a length that leaves the facts room. */
const SPEECH_CHARS = 600;

export function gatherFacts(deps: GatherDeps, scope: AssistantScope): Gathered | null {
  const { db, now } = deps;
  const { settings } = readSettings(db);
  const brief = parseBrief(settings.insight_findings);
  const channelName = readActiveChannel(db)?.title ?? null;
  const channel = channelFacts(brief, now);
  const channelBasis = brief === null ? 'nothing measured yet' : `${brief.videoCount} videos from the last Analytics refresh`;
  // Any suggestion to move a posting time has to name one that exists, so the times are always given.
  const times: AssistantFact = {
    id: 'daily-times',
    text: `Daily posting times for new videos: ${settings.upload_times.join(', ') || 'none'}; for re-runs: ${settings.rotation_upload_times.join(', ') || 'none'}.`,
    derived: false
  };

  if (scope.kind === 'channel') return { facts: [...channel, times], channelName, basedOn: channelBasis };

  if (scope.kind === 'plan') {
    const items = listQueueItems(db);
    return {
      facts: [...planFacts(items, previewFill(db, true, now), now), times, ...channel.slice(0, CHANNEL_SUMMARY)],
      channelName,
      basedOn: `your queue of ${items.length} videos`
    };
  }

  const item = getQueueItem(db, scope.queueId);
  if (item === undefined) return null;
  const heard = readTranscript(db, item.video_id);
  const speech = heard === null ? null : transcriptText(heard.segments, SPEECH_CHARS);
  const facts = videoFacts(item, storedReport(db, item.id), speech);
  let basedOn = 'this video and what ShortStack found in it';

  if (item.state === 'failed' || item.state === 'needs_attention') facts.push(...stuckFacts(item));
  if (item.state === 'published' && item.youtube_video_id !== null) {
    const stats = deps.videoStats();
    if (stats === null) {
      facts.push({
        id: 'compare-unpulled',
        text: 'Analytics has not been refreshed since ShortStack started, so this video cannot be compared yet.',
        derived: false
      });
    } else {
      facts.push(...compareToTypical(item.youtube_video_id, stats.value));
      basedOn = `this video against ${stats.value.length - 1} others from the last Analytics refresh`;
    }
  }
  return { facts: [...facts, times, ...channel.slice(0, CHANNEL_SUMMARY)], channelName, basedOn };
}
