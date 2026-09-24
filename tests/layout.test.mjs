import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

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

test('mobile header keeps every link on one compact row without changing desktop', async () => {
    const css = await read('styles.css');
    const compact = css.slice(css.indexOf('/* Keep the complete navigation while giving mobile screens more room for music. */'));
    assert.match(compact, /@media \(max-width: 540px\)/);
    assert.match(compact, /\.site-header \{[^}]*grid-template-rows: 54px 40px;[^}]*height: 106px;/);
    assert.match(compact, /\.main-nav \{[^}]*display: flex;[^}]*flex-wrap: nowrap;[^}]*height: 40px;[^}]*overflow-x: auto;/);
    assert.match(compact, /\.nav-link \{[^}]*font-size: 10px;/);
    assert.match(compact, /\.social-btn \{[^}]*width: 34px;[^}]*height: 34px;/);
    assert.doesNotMatch(css.slice(0, css.indexOf('@media(max-width:760px)')), /\.site-header \{[^}]*height: 106px;/);
});

test('footer removes About and moves the manifesto rabbit there only on mobile', async () => {
    const [html, css] = await Promise.all([read('index.html'), read('styles.css')]);
    assert.doesNotMatch(html, /footer-about/);
    assert.match(html, /class="footer-rabbit rabbit-link" href="#manifesto" data-view="manifesto"/);
    assert.match(css, /\.page-footer \.footer-rabbit \{ display: none; \}/);
    const mobile = css.slice(css.indexOf('/* Keep the complete navigation while giving mobile screens more room for music. */'));
    assert.match(mobile, /\.main-nav \.rabbit-link \{ display: none; \}/);
    assert.match(mobile, /\.page-footer \.footer-rabbit \{[^}]*display: inline-flex;/);
});

test('CARDÚ banner stacks its genre and slogan on desktop too', async () => {
    const css = await read('styles.css');
    assert.match(css, /\.collection-copy p \{ display: block; font-size: 12px; \}/);
    assert.match(css, /\.collection-copy \.collection-genres \{ margin: 0 0 2px; font-size: 12px; \}/);
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

test('expanded waveform supports timed comments without toggling playback in its lower zone', async () => {
    const [html, source, sets] = await Promise.all([read('index.html'), read('js/detail-waveform.js'), read('js/sets.js')]);
    assert.match(html, /id="comment-body"[^>]*maxlength="280"[^>]*placeholder="Comentario en: 0:00"/);
    assert.match(source, /const COMMENT_ZONE_START = \.68;/);
    assert.match(source, /pointer\.commenting/);
    assert.match(source, /new CustomEvent\('ncc:comment-position'/);
    assert.match(sets, /placeholder = `Comentario en: \$\{formatTime\(seconds\)\}`/);
});

test('expanded waveform normalizes and smooths peaks, clusters comments and animates loading', async () => {
    const source = await read('js/detail-waveform.js');
    assert.match(source, /const preparePeaks = source =>/);
    assert.match(source, /COMMENT_CLUSTER_DISTANCE/);
    assert.match(source, /function drawLoading/);
    assert.match(source, /requestAnimationFrame\(animateLoading\)/);
});

test('waveform hover keeps time compact and reveals complete comments above the controls', async () => {
    const [css, source] = await Promise.all([read('styles.css'), read('js/detail-waveform.js')]);
    assert.match(css, /\.waveform-hover-time \{[^}]*padding: 2px 4px;[^}]*font-size: 8px;/);
    assert.match(css, /\.waveform-comment-markers \{[^}]*z-index: 5;/);
    assert.match(css, /\.waveform-comment-marker \{[^}]*width: 32px;[^}]*height: 32px;/);
    assert.match(css, /\.waveform-comment-bubble-body \{[^}]*overflow-wrap: anywhere;[^}]*white-space: normal;/);
    assert.match(source, /line\.className = 'waveform-comment-line'/);
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

test('expanded player leaves the complete desktop header visible and fills the mobile viewport', async () => {
    const css = await read('styles.css');
    assert.match(css, /:root \{[^}]*--expanded-player-header-offset: 100px;/);
    assert.match(css, /\.now-player \{[^}]*height: calc\(100dvh - var\(--expanded-player-header-offset\)\);/);
    assert.match(css, /\.now-player-backdrop \{[^}]*inset: 0 0 calc\(100dvh - var\(--expanded-player-header-offset\)\) 0;/);
    assert.match(css, /@media \(min-width: 761px\) and \(max-width: 1200px\) \{[^]*:root \{ --expanded-player-header-offset: 182px; \}/);
    assert.match(css, /@media \(max-width: 760px\) \{[^]*\.now-player \{[^}]*height: 100dvh;/);
});

test('expanded artwork sits in a compact horizontal stage above the waveform', async () => {
    const css = await read('styles.css');
    assert.match(css, /\.expanded-player-visual \{[^}]*flex-direction: column;/);
    assert.match(css, /\.expanded-skull-media \{[^}]*order: -1;[^}]*width: 100%;[^}]*height: clamp\(210px,30dvh,270px\);/);
    assert.match(css, /\.expanded-skull-media img, \.expanded-skull-media video \{[^}]*position: absolute;[^}]*top: 50%;[^}]*left: 50%;[^}]*width: calc\(100% - clamp\(12px,2vw,22px\)\);[^}]*height: calc\(100% - clamp\(12px,2vw,22px\)\);[^}]*transform: translate\(-50%,-50%\);[^}]*object-fit: contain;[^}]*object-position: center;/);
    assert.doesNotMatch(css, /\.expanded-player-visual \{[^}]*grid-template-columns:/);
});

