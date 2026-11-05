import { expect, test, type Page } from '@playwright/test';
import { createBatch, createVideo, versionStatus } from '../../worker/test/helpers/fixtures.js';
import { episodeAtScriptApproval } from '../../worker/test/helpers/web-console.js';
import {
  APPROVER,
  BASE_URL,
  loginLink,
  OWNER,
  startHarness,
  stopHarness,
  type Harness,
} from './harness.js';

const SCREENSHOTS = 'test-results/screens';
let harness: Harness;

test.beforeAll(async () => {
  harness = await startHarness();
});

test.afterAll(async () => {
  await stopHarness(harness);
});

async function signIn(page: Page, user = OWNER): Promise<void> {
  await page.goto(await loginLink(harness, user));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
}

async function newVideo(topic: string): Promise<{ videoId: string; versionId: string }> {
  const { pool } = harness.db;
  const fixture = await createVideo(pool, await createBatch(pool, `action-${topic}`), 1);
  await pool.query(
    `UPDATE video_version SET brief = jsonb_set(brief, '{topic}', to_jsonb($2::text)) WHERE id = $1`,
    [fixture.versionId, topic],
  );
  return fixture;
}

test('an approval goes from the queue to the video, and is decided there', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Nếu Trái Đất ngừng quay' }).first().click();
  await expect(page.getByRole('button', { name: 'Approve script' })).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOTS}/approval-desktop.png`, fullPage: true });

  await page.getByRole('button', { name: 'Reject and cancel video' }).click();
  await expect(page.getByText('Reject this and cancel the video?')).toBeVisible();
  await page.getByRole('button', { name: 'Keep the video' }).click();
  await expect(page.getByRole('button', { name: 'Approve script' })).toBeVisible();

  await page.getByRole('button', { name: 'Approve script' }).click();

  await expect(page.getByRole('heading', { name: /waiting for approval/ })).toHaveCount(0);
});

test('automatic approval asks first, then turns on and off', async ({ page }) => {
  const { videoId } = await newVideo('auto');
  await signIn(page);
  await page.goto(`${BASE_URL}/videos/${videoId}`);

  await page.getByRole('button', { name: 'Turn on automatic approval' }).click();
  await expect(page.getByText('A QA failure still stops the video')).toBeVisible();
  await page.getByRole('button', { name: 'Leave it off' }).click();
  await page.getByRole('button', { name: 'Turn on automatic approval' }).click();
  await page.getByRole('button', { name: 'Turn on automatic approval' }).click();

  await expect(page.getByRole('status')).toHaveText('Automatic approval is on.');
  await page.getByRole('button', { name: 'Turn off automatic approval' }).click();
  await expect(page.getByRole('status')).toHaveText('Automatic approval is off.');
  await expect(page.getByRole('button', { name: 'Turn on automatic approval' })).toBeVisible();
});

test('the owner cancels a video only after confirming', async ({ page }) => {
  const { videoId, versionId } = await newVideo('cancel');
  await signIn(page);
  await page.goto(`${BASE_URL}/videos/${videoId}`);

  await page.getByRole('button', { name: 'Cancel video' }).click();
  await page.getByRole('button', { name: 'Keep the video' }).click();
  await expect(page.getByRole('status')).toHaveText('Kept the video.');
  expect(await versionStatus(harness.db.pool, versionId)).not.toBe('CANCELLED');

  await page.getByRole('button', { name: 'Cancel video' }).click();
  await page.getByRole('button', { name: 'Cancel video' }).click();
  await expect(page.getByRole('status')).toHaveText('Video cancelled.');
  expect(await versionStatus(harness.db.pool, versionId)).toBe('CANCELLED');
});

test('an approver is not offered Cancel', async ({ page }) => {
  const { videoId } = await newVideo('approver');
  await signIn(page, APPROVER);
  await page.goto(`${BASE_URL}/videos/${videoId}`);

  await expect(page.getByRole('button', { name: 'Turn on automatic approval' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel video' })).toHaveCount(0);
});

test('retry shows up for a stopped video and reports the outcome', async ({ page }) => {
  await signIn(page);
  await page.goto(`${BASE_URL}/videos/${harness.videos.stopped}`);

  await page.getByRole('button', { name: 'Retry failed step' }).click();

  await expect(page.getByRole('status').or(page.getByRole('alert'))).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOTS}/actions-stopped.png`, fullPage: true });
});

