import type { Config } from '../src/util';
import type { Release } from '../src/github';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setFailed: vi.fn(),
  setOutput: vi.fn(),
  getOctokit: vi.fn(),
  GitHubReleaser: vi.fn(function () {
    return mocks.releaser;
  }),
  releaser: { name: 'releaser' },
  release: vi.fn(),
  finalizeRelease: vi.fn(),
  upload: vi.fn(),
  listReleaseAssets: vi.fn(),
  parseConfig: vi.fn(),
  isTag: vi.fn(),
  paths: vi.fn(),
  unmatchedPatterns: vi.fn(),
  uploadUrl: vi.fn(),
}));

vi.mock('@actions/core', () => ({
  setFailed: mocks.setFailed,
  setOutput: mocks.setOutput,
}));

vi.mock('@actions/github', () => ({ getOctokit: mocks.getOctokit }));

vi.mock('../src/github', () => ({
  GitHubReleaser: mocks.GitHubReleaser,
  release: mocks.release,
  finalizeRelease: mocks.finalizeRelease,
  upload: mocks.upload,
  listReleaseAssets: mocks.listReleaseAssets,
}));

vi.mock('../src/util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/util')>();
  return {
    ...actual,
    parseConfig: mocks.parseConfig,
    isTag: mocks.isTag,
    paths: mocks.paths,
    unmatchedPatterns: mocks.unmatchedPatterns,
    uploadUrl: mocks.uploadUrl,
  };
});

import { run } from '../src/run';

const baseConfig: Config = {
  github_token: 'token',
  github_ref: 'refs/tags/v1.0.0',
  github_repository: 'owner/repo',
  input_files: [],
  input_draft: false,
  input_prerelease: false,
  input_preserve_order: false,
  input_overwrite_files: true,
  input_fail_on_unmatched_files: false,
  input_generate_release_notes: false,
  input_append_body: false,
  input_make_latest: undefined,
};

const initialRelease: Release = {
  id: 41,
  upload_url: 'https://uploads.example.test/releases/41/assets{?name,label}',
  html_url: 'https://example.test/releases/41',
  tag_name: 'v1.0.0',
  name: 'v1.0.0',
  target_commitish: 'main',
  draft: true,
  prerelease: false,
  assets: [{ id: 1, name: 'existing.zip' }],
};

