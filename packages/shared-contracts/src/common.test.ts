import { describe, expect, it } from 'vitest';
import { GitSha, RepoRelativePath, Sha256 } from './index.js';

describe('RepoRelativePath', () => {
  it.each(['apps/support-desk/src/kb/index.ts', 'README.md', 'docs/a-b_c.md'])(
    'accepts %s',
    (p) => {
      expect(RepoRelativePath.safeParse(p).success).toBe(true);
    },
  );
  it.each([
    '/etc/passwd',
    '../outside',
    'apps/../../x',
    'apps\\win',
    'C:/Users/x',
    'a//b',
    './a',
    '',
  ])('rejects %s', (p) => {
    expect(RepoRelativePath.safeParse(p).success).toBe(false);
  });
});

describe('hash formats', () => {
  it('requires full git shas and lowercase sha256', () => {
    expect(GitSha.safeParse('132716f').success).toBe(false);
    expect(Sha256.safeParse('A'.repeat(64)).success).toBe(false);
  });
});
