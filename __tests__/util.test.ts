import {
  releaseBody,
  isTag,
  paths,
  parseConfig,
  parseInputFiles,
  unmatchedPatterns
} from "../src/util";
import * as assert from "assert";

describe("util", () => {
  describe("parseInputFiles", () => {
    it("parses empty strings", () => {
      assert.deepStrictEqual(parseInputFiles(""), []);
    });
    it("parses comma-delimited strings", () => {
      assert.deepStrictEqual(parseInputFiles("foo,bar"), ["foo", "bar"]);
    });
    it("parses newline and comma-delimited (and then some)", () => {
      assert.deepStrictEqual(
        parseInputFiles("foo,bar\nbaz,boom,\n\ndoom,loom "),
        ["foo", "bar", "baz", "boom", "doom", "loom"]
      );
    });
  });
  describe("releaseBody", () => {
    it("uses input body", () => {
      assert.equal(
        "foo",
        releaseBody({
          github_ref: "",
          github_repository: "",
          github_token: "",
          input_body: "foo",
          input_body_path: undefined,
          input_draft: false,
          input_prerelease: false,
          input_files: [],
          input_name: undefined,
          input_tag_name: undefined,
          input_target_commitish: undefined
        })
      );
    });
    it("uses input body path", () => {
      assert.equal(
        "bar",
        releaseBody({
          github_ref: "",
          github_repository: "",
          github_token: "",
          input_body: undefined,
          input_body_path: "__tests__/release.txt",
          input_draft: false,
          input_prerelease: false,
          input_files: [],
          input_name: undefined,
          input_tag_name: undefined,
          input_target_commitish: undefined
        })
      );
    });
    it("defaults to body path when both body and body path are provided", () => {
      assert.equal(
        "bar",
        releaseBody({
          github_ref: "",
          github_repository: "",
          github_token: "",
          input_body: "foo",
          input_body_path: "__tests__/release.txt",
          input_draft: false,
          input_prerelease: false,
          input_files: [],
          input_name: undefined,
          input_tag_name: undefined,
          input_target_commitish: undefined
        })
      );
    });
  });
  describe("parseConfig", () => {
    it("parses basic config", () => {
      assert.deepStrictEqual(parseConfig({}), {
        github_ref: "",
        github_repository: "",
        github_token: "",
        input_body: undefined,
        input_body_path: undefined,
        input_draft: undefined,
        input_prerelease: undefined,
        input_files: [],
        input_name: undefined,
        input_tag_name: undefined,
        input_fail_on_unmatched_files: false,
        input_target_commitish: undefined
      });
    });

    it("parses basic config with commitish", () => {
      assert.deepStrictEqual(
        parseConfig({
          INPUT_TARGET_COMMITISH: "affa18ef97bc9db20076945705aba8c516139abd"
        }),
        {
          github_ref: "",
          github_repository: "",
          github_token: "",
          input_body: undefined,
          input_body_path: undefined,
          input_draft: undefined,
          input_prerelease: undefined,
          input_files: [],
          input_name: undefined,
          input_tag_name: undefined,
          input_fail_on_unmatched_files: false,
          input_target_commitish: "affa18ef97bc9db20076945705aba8c516139abd"
        }
      );
    });
    it("prefers GITHUB_TOKEN over token input for backwards compatibility", () => {
      assert.deepStrictEqual(
        parseConfig({
          INPUT_DRAFT: "false",
          INPUT_PRERELEASE: "true",
          GITHUB_TOKEN: "env-token",
          INPUT_TOKEN: "input-token"
        }),
        {
          github_ref: "",
          github_repository: "",
          github_token: "env-token",
          input_body: undefined,
          input_body_path: undefined,
          input_draft: false,
          input_prerelease: true,
          input_files: [],
          input_name: undefined,
          input_tag_name: undefined,
          input_fail_on_unmatched_files: false,
          input_target_commitish: undefined
        }
      );
    });
    it("uses input token as the source of GITHUB_TOKEN by default", () => {
      assert.deepStrictEqual(
        parseConfig({
          INPUT_DRAFT: "false",
          INPUT_PRERELEASE: "true",
          INPUT_TOKEN: "input-token"
        }),
        {
          github_ref: "",
          github_repository: "",
          github_token: "input-token",
          input_body: undefined,
          input_body_path: undefined,
          input_draft: false,
          input_prerelease: true,
          input_files: [],
          input_name: undefined,
          input_tag_name: undefined,
          input_fail_on_unmatched_files: false,
          input_target_commitish: undefined
        }
      );
    });
    it("parses basic config with draft and prerelease", () => {
      assert.deepStrictEqual(
        parseConfig({
          INPUT_DRAFT: "false",
          INPUT_PRERELEASE: "true"
        }),
        {
          github_ref: "",
          github_repository: "",
          github_token: "",
          input_body: undefined,
          input_body_path: undefined,
          input_draft: false,
          input_prerelease: true,
          input_files: [],
          input_name: undefined,
          input_tag_name: undefined,
          input_fail_on_unmatched_files: false,
          input_target_commitish: undefined
        }
      );
    });
  });
  describe("isTag", () => {
    it("returns true for tags", async () => {
      assert.equal(isTag("refs/tags/foo"), true);
    });
    it("returns false for other kinds of refs", async () => {
      assert.equal(isTag("refs/heads/master"), false);
    });
  });

  describe("paths", () => {
    it("resolves files given a set of paths", async () => {
      assert.deepStrictEqual(
        paths(["tests/data/**/*", "tests/data/does/not/exist/*"]),
        ["tests/data/foo/bar.txt"]
      );
    });
  });

  describe("unmatchedPatterns", () => {
    it("returns the patterns that don't match any files", async () => {
      assert.deepStrictEqual(
        unmatchedPatterns(["tests/data/**/*", "tests/data/does/not/exist/*"]),
        ["tests/data/does/not/exist/*"]
      );
    });
  });
});