test('review material appears as the worker provides it', async ({ page }) => {
  const { videoId } = await newVideo('media');
  await page.route(`**/api/videos/${videoId}/media`, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          language: 'vi',
          files: ['script.md', 'voice.m4a', 'page-01.jpg', 'preview.mp4'].map((file) => ({
            file,
            revision: 'rev1',
          })),
          review: {
            voice: null,
            qa_level: 'WARN',
            qa_checks: [{ name: 'loudness', level: 'WARN', detail: '-12 LUFS' }],
            metadata: {
              title: 'Tiêu đề',
              description: 'Mô tả',
              tags: ['a'],
              hashtags: ['#nếubạn'],
            },
          },
        },
      },
    }),
  );
  await page.route(`**/api/videos/${videoId}/media/script.md?v=rev1`, (route) =>
    route.fulfill({ body: '# Kịch bản tập một', contentType: 'text/markdown' }),
  );
  await signIn(page);
  await page.goto(`${BASE_URL}/videos/${videoId}`);

  await expect(page.getByText('# Kịch bản tập một')).toBeVisible();
  await expect(page.getByText('loudness: -12 LUFS')).toBeVisible();
  await expect(page.getByText('Tiêu đề')).toBeVisible();
  await expect(page.getByText('#nếubạn')).toBeVisible();
  await expect(page.getByAltText('Storyboard page 1')).toHaveAttribute(
    'src',
    `/api/videos/${videoId}/media/page-01.jpg?v=rev1`,
  );
  await expect(page.locator('video')).toHaveAttribute(
    'src',
    `/api/videos/${videoId}/media/preview.mp4?v=rev1`,
  );
  await expect(page.locator('audio')).toHaveAttribute(
    'src',
    `/api/videos/${videoId}/media/voice.m4a?v=rev1`,
  );
});

test.describe('another voice take', () => {
  async function voiceGate(page: Page, voice: unknown): Promise<void> {
    const { videoId, versionId } = await newVideo(`voice-${Math.random()}`);
    await harness.db.pool.query(`SELECT approval_request($1, 'VOICE', 'h1', interval '24 hours')`, [
      versionId,
    ]);
    await page.route(`**/api/videos/${videoId}/media`, (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            language: 'vi',
            files: [],
            review: { qa_level: null, qa_checks: null, metadata: null, voice },
          },
        },
      }),
    );
    await signIn(page);
    await page.goto(`${BASE_URL}/videos/${videoId}`);
    await expect(page.getByRole('button', { name: 'Approve voice' })).toBeVisible();
  }

  test('states its cost on the button, because it is paid', async ({ page }) => {
    await voiceGate(page, {
      take: 1,
      max_takes: 3,
      retake_cost: { amount: 0.12, currency: 'USD' },
    });

    await expect(page.getByRole('button', { name: 'Read again, about 0.12 USD' })).toBeVisible();
  });

  test('is not offered when no takes are left', async ({ page }) => {
    await voiceGate(page, { take: 3, max_takes: 3, retake_cost: null });

    await expect(page.getByRole('button', { name: /Read again/ })).toHaveCount(0);
    await expect(page.getByText('No more takes can be started here')).toBeVisible();
  });
});

test('the outcome stays after the decided request goes away', async ({ page }) => {
  const approval = await episodeAtScriptApproval(harness.db.pool, 'e2e-outcome', 'Giữ thông báo');
  await signIn(page);
  await page.goto(`${BASE_URL}/videos/${approval.videoId}`);

  await page.getByRole('button', { name: 'Approve script' }).click();

  await expect(page.getByRole('heading', { name: /waiting for approval/ })).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('Approved.');
});

