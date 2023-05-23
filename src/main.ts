import {
  paths,
  parseConfig,
  isTag,
  unmatchedPatterns,
  uploadUrl,
} from "./util";
import { release, upload, GitHubReleaser } from "./github";
import { getOctokit } from "@actions/github";
import { setFailed, setOutput } from "@actions/core";
import { GitHub, getOctokitOptions } from "@actions/github/lib/utils";
import * as fs from 'fs';

import { env } from "process";

async function run() {
  try {
    const config = parseConfig(env);
    if (
      !config.input_tag_name &&
      !isTag(config.github_ref) &&
      !config.input_draft
    ) {
      throw new Error(`⚠️ GitHub Releases requires a tag`);
    }
    if (config.input_files) {
      const patterns = unmatchedPatterns(config.input_files);
      patterns.forEach((pattern) => {
        console.warn(pattern);
        // Rename file using oldName:newName notation
        if (pattern.includes(":")) {
          let names = pattern.split(':');
          let oldName = names[0];
          let newName = names[1];
          fs.rename(oldName, newName, () => {
              console.warn(`🤔Renamed file from '${oldName}' to '${newName}!`);
          });
        }
        else {
          console.warn(`🤔 Pattern '${pattern}' does not match any files.`)
        }
      });
      if (patterns.length > 0 && config.input_fail_on_unmatched_files) {
        throw new Error(`⚠️ There were unmatched files`);
      }
    }

    // const oktokit = GitHub.plugin(
    //   require("@octokit/plugin-throttling"),
    //   require("@octokit/plugin-retry")
    // );

    const gh = getOctokit(config.github_token, {
      //new oktokit(
      throttle: {
        onRateLimit: (retryAfter, options) => {
          console.warn(
            `Request quota exhausted for request ${options.method} ${options.url}`
          );
          if (options.request.retryCount === 0) {
            // only retries once
            console.log(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
        },
        onAbuseLimit: (retryAfter, options) => {
          // does not retry, only logs a warning
          console.warn(
            `Abuse detected for request ${options.method} ${options.url}`
          );
        },
      },
    });
    //);
    const rel = await release(config, new GitHubReleaser(gh));
    if (config.input_files) {
      const files = paths(config.input_files);
      config.input_files.forEach((file) => {
        if (file.includes(":")) {
          // Use the new name instead to upload
          files.push(file.split(":")[1]);
        }
      })
      if (files.length == 0) {
        console.warn(`🤔 ${config.input_files} did not include valid files.`);
      }
      const currentAssets = rel.assets;
      const assets = await Promise.all(
        files.map(async (path) => {
          const json = await upload(
            config,
            gh,
            uploadUrl(rel.upload_url),
            path,
            currentAssets
          );
          delete json.uploader;
          return json;
        })
      ).catch((error) => {
        throw error;
      });
      setOutput("assets", assets);
    }
    console.log(`🎉 Release ready at ${rel.html_url}`);
    setOutput("url", rel.html_url);
    setOutput("id", rel.id.toString());
    setOutput("upload_url", rel.upload_url);
  } catch (error) {
    setFailed(error.message);
  }
}

run();
