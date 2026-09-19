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
globalThis.fetch = async (url, options) => String(url) === 'https://ncc-music.github.io/index.html' ? new Response(await readFile(resolve(root,'index.html')), {headers:{'Content-Type':'text/html'}}) : originalFetch(url,options);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
http.createServer(async (request,response) => {
    try {
        const url = new URL(request.url,'http://127.0.0.1:8765');
        if (url.pathname === '/__review') {
            const text = await readFile(resolve(root, 'cloudflare-worker.js'), 'utf8');
            const html = `<meta charset="utf-8"><title>NCC deployment review</title><button onclick="navigator.clipboard.writeText(document.querySelector('textarea').value).then(()=>document.querySelector('p').textContent='Copied')">Copy Worker</button><p></p><textarea readonly style="width:100%;height:85vh">${text.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</textarea>`;
            response.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); response.end(html); return;
        }
        if (url.pathname.startsWith('/api/audio/')) {
            const result = await originalFetch(remote + url.pathname.replace(/^\/api/, ''));
            response.writeHead(result.status, Object.fromEntries(result.headers)); Readable.fromWeb(result.body).pipe(response); return;
        }
        if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/set/')) {
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
        response.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'}); response.end(await readFile(file));
    } catch {response.writeHead(500);response.end('Preview unavailable');}
}).listen(8765,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:8765'));
