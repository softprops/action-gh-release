import { getOctokit } from '@actions/github';
import { createHash } from 'crypto';
import { createServer, type Server } from 'http';
import { type AddressInfo } from 'net';
import { mkdtemp, open, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GitHubReleaser, upload } from '../src/github';
import type { Config } from '../src/util';

const openFile = vi.hoisted(() => vi.fn());

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  openFile.mockImplementation(actual.open);
  return { ...actual, open: openFile };
});

type Fixture = {
  name: string;
  path: string;
  size: number;
  digest: string;
  contentType: string;
  bytes?: Buffer;
};

type Receipt = {
  method: string | undefined;
  pathname: string;
  filename: string | null;
  contentLength: string | undefined;
  contentType: string | undefined;
  size: number;
  digest: string;
  chunks: number;
  chunkTypes: string[];
  bytes?: Buffer;
};

const config: Config = {
  github_token: 'not-a-real-token',
  github_ref: 'refs/tags/v1.0.0',
  github_repository: 'owner/repo',
  input_files: [],
  input_fail_on_unmatched_files: false,
  input_generate_release_notes: false,
  input_append_body: false,
  input_make_latest: undefined,
};

const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex');

const expectLastFileHandleClosed = async (): Promise<void> => {
  const result = openFile.mock.results.at(-1);
  expect(result?.type).toBe('return');
  const fileHandle = await result?.value;
  await expect(fileHandle.stat()).rejects.toMatchObject({ code: 'EBADF' });
};

const closeServer = async (server: Server): Promise<void> => {
  server.closeIdleConnections();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
};

const startUploadServer = async (
  responseStatus: (requestIndex: number) => number = () => 201,
): Promise<{ server: Server; uploadUrl: string; receipts: Receipt[] }> => {
  const receipts: Receipt[] = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const hash = createHash('sha256');
    const bufferedChunks: Buffer[] = [];
    const chunkTypes: string[] = [];
    let size = 0;
    let chunks = 0;

    for await (const chunk of request) {
      chunkTypes.push(chunk?.constructor?.name || typeof chunk);
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks += 1;
      size += bytes.length;
      hash.update(bytes);
      if (size <= 1024 * 1024) {
        bufferedChunks.push(Buffer.from(bytes));
      }
    }

    receipts.push({
      method: request.method,
      pathname: url.pathname,
      filename: url.searchParams.get('name'),
      contentLength: request.headers['content-length'],
      contentType: request.headers['content-type'],
      size,
      digest: hash.digest('hex'),
      chunks,
      chunkTypes,
      bytes: size <= 1024 * 1024 ? Buffer.concat(bufferedChunks) : undefined,
    });

    const status = responseStatus(receipts.length - 1);
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify(
        status === 201
          ? { id: 123, name: url.searchParams.get('name') }
          : {
              message: 'Validation Failed',
              errors: [{ code: 'already_exists' }],
            },
      ),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    server,
    uploadUrl: `http://127.0.0.1:${address.port}/repos/owner/repo/releases/1/assets`,
    receipts,
  };
};

