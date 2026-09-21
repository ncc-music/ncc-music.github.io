// Local-only preview; no writes to the public site's data or visit counter.
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { Readable } from 'node:stream';
import { database } from '../tests/helpers/database.mjs';
const root = resolve(new URL('..', import.meta.url).pathname);
await mkdir(resolve(root, '.work'), { recursive: true });
const originalFetch = globalThis.fetch;
const source = await readFile(resolve(root,'cloudflare-worker.js'),'utf8');
const { default: worker } = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const remote = 'https://rapid-silence-8ef7.nc-music-87a.workers.dev';
let entries = [];
for (const prefix of ['techno-freaks/', 'chill-out/', 'radio/']) {
    const response = await originalFetch(remote+'/?prefix='+encodeURIComponent(prefix));
    for (const track of (await response.json()).tracks || []) entries.push({ key:track.key,size:track.size,customMetadata:{title:track.name,artist:track.artist},httpMetadata:{contentType:track.contentType} });
}
const env = { SITE_DB: database(resolve(root,'.work/preview.db')), ALLOWED_ORIGINS:'http://127.0.0.1:8765', MY_BUCKET: { list: async ({prefix}) => ({ objects:entries.filter(e=>e.key.startsWith(prefix)),truncated:false }) } };
// Optional local administrator preview, signed with an ephemeral test key.
// This never creates or forwards credentials to the production service.
let previewToken, previewJWK;
if (process.argv.includes('--admin')) {
    const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    previewJWK = await crypto.subtle.exportKey('jwk', pair.publicKey); previewJWK.kid = 'local-preview';
    Object.assign(env, { ACCESS_TEAM_DOMAIN: 'ncc-preview.cloudflareaccess.com', ACCESS_AUD: 'local-preview', ADMIN_EMAIL: 'preview@example.com' });
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const message = encode({ alg: 'RS256', kid: previewJWK.kid }) + '.' + encode({ iss: 'https://' + env.ACCESS_TEAM_DOMAIN, aud: [env.ACCESS_AUD], email: env.ADMIN_EMAIL, exp: Math.floor(Date.now()/1000) + 7200 });
    previewToken = message + '.' + Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(message))).toString('base64url');
}
globalThis.fetch = async (url, options) => {
    if (String(url) === 'https://ncc-music.github.io/index.html') return new Response(await readFile(resolve(root,'index.html')), { headers: { 'Content-Type': 'text/html' } });
    if (previewJWK && String(url) === 'https://ncc-preview.cloudflareaccess.com/cdn-cgi/access/certs') return Response.json({ keys: [previewJWK] });
    return originalFetch(url, options);
};
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
http.createServer(async (request,response) => {
    try {
        const url = new URL(request.url,'http://127.0.0.1:8765');
        if (request.headers.host !== '127.0.0.1:8765') { response.writeHead(403); response.end(); return; }
        if (url.pathname === '/__review' || url.pathname === '/__schema') {
            const text = await readFile(resolve(root, url.pathname === '/__schema' ? 'scripts/schema.sql' : 'cloudflare-worker.js'), 'utf8');
            const html = `<meta charset="utf-8"><title>NCC deployment review</title><button onclick="navigator.clipboard.writeText(document.querySelector('textarea').value).then(()=>document.querySelector('p').textContent='Copied')">Copy Worker</button><p></p><textarea readonly style="width:100%;height:85vh">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</textarea>`;
            response.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); response.end(html); return;
        }
        if (url.pathname.startsWith('/api/audio/')) {
            const result = await originalFetch(remote + url.pathname.replace(/^\/api/, ''));
            response.writeHead(result.status, Object.fromEntries(result.headers)); Readable.fromWeb(result.body).pipe(response); return;
        }
        if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/set/')) {
            if (previewToken && url.pathname.startsWith('/api/admin/')) request.headers['cf-access-jwt-assertion'] = previewToken;
            const body = ['GET','HEAD'].includes(request.method) ? undefined : Readable.toWeb(request);
            const result = await worker.fetch(new Request(url,{method:request.method,headers:request.headers,body,duplex:'half'}),env);
            response.writeHead(result.status,Object.fromEntries(result.headers)); if (result.body) Readable.fromWeb(result.body).pipe(response); else response.end(); return;
        }
        if(url.pathname.startsWith('/audio/')) {
            const result = await originalFetch(remote+url.pathname,{headers:request.headers.range?{Range:request.headers.range}:{}});
            response.writeHead(result.status,Object.fromEntries(result.headers)); Readable.fromWeb(result.body).pipe(response); return;
        }
        if(url.pathname==='/visits') {response.writeHead(200,{'Content-Type':'application/json'});response.end('{"count":0}');return;}
        const file=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
        if(!file.startsWith(root+'/') || /\/(?:\.|scripts|tests|node_modules)/.test(file.slice(root.length))) {response.writeHead(404);response.end();return;}
        const contents = await readFile(file);
        response.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'}); response.end(contents);
    } catch (error) {
        if (response.headersSent) { response.destroy(); return; }
        response.writeHead(error.code === 'ENOENT' ? 404 : 500); response.end('Preview unavailable');
    }
}).listen(8765,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:8765'));
