import { useState } from 'react';
import { api } from '../services/api';

interface ConnectMailboxCardProps {
  connected: boolean;
  provider: string | null;
  email?: string | null;
  loading?: boolean;
  onDisconnect: () => void;
}

export default function ConnectMailboxCard({ connected, provider, email, loading, onDisconnect }: ConnectMailboxCardProps) {
  const [connecting, setConnecting] = useState<'gmail' | 'outlook' | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect(type: 'gmail' | 'outlook') {
    setConnecting(type);
    setError(null);
    try {
      const { url } =
        type === 'gmail'
          ? await api.getGmailConnectUrl()
          : await api.getOutlookConnectUrl();
      window.location.href = url;
    } catch {
      setError(`Failed to start ${type === 'gmail' ? 'Gmail' : 'Outlook'} connection. Please try again.`);
      setConnecting(null);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setError(null);
    try {
      if (provider === 'outlook') {
        await api.disconnectOutlook();
      } else {
        await api.disconnectGmail();
      }
      setConfirmOpen(false);
      onDisconnect();
    } catch {
      setError('Failed to disconnect. Please try again.');
    } finally {
      setDisconnecting(false);
    }
  }

  const providerLabel = provider === 'outlook' ? 'Outlook' : provider === 'gmail' ? 'Gmail' : 'Mailbox';

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <h3 className="text-lg font-medium text-gray-900">
        Connect your mailbox
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        Link your email account to view and track your sent emails.
      </p>

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-[shimmer_1.5s_infinite] rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" />
            <div className="h-4 w-32 animate-[shimmer_1.5s_infinite] rounded bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" />
          </div>
          <div className="h-8 w-24 animate-[shimmer_1.5s_infinite] rounded-lg bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" />
        </div>
      ) : connected ? (
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-gray-700">
              {providerLabel} connected
              {email && (
                <span className="ml-1 font-normal text-gray-500">({email})</span>
              )}
            </span>
          </div>
          <button
            onClick={() => setConfirmOpen(true)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => handleConnect('gmail')}
            disabled={connecting !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12s4.48 10 10 10 10-4.48 10-10zm-10 1.13L4.25 8.28A7.97 7.97 0 0 1 12 4c3.09 0 5.75 1.76 7.08 4.33L12 13.13zM4 12c0-.31.02-.62.06-.92L11 16l1 .55V20c-3.87 0-7-3.13-7-7v-1zm9 7.93V16.5l7-4.1c.04.2.04.4.04.6 0 3.56-2.66 6.5-6.1 6.97l-.94-.04z" />
            </svg>
            {connecting === 'gmail' ? 'Connecting...' : 'Connect Gmail'}
          </button>
          <button
            onClick={() => handleConnect('outlook')}
            disabled={connecting !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10h5v-2h-5c-4.34 0-8-3.66-8-8s3.66-8 8-8 8 3.66 8 8v1.43c0 .79-.71 1.57-1.5 1.57s-1.5-.78-1.5-1.57V12c0-2.76-2.24-5-5-5s-5 2.24-5 5 2.24 5 5 5c1.38 0 2.64-.56 3.54-1.47.65.89 1.77 1.47 2.96 1.47 1.97 0 3.5-1.6 3.5-3.57V12c0-5.52-4.48-10-10-10zm0 13c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" />
            </svg>
            {connecting === 'outlook' ? 'Connecting...' : 'Connect Outlook'}
          </button>
        </div>
      )}

      {/* Disconnect confirmation modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4" onClick={() => !disconnecting && setConfirmOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Disconnect {providerLabel}?</h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  {email ? `${email} will be ` : 'Your mailbox will be '}removed. You can reconnect anytime.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={disconnecting}
                className="rounded-lg border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
