import { Transaction } from 'sequelize';
import { sequelize } from '../db/sequelize';

/**
 * Execute a database operation within an RLS-protected transaction.
 *
 * How it works:
 * 1. Opens a Sequelize transaction
 * 2. Runs SET LOCAL app.current_user_id = '<userId>' within the transaction
 * 3. Executes the provided callback with the transaction
 * 4. Commits (or rolls back on error)
 *
 * SET LOCAL is transaction-scoped: the session variable is automatically
 * cleared when the transaction ends, so there's no risk of leaking
 * user context between requests through the connection pool.
 *
 * Usage in route handlers:
 *   const emails = await withRLS(req.user!.id, async (t) => {
 *     return TrackedEmail.findAll({ transaction: t });
 *   });
 */
export async function withRLS<T>(
  userId: string,
  fn: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  return sequelize.transaction(async (transaction) => {
    // Set the RLS context for this transaction
    await sequelize.query(
      `SELECT set_config('app.current_user_id', $1, true)`,
      {
        bind: [userId],
        transaction,
      },
    );

    return fn(transaction);
  });
}
