import { GitHub } from '@actions/github/lib/utils';
import { statSync } from 'fs';
import { open } from 'fs/promises';
import { lookup } from 'mime-types';
import { basename } from 'path';
import { alignAssetName, Config, isTag, normalizeTagName, releaseBody } from './util';

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
  assets: Array<{ id: number; name: string; label?: string | null }>;
}

export interface ReleaseResult {
  release: Release;
  created: boolean;
}

type ReleaseNotesParams = {
  owner: string;
  repo: string;
  tag_name: string;
  target_commitish: string | undefined;
  previous_tag_name?: string;
};

type ReleaseMutationParams = {
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
  previous_tag_name?: string;
};

export interface Releaser {
  getReleaseByTag(params: { owner: string; repo: string; tag: string }): Promise<{ data: Release }>;

  createRelease(params: ReleaseMutationParams): Promise<{ data: Release }>;

  updateRelease(
    params: ReleaseMutationParams & {
      release_id: number;
      target_commitish: string;
    },
  ): Promise<{ data: Release }>;

  finalizeRelease(params: {
    owner: string;
    repo: string;
    release_id: number;
    make_latest: 'true' | 'false' | 'legacy' | undefined;
  }): Promise<{ data: Release }>;

  allReleases(params: { owner: string; repo: string }): AsyncIterable<{ data: Release[] }>;

  listReleaseAssets(params: {
    owner: string;
    repo: string;
    release_id: number;
  }): Promise<Array<{ id: number; name: string; label?: string | null; [key: string]: any }>>;

  deleteReleaseAsset(params: { owner: string; repo: string; asset_id: number }): Promise<void>;

  deleteRelease(params: { owner: string; repo: string; release_id: number }): Promise<void>;

  updateReleaseAsset(params: {
    owner: string;
    repo: string;
    asset_id: number;
    name: string;
    label: string;
  }): Promise<{ data: any }>;

  uploadReleaseAsset(params: {
    url: string;
    size: number;
    mime: string;
    token: string;
    data: any;
  }): Promise<{ status: number; data: any }>;
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

  async getReleaseNotes(params: ReleaseNotesParams): Promise<{
    data: {
      name: string;
      body: string;
    };
  }> {
    return await this.github.rest.repos.generateReleaseNotes(params);
  }

  private async prepareReleaseMutation<T extends ReleaseMutationParams>(
    params: T,
  ): Promise<Omit<T, 'previous_tag_name'>> {
    const { previous_tag_name, ...releaseParams } = params;

    if (
      typeof releaseParams.make_latest === 'string' &&
      !['true', 'false', 'legacy'].includes(releaseParams.make_latest)
    ) {
      releaseParams.make_latest = undefined;
    }
    if (releaseParams.generate_release_notes) {
      const releaseNotes = await this.getReleaseNotes({
        owner: releaseParams.owner,
        repo: releaseParams.repo,
        tag_name: releaseParams.tag_name,
        target_commitish: releaseParams.target_commitish,
        previous_tag_name,
      });
      releaseParams.generate_release_notes = false;
      if (releaseParams.body) {
        releaseParams.body = `${releaseParams.body}\n\n${releaseNotes.data.body}`;
      } else {
        releaseParams.body = releaseNotes.data.body;
      }
    }
    releaseParams.body = releaseParams.body
      ? this.truncateReleaseNotes(releaseParams.body)
      : undefined;
    return releaseParams;
  }

  truncateReleaseNotes(input: string): string {
    // release notes can be a maximum of 125000 characters
    const githubNotesMaxCharLength = 125000;
    return input.substring(0, githubNotesMaxCharLength - 1);
  }

  async createRelease(params: ReleaseMutationParams): Promise<{ data: Release }> {
    return this.github.rest.repos.createRelease(await this.prepareReleaseMutation(params));
  }

  async updateRelease(
    params: ReleaseMutationParams & {
      release_id: number;
      target_commitish: string;
    },
  ): Promise<{ data: Release }> {
    return this.github.rest.repos.updateRelease(await this.prepareReleaseMutation(params));
  }

  async finalizeRelease(params: {
    owner: string;
    repo: string;
    release_id: number;
    make_latest: 'true' | 'false' | 'legacy' | undefined;
  }) {
    return await this.github.rest.repos.updateRelease({
      owner: params.owner,
      repo: params.repo,
      release_id: params.release_id,
      draft: false,
      make_latest: params.make_latest,
    });
  }

