import User from './User';
import TrackedEmail from './TrackedEmail';
import EmailOpen from './EmailOpen';
import EmailClick from './EmailClick';
import UserSetting from './UserSetting';

// Associations
User.hasMany(TrackedEmail, { foreignKey: 'user_id', as: 'trackedEmails' });
TrackedEmail.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

TrackedEmail.hasMany(EmailOpen, { foreignKey: 'tracked_email_id', as: 'opens' });
EmailOpen.belongsTo(TrackedEmail, { foreignKey: 'tracked_email_id', as: 'trackedEmail' });

TrackedEmail.hasMany(EmailClick, { foreignKey: 'tracked_email_id', as: 'clicks' });
EmailClick.belongsTo(TrackedEmail, { foreignKey: 'tracked_email_id', as: 'trackedEmail' });

User.hasOne(UserSetting, { foreignKey: 'user_id', as: 'settings' });
UserSetting.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export { User, TrackedEmail, EmailOpen, EmailClick, UserSetting };