test('expanded player close control stays compact', async () => {
    const css = await read('styles.css');
    assert.match(css, /\.now-player-close \{[^}]*width: 36px;[^}]*height: 36px;[^}]*margin: 0 4px -36px auto;/);
    assert.match(css, /\.now-player-close:focus, \.now-player-close:focus-visible \{ outline: none; box-shadow: none; \}/);
    assert.match(css, /\.now-player-close \.icon \{ width: 15px; height: 15px; \}/);
    assert.match(css, /\.waveform-community-card \{ margin-top: 0;/);
});

test('expanded player reveals the beginning of the tracklist sooner', async () => {
    const [html, sets, css] = await Promise.all([read('index.html'), read('js/sets.js'), read('styles.css')]);
    assert.match(css, /\.waveform-community-card \.detail-waveform canvas \{ height: clamp\(122px,17dvh,144px\); \}/);
    assert.match(css, /\.now-player-tracklist \{ margin-top: 10px; padding-top: 10px;/);
    assert.match(css, /\.now-player-tracklist h3 \{ margin: 0 0 8px;/);
    assert.match(css, /\.now-player-tracklist li \{ padding: 3px 0 3px 8px; \}/);
    assert.match(html, /id="tracklist-scroll"[^>]*aria-label="Mostrar los temas del tracklist"[^>]*>TRACKLIST<\/button>/);
    assert.match(css, /\.tracklist-scroll \{[^}]*padding: 0;[^}]*background: transparent;[^}]*cursor: pointer;/);
    assert.match(sets, /\$\('tracklist-scroll'\)\.addEventListener\('click',[^]*?\$\('expanded-tracklist-title'\)\.scrollIntoView\(\{[^]*?behavior: matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches \? 'auto' : 'smooth',[^]*?block: 'start'/);
});

test('mobile expanded player relies on the swipe handle instead of a close button', async () => {
    const css = await read('styles.css');
    assert.match(css, /@media \(max-width: 760px\) \{[^]*\.now-player-close \{ display: none; \}/);
    assert.match(css, /@media \(max-width: 760px\) \{[^]*\.now-player::before \{[^}]*width: 42px;[^}]*height: 4px;/);
});

test('mobile comment row stays on one compact line and leaves the tracklist heading visible', async () => {
    const css = await read('styles.css');
    assert.match(css, /@media \(max-width: 760px\) \{[^]*\.waveform-community-card \.detail-waveform canvas \{ height: clamp\(118px,19dvh,140px\); \}/);
    assert.match(css, /@media \(max-width: 760px\) \{[^]*\.waveform-action-row \.waveform-inline-form textarea \{[^}]*min-height: 26px;[^}]*max-height: 26px;[^}]*white-space: nowrap;/);
    assert.match(css, /@media \(max-width: 760px\) \{[^]*\.waveform-action-row \.waveform-inline-form \.comment-send \{[^}]*width: 26px;[^}]*min-height: 26px;/);
    assert.match(css, /@media \(max-width: 760px\) \{[^]*\.community-toggle \{[^}]*min-height: 34px;/);
    assert.match(css, /@media \(max-width: 760px\) \{[^]*\.waveform-action-row \.waveform-inline-form \.comment-send \{[^}]*align-self: center;[^}]*height: 26px;[^}]*margin: 0;/);
});

test('user and timed comment fields share the compact action row', async () => {
    const [html, css] = await Promise.all([read('index.html'), read('styles.css')]);
    const actions = html.slice(html.indexOf('<div class="waveform-action-row">'), html.indexOf('<button type="button" class="community-toggle"'));
    assert.ok(actions.indexOf('class="comment-user-compact"') < actions.indexOf('id="comment-form"'));
    assert.match(css, /\.comment-user-compact \{[^}]*flex: 0 1 340px;[^}]*max-width: 360px;/);
    assert.match(css, /\.waveform-inline-form \{[^}]*flex: 1 1 auto;/);
    assert.doesNotMatch(html, /Comentarios vinculados al tiempo/);
    assert.equal((html.match(/id="comment-name"/g) || []).length, 1);
    assert.equal((html.match(/id="comment-count"/g) || []).length, 1);
});

test('Freaks Comments uses one toggle heading with its count beside the label', async () => {
    const [html, sets] = await Promise.all([read('index.html'), read('js/sets.js')]);
    assert.match(html, /class="community-toggle-label">FREAKS COMMENTS <span id="community-toggle-count">0<\/span>/);
    assert.equal((html.match(/FREAKS COMMENTS/g) || []).length, 2);
    assert.match(html, /id="community-panel" aria-label="FREAKS COMMENTS"/);
    assert.doesNotMatch(html, /id="community-title"|class="community-heading"/);
    assert.doesNotMatch(sets, /community-title/);
});

test('mobile expanded player covers the complete viewport', async () => {
    const css = await read('styles.css');
    assert.match(css, /@media \(max-width: 760px\) \{[^]*:root:has\(body\.player-expanded\) \{ scrollbar-gutter: auto; \}/);
    assert.match(css, /@media \(max-width: 760px\) \{[^]*\.now-player \{[^}]*inset: 0;[^}]*width: 100vw;[^}]*height: 100dvh;/);
});

test('expanded actions place likes after comments and align link copying with social destinations', async () => {
    const [html, sets, css] = await Promise.all([read('index.html'), read('js/sets.js'), read('styles.css')]);
    const actions = html.slice(html.indexOf('<div class="waveform-action-row">'), html.indexOf('<button type="button" class="community-toggle"'));
    assert.ok(actions.indexOf('id="comment-form"') < actions.indexOf('id="expanded-like"'));
    assert.ok(actions.indexOf('id="expanded-like"') < actions.indexOf('id="expanded-share"'));
    assert.doesNotMatch(actions, /expanded-copy-link/);
    assert.doesNotMatch(sets, /share-url|copySetLink|expanded-copy-link/);
    assert.match(sets, /el\('button', 'destination-choice share-copy-choice'\)/);
    assert.match(sets, /copyIcon\.innerHTML = icon\('link'\)/);
    assert.match(sets, /destinations\.append\(copy\)/);
    assert.doesNotMatch(sets, /share-link-row|copyLabel/);
    assert.match(css, /\.destination-grid \{[^}]*grid-template-columns: repeat\(6,minmax\(0,1fr\)\);/);
    assert.match(css, /\.share-copy-mark \{[^}]*background: var\(--text\);/);
});

test('expanded comments omit fire reactions and use a smaller compact label', async () => {
    const [html, sets, css] = await Promise.all([read('index.html'), read('js/sets.js'), read('styles.css')]);
    assert.doesNotMatch(html, /community-fire|fire-reaction|🔥/);
    assert.doesNotMatch(sets, /community-fire|toggleFire|fireReactions|pendingFire|ncc-fire-reactions/);
    assert.doesNotMatch(css, /\.fire-reaction/);
    assert.match(css, /\.community-toggle \{[^}]*font-size: 10px;[^}]*letter-spacing: \.08em;/);
});

test('mobile enlarges the skull while closing the gap before tracklist', async () => {
    const css = await read('styles.css');
    assert.match(css, /@media \(max-width: 760px\) \{[^]*\.expanded-skull-media \{ height: clamp\(150px,44vw,190px\); \}/);
    assert.match(css, /@media \(max-width: 760px\) \{[^]*\.now-player-tracklist \{ margin-top: 4px; padding-top: 6px; \}/);
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
    assert.match(css, /\.player-dock \.play-button \{ width: 48px; height: 48px; \}/);
});

test('mini player controls use the monochrome brush language with clear hierarchy', async () => {
    const [css, worker, brush] = await Promise.all([
        read('styles.css'),
        read('service-worker.js'),
        stat(new URL('../assets/player-control-brush.png', import.meta.url))
    ]);
    assert.match(css, /\.play-button \{[^}]*width: 46px;[^}]*height: 46px;[^}]*background: transparent;/);
    assert.match(css, /\.play-button::before \{[^}]*player-control-brush\.png\?v=20260923[^}]*mask:/);
    assert.match(css, /\.play-button::after \{[^}]*inset: 5px;[^}]*border: 3px solid #090a0b;[^}]*border-radius: 48% 52% 47% 53%;/);
    assert.match(css, /\.play-button \.icon \{[^}]*width: 27px;[^}]*height: 27px;[^}]*transform: none;/);
    assert.match(css, /\.track-play \{[^}]*width: 40px;[^}]*height: 40px;[^}]*background: transparent;[^}]*border: 0;/);
    assert.match(css, /\.track-play::after \{[^}]*inset: 4px;[^}]*border: 2px solid #090a0b;/);
    assert.match(css, /\.expanded-skull-control \{[^}]*width: 44px;[^}]*height: 44px;[^}]*background: transparent;[^}]*border: 0;/);
    assert.match(css, /\.expanded-waveform \.waveform-play \{[^}]*width: 62px;[^}]*height: 62px;[^}]*background: transparent;[^}]*border: 0;/);
    assert.match(css, /body\[data-playing=true\] \.play-button::before \{ background: var\(--accent\); \}/);
    assert.match(css, /\.transport-buttons \.icon-button \{[^}]*width: 40px;[^}]*height: 40px;[^}]*border-radius: 50%;/);
    assert.match(css, /\.player-dock \.progress-control input \{[^}]*height: 4px;[^}]*var\(--accent\) var\(--progress\)/);
    assert.match(css, /\.transport-buttons \.icon-button:focus-visible, \.play-button:focus-visible \{ outline: none;[^}]*box-shadow:/);
    assert.match(worker, /player-control-brush\.png\?v=20260923/);
    assert.ok(brush.size < 60000);
});

test('selecting another set while audio plays previews it in expanded player instead of opening its detail page', async () => {
    const player = await read('js/gdrive-player.js');
    const preview = player.slice(player.indexOf('const playAndExpandSelectedTrack'), player.indexOf("number.addEventListener('click'"));
    assert.match(preview, /previewTrackInExpandedPlayer\(playlist\.id, index, track, trigger\)/);
    assert.doesNotMatch(preview, /window\.NCCSets\.open\(track\)|window\.NCCSets\.collapse\(\)/);
    const previewHelper = player.slice(player.indexOf('function previewTrackInExpandedPlayer'), player.indexOf('function togglePlay()'));
    assert.match(previewHelper, /window\.NCCSets\?\.expand\(trigger, track\)/);
    assert.doesNotMatch(previewHelper, /window\.NCCSets\.open\(track\)|window\.NCCSets\.collapse\(\)/);
    const activeRows = player.slice(player.indexOf('function syncActiveRows()'), player.indexOf('function syncPlaybackUI()'));
    assert.match(activeRows, /const action = 'Abrir reproductor ampliado'/);
    assert.doesNotMatch(activeRows, /Abrir ficha/);
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
