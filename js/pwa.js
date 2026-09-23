(() => {
    const installButton = document.getElementById('install-app');
    const dialog = document.getElementById('install-dialog');
    const closeButton = document.getElementById('install-dialog-close');
    const message = document.getElementById('install-dialog-message');
    let installPrompt = null;
    let refreshing = false;

    const showUpdate = registration => {
        if (!registration?.waiting || document.getElementById('pwa-update')) return;
        const notice = document.createElement('aside'); notice.id = 'pwa-update'; notice.className = 'pwa-update'; notice.setAttribute('role', 'status');
        const copy = document.createElement('span'); copy.textContent = 'Nueva versión disponible';
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Actualizar';
        button.addEventListener('click', () => { button.disabled = true; registration.waiting.postMessage({ type: 'SKIP_WAITING' }); });
        notice.append(copy, button); document.body.append(notice);
    };

    const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
    const safari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR/.test(ua);

    const openInstructions = () => {
        if (ios) message.textContent = 'En Safari, tocá Compartir y después “Añadir a pantalla de inicio”.';
        else if (safari) message.textContent = 'En Safari, abrí el menú Archivo y elegí “Añadir al Dock”.';
        else message.textContent = 'Abrí el menú de tu navegador y elegí “Instalar app” o “Añadir a pantalla de inicio”.';
        if (typeof dialog.showModal === 'function') dialog.showModal();
    };

    if (!standalone() && (ios || safari)) installButton.hidden = false;

    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        installPrompt = event;
        if (!standalone()) installButton.hidden = false;
    });

    installButton.addEventListener('click', async () => {
        if (!installPrompt) {
            openInstructions();
            return;
        }
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        installButton.hidden = true;
    });

    closeButton.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
    });
    window.addEventListener('appinstalled', () => {
        installPrompt = null;
        installButton.hidden = true;
    });

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true; location.reload();
        });
        window.addEventListener('load', async () => {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js');
                if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration);
                registration.addEventListener('updatefound', () => {
                    const worker = registration.installing;
                    worker?.addEventListener('statechange', () => {
                        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(registration);
                    });
                });
                document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') registration.update().catch(() => {}); });
            } catch { /* Installation remains optional. */ }
        });
    }
})();
