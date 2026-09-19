import { describe, expect, it } from 'vitest';
import type { Scene, StillReading, VideoReport } from '../videoReading';
import { stuckFacts, videoFacts, type VideoFactsItem } from './videoFacts';

const item = (over: Partial<VideoFactsItem> = {}): VideoFactsItem => ({
  title: 'INSANE CLUTCH',
  description: '',
  tags: [],
  state: 'pending',
  attention_code: null,
  last_error: null,
  next_attempt_at: null,
  title_angle: null,
  duration_s: 20,
  width: 1080,
  height: 1920,
  game: null,
  posting_kind: 'new',
  ...over
});
const still = (scene: Scene, time: number): StillReading => ({ part: `p${time}`, time, scene, appeal: 2, what: `a ${scene}` });
const report = (stills: StillReading[], over: Partial<VideoReport> = {}): VideoReport => ({
  model: 'qwen3-vl:8b',
  readAt: '2026-09-19T10:00:00.000Z',
  stills,
  cover: null,
  hook: null,
  ...over
});
const ids = (facts: ReadonlyArray<{ id: string }>): string[] => facts.map((fact) => fact.id);

describe('what the assistant may say about one video', () => {
  it('says where it stands, and quotes the title as the creator’s own words', () => {
    const facts = videoFacts(item(), null, null);
    expect(facts[0]).toEqual({ id: 'video-state', text: 'Where it stands: Needs approval. Nothing is uploaded until you approve it.', derived: false });
    expect(facts).toContainEqual({ id: 'video-title', text: 'The creator’s title: "INSANE CLUTCH".', derived: false });
    expect(ids(facts)).toEqual(expect.arrayContaining(['video-no-description', 'video-no-tags', 'video-unread']));
  });

  it('keeps a title with its own double quotes inside the quotation', () => {
    const facts = videoFacts(item({ title: 'Say "hi"' }), null, null);
    expect(facts).toContainEqual({ id: 'video-title', text: 'The creator’s title: "Say \'hi\'".', derived: false });
  });

  it('says a video is not a Short when it is too long', () => {
    expect(ids(videoFacts(item({ duration_s: 200 }), null, null))).toContain('video-not-short');
  });

  it('passes on a weak opening second', () => {
    const facts = videoFacts(item(), report([], { hook: { weak: true, scene: 'menu', what: 'a menu', time: 0 } }), null);
    expect(facts).toContainEqual({ id: 'video-hook', text: 'The first second shows a menu, with nothing happening yet — a weak opening.', derived: false });
  });

  it('points out a title that promises play the stills never show', () => {
    const facts = videoFacts(item(), report([still('menu', 1), still('lobby', 6), still('loading', 12)]), null);
    const mismatch = facts.find((fact) => fact.id === 'video-title-mismatch');
    expect(mismatch?.text).toContain('but the 3 stills looked at show only');
  });

  it('quotes what was said in the video', () => {
    expect(videoFacts(item(), null, 'one bullet left')).toContainEqual({
      id: 'video-speech',
      text: 'What is said in it, heard by ShortStack: "one bullet left"',
      derived: false
    });
  });
});

describe('why a video is stuck', () => {
  it('gives the reason, what would fix it, the last error and the next try', () => {
    const facts = stuckFacts(
      item({ state: 'needs_attention', attention_code: 'missed_slot', last_error: 'Timed out', next_attempt_at: '2026-09-19T13:00:00.000Z' })
    );
    expect(facts).toEqual([
      { id: 'stuck-reason', text: 'Why it is stuck: Missed its time. The scheduled time passed before this could go out, so it was not published late.', derived: false },
      { id: 'stuck-action', text: 'What would fix it: Pick a new time.', derived: false },
      { id: 'stuck-error', text: 'The last error was: "Timed out".', derived: false },
      { id: 'stuck-retry', text: 'ShortStack will try again at 2026-09-19T13:00:00.000Z.', derived: false }
    ]);
  });
});
