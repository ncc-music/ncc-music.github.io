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
    await Promise.all(manifest.icons.map(icon => stat(new URL('..' + icon.src, import.meta.url))));
});

test('the service worker keeps media and private APIs out of runtime storage', async () => {
    const worker = await read('service-worker.js');
    assert.match(worker, /request\.destination === 'audio'/);
    assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
    assert.match(worker, /request\.mode === 'navigate'/);
});
