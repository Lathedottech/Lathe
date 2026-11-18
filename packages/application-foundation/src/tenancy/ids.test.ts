import { describe, expect, it } from 'vitest';
import { parseOrgId, parseUserId } from './ids.js';

describe('id parsing', () => {
  it('accepts a UUID and lower-cases it', () => {
    expect(parseOrgId('0E8C9A3C-1F2B-4D5E-8A9B-0C1D2E3F4A5B')).toBe(
      '0e8c9a3c-1f2b-4d5e-8a9b-0c1d2e3f4a5b',
    );
  });

  it.each(['', 'not-a-uuid', "x' OR '1'='1", 42, null, undefined])('rejects %j', (value) => {
    expect(() => parseOrgId(value)).toThrow('org id must be a UUID');
    expect(() => parseUserId(value)).toThrow('user id must be a UUID');
  });
});
