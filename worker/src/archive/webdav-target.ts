import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { XMLParser } from 'fast-xml-parser';
import type { FileDigest } from '../storage/checkpoint.js';

// WebDAV archive target (D-036): interim NAS is Nextcloud at
// http://lxc-nextcloud:8080/remote.php/dav/files/<archive-user>/. Uses only MKCOL, PUT, PROPFIND
// (Depth: 1, since Nextcloud rejects Depth: infinity), GET, MOVE. It has no delete operation.

export interface RemoteEntry {
  /** Path relative to the listed directory. */
  path: string;
  bytes: number;
  /** Set when the target lists SHA-256 itself, so verification needs no per-file hash call. */
  sha256?: string;
}

export interface ArchiveTarget {
  exists: (remotePath: string) => Promise<boolean>;
  ensureDir: (remotePath: string) => Promise<void>;
  upload: (localPath: string, remotePath: string) => Promise<void>;
  /** Optional: uploads files (relative to localDir) in one call, creating their folders. */
  uploadFiles?: (localDir: string, remoteDir: string, paths: readonly string[]) => Promise<void>;
  putContent: (remotePath: string, content: string) => Promise<void>;
  /** Recursively lists files (not directories) under remoteDir. */
  list: (remoteDir: string) => Promise<RemoteEntry[]>;
  hash: (remotePath: string) => Promise<FileDigest>;
  /** Renames; fails if the destination exists. */
  move: (fromPath: string, toPath: string) => Promise<void>;
}

export interface WebdavOptions {
  baseUrl: string;
  username: string;
  password: string;
  /** Metadata requests (PROPFIND, MKCOL, MOVE). */
  requestTimeoutMs?: number;
  /** File uploads and downloads, including reading the body. */
  transferTimeoutMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_TRANSFER_TIMEOUT_MS = 30 * 60_000;
const TRANSFER_METHODS = new Set(['PUT', 'GET']);

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

interface PropfindEntry {
  href: string;
  isCollection: boolean;
  bytes: number;
}

const xml = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false });

