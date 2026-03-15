import {
  asset,
  findTagFromReleases,
  finalizeRelease,
  mimeOrDefault,
  release,
  Release,
  Releaser,
  upload,
} from '../src/github';

import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { assert, describe, expect, it, vi } from 'vitest';

describe('github', () => {
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
      listReleaseAssets: () => Promise.reject('Not implemented'),
      deleteReleaseAsset: () => Promise.reject('Not implemented'),
      deleteRelease: () => Promise.reject('Not implemented'),
      updateReleaseAsset: () => Promise.reject('Not implemented'),
      uploadReleaseAsset: () => Promise.reject('Not implemented'),
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

  describe('finalizeRelease input_draft behavior', () => {
    const draftRelease: Release = {
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
    };

    const finalizedRelease: Release = {
      ...draftRelease,
      draft: false,
    };
    const publishedPrerelease: Release = {
      ...draftRelease,
      draft: false,
      prerelease: true,
    };

    it.each([
      {
        name: 'returns early when input_draft is true',
        input_draft: true,
        release: draftRelease,
        expectedCalls: 0,
        expectedResult: draftRelease,
      },
      {
        name: 'finalizes release when input_draft is false',
        input_draft: false,
        release: draftRelease,
        expectedCalls: 1,
        expectedResult: finalizedRelease,
      },
      {
        name: 'returns early when release is already published',
        input_draft: false,
        release: publishedPrerelease,
        expectedCalls: 0,
        expectedResult: publishedPrerelease,
      },
    ])('$name', async ({ input_draft, release, expectedCalls, expectedResult }) => {
      const finalizeReleaseSpy = vi.fn(async () => ({ data: finalizedRelease }));

      const releaser: Releaser = {
        getReleaseByTag: () => Promise.reject('Not implemented'),
        createRelease: () => Promise.reject('Not implemented'),
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: finalizeReleaseSpy,
        allReleases: async function* () {
          throw new Error('Not implemented');
        },
        listReleaseAssets: () => Promise.reject('Not implemented'),
        deleteReleaseAsset: () => Promise.reject('Not implemented'),
        deleteRelease: () => Promise.reject('Not implemented'),
        updateReleaseAsset: () => Promise.reject('Not implemented'),
        uploadReleaseAsset: () => Promise.reject('Not implemented'),
      };

      const result = await finalizeRelease(
        {
          ...config,
          input_draft,
        },
        releaser,
        release,
      );

      expect(finalizeReleaseSpy).toHaveBeenCalledTimes(expectedCalls);
      assert.strictEqual(result, expectedResult);

      if (expectedCalls === 1) {
        expect(finalizeReleaseSpy).toHaveBeenCalledWith({
          owner: 'owner',
          repo: 'repo',
          release_id: release.id,
        });
      }
    });

    it('deletes a newly created draft when tag creation is blocked by repository rules', async () => {
      const finalizeReleaseSpy = vi.fn(async () => {
        throw {
          status: 422,
          response: {
            data: {
              errors: [
                {
                  field: 'pre_receive',
                  message:
                    'pre_receive Repository rule violations found\n\nCannot create ref due to creations being restricted.\n\n',
                },
              ],
            },
          },
        };
      });
      const deleteReleaseSpy = vi.fn(async () => undefined);

      const releaser: Releaser = {
        getReleaseByTag: () => Promise.reject('Not implemented'),
        createRelease: () => Promise.reject('Not implemented'),
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: finalizeReleaseSpy,
        allReleases: async function* () {
          throw new Error('Not implemented');
        },
        listReleaseAssets: () => Promise.reject('Not implemented'),
        deleteReleaseAsset: () => Promise.reject('Not implemented'),
        deleteRelease: deleteReleaseSpy,
        updateReleaseAsset: () => Promise.reject('Not implemented'),
        uploadReleaseAsset: () => Promise.reject('Not implemented'),
      };

      await expect(
        finalizeRelease(
          {
            ...config,
            input_draft: false,
          },
          releaser,
          draftRelease,
          true,
        ),
      ).rejects.toThrow(
        'Tag creation for v1.0.0 is blocked by repository rules. Deleted draft release 1 to avoid leaving an orphaned draft release.',
      );

      expect(finalizeReleaseSpy).toHaveBeenCalledTimes(1);
      expect(deleteReleaseSpy).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        release_id: draftRelease.id,
      });
    });

    it('does not delete an existing draft release when tag creation is blocked by repository rules', async () => {
      const finalizeReleaseSpy = vi.fn(async () => {
        throw {
          status: 422,
          response: {
            data: {
              errors: [
                {
                  field: 'pre_receive',
                  message:
                    'pre_receive Repository rule violations found\n\nCannot create ref due to creations being restricted.\n\n',
                },
              ],
            },
          },
        };
      });
      const deleteReleaseSpy = vi.fn(async () => undefined);

      const releaser: Releaser = {
        getReleaseByTag: () => Promise.reject('Not implemented'),
        createRelease: () => Promise.reject('Not implemented'),
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: finalizeReleaseSpy,
        allReleases: async function* () {
          throw new Error('Not implemented');
        },
        listReleaseAssets: () => Promise.reject('Not implemented'),
        deleteReleaseAsset: () => Promise.reject('Not implemented'),
        deleteRelease: deleteReleaseSpy,
        updateReleaseAsset: () => Promise.reject('Not implemented'),
        uploadReleaseAsset: () => Promise.reject('Not implemented'),
      };

      await expect(
        finalizeRelease(
          {
            ...config,
            input_draft: false,
          },
          releaser,
          draftRelease,
          false,
          1,
        ),
      ).rejects.toThrow('Too many retries.');

      expect(finalizeReleaseSpy).toHaveBeenCalledTimes(1);
      expect(deleteReleaseSpy).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('creates published prereleases without the forced draft-first path', async () => {
      const prereleaseConfig = {
        ...config,
        input_prerelease: true,
        input_draft: false,
      };
      const createdRelease: Release = {
        id: 1,
        upload_url: 'test',
        html_url: 'test',
        tag_name: 'v1.0.0',
        name: 'test',
        body: 'test',
        target_commitish: 'main',
        draft: false,
        prerelease: true,
        assets: [],
      };

      const createReleaseSpy = vi.fn(async () => ({ data: createdRelease }));
      const mockReleaser: Releaser = {
        getReleaseByTag: () => Promise.reject({ status: 404 }),
        createRelease: createReleaseSpy,
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: () => Promise.reject('Not implemented'),
        allReleases: async function* () {
          yield { data: [createdRelease] };
        },
        listReleaseAssets: () => Promise.reject('Not implemented'),
        deleteReleaseAsset: () => Promise.reject('Not implemented'),
        deleteRelease: () => Promise.reject('Not implemented'),
        updateReleaseAsset: () => Promise.reject('Not implemented'),
        uploadReleaseAsset: () => Promise.reject('Not implemented'),
      } as const;

      const result = await release(prereleaseConfig, mockReleaser, 1);

      assert.equal(result.release.id, createdRelease.id);
      assert.equal(result.created, true);
      expect(createReleaseSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          draft: false,
          prerelease: true,
        }),
      );
    });

    it('retries upload after deleting conflicting asset on 422 already_exists race', async () => {
      const uploadReleaseAsset = vi
        .fn()
        .mockRejectedValueOnce({
          status: 422,
          response: { data: { errors: [{ code: 'already_exists' }] } },
        })
        .mockResolvedValueOnce({
          status: 201,
          data: { id: 123, name: 'release.txt' },
        });

      const listReleaseAssets = vi.fn().mockResolvedValue([{ id: 99, name: 'release.txt' }]);
      const deleteReleaseAsset = vi.fn().mockResolvedValue(undefined);

      const mockReleaser: Releaser = {
        getReleaseByTag: () => Promise.reject('Not implemented'),
        createRelease: () => Promise.reject('Not implemented'),
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: () => Promise.reject('Not implemented'),
        allReleases: async function* () {
          throw new Error('Not implemented');
        },
        listReleaseAssets,
        deleteReleaseAsset,
        uploadReleaseAsset,
      };

      const result = await upload(
        config,
        mockReleaser,
        'https://uploads.github.com/repos/owner/repo/releases/1/assets',
        '__tests__/release.txt',
        [],
      );

      expect(result).toStrictEqual({ id: 123, name: 'release.txt' });
      expect(listReleaseAssets).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        release_id: 1,
      });
      expect(deleteReleaseAsset).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        asset_id: 99,
      });
      expect(uploadReleaseAsset).toHaveBeenCalledTimes(2);
    });

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
        finalizeRelease: () => Promise.reject('Not implemented'),
        allReleases: async function* () {
          yield { data: [existingRelease] };
        },
        listReleaseAssets: () => Promise.reject('Not implemented'),
        deleteReleaseAsset: () => Promise.reject('Not implemented'),
        deleteRelease: () => Promise.reject('Not implemented'),
        uploadReleaseAsset: () => Promise.reject('Not implemented'),
      } as const;

      const result = await release(config, mockReleaser, 2);
      assert.ok(result);
      assert.equal(result.release.id, 1);
      assert.equal(result.created, false);
    });

    it('reuses a canonical release after concurrent create success and removes empty duplicates', async () => {
      const canonicalRelease: Release = {
        id: 1,
        upload_url: 'canonical-upload',
        html_url: 'canonical-html',
        tag_name: 'v1.0.0',
        name: 'canonical',
        body: 'test',
        target_commitish: 'main',
        draft: true,
        prerelease: false,
        assets: [],
      };
      const duplicateRelease: Release = {
        id: 2,
        upload_url: 'duplicate-upload',
        html_url: 'duplicate-html',
        tag_name: 'v1.0.0',
        name: 'duplicate',
        body: 'test',
        target_commitish: 'main',
        draft: true,
        prerelease: false,
        assets: [],
      };

      let lookupCount = 0;
      const deleteReleaseSpy = vi.fn(async () => undefined);
      const mockReleaser: Releaser = {
        getReleaseByTag: () => {
          lookupCount += 1;
          if (lookupCount === 1) {
            return Promise.reject({ status: 404 });
          }
          return Promise.resolve({ data: canonicalRelease });
        },
        createRelease: () => Promise.resolve({ data: duplicateRelease }),
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: () => Promise.reject('Not implemented'),
        allReleases: async function* () {
          yield { data: [duplicateRelease, canonicalRelease] };
        },
        listReleaseAssets: () => Promise.reject('Not implemented'),
        deleteReleaseAsset: () => Promise.reject('Not implemented'),
        deleteRelease: deleteReleaseSpy,
        updateReleaseAsset: () => Promise.reject('Not implemented'),
        uploadReleaseAsset: () => Promise.reject('Not implemented'),
      };

      const result = await release(config, mockReleaser, 2);

      assert.equal(result.release.id, canonicalRelease.id);
      assert.equal(result.created, false);
      expect(deleteReleaseSpy).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        release_id: duplicateRelease.id,
      });
    });

    it('falls back to recent releases when tag lookup still lags after create', async () => {
      const canonicalRelease: Release = {
        id: 1,
        upload_url: 'canonical-upload',
        html_url: 'canonical-html',
        tag_name: 'v1.0.0',
        name: 'canonical',
        body: 'test',
        target_commitish: 'main',
        draft: true,
        prerelease: false,
        assets: [],
      };
      const duplicateRelease: Release = {
        id: 2,
        upload_url: 'duplicate-upload',
        html_url: 'duplicate-html',
        tag_name: 'v1.0.0',
        name: 'duplicate',
        body: 'test',
        target_commitish: 'main',
        draft: true,
        prerelease: false,
        assets: [],
      };

      const deleteReleaseSpy = vi.fn(async () => undefined);
      const mockReleaser: Releaser = {
        getReleaseByTag: () => Promise.reject({ status: 404 }),
        createRelease: () => Promise.resolve({ data: duplicateRelease }),
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: () => Promise.reject('Not implemented'),
        allReleases: async function* () {
          yield { data: [duplicateRelease, canonicalRelease] };
        },
        listReleaseAssets: () => Promise.reject('Not implemented'),
        deleteReleaseAsset: () => Promise.reject('Not implemented'),
        deleteRelease: deleteReleaseSpy,
        updateReleaseAsset: () => Promise.reject('Not implemented'),
        uploadReleaseAsset: () => Promise.reject('Not implemented'),
      };

      const result = await release(config, mockReleaser, 1);

      assert.equal(result.release.id, canonicalRelease.id);
      assert.equal(result.created, false);
      expect(deleteReleaseSpy).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        release_id: duplicateRelease.id,
      });
    });

    it('deletes the just-created duplicate draft even if recent release listing misses it', async () => {
      const canonicalRelease: Release = {
        id: 1,
        upload_url: 'canonical-upload',
        html_url: 'canonical-html',
        tag_name: 'v1.0.0',
        name: 'canonical',
        body: 'test',
        target_commitish: 'main',
        draft: true,
        prerelease: false,
        assets: [],
      };
      const duplicateRelease: Release = {
        id: 2,
        upload_url: 'duplicate-upload',
        html_url: 'duplicate-html',
        tag_name: 'v1.0.0',
        name: 'duplicate',
        body: 'test',
        target_commitish: 'main',
        draft: true,
        prerelease: false,
        assets: [],
      };

      let lookupCount = 0;
      const deleteReleaseSpy = vi.fn(async () => undefined);
      const mockReleaser: Releaser = {
        getReleaseByTag: () => {
          lookupCount += 1;
          if (lookupCount === 1) {
            return Promise.reject({ status: 404 });
          }
          return Promise.resolve({ data: canonicalRelease });
        },
        createRelease: () => Promise.resolve({ data: duplicateRelease }),
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: () => Promise.reject('Not implemented'),
        allReleases: async function* () {
          yield { data: [canonicalRelease] };
        },
        listReleaseAssets: () => Promise.reject('Not implemented'),
        deleteReleaseAsset: () => Promise.reject('Not implemented'),
        deleteRelease: deleteReleaseSpy,
        updateReleaseAsset: () => Promise.reject('Not implemented'),
        uploadReleaseAsset: () => Promise.reject('Not implemented'),
      };

      const result = await release(config, mockReleaser, 2);

      assert.equal(result.release.id, canonicalRelease.id);
      assert.equal(result.created, false);
      expect(deleteReleaseSpy).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        release_id: duplicateRelease.id,
      });
    });
  });

  describe('upload', () => {
    it('restores a dotfile label when GitHub normalizes the uploaded asset name', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'gh-release-dotfile-'));
      const dotfilePath = join(tempDir, '.config');
      writeFileSync(dotfilePath, 'config');

      const updateReleaseAssetSpy = vi.fn(async () => ({
        data: {
          id: 1,
          name: 'default.config',
          label: '.config',
        },
      }));
      const releaser: Releaser = {
        getReleaseByTag: () => Promise.reject('Not implemented'),
        createRelease: () => Promise.reject('Not implemented'),
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: () => Promise.reject('Not implemented'),
        allReleases: async function* () {
          throw new Error('Not implemented');
        },
        listReleaseAssets: () => Promise.reject('Not implemented'),
        deleteReleaseAsset: () => Promise.reject('Not implemented'),
        deleteRelease: () => Promise.reject('Not implemented'),
        updateReleaseAsset: updateReleaseAssetSpy,
        uploadReleaseAsset: () =>
          Promise.resolve({
            status: 201,
            data: {
              id: 1,
              name: 'default.config',
              label: '',
            },
          }),
      };

      try {
        const result = await upload(
          config,
          releaser,
          'https://uploads.example.test/assets',
          dotfilePath,
          [],
        );

        expect(updateReleaseAssetSpy).toHaveBeenCalledWith({
          owner: 'owner',
          repo: 'repo',
          asset_id: 1,
          name: 'default.config',
          label: '.config',
        });
        expect(result).toEqual({
          id: 1,
          name: 'default.config',
          label: '.config',
        });
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('matches an existing asset by label when overwriting a dotfile', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'gh-release-dotfile-'));
      const dotfilePath = join(tempDir, '.config');
      writeFileSync(dotfilePath, 'config');

      const deleteReleaseAssetSpy = vi.fn(async () => undefined);
      const releaser: Releaser = {
        getReleaseByTag: () => Promise.reject('Not implemented'),
        createRelease: () => Promise.reject('Not implemented'),
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: () => Promise.reject('Not implemented'),
        allReleases: async function* () {
          throw new Error('Not implemented');
        },
        listReleaseAssets: () => Promise.reject('Not implemented'),
        deleteReleaseAsset: deleteReleaseAssetSpy,
        deleteRelease: () => Promise.reject('Not implemented'),
        updateReleaseAsset: () =>
          Promise.resolve({
            data: {
              id: 2,
              name: 'default.config',
              label: '.config',
            },
          }),
        uploadReleaseAsset: () =>
          Promise.resolve({
            status: 201,
            data: {
              id: 2,
              name: 'default.config',
              label: '',
            },
          }),
      };

      try {
        await upload(config, releaser, 'https://uploads.example.test/assets', dotfilePath, [
          {
            id: 1,
            name: 'default.config',
            label: '.config',
          },
        ]);

        expect(deleteReleaseAssetSpy).toHaveBeenCalledWith({
          asset_id: 1,
          owner: 'owner',
          repo: 'repo',
        });
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
