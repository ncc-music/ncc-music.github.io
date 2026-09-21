// Bundled into cloudflare-worker.js by scripts/bundle-worker.mjs.
const COLLECTIONS = ['techno-freaks/', 'chill-out/', 'radio/'];
const ORIGIN = 'https://ncc.ar';
const jwksCache = new Map();
const encoder = new TextEncoder();
let communityPositionReady = false;
async function stableId(key) {
    const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(key));
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
}
function slugify(title) {
    return title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'set';
}
async function catalogue(env, origin, includeDrafts = false) {
    const bucket = env.MY_BUCKET || env.MUSIC_BUCKET;
    if (!bucket) throw new Error('Storage unavailable');
    const rows = env.SITE_DB ? (await env.SITE_DB.prepare('SELECT * FROM sets').all()).results : [];
    const counts = env.SITE_DB ? (await env.SITE_DB.prepare('SELECT set_id, COUNT(*) AS count FROM likes GROUP BY set_id').all()).results : [];
    const metadata = new Map(rows.map(row => [row.audio_key, row]));
    const likes = new Map(counts.map(row => [row.set_id, row.count]));
    const groups = await Promise.all(COLLECTIONS.map(prefix => listAllAudioObjects(bucket, prefix)));
    const base = (env.R2_PUBLIC_URL || R2_PUBLIC_URL).replace(/\/$/, '');
    const objects = groups.flat();
    const activeKeys = new Set(objects.map(object => object.key));
    const activeTracks = await Promise.all(objects.map(async object => {
        const saved = metadata.get(object.key);
        const id = saved?.id || await stableId(object.key);
        const name = saved?.title || object.customMetadata?.title || titleFromKey(object.key);
        return {
            id, key: object.key, name, artist: object.customMetadata?.artist || 'Nicolás Cardú',
            slug: saved?.slug || `${slugify(titleFromKey(object.key))}-${id.slice(0, 8)}`,
            date: saved?.date || '', tracklist: saved ? JSON.parse(saved.tracklist) : [],
            published: saved ? Boolean(saved.published) : true, version: saved?.version || 0,
            peaks: saved?.peaks ? JSON.parse(saved.peaks) : null,
            likes: env.SITE_DB ? likes.get(id) || 0 : null,
            url: `${base}/${encodePath(object.key)}`, waveformUrl: `${origin}/api/audio/${encodePath(object.key)}`,
            size: object.size, contentType: object.httpMetadata?.contentType || contentTypeFromKey(object.key), available: true
        };
    }));
    // Keep published tracklists searchable after an audio object is retired from R2.
    const archivedTracks = rows.filter(row => !activeKeys.has(row.audio_key)).map(row => ({
        id: row.id, key: row.audio_key, name: row.title, artist: 'Nicolás Cardú', slug: row.slug,
        date: row.date || '', tracklist: JSON.parse(row.tracklist || '[]'), published: Boolean(row.published),
        version: row.version || 0, peaks: row.peaks ? JSON.parse(row.peaks) : null,
        likes: env.SITE_DB ? likes.get(row.id) || 0 : null, url: '', waveformUrl: '', size: 0,
        contentType: contentTypeFromKey(row.audio_key), available: false
    }));
    const tracks = [...activeTracks, ...archivedTracks];
    return tracks.filter(track => includeDrafts || track.published);
}
function writeOriginAllowed(request, env) {
    const allowed = [...DEFAULT_ALLOWED_ORIGINS, ...(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim())];
    return allowed.includes(request.headers.get('Origin'));
}
function bytesFromBase64URL(value) {
    const text = value.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(text.padEnd(Math.ceil(text.length / 4) * 4, '=')), c => c.charCodeAt(0));
}
async function verifyAdmin(request, env) {
    // Every request is verified, including requests made directly to workers.dev.
    if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL) return false;
    const domain = env.ACCESS_TEAM_DOMAIN.replace(/^https:\/\//, '').replace(/\/$/, '');
    if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain)) return false;
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token || token.length > 16384) return false;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return false;
        const header = JSON.parse(new TextDecoder().decode(bytesFromBase64URL(parts[0])));
        const claims = JSON.parse(new TextDecoder().decode(bytesFromBase64URL(parts[1])));
        const now = Date.now() / 1000;
        if (header.alg !== 'RS256' || claims.iss !== `https://${domain}` || !Array.isArray(claims.aud) || !claims.aud.includes(env.ACCESS_AUD)
            || !Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf && claims.nbf > now)
            || claims.email?.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) return false;
        let cached = jwksCache.get(domain);
        if (!cached || cached.expires < Date.now() || !cached.keys.some(key => key.kid === header.kid)) {
            const response = await fetch(`https://${domain}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
            if (!response.ok) return false;
            cached = { keys: (await response.json()).keys, expires: Date.now() + 300000 };
            jwksCache.set(domain, cached);
        }
        const jwk = cached.keys.find(key => key.kid === header.kid && key.kty === 'RSA');
        if (!jwk) return false;
        const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
        return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytesFromBase64URL(parts[2]), encoder.encode(parts.slice(0, 2).join('.')));
    } catch { return false; }
}
async function readSmallJSON(request) {
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('JSON required');
    // Bound streamed bodies as well as bodies with Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Body required');
    const chunks = []; let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 131072) { await reader.cancel(); throw new Error('Body too large'); }
        chunks.push(value);
    }
    const body = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(body));
}
function validSetInput(value) {
    return typeof value.title === 'string' && value.title.trim().length > 0 && value.title.length <= 240
        && typeof value.date === 'string' && (value.date === '' || /^\d{4}-\d{2}-\d{2}$/.test(value.date) && new Date(value.date).toISOString().slice(0, 10) === value.date)
        && Array.isArray(value.tracklist) && value.tracklist.length <= 500 && value.tracklist.every(line => typeof line === 'string' && line.length <= 1000)
        && typeof value.published === 'boolean' && Number.isSafeInteger(value.version) && value.version >= 0
        && (value.peaks === undefined || value.peaks === null || Array.isArray(value.peaks) && value.peaks.length >= 50 && value.peaks.length <= 2000 && value.peaks.every(p => Number.isFinite(p) && p >= 0 && p <= 1));
}
const validVisitor = value => /^[a-f0-9-]{36}$/.test(value || '');
const cleanCommunityText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) ? value.trim() : '';
async function ensureCommunityPosition(env) {
    if (communityPositionReady) return;
    try { await env.SITE_DB.prepare('SELECT position_seconds FROM comments LIMIT 0').all(); }
    catch {
        try { await env.SITE_DB.prepare('ALTER TABLE comments ADD COLUMN position_seconds REAL').run(); }
        catch (error) { if (!/duplicate column/i.test(String(error?.message || error))) throw error; }
    }
    communityPositionReady = true;
}
const DEFAULT_CONTENT = {
    sets: { title: 'CARDÚ', genres: '[Experimental / Industrial]', description: 'MUSIC 4 FREAKS.' },
    about: { title: 'Nicølás Cardú', body: 'Does it matter?\nEnjoy the music! x)\n\nSets en audio lossless, FLAC y WAV.', bookingEmail: 'bookings@ncc.ar' },
    tour: { title: 'Próximas fechas', body: 'Las nuevas fechas se anunciarán acá.' }
};
async function siteContent(env) {
    if (!env.SITE_DB) return { content: DEFAULT_CONTENT, version: 0 };
    const rows = (await env.SITE_DB.prepare("SELECT content, version FROM site_content WHERE id = 'main'").all()).results;
    return rows.length ? { content: JSON.parse(rows[0].content), version: rows[0].version } : { content: DEFAULT_CONTENT, version: 0 };
}
function validContent(value) {
    if (!value || !Number.isSafeInteger(value.version) || value.version < 0) return false;
    const c = value.content;
    const string = (v, max, required = true) => typeof v === 'string' && v.length <= max && (!required || v.trim().length > 0);
    return c && string(c.sets?.title, 120) && string(c.sets?.genres, 200, false) && string(c.sets?.description, 500, false)
        && string(c.about?.title, 120) && string(c.about?.body, 10000, false)
        && string(c.about?.bookingEmail, 254, false) && (!c.about.bookingEmail || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(c.about.bookingEmail))
        && string(c.tour?.title, 120) && string(c.tour?.body, 10000, false)
        && (c.manifesto === undefined || ['en', 'es'].every(lang => string(c.manifesto?.['title_' + lang], 160) && string(c.manifesto?.['author_' + lang], 200, false) && string(c.manifesto?.['body_' + lang], 20000, false)));
}
async function handleSetService(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, '');
    const reply = (body, status = 200) => jsonResponse(body, request, env, status, { 'Cache-Control': 'no-store' });
    try {
        if (path.startsWith('/audio/') && request.method === 'GET') {
            const target = new URL(request.url); target.pathname = path;
            return streamAudio(target, request, env);
        }
        if (path.startsWith('/admin/')) {
            if (!await verifyAdmin(request, env)) return reply({ error: 'Iniciá sesión como administrador.' }, 401);
            if (!env.SITE_DB) return reply({ error: 'La edición todavía no está configurada.' }, 503);
            if (request.method === 'GET' && path === '/admin/login') return Response.redirect(`${ORIGIN}/#tracklists`, 302);
            if (request.method === 'GET' && path === '/admin/session') return reply({ admin: true });
            if (request.method === 'GET' && path === '/admin/sets') return reply({ tracks: await catalogue(env, url.origin, true) });
            if (request.method === 'GET' && path === '/admin/export') return reply({ sets: (await env.SITE_DB.prepare('SELECT * FROM sets').all()).results, site: await siteContent(env) });
            if (path === '/admin/content') {
                if (request.method === 'GET') return reply(await siteContent(env));
                if (request.method !== 'PUT') return reply({ error: 'Método no permitido.' }, 405);
                if (!writeOriginAllowed(request, env)) return reply({ error: 'Origin not allowed' }, 403);
                let input;
                try { input = await readSmallJSON(request); if (!validContent(input)) throw new Error(); }
                catch { return reply({ error: 'Revisá los textos y el correo de contacto.' }, 400); }
                const result = input.version === 0
                    ? await env.SITE_DB.prepare("INSERT OR IGNORE INTO site_content (id,content) VALUES ('main',?)").bind(JSON.stringify(input.content)).run()
                    : await env.SITE_DB.prepare("UPDATE site_content SET content = ?, version = version + 1, updated_at = datetime('now') WHERE id = 'main' AND version = ?").bind(JSON.stringify(input.content), input.version).run();
                if (result.meta.changes !== 1) return reply({ error: 'El contenido cambió en otra ventana. Cerrá el editor y volvé a abrirlo.' }, 409);
                return reply({ saved: true, version: input.version + 1 });
            }
            if (request.method !== 'PUT' || !/^\/admin\/sets\/[a-f0-9]{20}$/.test(path)) return reply({ error: 'Not found' }, 404);
            if (!writeOriginAllowed(request, env)) return reply({ error: 'Origin not allowed' }, 403);
            let input;
            try { input = await readSmallJSON(request); if (!validSetInput(input)) throw new Error(); }
            catch { return reply({ error: 'Revisá el nombre, la fecha y el tracklist.' }, 400); }
            const id = path.split('/').pop();
            const track = (await catalogue(env, url.origin, true)).find(item => item.id === id);
            if (!track) return reply({ error: 'Set no encontrado.' }, 404);
            const peaks = input.peaks === undefined ? track.peaks : input.peaks;
            let result;
            if (input.version === 0) {
                result = await env.SITE_DB.prepare('INSERT OR IGNORE INTO sets (id, audio_key, slug, title, date, tracklist, published, peaks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                    .bind(id, track.key, track.slug, input.title.trim(), input.date, JSON.stringify(input.tracklist), Number(input.published), peaks ? JSON.stringify(peaks) : null).run();
            } else {
                result = await env.SITE_DB.prepare("UPDATE sets SET title = ?, date = ?, tracklist = ?, published = ?, peaks = ?, version = version + 1, updated_at = datetime('now') WHERE id = ? AND version = ?")
                    .bind(input.title.trim(), input.date, JSON.stringify(input.tracklist), Number(input.published), peaks ? JSON.stringify(peaks) : null, id, input.version).run();
            }
            if (result.meta.changes !== 1) return reply({ error: 'El set cambió en otra ventana. Volvé a abrirlo antes de guardar.' }, 409);
            return reply({ saved: true, version: input.version + 1, slug: track.slug });
        }
        if (path === '/content' && request.method === 'GET') return reply(await siteContent(env));
        if (path === '/sets' && request.method === 'GET') return reply({ tracks: await catalogue(env, url.origin) });
        const match = path.match(/^\/sets\/([a-f0-9]{20})\/likes$/);
        if (match && ['GET', 'PUT'].includes(request.method)) {
            if (!env.SITE_DB) return reply({ error: 'Likes unavailable' }, 503);
            const track = (await catalogue(env, url.origin)).find(item => item.id === match[1]);
            if (!track) return reply({ error: 'Set not found' }, 404);
            if (request.method === 'GET') return reply({ count: track.likes });
            if (!writeOriginAllowed(request, env)) return reply({ error: 'Origin not allowed' }, 403);
            let input;
            try { input = await readSmallJSON(request); } catch { return reply({ error: 'Invalid JSON' }, 400); }
            if (!/^[a-f0-9-]{36}$/.test(input.visitor || '') || typeof input.liked !== 'boolean') return reply({ error: 'Invalid like' }, 400);
            const visitor = await stableId(input.visitor);
            const statements = [input.liked
                ? env.SITE_DB.prepare('INSERT OR IGNORE INTO likes (set_id, visitor_id) VALUES (?, ?)').bind(track.id, visitor)
                : env.SITE_DB.prepare('DELETE FROM likes WHERE set_id = ? AND visitor_id = ?').bind(track.id, visitor),
                env.SITE_DB.prepare('SELECT COUNT(*) AS count FROM likes WHERE set_id = ?').bind(track.id)];
            const results = await env.SITE_DB.batch(statements);
            return reply({ count: results[1].results[0].count, liked: input.liked });
        }
        const communityMatch = path.match(/^\/sets\/([a-f0-9]{20})\/(community|comments|fire)$/);
        if (communityMatch) {
            if (!env.SITE_DB) return reply({ error: 'Comentarios no disponibles.' }, 503);
            await ensureCommunityPosition(env);
            const track = (await catalogue(env, url.origin)).find(item => item.id === communityMatch[1]);
            if (!track) return reply({ error: 'Set no encontrado.' }, 404);
            const section = communityMatch[2];
            if (section === 'community' && request.method === 'GET') {
                const [fireResult, commentResult] = await env.SITE_DB.batch([
                    env.SITE_DB.prepare('SELECT COUNT(*) AS count FROM fire_reactions WHERE set_id = ?').bind(track.id),
                    env.SITE_DB.prepare('SELECT id, author, body, position_seconds AS positionSeconds, created_at AS createdAt FROM comments WHERE set_id = ? ORDER BY created_at DESC, id DESC LIMIT 100').bind(track.id)
                ]);
                return reply({ fireCount: fireResult.results[0].count, comments: commentResult.results });
            }
            if (!writeOriginAllowed(request, env)) return reply({ error: 'Origin not allowed' }, 403);
            let input;
            try { input = await readSmallJSON(request); } catch { return reply({ error: 'Datos inválidos.' }, 400); }
            if (!validVisitor(input.visitor)) return reply({ error: 'Datos inválidos.' }, 400);
            const visitor = await stableId(input.visitor);
            if (section === 'fire' && request.method === 'PUT') {
                if (typeof input.reacted !== 'boolean') return reply({ error: 'Reacción inválida.' }, 400);
                const results = await env.SITE_DB.batch([
                    input.reacted
                        ? env.SITE_DB.prepare('INSERT OR IGNORE INTO fire_reactions (set_id, visitor_id) VALUES (?, ?)').bind(track.id, visitor)
                        : env.SITE_DB.prepare('DELETE FROM fire_reactions WHERE set_id = ? AND visitor_id = ?').bind(track.id, visitor),
                    env.SITE_DB.prepare('SELECT COUNT(*) AS count FROM fire_reactions WHERE set_id = ?').bind(track.id)
                ]);
                return reply({ count: results[1].results[0].count, reacted: input.reacted });
            }
            if (section === 'comments' && request.method === 'POST') {
                const body = cleanCommunityText(input.body, 600);
                const suppliedAuthor = typeof input.author === 'string' ? input.author.trim() : '';
                const author = suppliedAuthor ? cleanCommunityText(suppliedAuthor, 32) : 'AnonymousFreak';
                const rawPosition = input.positionSeconds;
                const positionSeconds = rawPosition === undefined || rawPosition === null ? null : Math.round(Number(rawPosition) * 10) / 10;
                if (!body || !author || positionSeconds !== null && (!Number.isFinite(positionSeconds) || positionSeconds < 0 || positionSeconds > 86400)) return reply({ error: 'Revisá el nombre, el comentario y su posición.' }, 400);
                const recent = await env.SITE_DB.prepare("SELECT COUNT(*) AS count FROM comments WHERE visitor_id = ? AND created_at >= datetime('now', '-1 hour')").bind(visitor).all();
                if (recent.results[0].count >= 5) return reply({ error: 'Esperá un poco antes de publicar otro comentario.' }, 429);
                const comment = { id: crypto.randomUUID(), author, body, positionSeconds, createdAt: new Date().toISOString() };
                await env.SITE_DB.prepare('INSERT INTO comments (id, set_id, visitor_id, author, body, position_seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
                    .bind(comment.id, track.id, visitor, comment.author, comment.body, comment.positionSeconds, comment.createdAt).run();
                return reply({ comment }, 201);
            }
            return reply({ error: 'Método no permitido.' }, 405);
        }
        return reply({ error: 'Not found' }, 404);
    } catch { return reply({ error: 'El servicio no está disponible. Volvé a intentar.' }, 503); }
}
function escapeHTML(text) {
    return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
async function handleSetPage(request, env) {
    const url = new URL(request.url);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
    let track;
    try { track = (await catalogue(env, url.origin)).find(item => `/set/${item.slug}` === url.pathname.replace(/\/$/, '')); }
    catch { return new Response('No pudimos cargar el set. Volvé a intentar.', { status: 503 }); }
    // GitHub Pages remains the origin. Only /set/* and /api/* route through this Worker.
    let response;
    try { response = await fetch('https://ncc-music.github.io/index.html', { signal: AbortSignal.timeout(10000) }); }
    catch { return new Response('Página no disponible', { status: 502 }); }
    if (!response.ok) return new Response('Página no disponible', { status: 502 });
    let html = await response.text();
    const title = track ? `${track.name} | NCC Music` : 'Set no encontrado | NCC Music';
    const description = track ? `${track.name}${track.date ? ' · ' + track.date : ''}. Escuchá el set y consultá su tracklist en NCC Music.` : 'Este set no existe o no está publicado.';
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHTML(title)}</title>`);
    html = html.replace(/<meta (?:name="(?:description|twitter:title|twitter:description)"|property="(?:og:title|og:description|og:url)")[^>]*>/g, '');
    html = html.replace(/<link rel="(?:canonical|alternate)"[^>]*>/g, '');
    if (!track) html = html.replace(/<meta name="(?:robots|googlebot)"[^>]*>/g, '');
    html = html.replace('</head>', `<link rel="canonical" href="${ORIGIN}${escapeHTML(url.pathname)}"><meta name="description" content="${escapeHTML(description)}"><meta property="og:title" content="${escapeHTML(title)}"><meta property="og:description" content="${escapeHTML(description)}"><meta property="og:url" content="${ORIGIN}${escapeHTML(url.pathname)}"><meta name="twitter:title" content="${escapeHTML(title)}"><meta name="twitter:description" content="${escapeHTML(description)}">${track ? '' : '<meta name="robots" content="noindex">'}</head>`);
    return new Response(request.method === 'HEAD' ? null : html, { status: track ? 200 : 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
