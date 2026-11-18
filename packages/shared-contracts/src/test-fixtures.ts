/** Valid sample values shared by the contract tests. Not exported from the package. */
export const UUID_A = '3f2b8c1e-7d4a-4f6b-9c2d-1a2b3c4d5e6f';
export const UUID_B = '8a1d2e3f-4b5c-4d6e-8f7a-9b0c1d2e3f4a';
export const SHA256 = 'a'.repeat(64);
export const GIT_SHA = '132716f225555e6462c02bf22a2daf738dbac075';
export const NOW = '2026-11-17T10:00:00Z';
export const LATER = '2026-11-17T10:05:00Z';

/** Deep copy of plain JSON data. */
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Element at `index`, failing the test if it is missing. Avoids non-null assertions. */
export const at = <T>(items: readonly T[], index: number): T => {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at index ${index}`);
  return item;
};
