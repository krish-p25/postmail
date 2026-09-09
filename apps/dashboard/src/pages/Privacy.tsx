import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <nav className="border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="text-lg font-bold text-white">PostMail</Link>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <h1 className="text-2xl font-bold text-white sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-gray-500">Last updated: September 9, 2026</p>

        <div className="mt-8 space-y-8 text-gray-300 sm:mt-12 sm:space-y-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white sm:[&_h2]:text-xl [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-gray-400 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:text-gray-400 sm:[&_ul]:pl-6">
          <section>
            <h2>1. Introduction</h2>
            <p>
              PostMail ("we", "us", "our") operates the PostMail web application and browser extension
              (collectively, the "Service"). This Privacy Policy explains how we collect, use, and
              protect your information when you use our Service.
            </p>
          </section>

          <section>
            <h2>2. Information We Collect</h2>
            <p>We collect the following types of information:</p>
            <ul>
              <li><strong className="text-gray-200">Account information:</strong> Email address and password (hashed) when you register, or your profile information if you sign in with Google or Microsoft.</li>
              <li><strong className="text-gray-200">Connected mailbox data:</strong> When you connect a Gmail or Outlook mailbox, we store OAuth tokens (access token, refresh token, token expiry) to access your sent mail folder on your behalf. We do not store your mailbox password.</li>
              <li><strong className="text-gray-200">Email metadata:</strong> Recipient email addresses, subject lines, provider message IDs, and timestamps of emails you choose to track. This applies to new messages, replies, and forwards. We do not read or store email body content beyond what is necessary to verify that a tracked email was sent.</li>
              <li><strong className="text-gray-200">Tracking data:</strong> Open events (timestamp, approximate location via IP address, device/browser information) when a tracked email is opened by a recipient.</li>
              <li><strong className="text-gray-200">Usage data:</strong> How you interact with the Service, including features used and pages visited.</li>
            </ul>
          </section>

          <section>
            <h2>3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul>
              <li>Provide, maintain, and improve the Service</li>
              <li>Track email open events and deliver notifications to you</li>
              <li>Verify that tracked emails were successfully sent by reading your sent mail folder</li>
              <li>Display your sent email history and tracking status on the dashboard</li>
              <li>Authenticate your identity and secure your account</li>
              <li>Send you service-related communications (such as account verification emails)</li>
              <li>Detect and prevent fraud or abuse</li>
            </ul>
          </section>

          <section>
            <h2>4. How Email Tracking Works</h2>
            <p>
              When you enable tracking on an email, PostMail inserts a small invisible image (a "tracking pixel")
              into your email via the browser extension. This applies to new compose windows, inline replies,
              and forwards in both Gmail and Outlook on the web. When the recipient opens the email, their
              email client loads the image from our servers, which records the open event.
            </p>
            <p>
              The tracking pixel is automatically re-injected if it is accidentally removed during editing
              (for example, if you select all content and delete it). If you disable tracking or cancel
              tracking on a specific email, the pixel is removed and no further tracking occurs for that email.
            </p>
            <p>
              Recipients are not individually notified that a tracking pixel is present, though this is
              standard practice in email marketing and sales tools.
            </p>
          </section>

          <section>
            <h2>5. OAuth and Mailbox Access</h2>
            <p>
              PostMail uses OAuth 2.0 to connect to your email provider. We request only the minimum
              permissions (scopes) necessary to provide the Service:
            </p>
            <ul>
              <li><strong className="text-gray-200">Gmail:</strong> Read-only access to sent mail, email metadata, and basic profile information.</li>
              <li><strong className="text-gray-200">Microsoft Outlook:</strong> Read-only access to mail (Mail.Read), basic user profile (User.Read), and offline access for token refresh.</li>
            </ul>
            <p>
              OAuth tokens are stored securely in our database and are encrypted in transit. We do not
              have access to your email provider password. You may revoke PostMail's access at any time
              by disconnecting the mailbox in your dashboard settings or by revoking access directly
              through your Google or Microsoft account security settings.
            </p>
          </section>

          <section>
            <h2>6. Data Sharing</h2>
            <p>We do not sell your personal information. We may share data with:</p>
            <ul>
              <li><strong className="text-gray-200">Service providers:</strong> Third-party services that help us operate the Service (hosting, analytics, notifications).</li>
              <li><strong className="text-gray-200">Legal requirements:</strong> When required by law, subpoena, or to protect our rights.</li>
              <li><strong className="text-gray-200">Business transfers:</strong> In connection with a merger, acquisition, or sale of assets.</li>
            </ul>
          </section>

          <section>
            <h2>7. Data Retention</h2>
            <p>
              We retain your account information and connected mailbox data for as long as your account is
              active. Email tracking data (including open events, recipient metadata, and message IDs)
              is retained for 12 months after the tracking event. Pre-send open events (opens recorded
              before an email is verified as sent) are automatically purged when the email is confirmed
              as sent. You can request deletion of your data at any time by contacting us or deleting
              your account, which also revokes all connected mailbox authorizations.
            </p>
          </section>

          <section>
            <h2>8. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your data, including encryption
              in transit (TLS), hashed passwords (bcrypt), secure token-based authentication (JWT), and
              row-level database security to ensure strict tenant isolation between user accounts.
              OAuth tokens are stored server-side and are never exposed to the browser extension or
              dashboard frontend. However, no method of transmission or storage is 100% secure.
            </p>
          </section>

          <section>
            <h2>9. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul>
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your data in a portable format</li>
              <li>Withdraw consent for data processing</li>
              <li>Disconnect linked mailboxes and revoke OAuth access</li>
            </ul>
            <p>To exercise these rights, contact us at support.postmail@krishrp.xyz.</p>
          </section>

          <section>
            <h2>10. Cookies and Local Storage</h2>
            <p>
              The Service uses browser local storage to maintain your authentication session. The browser
              extension uses Chrome's storage API to persist your preferences (such as tracking
              enabled/disabled state). We do not use third-party tracking cookies.
            </p>
          </section>

          <section>
            <h2>11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of significant changes
              by posting a notice on the Service or sending you an email. Continued use of the Service after
              changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2>12. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy, contact us at support.postmail@krishrp.xyz.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