const finalizedRelease: Release = {
  ...initialRelease,
  id: 42,
  upload_url: 'https://uploads.example.test/releases/42/assets{?name,label}',
  html_url: 'https://example.test/releases/42',
  draft: false,
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('run', () => {
  let config: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    config = { ...baseConfig };
    mocks.parseConfig.mockImplementation(() => config);
    mocks.isTag.mockImplementation((ref: string) => ref.startsWith('refs/tags/'));
    mocks.unmatchedPatterns.mockReturnValue([]);
    mocks.paths.mockReturnValue([]);
    mocks.uploadUrl.mockImplementation((url: string) => url.split('{')[0]);
    mocks.getOctokit.mockReturnValue({ name: 'octokit' });
    mocks.release.mockResolvedValue({ release: initialRelease, created: true });
    mocks.finalizeRelease.mockResolvedValue(finalizedRelease);
    mocks.upload.mockResolvedValue(undefined);
    mocks.listReleaseAssets.mockResolvedValue([]);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['an explicit tag', { github_ref: 'refs/heads/main', input_tag_name: 'v1.0.0' }],
    ['a tag ref', { github_ref: 'refs/tags/v1.0.0', input_tag_name: undefined }],
    [
      'a draft without a tag',
      { github_ref: 'refs/heads/main', input_tag_name: undefined, input_draft: true },
    ],
  ])('accepts %s', async (_name, patch) => {
    config = { ...config, ...patch };

    await run();

    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.setFailed).not.toHaveBeenCalled();
  });

  it('reports the documented tag requirement for a non-tag ref', async () => {
    config = { ...config, github_ref: 'refs/heads/main', input_tag_name: undefined };

    await run();

    expect(mocks.setFailed).toHaveBeenCalledWith('⚠️ GitHub Releases requires a tag');
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('warns with each unmatched input pattern when strict matching is disabled', async () => {
    config = { ...config, input_files: ['dist/*.zip'] };
    mocks.unmatchedPatterns.mockReturnValue(['dist/*.zip']);

    await run();

    expect(console.warn).toHaveBeenCalledWith("🤔 Pattern 'dist/*.zip' does not match any files.");
    expect(mocks.setFailed).not.toHaveBeenCalled();
  });

  it('fails with the unmatched input pattern when strict matching is enabled', async () => {
    config = {
      ...config,
      input_files: ['dist/*.zip'],
      input_fail_on_unmatched_files: true,
    };
    mocks.unmatchedPatterns.mockReturnValue(['dist/*.zip']);

    await run();

    expect(mocks.setFailed).toHaveBeenCalledWith(
      "⚠️  Pattern 'dist/*.zip' does not match any files.",
    );
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it.each([
    [false, 'warns', '🤔 dist/*.zip does not include a valid file.'],
    [true, 'fails', '⚠️ dist/*.zip does not include a valid file.'],
  ])(
    '%s strict matching %s when resolved patterns contain no files',
    async (strict, _verb, message) => {
      config = {
        ...config,
        input_files: ['dist/*.zip'],
        input_fail_on_unmatched_files: strict,
      };

      await run();

      if (strict) {
        expect(mocks.setFailed).toHaveBeenCalledWith(message);
        expect(mocks.finalizeRelease).not.toHaveBeenCalled();
      } else {
        expect(console.warn).toHaveBeenCalledWith(message);
        expect(mocks.finalizeRelease).toHaveBeenCalledOnce();
      }
    },
  );

  it('forwards valid files and the working directory through upload boundaries', async () => {
    config = {
      ...config,
      input_files: ['dist/*.zip'],
      input_working_directory: 'fixture',
    };
    mocks.paths.mockReturnValue(['fixture/dist/action.zip']);
    mocks.upload.mockResolvedValue({ id: 7 });
    mocks.listReleaseAssets.mockResolvedValue([{ id: 7, name: 'action.zip' }]);

    await run();

    expect(mocks.paths).toHaveBeenCalledWith(['dist/*.zip'], 'fixture');
    expect(mocks.upload).toHaveBeenCalledWith(
      config,
      mocks.releaser,
      'https://uploads.example.test/releases/41/assets',
      'fixture/dist/action.zip',
      initialRelease.assets,
    );
  });

  it('starts uploads concurrently by default', async () => {
    config = { ...config, input_files: ['one.zip', 'two.zip'] };
    mocks.paths.mockReturnValue(['one.zip', 'two.zip']);
    const first = deferred<{ id: number }>();
    const second = deferred<{ id: number }>();
    mocks.upload.mockImplementation((_config, _releaser, _url, path) =>
      path === 'one.zip' ? first.promise : second.promise,
    );

    const result = run();
    await Promise.resolve();

    expect(mocks.upload).toHaveBeenCalledTimes(2);
    first.resolve({ id: 1 });
    second.resolve({ id: 2 });
    await result;
  });

  it('waits for each upload when preserve_order is enabled', async () => {
    config = {
      ...config,
      input_files: ['one.zip', 'two.zip'],
      input_preserve_order: true,
    };
    mocks.paths.mockReturnValue(['one.zip', 'two.zip']);
    const first = deferred<{ id: number }>();
    const second = deferred<{ id: number }>();
    mocks.upload.mockImplementation((_config, _releaser, _url, path) =>
      path === 'one.zip' ? first.promise : second.promise,
    );

    const result = run();
    await Promise.resolve();
    expect(mocks.upload).toHaveBeenCalledTimes(1);

    first.resolve({ id: 1 });
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));

    second.resolve({ id: 2 });
    await result;
  });

  it('keeps an existing draft unpublished until its upload completes', async () => {
    config = {
      ...config,
      input_draft: false,
      input_prerelease: true,
      input_files: ['asset.zip'],
    };
    mocks.release.mockResolvedValue({ release: initialRelease, created: false });
    mocks.paths.mockReturnValue(['asset.zip']);
    const pendingUpload = deferred<{ id: number }>();
    mocks.upload.mockReturnValue(pendingUpload.promise);

    const result = run();
    await Promise.resolve();

    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.finalizeRelease).not.toHaveBeenCalled();

    pendingUpload.resolve({ id: 7 });
    await result;

    expect(mocks.finalizeRelease).toHaveBeenCalledWith(
      config,
      mocks.releaser,
      initialRelease,
      false,
    );
  });

  it('leaves an existing draft recoverable when an upload fails', async () => {
    config = {
      ...config,
      input_draft: false,
      input_prerelease: true,
      input_files: ['asset.zip'],
    };
    mocks.release.mockResolvedValue({ release: initialRelease, created: false });
    mocks.paths.mockReturnValue(['asset.zip']);
    mocks.upload.mockRejectedValue(new Error('upload failed'));

    await run();

    expect(mocks.finalizeRelease).not.toHaveBeenCalled();
    expect(mocks.setFailed).toHaveBeenCalledWith('upload failed');
  });

  it('finalizes after uploads and outputs only newly uploaded assets without uploader data', async () => {
    config = { ...config, input_files: ['one.zip', 'skipped.zip', 'two.zip'] };
    mocks.paths.mockReturnValue(['one.zip', 'skipped.zip', 'two.zip']);
    mocks.upload
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 9 });
    mocks.listReleaseAssets.mockResolvedValue([
      { id: 1, name: 'existing.zip', uploader: { login: 'someone' } },
      { id: 7, name: 'one.zip', size: 10, uploader: { login: 'bot' } },
      { id: 9, name: 'two.zip', label: 'Two', uploader: null },
    ]);

    await run();

    expect(mocks.release.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.upload.mock.invocationCallOrder[0],
    );
    expect(mocks.upload.mock.invocationCallOrder[2]).toBeLessThan(
      mocks.finalizeRelease.mock.invocationCallOrder[0],
    );
    expect(mocks.finalizeRelease).toHaveBeenCalledWith(
      config,
      mocks.releaser,
      initialRelease,
      true,
    );
    expect(mocks.listReleaseAssets).toHaveBeenCalledWith(config, mocks.releaser, finalizedRelease);
    expect(mocks.setOutput).toHaveBeenCalledWith('assets', [
      { id: 7, name: 'one.zip', size: 10 },
      { id: 9, name: 'two.zip', label: 'Two' },
    ]);
    expect(mocks.setOutput).toHaveBeenCalledWith('url', finalizedRelease.html_url);
    expect(mocks.setOutput).toHaveBeenCalledWith('id', '42');
    expect(mocks.setOutput).toHaveBeenCalledWith('upload_url', finalizedRelease.upload_url);
  });

  it('outputs an empty asset list and skips refresh when no upload returns an ID', async () => {
    config = { ...config, input_files: ['skipped.zip'] };
    mocks.paths.mockReturnValue(['skipped.zip']);
    mocks.upload.mockResolvedValue(undefined);

    await run();

    expect(mocks.listReleaseAssets).not.toHaveBeenCalled();
    expect(mocks.setOutput).toHaveBeenCalledWith('assets', []);
  });

  it('configures rate-limit and abuse callbacks without making live requests', async () => {
    await run();

    const options = mocks.getOctokit.mock.calls[0][1];
    const request = { method: 'GET', url: '/repos/owner/repo', request: { retryCount: 0 } };
    expect(options.throttle.onRateLimit(5, request)).toBe(true);
    expect(
      options.throttle.onRateLimit(5, { ...request, request: { retryCount: 1 } }),
    ).toBeUndefined();
    expect(options.throttle.onAbuseLimit(10, request)).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(
      'Request quota exhausted for request GET /repos/owner/repo',
    );
    expect(console.warn).toHaveBeenCalledWith('Abuse detected for request GET /repos/owner/repo');
  });

  it.each([
    [new Error('release failed'), 'release failed'],
    ['release failed', 'release failed'],
    [{ message: 'release failed' }, 'release failed'],
    [null, 'Unknown error'],
    [undefined, 'Unknown error'],
  ])('normalizes a thrown value before reporting failure', async (thrown, expected) => {
    mocks.parseConfig.mockImplementation(() => {
      throw thrown;
    });

    await run();

    expect(mocks.setFailed).toHaveBeenCalledWith(expected);
  });
});
