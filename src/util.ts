import * as glob from "glob";
import { lstatSync, readFileSync } from "fs";

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
  input_draft?: boolean;
  input_prerelease?: boolean;
  input_fail_on_unmatched_files?: boolean;
  input_target_commitish?: string;
}

export const releaseBody = (config: Config): string | undefined => {
  return (
    (config.input_body_path &&
      readFileSync(config.input_body_path).toString("utf8")) ||
    config.input_body
  );
};

type Env = { [key: string]: string | undefined };

export const parseInputFiles = (files: string): string[] => {
  return files.split(/\r?\n/).reduce<string[]>(
    (acc, line) =>
      acc
        .concat(line.split(","))
        .filter(pat => pat)
        .map(pat => pat.trim()),
    []
  );
};

export const parseConfig = (env: Env): Config => {
  return {
    github_token: env.GITHUB_TOKEN || env.INPUT_TOKEN || "",
    github_ref: env.GITHUB_REF || "",
    github_repository: env.INPUT_REPOSITORY || env.GITHUB_REPOSITORY || "",
    input_name: env.INPUT_NAME,
    input_tag_name: env.INPUT_TAG_NAME?.trim(),
    input_body: env.INPUT_BODY,
    input_body_path: env.INPUT_BODY_PATH,
    input_files: parseInputFiles(env.INPUT_FILES || ""),
    input_draft: env.INPUT_DRAFT ? env.INPUT_DRAFT === "true" : undefined,
    input_prerelease: env.INPUT_PRERELEASE
      ? env.INPUT_PRERELEASE == "true"
      : undefined,
    input_fail_on_unmatched_files: env.INPUT_FAIL_ON_UNMATCHED_FILES == "true",
    input_target_commitish: env.INPUT_TARGET_COMMITISH
  };
};

export const paths = (patterns: string[]): string[] => {
  return patterns.reduce((acc: string[], pattern: string): string[] => {
    return acc.concat(
      glob.sync(pattern).filter(path => lstatSync(path).isFile())
    );
  }, []);
};

export const unmatchedPatterns = (patterns: string[]): string[] => {
  return patterns.reduce((acc: string[], pattern: string): string[] => {
    return acc.concat(
      glob.sync(pattern).filter(path => lstatSync(path).isFile()).length == 0
        ? [pattern]
        : []
    );
  }, []);
};

export const isTag = (ref: string): boolean => {
  return ref.startsWith("refs/tags/");
};
