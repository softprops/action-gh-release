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
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const mime_1 = require("mime");
const path_1 = require("path");
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
exports.release = (config, gh) => __awaiter(void 0, void 0, void 0, function* () {
    let [owner, repo] = config.github_repository.split("/");
    try {
        let release = yield gh.repos.getReleaseByTag({
            owner,
            repo,
            tag: config.github_ref
        });
        return release.data;
    }
    catch (error) {
        if (error.status === 404) {
            console.log("Creating new release...");
            const tag_name = config.github_ref.replace("refs/tags/", "");
            const name = config.input_name || tag_name;
            const body = config.input_body;
            const draft = config.input_draft;
            let release = yield gh.repos.createRelease({
                owner,
                repo,
                tag_name,
                name,
                body,
                draft
            });
            return release.data;
        }
        else {
            console.log(`Unexpected error fetching github release for tag ${config.github_ref}: ${error}`);
            throw error;
        }
    }
});
