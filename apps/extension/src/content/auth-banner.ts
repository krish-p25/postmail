/**
 * Persistent sign-up banner shown at the top of email clients (Gmail/Outlook)
 * when the user has no JWT linked. Dismissable per session — reappears on
 * next page load / navigation.
 */

const BANNER_ID = 'postmail-auth-banner';
const BRAND_COLOR = '#4f46e5';
const SIGNUP_URL = 'https://postmail.krishrp.xyz/auth/register';
const SIGNIN_URL = 'https://postmail.krishrp.xyz/auth/login';

// Session-level dismiss flag — survives SPA navigations but not tab close
let dismissedThisSession = false;

function injectBannerStyles(): void {
  if (document.getElementById('postmail-banner-styles')) return;
  const style = document.createElement('style');
  style.id = 'postmail-banner-styles';
  style.textContent = `
    @keyframes postmail-banner-slide {
      from { transform: translateY(-100%); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }
    @keyframes postmail-banner-slide-out {
      from { transform: translateY(0);     opacity: 1; }
      to   { transform: translateY(-100%); opacity: 0; }
    }
    #${BANNER_ID} * {
      box-sizing: border-box;
    }
  `;
  document.head.appendChild(style);
}

export function showAuthBanner(reason: string): void {
  if (dismissedThisSession) return;
  if (document.getElementById(BANNER_ID)) return;

  injectBannerStyles();

  const isExpired = reason === 'token_invalid';
  const headline = isExpired
    ? 'Your PostMail session has expired'
    : 'Track when your emails are opened';
  const subtitle = isExpired
    ? 'Sign back in to resume email open tracking.'
    : 'PostMail is installed — create a free account to start getting read receipts.';
  const ctaText = isExpired ? 'Sign Back In' : 'Get Started Free';
  const ctaUrl = isExpired ? SIGNIN_URL : SIGNUP_URL;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  Object.assign(banner.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    zIndex: '2147483647',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    background: `linear-gradient(135deg, ${BRAND_COLOR}, #6366f1)`,
    color: '#fff',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    flexWrap: 'wrap' as string,
    animation: 'postmail-banner-slide 350ms ease-out forwards',
    boxShadow: '0 2px 12px rgba(79, 70, 229, 0.3)',
  });

  banner.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
      <svg width="22" height="22" viewBox="0 0 128 128" fill="none" style="flex-shrink: 0;">
        <rect width="128" height="128" rx="28" fill="rgba(255,255,255,0.2)"/>
        <rect x="24" y="36" width="80" height="56" rx="8" stroke="#fff" stroke-width="6" fill="none"/>
        <path d="M28 40l36 28 36-28" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div style="min-width: 0;">
        <div style="font-size: 14px; font-weight: 600; line-height: 1.3;">
          ${headline}
        </div>
        <div style="font-size: 12px; opacity: 0.85; line-height: 1.4; margin-top: 1px;">
          ${subtitle}
        </div>
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
      <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer"
        data-postmail-banner-cta
        style="display: inline-block; padding: 7px 16px; background: #fff; color: ${BRAND_COLOR}; font-size: 13px; font-weight: 600; border-radius: 6px; text-decoration: none; transition: background 0.15s; white-space: nowrap;">
        ${ctaText}
      </a>
      <button data-postmail-banner-dismiss
        style="background: none; border: none; cursor: pointer; padding: 4px; color: rgba(255,255,255,0.7); line-height: 1; transition: color 0.15s;"
        title="Dismiss">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  `;

  document.body.appendChild(banner);

  // Hover effects
  const cta = banner.querySelector('[data-postmail-banner-cta]') as HTMLAnchorElement;
  if (cta) {
    cta.addEventListener('mouseover', () => { cta.style.background = '#eef2ff'; });
    cta.addEventListener('mouseout', () => { cta.style.background = '#fff'; });
  }

  const dismiss = banner.querySelector('[data-postmail-banner-dismiss]') as HTMLButtonElement;
  if (dismiss) {
    dismiss.addEventListener('mouseover', () => { dismiss.style.color = '#fff'; });
    dismiss.addEventListener('mouseout', () => { dismiss.style.color = 'rgba(255,255,255,0.7)'; });
    dismiss.addEventListener('click', () => dismissBanner());
  }
}

function dismissBanner(): void {
  dismissedThisSession = true;
  const banner = document.getElementById(BANNER_ID);
  if (!banner) return;
  banner.style.animation = 'postmail-banner-slide-out 250ms ease-in forwards';
  banner.addEventListener('animationend', () => banner.remove(), { once: true });
}

export function removeAuthBanner(): void {
  const banner = document.getElementById(BANNER_ID);
  if (banner) banner.remove();
}
