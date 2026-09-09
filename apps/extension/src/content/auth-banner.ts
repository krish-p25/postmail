/**
 * Context-aware banner shown at the top of email clients (Gmail/Outlook).
 *
 * Green "ready" banner  — current account is linked, tracking is active.
 * Purple "setup" banner — extension not linked or account not recognised.
 *
 * Both auto-dismiss after a timeout with a visible progress bar.
 */

const BANNER_ID = 'postmail-auth-banner';
const SIGNUP_URL = 'https://postmail.krishrp.xyz/auth/register';
const SIGNIN_URL = 'https://postmail.krishrp.xyz/auth/login';

const READY_TIMEOUT = 4000;
const SETUP_TIMEOUT = 12000;

// Session-level dismiss flag — survives SPA navigations but not tab close
let dismissedThisSession = false;

function injectBannerStyles(): void {
  if (document.getElementById('postmail-banner-styles')) return;
  const style = document.createElement('style');
  style.id = 'postmail-banner-styles';
  style.textContent = `
    @keyframes postmail-banner-slide {
      from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
      to   { transform: translateX(-50%) translateY(0);     opacity: 1; }
    }
    @keyframes postmail-banner-slide-out {
      from { transform: translateX(-50%) translateY(0);     opacity: 1; }
      to   { transform: translateX(-50%) translateY(-20px); opacity: 0; }
    }
    @keyframes postmail-timeline-shrink {
      from { width: 100%; }
      to   { width: 0%; }
    }
    #${BANNER_ID} * {
      box-sizing: border-box;
    }
  `;
  document.head.appendChild(style);
}

export type BannerMode = 'ready' | 'setup' | 'expired';

