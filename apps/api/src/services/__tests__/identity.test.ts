import { verifiedGoogleEmail, verifiedMicrosoftEmail, microsoftMailboxEmail } from '../identity';

describe('verifiedGoogleEmail', () => {
  it('returns the email only when Google marks it verified', () => {
    expect(verifiedGoogleEmail({ email: 'a@example.com', email_verified: true })).toBe('a@example.com');
    expect(verifiedGoogleEmail({ email: 'a@example.com', email_verified: false })).toBeNull();
    expect(verifiedGoogleEmail({ email: 'a@example.com' })).toBeNull();
    expect(verifiedGoogleEmail(undefined)).toBeNull();
  });
});

describe('verifiedMicrosoftEmail', () => {
  it('uses userPrincipalName, never the admin-settable mail attribute', () => {
    expect(verifiedMicrosoftEmail({ mail: 'victim@example.com', userPrincipalName: 'Attacker@Evil.onmicrosoft.com' }))
      .toBe('attacker@evil.onmicrosoft.com');
  });

  it('rejects guest UPNs and missing values', () => {
    expect(verifiedMicrosoftEmail({ userPrincipalName: 'victim_example.com#EXT#@evil.onmicrosoft.com' })).toBeNull();
    expect(verifiedMicrosoftEmail({ mail: 'victim@example.com' })).toBeNull();
    expect(verifiedMicrosoftEmail({ userPrincipalName: 'no-at-sign' })).toBeNull();
  });
});

describe('microsoftMailboxEmail', () => {
  it('prefers mail for the mailbox address, lowercased', () => {
    expect(microsoftMailboxEmail({ mail: 'Me@Contoso.com', userPrincipalName: 'me@contoso.onmicrosoft.com' })).toBe('me@contoso.com');
    expect(microsoftMailboxEmail({ userPrincipalName: 'me@contoso.onmicrosoft.com' })).toBe('me@contoso.onmicrosoft.com');
    expect(microsoftMailboxEmail({})).toBeNull();
  });
});
