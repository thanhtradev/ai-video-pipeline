import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { createBatch, createVideo } from '../helpers/fixtures.js';
import { callAsWeb, prepareWebRoles, webSignIn } from '../helpers/web-console.js';

// The video library (D-104): every archived video with its publishing title and Drive link, by kit
// or character. The page and /library read one definition.

const GRANTS_SQL = new URL('../../../ops/postgres/grants.sql', import.meta.url);
const APPROVER = 222;
const STRANGER = 999;

let db: TestDb;
let session: string;
let sequence = 0;

const callWeb = <T>(fn: string, ...args: unknown[]): Promise<T> =>
  callAsWeb<T>(db.pool, fn, ...args);

beforeAll(async () => {
  db = await createTestDb();
  await prepareWebRoles(db.pool, await readFile(GRANTS_SQL, 'utf8'));
  await db.pool.query(`INSERT INTO approver (telegram_user_id, name) VALUES ($1, 'a')`, [APPROVER]);
  session = await webSignIn(db.pool, APPROVER);
});

afterAll(async () => {
  await db.drop();
});

interface Options {
  title?: string | null;
  topic?: string;
  kit?: string | null;
  character?: string | null;
  fileId?: string | null;
  folderId?: string | null;
  status?: string;
  isArchived?: boolean;
}

/** A video at the end of the pipeline: seeded past the state machine, whose steps are tested elsewhere. */
async function archivedVideo(
  options: Options = {},
): Promise<{ videoId: string; versionId: string }> {
  sequence += 1;
  const { videoId, versionId } = await createVideo(
    db.pool,
    await createBatch(db.pool, `library-${sequence}`),
    1,
  );
  const brief = {
    topic: options.topic ?? `Chủ đề ${sequence}`,
    ...(options.kit === null ? {} : { kit: options.kit ?? 'whatif' }),
    ...(options.character === null ? {} : { character_set: options.character ?? 'chip' }),
  };
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    await client.query(`UPDATE video_version SET brief = $2::jsonb, status = $3 WHERE id = $1`, [
      versionId,
      JSON.stringify(brief),
      options.status ?? 'COMPLETED',
    ]);
    const job = async (step: string, input: object, result: object): Promise<string> => {
      const created = await client.query<{ job_create: string }>(
        `SELECT job_create($1, $2, 'q:light', $3::jsonb, $4, '{}'::uuid[], 3)`,
        [versionId, step, JSON.stringify(input), `hash-${step}-${sequence}`],
      );
      const id = created.rows[0]!.job_create;
      await client.query(`UPDATE job SET status = 'SUCCEEDED', output = $2::jsonb WHERE id = $1`, [
        id,
        JSON.stringify({ outputs: [], result }),
      ]);
      return id;
    };
    const render = await job('render_final', {}, {});
    await job('qa_final', { render_job_id: render }, { duration_seconds: 372 });
    if (options.title !== null) {
      await job(
        'metadata',
        { render_job_id: render },
        {
          metadata: { title: options.title ?? `Tiêu đề ${sequence}` },
          media_token: 'a'.repeat(32),
        },
      );
    }
    await job(
      'archive',
      {},
      {
        ...(options.fileId === null
          ? {}
          : { drive_file_id: options.fileId ?? `file-id-${sequence}` }),
        ...(options.folderId === null
          ? {}
          : { drive_folder_id: options.folderId ?? `folder-id-${sequence}` }),
      },
    );
    await client.query('COMMIT');
  } finally {
    client.release();
  }
  if (options.isArchived !== false) {
    await db.pool.query(
      `INSERT INTO archive_record (video_version_id, target, path, file_count, total_bytes,
                                   manifest_sha256, verified_at)
       VALUES ($1, 'gdrive', $2, 3, 100, $3, now())`,
      [versionId, `2026/11/${videoId}/v1`, 'c'.repeat(64)],
    );
  }
  return { videoId, versionId };
}

interface Item {
  video_id: string;
  version: number;
  status: string;
  title: string;
  kit: string | null;
  kit_label: string | null;
  character_set: string | null;
  character_label: string | null;
  language: string;
  duration_seconds: number | null;
  file_url: string | null;
  folder_url: string | null;
}

