import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

function ExtensionBanner() {
  const [extensionDetected, setExtensionDetected] = useState<boolean | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const installed = document.documentElement.getAttribute('data-postmail-extension') === 'true';
      setExtensionDetected(installed);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  if (extensionDetected !== false) return null;

  return (
    <div className="mb-6 rounded-xl bg-amber-50 p-5 ring-1 ring-amber-200">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-full bg-amber-100 p-2">
          <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">Chrome extension not detected</h3>
          <p className="mt-1 text-sm text-gray-600">
            Install the PostMail Chrome extension to start tracking email opens in Gmail.
          </p>
          <ol className="mt-3 space-y-2 text-sm text-gray-700">
            <li className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">1</span>
              <span>Open <code className="rounded bg-white px-1.5 py-0.5 text-xs text-gray-800 ring-1 ring-gray-200">chrome://extensions</code> in your browser</span>
            </li>
            <li className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">2</span>
              <span>Enable <strong className="font-medium text-gray-900">Developer mode</strong> (top-right toggle)</span>
            </li>
            <li className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">3</span>
              <span>Click <strong className="font-medium text-gray-900">Load unpacked</strong> and select the <code className="rounded bg-white px-1.5 py-0.5 text-xs text-gray-800 ring-1 ring-gray-200">apps/extension/dist</code> folder</span>
            </li>
            <li className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">4</span>
              <span>Refresh this page to confirm detection</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

interface MailEmail {
  id: string;
  subject: string;
  recipients: string[];
  sentAt: string | null;
  tracked: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRecipients(recipients: string[]): string {
  if (recipients.length === 0) return '—';
  if (recipients.length === 1) return recipients[0];
  return `${recipients[0]} +${recipients.length - 1}`;
}

export default function Emails() {
  const navigate = useNavigate();
  const [mailboxConnected, setMailboxConnected] = useState<boolean | null>(null);
  const [emails, setEmails] = useState<MailEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then((settings) => {
        setMailboxConnected(settings.mailboxConnected ?? false);
        if (settings.mailboxConnected) {
          const fetchEmails =
            settings.mailboxProvider === 'outlook'
              ? api.getOutlookEmails()
              : api.getGmailEmails();
          return fetchEmails.then((data) => {
            setEmails(data.emails);
          });
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load emails');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <ExtensionBanner />

      <h2 className="text-2xl font-bold text-gray-900">Tracked Emails</h2>
      <p className="mt-1 text-sm text-gray-600">
        View open-tracking activity for your sent emails.
      </p>

      {loading && (
        <div className="mt-12 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {!loading && !error && mailboxConnected === false && (
        <div className="mt-12 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16">
          <svg
            className="h-12 w-12 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            Connect your mailbox
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Link your Gmail or Outlook account to see your sent emails here.
          </p>
          <Link
            to="/dashboard/settings"
            className="mt-6 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-700"
          >
            Go to Settings
          </Link>
        </div>
      )}

      {!loading && !error && mailboxConnected && emails.length === 0 && (
        <div className="mt-12 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16">
          <svg
            className="h-12 w-12 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No sent emails found
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Your sent emails will appear here.
          </p>
        </div>
      )}

      {!loading && !error && mailboxConnected && emails.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Recipient</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Sent</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {emails.map((email) => (
                <tr key={email.id} className="transition hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {email.subject}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600" title={email.recipients.join(', ')}>
                    {formatRecipients(email.recipients)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDate(email.sentAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-600">
                      Untracked
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`/dashboard/emails/${email.id}`)}
                      className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-700"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
