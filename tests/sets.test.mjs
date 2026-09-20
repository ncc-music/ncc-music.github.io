import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { database } from './helpers/database.mjs';
const source = readFileSync('cloudflare-worker.js', 'utf8');
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const entries = [
    { key: 'techno-freaks/Session 01.flac', size: 123, customMetadata: { title: 'Session 01' } },
    { key: 'radio/Radio 01.mp3', size: 123 },
    { key: 'chill-out/Music 01.flac', size: 123 }
];
function env() { return { SITE_DB: database(), MY_BUCKET: { list: async ({ prefix }) => ({ objects: entries.filter(e => e.key.startsWith(prefix)), truncated: false }) } }; }
function req(path, method = 'GET', body, headers = {}) { return new Request('https://ncc.ar/api' + path, { method, headers: { Origin: 'https://ncc.ar', 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); }
async function tracks(environment) { return (await (await worker.fetch(req('/sets'), environment)).json()).tracks; }
const visitor = 'a1234567-abcd-1234-abcd-123456789abc';
test('catalogue isolates collections and assigns repeatable, unique slugs', async () => {
    const environment = env(), first = await tracks(environment), second = await tracks(environment);
    assert.equal(first.length, 3); assert.deepEqual(first.map(t => t.slug), second.map(t => t.slug));
    assert.equal(new Set(first.map(t => t.slug)).size, 3);
    const radio = await worker.fetch(new Request('https://worker.example/playlist?prefix=radio/'), environment);
    assert.deepEqual((await radio.json()).tracks.map(t => t.key), ['radio/Radio 01.mp3']);
});
test('public likes are idempotent, reversible and shared across visitors', async () => {
    const environment = env(), [track] = await tracks(environment);
    const like = body => worker.fetch(req(`/sets/${track.id}/likes`, 'PUT', body), environment);
    assert.equal((await (await like({ visitor, liked: true })).json()).count, 1);
    assert.equal((await (await like({ visitor, liked: true })).json()).count, 1);
    assert.equal((await (await like({ visitor: 'b1234567-abcd-1234-abcd-123456789abc', liked: true })).json()).count, 2);
    assert.equal((await tracks(environment))[0].likes, 2);
    assert.equal((await (await like({ visitor, liked: false })).json()).count, 1);
    assert.equal((await (await like({ visitor, liked: false })).json()).count, 1);
});
test('concurrent distinct likes are not lost', async () => {
    const environment = env(), [track] = await tracks(environment);
    const responses = await Promise.all(Array.from({ length: 12 }, (_, n) => worker.fetch(req(`/sets/${track.id}/likes`, 'PUT', { visitor: `${n.toString(16).padStart(8, '0')}-abcd-1234-abcd-123456789abc`, liked: true }), environment)));
    assert.ok(responses.every(r => r.ok)); assert.equal((await tracks(environment))[0].likes, 12);
});
test('unpublished sets are excluded from all public catalogues and cannot receive likes', async () => {
    const environment = env(), [track] = await tracks(environment);
    await environment.SITE_DB.prepare('INSERT INTO sets (id,audio_key,slug,title,published) VALUES (?,?,?,?,0)').bind(track.id, track.key, track.slug, track.name).run();
    assert.equal((await tracks(environment)).some(t => t.id === track.id), false);
    assert.equal((await worker.fetch(req(`/sets/${track.id}/likes`, 'PUT', { visitor, liked: true }), environment)).status, 404);
});
test('editing and export fail closed without verified administrator identity', async () => {
    const environment = env(), [track] = await tracks(environment);
    for (const path of ['/admin/sets', '/admin/export', '/admin/session']) assert.equal((await worker.fetch(req(path), environment)).status, 401);
    assert.equal((await worker.fetch(req(`/admin/sets/${track.id}`, 'PUT', { title: 'Bad' }, { 'Cf-Access-Jwt-Assertion': 'forged' }), environment)).status, 401);
    assert.equal((await tracks(environment))[0].name, track.name);
});
test('foreign origins, malformed bodies and unknown sets cannot change likes', async () => {
    const environment = env(), [track] = await tracks(environment);
    assert.equal((await worker.fetch(req(`/sets/${track.id}/likes`, 'PUT', { visitor, liked: true }, { Origin: 'https://foreign.example' }), environment)).status, 403);
    assert.equal((await worker.fetch(req(`/sets/${track.id}/likes`, 'PUT', { visitor: '<script>', liked: true }), environment)).status, 400);
    assert.equal((await tracks(environment))[0].likes, 0);
});
test('signed admin saves validate JWT, preserve slug and reject stale updates', async () => {
    const environment = { ...env(), ACCESS_TEAM_DOMAIN: 'ncc-test.cloudflareaccess.com', ACCESS_AUD: 'test-aud', ADMIN_EMAIL: 'admin@example.com' };
    const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['sign','verify']);
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey); jwk.kid = 'test-key';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async url => { assert.equal(url, 'https://ncc-test.cloudflareaccess.com/cdn-cgi/access/certs'); return Response.json({ keys: [jwk] }); };
    try {
        const encode = v => Buffer.from(JSON.stringify(v)).toString('base64url');
        const tokenFor = async claims => {
            const message = encode({ alg: 'RS256', kid: 'test-key' }) + '.' + encode(claims);
            return message + '.' + Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(message))).toString('base64url');
        };
        const claims = { iss: 'https://ncc-test.cloudflareaccess.com', aud: ['test-aud'], email: environment.ADMIN_EMAIL, exp: Math.floor(Date.now()/1000)+600 };
        const token = await tokenFor(claims), headers = { 'Cf-Access-Jwt-Assertion': token };
        const [track] = await tracks(environment);
        const input = { title: 'Renamed', date: '2026-09-19', tracklist: ['Artist — Track'], published: true, version: 0 };
        assert.equal((await worker.fetch(req('/admin/sets/'+track.id, 'PUT', input, headers), environment)).status, 200);
        const saved = (await tracks(environment))[0]; assert.equal(saved.name, 'Renamed'); assert.equal(saved.slug, track.slug); assert.equal(saved.version, 1);
        assert.equal((await worker.fetch(req('/admin/sets/'+track.id, 'PUT', input, headers), environment)).status, 409);
        assert.equal((await worker.fetch(req('/admin/sets/'+track.id, 'PUT', { ...input, version:1, date:'2026-02-31' }, headers), environment)).status, 400);
        const originalContent = await (await worker.fetch(req('/content'), environment)).json();
        assert.equal(originalContent.version, 0);
        const content = structuredClone(originalContent.content); content.about.body = 'Una biografía editada'; content.tour.body = '20.10.2026 · Buenos Aires';
        const update = { content, version: 0 };
        assert.equal((await worker.fetch(req('/admin/content', 'PUT', update), environment)).status, 401);
        assert.equal((await worker.fetch(req('/admin/content', 'PUT', update, { ...headers, Origin: 'https://foreign.example' }), environment)).status, 403);
        assert.equal((await worker.fetch(req('/admin/content', 'PUT', update, headers), environment)).status, 200);
        assert.deepEqual(await (await worker.fetch(req('/content'), environment)).json(), { content, version: 1 });
        assert.equal((await worker.fetch(req('/admin/content', 'PUT', update, headers), environment)).status, 409);
        const invalid = structuredClone(content); invalid.about.bookingEmail = 'javascript:alert(1)';
        assert.equal((await worker.fetch(req('/admin/content', 'PUT', { content: invalid, version: 1 }, headers), environment)).status, 400);
        assert.deepEqual((await (await worker.fetch(req('/admin/export', 'GET', null, headers), environment)).json()).site.content, content);
        for (const override of [{ exp: 1 }, { email: 'other@example.com' }, { aud:['other'] }]) {
            assert.equal((await worker.fetch(req('/admin/sets', 'GET', null, { 'Cf-Access-Jwt-Assertion': await tokenFor({...claims,...override}) }), environment)).status, 401);
        }
    } finally { globalThis.fetch = originalFetch; }
});

