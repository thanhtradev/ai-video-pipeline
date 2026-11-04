import { expect, test, type Page } from '@playwright/test';
import { createBatch, createVideo } from '../../worker/test/helpers/fixtures.js';
import { BASE_URL, loginLink, startHarness, stopHarness, type Harness } from './harness.js';

const SCREENSHOTS = 'test-results/screens';
let harness: Harness;
let sequence = 0;

async function archived(
  topic: string,
  kit: string,
  character: string,
  fileId: string | null,
): Promise<string> {
  const { pool } = harness.db;
  sequence += 1;
  const { videoId, versionId } = await createVideo(
    pool,
    await createBatch(pool, `library-${sequence}`),
    1,
  );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    await client.query(
      `UPDATE video_version SET status = 'COMPLETED', brief = $2::jsonb WHERE id = $1`,
      [versionId, JSON.stringify({ topic, kit, character_set: character })],
    );
    await client.query('COMMIT');
  } finally {
    client.release();
  }
  await pool.query(
    `INSERT INTO archive_record (video_version_id, target, path, file_count, total_bytes,
                                 manifest_sha256, verified_at, drive_file_id, drive_folder_id)
     VALUES ($1, 'gdrive', $2, 3, 100, $3, now() - ($4 * interval '1 hour'), $5, $6)`,
    [
      versionId,
      `2026/11/${videoId}/v1`,
      'c'.repeat(64),
      sequence,
      fileId,
      fileId === null ? null : `folder-${fileId}`,
    ],
  );
  return videoId;
}

test.beforeAll(async () => {
  harness = await startHarness();
  await archived('Nếu Trái Đất ngừng quay', 'whatif', 'chip', 'file-one');
  await archived('Nếu bạn nghe được mèo nghĩ gì', 'whatif', 'chip', null);
  await archived('Vì sao bầu trời màu xanh', 'science', 'chip-science', 'file-three');
});

test.afterAll(async () => {
  await stopHarness(harness);
});

async function openLibrary(page: Page): Promise<void> {
  await page.goto(await loginLink(harness));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
}

const group = (page: Page, name: RegExp) => page.getByRole('region', { name });

test('groups by kit, with counts, titles and private Drive links', async ({ page }) => {
  await openLibrary(page);

  const whatif = group(page, /Nếu bạn… \(2\)/);
  await expect(whatif.getByRole('listitem')).toHaveCount(2);
  await expect(whatif.getByRole('link', { name: 'Nếu Trái Đất ngừng quay' })).toBeVisible();
  const link = whatif.getByRole('link', { name: 'Open in Drive' });
  await expect(link).toHaveAttribute('href', 'https://drive.google.com/file/d/file-one/view');
  await expect(link).toHaveAttribute('rel', /noreferrer/);
  await expect(whatif.getByRole('link', { name: 'Folder' })).toHaveAttribute(
    'href',
    'https://drive.google.com/drive/folders/folder-file-one',
  );
  await expect(group(page, /Khoa học \(1\)/)).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOTS}/library-desktop.png`, fullPage: true });
});

test('marks a video with no link yet', async ({ page }) => {
  await openLibrary(page);

  const row = page.getByRole('listitem').filter({ hasText: 'mèo nghĩ gì' });

  await expect(row.getByText('No Drive link yet')).toBeVisible();
  await expect(row.getByRole('link', { name: 'Open in Drive' })).toHaveCount(0);
});

test('switches to grouping by character, and keeps that on reload', async ({ page }) => {
  await openLibrary(page);

  await page.getByRole('button', { name: 'Character' }).click();
  await expect(page.getByRole('button', { name: 'Character' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(group(page, /Chíp \(BẠN\) \(2\)/)).toBeVisible();
  expect(new URL(page.url()).search).toBe('?group=character');

  await page.reload();

  await expect(page.getByRole('button', { name: 'Character' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(group(page, /Chíp \(BẠN\) \(2\)/)).toBeVisible();
});

test('the nav link back to Library shows what its address says', async ({ page }) => {
  await openLibrary(page);
  await page.getByRole('button', { name: 'Character' }).click();
  await expect(group(page, /Chíp \(BẠN\) \(2\)/)).toBeVisible();

  await page.getByRole('link', { name: 'Library' }).click();

  await expect(page.getByRole('button', { name: 'Kit' })).toHaveAttribute('aria-pressed', 'true');
  await expect(group(page, /Khoa học \(1\)/)).toBeVisible();
});

test('a cancelled video stays listed, marked, because Drive still has it', async ({ page }) => {
  const videoId = await archived('Đã hủy nhưng còn trên Drive', 'whatif', 'chip', 'file-cancelled');
  await harness.db.pool.query(
    `BEGIN;
     SET LOCAL session_replication_role = replica;
     UPDATE video_version SET status = 'CANCELLED' WHERE video_id = '${videoId}';
     COMMIT;`,
  );
  await openLibrary(page);

  const row = page.getByRole('listitem').filter({ hasText: 'Đã hủy nhưng còn trên Drive' });

  await expect(row.getByText('Cancelled')).toBeVisible();
  await expect(row.getByRole('link', { name: 'Open in Drive' })).toBeVisible();
  await harness.db.pool.query(
    `BEGIN;
     SET LOCAL session_replication_role = replica;
     UPDATE video_version SET status = 'COMPLETED' WHERE video_id = '${videoId}';
     DELETE FROM archive_record WHERE video_version_id IN
       (SELECT id FROM video_version WHERE video_id = '${videoId}');
     COMMIT;`,
  );
});

test('searches titles, and says when nothing matches', async ({ page }) => {
  await openLibrary(page);
  const search = page.getByLabel('Search by title or id');

  await search.fill('BẦU TRỜI');
  await expect(page.getByRole('link', { name: 'Open in Drive' })).toHaveCount(1);
  await expect(group(page, /Khoa học \(1\)/)).toBeVisible();

  await search.fill('không có video này');
  await expect(page.getByText('No video matches')).toBeVisible();
});

test('a title opens the video page', async ({ page }) => {
  await openLibrary(page);

  await page.getByRole('link', { name: 'Vì sao bầu trời màu xanh' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vì sao bầu trời màu xanh');
});

test('says who the links open for', async ({ page }) => {
  await openLibrary(page);

  await expect(page.getByText('open only for Google accounts')).toBeVisible();
});

test.describe('in dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('renders', async ({ page }) => {
    await openLibrary(page);
    await expect(group(page, /Khoa học/)).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOTS}/library-dark.png`, fullPage: true });
  });
});

test.describe('at phone width', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test('does not scroll sideways', async ({ page }) => {
    await openLibrary(page);
    await expect(group(page, /Khoa học/)).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SCREENSHOTS}/library-phone.png`, fullPage: true });
  });
});

test('an empty library says when videos appear', async ({ page }) => {
  await page.route('**/api/library*', (route) =>
    route.fulfill({ json: { success: true, data: { total: 0, groups: [], items: [] } } }),
  );
  await page.goto(await loginLink(harness));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.goto(`${BASE_URL}/library`);

  await expect(page.getByText('Videos appear here once they are archived')).toBeVisible();
});
