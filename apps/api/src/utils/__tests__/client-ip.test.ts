import type { Request } from 'express';
import { getClientIp } from '../client-ip';

const req = (headers: Record<string, string>, ip?: string) => ({ headers, ip }) as unknown as Request;

it('prefers CF-Connecting-IP (Cloudflare)', () => {
  expect(getClientIp(req({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '10.0.0.1' }, '172.18.0.2'))).toBe('203.0.113.7');
});

it('falls back to the first X-Forwarded-For entry, then X-Real-IP, then req.ip', () => {
  expect(getClientIp(req({ 'x-forwarded-for': '198.51.100.9, 172.18.0.5' }))).toBe('198.51.100.9');
  expect(getClientIp(req({ 'x-real-ip': '198.51.100.10' }))).toBe('198.51.100.10');
  expect(getClientIp(req({}, '172.18.0.2'))).toBe('172.18.0.2');
  expect(getClientIp(req({}))).toBeNull();
});
