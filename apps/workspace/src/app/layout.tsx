import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../styles/tokens.css';
import '../styles/base.css';

export const metadata: Metadata = {
  title: { default: 'Lathe', template: '%s · Lathe' },
  description: 'A verified mini software factory for agent-native development.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
