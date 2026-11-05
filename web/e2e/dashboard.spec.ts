import { expect, test, type Page } from '@playwright/test';
import { BASE_URL, loginLink, startHarness, stopHarness, type Harness } from './harness.js';

// The dashboard (D-108): tiles that agree with the chart, charts that draw, failures that retry,
// and no content security policy complaint from the chart library.

const SCREENSHOTS = 'test-results/screens';
let harness: Harness;

test.beforeAll(async () => {
  harness = await startHarness();
});

test.afterAll(async () => {
  await stopHarness(harness);
});

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function signIn(page: Page): Promise<void> {
  await page.goto(await loginLink(harness));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test('tiles, charts and failures show the seeded videos', async ({ page }) => {
  const errors = watchConsole(page);
  await signIn(page);

  await expect(page.getByRole('link', { name: /Need you/ })).toContainText('2');
  await expect(page.getByRole('link', { name: /In production/ })).toContainText('3');
  await expect(page.locator('.tile', { hasText: 'Finished' })).toContainText('0');
  await expect(page.locator('.tile', { hasText: 'Cost' })).toContainText('1.25 CRD');

  await expect(page.locator('#videos-per-day')).toBeVisible();
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
  await expect(page.getByRole('table', { name: 'Videos per day' })).toContainText('3');

  const failures = page.getByRole('region', { name: 'Recent failures' });
  await expect(failures).toContainText('episode_code');
  await expect(failures).toContainText('render crashed: Page crashed!');
  await expect(failures.getByRole('button', { name: 'Retry' })).toBeVisible();

  await expect(page.getByRole('region', { name: 'By kit' })).toContainText('whatif');
  await page.screenshot({ path: `${SCREENSHOTS}/dashboard-desktop.png`, fullPage: true });
  expect(errors.filter((text) => /Content Security Policy|CSP/i.test(text))).toEqual([]);
});

test('the period is carried in the address', async ({ page }) => {
  await signIn(page);

  await page.getByRole('button', { name: '7 days' }).click();

  await expect(page).toHaveURL(`${BASE_URL}/?period=7d`);
  await expect(page.getByRole('button', { name: '7 days' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('table', { name: 'Videos per day' }).locator('tbody tr')).toHaveCount(
    7,
  );
  await page.reload();
  await expect(page.getByRole('button', { name: '7 days' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('a failed step can be retried from the dashboard', async ({ page }) => {
  await signIn(page);

  await page
    .getByRole('region', { name: 'Recent failures' })
    .getByRole('button', { name: 'Retry' })
    .click();

  await expect(page.getByRole('status')).toContainText('Retrying episode_code');
  const { rows } = await harness.db.pool.query<{ status: string }>(
    `SELECT status FROM job WHERE video_version_id = (
       SELECT id FROM video_version WHERE video_id = $1 ORDER BY version DESC LIMIT 1)
       AND step = 'episode_code'`,
    [harness.videos.stopped],
  );
  expect(rows[0]!.status).not.toBe('FAILED_PERMANENT');
});

test('a script can be approved from the dashboard', async ({ page }) => {
  await signIn(page);

  await page
    .getByRole('region', { name: /need/ })
    .getByRole('button', { name: 'Approve script' })
    .click();

  await expect(page.getByRole('status')).toContainText('Script: Approved.');
  await expect(page.getByRole('region', { name: /need/ })).not.toContainText('Approve script');
});

test.describe('in dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('the chart uses the dark series colours', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('.recharts-surface').first()).toBeVisible();

    const fill = await page.locator('.recharts-bar-rectangle path').first().getAttribute('fill');

    expect(fill).toBe('#4f90e8');
    await page.screenshot({ path: `${SCREENSHOTS}/dashboard-dark.png`, fullPage: true });
  });
});

test.describe('at phone width', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test('does not scroll sideways', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('.recharts-surface').first()).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > 376 && !el.closest('.table-wrap'))
        .slice(0, 12)
        .map(
          (el) =>
            `${el.tagName}.${el.className} in ${el.parentElement?.tagName}.${el.parentElement?.className} ${Math.round(el.getBoundingClientRect().right)}`,
        ),
    );

    expect(overflow, wide.join('\n')).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SCREENSHOTS}/dashboard-phone.png`, fullPage: true });
  });
});
