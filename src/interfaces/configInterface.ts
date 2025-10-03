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
  input_overwrite_files?: boolean;
  input_draft?: boolean;
  input_preserve_order?: boolean;
  input_prerelease?: boolean;
  input_fail_on_unmatched_files?: boolean;
  input_target_commitish?: string;
  input_discussion_category_name?: string;
  input_generate_release_notes?: boolean;
  input_append_body?: boolean;
  input_make_latest: 'true' | 'false' | 'legacy' | undefined;
}
