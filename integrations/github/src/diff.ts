/**
 * Minimal unified-diff reader for the verified patch (`git diff` output of one
 * agent build). The Git Data API needs file contents, so the patch is applied
 * here against base file contents. Anything not understood is refused, never
 * guessed: binary patches, renames, copies, mode changes and symlinks.
 */
export class PatchApplyError extends Error {
  readonly code = 'patch_apply_failed' as const;
  constructor(message: string) {
    super(message);
    this.name = 'PatchApplyError';
  }
}

export interface FilePatch {
  readonly path: string;
  readonly kind: 'add' | 'modify' | 'delete';
  readonly executable: boolean;
  readonly hunks: readonly Hunk[];
}

interface Hunk {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly lines: readonly string[];
}

const HEADER = /^diff --git a\/(.+) b\/(.+)$/;
const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const UNSUPPORTED =
  /^(rename from |rename to |copy from |copy to |similarity index |old mode |new mode |GIT binary patch|Binary files )/;

export function parseUnifiedDiff(diff: string): FilePatch[] {
  const lines = diff.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const files: FilePatch[] = [];
  let i = 0;
  while (i < lines.length) {
    const header = HEADER.exec(lines[i] ?? '');
    if (!header) throw new PatchApplyError('unexpected line outside a file header');
    const [, a, b] = header;
    if (a !== b || a === undefined) throw new PatchApplyError('renames are not supported');
    i++;
    let kind: FilePatch['kind'] = 'modify';
    let executable = false;
    while (i < lines.length && !(lines[i] ?? '').startsWith('@@') && !HEADER.test(lines[i] ?? '')) {
      const l = lines[i] ?? '';
      if (UNSUPPORTED.test(l)) throw new PatchApplyError('unsupported patch feature');
      if (l.startsWith('new file mode ')) {
        kind = 'add';
        const mode = l.slice('new file mode '.length).trim();
        if (mode === '100755') executable = true;
        else if (mode !== '100644') throw new PatchApplyError('unsupported file mode');
      } else if (l.startsWith('deleted file mode ')) {
        kind = 'delete';
      }
      i++;
    }
    const hunks: Hunk[] = [];
    while (i < lines.length && (lines[i] ?? '').startsWith('@@')) {
      const m = HUNK.exec(lines[i] ?? '');
      if (!m) throw new PatchApplyError('malformed hunk header');
      const oldStart = Number(m[1]);
      const oldCount = m[2] === undefined ? 1 : Number(m[2]);
      const newCount = m[4] === undefined ? 1 : Number(m[4]);
      i++;
      const body: string[] = [];
      let seenOld = 0;
      let seenNew = 0;
      while (i < lines.length && (seenOld < oldCount || seenNew < newCount)) {
        const l = lines[i] ?? '';
        const c = l[0];
        if (c === ' ') {
          seenOld++;
          seenNew++;
        } else if (c === '\\') {
          // "\ No newline at end of file": belongs to the previous line, counts as no line.
        } else if (c === '-') seenOld++;
        else if (c === '+') seenNew++;
        else throw new PatchApplyError('malformed hunk body');
        body.push(l);
        i++;
      }
      if (seenOld !== oldCount || seenNew !== newCount)
        throw new PatchApplyError('hunk length mismatch');
      while ((lines[i] ?? '').startsWith('\\')) {
        body.push(lines[i] ?? '');
        i++;
      }
      hunks.push({ oldStart, oldCount, lines: body });
    }
    if (hunks.length === 0) throw new PatchApplyError('file entry without hunks');
    files.push({ path: a, kind, executable, hunks });
  }
  if (files.length === 0) throw new PatchApplyError('empty patch');
  return files;
}

function splitContent(content: string): { lines: string[]; eol: boolean } {
  if (content === '') return { lines: [], eol: false };
  const eol = content.endsWith('\n');
  const lines = (eol ? content.slice(0, -1) : content).split('\n');
  return { lines, eol };
}

/** Applies the hunks of one file to its base content (empty for an added file). */
export function applyHunks(base: string, hunks: readonly Hunk[]): string {
  const { lines: old, eol: oldEol } = splitContent(base);
  const out: string[] = [];
  let pos = 0;
  let eol = oldEol;
  for (const hunk of hunks) {
    const start = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
    if (start < pos || start > old.length) throw new PatchApplyError('hunk out of range');
    while (pos < start) out.push(old[pos++] ?? '');
    let prev: string | undefined;
    let newNoEol = false;
    for (const l of hunk.lines) {
      const c = l[0];
      const text = l.slice(1);
      if (c === ' ' || c === '-') {
        if (old[pos] !== text) throw new PatchApplyError('hunk context does not match');
        pos++;
        if (c === ' ') out.push(text);
      } else if (c === '+') {
        out.push(text);
      } else if (c === '\\' && (prev === ' ' || prev === '+')) {
        newNoEol = true;
      }
      prev = c;
    }
    if (pos >= old.length) eol = !newNoEol;
  }
  while (pos < old.length) out.push(old[pos++] ?? '');
  if (out.length === 0) return '';
  return out.join('\n') + (eol ? '\n' : '');
}
