# Supabase Setup Guide

This guide walks through creating a Supabase project, retrieving API credentials, and enabling Google OAuth for the PostMail dashboard.

---

## 1. Creating a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up or sign in.
2. From the dashboard, click **New Project**.
3. Fill in the project details:
   - **Name**: Choose a descriptive name (e.g., `postmail-prod` or `postmail-dev`)
   - **Database Password**: Set a strong password and save it somewhere safe
   - **Region**: Select the region closest to your users or infrastructure
4. Click **Create new project** and wait 1–2 minutes for the project to provision.

<!-- Screenshot: Supabase New Project creation form -->

---

## 2. Retrieving API Credentials

Once your project is provisioned, navigate to **Settings → API** in the left sidebar.

<!-- Screenshot: Supabase API Settings page -->

### Project URL

- Under **Project URL**, copy the URL (e.g., `https://xyzabc123.supabase.co`).
- Add it to your `.env` file as:
  ```
  SUPABASE_URL=https://xyzabc123.supabase.co
  ```
- **Used for**: The Supabase project endpoint. The dashboard (React app) uses this to initialize the Supabase client.

### Anon / Public Key

- Under **Project API keys**, copy the **anon / public** key.
- Add it to your `.env` file as:
  ```
  SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  ```
- **Used for**: Public key that is safe to expose in the browser. The dashboard uses this for all auth operations (sign in, sign out, session refresh).

### JWT Secret

- Still on **Settings → API**, scroll down to the **JWT Settings** section.
- Copy the **JWT Secret**.
- Add it to your `.env` file as:
  ```
  SUPABASE_JWT_SECRET=your-jwt-secret-here
  ```
- **Used for**: The API server uses this to verify JWTs issued by Supabase. **Never expose this to the frontend or commit it to version control.**

<!-- Screenshot: Supabase JWT Settings section -->

---

## 3. Enabling Google OAuth

### Step 1: Enable the Google Provider in Supabase

1. In your Supabase dashboard, go to **Authentication → Providers**.
2. Find **Google** in the list and click to expand it.
3. Toggle **Enable Sign in with Google** to on.
4. Leave the page open — you will paste credentials here after completing the next steps.

<!-- Screenshot: Supabase Authentication Providers page with Google expanded -->

### Step 2: Create a Google Cloud OAuth Client

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a new project or select an existing one from the top project dropdown.
3. Navigate to **APIs & Services → Credentials**.
4. Click **+ Create Credentials → OAuth 2.0 Client ID**.
5. Set the **Application type** to **Web application**.
6. Under **Authorized redirect URIs**, add:
   ```
   https://<your-supabase-project-ref>.supabase.co/auth/v1/callback
   ```
   Replace `<your-supabase-project-ref>` with the project reference found in your Supabase project URL (the subdomain portion, e.g., `xyzabc123`).
7. Click **Create**.
8. Copy the **Client ID** and **Client Secret** from the dialog that appears.

<!-- Screenshot: Google Cloud Console OAuth 2.0 Client ID creation form -->

> **Note:** If this is your first time setting up OAuth on this Google Cloud project, you may be prompted to configure the **OAuth consent screen** first. Set the user type to **External**, fill in the required app name and contact email, and add the scopes `openid`, `email`, and `profile`. You do not need any restricted scopes for dashboard login.

### Step 3: Paste Credentials Back into Supabase

1. Return to the Supabase **Authentication → Providers → Google** settings page.
2. Paste the **Client ID** into the **Google Client ID** field.
3. Paste the **Client Secret** into the **Google Client Secret** field.
4. Click **Save**.

<!-- Screenshot: Supabase Google provider settings with credentials filled in -->

---

## 4. Configuring the Local Environment

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in the three Supabase values you retrieved above:
   ```env
   SUPABASE_URL=https://xyzabc123.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_JWT_SECRET=your-jwt-secret-here
   ```
3. The remaining values (Postgres connection string, ports, etc.) have sensible defaults for local development and do not need to be changed unless you are customizing your setup.

---

## 5. Important: Two Separate Auth Flows

This project uses **two completely separate OAuth flows** that must never be conflated:

### Dashboard Login (Supabase Auth)

- Users sign in to the PostMail dashboard using **Google OAuth or email/password**.
- This flow is handled entirely by **Supabase Auth**.
- It requests only basic profile scopes: `openid`, `email`, `profile`.
- After sign-in, Supabase issues a **JWT** that the dashboard sends to the PostMail API server to identify the user.
- This is what the Google OAuth setup in Section 3 above configures.

### Mailbox Access (Custom OAuth — Future)

- Connecting a Gmail or Outlook mailbox for email open tracking will use a **separate, custom OAuth flow**.
- This flow will request **restricted Gmail API scopes** (e.g., `https://www.googleapis.com/auth/gmail.readonly`), which require Google's approval process.
- This integration will be built as a **custom OAuth client**, entirely separate from Supabase.
- Tokens from this flow will be stored and managed independently.

> **These two flows must remain completely separate in the codebase.** The Supabase session is for identifying who is using the dashboard. The mailbox OAuth tokens are for accessing a user's email on their behalf. Mixing them would create security and scope-management problems.

---

## 6. Future: Adding Microsoft / Outlook OAuth (Dashboard Login)

If you want to add **"Sign in with Microsoft"** to the dashboard login (not mailbox access), Supabase supports this natively:

1. In Supabase, go to **Authentication → Providers** and find the **Azure** provider.
2. Enable it and paste in a Microsoft OAuth Client ID and Client Secret obtained from the [Azure portal](https://portal.azure.com).
3. The dashboard code has a commented extension point for adding a Microsoft sign-in button — search for `// TODO: Microsoft sign-in` to find it.

> **Note:** Adding Microsoft mailbox access for tracking (reading Outlook emails) is a separate, future custom OAuth integration — not through Supabase. See Section 5 above.

---

## Troubleshooting

### "Redirect URI mismatch" error during Google sign-in

- The redirect URI registered in Google Cloud Console must exactly match the callback URL Supabase uses.
- Verify that you added `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback` to the **Authorized redirect URIs** list in Google Cloud Console (see Section 3, Step 2).
- Check for trailing slashes or `http` vs `https` mismatches.

### "Invalid JWT" errors from the API server

- This usually means the `SUPABASE_JWT_SECRET` in your `.env` does not match the JWT Secret in your Supabase project settings.
- Go to **Settings → API → JWT Settings** in Supabase, copy the secret again, and update your `.env` file.
- Restart the API server after changing environment variables.

### Google login not working (spinner, no redirect, or error page)

- Confirm that the Google provider is enabled in **Authentication → Providers → Google** in Supabase (the toggle should be on and saved).
- Confirm that the Client ID and Client Secret in Supabase match what is in Google Cloud Console exactly — no extra spaces or line breaks.
- Check that the OAuth consent screen in Google Cloud Console is published (not in testing mode with a restricted user list), or that your account is added as a test user.
- Check the Supabase **Authentication → Logs** page for detailed error messages.
