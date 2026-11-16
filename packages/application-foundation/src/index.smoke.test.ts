import { describe, expect, it } from 'vitest';
import { packageName } from './index.js';

describe('runner smoke', () => {
  it('exports its package name', () => {
    expect(packageName()).toBe('@lathe/application-foundation');
  });
});
