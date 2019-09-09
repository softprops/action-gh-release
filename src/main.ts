
import { paths, parseConfig, isTag } from './util';
import { release, upload } from './github';
import { setFailed } from '@actions/core';
import { GitHub } from '@actions/github';
import { env } from 'process';

async function run() {
  try {
    const config = parseConfig(env);
    if (!isTag(config.github_ref)) {
      throw new Error(`⚠️ GitHub Releases requires a tag`);
    }
    const gh = new GitHub(config.github_token);
    let rel = await release(config, gh);
    if (config.input_files) {
      paths(config.input_files).forEach(async (path) => {
        await upload(gh, rel.upload_url, path)
      });
    }
    console.log(`🎉 Release ready at ${rel.html_url}`)
  } catch (error) {
    setFailed(error.message);
  }
}

run();