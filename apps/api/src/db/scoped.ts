import {
  Attributes,
  CountOptions,
  CreationAttributes,
  DestroyOptions,
  FindOptions,
  FindOrCreateOptions,
  Model,
  ModelStatic,
  UpdateOptions,
  WhereOptions,
} from 'sequelize';
import { TrackedEmail, EmailOpen, LinkedMailbox, UserSetting } from './models';

/**
 * Tenant-scoped data access. All reads and writes of user-owned tables in
 * routes/services go through forUser(userId) so a query can never omit the
 * owner filter. Enforced by src/__tests__/data-access-guard.test.ts.
 */

type Owned = Model & { userId: string };
type Where<M extends Model> = WhereOptions<Attributes<M>>;
type Values<M extends Model> = Omit<CreationAttributes<M>, 'userId'>;

function withUser<M extends Model>(where: Where<M> | undefined, userId: string): Where<M> {
  // userId is spread last so a caller-supplied userId can never override it.
  return { ...(where as object), userId } as unknown as Where<M>;
}

function scopeModel<M extends Owned>(model: ModelStatic<M>, userId: string) {
  return {
    findAll: (options: FindOptions<Attributes<M>> = {}) =>
      model.findAll({ ...options, where: withUser<M>(options.where, userId) }),

    findOne: (options: FindOptions<Attributes<M>> = {}) =>
      model.findOne({ ...options, where: withUser<M>(options.where, userId) }),

    findById: (id: string, options: Omit<FindOptions<Attributes<M>>, 'where'> = {}) =>
      model.findOne({ ...options, where: withUser<M>({ id } as unknown as Where<M>, userId) }),

    count: (options: Omit<CountOptions<Attributes<M>>, 'group'> = {}) =>
      model.count({ ...options, where: withUser<M>(options.where, userId) }),

    create: (values: Values<M>) => model.create({ ...values, userId } as unknown as CreationAttributes<M>),

    findOrCreate: (
      options: Omit<FindOrCreateOptions<Attributes<M>, CreationAttributes<M>>, 'defaults'> & { defaults: Values<M> },
    ) =>
      model.findOrCreate({
        ...options,
        where: withUser<M>(options.where, userId),
        defaults: { ...options.defaults, userId } as unknown as CreationAttributes<M>,
      }),

    upsert: (values: Values<M>) => model.upsert({ ...values, userId } as unknown as CreationAttributes<M>),

    update: (values: Partial<Attributes<M>>, options: Omit<UpdateOptions<Attributes<M>>, 'returning'>) =>
      model.update(values, { ...options, where: withUser<M>(options.where, userId) }),

    destroy: (options: DestroyOptions<Attributes<M>> & { where: Where<M> }) =>
      model.destroy({ ...options, where: withUser<M>(options.where, userId) }),
  };
}

export function forUser(userId: string) {
  if (!userId) throw new Error('forUser requires a userId');
  return {
    trackedEmails: scopeModel(TrackedEmail, userId),
    emailOpens: scopeModel(EmailOpen, userId),
    linkedMailboxes: scopeModel(LinkedMailbox, userId),
    userSettings: scopeModel(UserSetting, userId),
  };
}

export type UserScope = ReturnType<typeof forUser>;
