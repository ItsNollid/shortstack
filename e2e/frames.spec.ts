// The stills the local model reads are drawn by Chromium in the renderer and written by the main
// process. Nothing in a unit test proves a real file decodes, encodes as JPEG and arrives — only
// running the app does, which is the whole reason this suite exists.
import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { goTo, launch, sampleVideo } from './fixtures';

const sample = sampleVideo();

test.describe('frames for the model', () => {
  test.skip(sample === null, 'needs a real video file to decode');

  test('draws a poster, a strip of stills with their times, and the opening second from a real file', async () => {
    const harness = await launch([{ filename: 'clip.mov', realFile: sample as string }]);
    try {
      await goTo(harness.page, '#/queue');

      const thumbs = path.join(harness.userData, 'thumbs');
      const frames = path.join(thumbs, 'frames');
      const meta = path.join(frames, '1.json');

      // The times are written last, so they mark a finished pass.
      await expect.poll(() => fs.existsSync(meta), { timeout: 45_000, intervals: [500] }).toBe(true);

      const stills = fs.readdirSync(frames).filter((name) => name.endsWith('.jpg')).sort();
      expect(stills[0]).toBe('1-0.jpg');
      expect(stills.filter((name) => name.includes('-open-')).length).toBeGreaterThan(0);

      for (const name of stills) {
        const bytes = fs.readFileSync(path.join(frames, name));
        // JPEG magic, and big enough to be a real frame rather than a blank canvas.
        expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xff, 0xd8, 0xff]);
        expect(bytes.length).toBeGreaterThan(4096);
      }

      const recorded = JSON.parse(fs.readFileSync(meta, 'utf8')) as {
        version: number;
        times: number[];
        openingTimes: number[];
        duration: number;
      };
      expect(recorded.version).toBe(2);
      expect(recorded.times).toHaveLength(stills.filter((name) => !name.includes('-open-')).length);
      expect(recorded.times.every((time) => time > 0 && time <= recorded.duration)).toBe(true);
      expect(recorded.openingTimes[0]).toBeLessThan(1);

      const poster = fs.readFileSync(path.join(thumbs, '1.png'));
      expect(poster.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    } finally {
      await harness.close();
    }
  });
});