  allReleases(params: { owner: string; repo: string }): AsyncIterable<{ data: Release[] }> {
    const updatedParams = { per_page: 100, ...params };
    return this.github.paginate.iterator(
      this.github.rest.repos.listReleases.endpoint.merge(updatedParams),
    );
  }

  async listReleaseAssets(params: {
    owner: string;
    repo: string;
    release_id: number;
  }): Promise<Array<{ id: number; name: string; label?: string | null; [key: string]: any }>> {
    return this.github.paginate(this.github.rest.repos.listReleaseAssets, {
      ...params,
      per_page: 100,
    });
  }

  async deleteReleaseAsset(params: {
    owner: string;
    repo: string;
    asset_id: number;
  }): Promise<void> {
    await this.github.rest.repos.deleteReleaseAsset(params);
  }

  async deleteRelease(params: { owner: string; repo: string; release_id: number }): Promise<void> {
    await this.github.rest.repos.deleteRelease(params);
  }

  async updateReleaseAsset(params: {
    owner: string;
    repo: string;
    asset_id: number;
    name: string;
    label: string;
  }): Promise<{ data: any }> {
    return await this.github.rest.repos.updateReleaseAsset(params);
  }

  async uploadReleaseAsset(params: {
    url: string;
    size: number;
    mime: string;
    token: string;
    data: any;
  }): Promise<{ status: number; data: any }> {
    return this.github.request({
      method: 'POST',
      url: params.url,
      headers: {
        'content-length': `${params.size}`,
        'content-type': params.mime,
        authorization: `token ${params.token}`,
      },
      data: params.data,
    });
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

const releaseAssetMatchesName = (
  name: string,
  asset: { name: string; label?: string | null },
): boolean => asset.name === name || asset.name === alignAssetName(name) || asset.label === name;

const isReleaseAssetUpdateNotFound = (error: any): boolean => {
  const errorStatus = error?.status ?? error?.response?.status;
  const requestUrl = error?.request?.url;
  const errorMessage = error?.message;
  const isReleaseAssetRequest =
    typeof requestUrl === 'string' &&
    (/\/releases\/assets\//.test(requestUrl) || /\/releases\/\d+\/assets(?:\?|$)/.test(requestUrl));

  return (
    errorStatus === 404 &&
    (isReleaseAssetRequest ||
      (typeof errorMessage === 'string' && errorMessage.includes('update-a-release-asset')))
  );
};

export const upload = async (
  config: Config,
  releaser: Releaser,
  url: string,
  path: string,
  currentAssets: Array<{ id: number; name: string; label?: string | null }>,
): Promise<any> => {
  const [owner, repo] = config.github_repository.split('/');
  const { name, mime, size } = asset(path);
  const releaseIdMatch = url.match(/\/releases\/(\d+)\/assets/);
  const releaseId = releaseIdMatch ? Number(releaseIdMatch[1]) : undefined;
  const currentAsset = currentAssets.find(
    // GitHub can rewrite uploaded asset names, so compare against both the raw name
    // GitHub returns and the restored label we set when available.
    (currentAsset) => releaseAssetMatchesName(name, currentAsset),
  );
  if (currentAsset) {
    if (config.input_overwrite_files === false) {
      console.log(`Asset ${name} already exists and overwrite_files is false...`);
      return null;
    } else {
      console.log(`♻️ Deleting previously uploaded asset ${name}...`);
      await releaser.deleteReleaseAsset({
        asset_id: currentAsset.id || 1,
        owner,
        repo,
      });
    }
  }
  console.log(`⬆️ Uploading ${name}...`);
  const endpoint = new URL(url);
  endpoint.searchParams.append('name', name);
  const findReleaseAsset = async (
    matches: (asset: { id: number; name: string; label?: string | null }) => boolean,
    attempts: number = 3,
  ) => {
    if (releaseId === undefined) {
      return undefined;
    }

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const latestAssets = await releaser.listReleaseAssets({
        owner,
        repo,
        release_id: releaseId,
      });
      const latestAsset = latestAssets.find(matches);
      if (latestAsset) {
        return latestAsset;
      }

      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return undefined;
  };
  const uploadAsset = async () => {
    const fh = await open(path);
    try {
      return await releaser.uploadReleaseAsset({
        url: endpoint.toString(),
        size,
        mime,
        token: config.github_token,
        data: fh.readableWebStream({ type: 'bytes' }),
      });
    } finally {
      await fh.close();
    }
  };

  const maybeRestoreAssetLabel = async (uploadedAsset: {
    id?: number;
    name?: string;
    label?: string | null;
    [key: string]: any;
  }) => {
    if (!uploadedAsset.name || uploadedAsset.name === name || !uploadedAsset.id) {
      return uploadedAsset;
    }

    console.log(`✏️ Restoring asset label to ${name}...`);

    const updateAssetLabel = async (assetId: number) => {
      const { data } = await releaser.updateReleaseAsset({
        owner,
        repo,
        asset_id: assetId,
        name: uploadedAsset.name!,
        label: name,
      });
      return data;
    };

    try {
      return await updateAssetLabel(uploadedAsset.id);
    } catch (error: any) {
      const errorStatus = error?.status ?? error?.response?.status;

      if (errorStatus === 404 && releaseId !== undefined) {
        try {
          const latestAsset = await findReleaseAsset(
            (currentAsset) =>
              currentAsset.id === uploadedAsset.id || currentAsset.name === uploadedAsset.name,
          );
          if (latestAsset) {
            return await updateAssetLabel(latestAsset.id);
          }
        } catch (refreshError) {
          console.warn(`error refreshing release assets for ${name}: ${refreshError}`);
        }
      }

      console.warn(`error updating release asset label for ${name}: ${error}`);
      return uploadedAsset;
    }
  };

  const handleUploadedAsset = async (resp: { status: number; data: any }) => {
    const json = resp.data;
    if (resp.status !== 201) {
      throw new Error(
        `Failed to upload release asset ${name}. received status code ${
          resp.status
        }\n${json.message}\n${JSON.stringify(json.errors)}`,
      );
    }
    const assetWithLabel = await maybeRestoreAssetLabel(json);
    console.log(`✅ Uploaded ${name}`);
    return assetWithLabel;
  };

  try {
    return await handleUploadedAsset(await uploadAsset());
  } catch (error: any) {
    const errorStatus = error?.status ?? error?.response?.status;
    const errorData = error?.response?.data;

    if (releaseId !== undefined && isReleaseAssetUpdateNotFound(error)) {
      try {
        const latestAsset = await findReleaseAsset((currentAsset) =>
          releaseAssetMatchesName(name, currentAsset),
        );
        if (latestAsset) {
          console.warn(
            `error updating release asset metadata for ${name}: ${error}. Matching asset is present after refresh; continuing...`,
          );
          return latestAsset;
        }
      } catch (refreshError) {
        console.warn(
          `error refreshing release assets after metadata update failure: ${refreshError}`,
        );
      }
    }

    // Handle race conditions across concurrent workflows uploading the same asset.
    if (
      config.input_overwrite_files !== false &&
      errorStatus === 422 &&
      errorData?.errors?.[0]?.code === 'already_exists' &&
      releaseId !== undefined
    ) {
      console.log(
        `⚠️ Asset ${name} already exists (race condition), refreshing assets and retrying once...`,
      );
      const latestAssets = await releaser.listReleaseAssets({
        owner,
        repo,
        release_id: releaseId,
      });
      const latestAsset = latestAssets.find((currentAsset) =>
        releaseAssetMatchesName(name, currentAsset),
      );
      if (latestAsset) {
        await releaser.deleteReleaseAsset({
          owner,
          repo,
          asset_id: latestAsset.id,
        });
        return await handleUploadedAsset(await uploadAsset());
      }
    }

    throw error;
  }
};

export const release = async (
  config: Config,
  releaser: Releaser,
  maxRetries: number = 3,
): Promise<ReleaseResult> => {
  if (maxRetries <= 0) {
    console.log(`❌ Too many retries. Aborting...`);
    throw new Error('Too many retries.');
  }

  const [owner, repo] = config.github_repository.split('/');
  const tag =
    normalizeTagName(config.input_tag_name) ||
    (isTag(config.github_ref) ? config.github_ref.replace('refs/tags/', '') : '');

  const discussion_category_name = config.input_discussion_category_name;
  const generate_release_notes = config.input_generate_release_notes;
  const previous_tag_name = config.input_previous_tag;

  if (generate_release_notes && previous_tag_name) {
    console.log(`📝 Generating release notes using previous tag ${previous_tag_name}`);
  }
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
        previous_tag_name,
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
      draft: existingRelease.draft,
      prerelease,
      discussion_category_name,
      generate_release_notes,
      make_latest,
      previous_tag_name,
    });
    return {
      release: release.data,
      created: false,
    };
  } catch (error) {
    if (error.status !== 404) {
      console.log(
        `⚠️ Unexpected error fetching GitHub release for tag ${config.github_ref}: ${error}`,
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
      previous_tag_name,
    );
  }
};

/**
 * Finalizes a release by unmarking it as "draft" (if relevant)
 * after all artifacts have been uploaded.
 *
 * @param config - Release configuration as specified by user
 * @param releaser - The GitHub API wrapper for release operations
 * @param release - The existing release to be finalized
 * @param maxRetries - The maximum number of attempts to finalize the release
 */
export const finalizeRelease = async (
  config: Config,
  releaser: Releaser,
  release: Release,
  releaseWasCreated: boolean = false,
  maxRetries: number = 3,
): Promise<Release> => {
  if (config.input_draft === true || release.draft === false) {
    return release;
  }

  if (maxRetries <= 0) {
    console.log(`❌ Too many retries. Aborting...`);
    throw new Error('Too many retries.');
  }

  const [owner, repo] = config.github_repository.split('/');
  try {
    const { data } = await releaser.finalizeRelease({
      owner,
      repo,
      release_id: release.id,
      make_latest: config.input_make_latest,
    });

    return data;
  } catch (error) {
    console.warn(`error finalizing release: ${error}`);

    if (releaseWasCreated && release.draft && isTagCreationBlockedError(error)) {
      let deleted = false;

      try {
        console.log(
          `🧹 Deleting draft release ${release.id} for tag ${release.tag_name} because tag creation is blocked by repository rules...`,
        );
        await releaser.deleteRelease({
          owner,
          repo,
          release_id: release.id,
        });
        deleted = true;
      } catch (cleanupError) {
        console.warn(`error deleting orphan draft release ${release.id}: ${cleanupError}`);
      }

      const cleanupResult = deleted
        ? `Deleted draft release ${release.id} to avoid leaving an orphaned draft release.`
        : `Failed to delete draft release ${release.id}; manual cleanup may still be required.`;
      throw new Error(
        `Tag creation for ${release.tag_name} is blocked by repository rules. ${cleanupResult}`,
      );
    }

    console.log(`retrying... (${maxRetries - 1} retries remaining)`);
    return finalizeRelease(config, releaser, release, releaseWasCreated, maxRetries - 1);
  }
};

/**
 * Lists assets belonging to a release.
 *
 * @param config - Release configuration as specified by user
 * @param releaser - The GitHub API wrapper for release operations
 * @param release - The existing release to be checked
 * @param maxRetries - The maximum number of attempts
 */
export const listReleaseAssets = async (
  config: Config,
  releaser: Releaser,
  release: Release,
  maxRetries: number = 3,
): Promise<Array<{ id: number; name: string; [key: string]: any }>> => {
  if (maxRetries <= 0) {
    console.log(`❌ Too many retries. Aborting...`);
    throw new Error('Too many retries.');
  }

  const [owner, repo] = config.github_repository.split('/');
  try {
    const assets = await releaser.listReleaseAssets({
      owner,
      repo,
      release_id: release.id,
    });

    return assets;
  } catch (error) {
    console.warn(`error listing assets of release: ${error}`);
    console.log(`retrying... (${maxRetries - 1} retries remaining)`);
    return listReleaseAssets(config, releaser, release, maxRetries - 1);
  }
};

/**
 * Finds a release by tag name.
 *
 * Uses the direct getReleaseByTag API for O(1) lookup instead of iterating
 * through all releases. This also avoids GitHub's API pagination limit of
 * 10000 results which would cause failures for repositories with many releases.
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
  try {
    const { data: release } = await releaser.getReleaseByTag({ owner, repo, tag });
    return release;
  } catch (error) {
    // Release not found (404) or other error - return undefined to allow creation
    if (error.status === 404) {
      return undefined;
    }
    // Re-throw unexpected errors
    throw error;
  }
}

const CREATED_RELEASE_DISCOVERY_RETRY_DELAY_MS = 1000;
const RECENT_RELEASE_SCAN_PAGES = 2;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function recentReleasesByTag(
  releaser: Releaser,
  owner: string,
  repo: string,
  tag: string,
): Promise<Release[]> {
  const matches: Release[] = [];
  let pages = 0;

  for await (const page of releaser.allReleases({ owner, repo })) {
    matches.push(...page.data.filter((release) => release.tag_name === tag));
    pages += 1;

    if (pages >= RECENT_RELEASE_SCAN_PAGES) {
      break;
    }
  }

  return matches;
}

function pickCanonicalRelease(
  releases: Release[],
  releaseByTag: Release | undefined,
): Release | undefined {
  if (releaseByTag && releases.some((release) => release.id === releaseByTag.id)) {
    return releaseByTag;
  }

  if (releases.length === 0) {
    return releaseByTag;
  }

  return [...releases].sort((left, right) => {
    if (left.draft !== right.draft) {
      return Number(left.draft) - Number(right.draft);
    }

    return left.id - right.id;
  })[0];
}

async function cleanupDuplicateDraftReleases(
  releaser: Releaser,
  owner: string,
  repo: string,
  tag: string,
  canonicalReleaseId: number,
  releases: Release[],
): Promise<void> {
  const uniqueReleases = Array.from(
    new Map(releases.map((release) => [release.id, release])).values(),
  );

  for (const duplicate of uniqueReleases) {
    if (duplicate.id === canonicalReleaseId || !duplicate.draft || duplicate.assets.length > 0) {
      continue;
    }

    try {
      console.log(`🧹 Removing duplicate draft release ${duplicate.id} for tag ${tag}...`);
      await releaser.deleteRelease({
        owner,
        repo,
        release_id: duplicate.id,
      });
    } catch (error) {
      console.warn(`error deleting duplicate release ${duplicate.id}: ${error}`);
    }
  }
}

async function canonicalizeCreatedRelease(
  releaser: Releaser,
  owner: string,
  repo: string,
  tag: string,
  createdRelease: Release,
  maxRetries: number,
): Promise<Release> {
  const attempts = Math.max(maxRetries, 1);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let releaseByTag: Release | undefined;
    try {
      releaseByTag = await findTagFromReleases(releaser, owner, repo, tag);
    } catch (error) {
      console.warn(`error reloading release for tag ${tag}: ${error}`);
    }

    let recentReleases: Release[] = [];
    try {
      recentReleases = await recentReleasesByTag(releaser, owner, repo, tag);
    } catch (error) {
      console.warn(`error listing recent releases for tag ${tag}: ${error}`);
    }

    const canonicalRelease = pickCanonicalRelease(recentReleases, releaseByTag);
    if (canonicalRelease) {
      if (canonicalRelease.id !== createdRelease.id) {
        console.log(
          `↪️ Using release ${canonicalRelease.id} for tag ${tag} instead of duplicate draft ${createdRelease.id}`,
        );
      }

      await cleanupDuplicateDraftReleases(releaser, owner, repo, tag, canonicalRelease.id, [
        createdRelease,
        ...recentReleases,
      ]);
      return canonicalRelease;
    }

    if (attempt < attempts) {
      console.log(
        `Release ${createdRelease.id} is not yet discoverable by tag ${tag}, retrying... (${
          attempts - attempt
        } retries remaining)`,
      );
      await sleep(CREATED_RELEASE_DISCOVERY_RETRY_DELAY_MS);
    }
  }

  console.log(
    `⚠️ Continuing with newly created release ${createdRelease.id} because tag ${tag} is still not discoverable`,
  );
  return createdRelease;
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
  previous_tag_name: string | undefined,
): Promise<ReleaseResult> {
  const tag_name = tag;
  const name = config.input_name || tag;
  const body = releaseBody(config);
  const prerelease = config.input_prerelease;
  const draft = prerelease === true ? config.input_draft === true : true;
  const target_commitish = config.input_target_commitish;
  const make_latest = config.input_make_latest;
  let commitMessage: string = '';
  if (target_commitish) {
    commitMessage = ` using commit "${target_commitish}"`;
  }
  console.log(`👩‍🏭 Creating new GitHub release for tag ${tag_name}${commitMessage}...`);
  try {
    const createdRelease = await releaser.createRelease({
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
      previous_tag_name,
    });
    const canonicalRelease = await canonicalizeCreatedRelease(
      releaser,
      owner,
      repo,
      tag_name,
      createdRelease.data,
      maxRetries,
    );
    return {
      release: canonicalRelease,
      created: canonicalRelease.id === createdRelease.data.id,
    };
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

function isTagCreationBlockedError(error: any): boolean {
  const errors = error?.response?.data?.errors;
  if (!Array.isArray(errors) || error?.status !== 422) {
    return false;
  }

  return errors.some(
    ({ field, message }: { field?: string; message?: string }) =>
      field === 'pre_receive' &&
      typeof message === 'string' &&
      message.includes('creations being restricted'),
  );
}
