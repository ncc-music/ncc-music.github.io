// Keep the existing R2 catalogue as the single source of truth for all sets.
const usesHostedProxy = location.hostname.endsWith('.chatgpt.site');
const playlistApiUrl = usesHostedProxy
    ? new URL('/api/playlist', location.origin).href
    : 'https://rapid-silence-8ef7.nc-music-87a.workers.dev/';
const playlistSources = [
    { id: 'chill-out', title: 'Chill Music', prefix: 'chill-out/', cover: 'assets/chill-cover.jpg' },
    { id: 'techno-freaks', title: 'Techno Freaks', prefix: 'techno-freaks/', cover: 'assets/player-cover.jpg' }
];
const playerState = {
    playlists: playlistSources.map(source => ({ ...source, tracks: [], error: '' })),
    activePlaylistId: 'techno-freaks', currentTrackIndex: 0,
    isPlaying: false, isBuffering: false, radio: false, filter: 'all', loaded: false, requestId: 0
};
const waveformState = {
    canvas: null, status: null, peaks: [], cache: new Map(), requestId: 0,
    isSeeking: false, hoverRatio: null, audioContext: null, controller: null
};
let audio, messageTimer, durationRequestId = 0;
const $ = id => document.getElementById(id);
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;

function getPlaylistById(id) { return playerState.playlists.find(p => p.id === id); }
function currentTrack() { return getPlaylistById(playerState.activePlaylistId)?.tracks[playerState.currentTrackIndex]; }
function getTotalTrackCount() { return playerState.playlists.reduce((total, p) => total + p.tracks.length, 0); }
function buildPlaylistUrl(prefix) {
    const url = new URL(playlistApiUrl);
    url.searchParams.set('prefix', prefix.replace(/^\/+/, '').replace(/\/?$/, '/'));
    return url.toString();
}
function safeMediaUrl(value) {
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
}
function normalizeR2Playlist(data, source) {
    const tracks = Array.isArray(data) ? data : data?.tracks;
    if (!Array.isArray(tracks)) throw new Error('Invalid catalogue');
    return tracks.filter(track => typeof track.name === 'string' && track.name.trim()).map(track => {
        const fallback = track.key ? new URL(`/audio/${encodePath(track.key)}`, playlistApiUrl).href : '';
        const url = safeMediaUrl(track.url || fallback);
        const extension = (track.key || url).split('?')[0].split('.').pop().toUpperCase();
        return {
            name: track.name, artist: track.artist || 'Nicolás Cardú', url,
            waveformUrl: safeMediaUrl(usesHostedProxy ? fallback : (track.waveformUrl || track.waveform_url || fallback || url)),
            duration: normalizeDuration(track.duration || track.durationSeconds || track.duration_seconds),
            format: ['FLAC', 'WAV', 'MP3', 'OGG', 'M4A', 'AAC'].includes(extension) ? extension : 'AUDIO',
            playlistId: source.id, playlistTitle: source.title, cover: source.cover
        };
    }).filter(track => track.url);
}
async function loadPlaylistSource(source) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(buildPlaylistUrl(source.prefix), { signal: controller.signal });
            if (!response.ok) throw new Error(`Catalogue: ${response.status}`);
            return { ...source, tracks: normalizeR2Playlist(await response.json(), source), error: '' };
        } finally { clearTimeout(timeout); }
    } catch {
        return { ...source, tracks: [], error: `No pudimos cargar ${source.title}.` };
    }
}
async function loadCatalogue() {
    $('loading-initial').hidden = false;
    $('loading-initial').textContent = 'Cargando tus sets…';
    const selected = currentTrack();
    playerState.playlists = await Promise.all(playlistSources.map(loadPlaylistSource));
    playerState.loaded = true;
    $('loading-initial').hidden = true;
    let retainedSelection = false;
    if (selected) {
        const index = getPlaylistById(selected.playlistId).tracks.findIndex(track => track.url === selected.url);
        if (index >= 0) { playerState.currentTrackIndex = index; retainedSelection = true; }
        else { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    }
    const first = getPlaylistById(playerState.activePlaylistId)?.tracks.length
        ? getPlaylistById(playerState.activePlaylistId) : playerState.playlists.find(p => p.tracks.length);
    if (!retainedSelection && first) selectTrack(first.id, 0, playerState.radio);
    renderCatalogue();
    syncPlaybackUI();
    loadPlaylistDurations();
}
function renderCatalogue() {
    const root = $('playlist');
    root.replaceChildren();
    $('playlist-count').textContent = getTotalTrackCount();
    const selected = playerState.playlists.filter(p => playerState.filter === 'all' || p.id === playerState.filter);
    const errors = selected.filter(p => p.error);
    if (errors.length) {
        const status = document.createElement('div');
        status.className = 'empty-state';
        const message = document.createElement('p');
        message.textContent = errors.map(p => p.error).join(' ');
        const retry = document.createElement('button');
        retry.className = 'retry-button'; retry.textContent = 'Volver a intentar';
        retry.addEventListener('click', () => { retry.disabled = true; loadCatalogue(); });
        status.append(message, retry); root.append(status);
    }
    const tracks = selected.flatMap(p => p.tracks.map((track, index) => ({ track, index, playlist: p })));
    if (!tracks.length) {
        if (!errors.length) {
            const empty = document.createElement('p'); empty.className = 'empty-state';
            empty.textContent = playerState.loaded ? 'Todavía no hay sets en esta colección.' : 'Cargando tus sets…';
            root.append(empty);
        }
        return;
    }
    const heading = document.createElement('div'); heading.className = 'track-table-head';
    heading.setAttribute('aria-hidden', 'true');
    heading.innerHTML = `<span>#</span><span>Título</span><span>Colección</span>${icon('clock')}`;
    root.append(heading);
    const list = document.createElement('ol'); list.className = 'track-list';
    tracks.forEach(({ track, index, playlist }, order) => {
        const li = document.createElement('li');
        const button = document.createElement('button'); button.className = 'track-row';
        button.dataset.playlistId = playlist.id; button.dataset.trackIndex = index;
        button.setAttribute('aria-label', `Reproducir ${track.name}, ${playlist.title}`);
        const number = document.createElement('span'); number.className = 'track-number';
        number.textContent = String(order + 1).padStart(2, '0'); number.dataset.order = order + 1;
        const main = document.createElement('span'); main.className = 'track-main';
        const cover = document.createElement('img'); cover.className = 'track-thumb'; cover.src = track.cover; cover.alt = ''; cover.loading = 'lazy';
        const copy = document.createElement('span'); copy.className = 'track-text';
        const title = document.createElement('span'); title.className = 'track-title'; title.textContent = track.name;
        const artist = document.createElement('span'); artist.className = 'track-artist'; artist.textContent = `${track.artist} · ${track.format}`;
        copy.append(title, artist); main.append(cover, copy);
        const collection = document.createElement('span'); collection.className = 'track-collection'; collection.textContent = playlist.title;
        const duration = document.createElement('span'); duration.className = 'track-duration';
        duration.dataset.playlistId = playlist.id; duration.dataset.trackDuration = index;
        duration.textContent = formatTrackDuration(track.duration);
        button.append(number, main, collection, duration);
        button.addEventListener('click', () => {
            if (!playerState.radio && currentTrack()?.url === track.url) togglePlay();
            else playTrack(playlist.id, index, false);
        });
        li.append(button); list.append(li);
    });
    root.append(list); syncActiveRows();
}
function syncActiveRows() {
    document.querySelectorAll('.track-row').forEach(row => {
        const active = row.dataset.playlistId === playerState.activePlaylistId && Number(row.dataset.trackIndex) === playerState.currentTrackIndex;
        row.classList.toggle('active', active);
        row.setAttribute('aria-current', active ? 'true' : 'false');
        const number = row.querySelector('.track-number');
        if (active) number.innerHTML = icon(playerState.isPlaying ? 'wave' : 'play');
        else number.textContent = String(number.dataset.order).padStart(2, '0');
    });
}
function showMessage(message) {
    clearTimeout(messageTimer); $('player-message').textContent = message; $('player-message').hidden = !message;
    if (message) messageTimer = setTimeout(() => { $('player-message').hidden = true; }, 7000);
}
function syncPlaybackUI() {
    const playing = playerState.isPlaying;
    const available = getTotalTrackCount() > 0;
    $('play-button').innerHTML = icon(playing ? 'pause' : 'play');
    $('play-button').setAttribute('aria-label', playing ? 'Pausa' : 'Reproducir');
    $('play-button').title = playing ? 'Pausa' : 'Reproducir';
    ['play-button', 'prev-button', 'next-button', 'radio-button'].forEach(id => { $(id).disabled = !available; });
    const radioPlaying = playerState.radio && playing;
    $('radio-button').innerHTML = `${icon(radioPlaying ? 'pause' : 'play')}<span>${radioPlaying ? 'Pausar radio' : playerState.radio ? 'Continuar radio' : 'Escuchar radio'}</span>`;
    document.body.dataset.radio = playerState.radio ? 'on' : 'off';
    document.body.dataset.playing = playing && !playerState.isBuffering ? 'true' : 'false';
    $('player-mode').textContent = playerState.radio ? 'NCC RADIO' : currentTrack() ? 'LIVE SET' : 'LISTO PARA ESCUCHAR';
    syncActiveRows();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}
function selectTrack(playlistId, index, radio = false) {
    const playlist = getPlaylistById(playlistId), track = playlist?.tracks[index];
    if (!track) return null;
    playerState.requestId++;
    audio.pause();
    playerState.activePlaylistId = playlistId; playerState.currentTrackIndex = index;
    playerState.radio = radio; playerState.isPlaying = false; playerState.isBuffering = true;
    audio.src = track.url;
    $('track-name').textContent = track.name; $('track-artist').textContent = track.artist;
    $('audio-quality').textContent = track.format;
    $('duration').textContent = formatTrackDuration(track.duration); $('current-time').textContent = '0:00';
    $('seek-slider').value = 0; $('seek-slider').disabled = true; paintRange($('seek-slider'), 0);
    showMessage(''); resetWaveform(audio); syncPlaybackUI();
    if (!$('waveform-panel').hidden) loadWaveform(track, audio);
    if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.name, artist: track.artist, album: radio ? 'NCC Radio' : track.playlistTitle,
            artwork: [{ src: new URL(track.cover, location.href).href, type: 'image/jpeg' }]
        });
    }
    return track;
}
async function startPlayback() {
    const requestId = playerState.requestId;
    try { await audio.play(); }
    catch (error) {
        if (requestId !== playerState.requestId || error.name === 'AbortError') return;
        playerState.isPlaying = false; syncPlaybackUI();
        showMessage(error.name === 'NotAllowedError' ? 'Tocá reproducir para empezar a escuchar.' : 'No pudimos reproducir este set. Volvé a intentar o elegí otro.');
    }
}
function playTrack(playlistId, index, radio = false) {
    if (selectTrack(playlistId, index, radio)) return startPlayback();
}
function togglePlay() {
    if (!currentTrack()) return;
    if (!audio.paused) audio.pause(); else startPlayback();
}
// Radio alternates collections, including every available set before repeating.
function radioQueue() {
    const queue = [], length = Math.max(0, ...playerState.playlists.map(p => p.tracks.length));
    for (let index = 0; index < length; index++) {
        for (const playlist of playerState.playlists) if (playlist.tracks[index]) queue.push({ playlistId: playlist.id, index });
    }
    return queue;
}
function nextTrack(direction = 1) {
    if (!currentTrack()) return;
    const queue = playerState.radio ? radioQueue() : getPlaylistById(playerState.activePlaylistId).tracks.map((_, index) => ({ playlistId: playerState.activePlaylistId, index }));
    if (!queue.length) return;
    const position = queue.findIndex(item => item.playlistId === playerState.activePlaylistId && item.index === playerState.currentTrackIndex);
    const next = queue[(position + direction + queue.length) % queue.length];
    playTrack(next.playlistId, next.index, playerState.radio);
}
function startRadio() {
    if (!getTotalTrackCount()) return;
    if (playerState.radio) { togglePlay(); return; }
    // Keep the selected set and its position when joining radio mid-session.
    playerState.radio = true; syncPlaybackUI();
    if (currentTrack()) {
        if ('mediaSession' in navigator && navigator.mediaSession.metadata) navigator.mediaSession.metadata.album = 'NCC Radio';
        if (audio.paused) startPlayback();
    } else {
        const first = radioQueue()[0]; playTrack(first.playlistId, first.index, true);
    }
}
function paintRange(input, value) { input.style.setProperty('--progress', `${value}%`); }
function updateProgress() {
    $('current-time').textContent = formatTime(audio.currentTime);
    const seekable = isSeekable(audio);
    $('seek-slider').disabled = !seekable;
    const ratio = seekable ? (audio.currentTime / audio.duration) : 0;
    $('seek-slider').value = Math.round(ratio * 1000); paintRange($('seek-slider'), ratio * 100);
    $('seek-slider').setAttribute('aria-valuetext', `${formatTime(audio.currentTime)} de ${formatTrackDuration(audio.duration)}`);
    if (!$('waveform-panel').hidden) { updateWaveformAria(audio); drawWaveform(audio); }
}
function updateDuration() {
    const duration = normalizeDuration(audio.duration);
    if (currentTrack() && duration) {
        currentTrack().duration = duration;
        $('duration').textContent = formatTrackDuration(duration);
        updatePlaylistDuration(playerState.activePlaylistId, playerState.currentTrackIndex, duration);
    }
    updateProgress();
}
function updatePlaylistDuration(playlistId, index, duration) {
    const el = document.querySelector(`[data-playlist-id="${playlistId}"][data-track-duration="${index}"]`);
    if (el) el.textContent = formatTrackDuration(duration);
}
async function loadPlaylistDurations() {
    const requestId = ++durationRequestId;
    for (const playlist of playerState.playlists) for (let index = 0; index < playlist.tracks.length; index++) {
        if (requestId !== durationRequestId) return;
        const track = playlist.tracks[index];
        if (track.duration) continue;
        try {
            const duration = await readAudioDuration(track.url);
            if (requestId !== durationRequestId) return;
            track.duration = duration; updatePlaylistDuration(playlist.id, index, duration);
            if (track === currentTrack()) $('duration').textContent = formatTrackDuration(duration);
        } catch { /* Unknown metadata stays as --:--; playback remains available. */ }
    }
}
function route() {
    const requested = location.hash.slice(1) || 'sets';
    const collection = playlistSources.find(p => p.id === requested);
    const view = collection ? 'sets' : ['radio', 'acerca'].includes(requested) ? requested : 'sets';
    playerState.filter = collection ? collection.id : 'all';
    $('page-title').textContent = collection?.title || ({ sets: 'Live sets', radio: 'Radio', acerca: 'About us' })[view];
    $('radio-feature').hidden = view === 'acerca';
    $('collections-section').hidden = view !== 'sets';
    $('sets-section').hidden = view === 'acerca';
    $('about-section').hidden = view !== 'acerca';
    $('sets-title').textContent = view === 'radio' ? 'En la radio' : collection ? 'Sets de la colección' : 'Live sets';
    document.querySelectorAll('[data-view]').forEach(link => {
        const active = link.dataset.view === view;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-filter]').forEach(button => {
        const active = button.dataset.filter === playerState.filter;
        button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    renderCatalogue();
}
function initPlayer() {
    audio = $('audio-player'); audio.volume = .8;
    setupWaveform(audio, $('waveform-canvas'), $('waveform-status'));
    $('play-button').addEventListener('click', togglePlay);
    $('next-button').addEventListener('click', () => nextTrack());
    $('prev-button').addEventListener('click', () => nextTrack(-1));
    $('radio-button').addEventListener('click', startRadio);
    audio.addEventListener('play', () => { playerState.isPlaying = true; showMessage(''); syncPlaybackUI(); });
    audio.addEventListener('pause', () => { playerState.isPlaying = false; syncPlaybackUI(); });
    audio.addEventListener('waiting', () => { playerState.isBuffering = true; syncPlaybackUI(); });
    audio.addEventListener('playing', () => { playerState.isPlaying = true; playerState.isBuffering = false; syncPlaybackUI(); });
    audio.addEventListener('ended', () => nextTrack());
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('error', () => {
        if (!audio.getAttribute('src')) return;
        playerState.isPlaying = false; syncPlaybackUI();
        showMessage('Este set no está disponible ahora. Probá de nuevo o elegí otro.');
    });
    $('seek-slider').addEventListener('input', event => {
        if (isSeekable(audio)) { audio.currentTime = audio.duration * (Number(event.target.value) / 1000); updateProgress(); }
    });
    $('volume-slider').addEventListener('input', event => { audio.volume = Number(event.target.value) / 100; audio.muted = false; });
    $('mute-button').addEventListener('click', () => { audio.muted = !audio.muted; });
    audio.addEventListener('volumechange', () => {
        const volume = audio.muted ? 0 : Math.round(audio.volume * 100);
        $('volume-slider').value = volume; paintRange($('volume-slider'), volume);
        $('volume-value').textContent = `${volume}%`;
        $('mute-button').innerHTML = icon(volume ? 'volume' : 'muted');
        $('mute-button').setAttribute('aria-label', volume ? 'Silenciar' : 'Activar sonido');
    });
    $('waveform-toggle').addEventListener('click', () => {
        const open = $('waveform-panel').hidden;
        $('waveform-panel').hidden = !open;
        $('waveform-toggle').setAttribute('aria-expanded', String(open));
        $('waveform-toggle').setAttribute('aria-label', open ? 'Ocultar forma de onda' : 'Mostrar forma de onda');
        if (open && currentTrack()) loadWaveform(currentTrack(), audio);
    });
    document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
        playerState.filter = button.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach(b => {
            const active = b === button; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active));
        });
        renderCatalogue();
    }));
    window.addEventListener('hashchange', () => { route(); window.scrollTo({ top: 0 }); $('main-content').focus({ preventScroll: true }); });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') { $('waveform-panel').hidden = true; $('waveform-toggle').setAttribute('aria-expanded', 'false'); }
        if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input,button,a,textarea,select,[contenteditable="true"],[role="slider"]')) return;
        if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
        if (event.key === 'ArrowRight') { event.preventDefault(); nextTrack(); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); nextTrack(-1); }
    });
    if ('mediaSession' in navigator) {
        const handlers = { play: startPlayback, pause: () => audio.pause(), nexttrack: () => nextTrack(), previoustrack: () => nextTrack(-1), seekto: detail => { if (isSeekable(audio)) audio.currentTime = clamp(detail.seekTime, 0, audio.duration); } };
        for (const [action, handler] of Object.entries(handlers)) try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Optional device support. */ }
    }
    route(); syncPlaybackUI(); loadCatalogue();
}
document.addEventListener('DOMContentLoaded', initPlayer);

