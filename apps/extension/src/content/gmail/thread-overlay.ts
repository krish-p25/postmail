/**
 * Gmail Thread Overlay
 *
 * Glassmorphic overlay shown in Gmail thread/message view displaying
 * tracking status and open details for tracked emails.
 * Matches by normalized subject against the tracked emails map.
 */

import { TrackedEmailSummary, buildBadgeConfig, parseDevice } from '../shared/inbox-badge';

export const OVERLAY_ATTR = 'data-postmail-thread-overlay';

const BRAND_COLOR = '#4f46e5';

export function injectOverlayStyles(): void {
  if (document.getElementById('postmail-overlay-styles')) return;
  const style = document.createElement('style');
  style.id = 'postmail-overlay-styles';
  style.textContent = `
    @keyframes postmail-overlay-in {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .postmail-thread-overlay {
      padding: 14px 18px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: postmail-overlay-in 0.3s ease-out both;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.03);
      width: 100%;
      box-sizing: border-box;
      margin: 8px 0 12px;
    }
    .postmail-thread-overlay.postmail-overlay-tracked {
      background: rgba(237, 233, 254, 0.72);
      border: 1px solid rgba(167, 139, 250, 0.3);
    }
    .postmail-thread-overlay.postmail-overlay-opened {
      background: rgba(220, 252, 231, 0.72);
      border: 1px solid rgba(74, 222, 128, 0.3);
    }
    .postmail-overlay-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .postmail-overlay-status {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .postmail-overlay-status-text {
      font-size: 13px;
      font-weight: 600;
      line-height: 1.3;
    }
    .postmail-overlay-tracked .postmail-overlay-status-text { color: #6d28d9; }
    .postmail-overlay-opened .postmail-overlay-status-text { color: #15803d; }
    .postmail-overlay-brand {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-weight: 700;
      color: ${BRAND_COLOR};
      letter-spacing: 0.5px;
      text-transform: uppercase;
      opacity: 0.6;
    }
    .postmail-overlay-subtitle {
      font-size: 12px;
      margin-top: 4px;
    }
    .postmail-overlay-tracked .postmail-overlay-subtitle { color: #7c3aed; opacity: 0.7; }
    .postmail-overlay-opened .postmail-overlay-subtitle { color: #16a34a; opacity: 0.8; }
    .postmail-overlay-opens {
      margin-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .postmail-overlay-open-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      line-height: 16px;
    }
    .postmail-overlay-opened .postmail-overlay-open-row {
      color: #15803d;
      justify-content: space-between;
      border-bottom: 1px dotted #15803d;
    }
    .postmail-overlay-tracked .postmail-overlay-open-row { color: #6d28d9; }
    .postmail-overlay-open-time {
      font-weight: 500;
    }
    .postmail-overlay-open-sep {
      opacity: 0.4;
    }
    .postmail-overlay-open-device {
      opacity: 0.7;
    }
  `;
  document.head.appendChild(style);
}

export function createThreadOverlay(tracked: TrackedEmailSummary): HTMLElement {
  const overlay = document.createElement('div');
  overlay.setAttribute(OVERLAY_ATTR, tracked.id);
  overlay.setAttribute('data-opens', String(tracked.openCount));
  const config = buildBadgeConfig(tracked.openCount);
  overlay.className = `postmail-thread-overlay postmail-overlay-${config.variant}`;
  overlay.innerHTML = buildOverlayContent(tracked);
  return overlay;
}

export function isOverlayCurrent(overlay: Element, tracked: TrackedEmailSummary): boolean {
  return (
    overlay.getAttribute(OVERLAY_ATTR) === tracked.id &&
    overlay.getAttribute('data-opens') === String(tracked.openCount)
  );
}

// TODO(human): Build the overlay inner HTML for tracked vs opened states.
//
// tracked.openCount === 0 → purple "Tracked" state (no opens yet)
// tracked.openCount > 0   → green "Opened" state (list each open event)
//
// Data:  tracked.openCount, tracked.sentAt, tracked.opens[].{opened_at, user_agent, ip_address}
// Utils: parseDevice(ua) → "Chrome on Windows", buildBadgeConfig(n) → { label, variant }
//
// CSS classes available (see styles above):
//   .postmail-overlay-header, .postmail-overlay-status, .postmail-overlay-status-text,
//   .postmail-overlay-brand, .postmail-overlay-subtitle, .postmail-overlay-opens,
//   .postmail-overlay-open-row, .postmail-overlay-open-time, .postmail-overlay-open-sep,
//   .postmail-overlay-open-device
function buildOverlayContent(tracked: TrackedEmailSummary): string {
  if (!tracked) return ''
  else if (tracked && tracked.opens.length === 0) {
    return `
    <div class="postmail-overlay-header">
      <div class="postmail-overlay-status">
        <span class="postmail-overlay-status-text">
          Tracked - No Opens yet
        </span>
      </div>
    </div>
    `
  }
  else if (tracked && tracked.opens.length > 0) {
    return `
    <div class="postmail-overlay-header">
      <div class="postmail-overlay-status">
        <span class="postmail-overlay-status-text">
          Opened ${tracked.openCount} time${tracked.openCount > 1 ? 's' : ''}
        </span>
      </div>
    </div>

      <div class="postmail-overlay-opens">
          ${[...tracked.opens].sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime()).map(o => {
            return `
              <div class="postmail-overlay-open-row">
                <span class="postmail-overlay-open-time">
                  ${new Date(o.opened_at).toLocaleString()}
                </span>

                <span class="postmail-overlay-open-device">
                  ${parseDevice(o.user_agent)} - ${o.ip_address || ''}
                </span>
              </div>
            `
          }).join('')}
      </div>
      
    `
  }
  return ''
}
