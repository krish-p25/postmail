/**
 * Which emails from identity providers are trustworthy enough to find or link
 * a PostMail account by. Getting this wrong allows account takeover.
 */

export interface GoogleIdentity {
  email?: string;
  email_verified?: boolean;
}

/** Google email, only if Google says the address is verified. Case is preserved (see finding A12). */
export function verifiedGoogleEmail(payload: GoogleIdentity | undefined): string | null {
  if (!payload?.email || payload.email_verified !== true) return null;
  return payload.email;
}

export interface MicrosoftProfile {
  mail?: string | null;
  userPrincipalName?: string | null;
}

/**
 * Identity email for Microsoft sign-in. Uses userPrincipalName, whose domain
 * the tenant must have verified. The `mail` attribute can be set to any
 * address by a tenant admin, so it is never used for identity.
 */
export function verifiedMicrosoftEmail(profile: MicrosoftProfile): string | null {
  const upn = (profile.userPrincipalName || '').trim().toLowerCase();
  if (!upn.includes('@') || upn.includes('#ext#')) return null;
  return upn;
}

/** Address of the Outlook mailbox, for display and sender matching only — never identity. */
export function microsoftMailboxEmail(profile: MicrosoftProfile): string | null {
  const value = (profile.mail || profile.userPrincipalName || '').trim().toLowerCase();
  return value || null;
}
