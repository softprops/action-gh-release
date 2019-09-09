import { GitHub } from '@actions/github';
import { Config } from './util';
import { lstatSync, readFileSync } from 'fs';
import { getType } from 'mime';
import { basename } from 'path';

export interface ReleaseAsset {
  name: string,
  mime: string,
  size: number,
  file: Buffer
}

export interface Release {
	upload_url: string,
	html_url: string
}

export const asset = (path: string): ReleaseAsset => {
  return {
    name: basename(path),
    mime: mimeOrDefault(path),
    size: lstatSync(path).size,
    file: readFileSync(path)
  };
}

export const mimeOrDefault = (path: string): string => {
  return getType(path) || "application/octet-stream";
}

export const upload = async (
  gh: GitHub,
  url: string,
  path: string
): Promise<any> => {
  let {
    name,
    size,
    mime,
    file
  } = asset(path);
  console.log(`⬆️ Uploading ${name}...`);
  return await gh.repos.uploadReleaseAsset({
    url,
    headers:  {
      "content-length": size,
      "content-type": mime
    },
    name,
    file
  });
}

export const release = async (
  config: Config,
  gh: GitHub
): Promise<Release> => {
  let [owner, repo] = config.github_repository.split("/");
  try {
    let release = await gh.repos.getReleaseByTag({
      owner,
      repo,
      tag: config.github_ref
    });
    return release.data;
  } catch (error) {
    if (error.status === 404) {
      console.log("Creating new release...");
      const tag_name = config.github_ref.replace("refs/tags/", "");
      const name = config.input_name || tag_name;
      const body = config.input_body;
      const draft = config.input_draft;
      let release = await gh.repos.createRelease({
        owner,
        repo,
        tag_name,
        name,
        body,
        draft
      });
      return release.data;
    } else {
      console.log(`Unexpected error fetching github release for tag ${config.github_ref}: ${error}`);
      throw error;
    }
  }
}