function readAudioDuration(url) {
    return new Promise((resolve, reject) => {
        const metadataAudio = new Audio();
        let timeoutId;

        function cleanup() {
            clearTimeout(timeoutId);
            metadataAudio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            metadataAudio.removeEventListener('error', handleError);
            metadataAudio.removeAttribute('src');
            metadataAudio.load();
        }

        function handleLoadedMetadata() {
            const duration = normalizeDuration(metadataAudio.duration);
            cleanup();

            if (duration > 0) {
                resolve(duration);
            } else {
                reject(new Error('Duración inválida'));
            }
        }

        function handleError() {
            cleanup();
            reject(new Error('No se pudieron cargar los metadatos'));
        }

        metadataAudio.preload = 'metadata';
        metadataAudio.addEventListener('loadedmetadata', handleLoadedMetadata);
        metadataAudio.addEventListener('error', handleError);

        timeoutId = window.setTimeout(function() {
            cleanup();
            reject(new Error('Tiempo de espera agotado'));
        }, 12000);

        metadataAudio.src = url;
        metadataAudio.load();
    });
}

function setupWaveform(audio, canvas, status) {
    waveformState.canvas = canvas;
    waveformState.status = status;

    if (!canvas) return;

    canvas.addEventListener('pointerdown', function(e) {
        if (!isSeekable(audio)) return;
        waveformState.isSeeking = true;
        canvas.setPointerCapture(e.pointerId);
        seekWaveformFromPointer(e, audio);
    });

    canvas.addEventListener('pointermove', function(e) {
        const rect = canvas.getBoundingClientRect();
        waveformState.hoverRatio = clamp((e.clientX - rect.left) / rect.width, 0, 1);

        if (waveformState.isSeeking) {
            seekWaveformFromPointer(e, audio);
        } else {
            drawWaveform(audio);
        }
    });

    canvas.addEventListener('pointerup', function(e) {
        waveformState.isSeeking = false;
        if (canvas.hasPointerCapture(e.pointerId)) {
            canvas.releasePointerCapture(e.pointerId);
        }
    });

    canvas.addEventListener('pointercancel', function(e) {
        waveformState.isSeeking = false;
        waveformState.hoverRatio = null;
        if (canvas.hasPointerCapture(e.pointerId)) {
            canvas.releasePointerCapture(e.pointerId);
        }
        drawWaveform(audio);
    });

    canvas.addEventListener('pointerleave', function() {
        if (!waveformState.isSeeking) {
            waveformState.hoverRatio = null;
            drawWaveform(audio);
        }
    });

    canvas.addEventListener('keydown', function(e) {
        if (!isSeekable(audio)) return;

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            audio.currentTime = Math.max(0, audio.currentTime - 5);
        } else if (e.key === 'Home') {
            e.preventDefault();
            audio.currentTime = 0;
        } else if (e.key === 'End') {
            e.preventDefault();
            audio.currentTime = audio.duration;
        }
    });

    window.addEventListener('resize', function() {
        drawWaveform(audio);
    });

    drawWaveform(audio);
}

