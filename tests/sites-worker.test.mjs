import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../scripts/sites-worker.mjs';
test('private preview serves ordinary paths with its assets binding', async () => {
    const response = await worker.fetch(new Request('https://ncc.example/styles.css'), { ASSETS: { fetch: () => new Response('style') } });
    assert.equal(await response.text(), 'style');
});
test('catalogue proxy only permits the two NCC collections and read requests', async () => {
    assert.equal((await worker.fetch(new Request('https://ncc.example/api/playlist?prefix=private/'), {})).status, 400);
    assert.equal((await worker.fetch(new Request('https://ncc.example/api/playlist?prefix=chill-out/', { method: 'POST' }), {})).status, 405);
    assert.equal((await worker.fetch(new Request('https://ncc.example/audio/unrelated/set.flac'), {})).status, 400);
});
test('catalogue proxy forwards to the fixed upstream and returns live data', async () => {
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = async target => {
            assert.equal(target.origin, 'https://rapid-silence-8ef7.nc-music-87a.workers.dev');
            assert.equal(target.searchParams.get('prefix'), 'chill-out/');
            return Response.json({ tracks: [{ name: 'Current set' }] });
        };
        const response = await worker.fetch(new Request('https://ncc.example/api/playlist?prefix=chill-out/'), {});
        assert.equal((await response.json()).tracks[0].name, 'Current set');
    } finally { globalThis.fetch = originalFetch; }
});
