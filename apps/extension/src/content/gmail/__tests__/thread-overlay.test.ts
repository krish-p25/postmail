import { createThreadOverlay, isOverlayCurrent } from '../thread-overlay';
import type { TrackedEmailSummary } from '../../shared/inbox-badge';

function summary(opens: TrackedEmailSummary['opens']): TrackedEmailSummary {
  return {
    id: 'email-1',
    subject: 'Hello',
    recipient: 'bob@example.com',
    status: 'sent',
    openCount: opens.length,
    sentAt: '2026-09-16T20:00:00.000Z',
    trackingToken: 'token',
    messageId: null,
    threadId: null,
    conversationId: null,
    opens,
  };
}

it('shows a Likely You tag only on self-view opens', () => {
  const overlay = createThreadOverlay(
    summary([
      { opened_at: '2026-09-16T21:00:00.000Z', ip_address: '81.102.41.64', user_agent: null, likely_self: true },
      { opened_at: '2026-09-16T22:00:00.000Z', ip_address: '1.2.3.4', user_agent: null, likely_self: false },
    ]),
  );
  const rows = overlay.querySelectorAll('.postmail-overlay-open-row');
  expect(rows).toHaveLength(2);
  expect(rows[0].querySelector('.postmail-likely-you')?.textContent).toBe('Likely You');
  expect(rows[1].querySelector('.postmail-likely-you')).toBeNull();
});

it('renders open data as text, never as HTML', () => {
  const overlay = createThreadOverlay(
    summary([{ opened_at: '2026-09-16T21:00:00.000Z', ip_address: '<img src=x onerror=alert(1)>', user_agent: null, likely_self: false }]),
  );
  expect(overlay.querySelector('img')).toBeNull();
  expect(overlay.textContent).toContain('<img src=x onerror=alert(1)>');
});

it('is stale when a label changes even if the open count does not', () => {
  const before = summary([{ opened_at: '2026-09-16T21:00:00.000Z', ip_address: null, user_agent: null, likely_self: false }]);
  const overlay = createThreadOverlay(before);
  const after = summary([{ opened_at: '2026-09-16T21:00:00.000Z', ip_address: null, user_agent: null, likely_self: true }]);
  expect(isOverlayCurrent(overlay, before)).toBe(true);
  expect(isOverlayCurrent(overlay, after)).toBe(false);
});
