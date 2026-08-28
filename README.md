# PostMail

Email open tracking for Gmail and Outlook. Know when your emails are read.

PostMail is a self-hosted SaaS application with three components: a **Chrome extension** that injects invisible tracking pixels into your compose window, an **API server** that records open events when pixels are loaded, and a **dashboard** where you view tracking activity for your sent emails.

## How it works

1. You compose an email in Gmail
2. The Chrome extension injects a 1x1 tracking pixel into the email body
3. You send the email
4. When the recipient opens the email, their email client loads the pixel image from the PostMail API
5. The API records the open event (timestamp, IP address, user agent)
6. You see the open on the dashboard with details about when and where it was read

## Architecture

```
postmail/
├── apps/
│   ├── api/          # Express API server (port 3005)
│   ├── dashboard/    # React dashboard (port 3006)
│   └── extension/    # Chrome extension (Manifest v3)
├── packages/
│   └── shared/       # Shared types and constants
└── docker-compose.yml
```

| Component | Stack |
|-----------|-------|
| API | Express, Sequelize, PostgreSQL, JWT |
| Dashboard | React 18, Vite, Tailwind CSS, React Router |
| Extension | Chrome Manifest v3, Webpack, TypeScript |
| Database | PostgreSQL 16 |

## Prerequisites

- Node.js 18+
- PostgreSQL 16 (or Docker)
- Google Cloud project with OAuth credentials
- Chrome browser

## Setup

### 1. Clone and install

```bash
git clone https://github.com/krish-p25/postmail.git
cd postmail
npm install
```

### 2. Start PostgreSQL

Using Docker:

```bash
docker compose up postgres -d
```

Or point `DATABASE_URL` at an existing PostgreSQL instance.

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Required
JWT_SECRET=<random-64-char-string>
DATABASE_URL=postgres://postmail:postmail_dev@localhost:5432/postmail

# Google OAuth (user login)
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_REDIRECT_URI=http://localhost:3006/oauth/callback
VITE_GOOGLE_CLIENT_ID=<same-google-client-id>

# Gmail mailbox access (separate OAuth app with gmail.readonly scope)
GMAIL_CLIENT_ID=<your-gmail-oauth-client-id>
GMAIL_CLIENT_SECRET=<your-gmail-oauth-client-secret>
GMAIL_REDIRECT_URI=http://localhost:3006/gmail/callback

# Outlook (optional)
MICROSOFT_CLIENT_ID=<your-microsoft-client-id>
MICROSOFT_CLIENT_SECRET=<your-microsoft-client-secret>
MICROSOFT_REDIRECT_URI=http://localhost:3006/outlook/callback
```

You need **two Google OAuth apps**:
- **Login app** — for user authentication (Google sign-in)
- **Gmail app** — for reading sent emails (`gmail.readonly` scope, `access_type: offline`, `prompt: consent`)

### 4. Start the API and dashboard

```bash
# Terminal 1 — API server
npm run -w apps/api dev

# Terminal 2 — Dashboard
npm run -w apps/dashboard dev
```

The API runs on `http://localhost:3005` and the dashboard on `http://localhost:3006`.

On first start, the API automatically runs database migrations and validates the schema.

### 5. Build and load the Chrome extension

```bash
npm run build:extension
```

Then in Chrome:
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select `apps/extension/dist`

### 6. Complete setup

1. Open the dashboard at `http://localhost:3006`
2. Sign in with Google
3. Go to **Settings** and connect your Gmail mailbox
4. Open Gmail — you should see a PostMail toast confirming the extension is active
5. Compose and send an email — the extension will inject a tracking pixel and show tracking status

## Running with Docker Compose

To run everything in containers:

```bash
docker compose up
```

This starts PostgreSQL, the API, and the dashboard with hot-reloading enabled.

## API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/o/:token` | No | Tracking pixel — records open event |
| `GET` | `/health` | No | Health check |
| `POST` | `/api/auth/google` | No | Google OAuth login |
| `GET` | `/api/me` | Yes | Current user profile |
| `GET` | `/api/emails` | Yes | List tracked emails with opens |
| `GET` | `/api/emails/:id` | Yes | Single tracked email detail |
| `POST` | `/api/emails/opens/:id/dismiss` | Yes | Dismiss an open event |
| `GET` | `/api/settings` | Yes | User settings |
| `PUT` | `/api/settings` | Yes | Update settings |
| `GET` | `/api/gmail/connect` | Yes | Gmail OAuth consent URL |
| `POST` | `/api/gmail/callback` | Yes | Exchange Gmail auth code |
| `GET` | `/api/gmail/emails` | Yes | Fetch sent emails from Gmail |
| `POST` | `/api/track/register` | Yes | Register email for tracking |
| `POST` | `/api/track/verify-sent` | Yes | Verify email was sent via Gmail |
| `GET` | `/api/track/preflight` | Yes | Auth preflight check |

## Open tracking details

- **Deduplication**: Opens from the same IP + user agent within 60 seconds are ignored
- **Gmail proxy filtering**: Opens from Google's image proxy (`GoogleImageProxy`) are auto-filtered in the dashboard
- **Self-open prevention**: The dashboard strips tracking pixels from email previews to avoid triggering false opens
- **Dismiss**: Users can manually dismiss their own opens via the dashboard

## Project scripts

```bash
# Development
npm run -w apps/api dev          # Start API with hot reload
npm run -w apps/dashboard dev    # Start dashboard with Vite
npm run -w apps/extension watch  # Watch & rebuild extension

# Build
npm run build                    # Build shared + extension
npm run -w apps/api build        # Build API
npm run -w apps/dashboard build  # Build dashboard for production

# Test
npm run test:extension           # Run extension tests

# Type checking
npm run -w apps/api typecheck
npm run -w apps/dashboard typecheck
npm run -w apps/extension typecheck

# Format
npm run format                   # Prettier format all files
npm run lint                     # Prettier check
```

## License

ISC
