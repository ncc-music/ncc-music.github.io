// A set's waveform is independent of the global player until the listener seeks.
(() => {
    const HOLD_TO_SCRUB_MS = 650;
    const DRAG_TOLERANCE_PX = 6;
    let dispose = () => {};
    let activeView = null;
    const commentInitials = value => String(value || 'AnonymousFreak').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'AF';
    function mount(track, host) {
        dispose();
        const controller = new AbortController();
        const expanded = host.id === 'expanded-waveform';
        const frame = document.createElement('div'), canvas = document.createElement('canvas'), markerLayer = document.createElement('div'), guide = document.createElement('span'), play = document.createElement('button'), status = document.createElement('p');
        host.replaceChildren(); frame.className = 'waveform-frame';
        if (expanded) {
            const heading = document.createElement('div'), cover = document.createElement('img'), copy = document.createElement('div'), eyebrow = document.createElement('span'), title = document.createElement('h2');
            heading.className = 'expanded-waveform-heading'; cover.src = track.cover || 'assets/player-cover-clean.jpg'; cover.alt = 'Calavera de NCC';
            eyebrow.className = 'expanded-waveform-eyebrow'; eyebrow.textContent = track.playlistTitle || 'NCC MUSIC'; title.textContent = track.name;
            copy.append(eyebrow, title); heading.append(cover, copy); host.append(heading);
        }
        canvas.tabIndex = 0; canvas.setAttribute('role', 'slider');
        canvas.setAttribute('aria-label', 'Reproducir o pausar ' + track.name + '. Mantené presionado y arrastrá para desplazarte.');
        canvas.setAttribute('aria-valuemin', '0'); canvas.setAttribute('aria-valuemax', '100');
        guide.className = 'waveform-guide'; guide.hidden = true; guide.setAttribute('aria-hidden', 'true');
        markerLayer.className = 'waveform-comment-markers'; markerLayer.setAttribute('aria-label', 'Comentarios en el waveform');
        play.type = 'button'; play.className = expanded ? 'waveform-play expanded-play' : 'waveform-play'; play.innerHTML = icon('play');
        if (expanded) play.id = 'expanded-play';
        play.setAttribute('aria-label', 'Reproducir ' + track.name); play.title = 'Reproducir';
        status.setAttribute('role', 'status'); status.textContent = 'Cargando forma de onda…';
        frame.append(canvas, markerLayer, guide, play); host.append(frame, status);
        let peaks = [], pointer = null, pendingSeek = null, comments = [], draftPosition = null, pickHandler = null, renderedDuration = -1;
        const active = () => currentTrack()?.key === track.key;
        const position = () => active() && isSeekable(audio) ? audio.currentTime / audio.duration : 0;
        const duration = () => active() && isSeekable(audio) ? audio.duration : Number(track.duration) || 0;
        function renderMarkers(force = false) {
            const total = duration();
            if (!force && total === renderedDuration) return;
            renderedDuration = total; markerLayer.replaceChildren();
            if (!expanded || !total) return;
            for (const comment of comments) {
                if (comment.positionSeconds === null || comment.positionSeconds === undefined) continue;
                const seconds = Number(comment.positionSeconds);
                if (!Number.isFinite(seconds) || seconds < 0) continue;
                const marker = document.createElement('button'), avatar = document.createElement('span'), bubble = document.createElement('span'), bubbleMeta = document.createElement('span'), bubbleBody = document.createElement('span');
                marker.type = 'button'; marker.className = 'waveform-comment-marker'; avatar.className = 'waveform-comment-avatar'; bubble.className = 'waveform-comment-bubble'; bubbleMeta.className = 'waveform-comment-bubble-meta'; bubbleBody.className = 'waveform-comment-bubble-body';
                const markerPosition = clamp(seconds / total, 0, 1);
                marker.style.left = `${markerPosition * 100}%`; marker.dataset.commentId = comment.id || '';
                if (markerPosition < .14) marker.classList.add('is-edge-start');
                else if (markerPosition > .86) marker.classList.add('is-edge-end');
                marker.setAttribute('aria-label', `Comentario de ${comment.author || 'AnonymousFreak'} en ${formatTime(seconds)}`);
                avatar.textContent = commentInitials(comment.author); bubbleMeta.textContent = `${comment.author || 'AnonymousFreak'} · ${formatTime(seconds)}`; bubbleBody.textContent = comment.body || '';
                bubble.append(bubbleMeta, bubbleBody); marker.append(avatar, bubble);
                marker.addEventListener('click', event => {
                    event.stopPropagation();
                    const open = !marker.classList.contains('is-open');
                    markerLayer.querySelectorAll('.waveform-comment-marker.is-open').forEach(item => item.classList.remove('is-open'));
                    marker.classList.toggle('is-open', open);
                });
                markerLayer.append(marker);
            }
            if (Number.isFinite(draftPosition)) {
                const marker = document.createElement('span'); marker.className = 'waveform-comment-marker is-draft'; marker.style.left = `${clamp(draftPosition / total, 0, 1) * 100}%`;
                marker.setAttribute('aria-hidden', 'true'); marker.textContent = '+'; markerLayer.append(marker);
            }
        }
        function setComments(next) { comments = Array.isArray(next) ? next : []; renderedDuration = -1; renderMarkers(true); }
        function setDraftPosition(seconds) {
            const next = Number.isFinite(seconds) ? seconds : null;
            if (Object.is(next, draftPosition)) return;
            draftPosition = next; renderedDuration = -1; renderMarkers(true);
        }
        function cancelCommentPick() {
            pickHandler = null; guide.hidden = true; frame.classList.remove('is-comment-picking');
            if (!peaks.length) status.textContent = 'Cargando forma de onda…'; else status.textContent = '';
        }
        function pickCommentPosition(callback) {
            if (!expanded || typeof callback !== 'function') return false;
            pickHandler = callback; frame.classList.add('is-comment-picking');
            status.textContent = 'Tocá el punto del waveform donde querés dejar el comentario.'; canvas.focus(); return true;
        }
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
            syncPlay(); renderMarkers();
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
        function seekTo(seconds) {
            const total = duration();
            if (!total || !Number.isFinite(Number(seconds))) return false;
            seek(Number(seconds) / total); return true;
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
            if (pickHandler) {
                pointer = { id, choosing: true, startX: event.clientX, lastX: event.clientX, moved: false, held: false, scrubbing: false, holdTimer: 0 };
                showGuide(event.clientX); return;
            }
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
            if (pointer.choosing) return;
            if (Math.abs(event.clientX - pointer.startX) >= DRAG_TOLERANCE_PX) pointer.moved = true;
            if (pointer.held && pointer.moved) {
                pointer.scrubbing = true;
                point(event.clientX);
            }
        });
        canvas.addEventListener('pointerup', event => {
            if (!pointer || event.pointerId !== pointer.id) return;
            if (pointer.choosing) {
                const rect = canvas.getBoundingClientRect(), total = duration(), ratio = clamp((pointer.lastX - rect.left) / rect.width, 0, 1), callback = pickHandler;
                stopScrub(event);
                if (!total) { status.textContent = 'Esperá a que cargue la duración del set.'; return; }
                cancelCommentPick(); setDraftPosition(ratio * total); callback(ratio * total); return;
            }
            const wasScrubbing = pointer.scrubbing, wasHeld = pointer.held, wasMoved = pointer.moved; stopScrub(event);
            if (!wasScrubbing && !wasHeld && !wasMoved) togglePlayback();
        });
        for (const type of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(type, stopScrub);
        canvas.addEventListener('pointerleave', event => { if (!pointer && event.pointerType === 'mouse') guide.hidden = true; });
        canvas.addEventListener('keydown', event => {
            if (pickHandler && [' ', 'Enter'].includes(event.key)) {
                event.preventDefault(); const callback = pickHandler, total = duration();
                if (!total) { status.textContent = 'Esperá a que cargue la duración del set.'; return; }
                cancelCommentPick(); setDraftPosition(position() * total); callback(position() * total); return;
            }
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
            controller.abort(); pendingSeek = null; pickHandler = null; activeView = null;
            for (const type of ['timeupdate', 'emptied', 'play', 'pause']) audio.removeEventListener(type, draw);
            audio.removeEventListener('loadedmetadata', applySeek); audio.removeEventListener('durationchange', applySeek);
            window.removeEventListener('resize', draw);
        };
        activeView = { host, track, setComments, setDraftPosition, pickCommentPosition, cancelCommentPick, seekTo };
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
    window.NCCDetailWaveform = {
        mount,
        dispose: () => dispose(),
        setComments: comments => activeView?.setComments(comments),
        setDraftPosition: seconds => activeView?.setDraftPosition(seconds),
        pickCommentPosition: callback => Boolean(activeView?.pickCommentPosition(callback)),
        cancelCommentPick: () => activeView?.cancelCommentPick(),
        seekTo: seconds => Boolean(activeView?.seekTo(seconds))
    };
})();
