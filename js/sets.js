// Shared set details, administration and social actions; one persistent audio element.
(() => {
    const api = '/api';
    let admin = false, adminTracks = [], detailTrack = null, editorTrack = null, shareTrack = null;
    let socialLikes = new Set(), pendingLikes = new Set();
    try { socialLikes = new Set(JSON.parse(localStorage.getItem('ncc-public-likes-v1') || '[]')); } catch {}
    const el = (tag, className, text) => {
        const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
    };
    const allTracks = () => playerState.playlists.flatMap(p => p.tracks);
    const setURL = track => new URL('/set/' + track.slug, 'https://ncc.ar').href;
    async function request(path, options = {}) {
        const response = await fetch(api + path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(20000) });
        let data; try { data = await response.json(); } catch { throw new Error('El servicio todavía no está disponible.'); }
        if (!response.ok) throw new Error(data.error || 'No pudimos completar la operación.');
        return data;
    }
    function action(label, symbol, handler) {
        const button = el('button', 'track-action'); button.type = 'button'; button.setAttribute('aria-label', label); button.title = label;
        button.innerHTML = icon(symbol); button.addEventListener('click', handler); return button;
    }
    function likeButton(track) {
        const button = action('Me gusta: ' + track.name, 'heart', () => toggleLike(track));
        button.dataset.likeId = track.id || ''; button.setAttribute('aria-pressed', String(socialLikes.has(track.id)));
        button.disabled = !track.id || pendingLikes.has(track.id);
        const count = el('span', 'like-count', track.likes ?? '—'); button.append(count); return button;
    }
    async function toggleLike(track) {
        if (!track?.id || pendingLikes.has(track.id)) return;
        let visitor;
        try {
            visitor = localStorage.getItem('ncc-like-visitor');
            if (!visitor) { visitor = crypto.randomUUID(); localStorage.setItem('ncc-like-visitor', visitor); }
        } catch { showMessage('El navegador no permite guardar tu like.'); return; }
        const liked = !socialLikes.has(track.id); pendingLikes.add(track.id); syncSocial();
        try {
            const result = await request(`/sets/${track.id}/likes`, { method: 'PUT', body: JSON.stringify({ visitor, liked }) });
            if (result.liked) socialLikes.add(track.id); else socialLikes.delete(track.id);
            for (const item of [...allTracks(), ...adminTracks, detailTrack].filter(Boolean)) if (item.id === track.id) item.likes = result.count;
            try { localStorage.setItem('ncc-public-likes-v1', JSON.stringify([...socialLikes])); } catch {}
        } catch (error) { showMessage(error.message); }
        finally { pendingLikes.delete(track.id); syncSocial(); }
    }
    function syncSocial() {
        const track = currentTrack();
        const playerLike = $('player-like');
        if (playerLike) {
            playerLike.dataset.likeId = track?.id || ''; playerLike.innerHTML = icon('heart') + '<span class="like-count"></span>';
            playerLike.querySelector('span').textContent = track?.likes ?? '—';
            playerLike.title = 'Me gusta'; playerLike.disabled = !track?.id || pendingLikes.has(track.id);
            playerLike.setAttribute('aria-pressed', String(socialLikes.has(track?.id)));
        }
        document.querySelectorAll('[data-like-id]').forEach(button => {
            const item = [...allTracks(), ...adminTracks, detailTrack].filter(Boolean).find(item => item.id === button.dataset.likeId);
            button.disabled = !item?.id || pendingLikes.has(item.id);
            button.setAttribute('aria-pressed', String(socialLikes.has(item?.id)));
            const count = button.querySelector('.like-count'); if (count) count.textContent = item?.likes ?? '—';
        });
        if ($('player-share')) $('player-share').disabled = !track?.slug;
        if (track?.slug) $('track-name').href = '/set/' + track.slug;
        else $('track-name').removeAttribute('href');
        document.querySelectorAll('[data-play-set]').forEach(button => {
            const active = track?.id === button.dataset.playSet && !audio.paused;
            const item = [...allTracks(), ...adminTracks].find(item => item.id === button.dataset.playSet);
            button.setAttribute('aria-label', (active ? 'Pausar ' : 'Reproducir ') + (item?.name || 'set'));
            button.innerHTML = icon(active ? 'pause' : 'play') + `<span>${active ? 'Pausar' : 'Reproducir'}</span>`;
        });
    }
    const originalActions = createTrackActions;
    createTrackActions = track => {
        const actions = originalActions(track);
        actions.querySelector('[data-preference="likes"]').replaceWith(likeButton(track));
        const share = action('Compartir ' + track.name, 'share', () => shareSet(track)); share.disabled = !track.slug;
        actions.append(share); return actions;
    };
    const originalPreferences = syncPlayerPreferences;
    syncPlayerPreferences = () => { originalPreferences(); syncSocial(); };
    const originalSelection = selectTrack;
    selectTrack = (...args) => {
        const selected = originalSelection(...args);
        if (detailTrack && selected?.key !== detailTrack.key) {
            $('waveform-panel').hidden = true;
            const load = document.querySelector('.waveform-load'); if (load) load.hidden = false;
        }
        return selected;
    };
    const originalSync = syncPlaybackUI;
    syncPlaybackUI = () => { originalSync(); syncSocial(); };
    const originalCatalogue = loadCatalogue;
    let catalogueRequest = 0;
    loadCatalogue = async () => {
        const requestId = ++catalogueRequest;
        $('loading-initial').hidden = false;
        $('loading-initial').textContent = 'Cargando sets…';
        try {
            const data = await request('/sets');
            if (!Array.isArray(data.tracks)) throw new Error('Invalid catalogue');
            if (requestId !== catalogueRequest) return;
            const selected = currentTrack();
            playerState.playlists = enabledPlaylistSources.map(source => ({ ...source, error: '', tracks: normalizeR2Playlist({ tracks: data.tracks.filter(track => track.key.startsWith(source.prefix)) }, source) }));
            playerState.loaded = true;
            const playlist = getPlaylistById(playerState.activePlaylistId);
            const index = playlist?.tracks.findIndex(track => track.key === selected?.key) ?? -1;
            if (selected && index >= 0) {
                playerState.currentTrackIndex = index;
                $('track-name').textContent = playlist.tracks[index].name;
                $('track-artist').textContent = playlist.tracks[index].artist;
            } else {
                const first = playlist?.tracks.length ? playlist : playerState.playlists.find(item => item.tracks.length);
                if (first) selectTrack(first.id, 0);
                else { audio.pause(); audio.removeAttribute('src'); audio.load(); playerState.isPlaying = false; $('track-name').textContent = 'Elegí un set'; $('track-name').removeAttribute('href'); }
            }
            syncPlaybackUI(); loadPlaylistDurations();
        } catch {
            // Keep an already playing catalogue intact during a transient outage.
            if (requestId !== catalogueRequest) return;
            if (!playerState.loaded) await originalCatalogue();
            else showMessage('No pudimos actualizar los sets. Volvé a intentar.');
        } finally {
            if (requestId === catalogueRequest) { $('loading-initial').hidden = true; renderCatalogue(); renderTracklists(); route(); syncSocial(); }
        }
    };
    function navigate(path) { history.pushState({}, '', path); route(); window.scrollTo({ top: 0 }); }
    function openSet(track) { if (track?.slug) navigate('/set/' + track.slug); }
    function playSet(track) {
        const current = currentTrack();
        if (current?.key === track.key) { togglePlay(); return; }
        const playlist = playerState.playlists.find(p => p.tracks.some(item => item.key === track.key));
        if (playlist) playTrack(playlist.id, playlist.tracks.findIndex(item => item.key === track.key));
    }
    function buildCard(track, detailed = false) {
        const card = el('article', 'set-card');
        const heading = el('h2');
        const link = el('a', 'set-title-link', track.name); link.href = '/set/' + track.slug;
        link.addEventListener('click', event => { event.preventDefault(); openSet(track); }); heading.append(link); card.append(heading);
        if (track.date) { const date = el('time', 'set-date', track.date.split('-').reverse().join('.')); date.dateTime = track.date; card.append(date); }
        const label = el('h3', 'tracklist-label', 'TRACKLIST'); card.append(label);
        if (track.tracklist?.length) {
            const list = el('ol', 'set-tracklist'); track.tracklist.forEach(line => list.append(el('li', '', line.replace(/^\s*\d+[.)\-]?\s+/, '')))); card.append(list);
        } else card.append(el('p', 'empty-tracklist', 'Todavía no hay un tracklist publicado para este set.'));
        const actions = el('div', 'set-card-actions');
        const play = action('Reproducir ' + track.name, 'play', () => playSet(track)); play.dataset.playSet = track.id; play.classList.add('set-play'); play.append(el('span', '', 'Reproducir')); play.disabled = !track.published || !allTracks().some(item => item.key === track.key);
        actions.append(play, likeButton(track), action('Compartir ' + track.name, 'share', () => shareSet(track)));
        if (admin) { const edit = el('button', 'edit-set', 'Editar'); edit.type = 'button'; edit.addEventListener('click', () => editSet(track)); actions.append(edit); }
        if (!track.published) card.append(el('p', 'draft-label', 'No publicado'));
        card.append(actions);
        if (detailed) {
            const host = el('div', 'detail-waveform'); host.id = 'detail-waveform-host';
            const generate = el('button', 'waveform-load', track.peaks?.length ? 'Mostrar forma de onda' : 'Cargar forma de onda');
            generate.type = 'button'; generate.addEventListener('click', () => showDetailWaveform(track, generate));
            host.append(generate); card.append(host);
        }
        return card;
    }
    function parkWaveform() {
        const panel = $('waveform-panel'); panel.hidden = true; document.querySelector('.player-dock').append(panel);
        waveformState.controller?.abort(); waveformState.requestId++;
    }
    async function showDetailWaveform(track, button) {
        if (currentTrack()?.key !== track.key) {
            const playlist = playerState.playlists.find(p => p.tracks.some(item => item.key === track.key));
            if (!playlist) return;
            selectTrack(playlist.id, playlist.tracks.findIndex(item => item.key === track.key));
        }
        const panel = $('waveform-panel'); $('detail-waveform-host').append(panel); panel.hidden = false;
        button.hidden = true; resetWaveform(audio); await loadWaveform(track, audio); updateProgress();
    }
    function renderTracklists() {
        const root = $('tracklists-section'); if (!root) return;
        root.replaceChildren();
        if (admin) {
            const tools = el('div', 'admin-toolbar'); tools.append(el('span', '', 'Administración'));
            const refresh = el('button', 'edit-set', 'Actualizar audios'); refresh.type = 'button'; refresh.addEventListener('click', loadAdmin);
            const backup = el('button', 'edit-set', 'Exportar contenido'); backup.type = 'button'; backup.addEventListener('click', exportSets);
            tools.append(refresh, backup);
            for (const [key, name] of [['sets', 'Sets'], ['about', 'About'], ['tour', 'Tour Dates']]) {
                const edit = el('button', 'edit-set', 'Editar ' + name); edit.type = 'button'; edit.addEventListener('click', () => window.NCCContent?.edit(key)); tools.append(edit);
            }
            root.append(tools);
        }
        const tracks = admin ? adminTracks : allTracks().filter(track => track.playlistId !== 'radio');
        if (!tracks.length) root.append(el('p', 'empty-state', playerState.loaded ? 'Todavía no hay sets disponibles.' : 'Cargando sets…'));
        tracks.forEach(track => root.append(buildCard(track)));
        syncSocial();
    }
    const originalRoute = route;
    route = () => {
        parkWaveform(); originalRoute();
        const root = $('set-detail-section'); if (!root) return;
        const match = location.pathname.match(/^\/set\/([^/]+)\/?$/);
        root.hidden = !match; detailTrack = null;
        if (!match) { document.title = 'NCC Music | Lossless DJ Mixes by Nicolás Cardú'; return; }
        ['radio-feature','collections-section','sets-section','tracklists-section','about-section','tour-section','manifesto-section','mix-signature','page-quality','collection-filters','favorites-filter'].forEach(id => $(id).hidden = true);
        $('page-title').textContent = 'SET'; root.replaceChildren();
        detailTrack = allTracks().find(track => track.slug === match[1]);
        const back = el('a', 'back-to-sets', '← Tracklists'); back.href = '/#tracklists'; back.addEventListener('click', event => { event.preventDefault(); navigate('/#tracklists'); }); root.append(back);
        if (!detailTrack) { root.append(el('p', 'empty-state', playerState.loaded ? 'Este set no existe o no está publicado.' : 'Cargando set…')); return; }
        root.append(buildCard(detailTrack, true)); document.title = detailTrack.name + ' | NCC Music'; syncSocial();
    };
    function makeDialog(id, title) {
        const dialog = el('dialog', 'set-dialog'); dialog.id = id;
        const header = el('div', 'dialog-heading'); const heading = el('h2', '', title); heading.id = id + '-title';
        dialog.setAttribute('aria-labelledby', heading.id);
        const close = el('button', 'dialog-close', 'Cerrar'); close.type = 'button'; close.addEventListener('click', () => dialog.close()); header.append(heading, close); dialog.append(header); document.body.append(dialog); return dialog;
    }
    async function shareSet(track) {
        if (!track?.slug) { showMessage('El enlace del set todavía no está disponible.'); return; }
        const data = { title: track.name, text: track.name, url: setURL(track) };
        if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
            try { await navigator.share(data); return; } catch (error) { if (error.name === 'AbortError') return; }
        }
        shareTrack = track;
        const dialog = $('share-dialog'); dialog.querySelector('.share-links').replaceChildren();
        for (const [name, url] of [
            ['WhatsApp', 'https://wa.me/?text=' + encodeURIComponent(data.title + ' ' + data.url)],
            ['Telegram', 'https://t.me/share/url?url=' + encodeURIComponent(data.url) + '&text=' + encodeURIComponent(data.title)],
            ['Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(data.url)]
        ]) { const link = el('a', 'share-option', name); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; dialog.querySelector('.share-links').append(link); }
        $('share-url').value = data.url; $('share-status').textContent = ''; dialog.showModal();
    }
    async function loadAdmin() {
        try {
            const result = await request('/admin/sets');
            admin = true; adminTracks = result.tracks.map(track => {
                const source = playlistSources.find(source => track.key.startsWith(source.prefix));
                return normalizeR2Playlist({ tracks: [track] }, source)[0];
            }).filter(Boolean);
            renderTracklists(); route();
        } catch (error) { showMessage(error.message); }
    }
    function editSet(track) {
        editorTrack = { ...(adminTracks.find(item => item.id === track.id) || track) };
        $('edit-title').value = editorTrack.name; $('edit-date').value = editorTrack.date || '';
        $('edit-tracklist').value = editorTrack.tracklist.join('\n'); $('edit-published').checked = editorTrack.published;
        $('edit-audio').textContent = editorTrack.key; $('edit-status').textContent = ''; $('edit-dialog').showModal();
    }
    async function saveSet(event) {
        event.preventDefault(); if (!editorTrack) return;
        const button = $('save-set'); button.disabled = true; $('edit-status').textContent = 'Guardando…';
        try {
            await request('/admin/sets/' + editorTrack.id, { method: 'PUT', body: JSON.stringify({ title: $('edit-title').value, date: $('edit-date').value, tracklist: $('edit-tracklist').value.split('\n').map(line => line.trim()).filter(Boolean), published: $('edit-published').checked, version: editorTrack.version, peaks: editorTrack.peaks }) });
            $('edit-dialog').close(); await loadCatalogue(); await loadAdmin(); showMessage('Set guardado.');
        } catch (error) { $('edit-status').textContent = error.message; }
        finally { button.disabled = false; }
    }
    async function exportSets() {
        try {
            const data = await request('/admin/export'); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            const link = el('a'); link.href = url; link.download = 'ncc-contenido-' + new Date().toISOString().slice(0, 10) + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { showMessage(error.message); }
    }
    document.addEventListener('DOMContentLoaded', () => {
        const share = action('Compartir set actual', 'share', () => shareSet(currentTrack())); share.id = 'player-share'; document.querySelector('.player-preferences').append(share);
        $('track-name').addEventListener('click', event => { event.preventDefault(); openSet(currentTrack()); });
        document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
            if (link.id === 'track-name' || link.classList.contains('skip-link')) return;
            event.preventDefault(); navigate('/' + link.getAttribute('href'));
        }));
        window.addEventListener('popstate', route);
        const sharing = makeDialog('share-dialog', 'Compartir set'); sharing.append(el('div', 'share-links'));
        const label = el('label', '', 'Enlace del set'); label.htmlFor = 'share-url'; sharing.append(label);
        const input = el('input'); input.id = 'share-url'; input.readOnly = true; sharing.append(input);
        const copy = el('button', 'primary-button', 'Copiar enlace'); copy.type = 'button'; copy.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(setURL(shareTrack)); $('share-status').textContent = 'Enlace copiado.'; }
            catch { input.focus(); input.select(); $('share-status').textContent = 'Seleccioná y copiá el enlace.'; }
        }); sharing.append(copy); const status = el('p'); status.id = 'share-status'; status.setAttribute('role', 'status'); sharing.append(status);
        const editor = makeDialog('edit-dialog', 'Editar set'); const form = el('form', 'set-form');
        form.innerHTML = '<label for="edit-title">Nombre del set</label><input id="edit-title" required maxlength="240"><label for="edit-date">Fecha</label><input id="edit-date" type="date"><label for="edit-tracklist">Tracklist · una pista por línea</label><textarea id="edit-tracklist" rows="12"></textarea><p class="audio-reference" id="edit-audio"></p><label class="published-label"><input type="checkbox" id="edit-published"> Publicado</label><p id="edit-status" role="status"></p><button id="save-set" class="primary-button" type="submit">Guardar</button>';
        const prepare = el('button', 'waveform-load', 'Preparar waveform'); prepare.type = 'button';
        prepare.addEventListener('click', async () => {
            if (!editorTrack) return;
            const target = editorTrack; prepare.disabled = true; $('save-set').disabled = true;
            try {
                if (target.format !== 'FLAC') throw new Error('La preparación automática está disponible para audios FLAC.');
                target.peaks = await analyzeFLAC(target, undefined, progress => { $('edit-status').textContent = `Preparando waveform… ${progress}%`; });
                $('edit-status').textContent = 'Waveform listo. Tocá Guardar para publicarlo con el set.';
            } catch (error) { $('edit-status').textContent = error.message; }
            finally { prepare.disabled = false; $('save-set').disabled = false; }
        });
        form.insertBefore(prepare, form.querySelector('#save-set')); form.addEventListener('submit', saveSet); editor.append(form);
        $('admin-entry').addEventListener('click', async () => {
            if (admin) { navigate('/#tracklists'); return; }
            try { await request('/admin/session'); await loadAdmin(); navigate('/#tracklists'); }
            catch { location.href = api + '/admin/login'; }
        });
        request('/admin/session').then(() => loadAdmin()).catch(() => {});
        window.addEventListener('storage', event => { if (event.key === 'ncc-public-likes-v1') { try { socialLikes = new Set(JSON.parse(event.newValue || '[]')); syncSocial(); } catch {} } });
    });
    window.NCCSets = { open: openSet, toggleLike };
})();
