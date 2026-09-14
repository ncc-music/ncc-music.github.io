const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync('js/gdrive-player.js', 'utf8');
function setup(storage) {
    const context = vm.createContext({ location: { hostname: 'ncc.ar' }, localStorage: storage, document: { addEventListener() {} } });
    vm.runInContext(source + '\nshowMessage = message => globalThis.message = message; globalThis.app = { toggleSetPreference, readSetPreferences, setPreferenceId, getSaved: () => setPreferences };', context);
    return context;
}
test('likes and favorites persist independently, survive reload and can be removed', () => {
    const values = new Map();
    const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    const first = setup(storage).app;
    const track = { key: 'techno/set.flac', url: 'https://audio.example/set.flac' };
    assert.equal(first.toggleSetPreference(track, 'likes'), true);
    assert.equal(first.toggleSetPreference(track, 'favorites'), true);
    const reloaded = setup(storage).app;
    assert.equal(reloaded.getSaved().likes.has(track.key), true);
    assert.equal(reloaded.getSaved().favorites.has(track.key), true);
    reloaded.toggleSetPreference(track, 'favorites');
    assert.equal(reloaded.getSaved().favorites.size, 0);
    assert.equal(reloaded.getSaved().likes.size, 1);
    assert.equal(reloaded.setPreferenceId({ ...track, url: 'https://new.example/set.flac' }), track.key);
});
test('blocked storage reports failure without displaying an unsaved preference', () => {
    const context = setup({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
    assert.equal(context.app.toggleSetPreference({ url: 'set.flac' }, 'likes'), false);
    assert.equal(context.app.getSaved().likes.size, 0);
    assert.match(context.message, /no permite guardar/);
});
test('invalid saved data is ignored safely', () => {
    const context = setup({ getItem: () => '{broken' });
    assert.equal(context.app.getSaved().likes.size, 0);
    assert.equal(context.app.getSaved().favorites.size, 0);
});
