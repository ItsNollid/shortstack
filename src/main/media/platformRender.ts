// Turning a render from the editor into a file TikTok and Instagram will take.
//
// Measured on this channel's four sample clips: H.264 at 60 frames a second, 24-bit PCM sound, the index
// (moov) after the picture data, and one clip at 74 Mbps. Instagram's Reels rules want AAC sound, the index
// at the front, no edit lists, closed groups of pictures and at most 25 Mbps; PCM sound meets neither
// platform's formats. Copying the picture across would keep whatever grouping and bitrate the editor chose,
// so the picture is always encoded again, with settings that meet Instagram's rules — the stricter of the
// two, so one file serves both.

export type PostPlatform = 'tiktok' | 'instagram';

export interface VideoStream {
  codec: string;
  width: number;
  height: number;
  fps: number | null;
  pixFmt: string;
  bitRate: number | null;
}

export interface AudioStream {
  codec: string;
  sampleRate: number | null;
  channels: number | null;
}

export interface MediaInfo {
  formatName: string;
  durationSeconds: number | null;
  sizeBytes: number | null;
  video: VideoStream | null;
  audio: AudioStream | null;
}

interface Limits {
  name: string;
  minSeconds: number | null;
  maxSeconds: number;
  maxBytes: number;
  videoCodecs: readonly string[];
  /** Null where the platform documents no audio rule. */
  audioCodecs: readonly string[] | null;
  minFps: number;
  maxFps: number;
  maxWidth: number | null;
  maxVideoBitRate: number | null;
  maxSampleRate: number | null;
  maxChannels: number | null;
}

/** From each platform's own documentation: Instagram's Reels specifications, TikTok's Content Posting API. */
export const LIMITS: Record<PostPlatform, Limits> = {
  instagram: {
    name: 'Instagram',
    minSeconds: 3,
    maxSeconds: 15 * 60,
    maxBytes: 300 * 1000 * 1000,
    videoCodecs: ['h264', 'hevc'],
    audioCodecs: ['aac'],
    minFps: 23,
    maxFps: 60,
    maxWidth: 1920,
    maxVideoBitRate: 25_000_000,
    maxSampleRate: 48_000,
    maxChannels: 2
  },
  tiktok: {
    name: 'TikTok',
    minSeconds: null,
    maxSeconds: 10 * 60,
    maxBytes: 4 * 1000 * 1000 * 1000,
    videoCodecs: ['h264'],
    audioCodecs: null,
    minFps: 23,
    maxFps: 60,
    maxWidth: null,
    maxVideoBitRate: null,
    maxSampleRate: null,
    maxChannels: null
  }
};

/** Room under Instagram's 25 Mbps for the encoder's peaks. */
const TARGET_MAX_RATE = '20M';
const TARGET_BUFFER = '40M';
const MAX_WIDTH = 1920;

const number = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** "60/1", "15360/256" or "30000/1001" as frames a second; "0/0" is not a rate. */
export function parseRate(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const [top, bottom] = value.split('/').map(Number);
  if (top === undefined || bottom === undefined || !Number.isFinite(top) || !Number.isFinite(bottom) || bottom === 0 || top === 0) return null;
  return Math.round((top / bottom) * 1000) / 1000;
}

/** What `ffprobe -print_format json -show_format -show_streams` said, or null when it is not that. */
export function parseProbe(raw: unknown): MediaInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { streams, format } = raw as { streams?: unknown; format?: unknown };
  if (!Array.isArray(streams) || typeof format !== 'object' || format === null) return null;
  const entries = streams.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null);
  const video = entries.find((entry) => entry.codec_type === 'video');
  const audio = entries.find((entry) => entry.codec_type === 'audio');
  const container = format as Record<string, unknown>;

  return {
    formatName: typeof container.format_name === 'string' ? container.format_name : '',
    durationSeconds: number(container.duration),
    sizeBytes: number(container.size),
    video:
      video === undefined
        ? null
        : {
            codec: String(video.codec_name ?? ''),
            width: number(video.width) ?? 0,
            height: number(video.height) ?? 0,
            fps: parseRate(video.avg_frame_rate) ?? parseRate(video.r_frame_rate),
            pixFmt: String(video.pix_fmt ?? ''),
            bitRate: number(video.bit_rate)
          },
    audio:
      audio === undefined
        ? null
        : { codec: String(audio.codec_name ?? ''), sampleRate: number(audio.sample_rate), channels: number(audio.channels) }
  };
}

