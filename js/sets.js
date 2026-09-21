// Shared set details, administration and social actions; one persistent audio element.
(() => {
    const api = '/api';
    let admin = false, adminTracks = [], archiveTracks = [], detailTrack = null, editorTrack = null, shareTrack = null;
    let tracklistQuery = '', nowPlayerOpen = false, nowPlayerTrackKey = '', nowPlayerTrack = null, playerReturnFocus = null;
    let socialLikes = new Set(), pendingLikes = new Set();
    try { socialLikes = new Set(JSON.parse(localStorage.getItem('ncc-public-likes-v1') || '[]')); } catch {}
    const el = (tag, className, text) => {
        const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
    };
    const allTracks = () => playerState.playlists.flatMap(p => p.tracks);
    const allKnownTracks = () => admin ? adminTracks : archiveTracks.length ? archiveTracks : allTracks().filter(track => track.playlistId !== 'radio');
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
            const item = [...allTracks(), ...archiveTracks, ...adminTracks, detailTrack].filter(Boolean).find(item => item.id === button.dataset.likeId);
            button.disabled = !item?.id || pendingLikes.has(item.id);
            button.setAttribute('aria-pressed', String(socialLikes.has(item?.id)));
            const count = button.querySelector('.like-count'); if (count) count.textContent = item?.likes ?? '—';
        });
        if ($('player-share')) $('player-share').disabled = !track?.slug;
        $('track-name').disabled = !track;
        $('track-name').setAttribute('aria-label', track ? `Abrir reproductor ampliado: ${track.name}` : 'Elegí un set para abrir el reproductor');
        document.querySelectorAll('[data-play-set]').forEach(button => {
            const active = track?.id === button.dataset.playSet && !audio.paused;
            const item = [...allTracks(), ...archiveTracks, ...adminTracks].find(item => item.id === button.dataset.playSet);
            button.setAttribute('aria-label', (active ? 'Pausar ' : 'Reproducir ') + (item?.name || 'set'));
            button.innerHTML = icon(active ? 'pause' : 'play') + `<span>${item?.available === false ? 'Audio no disponible' : active ? 'Pausar' : 'Reproducir'}</span>`;
        });
        syncNowPlayer();
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
            const normalized = enabledPlaylistSources.map(source => ({ source, tracks: normalizeR2Playlist({ tracks: data.tracks.filter(track => track.key.startsWith(source.prefix)) }, source) }));
            archiveTracks = normalized.flatMap(group => group.tracks).filter(track => track.playlistId !== 'radio');
            playerState.playlists = normalized.map(group => ({ ...group.source, error: '', tracks: group.tracks.filter(track => track.available) }));
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
                else { audio.pause(); audio.removeAttribute('src'); audio.load(); playerState.isPlaying = false; $('track-name').textContent = 'Elegí un set'; }
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
    function navigate(path, state = {}) { history.pushState(state, '', path); route(); window.scrollTo({ top: 0 }); }
    function openSet(track, focusIndex = null) {
        if (!track?.slug) return;
        const fromTracklists = location.hash === '#tracklists';
        if (fromTracklists) history.replaceState({ ...(history.state || {}), tracklistQuery, tracklistScroll: window.scrollY }, '');
        navigate('/set/' + track.slug, { fromTracklists, tracklistFocus: focusIndex === null ? null : { slug: track.slug, index: focusIndex, query: tracklistQuery } });
    }
    function playSet(track) {
        if (!track?.available) { showMessage('El audio de este set ya no está disponible; su tracklist permanece en el archivo.'); return; }
        const current = currentTrack();
        if (current?.key === track.key) { togglePlay(); return; }
        const playlist = playerState.playlists.find(p => p.tracks.some(item => item.key === track.key));
        if (playlist) playTrack(playlist.id, playlist.tracks.findIndex(item => item.key === track.key));
    }
    function appendHighlighted(parent, text, tokens) {
        if (!tokens?.length) { parent.textContent = text; return; }
        let normalized = '', map = [];
        for (let i = 0; i < text.length; i++) {
            const part = window.NCCTracklistSearch.normalize(text[i]);
            for (const char of part) { normalized += char; map.push(i); }
        }
        const ranges = [];
        for (const token of tokens) {
            let start = 0;
            while ((start = normalized.indexOf(token, start)) >= 0) {
                ranges.push([map[start], map[start + token.length - 1] + 1]); start += token.length;
            }
        }
        ranges.sort((a, b) => a[0] - b[0]);
        const merged = [];
        for (const range of ranges) {
            const last = merged.at(-1);
            if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]); else merged.push(range);
        }
        let cursor = 0;
        for (const [start, end] of merged) {
            if (start > cursor) parent.append(document.createTextNode(text.slice(cursor, start)));
            const mark = el('mark', '', text.slice(start, end)); parent.append(mark); cursor = end;
        }
        if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
    }
    function buildCard(track, detailed = false) {
        const card = el('article', 'set-card');
        const heading = el('h2');
        const link = el('a', 'set-title-link', track.name); link.href = '/set/' + track.slug;
        link.addEventListener('click', event => { event.preventDefault(); openSet(track); }); heading.append(link); card.append(heading);
        if (track.date) { const date = el('time', 'set-date', track.date.split('-').reverse().join('.')); date.dateTime = track.date; card.append(date); }
        if (detailed) {
            const host = el('div', 'detail-waveform'); host.id = 'detail-waveform-host';
            card.append(host);
        }
        const label = el('h3', 'tracklist-label', 'TRACKLIST'); card.append(label);
        if (track.tracklist?.length) {
            const focus = detailed && history.state?.tracklistFocus?.slug === track.slug ? history.state.tracklistFocus : null;
            const tokens = focus?.query ? window.NCCTracklistSearch.search([track], focus.query).tokens : [];
            const list = el('ol', 'set-tracklist'); track.tracklist.forEach((line, index) => {
                const item = el('li'); item.dataset.tracklistIndex = index;
                appendHighlighted(item, line.replace(/^\s*\d+[.)\-]?\s+/, ''), tokens);
                if (focus?.index === index) item.classList.add('tracklist-focus');
                list.append(item);
            }); card.append(list);
        } else card.append(el('p', 'empty-tracklist', 'Todavía no hay un tracklist publicado para este set.'));
        const actions = el('div', 'set-card-actions');
        const play = action('Reproducir ' + track.name, 'play', () => playSet(track)); play.dataset.playSet = track.id; play.classList.add('set-play'); play.append(el('span', '', track.available ? 'Reproducir' : 'Audio no disponible')); play.disabled = !track.published || !track.available || !allTracks().some(item => item.key === track.key);
        if (!detailed) actions.append(play);
        actions.append(likeButton(track), action('Compartir ' + track.name, 'share', () => shareSet(track)));
        if (admin) { const edit = el('button', 'edit-set', 'Editar'); edit.type = 'button'; edit.addEventListener('click', () => editSet(track)); actions.append(edit); }
        if (!track.published) card.append(el('p', 'draft-label', 'No publicado'));
        card.append(actions);
        return card;
    }
    function parkWaveform() { if (!nowPlayerOpen) window.NCCDetailWaveform?.dispose(); }
    function archiveRecord(result, searching) {
        const { track, matches } = result;
        const details = el('details', 'tracklist-record'); details.open = searching;
        const summary = el('summary');
        const heading = el('span', 'tracklist-record-title', track.name);
        const meta = el('span', 'tracklist-record-meta', [track.date ? track.date.split('-').reverse().join('.') : '', searching ? `${matches.length} coincidencia${matches.length === 1 ? '' : 's'}` : `${track.tracklist.length} tracks`, track.available ? '' : 'ARCHIVO'].filter(Boolean).join(' · '));
        summary.append(heading, meta); details.append(summary);
        const body = el('div', 'tracklist-record-body');
        const rows = searching ? matches : track.tracklist.map((text, index) => ({ text, index }));
        if (rows.length) {
            const list = el('ol', 'set-tracklist');
            for (const row of rows) {
                const item = el('li'); item.dataset.tracklistIndex = row.index;
                appendHighlighted(item, row.text.replace(/^\s*\d+[.)\-]?\s+/, ''), searching ? window.NCCTracklistSearch.search([track], tracklistQuery).tokens : []);
                list.append(item);
            }
            body.append(list);
        } else body.append(el('p', 'empty-tracklist', 'Todavía no hay un tracklist publicado para este set.'));
        const actions = el('div', 'set-card-actions');
        const play = action('Reproducir ' + track.name, 'play', () => playSet(track)); play.dataset.playSet = track.id; play.classList.add('set-play'); play.append(el('span', '', track.available ? 'Reproducir set' : 'Audio no disponible')); play.disabled = !track.available;
        const view = el('button', 'track-action', 'Ver ficha'); view.type = 'button'; view.addEventListener('click', () => openSet(track, searching && matches.length ? matches[0].index : null));
        actions.append(play, view); body.append(actions); details.append(body); return details;
    }
    function renderTracklists() {
        const root = $('tracklists-section'); if (!root) return;
        root.replaceChildren();
        if (admin) {
            const tools = el('div', 'admin-toolbar'); tools.append(el('span', '', 'Administración'));
            const refresh = el('button', 'edit-set', 'Actualizar audios'); refresh.type = 'button'; refresh.addEventListener('click', loadAdmin);
            const backup = el('button', 'edit-set', 'Exportar contenido'); backup.type = 'button'; backup.addEventListener('click', exportSets);
            tools.append(refresh, backup);
            for (const [key, name] of [['sets', 'Sets'], ['about', 'About'], ['tour', 'Tour Dates'], ['manifesto', 'Manifesto']]) {
                const edit = el('button', 'edit-set', 'Editar ' + name); edit.type = 'button'; edit.addEventListener('click', () => window.NCCContent?.edit(key)); tools.append(edit);
            }
            root.append(tools);
        }
        const search = el('div', 'tracklist-search');
        const label = el('label', 'sr-only', 'Buscar en Tracklists'); label.htmlFor = 'tracklist-search-input';
        const input = el('input'); input.type = 'search'; input.id = 'tracklist-search-input'; input.placeholder = 'Buscar artista, track, remix o set…'; input.value = tracklistQuery;
        const clear = el('button', 'tracklist-clear', 'Limpiar'); clear.type = 'button'; clear.hidden = !tracklistQuery;
        const status = el('p', 'tracklist-search-status'); status.setAttribute('role', 'status');
        search.append(label, input, clear, status); root.append(search);
        const tracks = allKnownTracks();
        const result = window.NCCTracklistSearch.search(tracks, tracklistQuery);
        const searching = Boolean(result.tokens.length);
        status.textContent = searching ? `${result.matchCount} coincidencia${result.matchCount === 1 ? '' : 's'} en ${result.sets.length} set${result.sets.length === 1 ? '' : 's'}` : `${result.sets.length} tracklist${result.sets.length === 1 ? '' : 's'} publicados`;
        input.addEventListener('input', () => {
            tracklistQuery = input.value;
            history.replaceState({ ...(history.state || {}), tracklistQuery, tracklistScroll: window.scrollY }, '');
            renderTracklists(); const next = $('tracklist-search-input'); next.focus(); next.setSelectionRange(next.value.length, next.value.length);
        });
        clear.addEventListener('click', () => { tracklistQuery = ''; history.replaceState({ ...(history.state || {}), tracklistQuery: '' }, ''); renderTracklists(); $('tracklist-search-input').focus(); });
        if (!tracks.length) root.append(el('p', 'empty-state', playerState.loaded ? 'Todavía no hay tracklists publicados.' : 'Cargando tracklists…'));
        else if (!result.sets.length) root.append(el('p', 'empty-state', 'No encontramos tracks o sets con esa búsqueda.'));
        else { const archive = el('div', 'tracklist-archive'); result.sets.forEach(item => archive.append(archiveRecord(item, searching))); root.append(archive); }
        syncSocial();
    }
    function renderNowPlayer() {
        const track = nowPlayerTrack || currentTrack(); if (!track || !nowPlayerOpen) return;
        nowPlayerTrackKey = track.key;
        $('now-player').setAttribute('aria-label', 'Reproductor ampliado: ' + track.name);
        const list = $('expanded-tracklist'); list.replaceChildren();
        $('expanded-tracklist-empty').hidden = Boolean(track.tracklist?.length);
        for (const line of track.tracklist || []) list.append(el('li', '', line.replace(/^\s*\d+[.)\-]?\s+/, '')));
        $('expanded-like').dataset.likeId = track.id || '';
        $('expanded-waveform').replaceChildren(); window.NCCDetailWaveform.mount(track, $('expanded-waveform'));
        syncNowPlayer();
    }
    function syncNowPlayer() {
        if (!nowPlayerOpen || !$('now-player')) return;
        const track = nowPlayerTrack || currentTrack(); if (!track) { closeNowPlayer(); return; }
        if (track.key !== nowPlayerTrackKey) { renderNowPlayer(); return; }
        const active = currentTrack()?.key === track.key;
        $('expanded-current').textContent = active ? formatTime(audio.currentTime) : '0:00';
        $('expanded-duration').textContent = formatTrackDuration(active ? audio.duration || track.duration : track.duration);
        $('expanded-like').setAttribute('aria-pressed', String(socialLikes.has(track.id)));
        $('expanded-like').disabled = !track.id || pendingLikes.has(track.id);
        $('expanded-like').querySelector('.like-count').textContent = track.likes ?? '—';
    }
    function openNowPlayer(trigger, requestedTrack = null) {
        const track = requestedTrack || currentTrack();
        if (!track) { showMessage('Elegí un set para abrir el reproductor.'); return; }
        nowPlayerTrack = track;
        playerReturnFocus = trigger || document.activeElement; nowPlayerOpen = true;
        $('now-player-backdrop').hidden = false; $('now-player').hidden = false; document.body.classList.add('player-expanded');
        $('expand-player').setAttribute('aria-expanded', 'true'); renderNowPlayer(); $('now-player-close').focus();
    }
    function closeNowPlayer() {
        if (!nowPlayerOpen) return;
        const panel = $('now-player');
        panel.classList.remove('is-dragging'); panel.style.removeProperty('transform'); panel.style.removeProperty('transition');
        $('now-player-backdrop').style.removeProperty('opacity');
        nowPlayerOpen = false; nowPlayerTrackKey = ''; nowPlayerTrack = null; panel.hidden = true; $('now-player-backdrop').hidden = true;
        document.body.classList.remove('player-expanded'); $('expand-player').setAttribute('aria-expanded', 'false');
        window.NCCDetailWaveform.dispose();
        if (detailTrack && $('detail-waveform-host')?.isConnected) window.NCCDetailWaveform.mount(detailTrack, $('detail-waveform-host'));
        playerReturnFocus?.focus?.(); playerReturnFocus = null;
    }
    const originalRoute = route;
    route = () => {
        parkWaveform(); originalRoute();
        const root = $('set-detail-section'); if (!root) return;
        const match = location.pathname.match(/^\/set\/([^/]+)\/?$/);
        root.hidden = !match; detailTrack = null;
        if (!match) {
            document.title = 'NCC Music | Lossless DJ Mixes by Nicolás Cardú';
            if (location.hash === '#tracklists') {
                if (typeof history.state?.tracklistQuery === 'string') tracklistQuery = history.state.tracklistQuery;
                renderTracklists();
                if (Number.isFinite(history.state?.tracklistScroll)) requestAnimationFrame(() => window.scrollTo({ top: history.state.tracklistScroll }));
            }
            return;
        }
        ['radio-feature','collections-section','sets-section','tracklists-section','about-section','tour-section','manifesto-section','mix-signature','page-quality','collection-filters','favorites-filter'].forEach(id => $(id).hidden = true);
        $('page-title').textContent = 'SET'; root.replaceChildren();
        detailTrack = allKnownTracks().find(track => track.slug === match[1]);
        const back = el('a', 'back-to-sets', '← Tracklists'); back.href = '/#tracklists'; back.addEventListener('click', event => { event.preventDefault(); if (history.state?.fromTracklists) history.back(); else navigate('/#tracklists'); }); root.append(back);
        if (!detailTrack) { root.append(el('p', 'empty-state', playerState.loaded ? 'Este set no existe o no está publicado.' : 'Cargando set…')); return; }
        root.append(buildCard(detailTrack, true));
        if (!nowPlayerOpen && detailTrack.available) window.NCCDetailWaveform.mount(detailTrack, $('detail-waveform-host'));
        const focus = root.querySelector('.tracklist-focus'); if (focus) requestAnimationFrame(() => focus.scrollIntoView({ block: 'center' }));
        document.title = detailTrack.name + ' | NCC Music'; syncSocial();
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
        shareTrack = track;
        const dialog = $('share-dialog'); dialog.querySelector('.share-links').replaceChildren();
        for (const [name, url] of [
            ['Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(data.url)],
            ['Instagram', 'https://www.instagram.com/'],
            ['WhatsApp', 'https://wa.me/?text=' + encodeURIComponent(data.title + ' ' + data.url)],
            ['Telegram', 'https://t.me/share/url?url=' + encodeURIComponent(data.url) + '&text=' + encodeURIComponent(data.title)]
        ]) {
            const link = el('a', 'share-option', name); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
            if (name === 'Instagram') link.addEventListener('click', () => {
                $('share-status').textContent = 'Copiá este enlace y pegalo en un mensaje o en el sticker Enlace de Instagram.';
                navigator.clipboard?.writeText(data.url).then(() => {
                    $('share-status').textContent = 'Enlace copiado. Pegalo en un mensaje o en el sticker Enlace de tu historia de Instagram.';
                }).catch(() => {
                    $('share-url').focus(); $('share-url').select(); $('share-status').textContent = 'Copiá este enlace y pegalo en Instagram.';
                });
            });
            dialog.querySelector('.share-links').append(link);
        }
        if (navigator.share) {
            const more = el('button', 'share-option', 'Más opciones…'); more.type = 'button';
            more.addEventListener('click', async () => {
                try { await navigator.share(data); } catch (error) { if (error.name !== 'AbortError') $('share-status').textContent = 'Elegí una red o copiá el enlace.'; }
            }); dialog.querySelector('.share-links').append(more);
        }
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
            if (editorTrack.available && editorTrack.format === 'FLAC' && !editorTrack.peaks?.length) {
                editorTrack.peaks = await analyzeFLAC(editorTrack, undefined, progress => { $('edit-status').textContent = `Preparando waveform… ${progress}%`; });
            }
            $('edit-status').textContent = 'Guardando…';
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
        $('track-name').addEventListener('click', event => openNowPlayer(event.currentTarget));
        $('now-cover').addEventListener('click', event => openNowPlayer(event.currentTarget));
        $('now-cover').addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); openNowPlayer(event.currentTarget); } });
        $('now-info').addEventListener('click', event => { if (!event.target.closest('#track-name')) openNowPlayer(event.currentTarget); });
        $('expand-player').addEventListener('click', event => openNowPlayer(event.currentTarget));
        const miniPlayer = document.querySelector('.player-dock');
        miniPlayer.addEventListener('click', event => {
            if (event.target.closest('.now-info, .now-cover, button, a, input, label, canvas, .waveform-panel')) return;
            openNowPlayer(miniPlayer);
        });
        const expandedPlayer = $('now-player'), expandedBackdrop = $('now-player-backdrop');
        let swipe = null, suppressExpandedClick = false, expandedClickStart = null;
        const resetSwipe = () => {
            if (!swipe) return;
            expandedPlayer.classList.remove('is-dragging');
            expandedPlayer.style.transition = 'transform .2s ease-out';
            expandedPlayer.style.removeProperty('transform');
            expandedBackdrop.style.removeProperty('opacity');
            setTimeout(() => expandedPlayer.style.removeProperty('transition'), 220);
            swipe = null;
        };
        const beginSwipe = (id, x, y, target) => {
            if (!nowPlayerOpen || !matchMedia('(max-width: 760px)').matches || expandedPlayer.scrollTop > 0) return;
            if (target.closest('button, input, canvas, a, label')) return;
            swipe = { id, x, y, offset: 0, dragging: false };
        };
        const moveSwipe = (id, x, y, event) => {
            if (!swipe || id !== swipe.id) return;
            const dx = x - swipe.x, dy = y - swipe.y;
            if (!swipe.dragging) {
                if (dy < 8) return;
                if (Math.abs(dx) > dy) { swipe = null; return; }
                swipe.dragging = true; expandedPlayer.classList.add('is-dragging');
            }
            event.preventDefault();
            swipe.offset = Math.min(dy, expandedPlayer.clientHeight * .75);
            expandedPlayer.style.transform = `translateY(${swipe.offset}px)`;
            expandedBackdrop.style.opacity = String(Math.max(0, 1 - swipe.offset / (expandedPlayer.clientHeight * .75)));
        };
        const finishSwipe = (id, x, y) => {
            if (!swipe || id !== swipe.id) return;
            const dy = Number.isFinite(y) ? y - swipe.y : 0;
            if (!swipe.dragging && dy >= 8 && Math.abs(x - swipe.x) <= dy) {
                swipe.dragging = true; swipe.offset = Math.min(dy, expandedPlayer.clientHeight * .75);
            }
            const shouldClose = swipe.dragging && swipe.offset >= Math.max(90, expandedPlayer.clientHeight * .12);
            if (swipe.dragging) {
                suppressExpandedClick = true;
                setTimeout(() => { suppressExpandedClick = false; }, 800);
            }
            if (shouldClose) { swipe = null; closeNowPlayer(); }
            else resetSwipe();
        };
        expandedPlayer.addEventListener('pointerdown', event => {
            expandedClickStart = { x: event.clientX, y: event.clientY };
            if (event.pointerType !== 'touch' && event.isPrimary) beginSwipe(event.pointerId, event.clientX, event.clientY, event.target);
        });
        expandedPlayer.addEventListener('pointermove', event => {
            if (event.pointerType !== 'touch') moveSwipe(event.pointerId, event.clientX, event.clientY, event);
        }, { passive: false });
        expandedPlayer.addEventListener('pointerup', event => finishSwipe(event.pointerId, event.clientX, event.clientY));
        expandedPlayer.addEventListener('pointercancel', event => finishSwipe(event.pointerId, event.clientX, event.clientY));
        expandedPlayer.addEventListener('touchstart', event => {
            if (event.touches.length === 1) {
                expandedClickStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
                beginSwipe('touch', event.touches[0].clientX, event.touches[0].clientY, event.target);
            }
        }, { passive: true });
        expandedPlayer.addEventListener('touchmove', event => {
            if (event.touches.length === 1) moveSwipe('touch', event.touches[0].clientX, event.touches[0].clientY, event);
        }, { passive: false });
        expandedPlayer.addEventListener('touchend', event => finishSwipe('touch', event.changedTouches[0]?.clientX, event.changedTouches[0]?.clientY));
        expandedPlayer.addEventListener('touchcancel', event => finishSwipe('touch', event.changedTouches[0]?.clientX, event.changedTouches[0]?.clientY));
        expandedPlayer.addEventListener('click', event => {
            if (expandedClickStart) {
                const moved = Math.hypot(event.clientX - expandedClickStart.x, event.clientY - expandedClickStart.y);
                expandedClickStart = null;
                if (moved > 8) return;
            }
            if (suppressExpandedClick) { suppressExpandedClick = false; return; }
            if (event.target.closest('.now-player-tracklist, .expanded-waveform, .now-player-actions, button, input, canvas, a, label')) return;
            closeNowPlayer();
        });
        $('now-player-backdrop').addEventListener('click', closeNowPlayer);
        $('now-player-close').addEventListener('click', closeNowPlayer);
        $('expanded-like').addEventListener('click', () => toggleLike(nowPlayerTrack || currentTrack()));
        $('expanded-share').addEventListener('click', () => shareSet(nowPlayerTrack || currentTrack()));
        for (const eventName of ['timeupdate', 'loadedmetadata', 'durationchange']) audio.addEventListener(eventName, syncNowPlayer);
        document.addEventListener('keydown', event => { if (event.key === 'Escape' && nowPlayerOpen) { event.preventDefault(); closeNowPlayer(); } });
        document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
            if (link.classList.contains('skip-link')) return;
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
        form.addEventListener('submit', saveSet); editor.append(form);
        $('admin-entry').addEventListener('click', async () => {
            if (admin) { navigate('/#tracklists'); return; }
            try { await request('/admin/session'); await loadAdmin(); navigate('/#tracklists'); }
            catch { location.href = api + '/admin/login'; }
        });
        request('/admin/session').then(() => loadAdmin()).catch(() => {});
        window.addEventListener('storage', event => { if (event.key === 'ncc-public-likes-v1') { try { socialLikes = new Set(JSON.parse(event.newValue || '[]')); syncSocial(); } catch {} } });
    });
    window.NCCSets = { open: openSet, toggleLike, share: shareSet, expand: openNowPlayer, collapse: closeNowPlayer };
})();
