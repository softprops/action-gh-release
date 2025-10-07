import * as glob from 'glob';
import { statSync, readFileSync } from 'fs';
import * as pathLib from 'path';

export interface Config {
  github_token: string;
  github_ref: string;
  github_repository: string;
  // user provided
  input_name?: string;
  input_tag_name?: string;
  input_repository?: string;
  input_body?: string;
  input_body_path?: string;
  input_files?: string[];
  input_working_directory?: string;
  input_overwrite_files?: boolean;
  input_draft?: boolean;
  input_preserve_order?: boolean;
  input_prerelease?: boolean;
  input_fail_on_unmatched_files?: boolean;
  input_target_commitish?: string;
  input_discussion_category_name?: string;
  input_generate_release_notes?: boolean;
  input_append_body?: boolean;
  input_make_latest: 'true' | 'false' | 'legacy' | undefined;
}

export const uploadUrl = (url: string): string => {
  const templateMarkerPos = url.indexOf('{');
  if (templateMarkerPos > -1) {
    return url.substring(0, templateMarkerPos);
  }
  return url;
};

export const releaseBody = (config: Config): string | undefined => {
  return (
    (config.input_body_path && readFileSync(config.input_body_path).toString('utf8')) ||
    config.input_body
  );
};

type Env = { [key: string]: string | undefined };

const smartSplit = (input: string): string[] => {
  const result: string[] = [];
  let current = '';
  let braceDepth = 0;

  for (const ch of input) {
    if (ch === '{') {
      braceDepth++;
    }
    if (ch === '}') {
      braceDepth--;
    }
    if (ch === ',' && braceDepth === 0) {
      if (current.trim()) {
        result.push(current.trim());
      }
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    result.push(current.trim());
  }
  return result;
};

export const parseInputFiles = (files: string): string[] => {
  return files
    .split(/\r?\n/)
    .flatMap((line) => smartSplit(line))
    .filter((pat) => pat.trim() !== '');
};

export const parseConfig = (env: Env): Config => {
  return {
    github_token: env.GITHUB_TOKEN || env.INPUT_TOKEN || '',
    github_ref: env.GITHUB_REF || '',
    github_repository: env.INPUT_REPOSITORY || env.GITHUB_REPOSITORY || '',
    input_name: env.INPUT_NAME,
    input_tag_name: env.INPUT_TAG_NAME?.trim(),
    input_body: env.INPUT_BODY,
    input_body_path: env.INPUT_BODY_PATH,
    input_files: parseInputFiles(env.INPUT_FILES || ''),
    input_working_directory: env.INPUT_WORKING_DIRECTORY || undefined,
    input_overwrite_files: env.INPUT_OVERWRITE_FILES
      ? env.INPUT_OVERWRITE_FILES == 'true'
      : undefined,
    input_draft: env.INPUT_DRAFT ? env.INPUT_DRAFT === 'true' : undefined,
    input_preserve_order: env.INPUT_PRESERVE_ORDER ? env.INPUT_PRESERVE_ORDER == 'true' : undefined,
    input_prerelease: env.INPUT_PRERELEASE ? env.INPUT_PRERELEASE == 'true' : undefined,
    input_fail_on_unmatched_files: env.INPUT_FAIL_ON_UNMATCHED_FILES == 'true',
    input_target_commitish: env.INPUT_TARGET_COMMITISH || undefined,
    input_discussion_category_name: env.INPUT_DISCUSSION_CATEGORY_NAME || undefined,
    input_generate_release_notes: env.INPUT_GENERATE_RELEASE_NOTES == 'true',
    input_append_body: env.INPUT_APPEND_BODY == 'true',
    input_make_latest: parseMakeLatest(env.INPUT_MAKE_LATEST),
  };
};

const parseMakeLatest = (value: string | undefined): 'true' | 'false' | 'legacy' | undefined => {
  if (value === 'true' || value === 'false' || value === 'legacy') {
    return value;
  }
  return undefined;
};

export const paths = (patterns: string[], cwd?: string): string[] => {
  return patterns.reduce((acc: string[], pattern: string): string[] => {
    const matches = glob.sync(pattern, { cwd, dot: true, absolute: false });
    const resolved = matches
      .map((p) => (cwd ? pathLib.join(cwd, p) : p))
      .filter((p) => {
        try {
          return statSync(p).isFile();
        } catch {
          return false;
        }
      });
    return acc.concat(resolved);
  }, []);
};

export const unmatchedPatterns = (patterns: string[], cwd?: string): string[] => {
  return patterns.reduce((acc: string[], pattern: string): string[] => {
    const matches = glob.sync(pattern, { cwd, dot: true, absolute: false });
    const files = matches.filter((p) => {
      try {
        const full = cwd ? pathLib.join(cwd, p) : p;
        return statSync(full).isFile();
      } catch {
        return false;
      }
    });
    return acc.concat(files.length == 0 ? [pattern] : []);
  }, []);
};

export const isTag = (ref: string): boolean => {
  return ref.startsWith('refs/tags/');
};

export const alignAssetName = (assetName: string): string => {
  return assetName.replace(/ /g, '.');
};
