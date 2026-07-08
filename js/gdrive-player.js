// La web vive en GitHub Pages. Esta URL debe apuntar al Worker que lista R2.
const playlistApiUrl = 'https://rapid-silence-8ef7.nc-music-87a.workers.dev/';
const playlistSources = [
    {
        id: 'chill-out',
        title: 'Chill Music',
        prefix: 'chill-out/'
    },
    {
        id: 'techno-freaks',
        title: 'Techno Freaks',
        prefix: 'techno-freaks/'
    }
];

// Estado del reproductor
const playerState = {
    isPlaying: false,
    currentTrackIndex: 0,
    activePlaylistId: 'techno-freaks',
    playlist: [],
    playlists: playlistSources.map(source => ({
        ...source,
        tracks: [],
        error: ''
    })),
};

const waveformState = {
    canvas: null,
    status: null,
    peaks: [],
    cache: new Map(),
    requestId: 0,
    isSeeking: false,
    hoverRatio: null,
    audioContext: null,
};

let durationRequestId = 0;

// Inicialización cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎵 DOM cargado');
    try {
        initPlayer();
    } catch (err) {
        console.error('Error en initPlayer:', err);
    }
});

function initPlayer() {
    console.log('📍 Inicializando reproductor...');
    
    // Obtener elementos
    const audio = document.getElementById('audio-player');
    const playButton = document.getElementById('play-button');
    const playlistEl = document.getElementById('playlist');
    const loadingInitial = document.getElementById('loading-initial');
    const waveformCanvas = document.getElementById('waveform-canvas');
    const waveformStatus = document.getElementById('waveform-status');
    
    if (!audio) {
        console.error('❌ audio-player no encontrado');
        return;
    }
    if (!playButton) {
        console.error('❌ play-button no encontrado');
        return;
    }
    if (!playlistEl) {
        console.error('❌ playlist no encontrado');
        return;
    }

    console.log('✅ Elementos encontrados');

    setupWaveform(audio, waveformCanvas, waveformStatus);
    setupPlaylistThemeSwitch(audio, playButton, playlistEl);
    
    // Event listeners
    audio.addEventListener('timeupdate', function() {
        updateProgress(audio);
    });
    audio.addEventListener('loadedmetadata', function() {
        updateDuration(audio);
        drawWaveform(audio);
    });
    audio.addEventListener('ended', function() {
        nextTrack(audio, playButton, playlistEl);
    });

    playButton.addEventListener('click', function() {
        togglePlay(audio, playButton);
    });
    
    document.getElementById('prev-button').addEventListener('click', function() {
        previousTrack(audio, playButton, playlistEl);
    });
    
    document.getElementById('next-button').addEventListener('click', function() {
        nextTrack(audio, playButton, playlistEl);
    });

    document.getElementById('volume-slider').addEventListener('input', function(e) {
        audio.volume = e.target.value / 100;
        document.getElementById('volume-value').textContent = Math.round(e.target.value) + '%';
    });

    // Cargar desde R2
    loadFromR2(audio, playButton, playlistEl, loadingInitial);
}

async function loadFromR2(audio, playButton, playlistEl, loadingInitial) {
    console.log('🔄 Cargando desde Cloudflare R2...');

    try {
        if (!playlistApiUrl) {
            throw new Error('Falta configurar playlistApiUrl con la URL del Worker.');
        }

        playerState.playlists = await Promise.all(playlistSources.map(loadPlaylistSource));
        const preferredPlaylist = getPlaylistById(playerState.activePlaylistId);
        const firstPlayablePlaylist = getFirstPlayablePlaylist();
        const initialPlaylist = preferredPlaylist || firstPlayablePlaylist;

        if (initialPlaylist) {
            setActivePlaylist(initialPlaylist.id, 0);
        } else {
            setActivePlaylist(playerState.activePlaylistId || playlistSources[0].id, 0);
            playerState.playlist = [];
        }

        playerState.isPlaying = false;

        console.log('✅ Playlists cargadas:', playerState.playlists);

        if (loadingInitial) {
            loadingInitial.style.display = 'none';
        }

        updatePlaylistUI(playlistEl);

        if (playerState.playlist.length > 0) {
            selectTrack(0, audio, playButton, playlistEl, playerState.activePlaylistId);
            loadPlaylistDurations();
        } else if (getTotalTrackCount() > 0) {
            loadPlaylistDurations();
        } else {
            const failedCount = playerState.playlists.filter(playlist => playlist.error).length;
            const message = failedCount === playerState.playlists.length
                ? 'No se pudieron cargar las playlists desde Cloudflare R2.'
                : 'No se encontraron audios en las carpetas de R2.';
            showLoadError(loadingInitial, message);
        }
    } catch (err) {
        console.error('❌ Error cargando playlist desde R2:', err);
        showLoadError(loadingInitial, 'No se pudo cargar la playlist desde Cloudflare R2.');
    }
}

