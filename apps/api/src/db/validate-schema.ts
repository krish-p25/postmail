import { QueryInterface } from 'sequelize';
import { sequelize } from './sequelize';

/**
 * Expected schema: table name → list of required column names.
 * Keep in sync with models + migrations.
 */
const EXPECTED_SCHEMA: Record<string, string[]> = {
  users: ['id', 'email', 'password_hash', 'google_id', 'display_name', 'gmail_access_token', 'gmail_refresh_token', 'gmail_token_expiry', 'outlook_access_token', 'outlook_refresh_token', 'outlook_token_expiry', 'created_at', 'updated_at'],
  tracked_emails: ['id', 'user_id', 'tracking_token', 'recipient', 'subject', 'status', 'sent_at', 'created_at', 'updated_at'],
  email_opens: ['id', 'tracked_email_id', 'user_id', 'opened_at', 'user_agent', 'ip_address', 'created_at'],
  email_clicks: ['id', 'tracked_email_id', 'user_id', 'url', 'clicked_at', 'user_agent', 'ip_address', 'created_at'],
  user_settings: ['id', 'user_id', 'discord_webhook_url', 'mailbox_connected', 'mailbox_provider', 'mailbox_connected_at', 'created_at', 'updated_at'],
};

/**
 * Validates that all expected tables exist and contain the required columns.
 * Logs results and throws if any table or column is missing.
 */
export async function validateSchema(): Promise<void> {
  const qi: QueryInterface = sequelize.getQueryInterface();
  const errors: string[] = [];

  for (const [table, expectedColumns] of Object.entries(EXPECTED_SCHEMA)) {
    let actualColumns: Record<string, unknown>;
    try {
      actualColumns = await qi.describeTable(table);
    } catch {
      errors.push(`Table "${table}" does not exist`);
      continue;
    }

    const actualColumnNames = Object.keys(actualColumns);
    const missing = expectedColumns.filter((col) => !actualColumnNames.includes(col));

    if (missing.length > 0) {
      errors.push(`Table "${table}" is missing columns: ${missing.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    console.error('[PostMail API] Schema validation failed:');
    errors.forEach((e) => console.error(`  - ${e}`));
    throw new Error(`Schema validation failed: ${errors.length} issue(s) found`);
  }

  console.log(`[PostMail API] Schema validated: ${Object.keys(EXPECTED_SCHEMA).length} tables OK`);
}