const megabytes = (bytes: number): string => `${Math.round(bytes / 1_000_000)} MB`;

/** Everything about a file the platform would refuse, in words. Empty when it would take it. */
export function problemsFor(info: MediaInfo, platform: PostPlatform): string[] {
  const limits = LIMITS[platform];
  const problems: string[] = [];
  const { video, audio } = info;

  if (video === null) {
    problems.push('It has no picture.');
  } else {
    if (!limits.videoCodecs.includes(video.codec)) problems.push(`The picture is ${video.codec}, and ${limits.name} takes ${limits.videoCodecs.join(' or ')}.`);
    if (video.fps !== null && (video.fps < limits.minFps || video.fps > limits.maxFps)) {
      problems.push(`It runs at ${video.fps} frames a second, and ${limits.name} takes ${limits.minFps} to ${limits.maxFps}.`);
    }
    if (limits.maxWidth !== null && video.width > limits.maxWidth) problems.push(`It is ${video.width} pixels wide, and ${limits.name} takes up to ${limits.maxWidth}.`);
    if (limits.maxVideoBitRate !== null && video.bitRate !== null && video.bitRate > limits.maxVideoBitRate) {
      problems.push(`The picture is ${Math.round(video.bitRate / 1_000_000)} Mbps, and ${limits.name} takes up to ${limits.maxVideoBitRate / 1_000_000}.`);
    }
  }

  if (audio !== null) {
    if (limits.audioCodecs !== null && !limits.audioCodecs.includes(audio.codec)) problems.push(`The sound is ${audio.codec}, and ${limits.name} needs ${limits.audioCodecs.join(' or ')}.`);
    if (limits.maxSampleRate !== null && audio.sampleRate !== null && audio.sampleRate > limits.maxSampleRate) {
      problems.push(`The sound is sampled at ${audio.sampleRate} Hz, and ${limits.name} takes up to ${limits.maxSampleRate}.`);
    }
    if (limits.maxChannels !== null && audio.channels !== null && audio.channels > limits.maxChannels) {
      problems.push(`The sound has ${audio.channels} channels, and ${limits.name} takes up to ${limits.maxChannels}.`);
    }
  }

  if (info.durationSeconds !== null) {
    if (limits.minSeconds !== null && info.durationSeconds < limits.minSeconds) problems.push(`It is shorter than the ${limits.minSeconds} seconds ${limits.name} needs.`);
    if (info.durationSeconds > limits.maxSeconds) problems.push(`It is longer than the ${limits.maxSeconds / 60} minutes ${limits.name} takes.`);
  }
  if (info.sizeBytes !== null && info.sizeBytes > limits.maxBytes) problems.push(`It is ${megabytes(info.sizeBytes)}, and ${limits.name} takes up to ${megabytes(limits.maxBytes)}.`);
  return problems;
}

/** The ffmpeg arguments that turn `input` into a file both platforms take. */
export function renderArgs(input: string, output: string, info: MediaInfo): string[] {
  const fps = info.video?.fps ?? null;
  // Outside what either platform takes, the rate is brought inside it; otherwise the editor's rate is kept.
  const rate = fps !== null && fps > 60 ? 60 : fps !== null && fps < 23 ? 30 : null;
  const keyframeRate = rate ?? fps ?? 30;
  const wide = info.video !== null && info.video.width > MAX_WIDTH;

  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-i',
    input,
    // The picture and the sound only: editors add timecode tracks, which neither platform wants.
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    // The editor's own tags — its name, the project's, where it was saved — have no business going out.
    '-map_metadata',
    '-1',
    ...(wide ? ['-vf', `scale=${MAX_WIDTH}:-2`] : []),
    ...(rate !== null ? ['-r', String(rate)] : []),
    '-c:v',
    'libx264',
    '-preset',
    'faster',
    '-crf',
    '19',
    '-maxrate',
    TARGET_MAX_RATE,
    '-bufsize',
    TARGET_BUFFER,
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'high',
    // A keyframe every two seconds, in closed groups, as Instagram requires.
    '-g',
    String(Math.round(keyframeRate * 2)),
    '-x264-params',
    'open-gop=0',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ar',
    '48000',
    '-ac',
    '2',
    // The index at the front, and no edit lists.
    '-movflags',
    '+faststart',
    '-use_editlist',
    '0',
    '-f',
    'mp4',
    output
  ];
}
