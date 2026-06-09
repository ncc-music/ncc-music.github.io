// URL de Cloudflare R2
const r2BaseUrl = 'https://pub-a23ce9da093b4cbf812140922221fc46.r2.dev';
const r2Track = '/086-%20DJ%20Sebel-%20From%20da%20darkside%20-%204A.mp3';

// Estado del reproductor
const playerState = {
    isPlaying: false,
    currentTrackIndex: 0,
    playlist: [],
    shuffle: false,
    repeat: 0,
    shuffledIndices: []
};

// Variables para elementos del DOM
let audio, playButton, prevButton, nextButton, shuffleButton, repeatButton;
let volumeSlider, volumeValue, progressSlider, currentTimeEl, durationEl;
let trackName, trackArtist, playlistEl, albumArt, loadingInitial;

// Inicialización cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎵 DOM cargado, inicializando...');
    
    // Obtener elementos del DOM
    audio = document.getElementById('audio-player');
    playButton = document.getElementById('play-button');
    prevButton = document.getElementById('prev-button');
    nextButton = document.getElementById('next-button');
    shuffleButton = document.getElementById('shuffle-button');
    repeatButton = document.getElementById('repeat-button');
    volumeSlider = document.getElementById('volume-slider');
    volumeValue = document.getElementById('volume-value');
    progressSlider = document.getElementById('progress-slider');
    currentTimeEl = document.getElementById('current-time');
    durationEl = document.getElementById('duration');
    trackName = document.getElementById('track-name');
    trackArtist = document.getElementById('track-artist');
    playlistEl = document.getElementById('playlist');
    albumArt = document.querySelector('.album-art');
    loadingInitial = document.getElementById('loading-initial');
    
    console.log('✅ Elementos del DOM obtenidos');
    
    // Verificar que todos los elementos existan
    if (!audio || !playButton || !playlistEl) {
        console.error('❌ Elementos del DOM no encontrados');
        return;
    }
    
    initializePlayer();
    loadFromR2Auto();
});

function initializePlayer() {
    console.log('📍 Inicializando reproductor...');
    
    // Event listeners para audio
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleTrackEnd);
    audio.addEventListener('canplay', () => {
        if (albumArt) albumArt.classList.add('playing');
    });
    audio.addEventListener('pause', () => {
        if (albumArt) albumArt.classList.remove('playing');
    });

    // Botones de control
    playButton.addEventListener('click', togglePlay);
    prevButton.addEventListener('click', previousTrack);
    nextButton.addEventListener('click', nextTrack);
    shuffleButton.addEventListener('click', toggleShuffle);
    repeatButton.addEventListener('click', toggleRepeat);

    // Volumen
    volumeSlider.addEventListener('input', changeVolume);

    // Progreso
    progressSlider.addEventListener('input', seek);
    progressSlider.addEventListener('change', seekEnd);

    // Teclas de teclado
    document.addEventListener('keydown', handleKeyPress);

    audio.volume = 0.7;
    console.log('✅ Reproductor inicializado');
}

// Auto-cargar desde Cloudflare R2
async function loadFromR2Auto() {
    try {
        console.log('🔄 Cargando desde Cloudflare R2...');
        console.log('URL:', r2BaseUrl + r2Track);
        
        // Crear playlist con el archivo de R2
        playerState.playlist = [{
            name: 'DJ Sebel - From da darkside - 4A',
            url: r2BaseUrl + r2Track,
            duration: 0
        }];

        playerState.currentTrackIndex = 0;
        
        console.log('✅ Playlist creada:', playerState.playlist);
        
        // Ocultar loading
        if (loadingInitial) {
            loadingInitial.style.display = 'none';
        }
        
        updatePlaylistUI();
        
        // Auto-play primera canción
        if (playerState.playlist.length > 0) {
            console.log('▶️ Reproduciendo pista 0');
            playTrack(0);
        }
    } catch (error) {
        console.error('❌ Error cargando desde R2:', error);
        if (loadingInitial) {
            loadingInitial.innerHTML = `<h3>❌ Error: ${error.message}</h3>`;
        }
    }
}

// Reproducción
function togglePlay() {
    if (playerState.playlist.length === 0) {
        alert('Por favor, carga canciones primero.');
        return;
    }

    if (playerState.isPlaying) {
        audio.pause();
        playerState.isPlaying = false;
        playButton.textContent = '▶️';
    } else {
        if (audio.src === '') {
            playTrack(playerState.currentTrackIndex);
        } else {
            audio.play().catch(err => console.error('Error playing:', err));
        }
        playerState.isPlaying = true;
        playButton.textContent = '⏸️';
    }
}

