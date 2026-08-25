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
  hasAttachments: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function extractName(recipient: string): string {
  // "John Doe <john@example.com>" → "John Doe"
  const match = recipient.match(/^(.+?)\s*<[^>]+>$/);
  if (match) return match[1].trim().replace(/^"|"$/g, '');
  return recipient.trim();
}

function formatRecipients(recipients: string[]): string {
  if (recipients.length === 0) return '—';
  const first = extractName(recipients[0]);
  if (recipients.length === 1) return first;
  return `${first} +${recipients.length - 1}`;
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
        <>
          {/* Skeleton — mobile cards */}
          <div className="mt-6 space-y-3 sm:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
                <div className="h-4 w-3/4 animate-[shimmer_1.5s_infinite] rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" />
                <div className="mt-3 h-3 w-1/2 animate-[shimmer_1.5s_infinite] rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" style={{ animationDelay: '0.15s' }} />
                <div className="mt-3 flex items-center justify-between">
                  <div className="h-3 w-24 animate-[shimmer_1.5s_infinite] rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" style={{ animationDelay: '0.3s' }} />
                  <div className="h-5 w-16 animate-[shimmer_1.5s_infinite] rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" style={{ animationDelay: '0.45s' }} />
                </div>
              </div>
            ))}
          </div>
          {/* Skeleton — desktop table */}
          <div className="mt-6 hidden overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 sm:block">
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
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3"><div className="h-4 w-48 animate-[shimmer_1.5s_infinite] rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-36 animate-[shimmer_1.5s_infinite] rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" style={{ animationDelay: '0.15s' }} /></td>
                    <td className="px-4 py-3"><div className="h-4 w-24 animate-[shimmer_1.5s_infinite] rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" style={{ animationDelay: '0.3s' }} /></td>
                    <td className="px-4 py-3"><div className="h-5 w-16 animate-[shimmer_1.5s_infinite] rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" style={{ animationDelay: '0.45s' }} /></td>
                    <td className="px-4 py-3"><div className="h-7 w-14 animate-[shimmer_1.5s_infinite] rounded-lg bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" style={{ animationDelay: '0.6s' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
        <>
          {/* Mobile — card layout */}
          <div className="mt-6 space-y-3 sm:hidden">
            {emails.map((email) => (
              <button
                key={email.id}
                onClick={() => navigate(`/dashboard/emails/${email.id}`)}
                className="block w-full rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-gray-200 transition active:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-gray-900 line-clamp-2">{email.subject}</p>
                    {email.hasAttachments && (
                      <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                      </svg>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                    Untracked
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-gray-600" title={email.recipients.join(', ')}>
                  {formatRecipients(email.recipients)}
                </p>
                <p className="mt-1 text-xs text-gray-400">{formatDate(email.sentAt)}</p>
              </button>
            ))}
          </div>

          {/* Desktop — table layout */}
          <div className="mt-6 hidden overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 sm:block">
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
                      <div className="flex items-center gap-1.5">
                        {email.subject}
                        {email.hasAttachments && (
                          <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                          </svg>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600" title={email.recipients.join(', ')}>
                      {formatRecipients(email.recipients)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
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
        </>
      )}
    </div>
  );
}
