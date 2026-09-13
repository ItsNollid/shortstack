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

  test('draws a poster and a strip of stills from a real file', async () => {
    const harness = await launch([{ filename: 'clip.mov', realFile: sample as string }]);
    try {
      await goTo(harness.page, '#/queue');

      const thumbs = path.join(harness.userData, 'thumbs');
      const frames = path.join(thumbs, 'frames');

      await expect
        .poll(() => (fs.existsSync(frames) ? fs.readdirSync(frames) : []), { timeout: 45_000, intervals: [500] })
        .not.toHaveLength(0);

      const stills = fs.readdirSync(frames).sort();
      expect(stills.length).toBeGreaterThan(1);
      expect(stills[0]).toBe('1-0.jpg');

      for (const name of stills) {
        const bytes = fs.readFileSync(path.join(frames, name));
        // JPEG magic, and big enough to be a real frame rather than a blank canvas.
        expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xff, 0xd8, 0xff]);
        expect(bytes.length).toBeGreaterThan(4096);
      }

      const poster = fs.readFileSync(path.join(thumbs, '1.png'));
      expect(poster.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    } finally {
      await harness.close();
    }
  });
});
