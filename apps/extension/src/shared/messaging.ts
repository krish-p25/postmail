/** Message types exchanged between popup, background, and content scripts */
export type ExtensionMessage =
  | { type: 'GET_TRACKING_STATE' }
  | { type: 'SET_TRACKING_STATE'; enabled: boolean }
  | { type: 'TRACKING_STATE_CHANGED'; enabled: boolean }
  | { type: 'REGISTER_TRACKED_EMAIL'; trackingToken: string; recipients: string[]; subject: string }
  | { type: 'VERIFY_EMAIL_SENT'; trackingToken: string }
  | { type: 'DISCARD_TRACKED_EMAIL'; trackingToken: string }
  | { type: 'UPDATE_TRACKED_EMAIL'; trackingToken: string; recipients: string[]; subject: string }
  | { type: 'CHECK_AUTH' };

export interface TrackingStateResponse {
  trackingEnabled: boolean;
}

export interface RegisterResponse {
  id: string;
  trackingToken: string;
  status: string;
}

export interface VerifyResponse {
  found: boolean;
  authError?: boolean;
}
