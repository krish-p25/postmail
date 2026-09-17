/** Every action that can be gated behind an emailed code. */
export const CHALLENGE_PURPOSES = [
  'register',
  'set-password',
  'password-reset',
  'login',
  'google-link',
  'microsoft-link',
] as const;

export type ChallengePurpose = (typeof CHALLENGE_PURPOSES)[number];
