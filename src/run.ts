import { setFailed, setOutput } from '@actions/core';
import { getOctokit } from '@actions/github';
import { env } from 'process';
import { GitHubReleaser, release, finalizeRelease, upload, listReleaseAssets } from './github';
import { errorMessage, isTag, parseConfig, paths, unmatchedPatterns, uploadUrl } from './util';

export async function run(): Promise<void> {
  try {
    const config = parseConfig(env);
    if (!config.input_tag_name && !isTag(config.github_ref) && !config.input_draft) {
      throw new Error(`⚠️ GitHub Releases requires a tag`);
    }
    if (config.input_files) {
      const patterns = unmatchedPatterns(config.input_files, config.input_working_directory);
      patterns.forEach((pattern) => {
        if (config.input_fail_on_unmatched_files) {
          throw new Error(`⚠️  Pattern '${pattern}' does not match any files.`);
        } else {
          console.warn(`🤔 Pattern '${pattern}' does not match any files.`);
        }
      });
    }

    const gh = getOctokit(config.github_token, {
      throttle: {
        onRateLimit: (retryAfter, options) => {
          console.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
          if (options.request.retryCount === 0) {
            console.log(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
        },
        onAbuseLimit: (_retryAfter, options) => {
          console.warn(`Abuse detected for request ${options.method} ${options.url}`);
        },
      },
    });
    const releaser = new GitHubReleaser(gh);
    const releaseResult = await release(config, releaser);
    let rel = releaseResult.release;
    const releaseWasCreated = releaseResult.created;
    let uploadedAssetIds: Set<number> = new Set();
    if (config.input_files && config.input_files.length > 0) {
      const files = paths(config.input_files, config.input_working_directory);
      if (files.length === 0) {
        if (config.input_fail_on_unmatched_files) {
          throw new Error(`⚠️ ${config.input_files} does not include a valid file.`);
        } else {
          console.warn(`🤔 ${config.input_files} does not include a valid file.`);
        }
      }
      const currentAssets = rel.assets;

      const uploadFile = async (path: string) => {
        const json = await upload(config, releaser, uploadUrl(rel.upload_url), path, currentAssets);
        return json ? (json.id as number) : undefined;
      };

      let results: (number | undefined)[];
      if (!config.input_preserve_order) {
        results = await Promise.all(files.map(uploadFile));
      } else {
        results = [];
        for (const path of files) {
          results.push(await uploadFile(path));
        }
      }

      uploadedAssetIds = new Set(results.filter((id): id is number => id !== undefined));
    }

    console.log('Finalizing release...');
    rel = await finalizeRelease(config, releaser, rel, releaseWasCreated);

    // Draft releases use temporary "untagged-..." URLs for assets.
    // URLs will be changed to correct ones once the release is published.
    console.log('Getting assets list...');
    let assets: any[] = [];
    if (uploadedAssetIds.size > 0) {
      const updatedAssets = await listReleaseAssets(config, releaser, rel);
      assets = updatedAssets
        .filter((asset) => uploadedAssetIds.has(asset.id))
        .map((asset) => {
          const { uploader, ...rest } = asset;
          return rest;
        });
    }
    setOutput('assets', assets);

    console.log(`🎉 Release ready at ${rel.html_url}`);
    setOutput('url', rel.html_url);
    setOutput('id', rel.id.toString());
    setOutput('upload_url', rel.upload_url);
  } catch (error: unknown) {
    setFailed(errorMessage(error));
  }
}
