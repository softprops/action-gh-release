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
const util_1 = require("./util");
const github_1 = require("./github");
const core_1 = require("@actions/core");
const github_2 = require("@actions/github");
const process_1 = require("process");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const config = util_1.parseConfig(process_1.env);
            if (!util_1.isTag(config.github_ref)) {
                throw new Error(`⚠️ GitHub Releases requires a tag`);
            }
            const gh = new github_2.GitHub(config.github_token);
            let rel = yield github_1.release(config, gh);
            if (config.input_files) {
                util_1.paths(config.input_files).forEach((path) => __awaiter(this, void 0, void 0, function* () {
                    yield github_1.upload(gh, rel.upload_url, path);
                }));
            }
            console.log(`🎉 Release ready at ${rel.html_url}`);
        }
        catch (error) {
            core_1.setFailed(error.message);
        }
    });
}
run();
