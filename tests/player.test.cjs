const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
function setup() {
    const elements = new Map();
    const element = () => ({ textContent: '', hidden: false, disabled: false, value: 0, innerHTML: '', style: { setProperty() {} }, setAttribute() {}, classList: { toggle() {} } });
    const document = { addEventListener() {}, body: { dataset: {} }, getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, querySelectorAll() { return []; }, querySelector() { return null; } };
    const audio = { src: '', paused: true, currentTime: 0, duration: 100, pause() { this.paused = true; }, async play() { this.paused = false; }, getAttribute() { return this.src; }, removeAttribute() { this.src = ''; }, load() {} };
    const context = vm.createContext({ document, navigator: {}, location: { hostname: 'ncc.ar', origin: 'https://ncc.ar', href: 'https://ncc.ar/', hash: '' }, window: {}, URL, AbortController, console, setTimeout: () => 1, clearTimeout() {}, fetch: async () => { throw new Error('offline'); } });
    vm.runInContext(fs.readFileSync('js/gdrive-player.js', 'utf8') + '\nglobalThis.app = { playerState, normalizeR2Playlist, radioQueue, playTrack, nextTrack, startRadio, startPlayback, selectTrack, loadCatalogue, route, safeMediaUrl }; resetWaveform = () => {}; loadWaveform = () => {}; renderCatalogue = () => {}; loadPlaylistDurations = () => {};', context);
    context.fakeAudio = audio; vm.runInContext('audio = fakeAudio;', context);
    const state = context.app.playerState;
    state.playlists.forEach(p => { p.tracks = [0, 1].map(i => ({ name: `${p.title} ${i}`, artist: 'NCC', url: `https://audio.example/${p.id}/${i}.flac`, duration: 100, playlistId: p.id, playlistTitle: p.title, cover: 'cover.jpg', format: 'FLAC' })); });
    return { context, app: context.app, state, audio, elements };
}
test('radio crosses collections, visits every set and loops', async () => {
    const { app, state } = setup();
    await app.playTrack('chill-out', 0, true);
    const order = [];
    for (let i = 0; i < 5; i++) { order.push(`${state.activePlaylistId}:${state.currentTrackIndex}`); app.nextTrack(); }
    assert.deepEqual(order, ['chill-out:0', 'techno-freaks:0', 'chill-out:1', 'techno-freaks:1', 'chill-out:0']);
    assert.equal(state.radio, true);
});
test('radio includes all tracks when collections have different sizes', () => {
    const { app, state } = setup();
    state.playlists[1].tracks.pop();
    assert.deepEqual(Array.from(app.radioQueue(), q => `${q.playlistId}:${q.index}`), ['chill-out:0', 'techno-freaks:0', 'chill-out:1']);
});
test('entering radio retains current audio position; direct selection exits radio', async () => {
    const { app, state, audio } = setup();
    await app.playTrack('techno-freaks', 1); audio.currentTime = 37;
    app.startRadio(); assert.equal(audio.currentTime, 37); assert.equal(state.radio, true);
    await app.playTrack('chill-out', 0); assert.equal(state.radio, false);
    app.nextTrack(); assert.equal(state.activePlaylistId, 'chill-out'); assert.equal(state.currentTrackIndex, 1);
});
test('previous in radio crosses collection boundaries and wraps', async () => {
    const { app, state } = setup(); await app.playTrack('chill-out', 0, true); app.nextTrack(-1);
    assert.equal(state.activePlaylistId, 'techno-freaks'); assert.equal(state.currentTrackIndex, 1);
});
test('a rejected play request leaves a stopped player with a retry message', async () => {
    const { app, audio, state, elements } = setup();
    audio.play = async () => { throw Object.assign(new Error('blocked'), { name: 'NotAllowedError' }); };
    await app.playTrack('chill-out', 0);
    assert.equal(state.isPlaying, false);
    assert.match(elements.get('player-message').textContent, /Tocá reproducir/);
    assert.equal(elements.get('play-button').disabled, false);
});
test('an old rejected request cannot overwrite the newly selected track', async () => {
    const { app, audio, state, elements } = setup(); let reject;
    audio.play = () => new Promise((_, r) => { reject = r; });
    const pending = app.playTrack('chill-out', 0);
    app.selectTrack('techno-freaks', 0);
    reject(new Error('old failure')); await pending;
    assert.equal(state.activePlaylistId, 'techno-freaks'); assert.equal(elements.get('player-message').textContent, '');
});
test('catalogue rejects unsafe media URLs and preserves real names', () => {
    const { app, state } = setup();
    const tracks = app.normalizeR2Playlist({ tracks: [{ name: '<b>My set</b>', url: 'https://audio.example/set.flac' }, { name: 'Unsafe', url: 'javascript:alert(1)' }] }, state.playlists[0]);
    assert.equal(tracks.length, 1); assert.equal(tracks[0].name, '<b>My set</b>'); assert.equal(tracks[0].format, 'FLAC');
});
test('offline catalogue keeps radio disabled without a false playback state', async () => {
    const { app, state, elements } = setup();
    state.playlists.forEach(p => { p.tracks = []; });
    await app.loadCatalogue();
    assert.equal(state.isPlaying, false); assert.equal(elements.get('radio-button').disabled, true);
    assert.equal(state.playlists.every(p => p.error), true);
});
test('navigation and collection filters do not replace the playing set', async () => {
    const { app, state, context, audio } = setup();
    await app.playTrack('techno-freaks', 1, true); audio.currentTime = 52;
    context.location.hash = '#chill-out'; app.route();
    assert.equal(state.filter, 'chill-out'); assert.equal(state.activePlaylistId, 'techno-freaks');
    assert.equal(state.radio, true); assert.equal(audio.currentTime, 52);
});
