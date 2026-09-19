import jwt from 'jsonwebtoken';
import { config } from '../../config/env';
import { issuePasswordTicket, readPasswordTicket, TICKET_TTL_SECONDS } from '../password-tickets';

const USER_ID = '11111111-1111-4111-8111-111111111111';

it('round-trips a ticket for the purpose it was issued for', () => {
  const ticket = issuePasswordTicket({ userId: USER_ID, purpose: 'set-password', tokenVersion: 3 });
  expect(readPasswordTicket(ticket, 'set-password')).toEqual(
    expect.objectContaining({ sub: USER_ID, pw: 'set-password', ver: 3 }),
  );
});

it('rejects a ticket presented for another purpose', () => {
  const ticket = issuePasswordTicket({ userId: USER_ID, purpose: 'password-reset', tokenVersion: 0 });
  expect(readPasswordTicket(ticket, 'set-password')).toBeNull();
});

it('rejects junk, empty and non-string tickets', () => {
  expect(readPasswordTicket('not-a-jwt', 'set-password')).toBeNull();
  expect(readPasswordTicket('', 'set-password')).toBeNull();
  expect(readPasswordTicket(undefined, 'set-password')).toBeNull();
  expect(readPasswordTicket({ sub: USER_ID }, 'set-password')).toBeNull();
});

it('rejects an expired ticket', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
  const ticket = issuePasswordTicket({ userId: USER_ID, purpose: 'set-password', tokenVersion: 0 });
  jest.setSystemTime(new Date(Date.now() + (TICKET_TTL_SECONDS + 5) * 1000));
  expect(readPasswordTicket(ticket, 'set-password')).toBeNull();
  jest.useRealTimers();
});

it('cannot be verified with JWT_SECRET, so it is useless as a session token', () => {
  const ticket = issuePasswordTicket({ userId: USER_ID, purpose: 'set-password', tokenVersion: 0 });
  expect(() => jwt.verify(ticket, config.jwtSecret)).toThrow();
});

it('does not accept a session token in place of a ticket', () => {
  const sessionToken = jwt.sign({ sub: USER_ID, email: 'a@b.com', ver: 0 }, config.jwtSecret, { expiresIn: '7d' });
  expect(readPasswordTicket(sessionToken, 'set-password')).toBeNull();
});
