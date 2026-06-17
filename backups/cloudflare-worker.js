const AUDIO_EXTENSIONS = new Set(["flac", "wav", "mp3", "ogg", "m4a", "aac"]);
const R2_PUBLIC_URL = "https://pub-a23ce9da093b4cbf812140922221fc46.r2.dev";

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders(request, env) });
        }

        if (request.method !== "GET") {
            return jsonResponse({ error: "Method not allowed" }, request, env, 405);
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
    const allowedOrigin = env.ALLOWED_ORIGIN || "https://ncc-music.github.io";

    return new Headers({
        "Access-Control-Allow-Origin": origin === allowedOrigin ? origin : allowedOrigin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Vary": "Origin",
    });
}
