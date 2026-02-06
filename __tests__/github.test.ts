import {
  asset,
  findTagFromReleases,
  mimeOrDefault,
  release,
  Release,
  Releaser,
} from '../src/github';

import { assert, describe, it } from 'vitest';

describe('github', () => {
  describe('mimeOrDefault', () => {
    it('returns a specific mime for common path', async () => {
      assert.equal(mimeOrDefault('foo.tar.gz'), 'application/gzip');
    });
    it('returns default mime for uncommon path', async () => {
      assert.equal(mimeOrDefault('foo.uncommon'), 'application/octet-stream');
    });
  });

  describe('asset', () => {
    it('derives asset info from a path', async () => {
      const { name, mime, size } = asset('tests/data/foo/bar.txt');
      assert.equal(name, 'bar.txt');
      assert.equal(mime, 'text/plain');
      assert.equal(size, 10);
    });
  });

  describe('findTagFromReleases', () => {
    const owner = 'owner';
    const repo = 'repo';

    const mockRelease: Release = {
      id: 1,
      upload_url: `https://api.github.com/repos/${owner}/${repo}/releases/1/assets`,
      html_url: `https://github.com/${owner}/${repo}/releases/tag/v1.0.0`,
      tag_name: 'v1.0.0',
      name: 'Test Release',
      body: 'Test body',
      target_commitish: 'main',
      draft: false,
      prerelease: false,
      assets: [],
    } as const;

    const mockReleaser: Releaser = {
      getReleaseByTag: () => Promise.reject({ status: 404 }),
      createRelease: () => Promise.reject('Not implemented'),
      updateRelease: () => Promise.reject('Not implemented'),
      finalizeRelease: () => Promise.reject('Not implemented'),
      allReleases: async function* () {
        yield { data: [mockRelease] };
      },
    } as const;

    it('finds a release by tag using direct API lookup', async () => {
      const targetTag = 'v1.0.0';
      const targetRelease = {
        ...mockRelease,
        tag_name: targetTag,
      };

      const releaser = {
        ...mockReleaser,
        getReleaseByTag: () => Promise.resolve({ data: targetRelease }),
      };

      const result = await findTagFromReleases(releaser, owner, repo, targetTag);

      assert.deepStrictEqual(result, targetRelease);
    });

    it('returns undefined when release is not found (404)', async () => {
      const releaser = {
        ...mockReleaser,
        getReleaseByTag: () => Promise.reject({ status: 404 }),
      };

      const result = await findTagFromReleases(releaser, owner, repo, 'nonexistent');

      assert.strictEqual(result, undefined);
    });

    it('re-throws non-404 errors', async () => {
      const releaser = {
        ...mockReleaser,
        getReleaseByTag: () => Promise.reject({ status: 500, message: 'Server error' }),
      };

      try {
        await findTagFromReleases(releaser, owner, repo, 'v1.0.0');
        assert.fail('Expected an error to be thrown');
      } catch (error) {
        assert.strictEqual(error.status, 500);
      }
    });

    it('finds a release with empty tag name', async () => {
      const emptyTag = '';
      const targetRelease = {
        ...mockRelease,
        tag_name: emptyTag,
      };

      const releaser = {
        ...mockReleaser,
        getReleaseByTag: () => Promise.resolve({ data: targetRelease }),
      };

      const result = await findTagFromReleases(releaser, owner, repo, emptyTag);

      assert.deepStrictEqual(result, targetRelease);
    });
  });

  describe('error handling', () => {
    it('handles 422 already_exists error gracefully', async () => {
      const existingRelease = {
        id: 1,
        upload_url: 'test',
        html_url: 'test',
        tag_name: 'v1.0.0',
        name: 'test',
        body: 'test',
        target_commitish: 'main',
        draft: false,
        prerelease: false,
        assets: [],
      };

      let createAttempts = 0;
      const mockReleaser: Releaser = {
        getReleaseByTag: ({ tag }) => {
          // First call returns 404 (release doesn't exist yet), subsequent calls find it
          if (createAttempts === 0) {
            return Promise.reject({ status: 404 });
          }
          return Promise.resolve({ data: existingRelease });
        },
        createRelease: () => {
          createAttempts++;
          return Promise.reject({
            status: 422,
            response: { data: { errors: [{ code: 'already_exists' }] } },
          });
        },
        updateRelease: () =>
          Promise.resolve({
            data: {
              id: 1,
              upload_url: 'test',
              html_url: 'test',
              tag_name: 'v1.0.0',
              name: 'test',
              body: 'test',
              target_commitish: 'main',
              draft: true,
              prerelease: false,
              assets: [],
            },
          }),
        finalizeRelease: async () => {},
        allReleases: async function* () {
          yield { data: [existingRelease] };
        },
      } as const;

      const config = {
        github_token: 'test-token',
        github_ref: 'refs/tags/v1.0.0',
        github_repository: 'owner/repo',
        input_tag_name: undefined,
        input_name: undefined,
        input_body: undefined,
        input_body_path: undefined,
        input_files: [],
        input_draft: undefined,
        input_prerelease: undefined,
        input_preserve_order: undefined,
        input_overwrite_files: undefined,
        input_fail_on_unmatched_files: false,
        input_target_commitish: undefined,
        input_discussion_category_name: undefined,
        input_generate_release_notes: false,
        input_append_body: false,
        input_make_latest: undefined,
      };

      const result = await release(config, mockReleaser, 2);
      assert.ok(result);
      assert.equal(result.id, 1);
    });
  });
});
