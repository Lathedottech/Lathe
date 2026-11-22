/**
 * Route and server action sources for the deny-by-default scan (task P2-05), as text. Each `fail`
 * fixture must produce its rule; each `pass` fixture must produce no finding. They are strings so
 * that the planted defects are never compiled, linted or run.
 */
export interface RouteFixture {
  readonly name: string;
  readonly path: string;
  readonly text: string;
  readonly expect: 'pass' | readonly string[];
}

const IMPORT = "import { defineAction } from '@lathe/application-foundation';\n";

export const routeFixtures: readonly RouteFixture[] = [
  {
    name: 'wrapped route',
    path: 'app/api/items/route.ts',
    text:
      IMPORT +
      `export const GET = defineAction(authz, { permission: 'items.list', input, resourceType: 'item', handler });
export const POST = defineAction(authz, {
  permission: 'items.create',
  input,
  resourceType: 'item',
  handler: async () => 1,
});
export const dynamic = 'force-dynamic';
`,
    expect: 'pass',
  },
  {
    name: 'wrapped through a local alias',
    path: 'app/api/items/route.ts',
    text:
      IMPORT +
      `const list = defineAction(authz, { permission: 'items.list', input, resourceType: 'item', handler });
export const GET = list;
export { list as HEAD };
`,
    expect: 'pass',
  },
  {
    name: 'wrapped server action file',
    path: 'actions/items.ts',
    text:
      "'use server';\n" +
      IMPORT +
      `export const createItem = defineAction(authz, { permission: 'items.create', input, resourceType: 'item', handler });
export type CreateInput = { label: string };
`,
    expect: 'pass',
  },
  {
    name: 'plain module is not a handler file',
    path: 'lib/format.ts',
    text: 'export function format(x: string) { return x; }\n',
    expect: 'pass',
  },
  {
    name: 'unwrapped route function',
    path: 'app/api/items/route.ts',
    text: IMPORT + 'export async function GET() { return Response.json({ items: [] }); }\n',
    expect: ['rbac/unwrapped-route'],
  },
  {
    name: 'unwrapped route arrow',
    path: 'app/api/items/route.ts',
    text: IMPORT + 'export const DELETE = async () => new Response(null, { status: 204 });\n',
    expect: ['rbac/unwrapped-route'],
  },
  {
    name: 'one wrapped, one unwrapped',
    path: 'app/api/items/route.ts',
    text:
      IMPORT +
      `export const GET = defineAction(authz, { permission: 'items.list', input, resourceType: 'item', handler });
export const POST = async () => new Response('created');
`,
    expect: ['rbac/unwrapped-route'],
  },
  {
    name: 'unwrapped server action',
    path: 'actions/items.ts',
    text: "'use server'\nexport async function deleteItem(id: string) { return id; }\n",
    expect: ['rbac/unwrapped-route'],
  },
  {
    name: 'wrapper mentioned only in a comment',
    path: 'app/api/items/route.ts',
    text:
      "// export const GET = defineAction(authz, { permission: 'items.list' });\n" +
      'export const GET = async () => new Response("open");\n',
    expect: ['rbac/unwrapped-route'],
  },
  {
    name: 'wrapper mentioned only in a string',
    path: 'app/api/items/route.ts',
    text:
      IMPORT +
      'export const GET = async () => new Response("defineAction(x)"); const note = "defineAction(";\n',
    expect: ['rbac/unwrapped-route'],
  },
  {
    name: 'wrapper call followed by a bypass',
    path: 'app/api/items/route.ts',
    text:
      IMPORT +
      `export const GET = defineAction(authz, { permission: 'items.list', input, resourceType: 'item', handler }) ?? open;\n`,
    expect: ['rbac/unwrapped-route'],
  },
  {
    name: 'alias to an unwrapped handler',
    path: 'app/api/items/route.ts',
    text: IMPORT + 'const open = async () => new Response("open");\nexport const GET = open;\n',
    expect: ['rbac/unwrapped-route'],
  },
  {
    name: 'default export without wrapper',
    path: 'pages/api/items.ts',
    text: 'export default function handler(req, res) { res.end("open"); }\n',
    expect: ['rbac/unwrapped-route'],
  },
  {
    name: 'local defineAction that checks nothing',
    path: 'app/api/items/route.ts',
    text: 'const defineAction = (c) => c.handler;\nexport const GET = defineAction({ handler });\n',
    expect: ['rbac/shadowed-defineaction', 'rbac/unwrapped-route'],
  },
  {
    name: 'defineAction imported from a local module',
    path: 'app/api/items/route.ts',
    text:
      "import { defineAction } from '../../lib/my-action';\n" +
      'export const GET = defineAction({ handler });\n',
    expect: ['rbac/foreign-defineaction', 'rbac/unwrapped-route'],
  },
  {
    name: 're-exported handler',
    path: 'app/api/items/route.ts',
    text: "export { GET } from '../../lib/open-handler';\n",
    expect: ['rbac/unverifiable-export'],
  },
  {
    name: 'inline server action',
    path: 'app/page.tsx',
    text: "export default function Page() { async function go() { 'use server'; } return null; }\n",
    expect: ['rbac/inline-server-action'],
  },
];
