import { expect, test, type Page } from '@playwright/test';
import { BASE_URL, loginLink, startHarness, stopHarness, type Harness } from './harness.js';

const SCREENSHOTS = 'test-results/screens';
let harness: Harness;

test.beforeAll(async () => {
  harness = await startHarness();
});

test.afterAll(async () => {
  await stopHarness(harness);
});

async function signIn(page: Page): Promise<void> {
  await page.goto(await loginLink(harness));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
}

function stateChip(page: Page, label: string) {
  return page.getByRole('group', { name: 'State' }).getByRole('button', { name: label });
}

async function expectNoSideways(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  // Names what sticks out, so a failure says where to look.
  const wide = await page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter(
        (el) =>
          el.scrollWidth > el.clientWidth + 1 ||
          el.getBoundingClientRect().right > window.innerWidth,
      )
      .slice(0, 12)
      .map(
        (el) =>
          `${el.tagName}.${el.className} ${el.scrollWidth}/${el.clientWidth} r=${Math.round(el.getBoundingClientRect().right)} ov=${getComputedStyle(el).overflowX} parent=${el.parentElement?.className}`,
      ),
  );
  expect(overflow, wide.join('\n')).toBeLessThanOrEqual(0);
}

test('opening the link does not use it up; signing in needs a press', async ({ page, context }) => {
  const link = await loginLink(harness);

  await page.goto(link);
  const preview = await context.newPage();
  await preview.goto(link);
  await preview.close();
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: '2 need you' })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});

test('a used link explains what to do', async ({ page, browser }) => {
  const link = await loginLink(harness);
  await page.goto(link);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();

  const other = await browser.newPage();
  await other.goto(link);
  await other.getByRole('button', { name: 'Sign in' }).click();

  await expect(other.getByRole('alert')).toContainText('Send /web to the bot');
  await other.close();
});

test('an old link does not sign you out', async ({ page }) => {
  const link = await loginLink(harness);
  await page.goto(link);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();

  await page.goto(link);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('already used');
  await page.getByRole('link', { name: 'Go to the dashboard' }).click();

  await expect(page.getByRole('heading', { name: '2 need you' })).toBeVisible();
});

test('a failed sign-out says so and stays signed in', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/auth/logout', (route) => route.abort());

  await page.getByRole('button', { name: 'Sign out' }).click();

  await expect(page.getByRole('alert')).toContainText('not signed out');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});

test('a broken link address shows a message, not a blank page', async ({ page }) => {
  await signIn(page);

  // In-page navigation: on a full load the server itself refuses a malformed address.
  await page.evaluate(() => {
    window.history.pushState(null, '', '/videos/%E0');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to videos' })).toBeVisible();
});

test('the link from the overview opens the same list it counted', async ({ page }) => {
  await signIn(page);

  await page.goto(`${BASE_URL}/videos?state=stopped`);

  await expect(stateChip(page, 'Stopped')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.video-row')).toHaveCount(1);
});

test('without a session the page says how to sign in', async ({ page }) => {
  await page.goto(`${BASE_URL}/videos`);

  await expect(page.getByText('send /web to the bot')).toBeVisible();
});

test('the dashboard shows what needs a person and what is in production', async ({ page }) => {
  await signIn(page);

  await expect(page.getByRole('heading', { name: '2 need you' })).toBeVisible();
  await expect(page.getByText('Approve script')).toBeVisible();
  await expect(page.getByText('Stopped: NEEDS_DECISION')).toBeVisible();
  await expect(page.getByRole('link', { name: /In production/ })).toContainText('3');
  await expect(page.getByRole('link', { name: /Workers online/ })).toContainText('1 of 2');
  await page.screenshot({ path: `${SCREENSHOTS}/overview-desktop.png`, fullPage: true });
});

test('videos can be filtered and searched', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Videos', exact: true }).click();

  await stateChip(page, 'Stopped').click();
  await expect(page.locator('.video-row')).toHaveCount(1);
  await expect(page.locator('.video-row')).toContainText('Vì sao bầu trời màu xanh');

  await stateChip(page, 'All').click();
  await expect(page.locator('.video-row')).toHaveCount(3);
  await page.getByLabel('Search by title or id').fill('GIỌT NƯỚC');
  await expect(page.locator('.video-row')).toHaveCount(1);

  await page.getByLabel('Search by title or id').fill('nothing like this');
  await expect(page.getByText('No video matches')).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOTS}/videos-empty.png` });
});

test('a video shows its steps, and the reason a step failed', async ({ page }) => {
  await signIn(page);
  await page.goto(`${BASE_URL}/videos/${harness.videos.stopped}`);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vì sao bầu trời màu xanh');
  await expect(page.locator('.step')).toHaveCount(8);
  await expect(page.locator('.step-failed')).toContainText('FAILED_PERMANENT');
  await expect(page.locator('.step-failed')).toContainText('render crashed: Page crashed!');
  await page.screenshot({ path: `${SCREENSHOTS}/video-desktop.png`, fullPage: true });
});

test('an unknown video says so and links back', async ({ page }) => {
  await signIn(page);
  await page.goto(`${BASE_URL}/videos/00000000-0000-4000-8000-000000000000`);

  await expect(page.getByRole('alert')).toHaveText('not found');
  await expect(page.getByRole('link', { name: 'Back to videos' })).toBeVisible();
});

test('workers are reachable and the old report address lands on the dashboard', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Workers', exact: true }).click();
  await expect(page.locator('.worker')).toHaveCount(2);
  await expect(page.locator('.worker-offline')).toContainText('hp-400-g7');
  await page.getByRole('link', { name: 'mac-mini-m4' }).click();
  await expect(page.getByRole('heading', { name: 'Last 24 hours' })).toBeVisible();

  await page.goto(`${BASE_URL}/report`);
  await expect(page).toHaveURL(`${BASE_URL}/`);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('signing out ends the session', async ({ page }) => {
  await signIn(page);

  await page.getByRole('button', { name: 'Sign out' }).click();

  await expect(page.getByText('send /web to the bot')).toBeVisible();
  await page.reload();
  await expect(page.getByText('send /web to the bot')).toBeVisible();
});

test.describe('in dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('uses the dark palette', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: '2 need you' })).toBeVisible();

    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    expect(background).toBe('rgb(22, 33, 43)');
    await page.screenshot({ path: `${SCREENSHOTS}/overview-dark.png`, fullPage: true });
  });
});

test.describe('at phone width', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test('no page scrolls sideways', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: '2 need you' })).toBeVisible();
    await expectNoSideways(page);
    await page.screenshot({ path: `${SCREENSHOTS}/overview-phone.png`, fullPage: true });

    for (const path of [
      '/videos',
      '/videos/new',
      `/videos/${harness.videos.stopped}`,
      '/library',
      '/workers',
      '/workers/mac-mini-m4',
    ]) {
      await page.goto(`${BASE_URL}${path}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoSideways(page);
    }
    await page.goto(`${BASE_URL}/videos/${harness.videos.stopped}`);
    await page.screenshot({ path: `${SCREENSHOTS}/video-phone.png`, fullPage: true });
  });
});
