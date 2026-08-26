# Tracking Pixel Infrastructure — Implementation Plan

## Overview

Wire up the full email open tracking pipeline: the Chrome extension registers tracked emails with the API on pixel injection, the API serves a pixel endpoint that records opens, a notification layer dispatches alerts (starting with Discord), and the dashboard merges tracking data into the existing email list with filters and status indicators.

## What already exists

- **Extension**: `ComposeManager` → `ComposeTracker` → `PixelInjector` pipeline. Detects compose windows, watches recipients via `MutationObserver`, generates UUID tokens, injects hidden 1x1 `<img>` into compose body. State machine: `WAITING_FOR_RECIPIENT → TRACKING_INITIALIZED → PIXEL_INJECTED → CLEANED_UP`.
- **Shared types**: `TrackingInfo`, `ComposeTrackingState`, `MessageRegistration`, `MessageStatus` (pending/sent/discarded/failed), `TrackingEvent`, `buildTrackingUrl()`.
- **API models**: `TrackedEmail` (token, recipient, subject, status, sentAt), `EmailOpen` (trackedEmailId, userAgent, ipAddress, openedAt), `EmailClick` (future). Migrations 002–004 create these tables.
- **API routes**: `GET /api/emails` and `GET /api/emails/:id` return tracked emails with opens (RLS-protected).
- **Constants**: `TRACKING_PIXEL_BASE_URL = http://localhost:3001`, `TRACKING_PIXEL_PATH = /o`.

## What needs to be built

### Phase 1: API — Pixel endpoint & registration

**1.1 Update tracking pixel base URL**

The pixel URL currently points to `localhost:3001` but the API runs on port `3005`. Update the shared constant and config.

- **Modify** `packages/shared/src/constants/index.ts` — change `TRACKING_PIXEL_BASE_URL` to `http://localhost:3005`
- **Modify** `apps/api/src/config/env.ts` — add `trackingBaseUrl` reading from `TRACKING_BASE_URL` env var, defaulting to `http://localhost:3005`

**1.2 Pixel serving endpoint**

