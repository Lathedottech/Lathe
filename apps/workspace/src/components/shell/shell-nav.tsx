'use client';

import { usePathname } from 'next/navigation';
import { SideNav } from '../ui';
import type { Section } from './sections';

/** Sidebar with the current section marked. Sections are already filtered on the server. */
export function ShellNav({ sections }: { readonly sections: readonly Section[] }) {
  const pathname = usePathname();
  return (
    <SideNav
      label="Workspace"
      current={pathname}
      items={sections.map((s) => ({ href: s.href, label: s.label }))}
    />
  );
}
