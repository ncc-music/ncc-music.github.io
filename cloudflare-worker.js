const AUDIO_EXTENSIONS = new Set(["flac", "wav", "mp3", "ogg", "m4a", "aac"]);
const R2_PUBLIC_URL = "https://pub-a23ce9da093b4cbf812140922221fc46.r2.dev";
const DEFAULT_ALLOWED_ORIGINS = [
    "https://www.ncc.ar",
    "https://ncc.ar",
    "https://ncc-music.github.io",
];

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders(request, env) });
        }

        if (request.method !== "GET") {
            return jsonResponse({ error: "Method not allowed" }, request, env, 405);
        }

        if (url.pathname.startsWith("/audio/")) {
            return streamAudio(url, request, env);
        }

        if (url.pathname !== "/" && url.pathname !== "/playlist") {
            return jsonResponse({ error: "Not found" }, request, env, 404);
        }

        const prefix = url.searchParams.get("prefix") ?? env.AUDIO_PREFIX ?? "";
        const publicBaseUrl = (env.R2_PUBLIC_URL || R2_PUBLIC_URL).replace(/\/$/, "");

        if (!publicBaseUrl) {
            return jsonResponse({ error: "Missing R2_PUBLIC_URL variable" }, request, env, 500);
        }

        const bucket = env.MY_BUCKET || env.MUSIC_BUCKET;
        if (!bucket) {
            return jsonResponse({ error: "Missing R2 bucket binding" }, request, env, 500);
        }

        const objects = await listAllAudioObjects(bucket, prefix);
        const tracks = objects.map((object) => ({
            key: object.key,
            name: object.customMetadata?.title || titleFromKey(object.key),
            artist: object.customMetadata?.artist || "Nicolás Cardú",
            url: `${publicBaseUrl}/${encodePath(object.key)}`,
            waveformUrl: `${url.origin}/audio/${encodePath(object.key)}`,
            size: object.size,
            uploaded: object.uploaded?.toISOString(),
            contentType: object.httpMetadata?.contentType || contentTypeFromKey(object.key),
        }));

        return jsonResponse({
            tracks,
            count: tracks.length,
            prefix,
        }, request, env, 200, {
            "Cache-Control": "public, max-age=60",
        });
    },
};

async function streamAudio(url, request, env) {
    const bucket = env.MY_BUCKET || env.MUSIC_BUCKET;
    if (!bucket) {
        return jsonResponse({ error: "Missing R2 bucket binding" }, request, env, 500);
    }

    const key = decodePath(url.pathname.slice("/audio/".length));
    const object = await bucket.get(key);

    if (!object) {
        return jsonResponse({ error: "Audio not found" }, request, env, 404);
    }

    return new Response(object.body, {
        headers: {
            ...Object.fromEntries(corsHeaders(request, env)),
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Length": object.size.toString(),
            "Content-Type": object.httpMetadata?.contentType || contentTypeFromKey(key),
            "ETag": object.httpEtag,
        },
    });
}

async function listAllAudioObjects(bucket, prefix) {
    const objects = [];
    let cursor;

    do {
        const listed = await bucket.list({
            prefix,
            cursor,
            limit: 1000,
            include: ["httpMetadata", "customMetadata"],
        });

        objects.push(...listed.objects.filter((object) => isAudioKey(object.key)));
        cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);

    return objects.sort((a, b) => a.key.localeCompare(b.key, undefined, {
        numeric: true,
        sensitivity: "base",
    }));
}

function isAudioKey(key) {
    const extension = key.split(".").pop()?.toLowerCase();
    return AUDIO_EXTENSIONS.has(extension);
}

function titleFromKey(key) {
    const filename = key.split("/").pop() || key;
    return filename.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function contentTypeFromKey(key) {
    const extension = key.split(".").pop()?.toLowerCase();

    switch (extension) {
        case "flac":
            return "audio/flac";
        case "wav":
            return "audio/wav";
        case "mp3":
            return "audio/mpeg";
        case "ogg":
            return "audio/ogg";
        case "m4a":
            return "audio/mp4";
        case "aac":
            return "audio/aac";
        default:
            return "application/octet-stream";
    }
}

function encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
}

function decodePath(path) {
    return path.split("/").map(decodeURIComponent).join("/");
}

function jsonResponse(body, request, env, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(body, null, 2), {
        status,
        headers: {
            ...Object.fromEntries(corsHeaders(request, env)),
            "Content-Type": "application/json; charset=utf-8",
            ...extraHeaders,
        },
    });
}

function corsHeaders(request, env) {
    const origin = request.headers.get("Origin");
    const configuredOrigins = [env.ALLOWED_ORIGINS, env.ALLOWED_ORIGIN]
        .filter(Boolean)
        .flatMap((allowedOrigin) => allowedOrigin.split(",").map((item) => item.trim()))
        .filter(Boolean);
    const allowedOrigins = [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins])];
    const allowedOrigin = origin && (allowedOrigins.includes(origin) || isLocalOrigin(origin))
        ? origin
        : allowedOrigins[0];

    return new Headers({
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Range",
        "Access-Control-Expose-Headers": "Content-Length, Content-Type, ETag",
        "Vary": "Origin",
    });
}

function isLocalOrigin(origin) {
    return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}
