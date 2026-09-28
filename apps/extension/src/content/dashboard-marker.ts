/**
 * Lightweight content script that runs on the PostMail dashboard.
 * Sets a data attribute so the dashboard can detect the extension is installed.
 * Receives the extension's own long-lived token from the dashboard and stores
 * it in chrome.storage for API calls.
 *
 * This is a DOM CustomEvent only — never localStorage. The dashboard's
 * `postmail_token` is a short-lived (15m) access token now, deliberately not
 * meant for the extension; the extension gets its own, separate, long-lived
 * token dispatched directly by the dashboard's React app (AuthContext /
 * services/auth.ts's syncExtensionToken) at actual login/logout, never
 * written to any page-readable storage. See docs/security-review.md #8e.
 *
 * Content scripts run in an "isolated world" — they share the DOM but have a
 * separate JS context — yet a CustomEvent dispatched on `document` from the
 * page's own MAIN-world script still reaches a listener added here; that's
 * the one boundary these events are meant to cross.
 *
 * Injected at document_start (see manifest.json), so this listener is already
 * attached before the dashboard's own React bundle has even started running —
 * there's no race to miss the event fired at login.
 */
document.documentElement.setAttribute('data-postmail-extension', 'true');
console.log('[PostMail][Dashboard] Extension marker set');

let lastSyncedToken: string | null = null;

function handleToken(token: string | null) {
  if (token && token !== lastSyncedToken) {
    lastSyncedToken = token;
    chrome.storage.local.set({ apiToken: token });
    console.log('[PostMail][Dashboard] Extension token synced to storage');
  } else if (!token && lastSyncedToken) {
    lastSyncedToken = null;
    chrome.storage.local.remove('apiToken');
    console.log('[PostMail][Dashboard] Extension token cleared from storage');
  }
}

document.addEventListener('postmail-token-sync', ((e: CustomEvent) => {
  handleToken(e.detail);
}) as EventListener);
