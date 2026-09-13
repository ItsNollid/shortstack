import { test } from '@playwright/test';
import { goTo, launch } from './fixtures';

test('what is on the review screen', async () => {
  const harness = await launch([{ filename: 'clip.mov', privacy: 'public' }]);
  await goTo(harness.page, '#/review');
  await harness.page.waitForTimeout(1500);
  const info = await harness.page.evaluate(async () => {
    const list = await window.api.queueList();
    return {
      hash: location.hash,
      queueOk: list.ok,
      items: list.ok ? list.data.map((i) => ({ id: i.id, state: i.state, missing: i.missing })) : list.error,
      videos: document.querySelectorAll('video').length,
      tail: document.body.innerText.replace(/s+/g, ' ').slice(-400)
    };
  });
  console.log('REVIEW2:', JSON.stringify(info));
  await harness.close();
});
