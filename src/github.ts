import { GitHub } from '@actions/github/lib/utils';
import { statSync } from 'fs';
import { open } from 'fs/promises';
import { lookup } from 'mime-types';
import { basename } from 'path';
import { alignAssetName, Config, isTag, releaseBody } from './util';

type GitHub = InstanceType<typeof GitHub>;

export interface ReleaseAsset {
  name: string;
  mime: string;
  size: number;
}

export interface Release {
  id: number;
  upload_url: string;
  html_url: string;
  tag_name: string;
  name: string | null;
  body?: string | null | undefined;
  target_commitish: string;
  draft: boolean;
  prerelease: boolean;
  assets: Array<{ id: number; name: string }>;
}

export interface Releaser {
  getReleaseByTag(params: { owner: string; repo: string; tag: string }): Promise<{ data: Release }>;

  createRelease(params: {
    owner: string;
    repo: string;
    tag_name: string;
    name: string;
    body: string | undefined;
    draft: boolean | undefined;
    prerelease: boolean | undefined;
    target_commitish: string | undefined;
    discussion_category_name: string | undefined;
    generate_release_notes: boolean | undefined;
    make_latest: 'true' | 'false' | 'legacy' | undefined;
  }): Promise<{ data: Release }>;

  updateRelease(params: {
    owner: string;
    repo: string;
    release_id: number;
    tag_name: string;
    target_commitish: string;
    name: string;
    body: string | undefined;
    draft: boolean | undefined;
    prerelease: boolean | undefined;
    discussion_category_name: string | undefined;
    generate_release_notes: boolean | undefined;
    make_latest: 'true' | 'false' | 'legacy' | undefined;
  }): Promise<{ data: Release }>;

  allReleases(params: { owner: string; repo: string }): AsyncIterableIterator<{ data: Release[] }>;
}

export class GitHubReleaser implements Releaser {
  github: GitHub;
  constructor(github: GitHub) {
    this.github = github;
  }

  getReleaseByTag(params: {
    owner: string;
    repo: string;
    tag: string;
  }): Promise<{ data: Release }> {
    return this.github.rest.repos.getReleaseByTag(params);
  }

  async getReleaseNotes(params: {
    owner: string;
    repo: string;
    tag_name: string;
    target_commitish: string | undefined;
  }): Promise<{
    data: {
      name: string;
      body: string;
    };
  }> {
    return await this.github.rest.repos.generateReleaseNotes(params);
  }

  truncateReleaseNotes(input: string): string {
    // release notes can be a maximum of 125000 characters
    const githubNotesMaxCharLength = 125000;
    return input.substring(0, githubNotesMaxCharLength - 1);
  }

  async createRelease(params: {
    owner: string;
    repo: string;
    tag_name: string;
    name: string;
    body: string | undefined;
    draft: boolean | undefined;
    prerelease: boolean | undefined;
    target_commitish: string | undefined;
    discussion_category_name: string | undefined;
    generate_release_notes: boolean | undefined;
    make_latest: 'true' | 'false' | 'legacy' | undefined;
  }): Promise<{ data: Release }> {
    if (
      typeof params.make_latest === 'string' &&
      !['true', 'false', 'legacy'].includes(params.make_latest)
    ) {
      params.make_latest = undefined;
    }
    if (params.generate_release_notes) {
      const releaseNotes = await this.getReleaseNotes(params);
      params.generate_release_notes = false;
      if (params.body) {
        params.body = `${params.body}\n\n${releaseNotes.data.body}`;
      } else {
        params.body = releaseNotes.data.body;
      }
    }
    params.body = params.body ? this.truncateReleaseNotes(params.body) : undefined;
    return this.github.rest.repos.createRelease(params);
  }

