// A set's waveform is independent of the global player until the listener seeks.
(() => {
    let dispose = () => {};
    function mount(track, host) {
        dispose();
        const controller = new AbortController();
        const canvas = document.createElement('canvas'), status = document.createElement('p');
        canvas.tabIndex = 0; canvas.setAttribute('role', 'slider');
        canvas.setAttribute('aria-label', 'Posición en ' + track.name);
        canvas.setAttribute('aria-valuemin', '0'); canvas.setAttribute('aria-valuemax', '100');
        status.setAttribute('role', 'status'); status.textContent = 'Cargando forma de onda…';
        host.append(canvas, status);
        let peaks = [], pointer = false, pendingSeek = null;
        const active = () => currentTrack()?.key === track.key;
        const position = () => active() && isSeekable(audio) ? audio.currentTime / audio.duration : 0;
        function draw() {
            if (!host.isConnected) return;
            const rect = canvas.getBoundingClientRect(), width = Math.max(1, rect.width), height = 128;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.round(width * dpr); canvas.height = height * dpr;
            const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const ratio = position(), count = Math.max(24, Math.floor(width / 5));
            if (peaks.length) for (let i = 0; i < count; i++) {
                const at = i / (count - 1), h = Math.max(2, samplePeak(peaks, at) * 84), x = i * width / count;
                ctx.fillStyle = at < ratio ? '#c7f375' : 'rgba(190,198,193,.5)';
                ctx.fillRect(x, 92 - h, 3, h); ctx.globalAlpha = .35; ctx.fillRect(x, 95, 3, h * .34); ctx.globalAlpha = 1;
            }
            canvas.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
            canvas.setAttribute('aria-valuetext', Math.round(ratio * 100) + '%');
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
        const point = event => { const rect = canvas.getBoundingClientRect(); seek((event.clientX - rect.left) / rect.width); };
        canvas.addEventListener('pointerdown', event => { pointer = true; canvas.setPointerCapture(event.pointerId); point(event); });
        canvas.addEventListener('pointermove', event => { if (pointer) point(event); });
        for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { pointer = false; });
        canvas.addEventListener('keydown', event => {
            const delta = active() && isSeekable(audio) ? 5 / audio.duration : .01;
            const positions = { ArrowRight: position() + delta, ArrowLeft: position() - delta, Home: 0, End: 1 };
            if (event.key in positions) { event.preventDefault(); seek(positions[event.key]); }
        });
        for (const type of ['timeupdate', 'emptied', 'play', 'pause']) audio.addEventListener(type, draw);
        audio.addEventListener('loadedmetadata', applySeek); audio.addEventListener('durationchange', applySeek);
        window.addEventListener('resize', draw);
        dispose = () => {
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