function playTrack(index) {
    if (playerState.playlist.length === 0) return;

    playerState.currentTrackIndex = index;
    const track = playerState.playlist[index];

    console.log('🎵 Reproduciendo:', track.name);
    console.log('URL:', track.url);

    audio.src = track.url;
    trackName.textContent = track.name;
    trackArtist.textContent = extractArtistName(track.name);

    audio.play().catch(err => {
        console.error('Error playing track:', err);
        nextTrack();
    });
    playerState.isPlaying = true;
    playButton.textContent = '⏸️';

    updatePlaylistUI();
}

function nextTrack() {
    if (playerState.playlist.length === 0) return;

    let nextIndex;
    if (playerState.shuffle) {
        nextIndex = getNextShuffleIndex();
    } else {
        nextIndex = (playerState.currentTrackIndex + 1) % playerState.playlist.length;
    }

    playTrack(nextIndex);
}

function previousTrack() {
    if (playerState.playlist.length === 0) return;

    let prevIndex;
    if (playerState.shuffle) {
        prevIndex = getPreviousShuffleIndex();
    } else {
        prevIndex = playerState.currentTrackIndex === 0 
            ? playerState.playlist.length - 1 
            : playerState.currentTrackIndex - 1;
    }

    playTrack(prevIndex);
}

function handleTrackEnd() {
    if (playerState.repeat === 2) {
        audio.currentTime = 0;
        audio.play();
    } else {
        nextTrack();
    }
}

// Shuffle
function toggleShuffle() {
    playerState.shuffle = !playerState.shuffle;
    shuffleButton.classList.toggle('active', playerState.shuffle);

    if (playerState.shuffle) {
        generateShuffleIndices();
    }
}

function generateShuffleIndices() {
    playerState.shuffledIndices = Array.from(
        { length: playerState.playlist.length },
        (_, i) => i
    );

    for (let i = playerState.shuffledIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [playerState.shuffledIndices[i], playerState.shuffledIndices[j]] =
            [playerState.shuffledIndices[j], playerState.shuffledIndices[i]];
    }
}

function getNextShuffleIndex() {
    const currentShufflePos = playerState.shuffledIndices.indexOf(
        playerState.currentTrackIndex
    );
    const nextPos = (currentShufflePos + 1) % playerState.shuffledIndices.length;
    return playerState.shuffledIndices[nextPos];
}

function getPreviousShuffleIndex() {
    const currentShufflePos = playerState.shuffledIndices.indexOf(
        playerState.currentTrackIndex
    );
    const prevPos = currentShufflePos === 0 
        ? playerState.shuffledIndices.length - 1 
        : currentShufflePos - 1;
    return playerState.shuffledIndices[prevPos];
}

// Repeat
function toggleRepeat() {
    playerState.repeat = (playerState.repeat + 1) % 3;
    repeatButton.classList.toggle('active', playerState.repeat > 0);

    if (playerState.repeat === 0) {
        repeatButton.textContent = '🔁';
    } else if (playerState.repeat === 1) {
        repeatButton.textContent = '🔂';
    } else {
        repeatButton.textContent = '🔃';
    }
}

// Volumen
function changeVolume(e) {
    const volume = e.target.value / 100;
    audio.volume = volume;
    volumeValue.textContent = Math.round(volume * 100) + '%';
}

// Progreso
function updateProgress() {
    const progress = (audio.currentTime / audio.duration) * 100;
    progressSlider.value = progress;
    currentTimeEl.textContent = formatTime(audio.currentTime);
}

function updateDuration() {
    durationEl.textContent = formatTime(audio.duration);
}

function seek(e) {
    const seekTime = (e.target.value / 100) * audio.duration;
    audio.currentTime = seekTime;
}

function seekEnd(e) {
    const seekTime = (e.target.value / 100) * audio.duration;
    audio.currentTime = seekTime;
    if (playerState.isPlaying) {
        audio.play();
    }
}

function updatePlaylistUI() {
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
        li.addEventListener('click', () => playTrack(index));

        playlistEl.appendChild(li);
    });
}

// Teclas de teclado
function handleKeyPress(e) {
    switch(e.code) {
        case 'Space':
            e.preventDefault();
            togglePlay();
            break;
        case 'ArrowRight':
            nextTrack();
            break;
        case 'ArrowLeft':
            previousTrack();
            break;
    }
}

// Utilidades
function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function extractArtistName(filename) {
    const parts = filename.split(' - ');
    if (parts.length > 1) {
        return parts[0];
    }
    return 'NCC Music';
}
