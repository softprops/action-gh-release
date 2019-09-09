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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github_1 = require("@actions/github");
const util_1 = require("./util");
const github_2 = require("./github");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const config = util_1.parseConfig(process.env);
            if (!util_1.isTag(config.github_ref)) {
                throw new Error(`⚠️ GitHub Releases requires a tag`);
            }
            // todo: validate github_ref is a tag
            const gh = new github_1.GitHub(config.github_token);
            let rel = yield github_2.release(config, gh);
            if (config.input_files) {
                util_1.paths(config.input_files).forEach((path) => __awaiter(this, void 0, void 0, function* () {
                    yield github_2.upload(gh, rel.upload_url, path);
                }));
            }
            console.log(`🎉 Release ready at ${rel.html_url}`);
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
run();
