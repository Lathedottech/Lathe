/**
 * Finds raw color values in source text (task P9-00): hex colors, color
 * functions, and named colors in CSS declarations. Everything outside
 * tokens.css must use `var(--…)` instead.
 */
const HEX = /#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi;
const FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;
const NAMED_IN_CSS =
  /(?:^|[;{\s])(?:color|background(?:-color)?|border(?:-[a-z]+)?-color|fill|stroke|outline-color|accent-color|caret-color)\s*:\s*(?:white|black|red|green|blue|gray|grey|yellow|orange|purple|violet|pink)\b/gim;

export interface RawColor {
  readonly line: number;
  readonly match: string;
}

export function findRawColors(text: string): RawColor[] {
  const found: RawColor[] = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const re of [HEX, FUNCTION, NAMED_IN_CSS]) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) found.push({ line: i + 1, match: m[0].trim() });
    }
  });
  return found;
}
