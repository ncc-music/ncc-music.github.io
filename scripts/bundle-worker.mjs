import { readFile, writeFile } from 'node:fs/promises';
const target = new URL('../cloudflare-worker.js', import.meta.url);
const source = (await readFile(target, 'utf8')).split('// BEGIN SET SERVICE')[0].trimEnd();
await writeFile(target, source + '\n\n// BEGIN SET SERVICE\n' + await readFile(new URL('set-service.mjs', import.meta.url), 'utf8'));
