/**
 * Zips the production build in dist/ into releases/postmail-extension-v<version>.zip,
 * ready to upload to the Chrome Web Store. Run through `npm run deploy`, which
 * typechecks, tests and builds first.
 */
import { readFile, readdir, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const releasesDir = path.join(root, 'releases');

function fail(message) {
  console.error(`[package] ${message}`);
  process.exit(1);
}

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

const manifest = await readJson(path.join(distDir, 'manifest.json')).catch(() =>
  fail('dist/manifest.json not found. Run `npm run build:prod` first.'),
);
const sourceManifest = await readJson(path.join(root, 'manifest.json'));
if (manifest.version !== sourceManifest.version) {
  fail(`dist/ is stale: built ${manifest.version}, but manifest.json says ${sourceManifest.version}. Rebuild first.`);
}

// Every file the manifest points at must be in the build, or the store upload is rejected.
const referenced = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
  ...(manifest.content_scripts ?? []).flatMap((script) => [...(script.js ?? []), ...(script.css ?? [])]),
].filter(Boolean);
for (const file of new Set(referenced)) {
  await access(path.join(distDir, file)).catch(() => fail(`manifest references ${file}, which is missing from dist/.`));
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(full) : [full];
    }),
  );
  return nested.flat();
}

const zip = new JSZip();
let fileCount = 0;
for (const file of await listFiles(distDir)) {
  const name = path.relative(distDir, file).split(path.sep).join('/');
  if (name.endsWith('.map') || name.endsWith('.d.ts')) continue; // never ship source maps or type declarations
  zip.file(name, await readFile(file));
  fileCount += 1;
}

const content = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
});

await mkdir(releasesDir, { recursive: true });
const zipName = `postmail-extension-v${manifest.version}.zip`;
const zipPath = path.join(releasesDir, zipName);
const existed = await access(zipPath).then(() => true, () => false);
await writeFile(zipPath, content);

console.log(`[package] ${existed ? 'Replaced' : 'Created'} releases/${zipName} (${fileCount} files, ${(content.length / 1024).toFixed(1)} KB)`);
if (existed) {
  console.log('[package] A zip for this version already existed. The Chrome Web Store rejects re-uploads of a version, so bump "version" in manifest.json for a new release.');
}
