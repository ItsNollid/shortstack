// The preview has been clipped twice now, each time because the box it was told to fill was not the
// box that got drawn. Measuring it on every screen that shows one is the only way that stops
// happening quietly.
import { expect, test } from '@playwright/test';
import { goTo, launch, sampleVideo, type Harness } from './fixtures';

let harness: Harness;
test.afterEach(async () => {
  await harness?.close();
});

interface Geometry {
  frame: { w: number; h: number };
  video: { w: number; h: number };
  overflowY: number;
  overflowX: number;
  frameRatio: number;
}

const measure = async (page: import('@playwright/test').Page): Promise<Geometry | null> =>
  page.evaluate(() => {
    const video = document.querySelector('video');
    if (video === null) return null;
    const frame = video.parentElement as HTMLElement;
    const v = video.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    return {
      frame: { w: Math.round(f.width), h: Math.round(f.height) },
      video: { w: Math.round(v.width), h: Math.round(v.height) },
      overflowY: Math.round(v.bottom - f.bottom),
      overflowX: Math.round(v.right - f.right),
      frameRatio: Math.round((f.width / f.height) * 1000) / 1000
    };
  });

const NINE_BY_SIXTEEN = 9 / 16;

for (const screen of [
  { name: 'review', route: '#/review' },
  { name: 'video details', route: '#/video/1' }
]) {
  test(`the preview on ${screen.name} fits its frame`, async () => {
    const sample = sampleVideo();
    test.skip(sample === null, 'needs a real video file; set SHORTSTACK_SAMPLE_VIDEO');
    harness = await launch([{ filename: 'clip.mov', privacy: 'public', realFile: sample as string }]);
    const { page } = harness;
    await goTo(page, screen.route);
    await page.waitForTimeout(600);

    const geometry = await measure(page);
    expect(geometry, 'a video element should be on this screen').not.toBeNull();
    if (geometry === null) return;

    // Nothing sticking out of the frame: the frame clips, and the player's controls sit at the
    // bottom of the element, so an overflow takes them with it.
    expect(geometry.overflowY, `video overflows the frame vertically: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(1);
    expect(geometry.overflowX, `video overflows the frame horizontally: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(1);

    // And the frame is the shape of a Short, so a vertical video fills it rather than letterboxing.
    expect(
      Math.abs(geometry.frameRatio - NINE_BY_SIXTEEN),
      `frame is ${geometry.frameRatio} rather than 9:16: ${JSON.stringify(geometry)}`
    ).toBeLessThan(0.02);
  });
}

test('the player keeps its controls', async () => {
  const sample = sampleVideo();
    test.skip(sample === null, 'needs a real video file; set SHORTSTACK_SAMPLE_VIDEO');
    harness = await launch([{ filename: 'clip.mov', privacy: 'public', realFile: sample as string }]);
  const { page } = harness;
  await goTo(page, '#/review');

  const hasControls = await page.evaluate(() => document.querySelector('video')?.controls ?? false);
  expect(hasControls).toBe(true);
});

test('the preview still fits when the window is maximised', async () => {
  // The reported case. A frame sized from its width and capped in height stops being 9:16, and the
  // bigger the window the more of the video that cost.
  const sample = sampleVideo();
  test.skip(sample === null, 'needs a real video file; set SHORTSTACK_SAMPLE_VIDEO');
  harness = await launch([{ filename: 'clip.mov', privacy: 'public', realFile: sample as string }]);
  const { app, page } = harness;

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize();
  });
  await page.waitForTimeout(500);

  for (const route of ['#/review', '#/video/1']) {
    await goTo(page, route);
    await page.waitForTimeout(500);
    const geometry = await measure(page);
    expect(geometry, `no video on ${route}`).not.toBeNull();
    if (geometry === null) continue;
    expect(geometry.overflowY, `${route}: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.frameRatio - NINE_BY_SIXTEEN), `${route}: ${JSON.stringify(geometry)}`).toBeLessThan(0.02);
  }
});
