import User from './User';
import TrackedEmail from './TrackedEmail';
import EmailOpen from './EmailOpen';
import EmailClick from './EmailClick';
import UserSetting from './UserSetting';

// Associations — use camelCase attribute names (not snake_case column names)
// to avoid Sequelize creating duplicate attributes on the model instances.
User.hasMany(TrackedEmail, { foreignKey: 'userId', as: 'trackedEmails' });
TrackedEmail.belongsTo(User, { foreignKey: 'userId', as: 'user' });

TrackedEmail.hasMany(EmailOpen, { foreignKey: 'trackedEmailId', as: 'opens' });
EmailOpen.belongsTo(TrackedEmail, { foreignKey: 'trackedEmailId', as: 'trackedEmail' });

TrackedEmail.hasMany(EmailClick, { foreignKey: 'trackedEmailId', as: 'clicks' });
EmailClick.belongsTo(TrackedEmail, { foreignKey: 'trackedEmailId', as: 'trackedEmail' });

User.hasOne(UserSetting, { foreignKey: 'userId', as: 'settings' });
UserSetting.belongsTo(User, { foreignKey: 'userId', as: 'user' });

export { User, TrackedEmail, EmailOpen, EmailClick, UserSetting };
