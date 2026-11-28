/**
 * Parses `LATHE_ENGINE_URL`: an http(s) origin with no credentials, path, query or
 * hash. Anything else is `null`, and the Workspace makes no Engine call.
 * No imports, so `next.config.ts` can use it.
 */
export function parseEngineUrl(value: string | undefined): URL | null {
  if (value === undefined || value.trim() === '') return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '') return null;
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') return null;
  return url;
}
