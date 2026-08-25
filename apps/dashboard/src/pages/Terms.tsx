import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <nav className="border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-bold text-white">PostMail</Link>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-bold text-white">Terms of Service</h1>
        <p className="mt-2 text-sm text-gray-500">Last updated: August 25, 2026</p>

        <div className="mt-12 space-y-10 text-gray-300 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-gray-400 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ul]:text-gray-400">
          <section>
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing or using the PostMail web application and Chrome extension (the "Service"),
              you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these
              Terms, do not use the Service.
            </p>
          </section>

          <section>
            <h2>2. Description of Service</h2>
            <p>
              PostMail provides email open tracking tools, including a Chrome extension that integrates
              with Gmail and a web dashboard for viewing tracking data. The Service inserts tracking
              pixels into emails you compose to detect when recipients open those emails.
            </p>
          </section>

          <section>
            <h2>3. Account Registration</h2>
            <p>
              To use the Service, you must create an account using an email address and password or by
              signing in with Google. You are responsible for maintaining the confidentiality of your
              account credentials and for all activities that occur under your account.
            </p>
          </section>

          <section>
            <h2>4. Acceptable Use</h2>
            <p>You agree not to use the Service to:</p>
            <ul>
              <li>Send spam or unsolicited bulk email</li>
              <li>Track emails in violation of applicable anti-spam or privacy laws (including CAN-SPAM, GDPR, and CASL)</li>
              <li>Harass, stalk, or intimidate any person</li>
              <li>Impersonate any person or entity</li>
              <li>Interfere with or disrupt the Service or its infrastructure</li>
              <li>Attempt to gain unauthorized access to other users' accounts or data</li>
              <li>Use the Service for any illegal purpose</li>
            </ul>
          </section>

          <section>
            <h2>5. User Responsibilities</h2>
            <p>
              You are solely responsible for ensuring that your use of email tracking complies with all
              applicable laws and regulations in your jurisdiction and the recipient's jurisdiction. Some
              jurisdictions require disclosure of email tracking to recipients. It is your responsibility
              to understand and comply with these requirements.
            </p>
          </section>

          <section>
            <h2>6. Service Tiers and Billing</h2>
            <p>
              The Service offers free and paid tiers. Free accounts are limited to 50 tracked emails per
              month. Paid plans are billed monthly. You may cancel your subscription at any time, and
              access to paid features will continue until the end of the current billing period. Refunds
              are not provided for partial billing periods.
            </p>
          </section>

          <section>
            <h2>7. Intellectual Property</h2>
            <p>
              The Service, including its design, code, and branding, is owned by PostMail and protected
              by intellectual property laws. You retain ownership of any content you create or track
              through the Service. By using the Service, you grant us a limited license to process your
              data as necessary to provide the Service.
            </p>
          </section>

          <section>
            <h2>8. Privacy</h2>
            <p>
              Your use of the Service is also governed by our{' '}
              <Link to="/privacy" className="text-[#0066FF] hover:underline">Privacy Policy</Link>,
              which describes how we collect, use, and protect your information.
            </p>
          </section>

          <section>
            <h2>9. Disclaimer of Warranties</h2>
            <p>
              The Service is provided "as is" and "as available" without warranties of any kind, either
              express or implied. We do not guarantee that tracking pixels will be loaded by all email
              clients, as some clients block external images by default. Open tracking accuracy depends
              on recipient email client behavior and is not guaranteed to be 100% accurate.
            </p>
          </section>

          <section>
            <h2>10. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, PostMail shall not be liable for any indirect,
              incidental, special, consequential, or punitive damages, or any loss of profits or revenue,
              whether incurred directly or indirectly, or any loss of data, use, or goodwill arising out
              of your use of the Service.
            </p>
          </section>

          <section>
            <h2>11. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your account at any time for violation of
              these Terms or for any other reason at our sole discretion. Upon termination, your right
              to use the Service ceases immediately. You may delete your account at any time through
              the dashboard settings.
            </p>
          </section>

          <section>
            <h2>12. Changes to Terms</h2>
            <p>
              We may modify these Terms at any time. We will provide notice of material changes by
              posting the updated Terms on the Service with a new "Last updated" date. Your continued
              use of the Service after changes constitutes acceptance of the modified Terms.
            </p>
          </section>

          <section>
            <h2>13. Governing Law</h2>
            <p>
              These Terms are governed by and construed in accordance with applicable law, without
              regard to conflict of law principles.
            </p>
          </section>

          <section>
            <h2>14. Contact Us</h2>
            <p>
              If you have questions about these Terms, contact us at legal@postmail.app.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
