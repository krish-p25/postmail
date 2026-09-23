import { useState, FormEvent } from 'react';
import { api, MaskedWebhook } from '../services/api';
import { PasswordInput } from './PasswordInput';
import { discordWebhookProblem } from '../utils/discord-webhook';

interface Props {
  /** The saved webhook as the API returns it — masked, never the real URL. */
  saved: MaskedWebhook | null;
  onSavedChange: (saved: MaskedWebhook | null) => void;
  loading: boolean;
  loadError: string | null;
}

type Status = { type: 'success' | 'error'; text: string } | null;

/**
 * The webhook URL contains a secret token, so once saved it can only be replaced
 * or removed — the API never sends it back, only a masked form.
 */
export default function DiscordWebhookCard({ saved, onSavedChange, loading, loadError }: Props) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [status, setStatus] = useState<Status>(null);

  const showForm = !saved || editing;
  const problem = discordWebhookProblem(input);
  const valid = input.trim() !== '' && problem === null;

  async function update(url: string | null, action: 'save' | 'remove') {
    setBusy(action);
    setStatus(null);
    try {
      const { discordWebhook } = await api.updateSettings({ discordWebhookUrl: url });
      onSavedChange(discordWebhook);
      setEditing(false);
      setInput('');
      setStatus({ type: 'success', text: url ? 'Discord webhook saved.' : 'Discord webhook removed.' });
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save settings.' });
    } finally {
      setBusy(null);
    }
  }

  function handleSave(e: FormEvent) {
    e.preventDefault();
    if (valid && !busy) update(input.trim(), 'save');
  }

  const buttonBase =
    'min-h-[44px] rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
  const primaryButton = `${buttonBase} bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500`;
  const secondaryButton = `${buttonBase} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-primary-500`;

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:p-6">
      <h3 className="text-lg font-medium text-gray-900">Discord Notifications</h3>
      <p className="mt-1 text-sm text-gray-500">Receive a Discord message whenever a tracked email is opened.</p>

      <div className="mt-4 space-y-4">
        {loading ? (
          <div className="h-10 w-full animate-[shimmer_1.5s_infinite] rounded-lg bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]" />
        ) : !showForm ? (
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Webhook URL</p>
            <div
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                saved!.valid ? 'border-gray-200 bg-gray-50' : 'border-red-200 bg-red-50'
              }`}
            >
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-600" title={saved!.masked}>
                {saved!.masked}
              </span>
              {saved!.valid && (
                <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  Active
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {saved!.valid ? (
                'For security the full URL is never shown again. Replace it to use a different webhook.'
              ) : (
                <span className="text-red-500">
                  This saved URL isn't a valid Discord webhook, so notifications are off. Replace it to turn them back on.
                </span>
              )}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setEditing(true); setStatus(null); }} disabled={!!busy} className={primaryButton}>
                Replace
              </button>
              <button type="button" onClick={() => update(null, 'remove')} disabled={!!busy} className={secondaryButton}>
                {busy === 'remove' ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave}>
            <label htmlFor="discordWebhookUrl" className="mb-1 block text-sm font-medium text-gray-700">
              {saved ? 'New webhook URL' : 'Webhook URL'}
            </label>
            {/* Masked while typing too: the URL embeds the webhook's secret token. */}
            <PasswordInput
              id="discordWebhookUrl"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setStatus(null);
              }}
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              data-bwignore
              autoFocus={editing}
              placeholder="https://discord.com/api/webhooks/..."
              aria-invalid={problem !== null}
              aria-describedby="discordWebhookUrl-feedback"
              revealLabel="webhook URL"
              className={`block w-full rounded-lg border px-3 py-2 pr-9 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 ${
                problem
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : valid
                    ? 'border-green-300 focus:border-green-500 focus:ring-green-500'
                    : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500'
              }`}
            />
            <p id="discordWebhookUrl-feedback" aria-live="polite" className="mt-1 text-xs">
              {problem && <span className="text-red-500">{problem}</span>}
              {valid && <span className="text-green-600">Valid Discord webhook URL</span>}
              {!problem && !valid && (
                <span className="text-gray-400">Copy it from Channel settings → Integrations → Webhooks.</span>
              )}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="submit" disabled={!valid || !!busy} className={primaryButton}>
                {busy === 'save' ? 'Saving...' : 'Save'}
              </button>
              {saved && (
                <button
                  type="button"
                  onClick={() => { setEditing(false); setInput(''); setStatus(null); }}
                  disabled={!!busy}
                  className={secondaryButton}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        {(status || loadError) && (
          <div
            className={`rounded-lg p-3 text-sm ${
              status?.type === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
            }`}
          >
            {status?.text ?? loadError}
          </div>
        )}
      </div>
    </div>
  );
}
