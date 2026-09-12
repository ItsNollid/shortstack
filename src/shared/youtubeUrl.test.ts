import { describe, expect, it } from 'vitest';
import { parseVideoId } from './youtubeUrl';

describe('parseVideoId', () => {
  it('accepts every link shape YouTube hands out', () => {
    expect(parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseVideoId('https://studio.youtube.com/video/dQw4w9WgXcQ/edit')).toBeNull();
    expect(parseVideoId('youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseVideoId('  dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ');
  });

  it('keeps extra query parameters out of the id', () => {
    expect(parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ');
  });

  it('rejects anything that is not a YouTube video', () => {
    expect(parseVideoId('')).toBeNull();
    expect(parseVideoId('not a link')).toBeNull();
    expect(parseVideoId('https://vimeo.com/123456')).toBeNull();
    expect(parseVideoId('https://www.youtube.com/@petersclips')).toBeNull();
    expect(parseVideoId('https://www.youtube.com/watch?v=tooshort')).toBeNull();
  });
});
