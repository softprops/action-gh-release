import * as glob from "glob";
import { lstatSync } from "fs";

export interface Config {
  github_token: string;
  github_ref: string;
  github_repository: string;
  // user provided
  input_name?: string;
  input_body?: string;
  input_body_path?: string;
  input_files?: string[];
  input_draft?: boolean;
}

type Env = { [key: string]: string | undefined };

export const parseConfig = (env: Env): Config => {
  return {
    github_token: env.GITHUB_TOKEN || "",
    github_ref: env.GITHUB_REF || "",
    github_repository: env.GITHUB_REPOSITORY || "",
    input_name: env.INPUT_NAME,
    input_body: env.INPUT_BODY,
    input_body_path: env.INPUT_BODY_PATH,
    input_files: (env.INPUT_FILES || "").split(","),
    input_draft: env.INPUT_DRAFT === "true"
  };
};

export const paths = (patterns: string[]): string[] => {
  return patterns.reduce((acc: string[], pattern: string): string[] => {
    return acc.concat(
      glob.sync(pattern).filter(path => lstatSync(path).isFile())
    );
  }, []);
};

export const isTag = (ref: string): boolean => {
  return ref.startsWith("refs/tags/");
};
