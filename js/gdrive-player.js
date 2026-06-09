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

// Elementos del DOM
const audio = document.getElementById('audio-player');
const playButton = document.getElementById('play-button');
const prevButton = document.getElementById('prev-button');
const nextButton = document.getElementById('next-button');
const shuffleButton = document.getElementById('shuffle-button');
const repeatButton = document.getElementById('repeat-button');
const volumeSlider = document.getElementById('volume-slider');
const volumeValue = document.getElementById('volume-value');
const progressSlider = document.getElementById('progress-slider');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');
const trackName = document.getElementById('track-name');
const trackArtist = document.getElementById('track-artist');
const playlistEl = document.getElementById('playlist');
const albumArt = document.querySelector('.album-art');
const folderIdInput = document.getElementById('folder-id');
const loadGdriveBtn = document.getElementById('load-gdrive-btn');
const loadStatus = document.getElementById('load-status');
const playlistCount = document.getElementById('playlist-count');
const loadingInitial = document.getElementById('loading-initial');
const gdriveConfigPanel = document.getElementById('gdrive-config-panel');
const toggleConfigBtn = document.getElementById('toggle-config-btn');

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎵 Inicializando reproductor...');
    initializePlayer();
    loadFromR2Auto();
});

function initializePlayer() {
    console.log('📍 initializePlayer ejecutado');
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

    // Google Drive
    loadGdriveBtn.addEventListener('click', loadFromGoogleDrive);
    folderIdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loadFromGoogleDrive();
        }
    });

    // Toggle configuración
    toggleConfigBtn.addEventListener('click', () => {
        gdriveConfigPanel.style.display = gdriveConfigPanel.style.display === 'none' ? 'block' : 'none';
    });

    // Teclas de teclado
    document.addEventListener('keydown', handleKeyPress);

    audio.volume = 0.7;
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
        
        // Ocultar loading y mostrar reproductor
        loadingInitial.style.display = 'none';
        gdriveConfigPanel.style.display = 'none';
        
        updatePlaylistUI();
        
        // Auto-play primera canción
        if (playerState.playlist.length > 0) {
            console.log('▶️ Reproduciendo pista 0');
            playTrack(0);
        }
    } catch (error) {
        console.error('❌ Error cargando desde R2:', error);
        loadingInitial.innerHTML = `<h3>❌ Error: ${error.message}</h3>`;
        gdriveConfigPanel.style.display = 'block';
    }
}

// Obtener archivos de Google Drive - Método directo
async function getGoogleDriveFilesViaDirect(folderId) {
    try {
        // Método 1: Usar el endpoint de descarga directa
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&spaces=drive&fields=id,name,mimeType&pageSize=1000&key=AIzaSyDyWJOw5w-1yfWreKdy0sXiaTmMO8Ky4S8`,
            {
                method: 'GET'
            }
        );

        if (response.ok) {
            const data = await response.json();
            if (data.files && data.files.length > 0) {
                return data.files.map(f => ({
                    name: f.name,
                    id: f.id
                }));
            }
        }
        
        throw new Error('API method 1 failed');
    } catch (error) {
        console.warn('API method 1 failed, trying method 2:', error);
        return await getGoogleDriveFilesViaDirect2(folderId);
    }
}

// Método alternativo: Parser HTML
async function getGoogleDriveFilesViaDirect2(folderId) {
    try {
        // Usar un proxy público para evitar CORS
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files?corpora=user&q=%27${folderId}%27+in+parents&fields=files(id,name)&pageSize=1000&key=AIzaSyDyWJOw5w-1yfWreKdy0sXiaTmMO8Ky4S8`
        );

        if (response.ok) {
            const data = await response.json();
            return (data.files || []).map(f => ({
                name: f.name,
                id: f.id
            }));
        }

        throw new Error('Method 2 failed');
    } catch (error) {
        console.warn('Method 2 failed, trying method 3:', error);
        // Última opción: intentar acceder a la carpeta pública
        return await tryPublicFolderAccess(folderId);
    }
}

// Intenta acceder directo a la carpeta pública
async function tryPublicFolderAccess(folderId) {
    // Este método intenta cargar archivos conocidos
    // Ya que la carpeta es pública, los usuarios podrían compartir los IDs manualmente
    console.warn('Métodos automáticos agotados. Usando archivos pre-cargados.');
    
    // Retornar array vacío para que el usuario configure manualmente
    throw new Error('No se pudieron obtener los archivos automáticamente. Por favor, usa el botón "Cambiar carpeta" e intenta de nuevo con el ID de carpeta correcto.');
}

// Cargar archivos desde Google Drive (manual)
async function loadFromGoogleDrive() {
    const folderId = folderIdInput.value.trim();
    
    if (!folderId) {
        showStatus('Por favor ingresa un ID de carpeta válido', 'error');
        return;
    }

    showStatus('Cargando archivos...', 'loading');
    
    try {
        const files = await getGoogleDriveFilesViaDirect(folderId);
        
        if (files.length === 0) {
            showStatus('No se encontraron archivos en esta carpeta. Verifica el ID.', 'error');
            playerState.playlist = [];
            updatePlaylistUI();
            return;
        }

        // Filtrar solo archivos de audio
        const audioFiles = files.filter(file => {
            const name = file.name.toLowerCase();
            return name.match(/\.(flac|wav|mp3|ogg|m4a|aac)$/i);
        });

        if (audioFiles.length === 0) {
            showStatus('No se encontraron archivos de audio en esta carpeta', 'error');
            playerState.playlist = [];
            updatePlaylistUI();
            return;
        }

        // Crear playlist
        playerState.playlist = audioFiles.map(file => ({
            name: file.name.replace(/\.[^/.]+$/, ''),
            id: file.id,
            url: `https://drive.google.com/uc?id=${file.id}&export=download`,
            duration: 0
        }));

        playerState.currentTrackIndex = 0;
        updatePlaylistUI();
        showStatus(`✅ Se cargaron ${audioFiles.length} canciones correctamente`, 'success');
        gdriveConfigPanel.style.display = 'none';
        
        // Auto-play primera canción
        if (playerState.playlist.length > 0) {
            playTrack(0);
        }
    } catch (error) {
        console.error('Error:', error);
        showStatus(`Error: ${error.message}`, 'error');
        playerState.playlist = [];
        updatePlaylistUI();
    }
}

function showStatus(message, type) {
    loadStatus.textContent = message;
    loadStatus.className = `load-status ${type}`;
    
    if (type === 'success') {
        setTimeout(() => {
            loadStatus.className = 'load-status';
        }, 5000);
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
        showStatus('Error al reproducir el archivo', 'error');
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

function updatePlaylistUI() {
    playlistEl.innerHTML = '';
    playlistCount.textContent = playerState.playlist.length;

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
