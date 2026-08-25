/**
 * Lightweight content script that runs on the PostMail dashboard.
 * Sets a data attribute so the dashboard can detect the extension is installed.
 */
document.documentElement.setAttribute('data-postmail-extension', 'true');
