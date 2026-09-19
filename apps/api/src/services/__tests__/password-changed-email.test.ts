const sendMail = jest.fn().mockResolvedValue(undefined);
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail, verify: jest.fn().mockResolvedValue(true) }) },
}));

import { config } from '../../config/env';
import { sendPasswordChangedEmail } from '../email';

beforeEach(() => sendMail.mockClear());

it('links to the reset flow, prefilled with the recipient', async () => {
  await sendPasswordChangedEmail('Person+tag@example.com');
  const { html, to } = sendMail.mock.calls[0][0];

  expect(to).toBe('Person+tag@example.com');
  expect(html).toContain(`${config.dashboardUrl}/forgot-password?email=Person%2Btag%40example.com`);
  expect(html).toContain("This wasn't me");
});

it('does not link to Settings, which would demand the password the user may not know', async () => {
  await sendPasswordChangedEmail('someone@example.com');
  const { html } = sendMail.mock.calls[0][0];
  expect(html).not.toContain('/dashboard/settings');
});
