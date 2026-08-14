/** Base URL for the tracking pixel endpoint. Override via environment/config. */
export const TRACKING_PIXEL_BASE_URL = 'http://localhost:3001';

/** Path prefix for the tracking pixel endpoint */
export const TRACKING_PIXEL_PATH = '/o';

/** Build a full tracking URL from a token */
export function buildTrackingUrl(token: string, baseUrl = TRACKING_PIXEL_BASE_URL): string {
  return `${baseUrl}${TRACKING_PIXEL_PATH}/${token}`;
}

/** Data attribute used to mark tracking pixels in the DOM */
export const TRACKING_PIXEL_ATTR = 'data-postmail-tracking';
