import {
  asset,
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

  describe('release', () => {
    it('creates a new release', async () => {
      const mockReleaser: Releaser = {
        createRelease: async () =>
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
        updateRelease: () => Promise.reject('Not implemented'),
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

      const result = await release(config, mockReleaser);
      assert.ok(result);
      assert.equal(result.id, 1);
    });
  });
});
