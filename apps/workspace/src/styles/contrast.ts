/**
 * WCAG 2.x contrast helpers and the token pairs that must meet AA (task P9-00).
 * Pure functions, so the contrast test needs no browser.
 */

/** Parses `#rgb` or `#rrggbb`. */
export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || m[1] === undefined) throw new Error(`not a hex color: ${hex}`);
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(parseHex(a)), luminance(parseHex(b))].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Reads `--name: value;` declarations from a CSS file's `:root` block and
 * resolves `var(--other)` references. Other values are returned as written.
 */
export function readTokens(css: string): Map<string, string> {
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  const raw = new Map<string, string>();
  for (const m of root.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    if (m[1] !== undefined && m[2] !== undefined) raw.set(m[1], m[2].trim());
  }
  const resolve = (name: string, seen: Set<string>): string => {
    const value = raw.get(name);
    if (value === undefined) throw new Error(`unknown token ${name}`);
    const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(value)?.[1];
    if (ref === undefined) return value;
    if (seen.has(ref)) throw new Error(`token cycle at ${ref}`);
    return resolve(ref, new Set([...seen, ref]));
  };
  return new Map([...raw.keys()].map((k) => [k, resolve(k, new Set([k]))]));
}

export interface ContrastPair {
  readonly fg: string;
  readonly bg: string;
  /** 4.5 for text (AA normal), 3 for large text and UI parts such as borders and focus rings. */
  readonly min: 4.5 | 3;
  readonly use: string;
}

/** Every foreground/background combination the components use. */
export const PAIRS: readonly ContrastPair[] = [
  ...['--surface-page', '--surface-raised', '--surface-sunken', '--surface-hover'].flatMap(
    (bg) =>
      [
        { fg: '--text-primary', bg, min: 4.5, use: 'body text' },
        { fg: '--text-secondary', bg, min: 4.5, use: 'secondary text' },
        { fg: '--text-muted', bg, min: 4.5, use: 'muted text, captions' },
        { fg: '--text-accent', bg, min: 4.5, use: 'links, active nav' },
        { fg: '--focus-ring', bg, min: 3, use: 'focus ring' },
      ] as const,
  ),
  { fg: '--text-on-accent', bg: '--action-primary', min: 4.5, use: 'primary button' },
  { fg: '--text-on-accent', bg: '--action-primary-hover', min: 4.5, use: 'primary button hover' },
  { fg: '--text-primary', bg: '--action-secondary', min: 4.5, use: 'secondary button' },
  { fg: '--text-primary', bg: '--action-secondary-hover', min: 4.5, use: 'secondary hover' },
  { fg: '--status-danger-text', bg: '--action-danger', min: 4.5, use: 'danger button' },
  { fg: '--text-accent', bg: '--surface-accent', min: 4.5, use: 'active nav item' },
  { fg: '--status-success-text', bg: '--status-success-bg', min: 4.5, use: 'status chip' },
  { fg: '--status-danger-text', bg: '--status-danger-bg', min: 4.5, use: 'status chip' },
  { fg: '--status-warning-text', bg: '--status-warning-bg', min: 4.5, use: 'status chip' },
  { fg: '--status-info-text', bg: '--status-info-bg', min: 4.5, use: 'status chip' },
  { fg: '--status-neutral-text', bg: '--status-neutral-bg', min: 4.5, use: 'status chip' },
  { fg: '--diff-add-text', bg: '--diff-add-bg', min: 4.5, use: 'diff added line' },
  { fg: '--diff-remove-text', bg: '--diff-remove-bg', min: 4.5, use: 'diff removed line' },
  { fg: '--border-strong', bg: '--surface-page', min: 3, use: 'form control border' },
  { fg: '--border-strong', bg: '--surface-raised', min: 3, use: 'form control border on card' },
];
