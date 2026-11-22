export const REDACTED = '[REDACTED]';

const PRIVATE_KEY_BLOCK = /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?(?:-----END \1-----|$)/g;
const BEARER = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const KEY_VALUE = /\b(password|passwd|pwd)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s&"',;]+)/gi;
const GITHUB_TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g;
const AWS_ACCESS_KEY = /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g;

/** Redact secrets in one string. Pure and idempotent. */
export function redactString(input: string): string {
  return input
    .replace(PRIVATE_KEY_BLOCK, REDACTED)
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(KEY_VALUE, (_m, name: string, sep: string) => `${name}${sep}${REDACTED}`)
    .replace(GITHUB_TOKEN, REDACTED)
    .replace(AWS_ACCESS_KEY, REDACTED);
}

/** Redact every string value and object key inside a JSON-compatible value. */
export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[redactString(k)] = redactValue(v);
    }
    return out;
  }
  return value;
}
