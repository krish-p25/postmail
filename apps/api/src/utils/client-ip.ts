import { Request } from 'express';

/**
 * Real client IP behind Cloudflare → Nginx Proxy Manager → Docker.
 *
 * req.ip alone has returned 127.0.0.1 or an internal Docker address in this
 * deployment, so read the proxy headers first. Used by the tracking pixel and
 * the rate limiters — keep them on this one function.
 */
export function getClientIp(req: Request): string | null {
  // Cloudflare
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) return Array.isArray(cfIp) ? cfIp[0] : cfIp;

  // Standard proxy headers — take the first (leftmost = original client) IP
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const raw = Array.isArray(xff) ? xff[0] : xff;
    const first = raw.split(',')[0].trim();
    if (first) return first;
  }

  // nginx-style
  const realIp = req.headers['x-real-ip'];
  if (realIp) return Array.isArray(realIp) ? realIp[0] : realIp;

  // Fallback to Express req.ip
  return req.ip || null;
}
