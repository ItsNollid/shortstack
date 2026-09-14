import { describe, expect, it } from 'vitest';
import { parseMediaUrl } from './mediaProtocol';

describe('addresses for a single still', () => {
  it('names the video and the still', () => {
    expect(parseMediaUrl('ss-media://frame/12/s0')).toEqual({ kind: 'frame', queueId: 12, part: 's0' });
    expect(parseMediaUrl('ss-media://frame/12/o1')).toEqual({ kind: 'frame', queueId: 12, part: 'o1' });
  });

  it('refuses anything that is not exactly a still of a known video', () => {
    expect(parseMediaUrl('ss-media://frame/12')).toBeNull();
    expect(parseMediaUrl('ss-media://frame/12/x0')).toBeNull();
    expect(parseMediaUrl('ss-media://frame/12/s0/extra')).toBeNull();
    expect(parseMediaUrl('ss-media://frame/0/s0')).toBeNull();
    expect(parseMediaUrl('ss-media://thumb/12/s0')).toBeNull();
  });

  it('still reads videos and posters as before', () => {
    expect(parseMediaUrl('ss-media://video/7')).toEqual({ kind: 'video', queueId: 7 });
    expect(parseMediaUrl('ss-media://thumb/7')).toEqual({ kind: 'thumb', queueId: 7 });
  });
});
