import { useState } from 'react';
import { api, LinkedMailboxInfo } from '../services/api';

interface ConnectMailboxCardProps {
  linkedMailboxes: LinkedMailboxInfo[];
  loading?: boolean;
  onDisconnect: (mailboxId: string) => void;
}

export default function ConnectMailboxCard({ linkedMailboxes, loading, onDisconnect }: ConnectMailboxCardProps) {
  const [connecting, setConnecting] = useState<'gmail' | 'outlook' | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connected = linkedMailboxes.length > 0;

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

  async function handleDisconnect(mailboxId: string) {
    setDisconnecting(mailboxId);
    setError(null);
    try {
      await api.disconnectMailbox(mailboxId);
      setConfirmId(null);
      onDisconnect(mailboxId);
    } catch {
      setError('Failed to disconnect. Please try again.');
    } finally {
      setDisconnecting(null);
    }
  }

  const confirmMailbox = linkedMailboxes.find((m) => m.id === confirmId);

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:p-6">
      <h3 className="text-lg font-medium text-gray-900">
        Connect your mailbox{connected ? 'es' : ''}
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        Link your email accounts to view and track your sent emails.
      </p>

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <div className="mt-4 space-y-3">
          <div className="h-12 animate-[shimmer_1.5s_infinite] rounded-lg bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" />
        </div>
      ) : (
        <>
          {/* List of connected mailboxes */}
          {linkedMailboxes.length > 0 && (
            <div className="mt-4 space-y-2">
              {linkedMailboxes.map((mb) => (
                <div key={mb.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                    {mb.provider === 'outlook' ? (
                      <svg className="h-4 w-4 shrink-0" viewBox="0 0 21 21">
                        <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                        <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                        <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                        <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                    )}
                    <span className="truncate text-sm font-medium text-gray-700">{mb.email}</span>
                  </div>
                  <button
                    onClick={() => setConfirmId(mb.id)}
                    className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Connect buttons */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              onClick={() => handleConnect('gmail')}
              disabled={connecting !== null}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connecting === 'gmail' ? 'Connecting...' : `Connect ${connected ? 'another ' : ''}Gmail`}
            </button>
            <button
              onClick={() => handleConnect('outlook')}
              disabled={connecting !== null}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connecting === 'outlook' ? 'Connecting...' : `Connect ${connected ? 'another ' : ''}Outlook`}
            </button>
          </div>
        </>
      )}

      {/* Disconnect confirmation modal */}
      {confirmId && confirmMailbox && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 px-4 pb-4 sm:items-center sm:pb-0" onClick={() => !disconnecting && setConfirmId(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Disconnect mailbox?</h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  {confirmMailbox.email} will be removed. You can reconnect anytime.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                onClick={() => setConfirmId(null)}
                disabled={!!disconnecting}
                className="min-h-[44px] rounded-lg border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDisconnect(confirmId)}
                disabled={!!disconnecting}
                className="min-h-[44px] rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
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
