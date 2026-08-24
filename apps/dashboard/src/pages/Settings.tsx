import { useState, useEffect, FormEvent } from 'react';
import { api } from '../services/api';
import ConnectMailboxCard from '../components/ConnectMailboxCard';

export default function Settings() {
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then((data) => {
        setDiscordWebhookUrl(data.discordWebhookUrl ?? '');
      })
      .catch(() => {
        setMessage({ type: 'error', text: 'Failed to load settings.' });
      })
      .finally(() => setLoading(false));
  }, []);

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
        <ConnectMailboxCard />
      </div>
    </div>
  );
}
