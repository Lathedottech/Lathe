import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PAIRS, contrastRatio, readTokens } from './contrast';

const tokens = readTokens(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tokens.css'), 'utf8'),
);
const hex = (name: string) => {
  const v = tokens.get(name);
  if (v === undefined) throw new Error(`missing token ${name}`);
  return v;
};

describe('contrast helpers', () => {
  it('matches known WCAG ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#fff', '#fff')).toBe(1);
  });

  it('rejects a value that is not a hex color', () => {
    expect(() => contrastRatio('red', '#fff')).toThrow('not a hex color');
  });
});

describe('token pairs meet WCAG AA', () => {
  it.each(PAIRS.map((p) => [`${p.fg} on ${p.bg} (${p.use})`, p] as const))('%s', (_label, p) => {
    const ratio = contrastRatio(hex(p.fg), hex(p.bg));
    expect(ratio, `${ratio.toFixed(2)}:1, needs ${p.min}:1`).toBeGreaterThanOrEqual(p.min);
  });

  it('checks every text, status and diff color token in at least one pair', () => {
    const used = new Set(PAIRS.flatMap((p) => [p.fg, p.bg]));
    const mustCheck = [...tokens.keys()].filter((k) =>
      /^--(text|status|diff|action|surface|focus)-/.test(k),
    );
    expect(mustCheck.filter((k) => !used.has(k))).toEqual([]);
  });
});
