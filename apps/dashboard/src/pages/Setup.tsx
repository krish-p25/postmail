import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { auth } from '../services/auth';

interface SetupStatus {
  account: boolean;
  extension: boolean;
  token: boolean;
  mailbox: boolean;
}

export default function Setup() {
  const { user } = useAuth();
  const [status, setStatus] = useState<SetupStatus>({
    account: false,
    extension: false,
    token: false,
    mailbox: false,
  });
  const [loading, setLoading] = useState(true);

  const setupChecked = useRef(false);
  useEffect(() => {
    if (setupChecked.current) return;
    setupChecked.current = true;
    checkSetupStatus();
  }, [user]);

  async function checkSetupStatus() {
    setLoading(true);

    const account = !!user;
    const token = !!auth.getToken();

    // Check if extension is installed by looking for the data attribute
    const extension = document.documentElement.hasAttribute('data-postmail-extension');

    let mailbox = false;
    try {
      const settings = await api.getSettings();
      mailbox = settings.mailboxConnected ?? false;
    } catch {
      // If we can't fetch settings, mailbox is not connected
    }

    setStatus({ account, extension, token, mailbox });
    setLoading(false);
  }

  const steps = [
    {
      key: 'account' as const,
      title: 'Create your account',
      description: 'Sign up for PostMail to get started.',
      done: status.account,
      action: null,
    },
    {
      key: 'extension' as const,
      title: 'Install the Chrome extension',
      description: 'The PostMail extension listens to your inbox to monitor your emails.',
      done: status.extension,
      action: !status.extension
        ? { label: 'How to install', onClick: () => window.open('https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked', '_blank') }
        : null,
    },
    {
      key: 'token' as const,
      title: 'Sync your session',
      description: status.token
        ? 'Your account is synced with the extension.'
        : 'Visit this dashboard while the extension is installed to sync your login session. If you just installed the extension, refresh this page.',
      done: status.token && status.extension,
      action: !status.token || !status.extension
        ? { label: 'Refresh', onClick: () => window.location.reload() }
        : null,
    },
    {
      key: 'mailbox' as const,
      title: 'Connect your mailbox',
      description: 'Connect Gmail so PostMail can verify when tracked emails are sent.',
      done: status.mailbox,
      action: !status.mailbox
        ? { label: 'Go to Settings', onClick: () => window.location.href = '/dashboard/settings?highlight=mailbox' }
        : null,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">Setup</h2>
      <p className="mt-1 text-sm text-gray-600">
        Complete these steps to start tracking email opens.
      </p>

      {/* Progress bar */}
      <div className="mt-6">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">
            {completedCount} of {steps.length} steps complete
          </span>
          {allDone && (
            <span className="font-medium text-green-600">All set!</span>
          )}
        </div>
        <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
          <div
            className="h-2 rounded-full bg-primary-600 transition-all duration-500"
            style={{ width: `${(completedCount / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-primary-600" />
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {steps.map((step, index) => (
            <div
              key={step.key}
              className={`rounded-xl bg-white p-5 shadow-sm ring-1 transition ${
                step.done ? 'ring-green-200' : 'ring-gray-200'
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Step indicator */}
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    step.done
                      ? 'bg-green-100 text-green-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {step.done ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>

                <div className="flex-1">
                  <h3 className={`text-sm font-semibold ${step.done ? 'text-green-700' : 'text-gray-900'}`}>
                    {step.title}
                  </h3>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {step.description}
                  </p>
                  {step.action && !step.done && (
                    <button
                      onClick={step.action.onClick}
                      className="mt-3 rounded-lg bg-primary-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700"
                    >
                      {step.action.label}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {allDone && (
        <div className="mt-8 rounded-xl bg-green-50 p-6 ring-1 ring-green-200">
          <div className="flex items-center gap-3">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-green-800">You're all set!</h3>
              <p className="mt-0.5 text-sm text-green-700">
                Open Gmail and compose an email — PostMail will automatically track it.
              </p>
            </div>
          </div>
          <a
            href="/dashboard/emails"
            className="mt-4 inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-green-700"
          >
            Go to Emails
          </a>
        </div>
      )}
    </div>
  );
}
