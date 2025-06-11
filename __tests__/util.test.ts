import {
  alignAssetName,
  isTag,
  parseConfig,
  parseInputFiles,
  paths,
  releaseBody,
  unmatchedPatterns,
  uploadUrl,
} from '../src/util';

import { assert, describe, expect, it } from 'vitest';

describe('util', () => {
  describe('uploadUrl', () => {
    it('strips template', () => {
      assert.equal(
        uploadUrl(
          'https://uploads.github.com/repos/octocat/Hello-World/releases/1/assets{?name,label}',
        ),
        'https://uploads.github.com/repos/octocat/Hello-World/releases/1/assets',
      );
    });
  });
  describe('parseInputFiles', () => {
    it('parses empty strings', () => {
      assert.deepStrictEqual(parseInputFiles(''), []);
    });
    it('parses comma-delimited strings', () => {
      assert.deepStrictEqual(parseInputFiles('foo,bar'), ['foo', 'bar']);
    });
    it('parses newline and comma-delimited (and then some)', () => {
      assert.deepStrictEqual(parseInputFiles('foo,bar\nbaz,boom,\n\ndoom,loom '), [
        'foo',
        'bar',
        'baz',
        'boom',
        'doom',
        'loom',
      ]);
    });
  });
  describe('releaseBody', () => {
    it('uses input body', () => {
      assert.equal(
        'foo',
        releaseBody({
          github_ref: '',
          github_repository: '',
          github_token: '',
          input_body: 'foo',
          input_body_path: undefined,
          input_draft: false,
          input_prerelease: false,
          input_preserve_order: undefined,
          input_files: [],
          input_overwrite_files: undefined,
          input_name: undefined,
          input_tag_name: undefined,
          input_target_commitish: undefined,
          input_discussion_category_name: undefined,
          input_generate_release_notes: false,
          input_make_latest: undefined,
        }),
      );
    });
    it('uses input body path', () => {
      assert.equal(
        'bar',
        releaseBody({
          github_ref: '',
          github_repository: '',
          github_token: '',
          input_body: undefined,
          input_body_path: '__tests__/release.txt',
          input_draft: false,
          input_prerelease: false,
          input_preserve_order: undefined,
          input_files: [],
          input_overwrite_files: undefined,
          input_name: undefined,
          input_tag_name: undefined,
          input_target_commitish: undefined,
          input_discussion_category_name: undefined,
          input_generate_release_notes: false,
          input_make_latest: undefined,
        }),
      );
    });
    it('defaults to body path when both body and body path are provided', () => {
      assert.equal(
        'bar',
        releaseBody({
          github_ref: '',
          github_repository: '',
          github_token: '',
          input_body: 'foo',
          input_body_path: '__tests__/release.txt',
          input_draft: false,
          input_prerelease: false,
          input_preserve_order: undefined,
          input_files: [],
          input_overwrite_files: undefined,
          input_name: undefined,
          input_tag_name: undefined,
          input_target_commitish: undefined,
          input_discussion_category_name: undefined,
          input_generate_release_notes: false,
          input_make_latest: undefined,
        }),
      );
    });
  });
  describe('parseConfig', () => {
    it('parses basic config', () => {
      assert.deepStrictEqual(
        parseConfig({
          // note: inputs declared in actions.yml, even when declared not required,
          // are still provided by the actions runtime env as empty strings instead of
          // the normal absent env value one would expect. this breaks things
          // as an empty string !== undefined in terms of what we pass to the api
          // so we cover that in a test case here to ensure undefined values are actually
          // resolved as undefined and not empty strings
          INPUT_TARGET_COMMITISH: '',
          INPUT_DISCUSSION_CATEGORY_NAME: '',
        }),
        {
          github_ref: '',
          github_repository: '',
          github_token: '',
          input_append_body: false,
          input_body: undefined,
          input_body_path: undefined,
          input_draft: undefined,
          input_prerelease: undefined,
          input_preserve_order: undefined,
          input_files: [],
          input_overwrite_files: undefined,
          input_name: undefined,
          input_tag_name: undefined,
          input_fail_on_unmatched_files: false,
          input_target_commitish: undefined,
          input_discussion_category_name: undefined,
          input_generate_release_notes: false,
          input_make_latest: undefined,
        },
      );
    });

    it('parses basic config with commitish', () => {
      assert.deepStrictEqual(
        parseConfig({
          INPUT_TARGET_COMMITISH: 'affa18ef97bc9db20076945705aba8c516139abd',
        }),
        {
          github_ref: '',
          github_repository: '',
          github_token: '',
          input_append_body: false,
          input_body: undefined,
          input_body_path: undefined,
          input_draft: undefined,
          input_prerelease: undefined,
          input_files: [],
          input_overwrite_files: undefined,
          input_preserve_order: undefined,
          input_name: undefined,
          input_tag_name: undefined,
          input_fail_on_unmatched_files: false,
          input_target_commitish: 'affa18ef97bc9db20076945705aba8c516139abd',
          input_discussion_category_name: undefined,
          input_generate_release_notes: false,
          input_make_latest: undefined,
        },
      );
    });
    it('supports discussion category names', () => {
      assert.deepStrictEqual(
        parseConfig({
          INPUT_DISCUSSION_CATEGORY_NAME: 'releases',
        }),
        {
          github_ref: '',
          github_repository: '',
          github_token: '',
          input_append_body: false,
          input_body: undefined,
          input_body_path: undefined,
          input_draft: undefined,
          input_prerelease: undefined,
          input_files: [],
          input_preserve_order: undefined,
          input_name: undefined,
          input_overwrite_files: undefined,
          input_tag_name: undefined,
          input_fail_on_unmatched_files: false,
          input_target_commitish: undefined,
          input_discussion_category_name: 'releases',
          input_generate_release_notes: false,
          input_make_latest: undefined,
        },
      );
    });

    it('supports generating release notes', () => {
      assert.deepStrictEqual(
        parseConfig({
          INPUT_GENERATE_RELEASE_NOTES: 'true',
        }),
        {
          github_ref: '',
          github_repository: '',
          github_token: '',
          input_append_body: false,
          input_body: undefined,
          input_body_path: undefined,
          input_draft: undefined,
          input_prerelease: undefined,
          input_preserve_order: undefined,
          input_files: [],
          input_overwrite_files: undefined,
          input_name: undefined,
          input_tag_name: undefined,
          input_fail_on_unmatched_files: false,
          input_target_commitish: undefined,
          input_discussion_category_name: undefined,
          input_generate_release_notes: true,
          input_make_latest: undefined,
        },
      );
    });

    it('prefers GITHUB_TOKEN over token input for backwards compatibility', () => {
      assert.deepStrictEqual(
        parseConfig({
          INPUT_DRAFT: 'false',
          INPUT_PRERELEASE: 'true',
          INPUT_PRESERVE_ORDER: 'true',
          GITHUB_TOKEN: 'env-token',
          INPUT_TOKEN: 'input-token',
        }),
        {
          github_ref: '',
          github_repository: '',
          github_token: 'env-token',
          input_append_body: false,
          input_body: undefined,
          input_body_path: undefined,
          input_draft: false,
          input_prerelease: true,
          input_preserve_order: true,
          input_files: [],
          input_overwrite_files: undefined,
          input_name: undefined,
          input_tag_name: undefined,
          input_fail_on_unmatched_files: false,
          input_target_commitish: undefined,
          input_discussion_category_name: undefined,
          input_generate_release_notes: false,
          input_make_latest: undefined,
        },
      );
    });
    it('uses input token as the source of GITHUB_TOKEN by default', () => {
      assert.deepStrictEqual(
        parseConfig({
          INPUT_DRAFT: 'false',
          INPUT_PRERELEASE: 'true',
          INPUT_TOKEN: 'input-token',
        }),
        {
          github_ref: '',
          github_repository: '',
          github_token: 'input-token',
          input_append_body: false,
          input_body: undefined,
          input_body_path: undefined,
          input_draft: false,
          input_prerelease: true,
          input_preserve_order: undefined,
          input_files: [],
          input_overwrite_files: undefined,
          input_name: undefined,
          input_tag_name: undefined,
          input_fail_on_unmatched_files: false,
          input_target_commitish: undefined,
          input_discussion_category_name: undefined,
          input_generate_release_notes: false,
          input_make_latest: undefined,
        },
      );
    });
    it('parses basic config with draft and prerelease', () => {
      assert.deepStrictEqual(
        parseConfig({
          INPUT_DRAFT: 'false',
          INPUT_PRERELEASE: 'true',
        }),
        {
          github_ref: '',
          github_repository: '',
          github_token: '',
          input_append_body: false,
          input_body: undefined,
          input_body_path: undefined,
          input_draft: false,
          input_prerelease: true,
          input_preserve_order: undefined,
          input_files: [],
          input_overwrite_files: undefined,
          input_name: undefined,
          input_tag_name: undefined,
          input_fail_on_unmatched_files: false,
          input_target_commitish: undefined,
          input_discussion_category_name: undefined,
          input_generate_release_notes: false,
          input_make_latest: undefined,
        },
      );
    });
    it('parses basic config where make_latest is passed', () => {
      assert.deepStrictEqual(
        parseConfig({
          INPUT_MAKE_LATEST: 'false',
        }),
        {
          github_ref: '',
          github_repository: '',
          github_token: '',
          input_append_body: false,
          input_body: undefined,
          input_body_path: undefined,
          input_draft: undefined,
          input_prerelease: undefined,
          input_preserve_order: undefined,
          input_files: [],
          input_name: undefined,
          input_overwrite_files: undefined,
          input_tag_name: undefined,
          input_fail_on_unmatched_files: false,
          input_target_commitish: undefined,
          input_discussion_category_name: undefined,
          input_generate_release_notes: false,
          input_make_latest: 'false',
        },
      );
    });
    it('parses basic config with append_body', () => {
      assert.deepStrictEqual(
        parseConfig({
          INPUT_APPEND_BODY: 'true',
        }),
        {
          github_ref: '',
          github_repository: '',
          github_token: '',
          input_append_body: true,
          input_body: undefined,
          input_body_path: undefined,
          input_draft: undefined,
          input_prerelease: undefined,
          input_preserve_order: undefined,
          input_files: [],
          input_overwrite_files: undefined,
          input_name: undefined,
          input_tag_name: undefined,
          input_fail_on_unmatched_files: false,
          input_target_commitish: undefined,
          input_discussion_category_name: undefined,
          input_generate_release_notes: false,
          input_make_latest: undefined,
        },
      );
    });
  });
  describe('isTag', () => {
    it('returns true for tags', async () => {
      assert.equal(isTag('refs/tags/foo'), true);
    });
    it('returns false for other kinds of refs', async () => {
      assert.equal(isTag('refs/heads/master'), false);
    });
  });

  describe('paths', () => {
    it('resolves files given a set of paths', async () => {
      assert.deepStrictEqual(paths(['tests/data/**/*', 'tests/data/does/not/exist/*']), [
        'tests/data/foo/bar.txt',
      ]);
    });
  });

  describe('unmatchedPatterns', () => {
    it("returns the patterns that don't match any files", async () => {
      assert.deepStrictEqual(
        unmatchedPatterns(['tests/data/**/*', 'tests/data/does/not/exist/*']),
        ['tests/data/does/not/exist/*'],
      );
    });
  });

  describe('replaceSpacesWithDots', () => {
    it('replaces all spaces with dots', () => {
      expect(alignAssetName('John Doe.bla')).toBe('John.Doe.bla');
    });

    it('handles names with multiple spaces', () => {
      expect(alignAssetName('John William Doe.bla')).toBe('John.William.Doe.bla');
    });

    it('returns the same string if there are no spaces', () => {
      expect(alignAssetName('JohnDoe')).toBe('JohnDoe');
    });
  });
});
