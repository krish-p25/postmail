/** Message types exchanged between popup, background, and content scripts */
export type ExtensionMessage =
  | { type: 'GET_TRACKING_STATE' }
  | { type: 'SET_TRACKING_STATE'; enabled: boolean }
  | { type: 'TRACKING_STATE_CHANGED'; enabled: boolean };

export interface TrackingStateResponse {
  trackingEnabled: boolean;
}