- **Create** `apps/api/src/routes/pixel.ts`
- `GET /o/:token` — **no auth required** (email clients fetch this)
  - Look up `TrackedEmail` by `trackingToken`
  - If not found → 204 (don't leak info)
  - If found → create `EmailOpen` record with `userAgent` (from `req.headers['user-agent']`), `ipAddress` (from `req.ip`), `openedAt` (now)
  - Trigger notification (async, don't block response)
  - Return 204 No Content with `Cache-Control: no-store, no-cache` and `Pragma: no-cache` headers to prevent caching

- **Modify** `apps/api/src/index.ts`
  - Mount pixel route at `/o` **before** CORS/auth middleware (email clients won't send CORS headers)
  - Must be above `helmet()` or configure helmet to allow this route without restrictive headers

**1.3 Email registration endpoint**

- **Create** `apps/api/src/routes/track.ts`
- `POST /api/track/register` — **auth required** (extension sends JWT)
  - Body: `{ trackingToken, recipients, subject }`
  - Creates `TrackedEmail` with `status: 'pending'`, `userId` from JWT
  - If multiple recipients, create one `TrackedEmail` per recipient (same token — or separate tokens? Since the extension generates one token per compose, use one `TrackedEmail` with a comma-joined recipients field, or the first recipient. The compose tracker already stores recipients as an array. Store as comma-separated for simplicity.)
  - Returns `{ id, trackingToken, status }`

- `POST /api/track/confirm-sent` — **auth required**
  - Body: `{ trackingToken }`
  - Updates `TrackedEmail` status from `pending` → `sent`, sets `sentAt` to now
  - Returns `{ success: true }`

- `POST /api/track/discard` — **auth required**
  - Body: `{ trackingToken }`
  - Updates `TrackedEmail` status from `pending` → `discarded`
  - Returns `{ success: true }`

- **Modify** `apps/api/src/index.ts` — mount at `/api/track` behind `authMiddleware`

**1.4 Notification layer**

- **Create** `apps/api/src/services/notifications.ts`
  - `notifyEmailOpened(trackedEmail: TrackedEmail, open: EmailOpen): Promise<void>`
  - Loads `UserSetting` for `trackedEmail.userId`
  - Iterates over enabled notification channels:
    - **Discord**: If `discordWebhookUrl` is set, POST an embed to it with subject, recipient, open time, user agent
  - Each channel handler is a separate function, easy to add new ones
  - All errors are caught and logged (never fail the pixel response)

### Phase 2: Extension — Registration & send verification

**2.1 Extension API client**

- **Create** `apps/extension/src/shared/api.ts`
  - Needs the user's JWT token. The extension can read it from the dashboard's localStorage (since the dashboard-marker content script runs on the dashboard origin). Alternatively, have the user log in via the extension popup.
  - For simplicity: store the JWT in `chrome.storage.local` when the user logs in on the dashboard. The dashboard-marker script can be extended to pass the token to the extension.
  - `registerTrackedEmail(token, data)` → POST `/api/track/register`
  - `confirmEmailSent(token)` → POST `/api/track/confirm-sent`
  - `discardTrackedEmail(token)` → POST `/api/track/discard`

**2.2 Dashboard token sharing**

- **Modify** `apps/extension/src/content/dashboard-marker.ts` (or create if it's just setting an attribute)
  - In addition to marking the page, read the JWT from localStorage and store it in `chrome.storage.local`
  - This runs on the dashboard origin so it has access to localStorage

- **Modify** `apps/extension/src/shared/storage.ts`
  - Add `getApiToken()` / `setApiToken(token)` functions

**2.3 Wire registration into compose lifecycle**

- **Modify** `apps/extension/src/content/tracking/compose-tracker.ts`
  - After pixel injection succeeds → call `registerTrackedEmail()` with token, recipients, subject (read from compose DOM)
  - Add a method `getSubject()` that reads the subject input value

- **Modify** `apps/extension/src/content/gmail/compose-manager.ts`
  - On `handleComposeRemoved` → check if pixel was injected
    - If yes → trigger send verification flow
    - The verification: call the Gmail API (via background worker) to search for the tracking token in recent sent emails
    - If found in sent → call `confirmEmailSent(token)`
    - If not found (draft/discarded) → wait and retry once, then call `discardTrackedEmail(token)` or leave as pending

**2.4 Send verification via Gmail API**

- **Modify** `apps/extension/src/background/service-worker.ts`
  - Add message type `VERIFY_EMAIL_SENT` with `{ trackingToken, recipients, subject }`
  - Handler: calls the PostMail API endpoint that checks Gmail for the sent email
  - The API already has Gmail OAuth tokens for the user — so the extension can call an API endpoint to verify

- **Create** `apps/api/src/routes/track.ts` (add to existing)
  - `POST /api/track/verify-sent` — **auth required**
  - Uses the user's stored Gmail OAuth tokens to search sent emails for the tracking pixel URL
  - Searches `in:sent` for messages containing the tracking token in the body
  - If found → update status to `sent`, set `sentAt`
  - If not found → return `{ found: false }` (let the extension decide whether to retry or discard)

### Phase 3: Dashboard — Merged email list with tracking data

**3.1 Update email list API to merge tracking data**

- **Modify** `apps/api/src/routes/gmail.ts` (and `outlook.ts`)
  - After fetching sent emails from Gmail/Outlook, look up `TrackedEmail` records for the authenticated user
  - Match by comparing tracking tokens in email bodies (or by recipient + subject + time window)
  - Return `tracked: true/false`, `openCount`, `status` (pending/sent) for each email
  - Actually — simpler approach: the `/api/emails` route already returns tracked emails. The dashboard can fetch both lists and merge client-side.

**3.2 Dashboard merge and filter**

- **Modify** `apps/dashboard/src/pages/Emails.tsx`
  - Fetch tracked emails from `/api/emails` alongside Gmail/Outlook sent emails
  - Match tracked emails to sent emails by tracking token in email body (or by a stored `gmailMessageId` field)
  - For emails with a match: show open count, tracked status badge
  - For unmatched sent emails: show "Untracked" badge (as now)
  - For pending tracked emails (not yet in sent): show "Draft — Pending" badge in yellow

- **Add filter bar** below the title:
  - Options: "All", "Tracked", "Untracked"
  - Filter is additive with search
  - Store filter in URL params (`?filter=tracked`)

**3.3 Status badges**

- **"Tracked"** (green) — `bg-green-100 text-green-600` — email is sent and has a tracking pixel
- **"Opened"** (blue) with count — `bg-blue-100 text-blue-600` — "Opened 3x"
- **"Draft"** (yellow) — `bg-yellow-100 text-yellow-600` — pixel injected but email not yet confirmed sent
- **"Untracked"** (red, existing) — no tracking pixel

**3.4 Open details on email detail page**

- **Modify** `apps/dashboard/src/pages/EmailDetail.tsx`
  - If the email is tracked, show an "Opens" section with a timeline of open events
  - Each event shows: timestamp, user agent (parsed to browser/OS), IP address

### Phase 4: Extension permissions and manifest

**4.1 Manifest updates**

- **Modify** `apps/extension/manifest.json`
  - Add host permission for the API: `http://localhost:3005/*`
  - Add `activeTab` permission if needed for reading compose subject

**4.2 Extension messaging updates**

- **Modify** `apps/extension/src/shared/messaging.ts`
  - Add message types: `REGISTER_TRACKED_EMAIL`, `VERIFY_EMAIL_SENT`, `DISCARD_TRACKED_EMAIL`

---

## File summary

| Action | File | Purpose |
|--------|------|---------|
| Create | `apps/api/src/routes/pixel.ts` | Pixel serving endpoint (GET /o/:token → 204) |
| Create | `apps/api/src/routes/track.ts` | Registration, confirmation, discard, verify endpoints |
| Create | `apps/api/src/services/notifications.ts` | Notification dispatch layer (Discord first) |
| Create | `apps/extension/src/shared/api.ts` | Extension API client for registration/confirmation |
| Modify | `packages/shared/src/constants/index.ts` | Update pixel base URL to port 3005 |
| Modify | `apps/api/src/config/env.ts` | Add trackingBaseUrl config |
| Modify | `apps/api/src/index.ts` | Mount pixel route (unauthenticated) and track routes |
| Modify | `apps/extension/src/content/tracking/compose-tracker.ts` | Register on pixel injection, read subject |
| Modify | `apps/extension/src/content/gmail/compose-manager.ts` | Trigger send verification on compose removal |
| Modify | `apps/extension/src/background/service-worker.ts` | Handle verification messages |
| Modify | `apps/extension/src/shared/messaging.ts` | Add new message types |
| Modify | `apps/extension/src/shared/storage.ts` | Add API token storage |
| Modify | `apps/extension/manifest.json` | Add API host permission |
| Modify | `apps/dashboard/src/pages/Emails.tsx` | Merge tracking data, add filter bar, status badges |
| Modify | `apps/dashboard/src/pages/EmailDetail.tsx` | Show open events timeline |
| Modify | `apps/dashboard/src/services/api.ts` | Add tracking API methods |

## Implementation order

1. **Phase 1** (API): Pixel endpoint → registration endpoints → notification layer
2. **Phase 4** (Extension manifest/messaging): Update permissions and message types first
3. **Phase 2** (Extension): API client → token sharing → compose lifecycle wiring → send verification
4. **Phase 3** (Dashboard): Merge tracking data → filters → status badges → open details

## Testing

1. Start API — verify `GET /o/nonexistent-token` returns 204
2. Register a tracked email via API: `POST /api/track/register`
3. Hit `GET /o/{token}` — verify `EmailOpen` record created in DB
4. If Discord webhook configured — verify notification fires
5. Load extension in Chrome — compose email in Gmail — verify pixel injected and registration API called
6. Send the email — verify compose removal triggers verification — status updates to `sent`
7. Open the sent email in another client — verify open recorded and visible on dashboard
8. Dashboard: verify tracked/untracked badges, filter options, open count display
