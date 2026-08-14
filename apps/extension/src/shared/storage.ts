const TRACKING_ENABLED_KEY = 'trackingEnabled';

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
