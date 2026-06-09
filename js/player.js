// Estado del reproductor
const playerState = {
    isPlaying: false,
    currentTrackIndex: 0,
    playlist: [],
    shuffle: false,
    repeat: 0,
    shuffledIndices: []
};

// Elementos del DOM
const audio = document.getElementById('audio-player');
const playButton = document.getElementById('play-button');
const prevButton = document.getElementById('prev-button');
const nextButton = document.getElementById('next-button');
const shuffleButton = document.getElementById('shuffle-button');
const repeatButton = document.getElementById('repeat-button');
const fileInput = document.getElementById('file-input');
const uploadBtn = document.querySelector('.upload-btn');
const volumeSlider = document.getElementById('volume-slider');
const volumeValue = document.getElementById('volume-value');
const progressSlider = document.getElementById('progress-slider');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');
const trackName = document.getElementById('track-name');
const trackArtist = document.getElementById('track-artist');
const playlistEl = document.getElementById('playlist');
const albumArt = document.querySelector('.album-art');

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    initializePlayer();
    loadSampleTracks();
});

function initializePlayer() {
    // Event listeners para audio
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleTrackEnd);
    audio.addEventListener('canplay', () => {
        albumArt.classList.add('playing');
    });
    audio.addEventListener('pause', () => {
        albumArt.classList.remove('playing');
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

    // Carga de archivos
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);

    // Teclas de teclado
    document.addEventListener('keydown', handleKeyPress);

    audio.volume = 0.7;
}

// Cargar tracks de ejemplo
function loadSampleTracks() {
    updatePlaylist();
}

// Reproducción
function togglePlay() {
    if (playerState.playlist.length === 0) {
        alert('Por favor, carga un archivo de audio primero.');
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
            audio.play();
        }
        playerState.isPlaying = true;
        playButton.textContent = '⏸️';
    }
}

function playTrack(index) {
    if (playerState.playlist.length === 0) return;

    playerState.currentTrackIndex = index;
    const track = playerState.playlist[index];

    audio.src = track.url;
    trackName.textContent = track.name;
    trackArtist.textContent = extractArtistName(track.name);

    audio.play();
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
    } else if (playerState.repeat === 1) {
        nextTrack();
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

// Carga de archivos
function handleFileUpload(e) {
    const files = Array.from(e.target.files);

    files.forEach(file => {
        const validTypes = ['audio/flac', 'audio/wav', 'audio/mpeg', 'audio/ogg', 
                           'audio/x-wav', 'audio/x-flac'];
        
        if (validTypes.some(type => file.type.includes(type)) || 
            file.name.match(/\.(flac|wav|mp3|ogg)$/i)) {
            
            const reader = new FileReader();

            reader.onload = (event) => {
                const track = {
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    url: event.target.result,
                    duration: 0,
                    file: file
                };

                playerState.playlist.push(track);
                updatePlaylist();

                if (playerState.playlist.length === 1) {
                    playTrack(0);
                }
            };

            reader.readAsDataURL(file);
        }
    });

    fileInput.value = '';
}

function updatePlaylist() {
    updatePlaylistUI();
}

function updatePlaylistUI() {
    playlistEl.innerHTML = '';

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