  async updateRelease(params: {
    owner: string;
    repo: string;
    release_id: number;
    tag_name: string;
    target_commitish: string;
    name: string;
    body: string | undefined;
    draft: boolean | undefined;
    prerelease: boolean | undefined;
    discussion_category_name: string | undefined;
    generate_release_notes: boolean | undefined;
    make_latest: 'true' | 'false' | 'legacy' | undefined;
  }): Promise<{ data: Release }> {
    if (
      typeof params.make_latest === 'string' &&
      !['true', 'false', 'legacy'].includes(params.make_latest)
    ) {
      params.make_latest = undefined;
    }
    if (params.generate_release_notes) {
      const releaseNotes = await this.getReleaseNotes(params);
      params.generate_release_notes = false;
      if (params.body) {
        params.body = `${params.body}\n\n${releaseNotes.data.body}`;
      } else {
        params.body = releaseNotes.data.body;
      }
    }
    params.body = params.body ? this.truncateReleaseNotes(params.body) : undefined;
    return this.github.rest.repos.updateRelease(params);
  }

  allReleases(params: { owner: string; repo: string }): AsyncIterableIterator<{ data: Release[] }> {
    const updatedParams = { per_page: 100, ...params };
    return this.github.paginate.iterator(
      this.github.rest.repos.listReleases.endpoint.merge(updatedParams),
    );
  }
}

export const asset = (path: string): ReleaseAsset => {
  return {
    name: basename(path),
    mime: mimeOrDefault(path),
    size: statSync(path).size,
  };
};

export const mimeOrDefault = (path: string): string => {
  return lookup(path) || 'application/octet-stream';
};

export const upload = async (
  config: Config,
  github: GitHub,
  url: string,
  path: string,
  currentAssets: Array<{ id: number; name: string }>,
): Promise<any> => {
  const [owner, repo] = config.github_repository.split('/');
  const { name, mime, size } = asset(path);
  const currentAsset = currentAssets.find(
    // note: GitHub renames asset filenames that have special characters, non-alphanumeric characters, and leading or trailing periods. The "List release assets" endpoint lists the renamed filenames.
    // due to this renaming we need to be mindful when we compare the file name we're uploading with a name github may already have rewritten for logical comparison
    // see https://docs.github.com/en/rest/releases/assets?apiVersion=2022-11-28#upload-a-release-asset
    ({ name: currentName }) => currentName == alignAssetName(name),
  );
  if (currentAsset) {
    if (config.input_overwrite_files === false) {
      console.log(`Asset ${name} already exists and overwrite_files is false...`);
      return null;
    } else {
      console.log(`♻️ Deleting previously uploaded asset ${name}...`);
      await github.rest.repos.deleteReleaseAsset({
        asset_id: currentAsset.id || 1,
        owner,
        repo,
      });
    }
  }
  console.log(`⬆️ Uploading ${name}...`);
  const endpoint = new URL(url);
  endpoint.searchParams.append('name', name);
  const fh = await open(path);
  try {
    const resp = await github.request({
      method: 'POST',
      url: endpoint.toString(),
      headers: {
        'content-length': `${size}`,
        'content-type': mime,
        authorization: `token ${config.github_token}`,
      },
      data: fh.readableWebStream({ type: 'bytes' }),
    });
    const json = resp.data;
    if (resp.status !== 201) {
      throw new Error(
        `Failed to upload release asset ${name}. received status code ${
          resp.status
        }\n${json.message}\n${JSON.stringify(json.errors)}`,
      );
    }
    console.log(`✅ Uploaded ${name}`);
    return json;
  } finally {
    await fh.close();
  }
};

