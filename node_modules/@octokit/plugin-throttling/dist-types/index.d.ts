import { Octokit } from "@octokit/core";
export declare function throttling(octokit: Octokit, octokitOptions?: {}): void;
export declare namespace throttling {
    var VERSION: string;
    var triggersNotification: (string: string) => boolean;
}
