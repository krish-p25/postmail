import { useState } from 'react';
import { api } from '../services/api';

interface ConnectMailboxCardProps {
  connected: boolean;
  provider: string | null;
  onDisconnect: () => void;
}

export default function ConnectMailboxCard({ connected, provider, onDisconnect }: ConnectMailboxCardProps) {
  const [connecting, setConnecting] = useState<'gmail' | 'outlook' | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
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

      {connected ? (
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-gray-700">
              {providerLabel} connected
            </span>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
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
    </div>
  );
}
