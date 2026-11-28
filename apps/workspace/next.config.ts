import type { NextConfig } from 'next';
import { parseEngineUrl } from './src/lib/engine-url';

/**
 * The browser talks only to the Workspace origin. `/auth/*` (Better Auth) and
 * `/v1/*` (C4) are proxied to the Factory Engine, so the session cookie is set on
 * the Workspace origin and no CORS is needed. The Engine authorizes every request;
 * its `trustedOrigins` must list the Workspace origin.
 *
 * Without a valid `LATHE_ENGINE_URL` there is no proxy: sign-in fails and the
 * authenticated pages show an error. There is no default Engine address.
 */
const engine = parseEngineUrl(process.env['LATHE_ENGINE_URL']);

const config: NextConfig = {
  reactStrictMode: true,
  // No `X-Powered-By: Next.js` header.
  poweredByHeader: false,
  // Workspace types come from shared-contracts as TypeScript source.
  transpilePackages: ['@lathe/shared-contracts'],
  // shared-contracts imports `./x.js` for `./x.ts` (NodeNext). Turbopack does not map the
  // extension, so the Workspace builds with webpack (`--webpack` in package.json) and this alias.
  webpack: (webpackConfig: { resolve: { extensionAlias?: Record<string, string[]> } }) => {
    webpackConfig.resolve.extensionAlias = {
      ...webpackConfig.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return webpackConfig;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
  async rewrites() {
    if (engine === null) return [];
    const origin = engine.origin;
    return [
      { source: '/auth/:path*', destination: `${origin}/auth/:path*` },
      { source: '/v1/:path*', destination: `${origin}/v1/:path*` },
    ];
  },
};

export default config;
