import { getOctokit } from '@actions/github';
import { createServer, type Server } from 'http';
import { type AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GitHubReleaser, release, type Release } from '../src/github';
import { parseConfig, type Config } from '../src/util';

type CapturedRequest = {
  path: string;
  authorization: string | undefined;
  contentType: string | undefined;
  body: Record<string, unknown>;
};

const closeServer = async (server: Server): Promise<void> => {
  server.closeIdleConnections();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
};

describe('release creation transport', () => {
  let server: Server;
  let baseUrl: string;
  const requests: CapturedRequest[] = [];
  const releases = new Map<string, Release>();

  beforeAll(async () => {
    server = createServer(async (request, response) => {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      const tagMatch = url.pathname.match(/^\/repos\/owner\/remote\/releases\/tags\/(.+)$/);
      if (request.method === 'GET' && tagMatch) {
        const release = releases.get(decodeURIComponent(tagMatch[1]));
        response.writeHead(release ? 200 : 404, { 'content-type': 'application/json' });
        response.end(JSON.stringify(release ?? { message: 'Not Found' }));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/repos/owner/remote/releases') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify([...releases.values()]));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/repos/owner/remote/releases') {
        const chunks: Buffer[] = [];
        for await (const chunk of request) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
        requests.push({
          path: url.pathname,
          authorization: request.headers.authorization,
          contentType: request.headers['content-type'],
          body,
        });
        const tag = String(body.tag_name);
        const createdRelease: Release = {
          id: requests.length,
          upload_url: `http://127.0.0.1/uploads/${requests.length}`,
          html_url: `http://127.0.0.1/releases/${requests.length}`,
          tag_name: tag,
          name: String(body.name),
          body: typeof body.body === 'string' ? body.body : null,
          target_commitish: 'main',
          draft: Boolean(body.draft),
          prerelease: Boolean(body.prerelease),
          assets: [],
        };
        releases.set(tag, createdRelease);
        response.writeHead(201, { 'content-type': 'application/json' });
        response.end(JSON.stringify(createdRelease));
        return;
      }

      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ message: `Unexpected route ${request.method} ${url.pathname}` }),
      );
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await closeServer(server);
  });

  it('serializes user-facing category inputs through the real Octokit request path', async () => {
    const parsedEmptyCategory = parseConfig({
      INPUT_DISCUSSION_CATEGORY_NAME: '',
    }).input_discussion_category_name;
    expect(parsedEmptyCategory).toBeUndefined();

    const cases: Array<{
      name: string;
      categoryProperty: 'absent' | 'present';
      category: string | undefined;
      expectedCategory: string | undefined;
    }> = [
      {
        name: 'absent-category',
        categoryProperty: 'absent',
        category: undefined,
        expectedCategory: undefined,
      },
      {
        name: 'undefined-category',
        categoryProperty: 'present',
        category: undefined,
        expectedCategory: undefined,
      },
      {
        name: 'empty-input-category',
        categoryProperty: 'present',
        category: parsedEmptyCategory,
        expectedCategory: undefined,
      },
      {
        name: 'valid-category',
        categoryProperty: 'present',
        category: 'Announcements',
        expectedCategory: 'Announcements',
      },
    ];

    for (const testCase of cases) {
      const config: Config = {
        github_token: 'not-a-real-token',
        github_ref: 'refs/heads/main',
        github_repository: 'owner/remote',
        input_tag_name: testCase.name,
        input_name: `Release ${testCase.name}`,
        input_files: [],
        input_draft: false,
        input_prerelease: true,
        input_fail_on_unmatched_files: false,
        input_generate_release_notes: false,
        input_append_body: false,
        input_make_latest: undefined,
      };
      if (testCase.categoryProperty === 'present') {
        config.input_discussion_category_name = testCase.category;
      }

      const releaser = new GitHubReleaser(
        getOctokit(config.github_token, {
          baseUrl,
        }),
      );
      await expect(release(config, releaser, 1)).resolves.toMatchObject({
        release: { tag_name: testCase.name },
        created: true,
      });

      const request = requests.at(-1);
      expect(request).toMatchObject({
        path: '/repos/owner/remote/releases',
        authorization: 'token not-a-real-token',
        contentType: 'application/json; charset=utf-8',
        body: {
          tag_name: testCase.name,
          name: `Release ${testCase.name}`,
          draft: false,
          prerelease: true,
          generate_release_notes: false,
        },
      });
      if (testCase.expectedCategory) {
        expect(request?.body.discussion_category_name).toBe(testCase.expectedCategory);
      } else {
        expect(request?.body).not.toHaveProperty('discussion_category_name');
      }
    }
  });
});
