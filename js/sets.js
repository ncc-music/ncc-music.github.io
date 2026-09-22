// Shared set details, administration and social actions; one persistent audio element.
(() => {
    const api = '/api';
    let admin = false, adminTracks = [], archiveTracks = [], detailTrack = null, editorTrack = null, shareTrack = null, reordering = false;
    let tracklistQuery = '', nowPlayerOpen = false, nowPlayerTrackKey = '', nowPlayerTrack = null, playerReturnFocus = null;
    let socialLikes = new Set(), pendingLikes = new Set(), fireReactions = new Set(), pendingFire = new Set(), commentLikes = new Set(), communityRequest = 0;
    const communityCache = new Map();
    try { socialLikes = new Set(JSON.parse(localStorage.getItem('ncc-public-likes-v1') || '[]')); } catch {}
    try { fireReactions = new Set(JSON.parse(localStorage.getItem('ncc-fire-reactions-v1') || '[]')); } catch {}
    try { commentLikes = new Set(JSON.parse(localStorage.getItem('ncc-comment-likes-v1') || '[]')); } catch {}
    const el = (tag, className, text) => {
        const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
    };
    const commentInitials = value => String(value || 'AnonymousFreak').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'AF';
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
    function communityVisitor() {
        try {
            let visitor = localStorage.getItem('ncc-community-visitor-v1');
            if (!visitor) { visitor = crypto.randomUUID(); localStorage.setItem('ncc-community-visitor-v1', visitor); }
            return visitor;
        } catch { throw new Error('El navegador no permite publicar de forma anónima.'); }
    }
    function commentDate(value) {
        const raw = String(value || '');
        const date = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z');
        return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    }
    const activeCommunityTrack = () => nowPlayerOpen ? nowPlayerTrack || currentTrack() : detailTrack;
    function setCommunityExpanded(expanded) {
        const toggle = $('community-toggle'), panel = $('community-panel');
        if (!toggle || !panel) return;
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.setAttribute('aria-label', `${expanded ? 'Ocultar' : 'Mostrar'} comentarios`);
        panel.hidden = !expanded;
    }
    function moveCommunity(slot) {
        const shell = $('community-shell');
        if (shell && slot && shell.parentElement !== slot) slot.append(shell);
    }
    function renderCommunity(track, data) {
        const visible = activeCommunityTrack();
        if (!track?.id || visible?.id !== track.id) return;
        window.NCCDetailWaveform?.setComments(data?.comments || []);
        $('expanded-like').dataset.likeId = track.id || '';
        $('community-title').textContent = `FREAKS COMMENTS · ${data?.comments?.length ?? 0}`;
        $('community-toggle-count').textContent = data?.comments?.length ?? 0;
        const fire = $('community-fire');
        fire.disabled = pendingFire.has(track.id) || !data;
        fire.setAttribute('aria-pressed', String(fireReactions.has(track.id)));
        fire.setAttribute('aria-label', `${fireReactions.has(track.id) ? 'Quitar reacción de fuego' : 'Reaccionar con fuego'} a ${track.name}`);
        $('community-fire-count').textContent = data?.fireCount ?? '—';
        const list = $('comment-list'); list.replaceChildren();
        if (!data) { list.append(el('p', 'empty-state', 'Cargando comentarios…')); return; }
        if (!data.comments?.length) { list.append(el('p', 'empty-state', 'Todavía no hay comentarios. Sé el primer freak.')); return; }
        for (const comment of data.comments) {
            const authorName = comment.author || 'AnonymousFreak';
            const card = el('article', 'comment-card'), avatar = el('span', 'comment-card-avatar', commentInitials(authorName));
            const content = el('div', 'comment-card-content'), header = el('header'), author = el('strong', '', authorName);
            card.dataset.commentId = comment.id || '';
            const time = el('time', '', commentDate(comment.createdAt)); time.dateTime = comment.createdAt || '';
            const meta = el('span', 'comment-meta');
            if (Number.isFinite(comment.positionSeconds)) {
                const audioTime = el('button', 'comment-audio-time', formatTime(comment.positionSeconds)); audioTime.type = 'button';
                audioTime.setAttribute('aria-label', `Ir a ${formatTime(comment.positionSeconds)}`);
                audioTime.addEventListener('click', () => window.NCCDetailWaveform?.seekTo(comment.positionSeconds)); meta.append(audioTime);
            }
            meta.append(time); header.append(author, meta);
            const actions = el('div', 'comment-actions');
            const reply = el('button', 'comment-action', 'Responder'); reply.type = 'button';
            reply.addEventListener('click', () => {
                const textarea = $('comment-body'); textarea.value = `@${authorName} `; textarea.dispatchEvent(new Event('input')); textarea.focus();
                $('comment-status').textContent = `Respuesta para ${authorName}.`;
            });
            const likeKey = String(comment.id || `${track.id}:${authorName}:${comment.createdAt || ''}`);
            const like = el('button', 'comment-action comment-like', 'Me gusta'); like.type = 'button';
            like.setAttribute('aria-pressed', String(commentLikes.has(likeKey)));
            like.addEventListener('click', () => {
                if (commentLikes.has(likeKey)) commentLikes.delete(likeKey); else commentLikes.add(likeKey);
                like.setAttribute('aria-pressed', String(commentLikes.has(likeKey)));
                try { localStorage.setItem('ncc-comment-likes-v1', JSON.stringify([...commentLikes])); } catch {}
            });
            actions.append(reply, like); content.append(header, el('p', '', comment.body || ''), actions); card.append(avatar, content); list.append(card);
        }
    }
    async function loadCommunity(track) {
        if (!track?.id) return;
        const requestId = ++communityRequest;
        renderCommunity(track, communityCache.get(track.id) || null);
        try {
            const data = await request(`/sets/${track.id}/community`);
            if (!Array.isArray(data.comments) || !Number.isFinite(Number(data.fireCount))) throw new Error('Respuesta inválida.');
            if (requestId !== communityRequest) return;
            const normalized = { fireCount: Number(data.fireCount), comments: data.comments.slice(0, 100).map(comment => ({
                ...comment,
                positionSeconds: comment.positionSeconds === null || comment.positionSeconds === undefined ? null : Number(comment.positionSeconds)
            })) };
            communityCache.set(track.id, normalized); renderCommunity(track, normalized);
        } catch (error) {
            if (requestId !== communityRequest) return;
            $('community-fire').disabled = true; $('community-fire-count').textContent = '—';
            const list = $('comment-list'); list.replaceChildren(el('p', 'empty-state', error.message || 'Comentarios no disponibles.'));
        }
    }
    async function toggleFire(track) {
        if (!track?.id || pendingFire.has(track.id) || !communityCache.has(track.id)) return;
        let visitor;
        try { visitor = communityVisitor(); } catch (error) { $('comment-status').textContent = error.message; return; }
        const reacted = !fireReactions.has(track.id); pendingFire.add(track.id); renderCommunity(track, communityCache.get(track.id));
        try {
            const result = await request(`/sets/${track.id}/fire`, { method: 'PUT', body: JSON.stringify({ visitor, reacted }) });
            if (result.reacted) fireReactions.add(track.id); else fireReactions.delete(track.id);
            const data = communityCache.get(track.id); data.fireCount = Number(result.count); communityCache.set(track.id, data);
            try { localStorage.setItem('ncc-fire-reactions-v1', JSON.stringify([...fireReactions])); } catch {}
            $('comment-status').textContent = result.reacted ? 'Reacción 🔥 agregada.' : 'Reacción retirada.';
        } catch (error) { $('comment-status').textContent = error.message; }
        finally { pendingFire.delete(track.id); renderCommunity(track, communityCache.get(track.id)); }
    }
    function commentPositionSeconds(track = activeCommunityTrack() || currentTrack()) {
        return currentTrack()?.key === track?.key && isSeekable(audio) ? audio.currentTime : 0;
    }
    function syncCommentPosition() {
        const readout = $('comment-position-current-time'); if (!readout) return;
        readout.textContent = formatTime(commentPositionSeconds());
        $('comment-body').placeholder = 'Escribe tu comentario';
        window.NCCDetailWaveform?.setDraftPosition(null);
    }
    async function submitComment(event) {
        event.preventDefault();
        const track = activeCommunityTrack() || currentTrack(); if (!track?.id) return;
        setCommunityExpanded(true);
        const name = $('comment-name').value.trim() || 'AnonymousFreak', body = $('comment-body').value.trim();
        $('comment-name').value = name;
        if (!body) { $('comment-status').textContent = 'Escribí un comentario.'; $('comment-body').focus(); return; }
        let visitor;
        try { visitor = communityVisitor(); } catch (error) { $('comment-status').textContent = error.message; return; }
        const button = $('comment-submit'); button.disabled = true; $('comment-status').textContent = 'Publicando…';
        try {
            const positionSeconds = commentPositionSeconds(track);
            const result = await request(`/sets/${track.id}/comments`, { method: 'POST', body: JSON.stringify({ visitor, author: name, body, positionSeconds }) });
            const data = communityCache.get(track.id) || { fireCount: 0, comments: [] };
            data.comments = [result.comment, ...data.comments].slice(0, 100); communityCache.set(track.id, data);
            $('comment-body').value = ''; $('comment-count').textContent = '0/600';
            try { if (name) localStorage.setItem('ncc-comment-name-v1', name); else localStorage.removeItem('ncc-comment-name-v1'); } catch {}
            $('comment-status').textContent = `Publicado como ${result.comment.author} en ${formatTime(result.comment.positionSeconds || 0)}.`;
            syncCommentPosition(); renderCommunity(track, data);
        } catch (error) { $('comment-status').textContent = error.message; }
        finally { button.disabled = false; }
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
    async function copySetLink(track, button) {
        if (!track?.slug || !button) return;
        const originalLabel = 'Copiar enlace';
        try {
            await navigator.clipboard.writeText(setURL(track));
            button.classList.add('is-copied'); button.setAttribute('aria-label', 'Enlace copiado'); button.title = 'Enlace copiado';
            setTimeout(() => { button.classList.remove('is-copied'); button.setAttribute('aria-label', originalLabel); button.title = originalLabel; }, 1600);
        } catch {
            shareSet(track);
            $('share-status').textContent = 'Seleccioná y copiá el enlace.';
        }
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
                $('track-artist').textContent = playlist.id === 'radio' ? playlist.tracks[index].artist : 'CARDÚ';
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
        if (!tokens?.length) { parent.append(document.createTextNode(text)); return; }
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
    function appendTracklistLine(parent, line, tokens = []) {
        const text = String(line || '').replace(/^\s*\d+[.)\-]?\s+/, '');
        const parts = text.match(/^(.+?)(\s+[-–—]\s+)(.+)$/);
        if (!parts) { appendHighlighted(parent, text, tokens); return; }
        const artist = el('strong', 'tracklist-artist');
        appendHighlighted(artist, parts[1], tokens);
        parent.append(artist, document.createTextNode(parts[2]));
        appendHighlighted(parent, parts[3], tokens);
    }
    function buildCard(track, detailed = false) {
        const card = el('article', 'set-card');
        const heading = el('h2');
        const link = el('a', 'set-title-link', track.name); link.href = '/set/' + track.slug;
        link.addEventListener('click', event => { event.preventDefault(); openSet(track); }); heading.append(link); card.append(heading);
        if (track.date) { const date = el('time', 'set-date', track.date.split('-').reverse().join('.')); date.dateTime = track.date; card.append(date); }
        if (track.tags?.length) card.append(el('p', 'set-tags', track.tags.map(tag => `#${tag}`).join(' ')));
        if (detailed) {
            const waveformCard = el('div', 'waveform-community-card detail-waveform-card');
            const host = el('div', 'detail-waveform'); host.id = 'detail-waveform-host';
            waveformCard.append(host);
            const communitySlot = el('div', 'detail-community-slot'); communitySlot.id = 'detail-community-slot'; waveformCard.append(communitySlot);
            card.append(waveformCard);
            if (!nowPlayerOpen) { moveCommunity(communitySlot); setCommunityExpanded(false); }
        }
        const label = el('h3', 'tracklist-label', 'TRACKLIST'); card.append(label);
        if (track.tracklist?.length) {
            const focus = detailed && history.state?.tracklistFocus?.slug === track.slug ? history.state.tracklistFocus : null;
            const tokens = focus?.query ? window.NCCTracklistSearch.search([track], focus.query).tokens : [];
            const list = el('ol', 'set-tracklist'); track.tracklist.forEach((line, index) => {
                const item = el('li'); item.dataset.tracklistIndex = index;
                appendTracklistLine(item, line, tokens);
                if (focus?.index === index) item.classList.add('tracklist-focus');
                list.append(item);
            }); card.append(list);
        } else card.append(el('p', 'empty-tracklist', 'Todavía no hay un tracklist publicado para este set.'));
        const actions = el('div', 'set-card-actions');
        const play = action('Reproducir ' + track.name, 'play', () => playSet(track)); play.dataset.playSet = track.id; play.classList.add('set-play'); play.append(el('span', '', track.available ? 'Reproducir' : 'Audio no disponible')); play.disabled = !track.published || !track.available || !allTracks().some(item => item.key === track.key);
        if (!detailed) actions.append(play);
        actions.append(likeButton(track), action('Compartir ' + track.name, 'share', () => shareSet(track)));
        if (admin) { const edit = el('button', 'edit-set admin-ficha-button', 'Editar ficha'); edit.type = 'button'; edit.addEventListener('click', () => editSet(track)); actions.append(edit); }
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
                appendTracklistLine(item, row.text, searching ? window.NCCTracklistSearch.search([track], tracklistQuery).tokens : []);
                list.append(item);
            }
            body.append(list);
        } else body.append(el('p', 'empty-tracklist', 'Todavía no hay un tracklist publicado para este set.'));
        const actions = el('div', 'set-card-actions');
        const play = action('Reproducir ' + track.name, 'play', () => playSet(track)); play.dataset.playSet = track.id; play.classList.add('set-play'); play.append(el('span', '', track.available ? 'Reproducir set' : 'Audio no disponible')); play.disabled = !track.available;
        const view = el('button', 'track-action', 'Ver ficha'); view.type = 'button'; view.addEventListener('click', () => openSet(track, searching && matches.length ? matches[0].index : null));
        actions.append(play, view);
        if (admin) { const edit = el('button', 'edit-set', 'Editar nombre y tags'); edit.type = 'button'; edit.addEventListener('click', () => editSet(track)); actions.append(edit); }
        body.append(actions); details.append(body); return details;
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
        search.append(label, input, clear, status);
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
        root.append(search);
        syncSocial();
    }
    function renderNowPlayer() {
        const track = nowPlayerTrack || currentTrack(); if (!track || !nowPlayerOpen) return;
        nowPlayerTrackKey = track.key;
        const poster = $('expanded-skull-poster'), animation = $('expanded-skull-video');
        const posterSource = track.animationPosterUrl || 'assets/skull-pieces.png';
        const animationSource = track.animationVideoUrl || 'assets/skull-pieces.mp4';
        if (poster.getAttribute('src') !== posterSource) poster.src = posterSource;
        animation.poster = posterSource;
        if (animation.getAttribute('src') !== animationSource) { animation.src = animationSource; animation.load(); }
        moveCommunity($('now-player-community-slot'));
        setCommunityExpanded(false);
        $('now-player').setAttribute('aria-label', 'Reproductor ampliado: ' + track.name);
        const list = $('expanded-tracklist'); list.replaceChildren();
        $('expanded-tracklist-empty').hidden = Boolean(track.tracklist?.length);
        for (const line of track.tracklist || []) { const item = el('li'); appendTracklistLine(item, line); list.append(item); }
        $('expanded-like').dataset.likeId = track.id || '';
        $('expanded-waveform').replaceChildren(); window.NCCDetailWaveform.mount(track, $('expanded-waveform'));
        syncCommentPosition();
        $('comment-body').value = ''; $('comment-count').textContent = '0/600'; $('comment-status').textContent = '';
        loadCommunity(track);
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
        const animation = $('expanded-skull-video'), poster = $('expanded-skull-poster');
        const animate = active && playerState.isPlaying && !playerState.isBuffering && !audio.paused;
        animation.hidden = !animate; poster.hidden = animate;
        const mediaToggle = $('expanded-skull-toggle');
        mediaToggle.setAttribute('aria-pressed', String(animate));
        mediaToggle.setAttribute('aria-label', `${animate ? 'Pausar' : 'Reproducir'} ${track.name}`);
        mediaToggle.title = animate ? 'Pausar' : 'Reproducir';
        mediaToggle.querySelector('use').setAttribute('href', animate ? '#i-pause' : '#i-play');
        if (animate && animation.paused) animation.play().catch(() => { animation.hidden = true; poster.hidden = false; });
        else if (!animate && !animation.paused) animation.pause();
        syncCommentPosition();
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
        nowPlayerOpen = false; nowPlayerTrackKey = ''; nowPlayerTrack = null; communityRequest++; panel.hidden = true; $('now-player-backdrop').hidden = true;
        $('expanded-skull-video').pause(); $('expanded-skull-video').hidden = true; $('expanded-skull-poster').hidden = false;
        document.body.classList.remove('player-expanded'); $('expand-player').setAttribute('aria-expanded', 'false');
        window.NCCDetailWaveform.dispose();
        if (detailTrack && $('detail-waveform-host')?.isConnected) {
            window.NCCDetailWaveform.mount(detailTrack, $('detail-waveform-host'));
            moveCommunity($('detail-community-slot')); loadCommunity(detailTrack);
        }
        playerReturnFocus?.focus?.(); playerReturnFocus = null;
    }
    const originalRoute = route;
    route = () => {
        parkWaveform(); originalRoute();
        const root = $('set-detail-section'); if (!root) return;
        moveCommunity($('now-player-community-slot'));
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
        ['radio-feature','collections-section','sets-section','tracklists-section','about-section','tour-section','manifesto-section','manifesto-languages','mix-signature','page-quality','collection-filters','favorites-filter'].forEach(id => $(id).hidden = true);
        $('page-title').textContent = 'SET'; root.replaceChildren();
        detailTrack = allKnownTracks().find(track => track.slug === match[1]);
        const back = el('a', 'back-to-sets', '← Tracklists'); back.href = '/#tracklists'; back.addEventListener('click', event => { event.preventDefault(); if (history.state?.fromTracklists) history.back(); else navigate('/#tracklists'); }); root.append(back);
        if (!detailTrack) { root.append(el('p', 'empty-state', playerState.loaded ? 'Este set no existe o no está publicado.' : 'Cargando set…')); return; }
        root.append(buildCard(detailTrack, true));
        if (!nowPlayerOpen) {
            if (detailTrack.available) window.NCCDetailWaveform.mount(detailTrack, $('detail-waveform-host'));
            syncCommentPosition();
            $('comment-body').value = ''; $('comment-count').textContent = '0/600'; $('comment-status').textContent = ''; loadCommunity(detailTrack);
        }
        const focus = root.querySelector('.tracklist-focus'); if (focus) requestAnimationFrame(() => focus.scrollIntoView({ block: 'center' }));
        document.title = detailTrack.name + ' | NCC Music'; syncSocial();
    };
    function makeDialog(id, title) {
        const dialog = el('dialog', 'set-dialog'); dialog.id = id;
        const header = el('div', 'dialog-heading'); const heading = el('h2', '', title); heading.id = id + '-title';
        dialog.setAttribute('aria-labelledby', heading.id);
        const close = el('button', 'dialog-close', 'Cerrar'); close.type = 'button'; close.addEventListener('click', () => dialog.close()); header.append(heading, close); dialog.append(header); document.body.append(dialog); return dialog;
    }
    function shieldSafeShareSVG(markup) {
        return markup
            .replace(/<filter\b[^>]*>[\s\S]*?<\/filter>/gi, '')
            .replace(/\sfilter="url\(#[^"]+\)"/gi, '');
    }
    const rawSharePlatformSVG = {
        twitter: '<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false"><defs><filter id="share-rough-x" x="0" y="0" width="120" height="120" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="7" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="4"/></filter></defs><g fill="#050505" filter="url(#share-rough-x)"><circle cx="60" cy="60" r="49"/><path d="M10 47h12v4H10zm88 20h12v4H98zM27 17l7 9-4 3-7-9zm59 78 8 9-4 3-8-9z" opacity=".82"/></g><path d="M37 34h13l13 18 16-18h7L67 58l18 28H72L58 67 41 86h-7l20-25Z" fill="#fff"/></svg>',
        facebook: '<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false"><defs><filter id="share-rough-facebook" x="0" y="0" width="120" height="120" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="11" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="4"/></filter></defs><g fill="#1877F2" filter="url(#share-rough-facebook)"><circle cx="60" cy="60" r="49"/><path d="M9 44h14v4H9zm88 28h14v4H97zM29 14l5 10-5 2-5-10zm54 84 8 7-4 4-8-8z" opacity=".9"/></g><path d="M66 91V64h10l2-12H66v-6c0-6 2-10 10-10h5V25c-3-1-7-1-12-1-13 0-22 8-22 23v5H36v12h11v27Z" fill="#fff"/></svg>',
        instagram: '<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false"><defs><radialGradient id="share-gradient-instagram" cx="28%" cy="104%" r="116%"><stop offset="0" stop-color="#FFD600"/><stop offset=".3" stop-color="#FF7A00"/><stop offset=".52" stop-color="#FF0169"/><stop offset=".74" stop-color="#D300C5"/><stop offset="1" stop-color="#7638FA"/></radialGradient><filter id="share-rough-instagram" x="0" y="0" width="120" height="120" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="17" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="4"/></filter></defs><g fill="url(#share-gradient-instagram)" filter="url(#share-rough-instagram)"><circle cx="60" cy="60" r="49"/><path d="M8 51h14v4H8zm90 16h13v4H98zM29 14l6 10-5 3-6-10zm54 84 8 7-4 4-8-8z" opacity=".9"/></g><rect x="33" y="33" width="54" height="54" rx="16" fill="none" stroke="#fff" stroke-width="7"/><circle cx="60" cy="60" r="13" fill="none" stroke="#fff" stroke-width="7"/><circle cx="78" cy="42" r="4" fill="#fff"/></svg>',
        whatsapp: '<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false"><defs><filter id="share-rough-whatsapp" x="0" y="0" width="120" height="120" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="23" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="4"/></filter></defs><g fill="#25D366" filter="url(#share-rough-whatsapp)"><circle cx="60" cy="60" r="49"/><path d="M9 47h13v4H9zm89 22h13v4H98zM28 14l6 10-5 3-6-10zm55 84 8 7-4 4-8-8z" opacity=".9"/></g><path d="M84 78a35 35 0 0 0 5-18 30 30 0 1 0-55 17l-5 17 18-5a35 35 0 0 0 13 3c10 0 19-5 24-14Z" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"/><path d="M47 43c2-1 4 0 5 3l3 8c1 2 0 3-2 5l-3 3c4 8 10 13 18 16l3-4c1-2 3-2 5-1l8 4c3 1 3 3 2 5-2 6-7 9-13 8-16-3-32-18-36-34-2-6 3-11 10-13Z" fill="#fff"/></svg>',
        telegram: '<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false"><defs><filter id="share-rough-telegram" x="0" y="0" width="120" height="120" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="29" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="4"/></filter></defs><g fill="#229ED9" filter="url(#share-rough-telegram)"><circle cx="60" cy="60" r="49"/><path d="M9 45h14v4H9zm89 26h13v4H98zM28 14l6 10-5 3-6-10zm55 84 8 7-4 4-8-8z" opacity=".9"/></g><path d="M29 58 91 34 79 89 60 74 49 84l2-17 28-23-34 19Z" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>',
        reddit: '<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false"><defs><filter id="share-rough-reddit" x="0" y="0" width="120" height="120" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="31" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="4"/></filter></defs><g fill="#FF4500" filter="url(#share-rough-reddit)"><circle cx="60" cy="60" r="49"/><path d="M9 46h14v4H9zm89 24h13v4H98zM28 14l6 10-5 3-6-10zm55 84 8 7-4 4-8-8z" opacity=".9"/></g><g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="60" cy="67" rx="29" ry="20"/><path d="m60 47 5-18 16 3"/><circle cx="86" cy="33" r="6"/><path d="M34 59c-8-5-14 7-6 12m58-12c8-5 14 7 6 12M48 75c7 5 17 5 24 0"/></g><circle cx="49" cy="65" r="4" fill="#fff"/><circle cx="71" cy="65" r="4" fill="#fff"/></svg>'
    };
    const sharePlatformSVG = Object.fromEntries(Object.entries(rawSharePlatformSVG).map(([platform, markup]) => [platform, shieldSafeShareSVG(markup)]));
    function renderSharePreview(track) {
        $('share-preview-cover').src = track.cover || 'assets/player-cover-clean.jpg';
        $('share-preview-title').textContent = track.name;
        $('share-preview-meta').textContent = ['CΔRDÚ', track.date ? track.date.split('-').reverse().join('.') : '', track.playlistTitle || 'DJ MIXES'].filter(Boolean).join(' · ');
        const waveform = $('share-preview-waveform'); waveform.replaceChildren();
        const peaks = Array.isArray(track.peaks) && track.peaks.length ? track.peaks : Array.from({ length: 44 }, (_, index) => .22 + Math.abs(Math.sin(index * .71)) * .58);
        const step = Math.max(1, Math.floor(peaks.length / 44));
        for (let index = 0; index < peaks.length && waveform.children.length < 44; index += step) {
            const bar = el('span'); bar.style.setProperty('--share-peak', String(Math.max(.12, Math.min(1, Number(peaks[index]) || .12)))); waveform.append(bar);
        }
    }
    async function shareSet(track) {
        if (!track?.slug) { showMessage('El enlace del set todavía no está disponible.'); return; }
        const data = { title: track.name, text: track.name, url: setURL(track) };
        shareTrack = track;
        renderSharePreview(track);
        const dialog = $('share-dialog'); dialog.querySelector('.share-links').replaceChildren();
        for (const platform of [
            { id: 'twitter', name: 'X', url: 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(data.title) + '&url=' + encodeURIComponent(data.url) },
            { id: 'facebook', name: 'Facebook', url: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(data.url) },
            { id: 'instagram', name: 'Instagram', url: 'https://www.instagram.com/' },
            { id: 'whatsapp', name: 'WhatsApp', url: 'https://wa.me/?text=' + encodeURIComponent(data.title + ' ' + data.url) },
            { id: 'telegram', name: 'Telegram', url: 'https://t.me/share/url?url=' + encodeURIComponent(data.url) + '&text=' + encodeURIComponent(data.title) },
            { id: 'reddit', name: 'Reddit', url: 'https://www.reddit.com/submit?url=' + encodeURIComponent(data.url) + '&title=' + encodeURIComponent(data.title) }
        ]) {
            const link = el('a', `share-option share-${platform.id}`); link.href = platform.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', `Compartir en ${platform.name}`);
            const icon = el('span', 'share-platform-icon');
            icon.innerHTML = sharePlatformSVG[platform.id];
            link.append(icon, el('span', 'share-platform-name', platform.name));
            if (platform.id === 'instagram') link.addEventListener('click', () => {
                $('share-status').textContent = 'Copiá este enlace y pegalo en un mensaje o en el sticker Enlace de Instagram.';
                navigator.clipboard?.writeText(data.url).then(() => {
                    $('share-status').textContent = 'Enlace copiado. Pegalo en un mensaje o en el sticker Enlace de tu historia de Instagram.';
                }).catch(() => {
                    $('share-url').focus(); $('share-url').select(); $('share-status').textContent = 'Copiá este enlace y pegalo en Instagram.';
                });
            });
            dialog.querySelector('.share-links').append(link);
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
            document.body.classList.add('admin-mode'); renderCatalogue(); renderTracklists(); route();
        } catch (error) { showMessage(error.message); }
    }
    async function uploadSetMedia(id, kind, file) {
        const response = await fetch(`${api}/admin/sets/${id}/media/${kind}`, {
            method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': file.type }, body: file,
            signal: AbortSignal.timeout(120000)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'No se pudo subir el archivo.');
        return data;
    }
    function editSet(track) {
        editorTrack = { ...(adminTracks.find(item => item.id === track.id) || track) };
        $('edit-title').value = editorTrack.name; $('edit-date').value = editorTrack.date || '';
        $('edit-tags').value = (editorTrack.tags || []).join(', ');
        $('edit-tracklist').value = editorTrack.tracklist.join('\n'); $('edit-published').checked = editorTrack.published;
        $('edit-animation-poster').value = ''; $('edit-animation-video').value = '';
        $('edit-animation-poster-default').checked = !editorTrack.animationPosterKey;
        $('edit-animation-video-default').checked = !editorTrack.animationVideoKey;
        $('edit-animation-poster-state').textContent = editorTrack.animationPosterKey ? 'Imagen personalizada actual' : 'Imagen predeterminada';
        $('edit-animation-video-state').textContent = editorTrack.animationVideoKey ? 'Video personalizado actual' : 'Video predeterminado';
        $('edit-audio').textContent = editorTrack.key; $('edit-status').textContent = ''; $('edit-dialog').showModal();
    }
    async function saveSet(event) {
        event.preventDefault(); if (!editorTrack) return;
        const button = $('save-set'); button.disabled = true; $('edit-status').textContent = 'Guardando…';
        try {
            const posterFile = $('edit-animation-poster-default').checked ? null : $('edit-animation-poster').files[0];
            const videoFile = $('edit-animation-video-default').checked ? null : $('edit-animation-video').files[0];
            if (posterFile && (posterFile.type !== 'image/png' || posterFile.size > 5 * 1024 * 1024)) throw new Error('Elegí una imagen PNG de hasta 5 MB.');
            if (videoFile && (videoFile.type !== 'video/mp4' || videoFile.size > 25 * 1024 * 1024)) throw new Error('Elegí un video MP4 de hasta 25 MB.');
            let animationPosterKey = $('edit-animation-poster-default').checked ? '' : editorTrack.animationPosterKey || '';
            let animationVideoKey = $('edit-animation-video-default').checked ? '' : editorTrack.animationVideoKey || '';
            if (posterFile) { $('edit-status').textContent = 'Subiendo imagen…'; animationPosterKey = (await uploadSetMedia(editorTrack.id, 'poster', posterFile)).key; }
            if (videoFile) { $('edit-status').textContent = 'Subiendo video…'; animationVideoKey = (await uploadSetMedia(editorTrack.id, 'video', videoFile)).key; }
            if (editorTrack.available && editorTrack.format === 'FLAC' && !editorTrack.peaks?.length) {
                editorTrack.peaks = await analyzeFLAC(editorTrack, undefined, progress => { $('edit-status').textContent = `Preparando waveform… ${progress}%`; });
            }
            $('edit-status').textContent = 'Guardando…';
            const tags = [...new Set($('edit-tags').value.split(',').map(tag => tag.trim().replace(/^#/, '')).filter(Boolean))];
            await request('/admin/sets/' + editorTrack.id, { method: 'PUT', body: JSON.stringify({ title: $('edit-title').value, date: $('edit-date').value, tags, sortOrder: editorTrack.sortOrder, tracklist: $('edit-tracklist').value.split('\n').map(line => line.trim()).filter(Boolean), animationPosterKey, animationVideoKey, published: $('edit-published').checked, version: editorTrack.version, peaks: editorTrack.peaks }) });
            $('edit-dialog').close(); await loadCatalogue(); await loadAdmin(); showMessage('Set guardado.');
        } catch (error) { $('edit-status').textContent = error.message; }
        finally { button.disabled = false; }
    }
    async function moveSet(track, direction) {
        if (!admin || reordering || ![-1, 1].includes(direction)) return;
        const playlist = getPlaylistById(track.playlistId);
        const from = playlist?.tracks.findIndex(item => item.id === track.id) ?? -1;
        const to = from + direction;
        if (!playlist || from < 0 || to < 0 || to >= playlist.tracks.length) return;
        reordering = true;
        [playlist.tracks[from], playlist.tracks[to]] = [playlist.tracks[to], playlist.tracks[from]];
        renderCatalogue(); showMessage('Guardando el nuevo orden…');
        try {
            await request('/admin/order', { method: 'PUT', body: JSON.stringify({ ids: playlist.tracks.map(item => item.id) }) });
            await loadCatalogue(); await loadAdmin(); showMessage('Orden guardado.');
        } catch (error) {
            [playlist.tracks[from], playlist.tracks[to]] = [playlist.tracks[to], playlist.tracks[from]];
            renderCatalogue(); showMessage(error.message);
        } finally { reordering = false; }
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
            if (event.target.closest('.now-player-tracklist, .now-player-community, .expanded-waveform, .now-player-actions, button, input, textarea, canvas, a, label')) return;
            closeNowPlayer();
        });
        $('now-player-backdrop').addEventListener('click', closeNowPlayer);
        $('now-player-close').addEventListener('click', closeNowPlayer);
        $('expanded-like').addEventListener('click', () => toggleLike(activeCommunityTrack() || currentTrack()));
        $('expanded-share').addEventListener('click', () => shareSet(activeCommunityTrack() || currentTrack()));
        $('expanded-copy-link').addEventListener('click', event => copySetLink(activeCommunityTrack() || currentTrack(), event.currentTarget));
        $('expanded-skull-toggle').addEventListener('click', () => playSet(nowPlayerTrack || currentTrack()));
        $('community-fire').addEventListener('click', () => toggleFire(nowPlayerTrack || currentTrack()));
        $('community-toggle').addEventListener('click', () => setCommunityExpanded($('community-toggle').getAttribute('aria-expanded') !== 'true'));
        $('comment-form').addEventListener('submit', submitComment);
        $('comment-body').addEventListener('input', event => { $('comment-count').textContent = `${event.target.value.length}/600`; });
        try { $('comment-name').value = localStorage.getItem('ncc-comment-name-v1') || 'AnonymousFreak'; } catch { $('comment-name').value = 'AnonymousFreak'; }
        for (const eventName of ['play', 'pause', 'playing', 'waiting', 'timeupdate', 'loadedmetadata', 'durationchange']) audio.addEventListener(eventName, syncNowPlayer);
        document.addEventListener('keydown', event => { if (event.key === 'Escape' && nowPlayerOpen) { event.preventDefault(); closeNowPlayer(); } });
        document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
            if (link.classList.contains('skip-link')) return;
            event.preventDefault(); navigate('/' + link.getAttribute('href'));
        }));
        window.addEventListener('popstate', route);
        const sharing = makeDialog('share-dialog', 'Compartir'); sharing.classList.add('share-dialog');
        const preview = el('section', 'share-preview'); preview.setAttribute('aria-label', 'Vista previa del set');
        const cover = el('img', 'share-preview-cover'); cover.id = 'share-preview-cover'; cover.alt = '';
        const previewBody = el('div', 'share-preview-body'); const previewTop = el('div', 'share-preview-top');
        const previewPlay = el('span', 'share-preview-play'); previewPlay.innerHTML = icon('play');
        const previewCopy = el('div'); const previewTitle = el('strong'); previewTitle.id = 'share-preview-title'; const previewMeta = el('span'); previewMeta.id = 'share-preview-meta';
        previewCopy.append(previewTitle, previewMeta); previewTop.append(previewPlay, previewCopy);
        const previewWaveform = el('div', 'share-preview-waveform'); previewWaveform.id = 'share-preview-waveform'; previewWaveform.setAttribute('aria-hidden', 'true');
        previewBody.append(previewTop, previewWaveform); preview.append(cover, previewBody); sharing.append(preview);
        const shareHeading = el('p', 'share-section-label', 'Compartir en'); sharing.append(shareHeading, el('div', 'share-links'));
        const label = el('label', 'share-section-label', 'Enlace del set'); label.htmlFor = 'share-url'; sharing.append(label);
        const linkRow = el('div', 'share-link-row'); const input = el('input'); input.id = 'share-url'; input.readOnly = true; linkRow.append(input);
        const copy = el('button', 'primary-button share-copy', 'Copiar'); copy.type = 'button'; copy.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(setURL(shareTrack)); $('share-status').textContent = 'Enlace copiado.'; }
            catch { input.focus(); input.select(); $('share-status').textContent = 'Seleccioná y copiá el enlace.'; }
        }); linkRow.append(copy); sharing.append(linkRow); const status = el('p'); status.id = 'share-status'; status.setAttribute('role', 'status'); sharing.append(status);
        const editor = makeDialog('edit-dialog', 'Editar set'); const form = el('form', 'set-form');
        form.innerHTML = '<label for="edit-title">Nombre del set</label><input id="edit-title" required maxlength="240"><label for="edit-date">Fecha</label><input id="edit-date" type="date"><label for="edit-tags">Tags · separados por comas</label><input id="edit-tags" maxlength="400" placeholder="techno, live, warehouse"><label for="edit-tracklist">Tracklist · una pista por línea</label><textarea id="edit-tracklist" rows="12"></textarea><fieldset class="set-media-editor"><legend>Imagen del reproductor ampliado</legend><div class="set-media-field"><label for="edit-animation-poster">Imagen fija · PNG</label><span id="edit-animation-poster-state"></span><input id="edit-animation-poster" type="file" accept="image/png"><label class="set-media-default"><input type="checkbox" id="edit-animation-poster-default"> Usar imagen predeterminada</label></div><div class="set-media-field"><label for="edit-animation-video">Animación al reproducir · MP4</label><span id="edit-animation-video-state"></span><input id="edit-animation-video" type="file" accept="video/mp4"><label class="set-media-default"><input type="checkbox" id="edit-animation-video-default"> Usar video predeterminado</label></div><p>Cada set puede usar sus propios archivos. Si no elegís otros, se mantiene la calavera predeterminada.</p></fieldset><p class="audio-reference" id="edit-audio"></p><label class="published-label"><input type="checkbox" id="edit-published"> Publicado</label><p id="edit-status" role="status"></p><button id="save-set" class="primary-button" type="submit">Guardar</button>';
        for (const kind of ['poster', 'video']) {
            const file = form.querySelector(`#edit-animation-${kind}`), useDefault = form.querySelector(`#edit-animation-${kind}-default`), state = form.querySelector(`#edit-animation-${kind}-state`);
            file.addEventListener('change', () => { if (file.files.length) { useDefault.checked = false; state.textContent = 'Nuevo archivo seleccionado'; } });
            useDefault.addEventListener('change', () => {
                if (useDefault.checked) { file.value = ''; state.textContent = kind === 'poster' ? 'Imagen predeterminada' : 'Video predeterminado'; }
                else state.textContent = editorTrack?.[kind === 'poster' ? 'animationPosterKey' : 'animationVideoKey'] ? `${kind === 'poster' ? 'Imagen' : 'Video'} personalizado actual` : 'Elegí un archivo para personalizar';
            });
        }
        form.addEventListener('submit', saveSet); editor.append(form);
        $('admin-entry').addEventListener('click', async () => {
            if (admin) { navigate('/#tracklists'); return; }
            try { await request('/admin/session'); await loadAdmin(); navigate('/#tracklists'); }
            catch { location.href = api + '/admin/login'; }
        });
        request('/admin/session').then(() => loadAdmin()).catch(() => {});
        window.addEventListener('storage', event => { if (event.key === 'ncc-public-likes-v1') { try { socialLikes = new Set(JSON.parse(event.newValue || '[]')); syncSocial(); } catch {} } });
    });
    window.NCCSets = { open: openSet, toggleLike, share: shareSet, expand: openNowPlayer, collapse: closeNowPlayer, isAdmin: () => admin, edit: editSet, move: moveSet };
})();
