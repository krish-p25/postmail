export type ToastState = 'tracking' | 'verifying' | 'success' | 'draft' | 'error' | 'cancelled' | 'setup';

export interface ToastData {
  subject: string;
  recipient: string;
}

const DASHBOARD_URL = 'https://postmail.krishrp.xyz/dashboard/emails';
const SETUP_URL = 'https://postmail.krishrp.xyz/dashboard/setup';
const TOAST_WIDTH = 360;
const AUTO_DISMISS_MS = 5000;
const STACK_GAP = 12;
const BRAND_COLOR = '#4f46e5'; // primary-600 indigo

// Track active toasts for stacking
const activeToasts: TrackingToast[] = [];

function injectStyles() {
  if (document.getElementById('postmail-toast-styles')) return;
  const style = document.createElement('style');
  style.id = 'postmail-toast-styles';
  style.textContent = `
    @keyframes postmail-toast-in {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes postmail-toast-out {
      from { transform: translateY(0); opacity: 1; }
      to { transform: translateY(20px); opacity: 0; }
    }
    @keyframes postmail-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes postmail-check {
      0% { stroke-dashoffset: 24; }
      100% { stroke-dashoffset: 0; }
    }
    @keyframes postmail-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
  `;
  document.head.appendChild(style);
}

function getIcon(state: ToastState): string {
  switch (state) {
    case 'tracking':
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#e0e7ff"/>
        <circle cx="12" cy="12" r="4" fill="${BRAND_COLOR}" style="animation: postmail-pulse 2s ease-in-out infinite;"/>
      </svg>`;
    case 'verifying':
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="animation: postmail-spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10" stroke="${BRAND_COLOR}" stroke-width="2.5" stroke-dasharray="50 20" stroke-linecap="round"/>
      </svg>`;
    case 'success':
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#dcfce7"/>
        <path d="M8 12.5l2.5 2.5 5.5-5.5" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          style="stroke-dasharray: 24; animation: postmail-check 0.4s ease forwards;"/>
      </svg>`;
    case 'draft':
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#fef9c3"/>
        <path d="M12 8v5M12 15.5v.5" stroke="#ca8a04" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    case 'error':
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#fee2e2"/>
        <path d="M12 8v5M12 15.5v.5" stroke="#dc2626" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    case 'cancelled':
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#f3f4f6"/>
        <path d="M15 9l-6 6M9 9l6 6" stroke="#6b7280" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
    case 'setup':
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#fef3c7"/>
        <path d="M12 8v4l2.5 1.5" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  }
}

function getTitle(state: ToastState): string {
  switch (state) {
    case 'tracking': return 'Tracking this email';
    case 'verifying': return 'Verifying tracking...';
    case 'success': return 'Tracking active';
    case 'draft': return 'Saved as draft';
    case 'error': return 'Could not verify tracking';
    case 'cancelled': return 'Tracking removed';
    case 'setup': return 'Setup required';
  }
}

function getSubtitle(state: ToastState, data: ToastData): string {
  const truncated = data.subject
    ? (data.subject.length > 50 ? data.subject.slice(0, 47) + '...' : data.subject)
    : 'Composing...';

  switch (state) {
    case 'tracking': return `You'll be notified when this email is opened`;
    case 'verifying': return truncated;
    case 'success': return `${data.recipient || 'Recipient'}${data.subject ? ' — ' + truncated : ''}`;
    case 'draft': return 'Tracking will activate when this email is sent';
    case 'error': return 'Check your connection and try again';
    case 'cancelled': return 'This email will not be tracked';
    case 'setup': {
      // data.recipient carries the preflight reason when shown from auth check
      const reason = data.recipient;
      if (reason === 'no_token') return 'Log in to the PostMail dashboard to sync your session';
      if (reason === 'token_invalid') return 'Your session has expired — log in to the dashboard again';
      if (reason === 'server_unreachable') return 'Cannot reach the PostMail server — is it running?';
      if (reason === 'server_error') return 'The PostMail server returned an error';
      return 'Complete PostMail setup to enable tracking';
    }
  }
}

export class TrackingToast {
  private el: HTMLDivElement | null = null;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private currentState: ToastState = 'tracking';
  private onDontTrack: (() => void) | null = null;

  show(state: ToastState, data: ToastData, onDontTrack?: () => void): void {
    console.log(`[PostMail][Toast] show(${state})`, data);
    injectStyles();
    this.currentState = state;
    this.onDontTrack = onDontTrack || null;

    this.el = document.createElement('div');
    this.el.setAttribute('data-postmail-toast', 'true');
    Object.assign(this.el.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      width: `${TOAST_WIDTH}px`,
      zIndex: '9999',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      background: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
      overflow: 'hidden',
      animation: 'postmail-toast-in 300ms ease-out forwards',
    });

    this.el.innerHTML = this.buildContent(state, data);
    this.attachListeners(data);

    document.body.appendChild(this.el);
    activeToasts.push(this);
    this.repositionAll();

