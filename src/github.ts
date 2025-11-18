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
}

export class GitHubReleaser implements Releaser {
  github: GitHub;
  constructor(github: GitHub) {
    this.github = github;
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
      try {
        const releaseNotes = await this.getReleaseNotes(params);
        params.generate_release_notes = false;
        if (params.body) {
          params.body = `${params.body}\n\n${releaseNotes.data.body}`;
        } else {
          params.body = releaseNotes.data.body;
        }
      } catch (error: any) {
        // Handle GitHub API error when there are more than 10,000 commits
        const status = error?.status || error?.response?.status;
        const message = error?.message || error?.response?.data?.message || '';
        if (status === 422 && (message.includes('10000') || message.includes('10000 results'))) {
          console.warn(
            `⚠️  Unable to generate release notes: GitHub API limit exceeded (more than 10,000 commits since last release). Proceeding without generated release notes.`,
          );
          params.generate_release_notes = false;
          // Continue with existing body or leave it empty
        } else {
          // Re-throw other errors
          throw error;
        }
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
      try {
        const releaseNotes = await this.getReleaseNotes(params);
        params.generate_release_notes = false;
        if (params.body) {
          params.body = `${params.body}\n\n${releaseNotes.data.body}`;
        } else {
          params.body = releaseNotes.data.body;
        }
      } catch (error: any) {
        // Handle GitHub API error when there are more than 10,000 commits
        const status = error?.status || error?.response?.status;
        const message = error?.message || error?.response?.data?.message || '';
        if (status === 422 && (message.includes('10000') || message.includes('10000 results'))) {
          console.warn(
            `⚠️  Unable to generate release notes: GitHub API limit exceeded (more than 10,000 commits since last release). Proceeding without generated release notes.`,
          );
          params.generate_release_notes = false;
          // Continue with existing body or leave it empty
        } else {
          // Re-throw other errors
          throw error;
        }
      }
    }
    params.body = params.body ? this.truncateReleaseNotes(params.body) : undefined;
    return this.github.rest.repos.updateRelease(params);
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
): Promise<Release> => {
  const [owner, repo] = config.github_repository.split('/');
  const tag =
    config.input_tag_name ||
    (isTag(config.github_ref) ? config.github_ref.replace('refs/tags/', '') : '');

  const tag_name = tag;
  const name = config.input_name || tag;
  const body = releaseBody(config);
  const draft = config.input_draft;
  const prerelease = config.input_prerelease;
  const target_commitish = config.input_target_commitish;
  const discussion_category_name = config.input_discussion_category_name;
  const generate_release_notes = config.input_generate_release_notes;
  const make_latest = config.input_make_latest;
  
  let commitMessage: string = '';
  if (target_commitish) {
    commitMessage = ` using commit "${target_commitish}"`;
  }
  console.log(`👩‍🏭 Creating new GitHub release for tag ${tag_name}${commitMessage}...`);
  
  const release = await releaser.createRelease({
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
};