export const release = async (
  config: Config,
  releaser: Releaser,
  maxRetries: number = 3,
): Promise<Release> => {
  if (maxRetries <= 0) {
    console.log(`❌ Too many retries. Aborting...`);
    throw new Error('Too many retries.');
  }

  const [owner, repo] = config.github_repository.split('/');
  const tag =
    config.input_tag_name ||
    (isTag(config.github_ref) ? config.github_ref.replace('refs/tags/', '') : '');

  const discussion_category_name = config.input_discussion_category_name;
  const generate_release_notes = config.input_generate_release_notes;
  try {
    const _release: Release | undefined = await findTagFromReleases(releaser, owner, repo, tag);

    if (_release === undefined) {
      return await createRelease(
        tag,
        config,
        releaser,
        owner,
        repo,
        discussion_category_name,
        generate_release_notes,
        maxRetries,
      );
    }

    let existingRelease: Release = _release!;
    console.log(`Found release ${existingRelease.name} (with id=${existingRelease.id})`);

    const release_id = existingRelease.id;
    let target_commitish: string;
    if (
      config.input_target_commitish &&
      config.input_target_commitish !== existingRelease.target_commitish
    ) {
      console.log(
        `Updating commit from "${existingRelease.target_commitish}" to "${config.input_target_commitish}"`,
      );
      target_commitish = config.input_target_commitish;
    } else {
      target_commitish = existingRelease.target_commitish;
    }

    const tag_name = tag;
    const name = config.input_name || existingRelease.name || tag;
    // revisit: support a new body-concat-strategy input for accumulating
    // body parts as a release gets updated. some users will likely want this while
    // others won't previously this was duplicating content for most which
    // no one wants
    const workflowBody = releaseBody(config) || '';
    const existingReleaseBody = existingRelease.body || '';
    let body: string;
    if (config.input_append_body && workflowBody && existingReleaseBody) {
      body = existingReleaseBody + '\n' + workflowBody;
    } else {
      body = workflowBody || existingReleaseBody;
    }

    const draft = config.input_draft !== undefined ? config.input_draft : existingRelease.draft;
    const prerelease =
      config.input_prerelease !== undefined ? config.input_prerelease : existingRelease.prerelease;

    const make_latest = config.input_make_latest;

    const release = await releaser.updateRelease({
      owner,
      repo,
      release_id,
      tag_name,
      target_commitish,
      name,
      body,
      draft,
      prerelease,
      discussion_category_name,
      generate_release_notes,
      make_latest,
    });
    return release.data;
  } catch (error) {
    if (error.status !== 404) {
      console.log(
        `⚠️ Unexpected error fetching GitHub release for tag ${tag}: ${error}`,
      );
      throw error;
    }

    return await createRelease(
      tag,
      config,
      releaser,
      owner,
      repo,
      discussion_category_name,
      generate_release_notes,
      maxRetries,
    );
  }
};

/**
 * Paginates through releases with safeguards to avoid hitting GitHub's 10,000 result limit.
 * Stops early if encountering too many consecutive empty pages.
 *
 * @param releaser - The GitHub API wrapper for release operations
 * @param owner - The owner of the repository
 * @param repo - The name of the repository
 * @param tag - The tag name to search for
 * @returns The release with the given tag name, or undefined if no release with that tag name is found
 */
async function findTagByPagination(
  releaser: Releaser,
  owner: string,
  repo: string,
  tag: string,
): Promise<Release | undefined> {
  // Manually paginate to avoid hitting GitHub's 10,000 result limit
  // The github.paginate.iterator can hit the limit before we can stop it
  // So we manually paginate with strict limits
  const maxPages = 30; // Stop after 30 pages (3000 releases max) to avoid hitting limits
  const minPagesBeforeEmptyPageStop = 5; // After checking at least 5 pages, stop immediately on first empty page
  const perPage = 100;

  // Use the GitHub API directly for manual pagination
  const github = (releaser as GitHubReleaser).github;
  if (!github) {
    // Fallback to iterator if we can't access github directly
    let pageCount = 0;
    for await (const { data: releases } of releaser.allReleases({
      owner,
      repo,
    })) {
      pageCount++;
      if (pageCount > maxPages) {
        console.warn(
          `⚠️ Stopped pagination after ${maxPages} pages to avoid hitting GitHub's result limit`,
        );
        break;
      }
      if (releases.length === 0 && pageCount >= minPagesBeforeEmptyPageStop) {
        console.log(
          `Stopped pagination after encountering empty page at page ${pageCount}`,
        );
        break;
      }
      const release = releases.find((release) => release.tag_name === tag);
      if (release) {
        return release;
      }
    }
    return undefined;
  }

  // Manual pagination with full control
  let page = 1;
  let consecutiveEmptyPages = 0;

  while (page <= maxPages) {
    try {
      const response = await github.rest.repos.listReleases({
        owner,
        repo,
        per_page: perPage,
        page: page,
      });

      const releases = response.data;

      // If we get an empty page, stop immediately if we've already checked enough pages
      if (releases.length === 0) {
        consecutiveEmptyPages++;
        if (page >= minPagesBeforeEmptyPageStop) {
          console.log(
            `Stopped pagination after encountering empty page at page ${page} (to avoid hitting GitHub's result limit)`,
          );
          break;
        }
        // If we haven't checked many pages yet, continue (might be at the very end)
        page++;
        continue;
      }

      // Reset empty page counter when we find releases
      consecutiveEmptyPages = 0;

      const release = releases.find((release) => release.tag_name === tag);
      if (release) {
        return release;
      }

      // If we got fewer results than per_page, we've reached the end
      if (releases.length < perPage) {
        break;
      }

      page++;
    } catch (error: any) {
      // If we hit the 10,000 result limit, stop immediately
      if (error.status === 422 && error.message?.includes('10000')) {
        console.warn(
          `⚠️ Stopped pagination at page ${page} due to GitHub's 10,000 result limit`,
        );
        break;
      }
      throw error;
    }
  }

  return undefined;
}