async function loadPlaylistSource(source) {
    try {
        const response = await fetch(buildPlaylistUrl(source.prefix));
        if (!response.ok) {
            throw new Error(`No se pudo cargar la playlist ${source.title} (${response.status})`);
        }

        const data = await response.json();
        return {
            ...source,
            tracks: normalizeR2Playlist(data, source),
            error: ''
        };
    } catch (err) {
        console.error(`❌ Error cargando ${source.title}:`, err);
        return {
            ...source,
            tracks: [],
            error: 'No se pudo cargar esta playlist.'
        };
    }
}

function buildPlaylistUrl(prefix) {
    const url = new URL(playlistApiUrl);
    url.searchParams.set('prefix', normalizePlaylistPrefix(prefix));
    return url.toString();
}

function normalizePlaylistPrefix(prefix) {
    if (!prefix) return '';
    return prefix.replace(/^\/+/, '').replace(/\/?$/, '/');
}

function normalizeR2Playlist(data, source) {
    const tracks = Array.isArray(data) ? data : data.tracks || [];

    return tracks
        .filter(track => track.name && (track.url || track.key))
        .map(track => {
            const waveformUrl = getWaveformUrl(track);

            return {
                name: track.name,
                artist: track.artist || 'Nicolás Cardú',
                url: track.url || waveformUrl,
                waveformUrl,
                duration: normalizeDuration(track.duration || track.durationSeconds || track.duration_seconds),
                key: track.key || '',
                playlistId: source.id,
                playlistTitle: source.title
            };
        });
}

function setActivePlaylist(playlistId, trackIndex = 0) {
    const playlist = getPlaylistById(playlistId) || getFirstPlayablePlaylist() || playerState.playlists[0];
    if (!playlist) return null;

    const lastTrackIndex = Math.max(playlist.tracks.length - 1, 0);
    const safeTrackIndex = Math.min(Math.max(Number(trackIndex) || 0, 0), lastTrackIndex);

    playerState.activePlaylistId = playlist.id;
    playerState.playlist = playlist.tracks;
    playerState.currentTrackIndex = safeTrackIndex;
    applyPlaylistTheme(playlist.id);

    return playlist;
}

function getPlaylistById(playlistId) {
    return playerState.playlists.find(playlist => playlist.id === playlistId);
}

function getFirstPlayablePlaylist() {
    return playerState.playlists.find(playlist => playlist.tracks.length > 0);
}

function getActivePlaylist() {
    return getPlaylistById(playerState.activePlaylistId);
}

function getTotalTrackCount() {
    return playerState.playlists.reduce((total, playlist) => total + playlist.tracks.length, 0);
}

function getWaveformUrl(track) {
    if (track.waveformUrl || track.waveform_url || track.analysisUrl) {
        return track.waveformUrl || track.waveform_url || track.analysisUrl;
    }

    if (!track.key || !playlistApiUrl) {
        return '';
    }

    const workerUrl = new URL(playlistApiUrl);
    workerUrl.pathname = `/audio/${encodePath(track.key)}`;
    workerUrl.search = '';
    workerUrl.hash = '';
    return workerUrl.toString();
}

function showLoadError(loadingInitial, message) {
    if (!loadingInitial) return;

    loadingInitial.style.display = 'block';
    loadingInitial.innerHTML = `<h3>${message}</h3>`;
}

function setupPlaylistThemeSwitch(audio, playButton, playlistEl) {
    const themeSwitch = document.getElementById('playlist-theme-switch');

    applyPlaylistTheme(playerState.activePlaylistId);

    if (!themeSwitch) return;

    themeSwitch.addEventListener('change', function() {
        const playlistId = themeSwitch.checked ? 'techno-freaks' : 'chill-out';
        applyPlaylistTheme(playlistId);
        setActivePlaylist(playlistId, 0);

        if (playerState.playlist.length > 0) {
            selectTrack(0, audio, playButton, playlistEl, playlistId);
        } else if (playlistEl) {
            updatePlaylistUI(playlistEl);
        }
    });
}

function applyPlaylistTheme(playlistId) {
    const safePlaylistId = playlistSources.some(source => source.id === playlistId)
        ? playlistId
        : playlistSources[0].id;
    const themeSwitch = document.getElementById('playlist-theme-switch');
    const themeLabels = document.querySelectorAll('[data-theme-option]');

    document.body.dataset.playlistTheme = safePlaylistId;

    if (themeSwitch) {
        themeSwitch.checked = safePlaylistId === 'techno-freaks';
    }

    themeLabels.forEach(label => {
        label.classList.toggle('active', label.dataset.themeOption === safePlaylistId);
    });
}

