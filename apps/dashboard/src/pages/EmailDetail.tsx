import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, EmailMessage, EmailAttachment } from '../services/api';

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

/** Strip PostMail tracking pixel <img> tags so the dashboard doesn't trigger false opens */
function stripTrackingPixel(html: string): string {
  // Remove <img> tags whose src contains the /o/ tracking path
  return html.replace(/<img[^>]*\ssrc=["'][^"']*\/o\/[a-f0-9-]+["'][^>]*\/?>/gi, '');
}

function EmailBody({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sanitizedHtml = stripTrackingPixel(html);

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
      const isFullDoc = /<html[\s>]/i.test(sanitizedHtml);
      if (isFullDoc) {
        doc.open();
        doc.write(sanitizedHtml);
        doc.close();
      } else {
        doc.open();
        doc.write(`<!DOCTYPE html><html><head><style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #374151; margin: 0; padding: 0; word-wrap: break-word; }
          a { color: #2563eb; text-decoration: underline; }
          img { max-width: 100%; height: auto; }
          blockquote { margin: 0 0 0 0.5em; padding-left: 0.75em; border-left: 2px solid #d1d5db; }
        </style></head><body>${sanitizedHtml}</body></html>`);
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
  }, [sanitizedHtml, resizeIframe]);

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

function AttachmentButton({ attachment, provider }: { attachment: EmailAttachment; provider: string | null }) {
  function handleClick() {
    const params = new URLSearchParams({
      provider: provider || 'gmail',
      messageId: attachment.messageId,
      attachmentId: attachment.attachmentId,
      filename: attachment.filename,
      mime: attachment.mimeType || 'application/octet-stream',
      size: String(attachment.size),
    });
    window.open(`/preview?${params.toString()}`, '_blank');
  }

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100"
    >
      <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
      </svg>
      <span className="max-w-[200px] truncate">{attachment.filename}</span>
      <span className="shrink-0 text-xs text-gray-400">{formatFileSize(attachment.size)}</span>
    </button>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface TrackingOpen {
  id: string;
  opened_at: string;
  user_agent: string | null;
  ip_address: string | null;
  dismissed: boolean;
}

interface TrackingData {
  status: string;
  opens: TrackingOpen[];
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown';
  if (ua.includes('Thunderbird')) return 'Thunderbird';
  if (ua.includes('Outlook')) return 'Outlook';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'Apple Mail (iOS)';
  if (ua.includes('Macintosh') && ua.includes('AppleWebKit')) return 'Apple Mail (macOS)';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Googlebot')) return 'Gmail (image proxy)';
  return 'Email client';
}

function isGmailProxy(ua: string | null): boolean {
  if (!ua) return false;
  return ua.includes('GoogleImageProxy') || ua.includes('Googlebot');
}

function OpensTimeline({ tracking, onDismiss }: { tracking: TrackingData; onDismiss: (openId: string) => void }) {
  const sorted = [...tracking.opens].sort(
    (a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime(),
  );
  const activeOpens = sorted.filter((o) => !o.dismissed && !isGmailProxy(o.user_agent));
  const dismissedOrProxy = sorted.filter((o) => o.dismissed || isGmailProxy(o.user_agent));
  const [showDismissed, setShowDismissed] = useState(false);

  if (tracking.opens.length === 0) {
    return (
      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Opens</h3>
        <p className="mt-2 text-sm text-gray-500">No opens recorded yet.</p>
      </div>
    );
  }

  function renderOpen(open: TrackingOpen, idx: number, list: TrackingOpen[], isDimmed: boolean) {
    const proxy = isGmailProxy(open.user_agent);
    return (
      <div key={open.id} className={`flex items-start gap-3 ${isDimmed ? 'opacity-50' : ''}`}>
        <div className="relative flex flex-col items-center">
          <div className={`flex h-6 w-6 items-center justify-center rounded-full ${
            proxy ? 'bg-gray-100' : isDimmed ? 'bg-gray-100' : 'bg-blue-100'
          }`}>
            <svg className={`h-3.5 w-3.5 ${
              proxy ? 'text-gray-400' : isDimmed ? 'text-gray-400' : 'text-blue-600'
            }`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </div>
          {idx < list.length - 1 && (
            <div className="mt-1 h-full w-px bg-gray-200" />
          )}
        </div>
        <div className="min-w-0 flex-1 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900">
                  {formatDate(open.opened_at)}
                </p>
                {proxy && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                    Gmail proxy
                  </span>
                )}
                {open.dismissed && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                    Dismissed
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-gray-500" title={open.user_agent || undefined}>
                {parseUserAgent(open.user_agent)}
                {open.ip_address && ` · ${open.ip_address}`}
              </p>
            </div>
            {!open.dismissed && !proxy && (
              <button
                onClick={() => onDismiss(open.id)}
                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <h3 className="text-sm font-semibold text-gray-900">
        Opens ({activeOpens.length})
      </h3>
      {activeOpens.length === 0 && (
        <p className="mt-2 text-sm text-gray-500">No opens recorded yet (some were filtered).</p>
      )}
      {activeOpens.length > 0 && (
        <div className="mt-4 space-y-3">
          {activeOpens.map((open, idx) => renderOpen(open, idx, activeOpens, false))}
        </div>
      )}
      {dismissedOrProxy.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <button
            onClick={() => setShowDismissed(!showDismissed)}
            className="flex items-center gap-1 text-xs font-medium text-gray-400 transition hover:text-gray-600"
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform ${showDismissed ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
            {dismissedOrProxy.length} filtered {dismissedOrProxy.length === 1 ? 'open' : 'opens'}
          </button>
          {showDismissed && (
            <div className="mt-3 space-y-3">
              {dismissedOrProxy.map((open, idx) => renderOpen(open, idx, dismissedOrProxy, true))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EmailDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [pendingTrackedEmails, setPendingTrackedEmails] = useState<Array<{
    id: string;
    subject: string | null;
    recipient: string | null;
    status: string;
    opens: TrackingOpen[];
  }> | null>(null);

  const detailFetched = useRef(false);
  useEffect(() => {
    if (!id) return;
    if (detailFetched.current) return;
    detailFetched.current = true;

    api
      .getSettings()
      .then((settings) => {
        setProvider(settings.mailboxProvider || 'gmail');
        const fetchDetail =
          settings.mailboxProvider === 'outlook'
            ? api.getOutlookEmailDetail(id)
            : api.getGmailEmailDetail(id);
        return fetchDetail;
      })
      .then((data) => setMessages(data.messages))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load email'))
      .finally(() => setLoading(false));

    // Try to load tracking data (may not exist for this email)
    api.getTrackedEmails().then((data) => {
      // Match by subject since the route :id is a Gmail/Outlook ID, not the DB UUID
      const match = data.emails.find((te) => {
        if (te.id === id) return true;
        return false;
      });
      if (match) {
        setTracking({ status: match.status, opens: match.opens });
      } else {
        // Defer subject-based matching until messages are loaded
        setTracking(null);
        setPendingTrackedEmails(data.emails);
      }
    }).catch(() => {
      // Silently fail — tracking data is supplementary
    });
  }, [id]);

  // Once messages are loaded, try subject-based match for tracking data
  useEffect(() => {
    if (!pendingTrackedEmails || messages.length === 0 || tracking) return;
    const emailSubject = messages[0].subject.toLowerCase();
    const match = pendingTrackedEmails.find(
      (te) => te.subject && te.subject.toLowerCase() === emailSubject,
    );
    if (match) {
      setTracking({ status: match.status, opens: match.opens });
    }
    setPendingTrackedEmails(null);
  }, [messages, pendingTrackedEmails, tracking]);

  const subject = messages.length > 0 ? messages[0].subject : '';

  function handleDismissOpen(openId: string) {
    api.dismissOpen(openId).then(() => {
      setTracking((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          opens: prev.opens.map((o) => (o.id === openId ? { ...o, dismissed: true } : o)),
        };
      });
    }).catch((err) => {
      console.error('Failed to dismiss open:', err);
    });
  }

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

          {tracking && (
            <div className="mb-6">
              <OpensTimeline tracking={tracking} onDismiss={handleDismissOpen} />
            </div>
          )}

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

                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="border-t border-gray-100 px-4 py-3 sm:px-5 sm:py-4">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                        Attachments ({msg.attachments.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {msg.attachments.map((att) => (
                          <AttachmentButton key={att.attachmentId} attachment={att} provider={provider} />
                        ))}
                      </div>
                    </div>
                  )}
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
