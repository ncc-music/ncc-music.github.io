import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('the page advertises the installable app and registers its service worker', async () => {
    const [html, client] = await Promise.all([read('index.html'), read('js/pwa.js')]);
    assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
    assert.match(html, /rel="apple-touch-icon"/);
    assert.match(html, /id="install-app"/);
    assert.match(client, /serviceWorker\.register\('\/service-worker\.js'\)/);
});

test('the web app manifest contains install icons and standalone display mode', async () => {
    const manifest = JSON.parse(await read('manifest.webmanifest'));
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, '/');
    assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
    assert.ok(manifest.icons.some(icon => icon.sizes === '512x512'));
    assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable' && icon.src.includes('maskable')));
    await Promise.all(manifest.icons.map(icon => stat(new URL('..' + icon.src, import.meta.url))));
});

test('the service worker keeps media and private APIs out of runtime storage', async () => {
    const [worker, client] = await Promise.all([read('service-worker.js'), read('js/pwa.js')]);
    assert.match(worker, /request\.destination === 'audio'/);
    assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
    assert.match(worker, /request\.mode === 'navigate'/);
    assert.match(worker, /SKIP_WAITING/);
    assert.doesNotMatch(worker, /install[\s\S]{0,180}skipWaiting/);
    assert.match(client, /postMessage\(\{ type: 'SKIP_WAITING' \}\)/);
    assert.doesNotMatch(client, /Nueva versión disponible|pwa-update|controllerchange|location\.reload/);
});

test('heavy visual assets use compact modern formats', async () => {
    const [html, css, hero, skull, logo, font] = await Promise.all([
        read('index.html'), read('styles.css'), stat(new URL('../assets/mixed-by-single-line.webp', import.meta.url)),
        stat(new URL('../assets/skull-pieces.webp', import.meta.url)), stat(new URL('../assets/cardu-skull-mustard.webp', import.meta.url)),
        stat(new URL('../assets/fonts/RoadRage-Regular.woff2', import.meta.url))
    ]);
    assert.match(html, /mixed-by-single-line\.webp/);
    assert.match(html, /skull-pieces\.webp/);
    assert.match(html, /cardu-skull-mustard\.webp/);
    assert.match(css, /RoadRage-Regular\.woff2/);
    assert.ok(hero.size < 200000 && skull.size < 200000 && logo.size < 100000 && font.size < 120000);
});
