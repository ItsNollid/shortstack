import { describe, expect, it } from 'vitest';
import { ACTION_KINDS, changeFor, describeChange, parseAction, type ChannelAction } from './channelActions';
import type { AppSettings } from './settings';

const settings = (over: Partial<AppSettings> = {}): AppSettings =>
  ({
    upload_times: ['09:00', '13:00', '18:00', '22:00'],
    rotation_upload_times: ['11:00', '15:00', '20:00'],
    format_title_case: 'as_written',
    format_title_suffix: '',
    format_description_footer: '',
    format_max_hashtags: 0,
    ai_auto_draft: false,
    ai_model: 'qwen3-vl:8b',
    ...over
  }) as AppSettings;

describe('parseAction', () => {
  it('accepts each kind with sound parameters', () => {
    const good: unknown[] = [
      { kind: 'set_upload_time', lane: 'new', from: '09:00', to: '19:00' },
      { kind: 'add_upload_time', at: '07:30' },
      { kind: 'remove_upload_time', lane: 'rotation', at: '11:00' },
      { kind: 'set_title_case', value: 'upper' },
      { kind: 'set_title_suffix', value: ' #shorts' },
      { kind: 'set_description_footer', value: 'Subscribe' },
      { kind: 'set_max_hashtags', value: 15 },
      { kind: 'enable_auto_draft' }
    ];
    const parsed = good.map(parseAction);
    expect(parsed.every((action) => action !== null)).toBe(true);
    expect(parsed.map((action) => (action as ChannelAction).kind).sort()).toEqual([...ACTION_KINDS].sort());
  });

  // Anything outside the list is dropped. This is the line between proposing and executing.
  it('refuses a kind that is not on the list', () => {
    expect(parseAction({ kind: 'delete_all_videos' })).toBeNull();
    expect(parseAction({ kind: 'upload_now', videoId: 'abc' })).toBeNull();
    expect(parseAction({ kind: 'set_privacy', value: 'public' })).toBeNull();
  });

  it('refuses parameters that are not what they claim to be', () => {
    expect(parseAction({ kind: 'set_upload_time', from: '9am', to: '7pm' })).toBeNull();
    expect(parseAction({ kind: 'add_upload_time', at: '25:00' })).toBeNull();
    expect(parseAction({ kind: 'add_upload_time', at: '12:60' })).toBeNull();
    expect(parseAction({ kind: 'set_title_case', value: 'SHOUTY' })).toBeNull();
    expect(parseAction({ kind: 'set_max_hashtags', value: -1 })).toBeNull();
    expect(parseAction({ kind: 'set_max_hashtags', value: 1000 })).toBeNull();
    expect(parseAction({ kind: 'set_max_hashtags', value: 3.5 })).toBeNull();
  });

  it('refuses nothing at all', () => {
    expect(parseAction(null)).toBeNull();
    expect(parseAction('set_title_case')).toBeNull();
    expect(parseAction({})).toBeNull();
  });

  it('treats an unknown lane as the ordinary one rather than refusing', () => {
    expect(parseAction({ kind: 'add_upload_time', lane: 'nonsense', at: '07:30' })).toMatchObject({ lane: 'new' });
    expect(parseAction({ kind: 'add_upload_time', lane: 'rotation', at: '07:30' })).toMatchObject({ lane: 'rotation' });
  });

  it('strips angle brackets from anything that becomes text on a video', () => {
    expect(parseAction({ kind: 'set_title_suffix', value: ' <b>#shorts</b>' })).toMatchObject({ value: ' b#shorts/b' });
  });

  it('refuses a move that goes nowhere', () => {
    expect(parseAction({ kind: 'set_upload_time', from: '09:00', to: '09:00' })).toBeNull();
  });
});

describe('changeFor', () => {
  const apply = (action: unknown, over: Partial<AppSettings> = {}) =>
    changeFor(parseAction(action) as ChannelAction, settings(over));

  it('moves one daily time and leaves the rest sorted', () => {
    const change = apply({ kind: 'set_upload_time', from: '09:00', to: '19:00' });
    expect(change?.key).toBe('upload_times');
    expect(change?.value).toEqual(['13:00', '18:00', '19:00', '22:00']);
    expect(change?.before).toBe('09:00, 13:00, 18:00, 22:00');
  });

  it('knows the two lanes apart', () => {
    expect(apply({ kind: 'add_upload_time', lane: 'rotation', at: '07:00' })?.key).toBe('rotation_upload_times');
    expect(apply({ kind: 'add_upload_time', lane: 'new', at: '07:00' })?.key).toBe('upload_times');
  });

  // Being told to turn on something already on is how a tool loses trust.
  it('offers nothing when the setting already says that', () => {
    expect(apply({ kind: 'set_title_case', value: 'as_written' })).toBeNull();
    expect(apply({ kind: 'add_upload_time', at: '09:00' })).toBeNull();
    expect(apply({ kind: 'set_max_hashtags', value: 0 })).toBeNull();
    expect(apply({ kind: 'enable_auto_draft' }, { ai_auto_draft: true })).toBeNull();
  });

  it('refuses to move a time that is not there, or onto one that is', () => {
    expect(apply({ kind: 'set_upload_time', from: '03:00', to: '19:00' })).toBeNull();
    expect(apply({ kind: 'set_upload_time', from: '09:00', to: '13:00' })).toBeNull();
  });

  // Removing the last slot would leave nothing to schedule into.
  it('will not empty the schedule', () => {
    expect(apply({ kind: 'remove_upload_time', at: '09:00' }, { upload_times: ['09:00'] })).toBeNull();
    expect(apply({ kind: 'remove_upload_time', at: '09:00' })?.value).toEqual(['13:00', '18:00', '22:00']);
  });

  // Turning it on without a model would only fail quietly every minute.
  it('will not turn on drafting when there is no model to draft with', () => {
    expect(apply({ kind: 'enable_auto_draft' }, { ai_model: '' })).toBeNull();
    expect(apply({ kind: 'enable_auto_draft' })?.value).toBe(true);
  });

  it('describes the formatting changes in the words the settings screen uses', () => {
    expect(apply({ kind: 'set_title_case', value: 'upper' })?.after).toBe('ALL CAPS');
    expect(apply({ kind: 'set_title_suffix', value: ' #shorts' })?.before).toBe('nothing');
    expect(apply({ kind: 'set_max_hashtags', value: 15 })?.before).toBe('no limit');
  });
});

describe('describeChange', () => {
  it('reads as a before and after', () => {
    const change = changeFor(parseAction({ kind: 'set_title_case', value: 'upper' }) as ChannelAction, settings());
    expect(describeChange(change!)).toBe('Title case: Leave as written → ALL CAPS');
  });
});