export function showBanner(mode: BannerMode): void {
  if (dismissedThisSession) return;
  if (document.getElementById(BANNER_ID)) return;

  injectBannerStyles();

  const isReady = mode === 'ready';
  const isExpired = mode === 'expired';

  const bgTint = isReady
    ? 'rgba(22, 163, 74, 0.18)'
    : 'rgba(79, 70, 229, 0.18)';
  const borderColor = isReady
    ? 'rgba(22, 163, 74, 0.25)'
    : 'rgba(79, 70, 229, 0.25)';
  const shadowColor = isReady
    ? 'rgba(22, 163, 74, 0.15)'
    : 'rgba(79, 70, 229, 0.15)';
  const textColor = isReady ? '#15803d' : '#3730a3';
  const subtitleColor = isReady ? 'rgba(21, 128, 61, 0.75)' : 'rgba(55, 48, 163, 0.75)';
  const timeout = isReady ? READY_TIMEOUT : SETUP_TIMEOUT;
  const timelineTrack = isReady ? 'rgba(22, 163, 74, 0.12)' : 'rgba(79, 70, 229, 0.12)';
  const timelineBar = isReady ? 'rgba(22, 163, 74, 0.5)' : 'rgba(79, 70, 229, 0.5)';

  let headline: string;
  let subtitle: string;
  let ctaText: string;
  let ctaUrl: string;
  let ctaColor: string;

  if (isReady) {
    headline = 'PostMail tracking ready to go';
    subtitle = 'Email open tracking is active for this account.';
    ctaText = '';
    ctaUrl = '';
    ctaColor = '#16a34a';
  } else if (isExpired) {
    headline = 'Your PostMail session has expired';
    subtitle = 'Sign back in to resume email open tracking.';
    ctaText = 'Sign Back In';
    ctaUrl = SIGNIN_URL;
    ctaColor = '#4f46e5';
  } else {
    headline = 'Track when your emails are opened';
    subtitle = 'PostMail is installed — create a free account to start getting read receipts.';
    ctaText = 'Get Started Free';
    ctaUrl = SIGNUP_URL;
    ctaColor = '#4f46e5';
  }

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  Object.assign(banner.style, {
    position: 'fixed',
    top: '12px',
    left: '50%',
    width: 'fit-content',
    maxWidth: 'calc(100% - 32px)',
    zIndex: '2147483647',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    background: bgTint,
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: `1px solid ${borderColor}`,
    borderRadius: '14px',
    color: textColor,
    display: 'flex',
    flexDirection: 'column',
    animation: 'postmail-banner-slide 350ms ease-out forwards',
    boxShadow: `0 8px 32px ${shadowColor}, 0 0 0 1px ${borderColor}`,
    overflow: 'hidden',
  });

  const iconColor = isReady ? '#16a34a' : '#4f46e5';
  const iconBg = isReady ? 'rgba(22, 163, 74, 0.12)' : 'rgba(79, 70, 229, 0.12)';

  // Icon SVG — checkmark for ready, mail icon for setup
  const iconSvg = isReady
    ? `<div style="width: 32px; height: 32px; border-radius: 8px; background: ${iconBg}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
      </div>`
    : `<div style="width: 32px; height: 32px; border-radius: 8px; background: ${iconBg}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <svg width="18" height="18" viewBox="0 0 128 128" fill="none">
          <rect x="24" y="36" width="80" height="56" rx="8" stroke="${iconColor}" stroke-width="8" fill="none"/>
          <path d="M28 40l36 28 36-28" stroke="${iconColor}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>`;

  const ctaBg = isReady ? 'rgba(22, 163, 74, 0.1)' : 'rgba(79, 70, 229, 0.1)';
  const ctaBgHover = isReady ? 'rgba(22, 163, 74, 0.18)' : 'rgba(79, 70, 229, 0.18)';
  const ctaHtml = ctaText
    ? `<a href="${ctaUrl}" target="_blank" rel="noopener noreferrer"
        data-postmail-banner-cta
        style="display: inline-block; padding: 7px 16px; background: ${ctaBg}; color: ${textColor}; font-size: 13px; font-weight: 600; border-radius: 8px; text-decoration: none; transition: background 0.15s; white-space: nowrap; border: 1px solid ${borderColor};">
        ${ctaText}
      </a>`
    : '';

  banner.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; gap: 16px; flex-wrap: wrap; padding: 12px 20px;">
      <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
        ${iconSvg}
        <div style="min-width: 0;">
          <div style="font-size: 14px; font-weight: 600; line-height: 1.3; color: ${textColor};">
            ${headline}
          </div>
          <div style="font-size: 12px; color: ${subtitleColor}; line-height: 1.4; margin-top: 1px;">
            ${subtitle}
          </div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
        ${ctaHtml}
        <button data-postmail-banner-dismiss
          style="background: none; border: none; cursor: pointer; padding: 4px; color: ${subtitleColor}; line-height: 1; transition: color 0.15s;"
          title="Dismiss">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>
    <div style="height: 2px; width: 100%; background: ${timelineTrack}; overflow: hidden; border-radius: 0 0 14px 14px;">
      <div data-postmail-timeline
        style="height: 100%; background: ${timelineBar}; width: 100%; animation: postmail-timeline-shrink ${timeout}ms linear forwards;">
      </div>
    </div>
  `;

  document.body.appendChild(banner);

  // Hover effects on CTA
  const cta = banner.querySelector('[data-postmail-banner-cta]') as HTMLAnchorElement | null;
  if (cta) {
    cta.addEventListener('mouseover', () => { cta.style.background = ctaBgHover; });
    cta.addEventListener('mouseout', () => { cta.style.background = ctaBg; });
  }

  // Dismiss button
  const dismiss = banner.querySelector('[data-postmail-banner-dismiss]') as HTMLButtonElement;
  if (dismiss) {
    dismiss.addEventListener('mouseover', () => { dismiss.style.color = textColor; });
    dismiss.addEventListener('mouseout', () => { dismiss.style.color = subtitleColor; });
    dismiss.addEventListener('click', () => dismissBanner());
  }

  // Auto-dismiss after timeout
  const timer = setTimeout(() => dismissBanner(), timeout);

  // Store timer so manual dismiss can clear it
  (banner as any).__postmailTimer = timer;
}

export function showAuthBanner(reason: string, linkedEmails?: string[], currentEmail?: string | null): void {
  if (reason === 'token_invalid') {
    showBanner('expired');
    return;
  }

  // Authenticated — check if current email is in linked list
  if (reason === 'ok' && linkedEmails) {
    if (!currentEmail) {
      // Couldn't detect the email — don't show any banner (avoid false positives)
      return;
    }
    const normalised = currentEmail.toLowerCase();
    const isLinked = linkedEmails.some((e) => e.toLowerCase() === normalised);
    showBanner(isLinked ? 'ready' : 'setup');
    return;
  }

  // Default: show setup banner (no_token, server errors, etc.)
  showBanner('setup');
}

function dismissBanner(): void {
  dismissedThisSession = true;
  const banner = document.getElementById(BANNER_ID);
  if (!banner) return;
  clearTimeout((banner as any).__postmailTimer);
  banner.style.animation = 'postmail-banner-slide-out 250ms ease-in forwards';
  banner.addEventListener('animationend', () => banner.remove(), { once: true });
}

export function removeAuthBanner(): void {
  const banner = document.getElementById(BANNER_ID);
  if (banner) {
    clearTimeout((banner as any).__postmailTimer);
    banner.remove();
  }
}
