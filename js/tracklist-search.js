// Search the published tracklist archive without changing the text shown to listeners.
(() => {
    function normalize(value) {
        return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    }
    function sortByDate(tracks) {
        return [...tracks].sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.name.localeCompare(b.name, 'es'));
    }
    function search(tracks, query) {
        const tokens = normalize(query).split(' ').filter(Boolean);
        const available = sortByDate(tracks.filter(track => track.published !== false && track.playlistId !== 'radio'));
        if (!tokens.length) return { query: '', tokens, sets: available.map(track => ({ track, matches: null, metadataMatch: false })), matchCount: 0 };
        const sets = [];
        let matchCount = 0;
        for (const track of available) {
            const metadataMatch = tokens.every(token => normalize(`${track.name} ${track.date || ''}`).includes(token));
            const lines = Array.isArray(track.tracklist) ? track.tracklist : [];
            const matches = lines.map((text, index) => ({ index, text })).filter(item => metadataMatch || tokens.every(token => normalize(item.text).includes(token)));
            if (metadataMatch || matches.length) { sets.push({ track, matches, metadataMatch }); matchCount += matches.length; }
        }
        return { query: String(query), tokens, sets, matchCount };
    }
    window.NCCTracklistSearch = { normalize, search };
})();
