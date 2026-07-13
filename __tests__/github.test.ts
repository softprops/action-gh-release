import {
  asset,
  findTagFromReleases,
  finalizeRelease,
  GitHubReleaser,
  listReleaseAssets,
  mimeOrDefault,
  release,
  Release,
  Releaser,
  upload,
} from '../src/github';

import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, assert, describe, expect, it, vi } from 'vitest';

const unexpected = (method: string) =>
  vi.fn().mockRejectedValue(new Error(`Unexpected ${method} call`));

const createReleaser = (overrides: Partial<Releaser> = {}): Releaser => ({
  getReleaseByTag: unexpected('getReleaseByTag'),
  createRelease: unexpected('createRelease'),
  updateRelease: unexpected('updateRelease'),
  finalizeRelease: unexpected('finalizeRelease'),
  allReleases: async function* () {
    throw new Error('Unexpected allReleases call');
  },
  listReleaseAssets: unexpected('listReleaseAssets'),
  deleteReleaseAsset: unexpected('deleteReleaseAsset'),
  deleteRelease: unexpected('deleteRelease'),
  updateReleaseAsset: unexpected('updateReleaseAsset'),
  uploadReleaseAsset: unexpected('uploadReleaseAsset'),
  ...overrides,
});

describe('github', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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
    input_previous_tag: undefined,
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

    it('falls back to paginated releases when the direct lookup cannot see a draft', async () => {
      const draftRelease = { ...mockRelease, draft: true };
      const pageAfterMatch = vi.fn();
      const releaser = {
        ...mockReleaser,
        allReleases: async function* () {
          yield { data: [{ ...mockRelease, tag_name: 'other' }] };
          yield { data: [draftRelease] };
          pageAfterMatch();
          yield { data: [] };
        },
      };

      const result = await findTagFromReleases(releaser, owner, repo, draftRelease.tag_name);

      assert.strictEqual(result, draftRelease);
      expect(pageAfterMatch).not.toHaveBeenCalled();
    });

    it('does not exhaust pagination while checking a brand-new tag', async () => {
      let pagesRead = 0;
      const releaser = {
        ...mockReleaser,
        allReleases: async function* () {
          pagesRead += 1;
          yield { data: [] };
          pagesRead += 1;
          yield { data: [] };
          throw new Error('Only the first 10000 results are available');
        },
      };

      const result = await findTagFromReleases(releaser, owner, repo, 'brand-new-tag');

      expect(result).toBeUndefined();
      expect(pagesRead).toBe(2);
    });

    it('selects the canonical draft without deleting a pre-existing duplicate', async () => {
      const canonicalDraft: Release = {
        ...mockRelease,
        id: 1,
        draft: true,
        assets: [{ id: 99, name: 'existing.zip' }],
      };
      const duplicateDraft: Release = {
        ...canonicalDraft,
        id: 2,
        name: 'manually authored draft',
        body: 'notes that must not be deleted',
        assets: [],
      };
      const deleteRelease = vi.fn().mockResolvedValue(undefined);
      const releaser = {
        ...mockReleaser,
        allReleases: async function* () {
          yield { data: [duplicateDraft, canonicalDraft] };
        },
        deleteRelease,
      };

      const result = await findTagFromReleases(releaser, owner, repo, canonicalDraft.tag_name);

      expect(result).toBe(canonicalDraft);
      expect(deleteRelease).not.toHaveBeenCalled();
    });

    it('retries draft discovery when GitHub release listing is briefly stale', async () => {
      vi.useFakeTimers();
      const draftRelease = { ...mockRelease, draft: true };
      let listingAttempt = 0;
      const releaser = {
        ...mockReleaser,
        allReleases: async function* () {
          listingAttempt += 1;
          yield { data: listingAttempt === 1 ? [] : [draftRelease] };
        },
      };

      const resultPromise = findTagFromReleases(releaser, owner, repo, draftRelease.tag_name, 2);
      await vi.advanceTimersByTimeAsync(1000);

      await expect(resultPromise).resolves.toBe(draftRelease);
      expect(listingAttempt).toBe(2);
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

    it('re-throws errors from the draft listing fallback', async () => {
      const listingError = new Error('release listing failed');
      const releaser = {
        ...mockReleaser,
        allReleases: async function* () {
          throw listingError;
        },
      };

      await expect(findTagFromReleases(releaser, owner, repo, 'v1.0.0')).rejects.toBe(listingError);
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

  describe('listReleaseAssets', () => {
    const releaseToInspect: Release = {
      id: 42,
      upload_url: 'https://uploads.example.test/releases/42/assets',
      html_url: 'https://example.test/releases/42',
      tag_name: 'v1.0.0',
      name: 'v1.0.0',
      target_commitish: 'main',
      draft: false,
      prerelease: false,
      assets: [],
    };

    it('returns assets with the repository and release parameters', async () => {
      const assets = [{ id: 7, name: 'action.zip' }];
      const listReleaseAssetsSpy = vi.fn().mockResolvedValue(assets);
      const releaser = createReleaser({ listReleaseAssets: listReleaseAssetsSpy });

      await expect(listReleaseAssets(config, releaser, releaseToInspect)).resolves.toBe(assets);
      expect(listReleaseAssetsSpy).toHaveBeenCalledOnce();
      expect(listReleaseAssetsSpy).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        release_id: 42,
      });
    });

    it('retries a transient failure and then succeeds', async () => {
      const assets = [{ id: 7, name: 'action.zip' }];
      const listReleaseAssetsSpy = vi
        .fn()
        .mockRejectedValueOnce(new Error('temporary failure'))
        .mockResolvedValueOnce(assets);
      const releaser = createReleaser({ listReleaseAssets: listReleaseAssetsSpy });

      await expect(listReleaseAssets(config, releaser, releaseToInspect, 2)).resolves.toBe(assets);
      expect(listReleaseAssetsSpy).toHaveBeenCalledTimes(2);
    });

    it('stops after exhausting the configured attempts', async () => {
      const listReleaseAssetsSpy = vi.fn().mockRejectedValue(new Error('persistent failure'));
      const releaser = createReleaser({ listReleaseAssets: listReleaseAssetsSpy });

      await expect(listReleaseAssets(config, releaser, releaseToInspect, 2)).rejects.toThrow(
        'Too many retries.',
      );
      expect(listReleaseAssetsSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('GitHubReleaser', () => {
    it('passes previous_tag_name to generateReleaseNotes and strips it from createRelease', async () => {
      const generateReleaseNotes = vi.fn(async () => ({
        data: {
          name: 'Generated release',
          body: "## What's Changed\n* Added support for previous_tag",
        },
      }));
      const createRelease = vi.fn(async (params) => ({
        data: {
          id: 1,
          upload_url: 'test',
          html_url: 'test',
          tag_name: params.tag_name,
          name: params.name,
          body: params.body,
          target_commitish: params.target_commitish || 'main',
          draft: params.draft ?? false,
          prerelease: params.prerelease ?? false,
          assets: [],
        },
      }));

      const releaser = new GitHubReleaser({
        rest: {
          repos: {
            generateReleaseNotes,
            createRelease,
            updateRelease: vi.fn(),
            getReleaseByTag: vi.fn(),
            listReleaseAssets: vi.fn(),
            deleteReleaseAsset: vi.fn(),
            deleteRelease: vi.fn(),
            updateReleaseAsset: vi.fn(),
            listReleases: {
              endpoint: {
                merge: vi.fn(),
              },
            },
          },
        },
        paginate: {
          iterator: vi.fn(),
        },
        request: vi.fn(),
      } as any);

      await releaser.createRelease({
        owner: 'owner',
        repo: 'repo',
        tag_name: 'v1.0.0',
        name: 'v1.0.0',
        body: 'Intro',
        draft: false,
        prerelease: false,
        target_commitish: 'abc123',
        discussion_category_name: undefined,
        generate_release_notes: true,
        make_latest: undefined,
        previous_tag_name: 'v0.9.0',
      });

      expect(generateReleaseNotes).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        tag_name: 'v1.0.0',
        target_commitish: 'abc123',
        previous_tag_name: 'v0.9.0',
      });
      expect(createRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          tag_name: 'v1.0.0',
          body: "Intro\n\n## What's Changed\n* Added support for previous_tag",
          generate_release_notes: false,
        }),
      );
      expect(createRelease.mock.calls[0][0]).not.toHaveProperty('previous_tag_name');
    });

    it('passes discussion_category_name when finalizing a release', async () => {
      const updateRelease = vi.fn(async () => ({
        data: {
          id: 1,
          upload_url: 'test',
          html_url: 'test',
          tag_name: 'v1.0.0',
          name: 'v1.0.0',
          body: 'test',
          target_commitish: 'main',
          draft: false,
          prerelease: false,
          assets: [],
        },
      }));

      const releaser = new GitHubReleaser({
        rest: {
          repos: {
            generateReleaseNotes: vi.fn(),
            createRelease: vi.fn(),
            updateRelease,
            getReleaseByTag: vi.fn(),
            listReleaseAssets: vi.fn(),
            deleteReleaseAsset: vi.fn(),
            deleteRelease: vi.fn(),
            updateReleaseAsset: vi.fn(),
            listReleases: {
              endpoint: {
                merge: vi.fn(),
              },
            },
          },
        },
        paginate: {
          iterator: vi.fn(),
        },
        request: vi.fn(),
      } as any);

      await releaser.finalizeRelease({
        owner: 'owner',
        repo: 'repo',
        release_id: 1,
        make_latest: 'legacy',
        discussion_category_name: 'Announcements',
      });

      expect(updateRelease).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        release_id: 1,
        draft: false,
        make_latest: 'legacy',
        discussion_category_name: 'Announcements',
      });
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
          make_latest: undefined,
          discussion_category_name: undefined,
        });
      }
    });

    it('passes discussion_category_name through when finalizing a draft release', async () => {
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

      await finalizeRelease(
        {
          ...config,
          input_draft: false,
          input_discussion_category_name: 'Announcements',
        },
        releaser,
        draftRelease,
      );

      expect(finalizeReleaseSpy).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        release_id: draftRelease.id,
        make_latest: undefined,
        discussion_category_name: 'Announcements',
      });
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
    it('reports a useful create error without assuming response data exists', async () => {
      const releaseError = {
        status: 403,
        message: 'Resource not accessible by integration',
      };
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const releaser = createReleaser({
        getReleaseByTag: vi.fn().mockRejectedValue({ status: 404 }),
        createRelease: vi.fn().mockRejectedValue(releaseError),
        allReleases: async function* () {
          yield { data: [] };
        },
      });

      await expect(release(config, releaser, 1)).rejects.toBe(releaseError);
      expect(log).toHaveBeenCalledWith('⚠️ GitHub release failed with status: 403');
      expect(log).toHaveBeenCalledWith('Resource not accessible by integration');
      expect(log).not.toHaveBeenCalledWith('undefined');
    });

    it('passes previous_tag_name through when creating a release with generated notes', async () => {
      const createReleaseSpy = vi.fn(async () => ({
        data: {
          id: 1,
          upload_url: 'test',
          html_url: 'test',
          tag_name: 'v1.0.0',
          name: 'test',
          body: 'generated notes',
          target_commitish: 'main',
          draft: true,
          prerelease: false,
          assets: [],
        },
      }));

      await release(
        {
          ...config,
          input_generate_release_notes: true,
          input_previous_tag: 'v0.9.0',
        },
        {
          getReleaseByTag: () => Promise.reject({ status: 404 }),
          createRelease: createReleaseSpy,
          updateRelease: () => Promise.reject('Not implemented'),
          finalizeRelease: () => Promise.reject('Not implemented'),
          allReleases: async function* () {
            yield { data: [] };
          },
          listReleaseAssets: () => Promise.reject('Not implemented'),
          deleteReleaseAsset: () => Promise.reject('Not implemented'),
          deleteRelease: () => Promise.reject('Not implemented'),
          updateReleaseAsset: () => Promise.reject('Not implemented'),
          uploadReleaseAsset: () => Promise.reject('Not implemented'),
        },
        1,
      );

      expect(createReleaseSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tag_name: 'v1.0.0',
          generate_release_notes: true,
          previous_tag_name: 'v0.9.0',
        }),
      );
    });

    it('passes previous_tag_name through when updating a release with generated notes', async () => {
      const existingRelease: Release = {
        id: 1,
        upload_url: 'test',
        html_url: 'test',
        tag_name: 'v1.0.0',
        name: 'test',
        body: 'existing body',
        target_commitish: 'main',
        draft: false,
        prerelease: false,
        assets: [],
      };
      const updateReleaseSpy = vi.fn(async () => ({ data: existingRelease }));

      await release(
        {
          ...config,
          input_generate_release_notes: true,
          input_previous_tag: 'v0.9.0',
        },
        {
          getReleaseByTag: () => Promise.resolve({ data: existingRelease }),
          createRelease: () => Promise.reject('Not implemented'),
          updateRelease: updateReleaseSpy,
          finalizeRelease: () => Promise.reject('Not implemented'),
          allReleases: async function* () {
            yield { data: [existingRelease] };
          },
          listReleaseAssets: () => Promise.reject('Not implemented'),
          deleteReleaseAsset: () => Promise.reject('Not implemented'),
          deleteRelease: () => Promise.reject('Not implemented'),
          updateReleaseAsset: () => Promise.reject('Not implemented'),
          uploadReleaseAsset: () => Promise.reject('Not implemented'),
        },
        1,
      );

      expect(updateReleaseSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          release_id: existingRelease.id,
          generate_release_notes: true,
          previous_tag_name: 'v0.9.0',
        }),
      );
    });

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

      let created = false;
      const createReleaseSpy = vi.fn(async () => {
        created = true;
        return { data: createdRelease };
      });
      const mockReleaser: Releaser = {
        getReleaseByTag: () => Promise.reject({ status: 404 }),
        createRelease: createReleaseSpy,
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: () => Promise.reject('Not implemented'),
        allReleases: async function* () {
          yield { data: created ? [createdRelease] : [] };
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

    it.each([
      ['an omitted draft input', undefined],
      ['a null-expression draft input', undefined],
      ['an explicit false draft input', false],
      ['an explicit true draft input', true],
    ])('reuses an existing draft for %s', async (_name, input_draft) => {
      const existingDraft: Release = {
        id: 17,
        upload_url: 'draft-upload',
        html_url: 'draft-html',
        tag_name: 'v1.0.0',
        name: 'draft release',
        body: 'draft body',
        target_commitish: 'main',
        draft: true,
        prerelease: false,
        assets: [],
      };
      const updatedDraft = { ...existingDraft, prerelease: true };
      const updateRelease = vi.fn().mockResolvedValue({ data: updatedDraft });
      const createRelease = unexpected('createRelease');
      const deleteRelease = unexpected('deleteRelease');
      const releaser = createReleaser({
        getReleaseByTag: vi.fn().mockRejectedValue({ status: 404 }),
        allReleases: async function* () {
          yield { data: [existingDraft] };
        },
        createRelease,
        updateRelease,
        deleteRelease,
      });

      const result = await release(
        {
          ...config,
          input_draft,
          input_prerelease: true,
        },
        releaser,
      );

      expect(result).toEqual({ release: updatedDraft, created: false });
      expect(updateRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          release_id: existingDraft.id,
          draft: true,
          prerelease: true,
        }),
      );
      expect(createRelease).not.toHaveBeenCalled();
      expect(deleteRelease).not.toHaveBeenCalled();
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

    it('surfaces an actionable immutable-release error for prerelease uploads', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'gh-release-immutable-'));
      const assetPath = join(tempDir, 'draft-false.txt');
      writeFileSync(assetPath, 'hello');

      const uploadReleaseAsset = vi.fn().mockRejectedValue({
        status: 422,
        response: {
          data: {
            message: 'Cannot upload assets to an immutable release.',
          },
        },
      });

      const mockReleaser: Releaser = {
        getReleaseByTag: () => Promise.reject('Not implemented'),
        createRelease: () => Promise.reject('Not implemented'),
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: () => Promise.reject('Not implemented'),
        allReleases: async function* () {
          throw new Error('Not implemented');
        },
        listReleaseAssets: () => Promise.resolve([]),
        deleteReleaseAsset: () => Promise.reject('Not implemented'),
        deleteRelease: () => Promise.reject('Not implemented'),
        updateReleaseAsset: () => Promise.reject('Not implemented'),
        uploadReleaseAsset,
      };

      await expect(
        upload(
          {
            ...config,
            input_prerelease: true,
          },
          mockReleaser,
          'https://uploads.github.com/repos/owner/repo/releases/1/assets',
          assetPath,
          [],
        ),
      ).rejects.toThrow(
        'Cannot upload asset draft-false.txt to an immutable release. GitHub only allows asset uploads before a release is published, but draft prereleases publish with the release.published event instead of release.prereleased.',
      );

      rmSync(tempDir, { recursive: true, force: true });
    });

    it('retries upload after deleting a conflicting renamed asset matched by label', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'gh-release-race-dotfile-'));
      const dotfilePath = join(tempDir, '.config');
      writeFileSync(dotfilePath, 'config');

      const uploadReleaseAsset = vi
        .fn()
        .mockRejectedValueOnce({
          status: 422,
          response: { data: { errors: [{ code: 'already_exists' }] } },
        })
        .mockResolvedValueOnce({
          status: 201,
          data: { id: 123, name: 'default.config', label: '.config' },
        });

      const listReleaseAssets = vi
        .fn()
        .mockResolvedValue([{ id: 99, name: 'default.config', label: '.config' }]);
      const deleteReleaseAsset = vi.fn().mockResolvedValue(undefined);
      const updateReleaseAsset = vi.fn().mockResolvedValue({
        data: { id: 123, name: 'default.config', label: '.config' },
      });

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
        deleteRelease: () => Promise.reject('Not implemented'),
        updateReleaseAsset,
        uploadReleaseAsset,
      };

      try {
        const result = await upload(
          config,
          mockReleaser,
          'https://uploads.github.com/repos/owner/repo/releases/1/assets',
          dotfilePath,
          [],
        );

        expect(result).toStrictEqual({ id: 123, name: 'default.config', label: '.config' });
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
        expect(updateReleaseAsset).toHaveBeenCalledWith({
          owner: 'owner',
          repo: 'repo',
          asset_id: 123,
          name: 'default.config',
          label: '.config',
        });
        expect(uploadReleaseAsset).toHaveBeenCalledTimes(2);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('handles 422 already_exists error gracefully', async () => {
      vi.useFakeTimers();
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
          yield { data: createAttempts > 0 ? [existingRelease] : [] };
        },
        listReleaseAssets: () => Promise.reject('Not implemented'),
        deleteReleaseAsset: () => Promise.reject('Not implemented'),
        deleteRelease: () => Promise.reject('Not implemented'),
        uploadReleaseAsset: () => Promise.reject('Not implemented'),
      } as const;

      const resultPromise = release(config, mockReleaser, 2);
      await vi.advanceTimersByTimeAsync(1000);
      const result = await resultPromise;
      assert.ok(result);
      assert.equal(result.release.id, 1);
      assert.equal(result.created, false);
    });

    it('normalizes refs/tags-prefixed input_tag_name values before reusing an existing release', async () => {
      const existingRelease: Release = {
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

      const updateReleaseSpy = vi.fn(async () => ({ data: existingRelease }));
      const getReleaseByTagSpy = vi.fn(async () => ({ data: existingRelease }));
      const result = await release(
        {
          ...config,
          input_tag_name: 'refs/tags/v1.0.0',
        },
        {
          getReleaseByTag: getReleaseByTagSpy,
          createRelease: () => Promise.reject('Not implemented'),
          updateRelease: updateReleaseSpy,
          finalizeRelease: () => Promise.reject('Not implemented'),
          allReleases: async function* () {
            yield { data: [existingRelease] };
          },
          listReleaseAssets: () => Promise.reject('Not implemented'),
          deleteReleaseAsset: () => Promise.reject('Not implemented'),
          deleteRelease: () => Promise.reject('Not implemented'),
          updateReleaseAsset: () => Promise.reject('Not implemented'),
          uploadReleaseAsset: () => Promise.reject('Not implemented'),
        },
        1,
      );

      expect(getReleaseByTagSpy).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        tag: 'v1.0.0',
      });
      expect(updateReleaseSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tag_name: 'v1.0.0',
        }),
      );
      assert.equal(result.release.id, existingRelease.id);
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
        createRelease: () => {
          lookupCount += 1;
          return Promise.resolve({ data: duplicateRelease });
        },
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: () => Promise.reject('Not implemented'),
        allReleases: async function* () {
          yield { data: lookupCount > 1 ? [duplicateRelease, canonicalRelease] : [] };
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

    it('does not delete a pre-existing draft while canonicalizing its own create', async () => {
      const createdRelease: Release = {
        id: 1,
        upload_url: 'created-upload',
        html_url: 'created-html',
        tag_name: 'v1.0.0',
        name: 'created release',
        body: 'created body',
        target_commitish: 'main',
        draft: true,
        prerelease: false,
        assets: [],
      };
      const manualDraft: Release = {
        ...createdRelease,
        id: 2,
        name: 'manually authored draft',
        body: 'notes that must not be deleted',
      };
      let created = false;
      const deleteRelease = vi.fn().mockResolvedValue(undefined);
      const releaser = createReleaser({
        getReleaseByTag: vi.fn(() =>
          created ? Promise.resolve({ data: createdRelease }) : Promise.reject({ status: 404 }),
        ),
        createRelease: vi.fn(async () => {
          created = true;
          return { data: createdRelease };
        }),
        allReleases: async function* () {
          yield { data: created ? [createdRelease, manualDraft] : [] };
        },
        deleteRelease,
      });

      const result = await release(config, releaser, 1);

      expect(result).toEqual({ release: createdRelease, created: true });
      expect(deleteRelease).not.toHaveBeenCalled();
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

      let created = false;
      const deleteReleaseSpy = vi.fn(async () => undefined);
      const mockReleaser: Releaser = {
        getReleaseByTag: () => Promise.reject({ status: 404 }),
        createRelease: () => {
          created = true;
          return Promise.resolve({ data: duplicateRelease });
        },
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: () => Promise.reject('Not implemented'),
        allReleases: async function* () {
          yield { data: created ? [duplicateRelease, canonicalRelease] : [] };
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

    it.each([
      ['gains assets', { assets: [{ id: 9, name: 'concurrent.zip' }] }],
      ['is published', { draft: false }],
    ])('does not delete its created release when it %s concurrently', async (_name, patch) => {
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
      const createdRelease: Release = {
        ...canonicalRelease,
        id: 2,
        name: 'created duplicate',
      };
      const refreshedCreatedRelease: Release = { ...createdRelease, ...patch };
      const releaseByTag = refreshedCreatedRelease.draft
        ? canonicalRelease
        : refreshedCreatedRelease;
      let created = false;
      const deleteRelease = vi.fn().mockResolvedValue(undefined);
      const releaser = createReleaser({
        getReleaseByTag: vi.fn(() =>
          created ? Promise.resolve({ data: releaseByTag }) : Promise.reject({ status: 404 }),
        ),
        createRelease: vi.fn(async () => {
          created = true;
          return { data: createdRelease };
        }),
        allReleases: async function* () {
          yield {
            data: created ? [refreshedCreatedRelease, canonicalRelease] : [],
          };
        },
        deleteRelease,
      });

      const result = await release(config, releaser, 1);

      expect(result).toEqual({
        release: releaseByTag,
        created: releaseByTag.id === createdRelease.id,
      });
      expect(deleteRelease).not.toHaveBeenCalled();
    });

    it('does not delete the just-created duplicate when refreshed state is unavailable', async () => {
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
        createRelease: () => {
          lookupCount += 1;
          return Promise.resolve({ data: duplicateRelease });
        },
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: () => Promise.reject('Not implemented'),
        allReleases: async function* () {
          yield { data: lookupCount > 1 ? [canonicalRelease] : [] };
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
      expect(deleteReleaseSpy).not.toHaveBeenCalled();
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

    it('refreshes release assets when the uploaded renamed asset is not immediately patchable', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'gh-release-dotfile-'));
      const dotfilePath = join(tempDir, '.config');
      writeFileSync(dotfilePath, 'config');

      const updateReleaseAssetSpy = vi
        .fn()
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce({
          data: {
            id: 2,
            name: 'default.config',
            label: '.config',
          },
        });
      const listReleaseAssetsSpy = vi.fn().mockResolvedValue([
        {
          id: 2,
          name: 'default.config',
          label: '',
        },
      ]);
      const releaser: Releaser = {
        getReleaseByTag: () => Promise.reject('Not implemented'),
        createRelease: () => Promise.reject('Not implemented'),
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: () => Promise.reject('Not implemented'),
        allReleases: async function* () {
          throw new Error('Not implemented');
        },
        listReleaseAssets: listReleaseAssetsSpy,
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
          'https://uploads.github.com/repos/owner/repo/releases/1/assets',
          dotfilePath,
          [],
        );

        expect(updateReleaseAssetSpy).toHaveBeenNthCalledWith(1, {
          owner: 'owner',
          repo: 'repo',
          asset_id: 1,
          name: 'default.config',
          label: '.config',
        });
        expect(listReleaseAssetsSpy).toHaveBeenCalledWith({
          owner: 'owner',
          repo: 'repo',
          release_id: 1,
        });
        expect(updateReleaseAssetSpy).toHaveBeenNthCalledWith(2, {
          owner: 'owner',
          repo: 'repo',
          asset_id: 2,
          name: 'default.config',
          label: '.config',
        });
        expect(result).toEqual({
          id: 2,
          name: 'default.config',
          label: '.config',
        });
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('treats update-a-release-asset 404 as success when a matching asset is present after refresh', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'gh-release-dotfile-'));
      const dotfilePath = join(tempDir, '.config');
      writeFileSync(dotfilePath, 'config');

      const listReleaseAssetsSpy = vi.fn().mockResolvedValue([
        {
          id: 2,
          name: 'default.config',
          label: '.config',
        },
      ]);
      const releaser: Releaser = {
        getReleaseByTag: () => Promise.reject('Not implemented'),
        createRelease: () => Promise.reject('Not implemented'),
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: () => Promise.reject('Not implemented'),
        allReleases: async function* () {
          throw new Error('Not implemented');
        },
        listReleaseAssets: listReleaseAssetsSpy,
        deleteReleaseAsset: () => Promise.reject('Not implemented'),
        deleteRelease: () => Promise.reject('Not implemented'),
        updateReleaseAsset: () => Promise.reject('Not implemented'),
        uploadReleaseAsset: () =>
          Promise.reject({
            status: 404,
            message:
              'Not Found - https://docs.github.com/rest/releases/assets#update-a-release-asset',
          }),
      };

      try {
        const result = await upload(
          config,
          releaser,
          'https://uploads.github.com/repos/owner/repo/releases/1/assets',
          dotfilePath,
          [],
        );

        expect(listReleaseAssetsSpy).toHaveBeenCalledWith({
          owner: 'owner',
          repo: 'repo',
          release_id: 1,
        });
        expect(result).toEqual({
          id: 2,
          name: 'default.config',
          label: '.config',
        });
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('treats upload-endpoint 404s as release asset metadata failures when the docs link matches', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'gh-release-dotfile-'));
      const dotfilePath = join(tempDir, '.config');
      writeFileSync(dotfilePath, 'config');

      const listReleaseAssetsSpy = vi.fn().mockResolvedValue([
        {
          id: 2,
          name: 'default.config',
          label: '.config',
        },
      ]);
      const releaser: Releaser = {
        getReleaseByTag: () => Promise.reject('Not implemented'),
        createRelease: () => Promise.reject('Not implemented'),
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: () => Promise.reject('Not implemented'),
        allReleases: async function* () {
          throw new Error('Not implemented');
        },
        listReleaseAssets: listReleaseAssetsSpy,
        deleteReleaseAsset: () => Promise.reject('Not implemented'),
        deleteRelease: () => Promise.reject('Not implemented'),
        updateReleaseAsset: () => Promise.reject('Not implemented'),
        uploadReleaseAsset: () =>
          Promise.reject({
            status: 404,
            message:
              'Not Found - https://docs.github.com/rest/releases/assets#update-a-release-asset',
            request: {
              url: 'https://uploads.github.com/repos/owner/repo/releases/1/assets?name=.config',
            },
          }),
      };

      try {
        const result = await upload(
          config,
          releaser,
          'https://uploads.github.com/repos/owner/repo/releases/1/assets',
          dotfilePath,
          [],
        );

        expect(listReleaseAssetsSpy).toHaveBeenCalledWith({
          owner: 'owner',
          repo: 'repo',
          release_id: 1,
        });
        expect(result).toEqual({
          id: 2,
          name: 'default.config',
          label: '.config',
        });
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('polls for a matching asset after update-a-release-asset 404 before failing', async () => {
      vi.useFakeTimers();
      const tempDir = mkdtempSync(join(tmpdir(), 'gh-release-dotfile-'));
      const dotfilePath = join(tempDir, '.config');
      writeFileSync(dotfilePath, 'config');

      const listReleaseAssetsSpy = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 2,
            name: 'default.config',
            label: '.config',
          },
        ]);
      const releaser: Releaser = {
        getReleaseByTag: () => Promise.reject('Not implemented'),
        createRelease: () => Promise.reject('Not implemented'),
        updateRelease: () => Promise.reject('Not implemented'),
        finalizeRelease: () => Promise.reject('Not implemented'),
        allReleases: async function* () {
          throw new Error('Not implemented');
        },
        listReleaseAssets: listReleaseAssetsSpy,
        deleteReleaseAsset: () => Promise.reject('Not implemented'),
        deleteRelease: () => Promise.reject('Not implemented'),
        updateReleaseAsset: () => Promise.reject('Not implemented'),
        uploadReleaseAsset: () =>
          Promise.reject({
            status: 404,
            message:
              'Not Found - https://docs.github.com/rest/releases/assets#update-a-release-asset',
          }),
      };

      try {
        const resultPromise = upload(
          config,
          releaser,
          'https://uploads.github.com/repos/owner/repo/releases/1/assets',
          dotfilePath,
          [],
        );

        await vi.waitFor(() => expect(listReleaseAssetsSpy).toHaveBeenCalledTimes(1));
        await vi.advanceTimersByTimeAsync(1000);

        const result = await resultPromise;

        expect(listReleaseAssetsSpy).toHaveBeenCalledTimes(2);
        expect(result).toEqual({
          id: 2,
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
