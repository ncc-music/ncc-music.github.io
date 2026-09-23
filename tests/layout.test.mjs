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
    assert.match(html, /about-art"><img src="assets\/cardu-skull-mustard\.webp/);
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

test('mobile expanded player allows the set title to use two lines', async () => {
    const css = await read('styles.css');
    assert.match(css, /@media \(max-width: 760px\) \{[^]*\.now-player \.expanded-waveform-heading h2 \{[^}]*-webkit-line-clamp: 2;[^}]*white-space: normal;/);
    assert.match(css, /\.expanded-waveform-heading h2 \{[^}]*white-space: nowrap;/);
});

test('mobile mini player keeps its compact layout and uses a clean expand control', async () => {
    const [html, css] = await Promise.all([read('index.html'), read('styles.css')]);
    assert.doesNotMatch(html, /expand-player-label/);
    assert.match(css, /\.track-name-button \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
    assert.match(css, /\.now-info h2 \{[^}]*font-size: 12px;/);
    assert.match(css, /\.player-dock \.now-info h2 \{[^}]*font-size: 12px;/);
    assert.match(css, /\.now-info p \{[^}]*font-size: 16px;/);
    assert.match(css, /\.player-dock \.now-info p \{[^}]*font-size: 15px;/);
    assert.match(css, /\.expand-player \{[^}]*color: var\(--text\);[^}]*background: transparent;[^}]*border: 0;/);
    assert.match(css, /\.expand-player:hover, \.expand-player:focus-visible \{[^}]*color: var\(--accent\);/);
    assert.match(css, /\.player-dock \.expand-player \{[^}]*grid-column: 3;[^}]*width: 32px;[^}]*height: 32px;/);
});

test('desktop mini player gives the set title more room without changing mobile', async () => {
    const css = await read('styles.css');
    assert.match(css, /@media \(min-width: 761px\) \{[^]*?\.player-dock \{[^}]*padding-left: 12px;[^}]*padding-right: 20px;[^}]*\}[^]*?\.player-dock \.now-playing \{[^}]*gap: 11px;/);
    assert.match(css, /@media \(max-width: 760px\) \{[^]*?\.player-dock \{[^}]*padding: 8px 10px max\(8px, env\(safe-area-inset-bottom\)\);/);
});

test('desktop mini player reveals a vertical volume control without changing the expanded player', async () => {
    const [html, css] = await Promise.all([read('index.html'), read('styles.css')]);
    const expandedPlayer = html.slice(html.indexOf('id="now-player"'), html.indexOf('class="player-dock"'));
    assert.match(html, /class="volume-control"[^>]*>.*id="mute-button".*class="volume-popover".*id="volume-slider"/s);
    assert.match(html, /id="volume-slider"[^>]*orient="vertical"[^>]*aria-orientation="vertical"/);
    assert.match(css, /\.volume-popover \{[^}]*bottom: calc\(100% \+ 4px\);[^}]*left: 50%;[^}]*height: 92px;[^}]*opacity: 0;/);
    assert.match(css, /\.volume-control:hover \.volume-popover, \.volume-control:focus-within \.volume-popover \{[^}]*opacity: 1;/);
    assert.match(css, /\.volume-control #volume-slider \{[^}]*width: 18px;[^}]*height: 66px;[^}]*writing-mode: vertical-lr;[^}]*\/ 5px 100% no-repeat;/);
    assert.doesNotMatch(css, /\.volume-control #volume-slider \{[^}]*rotate\(/);
    assert.doesNotMatch(expandedPlayer, /volume-slider/);
});

test('mini player omits favorites while catalogue favorites remain available', async () => {
    const [html, player] = await Promise.all([read('index.html'), read('js/gdrive-player.js')]);
    assert.doesNotMatch(html, /id="player-favorite"/);
    assert.match(player, /\['favorites', 'star', 'Favorito'\]/);
    assert.doesNotMatch(player, /\$\('player-favorite'\)/);
});

test('share icons remove SVG filters before rendering under privacy shields', async () => {
    const [sets, css] = await Promise.all([read('js/sets.js'), read('styles.css')]);
    assert.match(sets, /function shieldSafeShareSVG\(markup\)/);
    assert.match(sets, /\.replace\(\/<filter\\b\[\^>\]\*>\[\\s\\S\]\*\?<\\\/filter>\/gi, ''\)/);
    assert.match(sets, /Object\.entries\(rawSharePlatformSVG\).*shieldSafeShareSVG\(markup\)/);
    assert.match(sets, /icon\.innerHTML = sharePlatformSVG\[platform\.id\]/);
    assert.match(sets, /el\('button', 'destination-choice'\)/);
    assert.match(sets, /window\.open\(platform\.url, '_blank', 'noopener,noreferrer'\)/);
    assert.doesNotMatch(sets, /share-\$\{platform\.id\}/);
    assert.doesNotMatch(sets, /link\.href = platform\.url/);
    assert.doesNotMatch(sets, /reddit/i);
    assert.match(css, /\.destination-grid \{/);
    assert.doesNotMatch(css, /\.share-platform-icon|\.share-option|\.share-links/);
});

test('set editor exposes the short slug and submits it with the record', async () => {
    const sets = await read('js/sets.js');
    assert.match(sets, /id="edit-slug"/);
    assert.match(sets, /\$\('edit-slug'\)\.value = editorTrack\.slug/);
    assert.match(sets, /JSON\.stringify\(\{ title: \$\('edit-title'\)\.value, slug,/);
    assert.match(sets, /los enlaces anteriores redirigen al nuevo/);
});

test('administration exposes moderation and aggregate analytics', async () => {
    const [sets, css] = await Promise.all([read('js/sets.js'), read('styles.css')]);
    assert.match(sets, /Moderar comentarios/);
    assert.match(sets, /Ver estadísticas/);
    assert.match(sets, /datos agregados, sin perfiles personales/);
    assert.match(sets, /recordAnalytics\('play_start'/);
    assert.match(sets, /recordAnalytics\('play_complete'/);
    assert.match(css, /\.analytics-summary/);
    assert.match(css, /\.moderation-card/);
});