function validateRemotePath(remotePath: string): string[] {
  const segments = remotePath.split('/').filter((segment) => segment !== '');
  if (segments.some((segment) => segment === '..' || segment === '.' || segment.includes('\\'))) {
    throw new Error(`invalid remote path: ${remotePath}`);
  }
  return segments;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

type XmlNode = Record<string, unknown>;

/** Parses a multistatus body; href is returned as sent (still percent-encoded). */
function parsePropfind(body: string): PropfindEntry[] {
  const doc = xml.parse(body) as { multistatus?: { response?: XmlNode | XmlNode[] } };
  return asArray(doc.multistatus?.response).map((response) => {
    const propstats = asArray(response.propstat as XmlNode | XmlNode[] | undefined);
    const props = propstats.map((propstat) => (propstat.prop ?? {}) as XmlNode);
    const resourcetype = props.find((prop) => prop.resourcetype !== undefined)?.resourcetype;
    const length = props.find((prop) => prop.getcontentlength !== undefined)?.getcontentlength;
    return {
      href: String(response.href),
      isCollection:
        typeof resourcetype === 'object' && resourcetype !== null && 'collection' in resourcetype,
      bytes: Number(length ?? 0),
    };
  });
}

/** Decoded URL path without a trailing slash. */
function decodedPath(url: URL): string {
  const path = decodeURIComponent(url.pathname);
  return path.endsWith('/') ? path.slice(0, -1) : path;
}

export function createWebdavTarget(options: WebdavOptions): ArchiveTarget {
  const base = new URL(options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`);
  const authorization = `Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}`;

  function urlFor(remotePath: string, trailingSlash = false): URL {
    const encoded = validateRemotePath(remotePath).map(encodeURIComponent).join('/');
    return new URL(`${encoded}${trailingSlash && encoded ? '/' : ''}`, base);
  }

  function timeoutFor(method: string): number {
    return TRANSFER_METHODS.has(method)
      ? (options.transferTimeoutMs ?? DEFAULT_TRANSFER_TIMEOUT_MS)
      : (options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
  }

  function timeoutError(method: string, remotePath: string): Error {
    return new Error(`WebDAV ${method} ${remotePath} timed out after ${timeoutFor(method)} ms`);
  }

  // Every request has a deadline so an unresponsive NAS fails the job instead of hanging it.
  async function request(
    method: string,
    remotePath: string,
    init: { headers?: Record<string, string>; body?: BodyInit; trailingSlash?: boolean } = {},
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(urlFor(remotePath, init.trailingSlash), {
        method,
        headers: { authorization, ...init.headers },
        signal: AbortSignal.timeout(timeoutFor(method)),
        ...(init.body === undefined ? {} : { body: init.body, duplex: 'half' }),
      } as RequestInit);
    } catch (error: unknown) {
      if (isTimeout(error)) throw timeoutError(method, remotePath);
      throw error;
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(`WebDAV ${method} ${remotePath} failed: ${response.status}`);
    }
    return response;
  }

  async function expectOk(response: Response, method: string, remotePath: string): Promise<void> {
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`WebDAV ${method} ${remotePath} failed: ${response.status}`);
    }
  }

  async function propfind(remoteDir: string): Promise<PropfindEntry[]> {
    const response = await request('PROPFIND', remoteDir, {
      headers: { depth: '1', 'content-type': 'application/xml' },
      trailingSlash: true,
    });
    await expectOk(response, 'PROPFIND', remoteDir);
    return parsePropfind(await response.text());
  }

  const target: ArchiveTarget = {
    exists: async (remotePath) => {
      const response = await request('PROPFIND', remotePath, { headers: { depth: '0' } });
      await response.body?.cancel();
      if (response.status === 404) return false;
      if (response.status === 207) return true;
      throw new Error(`WebDAV PROPFIND ${remotePath} failed: ${response.status}`);
    },

    ensureDir: async (remotePath) => {
      const segments = validateRemotePath(remotePath);
      for (let i = 1; i <= segments.length; i += 1) {
        const partial = segments.slice(0, i).join('/');
        const response = await request('MKCOL', partial, { trailingSlash: true });
        await response.body?.cancel();
        // 405: already exists.
        if (!response.ok && response.status !== 405) {
          throw new Error(`WebDAV MKCOL ${partial} failed: ${response.status}`);
        }
      }
    },

    upload: async (localPath, remotePath) => {
      const { size } = await stat(localPath);
      const response = await request('PUT', remotePath, {
        headers: { 'content-length': String(size), 'content-type': 'application/octet-stream' },
        body: Readable.toWeb(createReadStream(localPath)) as ReadableStream,
      });
      await expectOk(response, 'PUT', remotePath);
    },

    putContent: async (remotePath, content) => {
      const response = await request('PUT', remotePath, { body: content });
      await expectOk(response, 'PUT', remotePath);
    },

    list: async (remoteDir) => {
      const rootPath = decodedPath(urlFor(remoteDir, true));
      const files: RemoteEntry[] = [];
      const pending = [remoteDir];
      while (pending.length > 0) {
        const dir = pending.pop()!;
        const dirPath = decodedPath(urlFor(dir, true));
        for (const entry of await propfind(dir)) {
          const entryPath = decodedPath(new URL(entry.href, base));
          if (entryPath === dirPath) continue;
          const relative = entryPath.slice(rootPath.length + 1);
          if (entry.isCollection) pending.push(`${remoteDir}/${relative}`);
          else files.push({ path: relative, bytes: entry.bytes });
        }
      }
      return files;
    },

    hash: async (remotePath) => {
      const response = await request('GET', remotePath);
      await expectOk(response, 'GET', remotePath);
      const hash = createHash('sha256');
      let bytes = 0;
      try {
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          hash.update(chunk);
          bytes += chunk.length;
        }
      } catch (error: unknown) {
        if (isTimeout(error)) throw timeoutError('GET', remotePath);
        throw error;
      }
      return { sha256: hash.digest('hex'), bytes };
    },

    move: async (fromPath, toPath) => {
      const response = await request('MOVE', fromPath, {
        headers: { destination: urlFor(toPath).toString(), overwrite: 'F' },
        trailingSlash: true,
      });
      await expectOk(response, 'MOVE', fromPath);
    },
  };
  return target;
}
