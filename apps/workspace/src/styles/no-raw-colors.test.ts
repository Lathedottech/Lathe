import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findRawColors } from './raw-colors';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Files allowed to hold raw colors: the tokens themselves, and the tests and helpers that check colors. */
const ALLOWED = new Set(['styles/tokens.css', 'styles/contrast.ts', 'styles/raw-colors.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.(css|tsx?|mdx?)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}

describe('no raw colors outside tokens.css', () => {
  it('finds hex, color functions and named colors', () => {
    const sample = [
      '.a { color: #fff; }',
      '.b { background: rgb(0 0 0); }',
      '.c { border-color: red; }',
      "const x = { color: 'hsl(0 0% 0%)' };",
      '.ok { color: var(--text-primary); }',
      '<a href="#main">skip</a>',
    ].join('\n');
    expect(findRawColors(sample).map((f) => f.line)).toEqual([1, 2, 3, 4]);
  });

  it('the source tree uses tokens only', () => {
    const offenders = sourceFiles(SRC)
      .map((f) => relative(SRC, f).split('\\').join('/'))
      .filter((f) => !ALLOWED.has(f))
      .flatMap((f) =>
        findRawColors(readFileSync(join(SRC, f), 'utf8')).map((c) => `${f}:${c.line} ${c.match}`),
      );
    expect(offenders).toEqual([]);
  });
});
