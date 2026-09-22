import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('manifesto language controls live beside the page title', async () => {
    const html = await read('index.html');
    const heading = html.slice(html.indexOf('<div class="page-heading">'), html.indexOf('<section class="radio-feature'));
    assert.match(heading, /id="page-title"/);
    assert.match(heading, /id="manifesto-languages"/);
    assert.equal(html.match(/id="manifesto-languages"/g)?.length, 1);
});

test('mobile About uses the mustard skull identity', async () => {
    const [html, css] = await Promise.all([read('index.html'), read('styles.css')]);
    assert.match(html, /about-art"><img src="assets\/cardu-skull-mustard\.png/);
    assert.match(css, /\.about-section \{ display: grid; grid-template-columns:/);
    assert.match(css, /\.about-art \{ grid-column: 2; grid-row: 1;/);
});

test('tracklist search is appended after the archive results', async () => {
    const source = await read('js/sets.js');
    const render = source.slice(source.indexOf('function renderTracklists()'), source.indexOf('function renderNowPlayer()'));
    assert.ok(render.lastIndexOf('root.append(search)') > render.indexOf("const archive = el('div', 'tracklist-archive')"));
});

test('expanded player occupies ninety percent of the viewport', async () => {
    const css = await read('styles.css');
    assert.match(css, /\.now-player \{[^}]*height: 90dvh;/);
    assert.match(css, /\.now-player-backdrop \{[^}]*inset: 0 0 90% 0;/);
});