/**
 * Finds a release by tag name from all a repository's releases.
 *
 * @param releaser - The GitHub API wrapper for release operations
 * @param owner - The owner of the repository
 * @param repo - The name of the repository
 * @param tag - The tag name to search for
 * @returns The release with the given tag name, or undefined if no release with that tag name is found
 */
export async function findTagFromReleases(
  releaser: Releaser,
  owner: string,
  repo: string,
  tag: string,
): Promise<Release | undefined> {
  // If tag is empty, skip direct lookup and go straight to pagination
  // (some releases may not have tags)
  if (!tag) {
    return await findTagByPagination(releaser, owner, repo, tag);
  }

  // First try to get the release directly by tag (much more efficient than paginating)
  try {
    const { data } = await releaser.getReleaseByTag({ owner, repo, tag });
    return data;
  } catch (error: any) {
    // If the release doesn't exist (404), return undefined
    // For other errors, fall back to pagination as a safety measure
    if (error.status === 404) {
      return undefined;
    }
    // For non-404 errors, fall back to pagination (though this should rarely happen)
    console.warn(
      `⚠️ Direct tag lookup failed (status: ${error.status}), falling back to pagination...`,
    );
    return await findTagByPagination(releaser, owner, repo, tag);
  }
}

async function createRelease(
  tag: string,
  config: Config,
  releaser: Releaser,
  owner: string,
  repo: string,
  discussion_category_name: string | undefined,
  generate_release_notes: boolean | undefined,
  maxRetries: number,
) {
  const tag_name = tag;
  const name = config.input_name || tag;
  const body = releaseBody(config);
  const draft = config.input_draft;
  const prerelease = config.input_prerelease;
  const target_commitish = config.input_target_commitish;
  const make_latest = config.input_make_latest;
  let commitMessage: string = '';
  if (target_commitish) {
    commitMessage = ` using commit "${target_commitish}"`;
  }
  console.log(`👩‍🏭 Creating new GitHub release for tag ${tag_name}${commitMessage}...`);
  try {
    let release = await releaser.createRelease({
      owner,
      repo,
      tag_name,
      name,
      body,
      draft,
      prerelease,
      target_commitish,
      discussion_category_name,
      generate_release_notes,
      make_latest,
    });
    return release.data;
  } catch (error) {
    // presume a race with competing matrix runs
    console.log(`⚠️ GitHub release failed with status: ${error.status}`);
    console.log(`${JSON.stringify(error.response.data)}`);

    switch (error.status) {
      case 403:
        console.log(
          'Skip retry — your GitHub token/PAT does not have the required permission to create a release',
        );
        throw error;

      case 404:
        console.log('Skip retry - discussion category mismatch');
        throw error;

      case 422:
        // Check if this is a race condition with "already_exists" error
        const errorData = error.response?.data;
        if (errorData?.errors?.[0]?.code === 'already_exists') {
          console.log(
            '⚠️ Release already exists (race condition detected), retrying to find and update existing release...',
          );
          // Don't throw - allow retry to find existing release
        } else {
          console.log('Skip retry - validation failed');
          throw error;
        }
        break;
    }

    console.log(`retrying... (${maxRetries - 1} retries remaining)`);
    return release(config, releaser, maxRetries - 1);
  }
}
