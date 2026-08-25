import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, EmailMessage } from '../services/api';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function EmailBody({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const resizeIframe = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;
    iframe.style.height = iframe.contentDocument.body.scrollHeight + 'px';
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;

      // Check if the HTML is a full document or a fragment
      const isFullDoc = /<html[\s>]/i.test(html);
      if (isFullDoc) {
        doc.open();
        doc.write(html);
        doc.close();
      } else {
        doc.open();
        doc.write(`<!DOCTYPE html><html><head><style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #374151; margin: 0; padding: 0; word-wrap: break-word; }
          a { color: #2563eb; text-decoration: underline; }
          img { max-width: 100%; height: auto; }
          blockquote { margin: 0 0 0 0.5em; padding-left: 0.75em; border-left: 2px solid #d1d5db; }
        </style></head><body>${html}</body></html>`);
        doc.close();
      }

      // Make links open in new tab
      doc.querySelectorAll('a').forEach((a) => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      });

      resizeIframe();

      // Observe for lazy-loaded images
      const observer = new MutationObserver(resizeIframe);
      observer.observe(doc.body, { childList: true, subtree: true, attributes: true });
      doc.querySelectorAll('img').forEach((img) => {
        img.addEventListener('load', resizeIframe);
      });

      return () => observer.disconnect();
    };

    iframe.addEventListener('load', handleLoad);
    // Trigger immediately in case already loaded
    handleLoad();

    return () => iframe.removeEventListener('load', handleLoad);
  }, [html, resizeIframe]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      title="Email content"
      className="w-full border-0"
      style={{ minHeight: '60px' }}
    />
  );
}

function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: raw.trim(), email: raw.trim() };
}

export default function EmailDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    api
      .getSettings()
      .then((settings) => {
        const fetchDetail =
          settings.mailboxProvider === 'outlook'
            ? api.getOutlookEmailDetail(id)
            : api.getGmailEmailDetail(id);
        return fetchDetail;
      })
      .then((data) => setMessages(data.messages))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load email'))
      .finally(() => setLoading(false));
  }, [id]);

  const subject = messages.length > 0 ? messages[0].subject : '';

  return (
    <div>
      <button
        onClick={() => navigate('/dashboard/emails')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 transition hover:text-gray-900"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Back to Emails
      </button>

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

      {!loading && !error && messages.length > 0 && (
        <div>
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{subject}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {messages.length} {messages.length === 1 ? 'message' : 'messages'} in thread
            </p>
          </div>

          <div className="space-y-4">
            {messages.map((msg, index) => {
              const sender = parseEmailAddress(msg.from);
              return (
                <div
                  key={msg.id}
                  className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200"
                >
                  <div className="border-b border-gray-100 bg-gray-50/50 px-4 py-3 sm:px-5 sm:py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
                            {sender.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">{sender.name}</p>
                            {sender.name !== sender.email && (
                              <p className="truncate text-xs text-gray-500">{sender.email}</p>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 space-y-1 text-xs text-gray-500">
                          <div className="flex gap-1.5">
                            <span className="shrink-0 font-medium text-gray-600">To:</span>
                            <span className="break-all">{msg.to}</span>
                          </div>
                          {msg.cc && (
                            <div className="flex gap-1.5">
                              <span className="shrink-0 font-medium text-gray-600">Cc:</span>
                              <span className="break-all">{msg.cc}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-xs text-gray-500">{formatDate(msg.date)}</p>
                        <span className="mt-1 inline-block text-xs text-gray-400">
                          #{index + 1}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 py-3 sm:px-5 sm:py-4">
                    {msg.body ? (
                      <EmailBody html={msg.body} />
                    ) : (
                      <p className="text-sm italic text-gray-400">
                        {msg.snippet || 'No content available'}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && !error && messages.length === 0 && (
        <div className="mt-12 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16">
          <h3 className="text-lg font-medium text-gray-900">Email not found</h3>
          <p className="mt-1 text-sm text-gray-500">
            This email could not be loaded.
          </p>
        </div>
      )}
    </div>
  );
}