function togglePlay(audio, playButton) {
    if (playerState.playlist.length === 0) {
        return;
    }

    if (playerState.isPlaying) {
        audio.pause();
        playerState.isPlaying = false;
        playButton.textContent = '▶️';
    } else {
        if (audio.src === '') {
            playTrack(playerState.currentTrackIndex, audio, playButton, null, playerState.activePlaylistId);
        } else {
            audio.play();
        }
        playerState.isPlaying = true;
        playButton.textContent = '⏸️';
    }
}

function playTrack(index, audio, playButton, playlistEl, playlistId = playerState.activePlaylistId) {
    const track = selectTrack(index, audio, playButton, playlistEl, playlistId);
    if (!track) return;

    console.log('🎵 Reproduciendo:', track.name);

    audio.play()
        .then(() => {
            playerState.isPlaying = true;
            playButton.textContent = '⏸️';
        })
        .catch((err) => {
            console.warn('El navegador bloqueó la reproducción automática:', err);
            playerState.isPlaying = false;
            playButton.textContent = '▶️';
        });
}

function selectTrack(index, audio, playButton, playlistEl, playlistId = playerState.activePlaylistId) {
    const playlist = setActivePlaylist(playlistId, index);
    if (!playlist || playlist.tracks.length === 0) return null;

    const track = playerState.playlist[playerState.currentTrackIndex];
    if (!track) return null;

    audio.src = track.url;
    document.getElementById('track-name').textContent = track.name;
    document.getElementById('track-artist').textContent = track.artist || 'Nicolás Cardú';
    document.getElementById('current-time').textContent = '0:00';
    document.getElementById('duration').textContent = formatTrackDuration(track.duration);
    playButton.textContent = '▶️';
    playerState.isPlaying = false;
    resetWaveform(audio);
    loadWaveform(track, audio);

    if (playlistEl) {
        updatePlaylistUI(playlistEl);
    }

    return track;
}

function nextTrack(audio, playButton, playlistEl) {
    if (playerState.playlist.length === 0) return;
    const nextIndex = (playerState.currentTrackIndex + 1) % playerState.playlist.length;
    playTrack(nextIndex, audio, playButton, playlistEl, playerState.activePlaylistId);
}

function previousTrack(audio, playButton, playlistEl) {
    if (playerState.playlist.length === 0) return;
    const prevIndex = playerState.currentTrackIndex === 0 
        ? playerState.playlist.length - 1 
        : playerState.currentTrackIndex - 1;
    playTrack(prevIndex, audio, playButton, playlistEl, playerState.activePlaylistId);
}

function updateProgress(audio) {
    const currentTimeEl = document.getElementById('current-time');
    
    if (currentTimeEl) {
        currentTimeEl.textContent = formatTime(audio.currentTime);
    }

    updateWaveformAria(audio);
    drawWaveform(audio);
}

function updateDuration(audio) {
    const duration = normalizeDuration(audio.duration);
    const durationEl = document.getElementById('duration');

    if (duration > 0) {
        const activePlaylist = getActivePlaylist();
        const currentTrack = playerState.playlist[playerState.currentTrackIndex];
        if (currentTrack) {
            currentTrack.duration = duration;
        }

        if (activePlaylist) {
            updatePlaylistDuration(activePlaylist.id, playerState.currentTrackIndex, duration);
        }
    }

    if (durationEl) {
        durationEl.textContent = formatTrackDuration(duration);
    }
}

