// Decode FLAC incrementally and retain only amplitude peaks, never the whole PCM audio.
importScripts('/assets/vendor/flac-decoder-0.2.11.min.js');
self.onmessage = async ({ data }) => {
    let decoder, reader;
    try {
        decoder = new self['flac-decoder'].FLACDecoder(); await decoder.ready;
        const response = await fetch(data.url);
        if (!response.ok || !response.body) throw new Error('Audio unavailable');
        reader = response.body.getReader();
        const total = Number(response.headers.get('Content-Length')) || data.size;
        const blocks = []; let samples = 0, blockPeak = 0, blockSamples = 0, loaded = 0, lastProgress = -1;
        function collect(decoded) {
            if (decoded.errors?.length) throw new Error('Invalid FLAC');
            for (let i = 0; i < decoded.samplesDecoded; i++) {
                for (const channel of decoded.channelData) blockPeak = Math.max(blockPeak, Math.abs(channel[i]));
                samples++; blockSamples++;
                if (blockSamples === 8192) { blocks.push(blockPeak); blockPeak = 0; blockSamples = 0; }
            }
        }
        while (true) {
            const { done, value } = await reader.read(); if (done) break;
            collect(await decoder.decode(value)); loaded += value.length;
            const percent = total ? Math.min(99, Math.round(100 * loaded / total)) : 0;
            if (percent !== lastProgress) { self.postMessage({ progress: percent }); lastProgress = percent; }
        }
        collect(await decoder.flush()); if (blockSamples) blocks.push(blockPeak);
        if (!samples) throw new Error('Empty audio');
        const peaks = Array.from({length: 1400}, (_, i) => {
            let peak = 0;
            const from = Math.floor(i * blocks.length / 1400), to = Math.max(from + 1, Math.floor((i + 1) * blocks.length / 1400));
            for (let index = from; index < Math.min(to, blocks.length); index++) peak = Math.max(peak, blocks[index]);
            return peak;
        });
        const maximum = Math.max(...peaks) || 1;
        self.postMessage({ peaks: peaks.map(p => Math.round(p / maximum * 10000) / 10000) });
    } catch { self.postMessage({ error: 'No pudimos analizar el audio. Volvé a intentar.' }); }
    finally { await reader?.cancel().catch(() => {}); decoder?.free(); }
};
