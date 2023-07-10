import fetch from "node-fetch";
import { GitHub } from "@actions/github/lib/utils";
import { Config, isTag, releaseBody } from "./util";
import { statSync, readFileSync } from "fs";
import { getType } from "mime";
import { basename } from "path";

type GitHub = InstanceType<typeof GitHub>;

export interface ReleaseAsset {
  name: string;
  mime: string;
  size: number;
  data: Buffer;
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
  getReleaseByTag(params: {
    owner: string;
    repo: string;
    tag: string;
  }): Promise<{ data: Release }>;

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
  }): Promise<{ data: Release }>;

  allReleases(params: {
    owner: string;
    repo: string;
  }): AsyncIterableIterator<{ data: Release[] }>;

  getLatestTag(params: {
    owner: string;
    repo: string;
  }): Promise<undefined | string>;

  generateReleaseBody(
    params: Parameters<GitHub["rest"]["repos"]["generateReleaseNotes"]>[0]
  ): Promise<string>;
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
  }): Promise<{ data: Release }> {
    return this.github.rest.repos.createRelease({
      ...params,
      generate_release_notes: false,
    });
  }

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
  }): Promise<{ data: Release }> {
    return this.github.rest.repos.updateRelease({
      ...params,
      generate_release_notes: false,
    });
  }

  allReleases(params: {
    owner: string;
    repo: string;
  }): AsyncIterableIterator<{ data: Release[] }> {
    const updatedParams = { per_page: 100, ...params };
    return this.github.paginate.iterator(
      this.github.rest.repos.listReleases.endpoint.merge(updatedParams)
    );
  }

  async getLatestTag(params: {
    owner: string;
    repo: string;
  }): Promise<undefined | string> {
    try {
      const release = await this.github.rest.repos.getLatestRelease(params);

      if (!release?.data) {
        return;
      }

      return release.data.tag_name;
    } catch (e) {
      console.error(e);

      return;
    }
  }

  async generateReleaseBody(
    params: Parameters<GitHub["rest"]["repos"]["generateReleaseNotes"]>[0]
  ): Promise<string> {
    try {
      const { data } = await this.github.rest.repos.generateReleaseNotes(params);

      if (!data.body) {
        throw new Error("No release body generated");
      }

      return data.body;
    } catch (e) {
      throw e;
    }
  }
}

export const asset = (path: string): ReleaseAsset => {
  return {
    name: basename(path),
    mime: mimeOrDefault(path),
    size: statSync(path).size,
    data: readFileSync(path),
  };
};

export const mimeOrDefault = (path: string): string => {
  return getType(path) || "application/octet-stream";
};

export const upload = async (
  config: Config,
  github: GitHub,
  url: string,
  path: string,
  currentAssets: Array<{ id: number; name: string }>
): Promise<any> => {
  const [owner, repo] = config.github_repository.split("/");
  const { name, size, mime, data: body } = asset(path);
  const currentAsset = currentAssets.find(
    ({ name: currentName }) => currentName == name
  );
  if (currentAsset) {
    console.log(`♻️ Deleting previously uploaded asset ${name}...`);
    await github.rest.repos.deleteReleaseAsset({
      asset_id: currentAsset.id || 1,
      owner,
      repo,
    });
  }
  console.log(`⬆️ Uploading ${name}...`);
  const endpoint = new URL(url);
  endpoint.searchParams.append("name", name);
  const resp = await fetch(endpoint, {
    headers: {
      "content-length": `${size}`,
      "content-type": mime,
      authorization: `token ${config.github_token}`,
    },
    method: "POST",
    body,
  });
  const json = await resp.json();
  if (resp.status !== 201) {
    throw new Error(
      `Failed to upload release asset ${name}. received status code ${
        resp.status
      }\n${json.message}\n${JSON.stringify(json.errors)}`
    );
  }
  return json;
};

