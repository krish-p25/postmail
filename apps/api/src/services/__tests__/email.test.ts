const mockSendMail = jest.fn().mockResolvedValue({});
const mockVerify = jest.fn().mockResolvedValue(true);

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: mockSendMail, verify: mockVerify })) },
}));

import { sendChallengeEmail, verifySmtp } from '../email';

beforeEach(() => {
  mockSendMail.mockClear();
  mockVerify.mockReset().mockResolvedValue(true);
});

it.each([
  ['register', 'Your PostMail sign-up code'],
  ['set-password', 'Confirm your PostMail password change'],
  ['password-reset', 'Reset your PostMail password'],
  ['login', 'Your PostMail sign-in code'],
  ['google-link', 'Confirm linking your account'],
  ['microsoft-link', 'Confirm linking your account'],
] as const)('sends the %s code email', async (purpose, subject) => {
  await sendChallengeEmail(purpose, 'someone@example.com', '042917');
  expect(mockSendMail).toHaveBeenCalledWith(
    expect.objectContaining({
      to: 'someone@example.com',
      from: 'PostMail <test-sender@gmail.com>',
      subject,
      html: expect.stringContaining('042917'),
    }),
  );
});

it('verifySmtp reports success', async () => {
  await expect(verifySmtp()).resolves.toBe(true);
});

it('verifySmtp logs and returns false when Gmail rejects the login', async () => {
  mockVerify.mockRejectedValue(new Error('Invalid login: 535-5.7.8 Username and Password not accepted'));
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  await expect(verifySmtp()).resolves.toBe(false);
  expect(log).toHaveBeenCalledWith(expect.stringContaining('SMTP not configured or unreachable'), expect.stringContaining('535'));
  log.mockRestore();
});
