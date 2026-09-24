// A set's waveform is independent of the global player until the listener seeks.
(() => {
    const HOLD_TO_SCRUB_MS = 500;
    const DRAG_TOLERANCE_PX = 6;
    const COMMENT_ZONE_START = .68;
    const COMMENT_CLUSTER_DISTANCE = .022;
    let dispose = () => {};
    let activeView = null;
    const commentInitials = value => String(value || 'AnonymousFreak').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'AF';
    const preparePeaks = source => {
        const clean = Array.from(source || [], value => Math.max(0, Number.isFinite(Number(value)) ? Math.abs(Number(value)) : 0));
        if (!clean.length) return clean;
        const ordered = [...clean].sort((a, b) => a - b);
        const ceiling = Math.max(.01, ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * .97))]);
        const normalized = clean.map(value => Math.min(1, value / ceiling));
        return normalized.map((_, index) => {
            let sum = 0, weight = 0;
            for (let offset = -2; offset <= 2; offset++) {
                const sample = normalized[Math.max(0, Math.min(normalized.length - 1, index + offset))];
                const sampleWeight = 3 - Math.abs(offset);
                sum += sample * sampleWeight; weight += sampleWeight;
            }
            return sum / weight;
        });
    };
    function mount(track, host) {
        dispose();
        const controller = new AbortController();
        const expanded = host.id === 'expanded-waveform';
        const frame = document.createElement('div'), canvas = document.createElement('canvas'), markerLayer = document.createElement('div'), guide = document.createElement('span'), hoverTime = document.createElement('span'), commentCue = document.createElement('span'), play = document.createElement('button'), timeRow = document.createElement('div'), currentLabel = document.createElement('span'), durationLabel = document.createElement('span'), status = document.createElement('p');
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
        hoverTime.className = 'waveform-hover-time'; hoverTime.hidden = true; hoverTime.setAttribute('aria-hidden', 'true');
        commentCue.className = 'waveform-comment-cue'; commentCue.hidden = true; commentCue.textContent = '+'; commentCue.setAttribute('aria-hidden', 'true');
        markerLayer.className = 'waveform-comment-markers'; markerLayer.setAttribute('aria-label', 'Comentarios en el waveform');
        play.type = 'button'; play.className = expanded ? 'waveform-play expanded-play' : 'waveform-play'; play.innerHTML = icon('play');
        if (expanded) play.id = 'expanded-play';
        play.setAttribute('aria-label', 'Reproducir ' + track.name); play.title = 'Reproducir';
        timeRow.className = 'waveform-time-row'; currentLabel.textContent = '0:00'; durationLabel.textContent = formatTrackDuration(track.duration);
        if (expanded) { currentLabel.id = 'expanded-current'; durationLabel.id = 'expanded-duration'; }
        timeRow.append(currentLabel, durationLabel);
        status.setAttribute('role', 'status'); status.textContent = 'Cargando forma de onda…';
        frame.append(canvas, markerLayer, guide, hoverTime, commentCue, play); host.append(frame, timeRow, status);
        let peaks = [], pointer = null, pendingSeek = null, comments = [], draftPosition = null, pickHandler = null, renderedDuration = -1, loading = true, loadingFrame = 0;
        const active = () => currentTrack()?.key === track.key;
        const position = () => active() && isSeekable(audio) ? audio.currentTime / audio.duration : 0;
        const duration = () => active() && isSeekable(audio) ? audio.duration : Number(track.duration) || 0;
        function renderMarkers(force = false) {
            const total = duration();
            if (!force && total === renderedDuration) return;
            renderedDuration = total; markerLayer.replaceChildren();
            if (!expanded || !total) return;
            const positioned = comments.map(comment => ({ comment, seconds: Number(comment.positionSeconds) }))
                .filter(item => item.comment.positionSeconds !== null && item.comment.positionSeconds !== undefined && Number.isFinite(item.seconds) && item.seconds >= 0)
                .sort((a, b) => a.seconds - b.seconds);
            const groups = [];
            for (const item of positioned) {
                const previous = groups.at(-1), itemRatio = clamp(item.seconds / total, 0, 1);
                if (previous && itemRatio - previous.lastRatio <= COMMENT_CLUSTER_DISTANCE) {
                    previous.items.push(item); previous.lastRatio = itemRatio;
                } else groups.push({ items: [item], lastRatio: itemRatio });
            }
            for (const group of groups) {
                const seconds = group.items.reduce((sum, item) => sum + item.seconds, 0) / group.items.length;
                const comment = group.items[0].comment;
                const marker = document.createElement('button'), avatar = document.createElement('span'), bubble = document.createElement('span'), bubbleMeta = document.createElement('span'), bubbleBody = document.createElement('span');
                marker.type = 'button'; marker.className = 'waveform-comment-marker'; avatar.className = 'waveform-comment-avatar'; bubble.className = 'waveform-comment-bubble'; bubbleMeta.className = 'waveform-comment-bubble-meta'; bubbleBody.className = 'waveform-comment-bubble-body';
                const markerPosition = clamp(seconds / total, 0, 1);
                marker.style.left = `${markerPosition * 100}%`; marker.dataset.commentId = comment.id || '';
                if (group.items.length > 1) marker.classList.add('is-cluster');
                if (markerPosition < .14) marker.classList.add('is-edge-start');
                else if (markerPosition > .86) marker.classList.add('is-edge-end');
                marker.setAttribute('aria-label', group.items.length > 1 ? `${group.items.length} comentarios cerca de ${formatTime(seconds)}` : `Comentario de ${comment.author || 'AnonymousFreak'} en ${formatTime(seconds)}`);
                avatar.textContent = group.items.length > 1 ? String(group.items.length) : commentInitials(comment.author);
                bubbleMeta.textContent = group.items.length > 1 ? `${group.items.length} COMENTARIOS · ${formatTime(seconds)}` : `${comment.author || 'AnonymousFreak'} · ${formatTime(seconds)}`;
                bubbleBody.textContent = group.items.length > 1
                    ? group.items.slice(0, 3).map(item => `${item.comment.author || 'AnonymousFreak'}: ${item.comment.body || ''}`).join(' · ')
                    : comment.body || '';
                bubble.append(bubbleMeta, bubbleBody); marker.append(avatar, bubble);
                marker.addEventListener('click', event => {
                    event.stopPropagation();
                    const open = !marker.classList.contains('is-open');
                    markerLayer.querySelectorAll('.waveform-comment-marker.is-open').forEach(item => item.classList.remove('is-open'));
                    marker.classList.toggle('is-open', open);
                    seekTo(seconds);
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
            pickHandler = null; guide.hidden = true; hoverTime.hidden = true; commentCue.hidden = true; frame.classList.remove('is-comment-picking', 'is-comment-zone');
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
        function drawLoading(ctx, width, height, timestamp) {
            const count = Math.max(28, Math.floor(width / 9)), phase = timestamp / 650;
            for (let index = 0; index < count; index++) {
                const at = index / Math.max(1, count - 1), pulse = .16 + Math.abs(Math.sin(index * .43 - phase * 2.2)) * .18;
                const travel = Math.max(0, 1 - Math.abs(at - (phase % 1)) * 5) * .28;
                const barHeight = Math.max(3, (pulse + travel) * height), x = index * width / count;
                ctx.fillStyle = `rgba(190,198,193,${.12 + travel * .42})`;
                ctx.fillRect(x, height * .72 - barHeight, 3, barHeight);
                ctx.globalAlpha = .22; ctx.fillRect(x, height * .75, 3, barHeight * .25); ctx.globalAlpha = 1;
            }
        }
        function draw(timestamp = performance.now()) {
            if (!host.isConnected) return;
            const animationTime = Number.isFinite(timestamp) ? timestamp : performance.now();
            const rect = canvas.getBoundingClientRect(), width = Math.max(1, rect.width), height = Math.max(128, rect.height || 128);
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.round(width * dpr); canvas.height = height * dpr;
            const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const ratio = position(), count = Math.max(24, Math.floor(width / 5));
            if (!peaks.length && loading) drawLoading(ctx, width, height, animationTime);
            else if (peaks.length) for (let i = 0; i < count; i++) {
                const at = i / (count - 1), h = Math.max(2, samplePeak(peaks, at) * height * .66), x = i * width / count;
                ctx.fillStyle = at < ratio ? '#9fbe7a' : 'rgba(190,198,193,.5)';
                ctx.fillRect(x, height * .72 - h, 3, h); ctx.globalAlpha = .35; ctx.fillRect(x, height * .75, 3, h * .34); ctx.globalAlpha = 1;
            }
            ctx.fillStyle = 'rgba(240,241,242,.34)'; ctx.fillRect(0, Math.round(height * .735), width, 1);
            currentLabel.textContent = active() && isSeekable(audio) ? formatTime(audio.currentTime) : '0:00';
            durationLabel.textContent = formatTrackDuration(duration());
            canvas.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
            canvas.setAttribute('aria-valuetext', Math.round(ratio * 100) + '%');
            syncPlay(); renderMarkers();
        }
        function animateLoading(timestamp) {
            if (!loading || controller.signal.aborted || !host.isConnected) { loadingFrame = 0; return; }
            draw(timestamp); loadingFrame = requestAnimationFrame(animateLoading);
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
        const pointerDetails = (clientX, clientY) => {
            const rect = canvas.getBoundingClientRect();
            const ratio = clamp((clientX - rect.left) / rect.width, 0, 1), verticalRatio = clamp((clientY - rect.top) / rect.height, 0, 1);
            const left = `${ratio * 100}%`, total = duration();
            guide.style.left = left;
            guide.hidden = false;
            hoverTime.style.left = left; hoverTime.textContent = formatTime(total * ratio); hoverTime.hidden = !total;
            const inCommentZone = expanded && verticalRatio >= COMMENT_ZONE_START;
            commentCue.style.left = left; commentCue.hidden = !inCommentZone || !total;
            frame.classList.toggle('is-comment-zone', inCommentZone);
            return { ratio, inCommentZone, seconds: total * ratio };
        };
        const hidePointerHints = () => {
            guide.hidden = true; hoverTime.hidden = true; commentCue.hidden = true; frame.classList.remove('is-comment-zone');
        };
        const selectCommentAt = seconds => {
            if (!expanded || !Number.isFinite(seconds)) return;
            setDraftPosition(seconds);
            host.dispatchEvent(new CustomEvent('ncc:comment-position', { bubbles: true, detail: { seconds } }));
        };
        const stopScrub = event => {
            if (!pointer || event.pointerId !== pointer.id) return;
            clearTimeout(pointer.holdTimer);
            pointer = null; canvas.classList.remove('is-scrubbing');
            if (event.pointerType !== 'mouse') hidePointerHints();
        };
        canvas.addEventListener('pointerdown', event => {
            if (!event.isPrimary) return;
            canvas.setPointerCapture(event.pointerId);
            const id = event.pointerId;
            const details = pointerDetails(event.clientX, event.clientY);
            if (pickHandler) {
                pointer = { id, choosing: true, startX: event.clientX, lastX: event.clientX, moved: false, held: false, scrubbing: false, holdTimer: 0 };
                return;
            }
            if (details.inCommentZone) {
                pointer = { id, commenting: true, startX: event.clientX, lastX: event.clientX, moved: false, held: false, scrubbing: false, holdTimer: 0 };
                return;
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
                if (event.pointerType === 'mouse') pointerDetails(event.clientX, event.clientY);
                return;
            }
            const details = pointerDetails(event.clientX, event.clientY);
            pointer.lastX = event.clientX;
            if (pointer.choosing || pointer.commenting) {
                pointer.seconds = details.seconds;
                return;
            }
            if (Math.abs(event.clientX - pointer.startX) >= DRAG_TOLERANCE_PX) pointer.moved = true;
            if (pointer.held && pointer.moved) {
                pointer.scrubbing = true;
                point(event.clientX);
            }
        });
        canvas.addEventListener('pointerup', event => {
            if (!pointer || event.pointerId !== pointer.id) return;
            if (pointer.commenting) {
                const details = pointerDetails(event.clientX, event.clientY), seconds = details.seconds;
                stopScrub(event); selectCommentAt(seconds); return;
            }
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
        canvas.addEventListener('pointerleave', event => { if (!pointer && event.pointerType === 'mouse') hidePointerHints(); });
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
            if (loadingFrame) cancelAnimationFrame(loadingFrame);
            controller.abort(); pendingSeek = null; pickHandler = null; activeView = null;
            for (const type of ['timeupdate', 'emptied', 'play', 'pause']) audio.removeEventListener(type, draw);
            audio.removeEventListener('loadedmetadata', applySeek); audio.removeEventListener('durationchange', applySeek);
            window.removeEventListener('resize', draw);
        };
        activeView = { host, track, setComments, setDraftPosition, pickCommentPosition, cancelCommentPick, seekTo };
        frame.classList.add('is-loading'); draw(); loadingFrame = requestAnimationFrame(animateLoading);
        (async () => {
            try {
                const url = track.waveformUrl || track.url;
                let rawPeaks = track.peaks?.length ? track.peaks : waveformState.cache.get(url) || [];
                if (!rawPeaks.length) {
                    if (track.format === 'FLAC') rawPeaks = await analyzeFLAC(track, controller.signal, progress => {
                        if (!controller.signal.aborted) status.textContent = `Cargando forma de onda… ${progress}%`;
                    });
                    else {
                        if (track.size > 100 * 1024 * 1024) throw new Error('Audio too large');
                        const response = await fetch(url, { signal: controller.signal, mode: 'cors' });
                        if (!response.ok) throw new Error('Audio unavailable');
                        const buffer = await response.arrayBuffer();
                        if (controller.signal.aborted) return;
                        rawPeaks = buildWaveformPeaks(await getWaveformAudioContext().decodeAudioData(buffer), 1400);
                    }
                }
                if (controller.signal.aborted) return;
                waveformState.cache.set(url, rawPeaks); peaks = preparePeaks(rawPeaks); loading = false; frame.classList.remove('is-loading'); status.textContent = ''; draw();
            } catch (error) {
                if (controller.signal.aborted) return;
                loading = false; frame.classList.remove('is-loading');
                status.textContent = 'Forma de onda no disponible. Podés usar la barra de progreso.';
                draw();
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
