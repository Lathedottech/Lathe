import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // No `X-Powered-By: Next.js` header.
  poweredByHeader: false,
  // Workspace types come from shared-contracts as TypeScript source.
  transpilePackages: ['@lathe/shared-contracts'],
};

export default config;
