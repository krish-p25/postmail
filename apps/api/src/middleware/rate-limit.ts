import { Request } from 'express';
import rateLimit, { Options } from 'express-rate-limit';
import { getClientIp } from '../utils/client-ip';

/**
 * In-memory limiters (single API container). Move to a shared store
 * if the API ever runs as more than one instance.
 */

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

const byClientIp = (req: Request) => `ip:${getClientIp(req) ?? 'unknown'}`;
const byEmail = (req: Request) => `email:${String(req.body?.email ?? '').trim().toLowerCase()}`;
const byUser = (req: Request) => `user:${req.user?.id ?? 'anonymous'}`;

function limiter(limit: number, windowMs: number, extra: Partial<Options> = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
    keyGenerator: byClientIp,
    // app.ts keeps `trust proxy` = true and no key comes from req.ip, so this check doesn't apply.
    validate: { trustProxy: false },
    ...extra,
  });
}

export const loginIpLimiter = limiter(30, FIFTEEN_MINUTES);
// Only failed logins count toward the per-email lock.
export const loginEmailLimiter = limiter(10, FIFTEEN_MINUTES, { keyGenerator: byEmail, skipSuccessfulRequests: true });
export const registerLimiter = limiter(5, ONE_HOUR);
export const verifyLimiter = limiter(10, FIFTEEN_MINUTES, { keyGenerator: byEmail });
export const oauthLimiter = limiter(30, FIFTEEN_MINUTES);
export const linkLimiter = limiter(10, FIFTEEN_MINUTES);
export const passwordLimiter = limiter(5, FIFTEEN_MINUTES, { keyGenerator: byUser });
// The extension reports every completed pixel request in a linked tab (no client-side dedupe).
export const selfViewLimiter = limiter(60, 60 * 1000, { keyGenerator: byUser });
