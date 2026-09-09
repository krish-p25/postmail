const DASHBOARD_URL = 'https://postmail.krishrp.xyz';
const SIGNUP_URL = 'https://postmail.krishrp.xyz/auth/register';
const SIGNIN_URL = 'https://postmail.krishrp.xyz/auth/login';

const authedView = document.getElementById('authedView')!;
const unauthedView = document.getElementById('unauthedView')!;
const loadingView = document.getElementById('loadingView')!;

const toggle = document.getElementById('trackingToggle') as HTMLInputElement;
const statusDot = document.getElementById('statusDot')!;
const statusText = document.getElementById('statusText')!;
const dashboardLink = document.getElementById('dashboardLink') as HTMLAnchorElement;
const signUpLink = document.getElementById('signUpLink') as HTMLAnchorElement;
const signInLink = document.getElementById('signInLink') as HTMLAnchorElement;

function showView(view: 'authed' | 'unauthed' | 'loading'): void {
  authedView.style.display = view === 'authed' ? 'block' : 'none';
  unauthedView.style.display = view === 'unauthed' ? 'block' : 'none';
  loadingView.style.display = view === 'loading' ? 'block' : 'none';
}

function updateStatusUI(enabled: boolean): void {
  statusDot.className = `status-dot ${enabled ? 'active' : 'inactive'}`;
  statusText.textContent = enabled ? 'Tracking active' : 'Tracking paused';
}

// Check auth status, then show the appropriate view
chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (response) => {
  if (response?.ok) {
    // Authenticated — load tracking state and show main view
    chrome.runtime.sendMessage({ type: 'GET_TRACKING_STATE' }, (stateResponse) => {
      if (stateResponse) {
        toggle.checked = stateResponse.trackingEnabled;
        updateStatusUI(stateResponse.trackingEnabled);
      }
      showView('authed');
    });
  } else {
    showView('unauthed');
  }
});

// Handle toggle
toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  chrome.runtime.sendMessage({ type: 'SET_TRACKING_STATE', enabled });
  updateStatusUI(enabled);

  // Notify active email client tabs
  const emailUrls = [
    'https://mail.google.com/*',
    'https://outlook.office.com/*',
    'https://outlook.live.com/*',
    'https://outlook.office365.com/*',
  ];
  for (const url of emailUrls) {
    chrome.tabs.query({ url }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'TRACKING_STATE_CHANGED', enabled });
        }
      }
    });
  }
});

// Link handlers
dashboardLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: DASHBOARD_URL });
});

signUpLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: SIGNUP_URL });
});

signInLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: SIGNIN_URL });
});