export const release = async (
  config: Config,
  releaser: Releaser,
  maxRetries: number = 3
): Promise<Release> => {
  if (maxRetries <= 0) {
    console.log(`❌ Too many retries. Aborting...`);
    throw new Error("Too many retries.");
  }

  const [owner, repo] = config.github_repository.split("/");
  const tag =
    config.input_tag_name ||
    (isTag(config.github_ref)
      ? config.github_ref.replace("refs/tags/", "")
      : "");

  const previous_tag = config.input_previous_tag;
  const discussion_category_name = config.input_discussion_category_name;
  const generate_release_notes = config.input_generate_release_notes;

  const latestTag: string | undefined = !previous_tag
      ? await releaser.getLatestTag({
          owner,
          repo,
        })
      : undefined;

  if (latestTag) {
    console.log(`🏷️ Latest tag related to a release is ${latestTag}`);
  } else if (previous_tag) {
    console.log(`🏷️ Previous tag is ${previous_tag}`);
  }

  const tag_name = tag;

  let body: string = generate_release_notes
    ? await releaser.generateReleaseBody({
        owner,
        repo,
        tag_name,
        previous_tag_name: previous_tag || latestTag,
      })
    : "";

  if (generate_release_notes && previous_tag || latestTag) {
    console.log(`Will generate release notes using ${previous_tag || latestTag} as previous tag`);
  }

  body = body ? `${body}\n` : "";

  try {
    // you can't get a an existing draft by tag
    // so we must find one in the list of all releases
    if (config.input_draft) {
      for await (const response of releaser.allReleases({
        owner,
        repo,
      })) {
        let release = response.data.find((release) => release.tag_name === tag);
        if (release) {
          return release;
        }
      }
    }
    let existingRelease = await releaser.getReleaseByTag({
      owner,
      repo,
      tag,
    });

    const release_id = existingRelease.data.id;
    let target_commitish: string;
    if (
      config.input_target_commitish &&
      config.input_target_commitish !== existingRelease.data.target_commitish
    ) {
      console.log(
        `Updating commit from "${existingRelease.data.target_commitish}" to "${config.input_target_commitish}"`
      );
      target_commitish = config.input_target_commitish;
    } else {
      target_commitish = existingRelease.data.target_commitish;
    }

    const name = config.input_name || existingRelease.data.name || tag;
    // revisit: support a new body-concat-strategy input for accumulating
    // body parts as a release gets updated. some users will likely want this while
    // others won't previously this was duplicating content for most which
    // no one wants
    const workflowBody = releaseBody(config) || "";
    const existingReleaseBody = existingRelease.data.body || "";

    if (config.input_append_body && workflowBody && existingReleaseBody) {
      console.log('➕ Appending existing release body');
      body = body + existingReleaseBody + "\n" + workflowBody;
    } else {
      console.log(`➕ Using ${workflowBody ? 'workflow body' : 'existing release body'}`);
      body = body + (workflowBody || existingReleaseBody);
    }

    const draft =
      config.input_draft !== undefined
        ? config.input_draft
        : existingRelease.data.draft;
    const prerelease =
      config.input_prerelease !== undefined
        ? config.input_prerelease
        : existingRelease.data.prerelease;

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
    });
    return release.data;
  } catch (error) {
    if (error.status === 404) {
      const tag_name = tag;
      const name = config.input_name || tag;
      const workflowBody = releaseBody(config) || "";

      if (config.input_append_body && workflowBody) {
        console.log('➕ Appending existing release body');
        body = body + workflowBody;
      }

      const draft = config.input_draft;
      const prerelease = config.input_prerelease;
      const target_commitish = config.input_target_commitish;
      let commitMessage: string = "";
      if (target_commitish) {
        commitMessage = ` using commit "${target_commitish}"`;
      }
      console.log(
        `👩‍🏭 Creating new GitHub release for tag ${tag_name}${commitMessage}...`
      );
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
        });
        return release.data;
      } catch (error) {
        // presume a race with competing metrix runs
        console.log(
          `⚠️ GitHub release failed with status: ${
            error.status
          }\n${JSON.stringify(error.response.data.errors)}\nretrying... (${
            maxRetries - 1
          } retries remaining)`
        );
        return release(config, releaser, maxRetries - 1);
      }
    } else {
      console.log(
        `⚠️ Unexpected error fetching GitHub release for tag ${config.github_ref}: ${error}`
      );
      throw error;
    }
  }
};
