export enum ComposeTrackingState {
  DETECTED = 'DETECTED',
  WAITING_FOR_RECIPIENT = 'WAITING_FOR_RECIPIENT',
  TRACKING_INITIALIZED = 'TRACKING_INITIALIZED',
  PIXEL_INJECTED = 'PIXEL_INJECTED',
  CLEANED_UP = 'CLEANED_UP',
}

export interface TrackingInfo {
  composeId: string;
  trackingToken: string;
  trackingUrl: string;
  recipients: string[];
  state: ComposeTrackingState;
  injected: boolean;
}
