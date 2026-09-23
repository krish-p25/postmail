import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-ssr');

const { render } = await import(pathToFileURL(path.join(ssrDir, 'entry-server.js')));

const appHtml = render('/');

const template = await readFile(path.join(distDir, 'index.html'), 'utf-8');
const output = template.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);

await writeFile(path.join(distDir, 'index.html'), output);
await rm(ssrDir, { recursive: true, force: true });

console.log('Prerendered "/" into dist/index.html');
