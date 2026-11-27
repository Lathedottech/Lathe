/**
 * Workspace sections (P9-02) and the C4 permission each one reads with.
 *
 * Hiding a section is a hint for the user. It is not access control: every page
 * reads through the Engine, which checks the permission on each request.
 */
export interface Section {
  readonly href: string;
  readonly label: string;
  /** C4 route permission the section's data needs; `null` means every signed-in user. */
  readonly permission: string | null;
}

export const SECTIONS: readonly Section[] = [
  { href: '/overview', label: 'Overview', permission: 'overview.read' },
  { href: '/projects', label: 'Projects', permission: 'projects.read' },
  { href: '/specifications', label: 'Specifications', permission: 'specs.read' },
  { href: '/runs', label: 'Factory Runs', permission: 'runs.read' },
  { href: '/agents', label: 'Agents', permission: 'agents.read' },
  { href: '/verification', label: 'Verification', permission: 'verification.read' },
  { href: '/deliveries', label: 'Deliveries', permission: 'delivery.read' },
  { href: '/settings', label: 'Settings', permission: null },
];

/** The sections the user's active-org permissions allow, in navigation order. */
export function visibleSections(permissions: readonly string[]): readonly Section[] {
  const granted = new Set(permissions);
  return SECTIONS.filter((s) => s.permission === null || granted.has(s.permission));
}
