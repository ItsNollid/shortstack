import { describe, expect, it } from 'vitest';
import { parseProbe, parseRate, problemsFor, renderArgs, type MediaInfo } from './platformRender';

/** What ffprobe reported for "ALRIGHT GUYS IM GOING TO BED.mov", one of this channel's own renders. */
const SAMPLE_PROBE = {
  streams: [
    { codec_type: 'video', codec_name: 'h264', profile: 'Main', width: 1080, height: 1920, pix_fmt: 'yuv420p', r_frame_rate: '60/1', avg_frame_rate: '60/1', bit_rate: '6410772' },
    { codec_type: 'audio', codec_name: 'pcm_s24le', sample_rate: '48000', channels: 2, bit_rate: '2304000' },
    { codec_type: 'data', codec_name: 'unknown', avg_frame_rate: '15360/256' }
  ],
  format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '17.733333', size: '19330257' }
};

const sample = (): MediaInfo => parseProbe(SAMPLE_PROBE) as MediaInfo;

describe('reading what ffprobe said', () => {
  it('picks out the picture and the sound', () => {
    expect(sample()).toEqual({
      formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
      durationSeconds: 17.733333,
      sizeBytes: 19330257,
      video: { codec: 'h264', width: 1080, height: 1920, fps: 60, pixFmt: 'yuv420p', bitRate: 6410772 },
      audio: { codec: 'pcm_s24le', sampleRate: 48000, channels: 2 }
    });
  });

  it('reads frame rates the way ffprobe writes them', () => {
    expect(parseRate('30000/1001')).toBe(29.97);
    expect(parseRate('15360/256')).toBe(60);
    expect(parseRate('0/0')).toBeNull();
    expect(parseRate(undefined)).toBeNull();
  });

  it('is nothing when it is not ffprobe output', () => {
    expect(parseProbe({ streams: 'no' })).toBeNull();
    expect(parseProbe(null)).toBeNull();
  });
});

describe('what a platform would refuse', () => {
  it('finds the sound Instagram will not take in the editor’s own render', () => {
    expect(problemsFor(sample(), 'instagram')).toEqual(['The sound is pcm_s24le, and Instagram needs aac.']);
  });

  // The 164 MB sample runs at 74 Mbps.
  it('finds a picture over Instagram’s bitrate', () => {
    const heavy = sample();
    heavy.video = { ...(heavy.video as NonNullable<MediaInfo['video']>), bitRate: 74_053_629 };
    expect(problemsFor(heavy, 'instagram')).toContain('The picture is 74 Mbps, and Instagram takes up to 25.');
  });

  it('checks length, size and frame rate against each platform', () => {
    const long: MediaInfo = { ...sample(), durationSeconds: 11 * 60, sizeBytes: 350_000_000 };
    expect(problemsFor(long, 'tiktok')).toEqual(['It is longer than the 10 minutes TikTok takes.']);
    expect(problemsFor(long, 'instagram')).toEqual(
      expect.arrayContaining(['It is 350 MB, and Instagram takes up to 300 MB.'])
    );
    const short: MediaInfo = { ...sample(), durationSeconds: 2, audio: { codec: 'aac', sampleRate: 48000, channels: 2 } };
    expect(problemsFor(short, 'instagram')).toEqual(['It is shorter than the 3 seconds Instagram needs.']);
    expect(problemsFor({ ...short, durationSeconds: 5, video: { ...(short.video as NonNullable<MediaInfo['video']>), fps: 120 } }, 'tiktok')).toEqual([
      'It runs at 120 frames a second, and TikTok takes 23 to 60.'
    ]);
  });

  it('takes a finished render', () => {
    const rendered: MediaInfo = {
      ...sample(),
      formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
      video: { codec: 'h264', width: 1080, height: 1920, fps: 60, pixFmt: 'yuv420p', bitRate: 12_000_000 },
      audio: { codec: 'aac', sampleRate: 48000, channels: 2 }
    };
    expect(problemsFor(rendered, 'instagram')).toEqual([]);
    expect(problemsFor(rendered, 'tiktok')).toEqual([]);
  });
});

describe('the ffmpeg arguments', () => {
  const args = (info: MediaInfo): string => renderArgs('in.mov', 'out.mp4', info).join(' ');

  it('encodes the picture and sound again, drops the rest, and puts the index at the front', () => {
    const line = args(sample());
    expect(line).toContain('-i in.mov -map 0:v:0 -map 0:a:0? -map_metadata -1');
    expect(line).toContain('-c:v libx264');
    expect(line).toContain('-maxrate 20M');
    expect(line).toContain('-g 120 -x264-params open-gop=0');
    expect(line).toContain('-c:a aac -b:a 128k -ar 48000 -ac 2');
    expect(line).toContain('-movflags +faststart -use_editlist 0 -f mp4 out.mp4');
    expect(line).not.toContain('-r ');
    expect(line).not.toContain('scale=');
  });

  it('brings a frame rate outside what the platforms take inside it', () => {
    const fast = sample();
    fast.video = { ...(fast.video as NonNullable<MediaInfo['video']>), fps: 120 };
    expect(args(fast)).toContain('-r 60 ');
    const slow = sample();
    slow.video = { ...(slow.video as NonNullable<MediaInfo['video']>), fps: 15 };
    expect(args(slow)).toContain('-r 30 ');
    expect(args(slow)).toContain('-g 60 ');
  });

  it('narrows a picture wider than Instagram takes', () => {
    const wide = sample();
    wide.video = { ...(wide.video as NonNullable<MediaInfo['video']>), width: 3840, height: 2160 };
    expect(args(wide)).toContain('-vf scale=1920:-2');
  });
});