interface Library {
  total: number;
  groups: { slug: string | null; label: string | null; count: number }[];
  items: Item[];
}

const library = (group = 'kit', search = '', limit = 500, offset = 0): Promise<Library> =>
  callWeb<Library>('web_library', session, group, search, limit, offset);

const itemOf = async (videoId: string): Promise<Item | undefined> =>
  (await library()).items.find((item) => item.video_id === videoId);

describe('Drive ids on the archive record', () => {
  test('come from the archive job when the record is made', async () => {
    const { versionId } = await archivedVideo({ fileId: 'file_A-1', folderId: 'folder_B-2' });

    const row = await db.pool.query(
      'SELECT drive_file_id, drive_folder_id FROM archive_record WHERE video_version_id = $1',
      [versionId],
    );

    expect(row.rows[0]).toEqual({ drive_file_id: 'file_A-1', drive_folder_id: 'folder_B-2' });
  });

  test('a malformed id is dropped, so it cannot stop a verified archive completing', async () => {
    const { versionId } = await archivedVideo({ fileId: 'bad id/../x' });

    const row = await db.pool.query(
      'SELECT drive_file_id FROM archive_record WHERE video_version_id = $1',
      [versionId],
    );

    expect(row.rows[0]).toEqual({ drive_file_id: null });
  });
});

describe('web_library', () => {
  test('gives the publishing title and private Drive links', async () => {
    const { videoId } = await archivedVideo({
      title: 'Nếu Trái Đất ngừng quay',
      topic: 'chủ đề thô',
      fileId: 'file_A-1',
      folderId: 'folder_B-2',
    });

    expect(await itemOf(videoId)).toMatchObject({
      title: 'Nếu Trái Đất ngừng quay',
      file_url: 'https://drive.google.com/file/d/file_A-1/view',
      folder_url: 'https://drive.google.com/drive/folders/folder_B-2',
      duration_seconds: 372,
      language: 'vi',
    });
  });

  test('falls back to the topic for a video with no metadata step', async () => {
    const { videoId } = await archivedVideo({ title: null, topic: 'Chủ đề còn lại' });

    expect((await itemOf(videoId))?.title).toBe('Chủ đề còn lại');
  });

  test('lists a video without ids, with no links', async () => {
    const { videoId } = await archivedVideo({ fileId: null, folderId: null });

    expect(await itemOf(videoId)).toMatchObject({ file_url: null, folder_url: null });
  });

  test('groups by kit or by character, with counts and labels', async () => {
    await archivedVideo({ kit: 'science', character: 'chip-science' });

    const byKit = await library('kit');
    const byCharacter = await library('character');

    const science = byKit.groups.find((group) => group.slug === 'science')!;
    expect(science.label).toBe('Khoa học');
    expect(science.count).toBeGreaterThanOrEqual(1);
    expect(byCharacter.groups.map((group) => group.slug)).toContain('chip-science');
    const slugs = byKit.items.map((item) => item.kit);
    expect(slugs).toEqual(
      [...slugs].sort(
        (a, b) =>
          byKit.groups.findIndex((g) => g.slug === a) - byKit.groups.findIndex((g) => g.slug === b),
      ),
    );
  });

  test('a disabled kit keeps its label', async () => {
    const { videoId } = await archivedVideo({ kit: 'whatif-en', character: 'chip-en' });
    await db.pool.query(`UPDATE catalog_option SET enabled = false WHERE slug = 'whatif-en'`);
    try {
      expect((await itemOf(videoId))?.kit).toBe('whatif-en');
      expect((await itemOf(videoId))?.kit_label).toBeTruthy();
    } finally {
      await db.pool.query(`UPDATE catalog_option SET enabled = true WHERE slug = 'whatif-en'`);
    }
  });

  test('a brief with no kit counts as the default kit, which it was made with', async () => {
    const { videoId } = await archivedVideo({ kit: null, character: null });

    expect(await itemOf(videoId)).toMatchObject({ kit: 'whatif', character_set: 'chip' });
  });

  test('a kit not in the catalog goes to the group with no slug, listed last', async () => {
    const unknown = await archivedVideo({ kit: 'gone-kit' });

    expect((await itemOf(unknown.videoId))?.kit).toBeNull();
    const { groups } = await library('kit');
    expect(groups.at(-1)?.slug).toBeNull();
    expect(groups.at(-1)?.count).toBeGreaterThanOrEqual(1);
  });

  test('lists only what has a verified archive', async () => {
    const notArchived = await archivedVideo({ isArchived: false, status: 'ARCHIVING' });

    expect(await itemOf(notArchived.videoId)).toBeUndefined();
  });

  test.each([['CANCELLED'], ['FAILED']])(
    'keeps a video that ended %s after its archive, because the copy is still on Drive',
    async (status) => {
      const { videoId } = await archivedVideo({ status });

      expect(await itemOf(videoId)).toMatchObject({ status });
    },
  );

  test('keeps the archived version while a newer one is in progress', async () => {
    const { videoId } = await archivedVideo({ fileId: 'old-file' });

    await db.pool.query(`SELECT video_new_version($1, '{"topic":"newer version"}'::jsonb)`, [
      videoId,
    ]);

    expect(await itemOf(videoId)).toMatchObject({
      version: 1,
      file_url: 'https://drive.google.com/file/d/old-file/view',
    });
    const rows = (await library()).items.filter((item) => item.video_id === videoId);
    expect(rows).toHaveLength(1);
  });

  test('searches title and id, treating % as a plain character', async () => {
    const { videoId } = await archivedVideo({ title: 'Một cái kim trong đống rơm' });

    const byTitle = await library('kit', 'CÁI KIM');
    const byId = await library('kit', videoId.slice(0, 13));
    const wildcard = await library('kit', '%');

    expect(byTitle.items.map((item) => item.video_id)).toEqual([videoId]);
    expect(byId.items.map((item) => item.video_id)).toEqual([videoId]);
    expect(wildcard.total).toBe(0);
  });

  test('counts every match while returning a page, and caps the page size', async () => {
    const page = await library('kit', '', 2, 0);
    const huge = await library('kit', '', 100_000, 0);

    expect(page.items).toHaveLength(2);
    expect(page.total).toBeGreaterThan(2);
    expect(page.groups.reduce((sum, group) => sum + group.count, 0)).toBe(page.total);
    expect(huge.items.length).toBeLessThanOrEqual(500);
  });

  test('refuses a bad session and an unknown grouping', async () => {
    await expect(callWeb('web_library', 'x', 'kit', '', 10, 0)).rejects.toMatchObject({
      code: 'WB401',
    });
    await expect(callWeb('web_library', session, 'nonsense', '', 10, 0)).rejects.toThrow(/group/);
  });

  test('never hands out a worker media token', async () => {
    expect(JSON.stringify(await library())).not.toContain('a'.repeat(32));
  });
});

