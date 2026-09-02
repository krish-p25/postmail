import { useState, useEffect, useRef, FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import ConnectMailboxCard from '../components/ConnectMailboxCard';

export default function Settings() {
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [mailboxConnected, setMailboxConnected] = useState(false);
  const [mailboxProvider, setMailboxProvider] = useState<string | null>(null);
  const [mailboxEmail, setMailboxEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Highlight mailbox card when navigating from Setup
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightMailbox, setHighlightMailbox] = useState(false);
  const mailboxRef = useRef<HTMLDivElement>(null);

  const settingsFetched = useRef(false);
  useEffect(() => {
    if (settingsFetched.current) return;
    settingsFetched.current = true;

    api
      .getSettings()
      .then((data) => {
        setDiscordWebhookUrl(data.discordWebhookUrl ?? '');
        setMailboxConnected(data.mailboxConnected ?? false);
        setMailboxProvider(data.mailboxProvider ?? null);
        setMailboxEmail(data.mailboxEmail ?? null);
      })
      .catch(() => {
        setMessage({ type: 'error', text: 'Failed to load settings.' });
      })
      .finally(() => setLoading(false));
  }, []);

  // Scroll to mailbox card and highlight when ?highlight=mailbox is present
  useEffect(() => {
    if (loading || searchParams.get('highlight') !== 'mailbox') return;

    const scrollTimer = setTimeout(() => {
      mailboxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);

    const highlightTimer = setTimeout(() => {
      setHighlightMailbox(true);
      setSearchParams({}, { replace: true });
    }, 600);

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(highlightTimer);
    };
  }, [loading, searchParams, setSearchParams]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await api.updateSettings({
        discordWebhookUrl: discordWebhookUrl.trim() || null,
      });
      setMessage({ type: 'success', text: 'Settings saved.' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
      <p className="mt-1 text-sm text-gray-600">
        Configure notifications and integrations.
      </p>

      <div className="mt-8 space-y-8">
        {/* Discord webhook */}
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Discord Notifications
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Receive a Discord message whenever a tracked email is opened.
          </p>

          <form onSubmit={handleSave} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="discordWebhookUrl"
                className="block text-sm font-medium text-gray-700"
              >
                Webhook URL
              </label>
              <input
                id="discordWebhookUrl"
                type="url"
                value={discordWebhookUrl}
                onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                disabled={loading}
                placeholder="https://discord.com/api/webhooks/..."
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            {message && (
              <div
                className={`rounded-lg p-3 text-sm ${
                  message.type === 'success'
                    ? 'bg-green-50 text-green-600'
                    : 'bg-red-50 text-red-600'
                }`}
              >
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || loading}
              className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </form>
        </div>

        {/* Connect mailbox */}
        <div ref={mailboxRef} className="relative z-[60]">
          {highlightMailbox && (
            <>
              <style>{`
                @keyframes mailbox-pulse {
                  0%, 100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.5); }
                  50% { box-shadow: 0 0 0 10px rgba(79, 70, 229, 0); }
                }
                @keyframes mailbox-fade {
                  0% { opacity: 1; }
                  100% { opacity: 0; }
                }
              `}</style>
              <div
                className="pointer-events-none absolute -inset-0.5 rounded-xl border-2 border-primary-500"
                style={{ animation: 'mailbox-pulse 1.5s ease-in-out 2, mailbox-fade 0.6s ease-out 3s forwards' }}
                onAnimationEnd={(e) => { if (e.animationName === 'mailbox-fade') setHighlightMailbox(false); }}
              />
            </>
          )}
          <ConnectMailboxCard
            connected={mailboxConnected}
            provider={mailboxProvider}
            email={mailboxEmail}
            loading={loading}
            onDisconnect={() => {
              setMailboxConnected(false);
              setMailboxProvider(null);
              setMailboxEmail(null);
            }}
          />
        </div>
      </div>
    </div>
  );
}
