const TRACKING_ENABLED_KEY = 'trackingEnabled';
const API_TOKEN_KEY = 'apiToken';

/** Get the current tracking enabled state from chrome.storage.local */
export function getTrackingEnabled(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get(TRACKING_ENABLED_KEY, (result) => {
      resolve(result[TRACKING_ENABLED_KEY] ?? true);
    });
  });
}

/** Set the tracking enabled state in chrome.storage.local */
export function setTrackingEnabled(enabled: boolean): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [TRACKING_ENABLED_KEY]: enabled }, () => {
      resolve();
    });
  });
}

/** Get the stored API JWT token */
export function getApiToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(API_TOKEN_KEY, (result) => {
      resolve(result[API_TOKEN_KEY] ?? null);
    });
  });
}

/** Store the API JWT token */
export function setApiToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [API_TOKEN_KEY]: token }, () => {
      resolve();
    });
  });
}
