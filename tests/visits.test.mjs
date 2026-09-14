import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../cloudflare-worker.js', import.meta.url), 'utf8');
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
function bucket() {
    return {
        value: null, revision: 0, writes: 0,
        async get(key) {
            assert.equal(key, '__site/visits.json');
            const value = this.value, revision = this.revision;
            return value === null ? null : { etag: String(revision), json: async () => ({ count: value }) };
        },
        async put(key, value, options) {
            assert.equal(key, '__site/visits.json');
            const condition = options.onlyIf;
            if (condition instanceof Headers ? this.value !== null : condition.etagMatches !== String(this.revision)) return null;
            this.value = JSON.parse(value).count; this.revision++; this.writes++;
            return { etag: String(this.revision) };
        }
    };
}
const request = (method = 'POST', origin = 'https://ncc.ar') => new Request('https://worker.example/visits', { method, headers: { Origin: origin } });
test('global counter persists increments and GET does not increment', async () => {
    const storage = bucket(), env = { MY_BUCKET: storage };
    assert.equal((await (await worker.fetch(request('GET'), env)).json()).count, 0);
    for (let count = 1; count <= 3; count++) {
        const response = await worker.fetch(request(), env);
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
        assert.equal((await response.json()).count, count);
    }
    assert.equal((await (await worker.fetch(request('GET'), env)).json()).count, 3);
    assert.equal(storage.writes, 3);
});
test('concurrent visits are counted without lost increments', async () => {
    const storage = bucket();
    const responses = await Promise.all(Array.from({ length: 6 }, () => worker.fetch(request(), { MY_BUCKET: storage })));
    assert.ok(responses.every(response => response.status === 200));
    assert.equal(storage.value, 6);
});
test('foreign origins and local previews cannot increment the public counter', async () => {
    const storage = bucket();
    for (const origin of ['https://foreign.example', 'http://127.0.0.1:8000', 'null']) {
        assert.equal((await worker.fetch(request('POST', origin), { MY_BUCKET: storage })).status, 403);
    }
    assert.equal(storage.writes, 0);
    assert.equal((await worker.fetch(request('DELETE'), { MY_BUCKET: storage })).status, 405);
});
test('storage failure or invalid data never resets the count or invents a total', async () => {
    assert.equal((await worker.fetch(request(), {})).status, 503);
    const storage = bucket(); storage.value = 'invalid';
    const response = await worker.fetch(request(), { MY_BUCKET: storage });
    assert.equal(response.status, 503);
    assert.equal(storage.writes, 0);
    assert.equal('count' in await response.json(), false);
});
test('frontend counts one page load and uses honest unavailable state', async () => {
    for (const ok of [true, false]) {
        const registrations = [], calls = [], counter = {}, wrapper = { setAttribute() {} };
        const context = vm.createContext({
            document: { getElementById: id => id === 'visit-count' ? counter : wrapper, addEventListener: (...args) => registrations.push(args) },
            location: { hostname: '127.0.0.1' }, AbortController, setTimeout: () => 1, clearTimeout() {},
            fetch: async (...args) => { calls.push(args); return { ok, json: async () => ({ count: 27 }) }; }
        });
        vm.runInContext(fs.readFileSync(new URL('../js/visits.js', import.meta.url), 'utf8'), context);
        assert.equal(registrations.length, 1);
        assert.equal(registrations[0][0], 'DOMContentLoaded');
        assert.equal(registrations[0][2].once, true);
        await registrations[0][1]();
        assert.equal(calls.length, 1);
        assert.equal(calls[0][0], '/visits');
        assert.equal(calls[0][1].method, 'POST');
        assert.equal(counter.textContent, ok ? '000027' : '—');
    }
});
