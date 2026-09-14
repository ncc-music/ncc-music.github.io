// A page load counts once; navigating between hash sections does not reload this script.
async function loadVisitCount() {
    const counter = document.getElementById('visit-count');
    const wrapper = document.getElementById('visit-counter');
    if (!counter || !wrapper) return;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const hostedPreview = location.hostname.endsWith('.chatgpt.site');
    const endpoint = local ? '/visits' : hostedPreview ? '/api/visits' : 'https://rapid-silence-8ef7.nc-music-87a.workers.dev/visits';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(endpoint, {
            method: hostedPreview ? 'GET' : 'POST',
            cache: 'no-store', credentials: 'omit', signal: controller.signal
        });
        if (!response.ok) throw new Error('Counter unavailable');
        const data = await response.json();
        if (!Number.isSafeInteger(data.count) || data.count < 0) throw new Error('Invalid count');
        counter.textContent = String(data.count).padStart(6, '0');
        wrapper.setAttribute('aria-label', data.count + ' visitas' + (local ? ' en esta vista previa' : ''));
        wrapper.title = local
            ? 'Visitas de esta vista previa, separadas del sitio público.'
            : 'Visitas registradas desde la activación del contador. Cada carga de página suma una visita.';
    } catch {
        counter.textContent = '—';
        wrapper.setAttribute('aria-label', 'Contador de visitas no disponible');
        wrapper.title = 'El contador de visitas no está disponible en este momento.';
    } finally { clearTimeout(timeout); }
}
document.addEventListener('DOMContentLoaded', loadVisitCount, { once: true });
