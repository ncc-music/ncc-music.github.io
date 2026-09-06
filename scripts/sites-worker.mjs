// Private Sites preview: serve the catalogue through the same origin.
// GitHub Pages continues to use the existing public Worker directly.
const UPSTREAM = 'https://rapid-silence-8ef7.nc-music-87a.workers.dev';
const PREFIXES = new Set(['chill-out/', 'techno-freaks/']);
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname !== '/api/playlist' && !url.pathname.startsWith('/audio/')) {
            return env.ASSETS.fetch(request);
        }
        if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
        let target;
        if (url.pathname === '/api/playlist') {
            const prefix = url.searchParams.get('prefix');
            if (!PREFIXES.has(prefix)) return new Response('Unknown collection', { status: 400 });
            target = new URL('/playlist', UPSTREAM);
            target.searchParams.set('prefix', prefix);
        } else {
            let path;
            try { path = decodeURIComponent(url.pathname.slice('/audio/'.length)); }
            catch { return new Response('Invalid audio path', { status: 400 }); }
            if (![...PREFIXES].some(prefix => path.startsWith(prefix)) || path.split('/').includes('..')) {
                return new Response('Unknown audio', { status: 400 });
            }
            target = new URL(`/audio/${path.split('/').map(encodeURIComponent).join('/')}`, UPSTREAM);
        }
        try {
            const response = await fetch(target, { signal: AbortSignal.timeout(20000) });
            const headers = new Headers(response.headers);
            headers.delete('access-control-allow-origin');
            headers.set('Cache-Control', url.pathname === '/api/playlist' ? 'private, max-age=60' : 'private, max-age=3600');
            return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
        } catch {
            return Response.json({ error: 'Catalogue unavailable' }, { status: 502 });
        }
    }
};