function resetWaveform(audio) {
    waveformState.requestId += 1;
    waveformState.controller?.abort();
    waveformState.peaks = [];
    waveformState.hoverRatio = null;
    setWaveformStatus('Cargando forma de onda…');
    drawWaveform(audio);
}

async function loadWaveform(track, audio) {
    const canvas = waveformState.canvas;
    if (!canvas || !track) return;

    const waveformUrl = track.waveformUrl || track.url;
    const requestId = waveformState.requestId;

    if (!waveformUrl) {
        setWaveformStatus('Forma de onda no disponible. Podés usar la barra de progreso.');
        drawWaveform(audio);
        return;
    }

    const cachedPeaks = waveformState.cache.get(waveformUrl);
    if (cachedPeaks) {
        if (requestId !== waveformState.requestId) return;
        waveformState.peaks = cachedPeaks;
        setWaveformStatus('');
        drawWaveform(audio);
        return;
    }

    try {
        waveformState.controller?.abort();
        const controller = new AbortController();
        waveformState.controller = controller;
        const response = await fetch(waveformUrl, { mode: 'cors', signal: controller.signal });
        if (!response.ok) {
            throw new Error(`Waveform fetch failed (${response.status})`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (requestId !== waveformState.requestId) return;

        const audioContext = getWaveformAudioContext();
        const decodedAudio = await audioContext.decodeAudioData(arrayBuffer);
        if (requestId !== waveformState.requestId) return;

        const peaks = buildWaveformPeaks(decodedAudio, 1400);
        waveformState.cache.set(waveformUrl, peaks);
        waveformState.peaks = peaks;
        setWaveformStatus('');
    } catch (err) {
        if (err.name === 'AbortError') return;
        if (requestId !== waveformState.requestId) return;
        waveformState.peaks = [];
        setWaveformStatus('Forma de onda no disponible. Podés usar la barra de progreso.');
    }

    drawWaveform(audio);
}

function getWaveformAudioContext() {
    if (!waveformState.audioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        waveformState.audioContext = new AudioContextClass();
    }

    return waveformState.audioContext;
}

function buildWaveformPeaks(audioBuffer, sampleCount) {
    const channels = [];
    const channelCount = audioBuffer.numberOfChannels;

    for (let i = 0; i < channelCount; i++) {
        channels.push(audioBuffer.getChannelData(i));
    }

    const blockSize = Math.max(1, Math.floor(audioBuffer.length / sampleCount));
    const peaks = [];
    let maxPeak = 0;

    for (let i = 0; i < sampleCount; i++) {
        const start = i * blockSize;
        const end = Math.min(start + blockSize, audioBuffer.length);
        let peak = 0;

        for (let channel = 0; channel < channels.length; channel++) {
            const data = channels[channel];
            for (let sample = start; sample < end; sample++) {
                const value = Math.abs(data[sample]);
                if (value > peak) peak = value;
            }
        }

        peaks.push(peak);
        if (peak > maxPeak) maxPeak = peak;
    }

    if (maxPeak === 0) return peaks;
    return peaks.map(peak => peak / maxPeak);
}

function drawWaveform(audio) {
    const canvas = waveformState.canvas;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const progress = isSeekable(audio) ? audio.currentTime / audio.duration : 0;
    const peaks = waveformState.peaks.length > 0
        ? waveformState.peaks
        : Array(160).fill(0.04);
    const gap = width < 420 ? 1 : 2;
    const barWidth = width < 420 ? 2 : 3;
    const step = barWidth + gap;
    const barCount = Math.max(24, Math.floor(width / step));
    const centerY = height / 2;
    const maxBarHeight = Math.max(8, height - 18);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(0, centerY - 1, width, 2);

    for (let i = 0; i < barCount; i++) {
        const ratio = barCount === 1 ? 0 : i / (barCount - 1);
        const peak = samplePeak(peaks, ratio);
        const barHeight = Math.max(3, peak * maxBarHeight);
        const x = i * step;
        const y = centerY - (barHeight / 2);
        const played = ratio <= progress;

        ctx.fillStyle = played ? '#c7f375' : 'rgba(190, 198, 193, 0.35)';
        ctx.fillRect(x, y, barWidth, barHeight);
    }

    if (waveformState.hoverRatio !== null && isSeekable(audio)) {
        const hoverX = waveformState.hoverRatio * width;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(hoverX, 8, 1, height - 16);
    }

    if (isSeekable(audio)) {
        const progressX = clamp(progress, 0, 1) * width;
        ctx.fillStyle = '#c7f375';
        ctx.fillRect(progressX - 1, 6, 2, height - 12);
        ctx.beginPath();
        ctx.arc(progressX, centerY, 5, 0, Math.PI * 2);
        ctx.fill();
    }
}

function samplePeak(peaks, ratio) {
    if (peaks.length === 0) return 0;

    const index = ratio * (peaks.length - 1);
    const left = Math.floor(index);
    const right = Math.min(peaks.length - 1, left + 1);
    const mix = index - left;

    return peaks[left] * (1 - mix) + peaks[right] * mix;
}

function seekWaveformFromPointer(e, audio) {
    if (!isSeekable(audio)) return;

    const rect = waveformState.canvas.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    audio.currentTime = ratio * audio.duration;
    waveformState.hoverRatio = ratio;
    updateProgress(audio);
}

function updateWaveformAria(audio) {
    const canvas = waveformState.canvas;
    if (!canvas) return;

    const progress = isSeekable(audio) ? (audio.currentTime / audio.duration) * 100 : 0;
    canvas.setAttribute('aria-valuenow', Math.round(progress).toString());
    canvas.setAttribute('aria-valuetext', `${formatTime(audio.currentTime)} de ${formatTime(audio.duration)}`);
}

function setWaveformStatus(message) {
    if (waveformState.status) {
        waveformState.status.textContent = message;
    }
}

function isSeekable(audio) {
    return Boolean(audio && Number.isFinite(audio.duration) && audio.duration > 0);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function encodePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
}

function normalizeDuration(value) {
    const duration = Number(value);
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function formatTrackDuration(duration) {
    return normalizeDuration(duration) > 0 ? formatTime(duration) : '--:--';
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