test('shared pages include the original skull and escaped set metadata without JavaScript', async () => {
    const environment = env(), [track] = await tracks(environment);
    await environment.SITE_DB.prepare('INSERT INTO sets (id,audio_key,slug,title) VALUES (?,?,?,?)').bind(track.id, track.key, track.slug, 'Set <special> "NCC"').run();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(readFileSync('index.html', 'utf8'));
    try {
        const response = await worker.fetch(new Request('https://ncc.ar/set/' + track.slug), environment);
        assert.equal(response.status, 200);
        const html = await response.text();
        assert.match(html, /property="og:image" content="https:\/\/ncc.ar\/assets\/player-cover.jpg"/);
        assert.match(html, /name="twitter:image" content="https:\/\/ncc.ar\/assets\/player-cover.jpg"/);
        assert.match(html, /Set &lt;special&gt; &quot;NCC&quot;/);
        assert.ok(html.includes('rel="canonical" href="https://ncc.ar/set/' + track.slug + '"'));
        const missing = await worker.fetch(new Request('https://ncc.ar/set/missing'), environment);
        assert.equal(missing.status, 404);
        const missingHTML = await missing.text(); assert.match(missingHTML, /name="robots" content="noindex"/); assert.doesNotMatch(missingHTML, /content="index, follow/);
        const head = await worker.fetch(new Request('https://ncc.ar/set/' + track.slug, { method: 'HEAD' }), environment);
        assert.equal(head.status, 200); assert.equal(await head.text(), '');
    } finally { globalThis.fetch = originalFetch; }
});
