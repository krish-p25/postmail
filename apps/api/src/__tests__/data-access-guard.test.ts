import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');

const TENANT_MODELS = ['TrackedEmail', 'EmailOpen', 'EmailClick', 'LinkedMailbox', 'UserSetting'];
const STATIC_METHODS = [
  'findAll', 'findOne', 'findByPk', 'findOrCreate', 'findAndCountAll',
  'count', 'create', 'bulkCreate', 'update', 'upsert', 'destroy',
];

/**
 * Files allowed to query tenant models directly. Every entry needs a reason.
 * Adding to this list should be rare and reviewed.
 */
const ALLOWED = new Set([
  'db/scoped.ts', // the helper itself
  'routes/pixel.ts', // unauthenticated: resolves the owner from the tracking token
  'services/backfill-ids.ts', // startup job that runs across all users
]);

const CALL = new RegExp(`\\b(${TENANT_MODELS.join('|')})\\.(${STATIC_METHODS.join('|')})\\(`);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'test' ? [] : sourceFiles(full);
    }
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

it('tenant models are only queried through forUser()', () => {
  const violations: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    if (ALLOWED.has(rel)) continue;
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (CALL.test(line)) violations.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  expect(violations).toEqual([]);
});

it('withRLS is no longer used', () => {
  const users = sourceFiles(SRC).filter((f) => fs.readFileSync(f, 'utf8').includes('withRLS'));
  expect(users).toEqual([]);
});
