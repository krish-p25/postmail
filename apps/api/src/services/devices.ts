import crypto from 'crypto';
import type { CookieOptions } from 'express';
import { Op } from 'sequelize';
import { config } from '../config/env';
import { forUser } from '../db/scoped';

/** Remembered browsers skip the new-device sign-in code for 30 days. */
export const DEVICE_COOKIE = 'pm_device';
const DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashDeviceToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function isTrustedDevice(userId: string, token: unknown): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0) return false;
  const device = await forUser(userId).trustedDevices.findOne({
    where: { tokenHash: hashDeviceToken(token), expiresAt: { [Op.gt]: new Date() } },
  });
  if (!device) return false;
  await device.update({ lastUsedAt: new Date() });
  return true;
}

/** Create a trusted device and return the raw cookie value (only its hash is stored). */
export async function trustDevice(userId: string, userAgent: string | undefined): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  await forUser(userId).trustedDevices.create({
    tokenHash: hashDeviceToken(token),
    userAgent: userAgent ? userAgent.slice(0, 500) : null,
    lastUsedAt: new Date(now),
    expiresAt: new Date(now + DEVICE_TTL_MS),
  });
  return token;
}

export function deviceCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: DEVICE_TTL_MS,
  };
}
