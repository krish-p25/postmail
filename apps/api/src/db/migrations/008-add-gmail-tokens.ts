import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('users', 'gmail_access_token', {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await queryInterface.addColumn('users', 'gmail_refresh_token', {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await queryInterface.addColumn('users', 'gmail_token_expiry', {
    type: DataTypes.DATE,
    allowNull: true,
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('users', 'gmail_token_expiry');
  await queryInterface.removeColumn('users', 'gmail_refresh_token');
  await queryInterface.removeColumn('users', 'gmail_access_token');
}