describe('release asset upload transport', () => {
  let tempDirectory: string;
  let fixtures: Fixture[];

  beforeAll(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'action-gh-release-upload-'));

    const smallFixtures = [
      {
        name: 'artifact.zip.sha512',
        bytes: Buffer.from(`${'a'.repeat(128)}\n`),
        contentType: 'application/octet-stream',
      },
      {
        name: 'artifact.md5',
        bytes: Buffer.from(`${'b'.repeat(32)}\n`),
        contentType: 'application/octet-stream',
      },
      { name: 'one-byte.txt', bytes: Buffer.from([0x7f]), contentType: 'text/plain' },
      { name: 'empty.bin', bytes: Buffer.alloc(0), contentType: 'application/octet-stream' },
      {
        name: 'binary.bin',
        bytes: Buffer.from([0x00, 0x01, 0x7f, 0x80, 0xfe, 0xff]),
        contentType: 'application/octet-stream',
      },
    ];

    fixtures = [];
    for (const fixture of smallFixtures) {
      const path = join(tempDirectory, fixture.name);
      await writeFile(path, fixture.bytes);
      fixtures.push({
        ...fixture,
        path,
        size: fixture.bytes.length,
        digest: sha256(fixture.bytes),
      });
    }

    const largePath = join(tempDirectory, 'large.bin');
    const largeHandle = await open(largePath, 'w');
    const largeHash = createHash('sha256');
    const block = Buffer.alloc(64 * 1024);
    for (let index = 0; index < block.length; index += 1) {
      block[index] = index % 251;
    }
    try {
      for (let index = 0; index < 128; index += 1) {
        await largeHandle.write(block);
        largeHash.update(block);
      }
    } finally {
      await largeHandle.close();
    }
    fixtures.push({
      name: 'large.bin',
      path: largePath,
      size: 8 * 1024 * 1024,
      digest: largeHash.digest('hex'),
      contentType: 'application/octet-stream',
    });
  });

  afterAll(async () => {
    await rm(tempDirectory, { recursive: true, force: true });
  });

  it.each([0, 1, 2, 3, 4, 5])(
    'uploads fixture %i through the real Octokit request path',
    async (fixtureIndex) => {
      const fixture = fixtures[fixtureIndex];
      const { server, uploadUrl, receipts } = await startUploadServer();
      const releaser = new GitHubReleaser(getOctokit(config.github_token));
      openFile.mockClear();

      try {
        await expect(upload(config, releaser, uploadUrl, fixture.path, [], 1)).resolves.toEqual({
          id: 123,
          name: fixture.name,
        });

        expect(receipts).toHaveLength(1);
        expect(receipts[0]).toMatchObject({
          method: 'POST',
          pathname: '/repos/owner/repo/releases/1/assets',
          filename: fixture.name,
          contentLength: String(fixture.size),
          contentType: fixture.contentType,
          size: fixture.size,
          digest: fixture.digest,
        });
        if (fixture.bytes) {
          expect(receipts[0].bytes).toEqual(fixture.bytes);
        }
        expect(new Set(receipts[0].chunkTypes)).toEqual(
          fixture.size === 0 ? new Set() : new Set(['Buffer']),
        );
        if (fixture.size > 1024 * 1024) {
          expect(receipts[0].chunks).toBeGreaterThan(1);
        }
        await expectLastFileHandleClosed();
      } finally {
        await closeServer(server);
      }
    },
  );

  it('closes the file handle when the request fails', async () => {
    const fixture = fixtures[0];
    const { server, uploadUrl } = await startUploadServer(() => 500);
    const releaser = new GitHubReleaser(getOctokit(config.github_token));
    openFile.mockClear();

    try {
      await expect(upload(config, releaser, uploadUrl, fixture.path, [], 1)).rejects.toThrow(
        'Validation Failed',
      );
      await expectLastFileHandleClosed();
    } finally {
      await closeServer(server);
    }
  });

  it('normalizes ArrayBuffer chunks before they reach the Octokit transport', async () => {
    const fixture = fixtures[0];
    const { server, uploadUrl, receipts } = await startUploadServer();
    const releaser = new GitHubReleaser(getOctokit(config.github_token));
    const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
    openFile.mockImplementationOnce(async (...args: Parameters<typeof actual.open>) => {
      const fileHandle = await actual.open(...args);
      const readableWebStream = fileHandle.readableWebStream.bind(fileHandle);
      Object.defineProperty(fileHandle, 'readableWebStream', {
        configurable: true,
        value: () =>
          readableWebStream().pipeThrough(
            new TransformStream<Uint8Array, ArrayBuffer>({
              transform(chunk, controller) {
                controller.enqueue(chunk.slice().buffer);
              },
            }),
          ),
      });
      return fileHandle;
    });

    try {
      await expect(upload(config, releaser, uploadUrl, fixture.path, [], 1)).resolves.toEqual({
        id: 123,
        name: fixture.name,
      });
      expect(receipts).toHaveLength(1);
      expect(receipts[0]).toMatchObject({
        size: fixture.size,
        digest: fixture.digest,
      });
      await expectLastFileHandleClosed();
    } finally {
      await closeServer(server);
    }
  });

  it('opens a fresh upload body after an already-exists response', async () => {
    const fixture = fixtures[0];
    const { server, uploadUrl, receipts } = await startUploadServer((index) =>
      index === 0 ? 422 : 201,
    );
    const releaser = new GitHubReleaser(getOctokit(config.github_token));
    vi.spyOn(releaser, 'listReleaseAssets').mockResolvedValue([{ id: 9, name: fixture.name }]);
    const deleteReleaseAsset = vi
      .spyOn(releaser, 'deleteReleaseAsset')
      .mockResolvedValue(undefined);
    openFile.mockClear();

    try {
      await expect(upload(config, releaser, uploadUrl, fixture.path, [], 1)).resolves.toEqual({
        id: 123,
        name: fixture.name,
      });
      expect(receipts).toHaveLength(2);
      expect(receipts.map(({ size }) => size)).toEqual([fixture.size, fixture.size]);
      expect(receipts.map(({ digest }) => digest)).toEqual([fixture.digest, fixture.digest]);
      expect(openFile).toHaveBeenCalledTimes(2);
      expect(deleteReleaseAsset).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        release_id: 1,
        asset_id: 9,
      });
      for (const result of openFile.mock.results) {
        const fileHandle = await result.value;
        await expect(fileHandle.stat()).rejects.toMatchObject({ code: 'EBADF' });
      }
    } finally {
      await closeServer(server);
    }
  });

  it('falls back to the release-scoped delete route through the real Octokit request path', async () => {
    const requests: Array<{
      method: string | undefined;
      pathname: string;
      authorization: string | undefined;
    }> = [];
    const server = createServer((request, response) => {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      requests.push({
        method: request.method,
        pathname: url.pathname,
        authorization: request.headers.authorization,
      });

      if (url.pathname === '/repos/owner/repo/releases/assets/9') {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ message: 'page not found' }));
        return;
      }
      if (url.pathname === '/repos/owner/repo/releases/1/assets/9') {
        response.writeHead(204);
        response.end();
        return;
      }

      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: 'unexpected route' }));
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    const releaser = new GitHubReleaser(
      getOctokit(config.github_token, {
        baseUrl: `http://127.0.0.1:${address.port}`,
      }),
    );

    try {
      await expect(
        releaser.deleteReleaseAsset({
          owner: 'owner',
          repo: 'repo',
          release_id: 1,
          asset_id: 9,
        }),
      ).resolves.toBeUndefined();
      expect(requests).toEqual([
        {
          method: 'DELETE',
          pathname: '/repos/owner/repo/releases/assets/9',
          authorization: 'token not-a-real-token',
        },
        {
          method: 'DELETE',
          pathname: '/repos/owner/repo/releases/1/assets/9',
          authorization: 'token not-a-real-token',
        },
      ]);
    } finally {
      await closeServer(server);
    }
  });
});
