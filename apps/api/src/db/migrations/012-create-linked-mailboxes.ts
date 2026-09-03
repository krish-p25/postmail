import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. Create linked_mailboxes table
  await queryInterface.createTable('linked_mailboxes', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    access_token: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    refresh_token: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    token_expiry: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  });

  // 2. Unique constraint on (user_id, provider, email)
  await queryInterface.addConstraint('linked_mailboxes', {
    fields: ['user_id', 'provider', 'email'],
    type: 'unique',
    name: 'linked_mailboxes_user_provider_email',
  });

  // 3. Migrate existing Gmail tokens
  await queryInterface.sequelize.query(`
    INSERT INTO linked_mailboxes (id, user_id, provider, email, access_token, refresh_token, token_expiry, created_at, updated_at)
    SELECT gen_random_uuid(), u.id, 'gmail',
           COALESCE(us.mailbox_email, u.email),
           u.gmail_access_token, u.gmail_refresh_token, u.gmail_token_expiry,
           COALESCE(us.mailbox_connected_at, NOW()), NOW()
    FROM users u
    LEFT JOIN user_settings us ON us.user_id = u.id AND us.mailbox_provider = 'gmail'
    WHERE u.gmail_refresh_token IS NOT NULL
  `);

  // 4. Migrate existing Outlook tokens
  await queryInterface.sequelize.query(`
    INSERT INTO linked_mailboxes (id, user_id, provider, email, access_token, refresh_token, token_expiry, created_at, updated_at)
    SELECT gen_random_uuid(), u.id, 'outlook',
           COALESCE(us.mailbox_email, u.email),
           u.outlook_access_token, u.outlook_refresh_token, u.outlook_token_expiry,
           COALESCE(us.mailbox_connected_at, NOW()), NOW()
    FROM users u
    LEFT JOIN user_settings us ON us.user_id = u.id AND us.mailbox_provider = 'outlook'
    WHERE u.outlook_refresh_token IS NOT NULL
  `);

  // 5. Drop token columns from users
  await queryInterface.removeColumn('users', 'gmail_access_token');
  await queryInterface.removeColumn('users', 'gmail_refresh_token');
  await queryInterface.removeColumn('users', 'gmail_token_expiry');
  await queryInterface.removeColumn('users', 'outlook_access_token');
  await queryInterface.removeColumn('users', 'outlook_refresh_token');
  await queryInterface.removeColumn('users', 'outlook_token_expiry');

  // 6. Drop mailbox columns from user_settings
  await queryInterface.removeColumn('user_settings', 'mailbox_connected');
  await queryInterface.removeColumn('user_settings', 'mailbox_provider');
  await queryInterface.removeColumn('user_settings', 'mailbox_email');
  await queryInterface.removeColumn('user_settings', 'mailbox_connected_at');
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // Re-add mailbox columns to user_settings
  await queryInterface.addColumn('user_settings', 'mailbox_connected', {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  });
  await queryInterface.addColumn('user_settings', 'mailbox_provider', {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await queryInterface.addColumn('user_settings', 'mailbox_email', {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await queryInterface.addColumn('user_settings', 'mailbox_connected_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });

  // Re-add token columns to users
  await queryInterface.addColumn('users', 'gmail_access_token', { type: DataTypes.TEXT, allowNull: true });
  await queryInterface.addColumn('users', 'gmail_refresh_token', { type: DataTypes.TEXT, allowNull: true });
  await queryInterface.addColumn('users', 'gmail_token_expiry', { type: DataTypes.DATE, allowNull: true });
  await queryInterface.addColumn('users', 'outlook_access_token', { type: DataTypes.TEXT, allowNull: true });
  await queryInterface.addColumn('users', 'outlook_refresh_token', { type: DataTypes.TEXT, allowNull: true });
  await queryInterface.addColumn('users', 'outlook_token_expiry', { type: DataTypes.DATE, allowNull: true });

  // Migrate data back (best effort)
  await queryInterface.sequelize.query(`
    UPDATE users SET
      gmail_access_token = lm.access_token,
      gmail_refresh_token = lm.refresh_token,
      gmail_token_expiry = lm.token_expiry
    FROM linked_mailboxes lm
    WHERE users.id = lm.user_id AND lm.provider = 'gmail'
  `);

  await queryInterface.sequelize.query(`
    UPDATE users SET
      outlook_access_token = lm.access_token,
      outlook_refresh_token = lm.refresh_token,
      outlook_token_expiry = lm.token_expiry
    FROM linked_mailboxes lm
    WHERE users.id = lm.user_id AND lm.provider = 'outlook'
  `);

  // Drop linked_mailboxes table
  await queryInterface.dropTable('linked_mailboxes');
}
