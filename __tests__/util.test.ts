import { isTag, paths, parseConfig, parseInputFiles } from "../src/util";
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
  describe("parseConfig", () => {
    it("parses basic config", () => {
      assert.deepStrictEqual(parseConfig({}), {
        github_ref: "",
        github_repository: "",
        github_token: "",
        input_body: undefined,
        input_body_path: undefined,
        input_draft: false,
        input_prerelease: false,
        input_files: [],
        input_name: undefined
      });
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
      assert.deepStrictEqual(paths(["tests/data/**/*"]), [
        "tests/data/foo/bar.txt"
      ]);
    });
  });
});
