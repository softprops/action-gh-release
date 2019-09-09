"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const glob = __importStar(require("glob"));
const fs_1 = require("fs");
exports.parseConfig = (env) => {
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
exports.paths = (patterns) => {
    return patterns.reduce((acc, pattern) => {
        return acc.concat(glob.sync(pattern).filter(path => fs_1.lstatSync(path).isFile()));
    }, []);
};
exports.isTag = (ref) => {
    return ref.startsWith("refs/tags/");
};
