import { ROUTES } from '@lathe/shared-contracts';
import { describe, expect, it } from 'vitest';
import { SECTIONS, visibleSections } from './sections';

describe('Workspace sections', () => {
  it('lists the eight P9-02 sections in order', () => {
    expect(SECTIONS.map((s) => s.label)).toEqual([
      'Overview',
      'Projects',
      'Specifications',
      'Factory Runs',
      'Agents',
      'Verification',
      'Deliveries',
      'Settings',
    ]);
  });

  it('uses only permissions that a C4 route declares', () => {
    const declared = new Set(Object.values(ROUTES).map((r) => r.permission));
    for (const s of SECTIONS) if (s.permission !== null) expect(declared).toContain(s.permission);
  });

  it('shows only Settings without permissions (no active org)', () => {
    expect(visibleSections([]).map((s) => s.href)).toEqual(['/settings']);
  });

  it('hides each section whose permission is missing', () => {
    for (const hidden of SECTIONS.filter((s) => s.permission !== null)) {
      const granted = SECTIONS.flatMap((s) =>
        s.permission !== null && s !== hidden ? [s.permission] : [],
      );
      const shown = visibleSections(granted).map((s) => s.href);
      expect(shown).not.toContain(hidden.href);
      expect(shown).toHaveLength(SECTIONS.length - 1);
    }
  });

  it('ignores unknown or look-alike permissions', () => {
    expect(visibleSections(['projects.read.extra', 'PROJECTS.READ', 'projects']).length).toBe(1);
  });
});