function updatePlaylistUI(playlistEl) {
    playlistEl.innerHTML = '';
    const playlistCount = document.getElementById('playlist-count');
    
    if (playlistCount) {
        playlistCount.textContent = getTotalTrackCount();
    }

    playerState.playlists.forEach((playlist) => {
        const group = document.createElement('section');
        group.className = 'playlist-group';
        if (playlist.id === playerState.activePlaylistId) {
            group.classList.add('active');
        }

        const heading = document.createElement('div');
        heading.className = 'playlist-group-heading';

        const title = document.createElement('h4');
        title.className = 'playlist-group-title';
        title.textContent = playlist.title;

        const count = document.createElement('span');
        count.className = 'playlist-group-count';
        count.textContent = `${playlist.tracks.length} ${playlist.tracks.length === 1 ? 'canción' : 'canciones'}`;

        heading.appendChild(title);
        heading.appendChild(count);
        group.appendChild(heading);

        if (playlist.error) {
            const errorMessage = document.createElement('p');
            errorMessage.className = 'playlist-group-status';
            errorMessage.textContent = playlist.error;
            group.appendChild(errorMessage);
        }

        const list = document.createElement('ul');
        list.className = 'playlist-list';

        const audio = document.getElementById('audio-player');
        const playButton = document.getElementById('play-button');

        if (playlist.tracks.length === 0 && !playlist.error) {
            const emptyItem = document.createElement('li');
            emptyItem.className = 'playlist-item playlist-item-empty';
            emptyItem.textContent = 'Sin canciones por ahora';
            list.appendChild(emptyItem);
        }

        playlist.tracks.forEach((track, index) => {
            const li = document.createElement('li');
            li.className = 'playlist-item';
            li.dataset.playlistId = playlist.id;
            li.dataset.trackIndex = index.toString();
            if (playlist.id === playerState.activePlaylistId && index === playerState.currentTrackIndex) {
                li.classList.add('active');
            }

            const nameSpan = document.createElement('span');
            nameSpan.className = 'playlist-item-name';
            nameSpan.textContent = track.name;

            const durationSpan = document.createElement('span');
            durationSpan.className = 'playlist-item-duration';
            durationSpan.dataset.playlistId = playlist.id;
            durationSpan.dataset.trackDuration = index.toString();
            durationSpan.textContent = formatTrackDuration(track.duration);

            li.appendChild(nameSpan);
            li.appendChild(durationSpan);

            li.addEventListener('click', function() {
                playTrack(index, audio, playButton, playlistEl, playlist.id);
            });

            list.appendChild(li);
        });

        group.appendChild(list);
        playlistEl.appendChild(group);
    });
}

async function loadPlaylistDurations() {
    const requestId = durationRequestId + 1;
    durationRequestId = requestId;

    for (const playlist of playerState.playlists) {
        for (let index = 0; index < playlist.tracks.length; index++) {
            if (requestId !== durationRequestId) return;

            const track = playlist.tracks[index];
            if (!track || track.duration > 0 || !track.url) continue;

            try {
                const duration = await readAudioDuration(track.url);
                if (requestId !== durationRequestId) return;

                track.duration = duration;
                updatePlaylistDuration(playlist.id, index, duration);

                if (playlist.id === playerState.activePlaylistId && index === playerState.currentTrackIndex) {
                    const durationEl = document.getElementById('duration');
                    if (durationEl) {
                        durationEl.textContent = formatTrackDuration(duration);
                    }
                }
            } catch (err) {
                console.warn('No se pudo leer la duración del track:', track.name, err);
            }
        }
    }
}

function updatePlaylistDuration(playlistId, index, duration) {
    const durationEl = document.querySelector(`[data-playlist-id="${playlistId}"][data-track-duration="${index}"]`);
    if (durationEl) {
        durationEl.textContent = formatTrackDuration(duration);
    }
}

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
    waveformState.peaks = [];
    waveformState.hoverRatio = null;
    setWaveformStatus('Loading waveform...');
    drawWaveform(audio);
}

async function loadWaveform(track, audio) {
    const canvas = waveformState.canvas;
    if (!canvas || !track) return;

    const waveformUrl = track.waveformUrl || track.url;
    const requestId = waveformState.requestId;

    if (!waveformUrl) {
        setWaveformStatus('Waveform unavailable');
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
        const response = await fetch(waveformUrl, { mode: 'cors' });
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
        console.warn('No se pudo generar el waveform real:', err);
        if (requestId !== waveformState.requestId) return;
        waveformState.peaks = [];
        setWaveformStatus('Waveform unavailable');
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
        : buildPlaceholderPeaks(160);
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

        ctx.fillStyle = played ? '#cbff3d' : 'rgba(78, 205, 196, 0.38)';
        ctx.fillRect(x, y, barWidth, barHeight);
    }

    if (waveformState.hoverRatio !== null && isSeekable(audio)) {
        const hoverX = waveformState.hoverRatio * width;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(hoverX, 8, 1, height - 16);
    }

    if (isSeekable(audio)) {
        const progressX = clamp(progress, 0, 1) * width;
        ctx.fillStyle = '#cbff3d';
        ctx.fillRect(progressX - 1, 6, 2, height - 12);
        ctx.beginPath();
        ctx.arc(progressX, centerY, 5, 0, Math.PI * 2);
        ctx.fill();
    }
}

function buildPlaceholderPeaks(count) {
    const peaks = [];

    for (let i = 0; i < count; i++) {
        const wave = Math.sin(i * 0.19) * 0.5 + Math.sin(i * 0.047) * 0.35;
        peaks.push(0.16 + Math.abs(wave) * 0.42);
    }

    return peaks;
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
