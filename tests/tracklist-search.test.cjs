const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync('js/tracklist-search.js', 'utf8'), context);
const { normalize, search } = context.window.NCCTracklistSearch;
const tracks = [
    { name: 'Sesión Ácida', date: '2026-09-20', published: true, playlistId: 'techno-freaks', tracklist: ['01. Sasha — Xpander', '02. Digweed — Heaven Scent (Remix)'] },
    { name: 'Older Set', date: '2025-01-01', published: true, playlistId: 'techno-freaks', tracklist: ['Sasha — Belfunk'] },
    { name: 'Draft', date: '2027-01-01', published: false, playlistId: 'techno-freaks', tracklist: ['Sasha — Hidden'] }
];

test('tracklist search ignores case and accents and keeps words within one entry', () => {
    assert.equal(normalize('  SESIÓN   Ácida '), 'sesion acida');
    assert.equal(search(tracks, 'sasha xpander').matchCount, 1);
    assert.equal(search(tracks, 'sasha heaven').sets.length, 0);
});

test('tracklist search groups every appearance by set and supports set metadata', () => {
    const appearances = search(tracks, 'sasha');
    assert.equal(appearances.sets.length, 2);
    assert.equal(appearances.matchCount, 2);
    const bySet = search(tracks, 'sesion acida');
    assert.equal(bySet.sets.length, 1);
    assert.equal(bySet.sets[0].matches.length, 2);
});
