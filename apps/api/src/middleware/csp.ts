import { Request, Response, NextFunction } from 'express';

/**
 * Report-only CSP for the dashboard SPA. Nothing is blocked yet — violations
 * are only logged to the browser console — so we can see what an enforced
 * policy would actually break before switching it on. See docs/security-review.md #8d.
 *
 * script-src omits 'unsafe-inline' deliberately: the two
 * <script type="application/ld+json"> blocks in index.html aren't
 * script-src's concern, since browsers don't treat a non-executable script
 * type as "script" for CSP purposes.
 *
 * style-src allows 'unsafe-inline' because the app relies heavily on inline
 * style={{}} attributes and a couple of inline <style> blocks for animation
 * keyframes (see pages/Home.tsx) — narrowing that would mean rewriting a
 * large surface of the UI for a much smaller security win than script-src,
 * since CSS alone can't execute arbitrary JavaScript.
 *
 * blob: is required for attachment previews (pages/AttachmentPreview.tsx
 * renders PDFs/images/video/audio from URL.createObjectURL(blob)).
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "frame-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

export function dashboardCsp(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY);
  next();
}
