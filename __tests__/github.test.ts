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
      getReleaseByTag: () => Promise.reject('Not implemented'),
      createRelease: () => Promise.reject('Not implemented'),
      updateRelease: () => Promise.reject('Not implemented'),
      allReleases: async function* () {
        yield { data: [mockRelease] };
      },
    } as const;

    describe('when the tag_name is not an empty string', () => {
      const targetTag = 'v1.0.0';

      it('finds a matching release in first batch of results', async () => {
        const targetRelease = {
          ...mockRelease,
          owner,
          repo,
          tag_name: targetTag,
        };
        const otherRelease = {
          ...mockRelease,
          owner,
          repo,
          tag_name: 'v1.0.1',
        };

        const releaser = {
          ...mockReleaser,
          allReleases: async function* () {
            yield { data: [targetRelease] };
            yield { data: [otherRelease] };
          },
        };

        const result = await findTagFromReleases(releaser, owner, repo, targetTag);

        assert.deepStrictEqual(result, targetRelease);
      });

      it('finds a matching release in second batch of results', async () => {
        const targetRelease = {
          ...mockRelease,
          owner,
          repo,
          tag_name: targetTag,
        };
        const otherRelease = {
          ...mockRelease,
          owner,
          repo,
          tag_name: 'v1.0.1',
        };

        const releaser = {
          ...mockReleaser,
          allReleases: async function* () {
            yield { data: [otherRelease] };
            yield { data: [targetRelease] };
          },
        };

        const result = await findTagFromReleases(releaser, owner, repo, targetTag);
        assert.deepStrictEqual(result, targetRelease);
      });

      it('returns undefined when a release is not found in any batch', async () => {
        const otherRelease = {
          ...mockRelease,
          owner,
          repo,
          tag_name: 'v1.0.1',
        };
        const releaser = {
          ...mockReleaser,
          allReleases: async function* () {
            yield { data: [otherRelease] };
            yield { data: [otherRelease] };
          },
        };

        const result = await findTagFromReleases(releaser, owner, repo, targetTag);

        assert.strictEqual(result, undefined);
      });

      it('returns undefined when no releases are returned', async () => {
        const releaser = {
          ...mockReleaser,
          allReleases: async function* () {
            yield { data: [] };
          },
        };

        const result = await findTagFromReleases(releaser, owner, repo, targetTag);

        assert.strictEqual(result, undefined);
      });
    });

    describe('when the tag_name is an empty string', () => {
      const emptyTag = '';

      it('finds a matching release in first batch of results', async () => {
        const targetRelease = {
          ...mockRelease,
          owner,
          repo,
          tag_name: emptyTag,
        };
        const otherRelease = {
          ...mockRelease,
          owner,
          repo,
          tag_name: 'v1.0.1',
        };

        const releaser = {
          ...mockReleaser,
          allReleases: async function* () {
            yield { data: [targetRelease] };
            yield { data: [otherRelease] };
          },
        };

        const result = await findTagFromReleases(releaser, owner, repo, emptyTag);

        assert.deepStrictEqual(result, targetRelease);
      });

      it('finds a matching release in second batch of results', async () => {
        const targetRelease = {
          ...mockRelease,
          owner,
          repo,
          tag_name: emptyTag,
        };
        const otherRelease = {
          ...mockRelease,
          owner,
          repo,
          tag_name: 'v1.0.1',
        };

        const releaser = {
          ...mockReleaser,
          allReleases: async function* () {
            yield { data: [otherRelease] };
            yield { data: [targetRelease] };
          },
        };

        const result = await findTagFromReleases(releaser, owner, repo, emptyTag);
        assert.deepStrictEqual(result, targetRelease);
      });

      it('returns undefined when a release is not found in any batch', async () => {
        const otherRelease = {
          ...mockRelease,
          owner,
          repo,
          tag_name: 'v1.0.1',
        };
        const releaser = {
          ...mockReleaser,
          allReleases: async function* () {
            yield { data: [otherRelease] };
            yield { data: [otherRelease] };
          },
        };

        const result = await findTagFromReleases(releaser, owner, repo, emptyTag);

        assert.strictEqual(result, undefined);
      });

      it('returns undefined when no releases are returned', async () => {
        const releaser = {
          ...mockReleaser,
          allReleases: async function* () {
            yield { data: [] };
          },
        };

        const result = await findTagFromReleases(releaser, owner, repo, emptyTag);

        assert.strictEqual(result, undefined);
      });
    });
  });

  describe('error handling', () => {
    it('handles 422 already_exists error gracefully', async () => {
      const mockReleaser: Releaser = {
        getReleaseByTag: () => Promise.reject('Not implemented'),
        createRelease: () =>
          Promise.reject({
            status: 422,
            response: { data: { errors: [{ code: 'already_exists' }] } },
          }),
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
              draft: false,
              prerelease: false,
              assets: [],
            },
          }),
        allReleases: async function* () {
          yield {
            data: [
              {
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
              },
            ],
          };
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

      const result = await release(config, mockReleaser, 1);
      assert.ok(result);
      assert.equal(result.id, 1);
    });
  });
});
