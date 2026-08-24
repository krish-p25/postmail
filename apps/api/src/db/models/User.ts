import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../sequelize';

interface UserAttributes {
  id: string;
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'passwordHash' | 'googleId' | 'displayName' | 'createdAt' | 'updatedAt'> {}

class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string;
  declare email: string;
  declare passwordHash: string | null;
  declare googleId: string | null;
  declare displayName: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'password_hash',
    },
    googleId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      field: 'google_id',
    },
    displayName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'display_name',
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    tableName: 'users',
    underscored: true,
  },
);

export default User;