test('retry is offered only where it can work', async ({ page }) => {
  const { videoId, versionId } = await newVideo('blocked');
  await harness.db.pool.query(
    `UPDATE video_version SET status = 'BLOCKED_PROVIDER' WHERE id = $1`,
    [versionId],
  );
  await signIn(page);
  await page.goto(`${BASE_URL}/videos/${videoId}`);

  await expect(page.getByRole('button', { name: 'Turn on automatic approval' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry failed step' })).toHaveCount(0);
});

test('the panel fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  const { videoId } = await newVideo('phone');
  await signIn(page);
  await page.goto(`${BASE_URL}/videos/${videoId}`);
  await expect(page.getByRole('button', { name: 'Cancel video' })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );

  expect(overflow).toBeLessThanOrEqual(0);
});

test.describe('a new video', () => {
  test('is reviewed, then created once, and opens', async ({ page }) => {
    await signIn(page);
    await page.getByRole('link', { name: 'Videos', exact: true }).click();
    await page.locator('#content').getByRole('link', { name: 'New video' }).click();
    await page.getByLabel('Topic').fill('Vì sao mèo luôn tiếp đất bằng chân');
    await page.getByLabel('Length').selectOption('6');
    await page.getByLabel('Notes for the script').fill('Giọng vui');
    await page.screenshot({ path: `${SCREENSHOTS}/new-video.png`, fullPage: true });

    await page.getByRole('button', { name: 'Review' }).click();
    await expect(page.getByRole('heading', { name: 'Create this video?' })).toBeVisible();
    await expect(page.locator('.facts').getByText('6 minutes')).toBeVisible();
    await page.getByRole('button', { name: 'Create video' }).dblclick();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Vì sao mèo luôn tiếp đất bằng chân',
    );
    const { rows } = await harness.db.pool.query<{ n: number }>(
      `SELECT count(*)::integer AS n FROM video_version
       WHERE brief->>'topic' = 'Vì sao mèo luôn tiếp đất bằng chân'`,
    );
    expect(rows[0]!.n).toBe(1);
  });

  test('says why a topic was refused and keeps what was typed', async ({ page }) => {
    await signIn(page);
    await page.goto(`${BASE_URL}/videos/new`);

    await page.getByLabel('Topic').fill('x');
    await page.getByRole('button', { name: 'Review' }).click();

    await expect(page.getByRole('alert')).toContainText('topic');
    await expect(page.getByLabel('Topic')).toHaveValue('x');
  });

  test('going back to change something creates nothing', async ({ page }) => {
    await signIn(page);
    await page.goto(`${BASE_URL}/videos/new`);
    await page.getByLabel('Topic').fill('Đổi ý giữa chừng nhé');
    await page.getByRole('button', { name: 'Review' }).click();

    await page.getByRole('button', { name: 'Change something' }).click();

    await expect(page.getByLabel('Topic')).toHaveValue('Đổi ý giữa chừng nhé');
    const { rows } = await harness.db.pool.query<{ n: number }>(
      `SELECT count(*)::integer AS n FROM video_version WHERE brief->>'topic' = 'Đổi ý giữa chừng nhé'`,
    );
    expect(rows[0]!.n).toBe(0);
  });

  test('a lost answer cannot lead to a second video', async ({ page }) => {
    const topic = 'Câu trả lời bị mất giữa đường';
    await signIn(page);
    await page.goto(`${BASE_URL}/videos/new`);
    await page.getByLabel('Topic').fill(topic);
    await page.getByRole('button', { name: 'Review' }).click();
    await expect(page.getByRole('heading', { name: 'Create this video?' })).toBeVisible();
    // The server creates the video; the answer never reaches the page.
    await page.route('**/api/videos/draft/*', async (route) => {
      await route.fetch();
      await route.abort();
    });
    await page.getByRole('button', { name: 'Create video' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.unroute('**/api/videos/draft/*');

    await page.getByRole('button', { name: 'Change something' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(topic);
    const { rows } = await harness.db.pool.query<{ n: number }>(
      `SELECT count(*)::integer AS n FROM video_version WHERE brief->>'topic' = $1`,
      [topic],
    );
    expect(rows[0]!.n).toBe(1);
  });

  test('a session ending while typing keeps what was typed', async ({ page }) => {
    await signIn(page);
    await page.goto(`${BASE_URL}/videos/new`);
    await page.getByLabel('Topic').fill('Đang gõ dở thì hết phiên');
    await page.route('**/api/videos/draft', (route) =>
      route.fulfill({ status: 401, json: { success: false, error: 'not signed in' } }),
    );

    await page.getByRole('button', { name: 'Review' }).click();

    await expect(page.getByRole('alert')).toContainText('Your session ended');
    await expect(page.getByLabel('Topic')).toHaveValue('Đang gõ dở thì hết phiên');
  });

  test('offers only a cast in the language of the kit', async ({ page }) => {
    await signIn(page);
    await page.goto(`${BASE_URL}/videos/new`);

    await page.getByLabel('Kit').selectOption('whatif-en');

    const casts = await page.getByLabel('Character').locator('option').allTextContents();
    expect(casts.join(' ')).not.toContain('Chíp');
    expect(casts.length).toBeGreaterThan(0);
  });

  test('fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await signIn(page);
    await page.goto(`${BASE_URL}/videos/new`);
    await expect(page.getByLabel('Topic')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBeLessThanOrEqual(0);
  });
});
