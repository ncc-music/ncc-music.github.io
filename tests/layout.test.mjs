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
    assert.match(css, /grid-template-areas: "copy art"/);
    assert.match(css, /\.about-art \{ grid-area: art;/);
});

test('About is centered and enlarged on desktop', async () => {
    const css = await read('styles.css');
    assert.match(css, /\.about-section \{[^}]*justify-content: center;[^}]*width: min\(100%,960px\);[^}]*margin: 0 auto;/);
    assert.match(css, /\.about-art \{ width: clamp\(280px,32vw,380px\);/);
    assert.match(css, /\.about-copy h2 \{ font-size: clamp\(42px,5vw,58px\);/);
});

test('waveform long press uses the familiar half-second scrub delay', async () => {
    const source = await read('js/detail-waveform.js');
    assert.match(source, /const HOLD_TO_SCRUB_MS = 500;/);
});

test('waveform focus never draws the green keyboard outline', async () => {
    const css = await read('styles.css');
    assert.match(css, /\.detail-waveform canvas:focus, \.detail-waveform canvas:focus-visible \{ outline: none; \}/);
});

test('expanded skull never draws a rectangular focus or hover accent', async () => {
    const css = await read('styles.css');
    assert.match(css, /\.expanded-skull-media:focus, \.expanded-skull-media:focus-visible \{ outline: none; \}/);
    assert.doesNotMatch(css, /\.expanded-skull-media:hover, \.expanded-skull-media:focus-visible \{/);
    assert.match(css, /\.expanded-skull-media:focus-visible \.expanded-skull-control \{ box-shadow:/);
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

test('mobile mini player keeps its compact layout and uses a clean expand control', async () => {
    const [html, css] = await Promise.all([read('index.html'), read('styles.css')]);
    assert.doesNotMatch(html, /expand-player-label/);
    assert.match(css, /\.track-name-button \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
    assert.match(css, /\.now-info h2 \{[^}]*font-size: 13px;/);
    assert.match(css, /\.player-dock \.now-info h2 \{[^}]*font-size: 12px;/);
    assert.match(css, /\.expand-player \{[^}]*color: var\(--text\);[^}]*background: transparent;[^}]*border: 0;/);
    assert.match(css, /\.expand-player:hover, \.expand-player:focus-visible \{[^}]*color: var\(--accent\);/);
    assert.match(css, /\.player-dock \.expand-player \{[^}]*grid-column: 3;[^}]*width: 32px;[^}]*height: 32px;/);
});

test('desktop mini player reveals a vertical volume control without changing the expanded player', async () => {
    const [html, css] = await Promise.all([read('index.html'), read('styles.css')]);
    const expandedPlayer = html.slice(html.indexOf('id="now-player"'), html.indexOf('class="player-dock"'));
    assert.match(html, /class="volume-control"[^>]*>.*id="mute-button".*class="volume-popover".*id="volume-slider"/s);
    assert.match(css, /\.volume-popover \{[^}]*bottom: calc\(100% \+ 10px\);[^}]*height: 112px;[^}]*opacity: 0;/);
    assert.match(css, /\.volume-control:hover \.volume-popover, \.volume-control:focus-within \.volume-popover \{[^}]*opacity: 1;/);
    assert.match(css, /\.volume-control #volume-slider \{[^}]*transform: rotate\(-90deg\);/);
    assert.doesNotMatch(expandedPlayer, /volume-slider/);
});
