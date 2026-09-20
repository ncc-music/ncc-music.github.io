// One saved document supplies the editable public sections.
(() => {
    let snapshot, editor, section, saving = false;
    const fields = {
        sets: [['title', 'Nombre de la colección', 120], ['genres', 'Descripción musical', 200], ['description', 'Texto de presentación', 500]],
        about: [['title', 'Nombre', 120], ['body', 'Biografía', 10000, true], ['bookingEmail', 'Correo de bookings', 254]],
        tour: [['title', 'Título', 120], ['body', 'Fechas y lugares · una fecha por línea', 10000, true]]
    };
    const names = { sets: 'Sets', about: 'About', tour: 'Tour Dates' };
    async function request(path, options = {}) {
        const response = await fetch('/api/' + path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) });
        let result;
        try { result = await response.json(); } catch { throw new Error('La edición todavía no está disponible.'); }
        if (!response.ok) throw new Error(result.error || 'No pudimos guardar los cambios.');
        return result;
    }
    function node(tag, text, className) {
        const element = document.createElement(tag); if (text !== undefined) element.textContent = text;
        if (className) element.className = className; return element;
    }
    function paragraphs(parent, text) {
        text.split(/\n\s*\n/).filter(Boolean).forEach(part => parent.append(node('p', part, 'content-paragraph')));
    }
    function render() {
        const content = snapshot?.content; if (!content) return;
        const collection = document.querySelector('[data-collection="techno-freaks"] .collection-copy');
        collection.querySelector('h2').textContent = content.sets.title;
        collection.querySelector('.collection-genres').textContent = content.sets.genres;
        collection.querySelector('p:last-child').textContent = content.sets.description;
        $('collection-play-button').setAttribute('aria-label', 'Reproducir el primer set de ' + content.sets.title);
        const about = document.querySelector('.about-copy'); about.replaceChildren(node('p', 'Behind the music', 'eyebrow'));
        const heading = node('h2', content.about.title); heading.id = 'about-title'; about.append(heading);
        paragraphs(about, content.about.body);
        if (content.about.bookingEmail) { const booking = node('a', 'Bookings: ' + content.about.bookingEmail, 'booking-link'); booking.href = 'mailto:' + content.about.bookingEmail; about.append(booking); }
        const tour = $('tour-section'); tour.replaceChildren(node('p', 'EN VIVO', 'eyebrow'));
        const title = node('h2', content.tour.title); title.id = 'tour-title'; tour.append(title); paragraphs(tour, content.tour.body);
    }
    async function edit(key) {
        if (!fields[key] || saving) return;
        try {
            snapshot = await request('admin/content'); section = key;
            editor.querySelector('h2').textContent = 'Editar ' + names[key];
            const form = editor.querySelector('form'); form.replaceChildren();
            for (const [name, label, limit, multiline] of fields[key]) {
                const id = 'content-' + name, title = node('label', label); title.htmlFor = id;
                const input = node(multiline ? 'textarea' : 'input'); input.id = id; input.name = name; input.maxLength = limit;
                if (name === 'title') input.required = true;
                if (name === 'bookingEmail') input.type = 'email';
                if (multiline) input.rows = 10;
                input.value = snapshot.content[key][name]; form.append(title, input);
            }
            const status = node('p'); status.id = 'content-status'; status.setAttribute('role', 'status');
            const save = node('button', 'Guardar', 'primary-button'); save.type = 'submit'; form.append(status, save);
            editor.showModal();
        } catch (error) { showMessage(error.message); }
    }
    document.addEventListener('DOMContentLoaded', () => {
        editor = node('dialog', undefined, 'set-dialog'); editor.id = 'content-dialog'; editor.setAttribute('aria-labelledby', 'content-dialog-title');
        const header = node('div', undefined, 'dialog-heading'), heading = node('h2', 'Editar'); heading.id = 'content-dialog-title';
        const close = node('button', 'Cerrar', 'dialog-close'); close.type = 'button'; close.addEventListener('click', () => { if (!saving) editor.close(); });
        header.append(heading, close); editor.append(header);
        const form = node('form', undefined, 'set-form');
        form.addEventListener('submit', async event => {
            event.preventDefault(); if (saving) return;
            const content = structuredClone(snapshot.content);
            fields[section].forEach(([name]) => { content[section][name] = form.elements.namedItem(name).value.trim(); });
            saving = true; const save = form.querySelector('[type=submit]'); save.disabled = true; close.disabled = true;
            $('content-status').textContent = 'Guardando…';
            try {
                const result = await request('admin/content', { method: 'PUT', body: JSON.stringify({ content, version: snapshot.version }) });
                snapshot = { content, version: result.version }; render(); editor.close(); showMessage('Cambios guardados.');
            } catch (error) { $('content-status').textContent = error.message; }
            finally { saving = false; save.disabled = false; close.disabled = false; }
        });
        editor.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
        editor.append(form); document.body.append(editor);
        request('content').then(data => { snapshot = data; render(); }).catch(() => {});
    });
    window.NCCContent = { edit };
})();
