// URL de Cloudflare R2
const r2BaseUrl = 'https://pub-a23ce9da093b4cbf812140922221fc46.r2.dev';
const r2Track = '/NCSHORTTEST120.flac';

// Estado del reproductor
const playerState = {
    isPlaying: false,
    currentTrackIndex: 0,
    playlist: [],
    shuffle: false,
    repeat: 0,
    shuffledIndices: []
};

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
    
    // Event listeners
    audio.addEventListener('timeupdate', function() {
        updateProgress(audio);
    });
    audio.addEventListener('loadedmetadata', function() {
        updateDuration(audio);
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

    document.getElementById('progress-slider').addEventListener('input', function(e) {
        const seekTime = (e.target.value / 100) * audio.duration;
        audio.currentTime = seekTime;
    });

    // Cargar desde R2
    loadFromR2(audio, playButton, playlistEl, loadingInitial);
}

function loadFromR2(audio, playButton, playlistEl, loadingInitial) {
    console.log('🔄 Cargando desde Cloudflare R2...');
    
    playerState.playlist = [{
        name: 'Nicolás Cardú - Testdrive',
        url: r2BaseUrl + r2Track,
        duration: 0
    }];

    playerState.currentTrackIndex = 0;
    
    console.log('✅ Playlist creada:', playerState.playlist);
    
    if (loadingInitial) {
        loadingInitial.style.display = 'none';
    }
    
    updatePlaylistUI(playlistEl);
    playTrack(0, audio, playButton, playlistEl);
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
            playTrack(playerState.currentTrackIndex, audio, playButton);
        } else {
            audio.play();
        }
        playerState.isPlaying = true;
        playButton.textContent = '⏸️';
    }
}

function playTrack(index, audio, playButton, playlistEl) {
    if (playerState.playlist.length === 0) return;

    playerState.currentTrackIndex = index;
    const track = playerState.playlist[index];

    console.log('🎵 Reproduciendo:', track.name);

    audio.src = track.url;
    document.getElementById('track-name').textContent = track.name;
    document.getElementById('track-artist').textContent = 'Nicolás Cardú';

    audio.play();
    playerState.isPlaying = true;
    playButton.textContent = '⏸️';

    if (playlistEl) {
        updatePlaylistUI(playlistEl);
    }
}

function nextTrack(audio, playButton, playlistEl) {
    if (playerState.playlist.length === 0) return;
    const nextIndex = (playerState.currentTrackIndex + 1) % playerState.playlist.length;
    playTrack(nextIndex, audio, playButton, playlistEl);
}

function previousTrack(audio, playButton, playlistEl) {
    if (playerState.playlist.length === 0) return;
    const prevIndex = playerState.currentTrackIndex === 0 
        ? playerState.playlist.length - 1 
        : playerState.currentTrackIndex - 1;
    playTrack(prevIndex, audio, playButton, playlistEl);
}

function updateProgress(audio) {
    const progressSlider = document.getElementById('progress-slider');
    const currentTimeEl = document.getElementById('current-time');
    
    if (progressSlider && audio.duration) {
        const progress = (audio.currentTime / audio.duration) * 100;
        progressSlider.value = progress;
    }
    
    if (currentTimeEl) {
        currentTimeEl.textContent = formatTime(audio.currentTime);
    }
}

function updateDuration(audio) {
    const durationEl = document.getElementById('duration');
    if (durationEl) {
        durationEl.textContent = formatTime(audio.duration);
    }
}

function updatePlaylistUI(playlistEl) {
    playlistEl.innerHTML = '';
    const playlistCount = document.getElementById('playlist-count');
    
    if (playlistCount) {
        playlistCount.textContent = playerState.playlist.length;
    }

    playerState.playlist.forEach((track, index) => {
        const li = document.createElement('li');
        li.className = 'playlist-item';
        if (index === playerState.currentTrackIndex) {
            li.classList.add('active');
        }

        const nameSpan = document.createElement('span');
        nameSpan.className = 'playlist-item-name';
        nameSpan.textContent = track.name;

        const durationSpan = document.createElement('span');
        durationSpan.className = 'playlist-item-duration';
        durationSpan.textContent = '0:00';

        li.appendChild(nameSpan);
        li.appendChild(durationSpan);
        
        const audio = document.getElementById('audio-player');
        const playButton = document.getElementById('play-button');
        li.addEventListener('click', function() {
            playTrack(index, audio, playButton, playlistEl);
        });

        playlistEl.appendChild(li);
    });
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
