/**
 * Validates a post-sign-in handover destination.
 *
 * Anything that is not a same-origin path is rejected, so `?next=` can never turn
 * the sign-in page into an open redirect:
 *   "//evil.example"  → browsers read this as protocol-relative, i.e. another host
 *   "/\evil.example"  → some browsers normalise the backslash to "/"
 *   "https://…"       → another origin outright
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;

  let path = value;
  try {
    path = decodeURIComponent(value);
  } catch {
    return null; // malformed percent-encoding
  }

  if (!path.startsWith('/')) return null;
  if (path.startsWith('//') || path.startsWith('/\\')) return null;
  if (path.includes('\\')) return null;
  // Never bounce back to the pages that perform sign-in, or we can loop.
  if (/^\/(login|signup|oauth\/callback|microsoft\/callback)(\/|\?|$)/.test(path)) return null;

  return path;
}
