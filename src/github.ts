import { GitHub } from "@actions/github";
import { Config } from "./util";
import { lstatSync, readFileSync } from "fs";
import { getType } from "mime";
import { basename } from "path";

export interface ReleaseAsset {
  name: string;
  mime: string;
  size: number;
  file: Buffer;
}

export interface Release {
  upload_url: string;
  html_url: string;
  tag_name: string;
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
  }): Promise<{ data: Release }>;

  allReleases(params: {
    owner: string;
    repo: string;
  }): AsyncIterableIterator<{ data: Release[] }>;
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
    return this.github.repos.getReleaseByTag(params);
  }

  createRelease(params: {
    owner: string;
    repo: string;
    tag_name: string;
    name: string;
    body: string | undefined;
    draft: boolean | undefined;
  }): Promise<{ data: Release }> {
    return this.github.repos.createRelease(params);
  }

  allReleases(params: {
    owner: string;
    repo: string;
  }): AsyncIterableIterator<{ data: Release[] }> {
    return this.github.paginate.iterator(
      this.github.repos.listReleases.endpoint.merge(params)
    );
  }
}

export const asset = (path: string): ReleaseAsset => {
  return {
    name: basename(path),
    mime: mimeOrDefault(path),
    size: lstatSync(path).size,
    file: readFileSync(path)
  };
};

export const mimeOrDefault = (path: string): string => {
  return getType(path) || "application/octet-stream";
};

export const upload = async (
  gh: GitHub,
  url: string,
  path: string
): Promise<any> => {
  let { name, size, mime, file } = asset(path);
  console.log(`⬆️ Uploading ${name}...`);
  return await gh.repos.uploadReleaseAsset({
    url,
    headers: {
      "content-length": size,
      "content-type": mime
    },
    name,
    file
  });
};

export const release = async (
  config: Config,
  releaser: Releaser
): Promise<Release> => {
  const [owner, repo] = config.github_repository.split("/");
  const tag = config.github_ref.replace("refs/tags/", "");
  try {
    // you can't get a an existing draft by tag
    // so we must find one in the list of all releases
    if (config.input_draft) {
      for await (const response of releaser.allReleases({
        owner,
        repo
      })) {
        let release = response.data.find(release => release.tag_name === tag);
        if (release) {
          return release;
        }
      }
    }
    let release = await releaser.getReleaseByTag({
      owner,
      repo,
      tag
    });
    return release.data;
  } catch (error) {
    if (error.status === 404) {
      try {
        const tag_name = tag;
        const name = config.input_name || tag;
        const body = config.input_body;
        const draft = config.input_draft;
        console.log(`👩‍🏭 Creating new GitHub release for tag ${tag_name}...`);
        let release = await releaser.createRelease({
          owner,
          repo,
          tag_name,
          name,
          body,
          draft
        });
        return release.data;
      } catch (error) {
        // presume a race with competing metrix runs
        console.log(
          `⚠️ GitHub release failed with status: ${error.status}, retrying...`
        );
        return release(config, releaser);
      }
    } else {
      console.log(
        `⚠️ Unexpected error fetching GitHub release for tag ${config.github_ref}: ${error}`
      );
      throw error;
    }
  }
};