interface TelegramRow {
  allowed: boolean;
  group_slug: string | null;
  group_label: string | null;
  group_total: number | null;
  video_id: string | null;
  title: string | null;
  file_url: string | null;
}

const telegram = async (
  user: number,
  kit: string | null = null,
  character: string | null = null,
): Promise<TelegramRow[]> =>
  (
    await db.pool.query<TelegramRow>('SELECT * FROM telegram_library($1, $2, $3)', [
      user,
      kit,
      character,
    ])
  ).rows;

describe('telegram_library', () => {
  test('refuses someone who is not an approver', async () => {
    expect(await telegram(STRANGER)).toEqual([expect.objectContaining({ allowed: false })]);
  });

  test('with no filter, gives each kit its count and 5 newest', async () => {
    for (let n = 0; n < 7; n += 1)
      await archivedVideo({ kit: 'science', character: 'chip-science' });

    const rows = (await telegram(APPROVER)).filter((row) => row.group_slug === 'science');

    expect(rows).toHaveLength(5);
    expect(rows[0]!.group_total).toBeGreaterThanOrEqual(7);
    expect(rows[0]!.group_label).toBe('Khoa học');
  });

  test('with a filter, gives the 20 newest that match', async () => {
    for (let n = 0; n < 21; n += 1)
      await archivedVideo({ kit: 'whatif', character: 'chip-science' });

    const byKit = await telegram(APPROVER, 'whatif');
    const byCharacter = await telegram(APPROVER, null, 'chip-science');

    expect(byKit).toHaveLength(20);
    expect(byKit[0]!.group_slug).toBe('whatif');
    expect(byCharacter).toHaveLength(20);
    expect(byCharacter[0]!.group_slug).toBe('chip-science');
  });

  test('says so when nothing matches', async () => {
    const rows = await telegram(APPROVER, 'no-such-kit');

    expect(rows).toEqual([expect.objectContaining({ allowed: true, video_id: null })]);
  });
});

