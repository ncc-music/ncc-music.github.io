import { mkdir, copyFile, cp } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('dist/server/', root), { recursive: true });
await mkdir(new URL('dist/client/js/', root), { recursive: true });
for (const name of ['index.html', 'styles.css', 'robots.txt', 'sitemap.xml']) {
    await copyFile(new URL(name, root), new URL(`dist/client/${name}`, root));
}
await cp(new URL('assets/', root), new URL('dist/client/assets/', root), { recursive: true });
for (const name of ['gdrive-player.js', 'tracklist-search.js', 'sets.js', 'content.js', 'detail-waveform.js', 'waveform-stream.js', 'waveform-worker.js', 'visits.js']) {
    await copyFile(new URL('js/' + name, root), new URL('dist/client/js/' + name, root));
}
await copyFile(new URL('scripts/sites-worker.mjs', root), new URL('dist/server/index.js', root));
console.log('NCC Music build complete.');
