import { isTag, paths } from '../src/util';
import * as assert from 'assert';

describe('util', () => {
  describe('isTag', () => {
    it('returns true for tags', async () => {
      assert.equal(isTag('refs/tags/foo'), true)
    });
    it ('returns false for other kinds of refs', async () => {
      assert.equal(isTag('refs/heads/master'), false)
    })
  })

  describe('paths', () => {
    it('resolves files given a set of paths', async () => {
      assert.deepStrictEqual(paths(["tests/data/**/*"]), ['tests/data/foo/bar.txt'])
    });
  })
});