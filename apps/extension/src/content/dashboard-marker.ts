/**
 * Lightweight content script that runs on the PostMail dashboard.
 * Sets a data attribute so the dashboard can detect the extension is installed.
 * Syncs the JWT token from the dashboard to chrome.storage for API calls.
 *
 * Content scripts run in an "isolated world" — they share the DOM but have
 * a separate JS context. This means `localStorage` accessed here is the
 * extension's isolated localStorage, NOT the page's. To read the page's
 * localStorage we use two strategies:
 *
 *   1. Inject a small script into the MAIN world that reads localStorage
 *      and posts the token back via a DOM custom event.
 *   2. Listen for 'postmail-token-sync' custom events dispatched by the
 *      dashboard React app (AuthContext) on login/logout/mount.
 *
 * Both custom events cross the isolation boundary.
 */
document.documentElement.setAttribute('data-postmail-extension', 'true');
console.log('[PostMail][Dashboard] Extension marker set');

let lastSyncedToken: string | null = null;

function handleToken(token: string | null) {
  if (token && token !== lastSyncedToken) {
    lastSyncedToken = token;
    chrome.storage.local.set({ apiToken: token });
    console.log('[PostMail][Dashboard] JWT synced to extension storage');
  } else if (!token && lastSyncedToken) {
    lastSyncedToken = null;
    chrome.storage.local.remove('apiToken');
    console.log('[PostMail][Dashboard] JWT cleared from extension storage');
  }
}

// Listen for token events (from both the injected script and the dashboard React app)
document.addEventListener('postmail-token-sync', ((e: CustomEvent) => {
  handleToken(e.detail);
}) as EventListener);

// Inject a script into the MAIN world to read the page's localStorage
// and post it back. Also sets up a poll so we catch future changes.
const script = document.createElement('script');
script.textContent = `
  (function() {
    function pushToken() {
      var token = localStorage.getItem('postmail_token');
      document.dispatchEvent(new CustomEvent('postmail-token-sync', { detail: token }));
    }
    pushToken();
    setInterval(pushToken, 5000);
  })();
`;
document.documentElement.appendChild(script);
script.remove();
