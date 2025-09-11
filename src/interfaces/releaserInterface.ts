import { Release } from './releaseInterface';

export interface Releaser {
  getReleaseByTag(params: { owner: string; repo: string; tag: string }): Promise<{ data: Release }>;

  createRelease(params: {
    owner: string;
    repo: string;
    tag_name: string;
    name: string;
    body: string | undefined;
    draft: boolean | undefined;
    prerelease: boolean | undefined;
    target_commitish: string | undefined;
    discussion_category_name: string | undefined;
    generate_release_notes: boolean | undefined;
    make_latest: 'true' | 'false' | 'legacy' | undefined;
  }): Promise<{ data: Release }>;

  updateRelease(params: {
    owner: string;
    repo: string;
    release_id: number;
    tag_name: string;
    target_commitish: string;
    name: string;
    body: string | undefined;
    draft: boolean | undefined;
    prerelease: boolean | undefined;
    discussion_category_name: string | undefined;
    generate_release_notes: boolean | undefined;
    make_latest: 'true' | 'false' | 'legacy' | undefined;
  }): Promise<{ data: Release }>;

  allReleases(params: { owner: string; repo: string }): AsyncIterableIterator<{ data: Release[] }>;
}
