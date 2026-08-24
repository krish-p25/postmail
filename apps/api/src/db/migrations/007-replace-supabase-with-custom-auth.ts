import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Remove supabase_id column
  await queryInterface.removeColumn('users', 'supabase_id');

  // Add password_hash (nullable — Google-only users won't have one)
  await queryInterface.addColumn('users', 'password_hash', {
    type: DataTypes.STRING,
    allowNull: true,
  });

  // Add google_id (nullable — email/password-only users won't have one)
  await queryInterface.addColumn('users', 'google_id', {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  });

  // Make email unique (used as login identifier)
  await queryInterface.addIndex('users', ['email'], { unique: true });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex('users', ['email']);
  await queryInterface.removeColumn('users', 'google_id');
  await queryInterface.removeColumn('users', 'password_hash');
  await queryInterface.addColumn('users', 'supabase_id', {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
  });
}