    if (state !== 'tracking' && state !== 'verifying' && state !== 'setup') {
      this.scheduleAutoDismiss();
    }
  }

  update(state: ToastState, data: ToastData): void {
    console.log(`[PostMail][Toast] update(${state})`, data);
    if (!this.el) return;
    this.currentState = state;

    const content = this.el.querySelector('[data-postmail-toast-content]') as HTMLElement;
    if (content) {
      content.innerHTML = this.buildInnerContent(state, data);
    }
    this.attachListeners(data);

    if (state !== 'tracking' && state !== 'verifying' && state !== 'setup') {
      this.scheduleAutoDismiss();
    }
  }

  dismiss(): void {
    if (!this.el) return;
    if (this.dismissTimer) clearTimeout(this.dismissTimer);

    this.el.style.animation = 'postmail-toast-out 200ms ease-in forwards';
    this.el.addEventListener('animationend', () => {
      this.el?.remove();
      this.el = null;
      const idx = activeToasts.indexOf(this);
      if (idx !== -1) activeToasts.splice(idx, 1);
      this.repositionAll();
    }, { once: true });
  }

  isVisible(): boolean {
    return this.el !== null;
  }

  private buildContent(state: ToastState, data: ToastData): string {
    return `
      <div style="height: 3px; background: linear-gradient(90deg, ${BRAND_COLOR}, #818cf8);"></div>
      <div style="display: flex; align-items: center; gap: 6px; padding: 8px 16px 0 16px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="5" fill="${BRAND_COLOR}"/>
          <path d="M5 8l7 5 7-5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="4" y="7" width="16" height="11" rx="2" stroke="#fff" stroke-width="2" fill="none"/>
        </svg>
        <span style="font-size: 10px; font-weight: 700; color: ${BRAND_COLOR}; letter-spacing: 0.5px; text-transform: uppercase;">PostMail</span>
      </div>
      <div data-postmail-toast-content>
        ${this.buildInnerContent(state, data)}
      </div>
    `;
  }

  private buildInnerContent(state: ToastState, data: ToastData): string {
    const showLink = state === 'success' || state === 'draft' || state === 'error';
    const showDontTrack = state === 'tracking';
    const showSetupLink = state === 'setup';
    return `
      <div style="padding: 14px 16px;">
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <div style="flex-shrink: 0; margin-top: 1px;">
            ${getIcon(state)}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 14px; font-weight: 600; color: #111827; line-height: 1.3;">
              ${getTitle(state)}
            </div>
            <div style="font-size: 12px; color: #6b7280; margin-top: 3px; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${getSubtitle(state, data)}
            </div>
            ${showDontTrack ? `
              <button data-postmail-dont-track
                style="display: inline-block; margin-top: 8px; font-size: 12px; font-weight: 500; color: #dc2626; background: none; border: 1px solid #fecaca; border-radius: 6px; padding: 3px 10px; cursor: pointer; transition: background 0.15s;">
                Don't track
              </button>
            ` : ''}
            ${showSetupLink ? `
              <a href="${SETUP_URL}" target="_blank" rel="noopener noreferrer"
                data-postmail-link
                style="display: inline-block; margin-top: 8px; font-size: 12px; font-weight: 500; color: #d97706; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 4px 12px; text-decoration: none; transition: background 0.15s;">
                Complete Setup &rarr;
              </a>
            ` : ''}
            ${showLink ? `
              <a href="${DASHBOARD_URL}" target="_blank" rel="noopener noreferrer"
                data-postmail-link
                style="display: inline-block; margin-top: 8px; font-size: 12px; font-weight: 500; color: ${BRAND_COLOR}; text-decoration: none;">
                View on Dashboard &rarr;
              </a>
            ` : ''}
          </div>
          <button data-postmail-dismiss
            style="flex-shrink: 0; background: none; border: none; cursor: pointer; padding: 2px; color: #9ca3af; line-height: 1;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  private attachListeners(_data: ToastData): void {
    if (!this.el) return;

    const dismissBtn = this.el.querySelector('[data-postmail-dismiss]');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => this.dismiss(), { once: true });
    }

    const dontTrackBtn = this.el.querySelector('[data-postmail-dont-track]') as HTMLButtonElement;
    if (dontTrackBtn && this.onDontTrack) {
      const handler = this.onDontTrack;
      dontTrackBtn.addEventListener('mouseover', () => {
        dontTrackBtn.style.background = '#fef2f2';
      });
      dontTrackBtn.addEventListener('mouseout', () => {
        dontTrackBtn.style.background = 'none';
      });
      dontTrackBtn.addEventListener('click', () => {
        console.log('[PostMail][Toast] "Don\'t track" clicked');
        handler();
      }, { once: true });
    }

    const link = this.el.querySelector('[data-postmail-link]') as HTMLAnchorElement;
    if (link) {
      link.addEventListener('mouseover', () => { link.style.textDecoration = 'underline'; });
      link.addEventListener('mouseout', () => { link.style.textDecoration = 'none'; });
    }
  }

  private scheduleAutoDismiss(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => this.dismiss(), AUTO_DISMISS_MS);
  }

  private repositionAll(): void {
    let bottom = 24;
    for (const toast of activeToasts) {
      if (toast.el) {
        toast.el.style.bottom = `${bottom}px`;
        bottom += toast.el.offsetHeight + STACK_GAP;
      }
    }
  }
}