describe('what the roles can reach', () => {
  test('the web role cannot call the shared definition or read the record', async () => {
    await expect(callWeb('library_rows')).rejects.toMatchObject({ code: '42501' });
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE aivideo_web');
      await expect(client.query('SELECT 1 FROM archive_record')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

describe('the backfill', () => {
  const missing = async (): Promise<string[]> =>
    (
      await db.pool.query<{ video_version_id: string }>(
        'SELECT video_version_id FROM archive_records_missing_drive_ids()',
      )
    ).rows.map((row) => row.video_version_id);

  test('also finds a record with a file id but no folder id, so a rerun can fill it', async () => {
    const { versionId } = await archivedVideo({ fileId: 'has-file', folderId: null });

    expect(await missing()).toContain(versionId);
  });

  test('finds records with no file id, on Drive only', async () => {
    const without = await archivedVideo({ fileId: null, folderId: null });
    const withIds = await archivedVideo({ fileId: 'all-file', folderId: 'all-folder' });
    const nextcloud = await archivedVideo({ fileId: null, folderId: null });
    await db.pool.query(
      `UPDATE archive_record SET target = 'nextcloud' WHERE video_version_id = $1`,
      [nextcloud.versionId],
    );

    const ids = await missing();

    expect(ids).toContain(without.versionId);
    expect(ids).not.toContain(withIds.versionId);
    expect(ids).not.toContain(nextcloud.versionId);
  });

  test('fills only what is empty, and records it', async () => {
    const { versionId } = await archivedVideo({ fileId: null, folderId: 'kept-folder' });

    await db.pool.query(`SELECT archive_record_set_drive_ids('mac-mini-m4', $1, $2, $3)`, [
      versionId,
      'new-file',
      'new-folder',
    ]);
    await db.pool.query(`SELECT archive_record_set_drive_ids('mac-mini-m4', $1, $2, $3)`, [
      versionId,
      'other-file',
      null,
    ]);

    const row = await db.pool.query(
      'SELECT drive_file_id, drive_folder_id FROM archive_record WHERE video_version_id = $1',
      [versionId],
    );
    expect(row.rows[0]).toEqual({ drive_file_id: 'new-file', drive_folder_id: 'kept-folder' });
    const audit = await db.pool.query(
      `SELECT 1 FROM audit_log WHERE action = 'archive_drive_ids' AND object_id = $1`,
      [versionId],
    );
    expect(audit.rowCount).toBeGreaterThanOrEqual(1);
  });

  test('a worker can only act in its own name', async () => {
    const { versionId } = await archivedVideo({ fileId: null, folderId: null });
    const LOGIN = 'aivideo_worker_mac_mini_m4';
    await db.pool.query(`
      DO $$ BEGIN
        CREATE ROLE ${LOGIN} LOGIN IN ROLE aivideo_worker PASSWORD 'local-test-only';
      EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
      END $$;`);
    await db.pool.query(`ALTER ROLE ${LOGIN} PASSWORD 'local-test-only'`);
    const url = new URL(db.url);
    url.username = LOGIN;
    url.password = 'local-test-only';
    const client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
    try {
      await expect(
        client.query(`SELECT archive_record_set_drive_ids('hp-400-g7', $1, 'x-file', NULL)`, [
          versionId,
        ]),
      ).rejects.toThrow();
      await client.query(`SELECT archive_record_set_drive_ids('mac-mini-m4', $1, 'x-file', NULL)`, [
        versionId,
      ]);
    } finally {
      await client.end();
    }
    const row = await db.pool.query(
      'SELECT drive_file_id FROM archive_record WHERE video_version_id = $1',
      [versionId],
    );
    expect(row.rows[0]).toEqual({ drive_file_id: 'x-file' });
  });
});
