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

export const release = async (config: Config, gh: GitHub): Promise<Release> => {
  const [owner, repo] = config.github_repository.split("/");
  const tag = config.github_ref.replace("refs/tags/", "");
  try {
    let release = await gh.repos.getReleaseByTag({
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
        let release = await gh.repos.createRelease({
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
        console.log(`GitHub release failed with status: ${error.status}`);
        return release(config, gh);
      }
    } else {
      console.log(
        `Unexpected error fetching GitHub release for tag ${config.github_ref}: ${error}`
      );
      throw error;
    }
  }
};
