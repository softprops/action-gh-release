"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const mime_1 = require("mime");
const path_1 = require("path");
class GitHubReleaser {
    constructor(github) {
        this.github = github;
    }
    getReleaseByTag(params) {
        return this.github.repos.getReleaseByTag(params);
    }
    createRelease(params) {
        return this.github.repos.createRelease(params);
    }
    allReleases(params) {
        return this.github.paginate.iterator(this.github.repos.listReleases.endpoint.merge(params));
    }
}
exports.GitHubReleaser = GitHubReleaser;
exports.asset = (path) => {
    return {
        name: path_1.basename(path),
        mime: exports.mimeOrDefault(path),
        size: fs_1.lstatSync(path).size,
        file: fs_1.readFileSync(path)
    };
};
exports.mimeOrDefault = (path) => {
    return mime_1.getType(path) || "application/octet-stream";
};
exports.upload = (gh, url, path) => __awaiter(void 0, void 0, void 0, function* () {
    let { name, size, mime, file } = exports.asset(path);
    console.log(`⬆️ Uploading ${name}...`);
    return yield gh.repos.uploadReleaseAsset({
        url,
        headers: {
            "content-length": size,
            "content-type": mime
        },
        name,
        file
    });
});
exports.release = (config, releaser) => __awaiter(void 0, void 0, void 0, function* () {
    var e_1, _a;
    const [owner, repo] = config.github_repository.split("/");
    const tag = config.github_ref.replace("refs/tags/", "");
    try {
        // you can't get a an existing draft by tag
        // so we must find one in the list of all releases
        if (config.input_draft) {
            try {
                for (var _b = __asyncValues(releaser.allReleases({
                    owner,
                    repo
                })), _c; _c = yield _b.next(), !_c.done;) {
                    const response = _c.value;
                    let release = response.data.find(release => release.tag_name === tag);
                    if (release) {
                        return release;
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) yield _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
        }
        let release = yield releaser.getReleaseByTag({
            owner,
            repo,
            tag
        });
        return release.data;
    }
    catch (error) {
        if (error.status === 404) {
            try {
                const tag_name = tag;
                const name = config.input_name || tag;
                const body = config.input_body;
                const draft = config.input_draft;
                const prerelease = config.input_prerelease;
                console.log(`👩‍🏭 Creating new GitHub release for tag ${tag_name}...`);
                let release = yield releaser.createRelease({
                    owner,
                    repo,
                    tag_name,
                    name,
                    body,
                    draft,
                    prerelease
                });
                return release.data;
            }
            catch (error) {
                // presume a race with competing metrix runs
                console.log(`⚠️ GitHub release failed with status: ${error.status}, retrying...`);
                return exports.release(config, releaser);
            }
        }
        else {
            console.log(`⚠️ Unexpected error fetching GitHub release for tag ${config.github_ref}: ${error}`);
            throw error;
        }
    }
});
