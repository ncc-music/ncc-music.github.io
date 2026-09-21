// A set's waveform is independent of the global player until the listener seeks.
(() => {
    const HOLD_TO_SCRUB_MS = 650;
    const DRAG_TOLERANCE_PX = 6;
    let dispose = () => {};
    function mount(track, host) {
        dispose();
        const controller = new AbortController();
        const frame = document.createElement('div'), canvas = document.createElement('canvas'), guide = document.createElement('span'), play = document.createElement('button'), status = document.createElement('p');
        host.replaceChildren(); frame.className = 'waveform-frame';
        canvas.tabIndex = 0; canvas.setAttribute('role', 'slider');
        canvas.setAttribute('aria-label', 'Reproducir o pausar ' + track.name + '. Mantené presionado y arrastrá para desplazarte.');
        canvas.setAttribute('aria-valuemin', '0'); canvas.setAttribute('aria-valuemax', '100');
        guide.className = 'waveform-guide'; guide.hidden = true; guide.setAttribute('aria-hidden', 'true');
        play.type = 'button'; play.className = host.id === 'expanded-waveform' ? 'waveform-play expanded-play' : 'waveform-play'; play.innerHTML = icon('play');
        if (host.id === 'expanded-waveform') play.id = 'expanded-play';
        play.setAttribute('aria-label', 'Reproducir ' + track.name); play.title = 'Reproducir';
        status.setAttribute('role', 'status'); status.textContent = 'Cargando forma de onda…';
        frame.append(canvas, guide, play); host.append(frame, status);
        let peaks = [], pointer = null, pendingSeek = null;
        const active = () => currentTrack()?.key === track.key;
        const position = () => active() && isSeekable(audio) ? audio.currentTime / audio.duration : 0;
        function syncPlay() {
            const playing = active() && !audio.paused && playerState.isPlaying;
            play.classList.toggle('is-invisible', playing);
            play.innerHTML = icon(playing ? 'pause' : 'play');
            play.setAttribute('aria-label', (playing ? 'Pausar ' : 'Reproducir ') + track.name);
            play.title = playing ? 'Pausa' : 'Reproducir';
        }
        function draw() {
            if (!host.isConnected) return;
            const rect = canvas.getBoundingClientRect(), width = Math.max(1, rect.width), height = Math.max(128, rect.height || 128);
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.round(width * dpr); canvas.height = height * dpr;
            const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const ratio = position(), count = Math.max(24, Math.floor(width / 5));
            if (peaks.length) for (let i = 0; i < count; i++) {
                const at = i / (count - 1), h = Math.max(2, samplePeak(peaks, at) * height * .66), x = i * width / count;
                ctx.fillStyle = at < ratio ? '#c7f375' : 'rgba(190,198,193,.5)';
                ctx.fillRect(x, height * .72 - h, 3, h); ctx.globalAlpha = .35; ctx.fillRect(x, height * .75, 3, h * .34); ctx.globalAlpha = 1;
            }
            canvas.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
            canvas.setAttribute('aria-valuetext', Math.round(ratio * 100) + '%');
            syncPlay();
        }
        function applySeek() {
            if (pendingSeek !== null && active() && isSeekable(audio)) {
                audio.currentTime = pendingSeek * audio.duration; pendingSeek = null; updateProgress(); draw();
            }
        }
        function seek(ratio) {
            if (!peaks.length) return;
            pendingSeek = clamp(ratio, 0, 1);
            if (!active()) {
                const playlist = playerState.playlists.find(p => p.tracks.some(t => t.key === track.key));
                if (!playlist) return;
                selectTrack(playlist.id, playlist.tracks.findIndex(t => t.key === track.key));
            }
            applySeek();
        }
        function togglePlayback() {
            if (!active()) {
                const playlist = playerState.playlists.find(p => p.tracks.some(t => t.key === track.key));
                if (!playlist) return;
                selectTrack(playlist.id, playlist.tracks.findIndex(t => t.key === track.key));
            }
            if (!audio.paused && playerState.isPlaying) audio.pause();
            else {
                if (isSeekable(audio) && audio.currentTime >= audio.duration) audio.currentTime = 0;
                startPlayback();
            }
        }
        const point = clientX => { const rect = canvas.getBoundingClientRect(); seek((clientX - rect.left) / rect.width); };
        const showGuide = clientX => {
            const rect = canvas.getBoundingClientRect();
            guide.style.left = `${clamp((clientX - rect.left) / rect.width, 0, 1) * 100}%`;
            guide.hidden = false;
        };
        const stopScrub = event => {
            if (!pointer || event.pointerId !== pointer.id) return;
            clearTimeout(pointer.holdTimer);
            pointer = null; canvas.classList.remove('is-scrubbing');
            if (event.pointerType !== 'mouse') guide.hidden = true;
        };
        canvas.addEventListener('pointerdown', event => {
            if (!event.isPrimary) return;
            canvas.setPointerCapture(event.pointerId);
            const id = event.pointerId;
            pointer = { id, startX: event.clientX, lastX: event.clientX, moved: false, held: false, scrubbing: false, holdTimer: 0 };
            pointer.holdTimer = setTimeout(() => {
                if (!pointer || pointer.id !== id) return;
                pointer.held = true; canvas.classList.add('is-scrubbing');
                if (pointer.moved) { pointer.scrubbing = true; point(pointer.lastX); }
            }, HOLD_TO_SCRUB_MS);
            showGuide(event.clientX);
        });
        canvas.addEventListener('pointermove', event => {
            if (!pointer || event.pointerId !== pointer.id) {
                if (event.pointerType === 'mouse') showGuide(event.clientX);
                return;
            }
            showGuide(event.clientX);
            pointer.lastX = event.clientX;
            if (Math.abs(event.clientX - pointer.startX) >= DRAG_TOLERANCE_PX) pointer.moved = true;
            if (pointer.held && pointer.moved) {
                pointer.scrubbing = true;
                point(event.clientX);
            }
        });
        canvas.addEventListener('pointerup', event => {
            if (!pointer || event.pointerId !== pointer.id) return;
            const wasScrubbing = pointer.scrubbing, wasHeld = pointer.held, wasMoved = pointer.moved; stopScrub(event);
            if (!wasScrubbing && !wasHeld && !wasMoved) togglePlayback();
        });
        for (const type of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(type, stopScrub);
        canvas.addEventListener('pointerleave', event => { if (!pointer && event.pointerType === 'mouse') guide.hidden = true; });
        canvas.addEventListener('keydown', event => {
            if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); togglePlayback(); return; }
            const delta = active() && isSeekable(audio) ? 5 / audio.duration : .01;
            const positions = { ArrowRight: position() + delta, ArrowLeft: position() - delta, Home: 0, End: 1 };
            if (event.key in positions) { event.preventDefault(); seek(positions[event.key]); }
        });
        play.addEventListener('click', event => {
            event.stopPropagation(); togglePlayback();
        });
        for (const type of ['timeupdate', 'emptied', 'play', 'pause']) audio.addEventListener(type, draw);
        audio.addEventListener('loadedmetadata', applySeek); audio.addEventListener('durationchange', applySeek);
        window.addEventListener('resize', draw);
        dispose = () => {
            if (pointer) clearTimeout(pointer.holdTimer);
            controller.abort(); pendingSeek = null;
            for (const type of ['timeupdate', 'emptied', 'play', 'pause']) audio.removeEventListener(type, draw);
            audio.removeEventListener('loadedmetadata', applySeek); audio.removeEventListener('durationchange', applySeek);
            window.removeEventListener('resize', draw);
        };
        draw();
        (async () => {
            try {
                const url = track.waveformUrl || track.url;
                peaks = track.peaks?.length ? track.peaks : waveformState.cache.get(url) || [];
                if (!peaks.length) {
                    if (track.format === 'FLAC') peaks = await analyzeFLAC(track, controller.signal, progress => {
                        if (!controller.signal.aborted) status.textContent = `Cargando forma de onda… ${progress}%`;
                    });
                    else {
                        if (track.size > 100 * 1024 * 1024) throw new Error('Audio too large');
                        const response = await fetch(url, { signal: controller.signal, mode: 'cors' });
                        if (!response.ok) throw new Error('Audio unavailable');
                        const buffer = await response.arrayBuffer();
                        if (controller.signal.aborted) return;
                        peaks = buildWaveformPeaks(await getWaveformAudioContext().decodeAudioData(buffer), 1400);
                    }
                }
                if (controller.signal.aborted) return;
                waveformState.cache.set(url, peaks); status.textContent = ''; draw();
            } catch (error) {
                if (controller.signal.aborted) return;
                status.textContent = 'Forma de onda no disponible. Podés usar la barra de progreso.';
            }
        })();
    }
    window.NCCDetailWaveform = { mount, dispose: () => dispose() };
})();
