function analyzeFLAC(track, signal, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('/js/waveform-worker.js?v=20260919');
        let timeout;
        const cleanup = () => { worker.terminate(); clearTimeout(timeout); signal?.removeEventListener('abort', abort); };
        const abort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
        const refreshTimeout = () => { clearTimeout(timeout); timeout = setTimeout(() => { cleanup(); reject(new Error('Audio analysis timed out')); }, 120000); };
        worker.onmessage = ({data}) => {
            refreshTimeout();
            if (data.error) { cleanup(); reject(new Error(data.error)); }
            else if (data.peaks) { cleanup(); resolve(data.peaks); }
            else onProgress(data.progress);
        };
        worker.onerror = () => { cleanup(); reject(new Error('Audio analysis unavailable')); };
        if (signal?.aborted) { abort(); return; }
        signal?.addEventListener('abort', abort, {once:true}); refreshTimeout();
        worker.postMessage({url:track.waveformUrl || track.url,size:track.size});
    });
}
