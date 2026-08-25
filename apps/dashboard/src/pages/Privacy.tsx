import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <nav className="border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-bold text-white">PostMail</Link>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-bold text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-gray-500">Last updated: August 25, 2026</p>

        <div className="mt-12 space-y-10 text-gray-300 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-gray-400 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ul]:text-gray-400">
          <section>
            <h2>1. Introduction</h2>
            <p>
              PostMail ("we", "us", "our") operates the PostMail web application and Chrome extension
              (collectively, the "Service"). This Privacy Policy explains how we collect, use, and
              protect your information when you use our Service.
            </p>
          </section>

          <section>
            <h2>2. Information We Collect</h2>
            <p>We collect the following types of information:</p>
            <ul>
              <li><strong className="text-gray-200">Account information:</strong> Email address and password (hashed) when you register, or your Google profile information if you sign in with Google.</li>
              <li><strong className="text-gray-200">Email metadata:</strong> Recipient email addresses, subject lines, and timestamps of emails you choose to track. We do not read or store email body content.</li>
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
              <li>Authenticate your identity and secure your account</li>
              <li>Send you service-related communications</li>
              <li>Detect and prevent fraud or abuse</li>
            </ul>
          </section>

          <section>
            <h2>4. How Email Tracking Works</h2>
            <p>
              When you enable tracking on an email, PostMail inserts a small invisible image (a "tracking pixel")
              into your email. When the recipient opens the email, their email client loads the image from our
              servers, which records the open event. Recipients are not individually notified that a tracking
              pixel is present, though this is standard practice in email marketing and sales tools.
            </p>
          </section>

          <section>
            <h2>5. Data Sharing</h2>
            <p>We do not sell your personal information. We may share data with:</p>
            <ul>
              <li><strong className="text-gray-200">Service providers:</strong> Third-party services that help us operate the Service (hosting, analytics, notifications).</li>
              <li><strong className="text-gray-200">Legal requirements:</strong> When required by law, subpoena, or to protect our rights.</li>
              <li><strong className="text-gray-200">Business transfers:</strong> In connection with a merger, acquisition, or sale of assets.</li>
            </ul>
          </section>

          <section>
            <h2>6. Data Retention</h2>
            <p>
              We retain your account information for as long as your account is active. Email tracking data
              is retained for 12 months after the tracking event. You can request deletion of your data at
              any time by contacting us or deleting your account.
            </p>
          </section>

          <section>
            <h2>7. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your data, including encryption
              in transit (TLS), hashed passwords (bcrypt), and secure token-based authentication (JWT).
              However, no method of transmission or storage is 100% secure.
            </p>
          </section>

          <section>
            <h2>8. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul>
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your data in a portable format</li>
              <li>Withdraw consent for data processing</li>
            </ul>
            <p>To exercise these rights, contact us at privacy@postmail.app.</p>
          </section>

          <section>
            <h2>9. Cookies and Local Storage</h2>
            <p>
              The Service uses browser local storage to maintain your authentication session. The Chrome
              extension uses Chrome's storage API to persist your preferences. We do not use third-party
              tracking cookies.
            </p>
          </section>

          <section>
            <h2>10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of significant changes
              by posting a notice on the Service or sending you an email. Continued use of the Service after
              changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2>11. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy, contact us at privacy@postmail.app.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
