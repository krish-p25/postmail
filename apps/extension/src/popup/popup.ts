const toggle = document.getElementById('trackingToggle') as HTMLInputElement;
const statusDot = document.getElementById('statusDot')!;
const statusText = document.getElementById('statusText')!;
const dashboardLink = document.getElementById('dashboardLink') as HTMLAnchorElement;

function updateStatusUI(enabled: boolean): void {
  statusDot.className = `status-dot ${enabled ? 'active' : 'inactive'}`;
  statusText.textContent = enabled ? 'Tracking active' : 'Tracking paused';
}

// Load current state
chrome.runtime.sendMessage({ type: 'GET_TRACKING_STATE' }, (response) => {
  if (response) {
    toggle.checked = response.trackingEnabled;
    updateStatusUI(response.trackingEnabled);
  }
});

// Handle toggle
toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  chrome.runtime.sendMessage({ type: 'SET_TRACKING_STATE', enabled });
  updateStatusUI(enabled);

  // Notify active Gmail tabs
  chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'TRACKING_STATE_CHANGED', enabled });
      }
    }
  });
});

// Dashboard link
dashboardLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://postmail.krishrp.xyz' });
});
