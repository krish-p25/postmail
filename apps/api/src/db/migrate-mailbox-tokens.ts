import { Op } from 'sequelize';
import { User, LinkedMailbox, UserSetting } from './models';

/**
 * One-time idempotent migration: moves OAuth tokens from User model
 * columns into LinkedMailbox rows. Safe to run multiple times.
 */
export async function migrateMailboxTokens(): Promise<void> {
  const users = await User.findAll({
    where: {
      [Op.or]: [
        { gmailAccessToken: { [Op.ne]: null } },
        { outlookRefreshToken: { [Op.ne]: null } },
      ],
    },
  });

  if (users.length === 0) {
    console.log('[PostMail API] Token migration: no users to migrate');
    return;
  }

  console.log(`[PostMail API] Token migration: migrating ${users.length} user(s)`);

  for (const user of users) {
    // Migrate Gmail tokens
    if (user.gmailAccessToken || user.gmailRefreshToken) {
      let email: string | null = null;
      const settings = await UserSetting.findOne({ where: { userId: user.id } });
      if (settings?.mailboxProvider === 'gmail' && settings.mailboxEmail) {
        email = settings.mailboxEmail;
      }

      if (email) {
        const [mailbox, created] = await LinkedMailbox.findOrCreate({
          where: { userId: user.id, email },
          defaults: {
            userId: user.id,
            provider: 'gmail',
            email,
            accessToken: user.gmailAccessToken,
            refreshToken: user.gmailRefreshToken,
            tokenExpiry: user.gmailTokenExpiry,
          },
        });

        if (!created) {
          await mailbox.update({
            accessToken: user.gmailAccessToken,
            refreshToken: user.gmailRefreshToken,
            tokenExpiry: user.gmailTokenExpiry,
          });
        }

        console.log(`[PostMail API] Token migration: Gmail tokens for user ${user.id} → LinkedMailbox ${mailbox.id} (${created ? 'created' : 'updated'})`);
      } else {
        console.warn(`[PostMail API] Token migration: Gmail tokens exist for user ${user.id} but no email found in settings — skipping`);
      }

      await user.update({
        gmailAccessToken: null,
        gmailRefreshToken: null,
        gmailTokenExpiry: null,
      });
    }

    // Migrate Outlook tokens
    if (user.outlookAccessToken || user.outlookRefreshToken) {
      let email: string | null = null;
      const settings = await UserSetting.findOne({ where: { userId: user.id } });
      if (settings?.mailboxProvider === 'outlook' && settings.mailboxEmail) {
        email = settings.mailboxEmail;
      }

      if (email) {
        const [mailbox, created] = await LinkedMailbox.findOrCreate({
          where: { userId: user.id, email },
          defaults: {
            userId: user.id,
            provider: 'outlook',
            email,
            accessToken: user.outlookAccessToken,
            refreshToken: user.outlookRefreshToken,
            tokenExpiry: user.outlookTokenExpiry,
          },
        });

        if (!created) {
          await mailbox.update({
            accessToken: user.outlookAccessToken,
            refreshToken: user.outlookRefreshToken,
            tokenExpiry: user.outlookTokenExpiry,
          });
        }

        console.log(`[PostMail API] Token migration: Outlook tokens for user ${user.id} → LinkedMailbox ${mailbox.id} (${created ? 'created' : 'updated'})`);
      } else {
        console.warn(`[PostMail API] Token migration: Outlook tokens exist for user ${user.id} but no email found in settings — skipping`);
      }

      await user.update({
        outlookAccessToken: null,
        outlookRefreshToken: null,
        outlookTokenExpiry: null,
      });
    }
  }

  console.log(`[PostMail API] Token migration: complete`);
}
