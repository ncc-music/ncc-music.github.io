🎵 NCC Music 
==============================================

Un reproductor de audio moderno y elegante para archivos de alta calidad, incluyendo formatos FLAC y WAV, alojado en GitHub Pages.

## Reproductor NCC Music

El sitio presenta una interfaz oscura y minimalista: live sets, filtros de colección, acceso directo a la radio y un reproductor fijo. El logo de NCC gira durante la reproducción y se detiene al pausar o cargar el audio; respeta la preferencia de movimiento reducido del dispositivo.

- **NCC Radio** reproduce únicamente su catálogo independiente de `radio/`. No incluye las colecciones MUSIC ni TECHNO.
- **Mis sets** permite filtrar por colección y reproducir un set puntual. Elegir un set sale del modo radio.
- El reproductor permanece visible al navegar: pausa, anterior/siguiente, posición y volumen. En celulares el volumen se maneja con los controles del dispositivo.
- La forma de onda se muestra a pedido al final de la ficha individual del set. El administrador puede prepararla y guardarla para evitar que cada visitante analice el audio completo. La carga inicial sólo solicita metadatos, sin descargar el audio completo para analizarlo.
- La tecla Espacio alterna reproducción y pausa. Las flechas izquierda/derecha cambian de set cuando el foco no está en otro control.
- Se conservan las fuentes de audio de R2 y los enlaces oficiales de Nicolás Cardú.

El botón de reproducción del encabezado **CARDÚ** inicia siempre el primer set de esa colección y permanece deshabilitado mientras no haya sets disponibles.

### Colecciones activas

Por el momento, SETS muestra únicamente **CARDÚ**. **NC MUSIC** queda oculta y su catálogo no se carga; sus archivos, portada y configuración se conservan. Los enlaces anteriores a `#chill-out` muestran TECHNO. NCC Radio sigue disponible en su sección.

Para reactivar NC MUSIC, cambiá `enabled: false` por `enabled: true` en la fuente `chill-out` de `js/gdrive-player.js`. Su tarjeta y filtro vuelven a mostrarse automáticamente. Actualizá también la versión del script en `index.html` para renovar la caché y las descripciones del sitio si querés volver a mencionar MUSIC.

### Verificación y versión privada

El proyecto sigue siendo HTML, CSS y JavaScript sin dependencias. `node --test tests/*.test.*` comprueba los flujos de reproducción. `node scripts/build-site.mjs` prepara una versión para Sites; el proxy de catálogo de esa versión evita cambiar la configuración del Worker original. GitHub Pages continúa usando el catálogo original directamente.

## 🌟 Características

- ✅ **Soporte para múltiples formatos**: FLAC, WAV, MP3, OGG
- ✅ **Playlist completa**: Gestión de múltiples canciones
- ✅ **Controles avanzados**:
  - Play/Pause
  - Siguiente/Anterior
  - Control de volumen
  - Barra de progreso interactiva

- ✅ **Interfaz moderna**: Diseño responsive y atractivo
- ✅ **Visualización**: Portadas de colección y forma de onda a pedido
- ✅ **Atajos de teclado**:
  - `Espacio`: Play/Pause
  - `Flecha derecha`: Siguiente canción
  - `Flecha izquierda`: Canción anterior

## 🚀 Características del Sitio

- **Home**: Hero section con call-to-action
- **Reproductor**: Interfaz intuitiva y fácil de usar
- **Sección Bio**: Biografia personal
- **Contacto**: Enlaces a redes sociales
- **Diseño responsivo**: Funciona perfectamente en dispositivos móviles

## 📁 Estructura del Proyecto

```
ncc-music.github.io/
├── index.html          # Página principal
├── styles.css          # Estilos CSS
├── js/
│   └── player.js       # Lógica del reproductor
└── README.md           # Este archivo
```

## 🛠️ Instalación

1. **Clonar el repositorio**
```bash
git clone https://github.com/ncc-music/ncc-music.github.io.git
cd ncc-music.github.io
```

2. **Abrir en un navegador**
   - Opción 1: Abrir directamente `index.html` en tu navegador
   - Opción 2: Usar un servidor local
```bash
# Con Python 3
python -m http.server 8000

# Con Node.js (necesitas tener http-server instalado)
npx http-server
```

3. **Acceder al sitio**
   - Abre tu navegador en `http://localhost:8000`
   - O directamente en `https://www.ncc.ar`

## ☁️ Playlist automática desde Cloudflare R2

La web se aloja en GitHub Pages y los archivos de audio se alojan en Cloudflare R2. Para que la playlist se genere sola, un Worker mínimo lista los archivos del bucket y devuelve JSON al reproductor.

1. **Subir audios a R2**
   - Subí tus archivos de audio al bucket dentro de las carpetas `chill-out/` (MUSIC), `techno-freaks/` (TECHNO) y `radio/` (NCC Radio).
   - La web muestra **CARDÚ**; **MUSIC** queda preparada para reactivarse.
   - El bucket debe permitir acceso público a los archivos que use el reproductor.

2. **Crear un Worker en Cloudflare**
   - Entrá a `Workers & Pages`.
   - Creá un Worker, no Workers KV.
   - Abrí `Edit code` o `Quick edit`.
   - Pegá el contenido de `cloudflare-worker.js`.

3. **Conectar el Worker con R2**
   - En la configuración del Worker, agregá un binding de R2.
   - Nombre del binding: `MY_BUCKET`.
   - Bucket: tu bucket real de R2.

4. **Agregar variables del Worker**
   - `R2_PUBLIC_URL`: opcional si cambiás la URL pública del bucket.
   - `ALLOWED_ORIGINS`: `https://www.ncc.ar,https://ncc.ar,https://ncc-music.github.io`.
   - `ALLOWED_ORIGIN`: opcional si sólo querés permitir un único origen.
   - `AUDIO_PREFIX`: opcional. La web ya pide `chill-out/` (MUSIC), `techno-freaks/` (TECHNO) y `radio/` (NCC Radio) con el parámetro `prefix`.

5. **Conectar GitHub Pages con el Worker**
   - Copiá la URL del Worker.
   - Pegala en `js/gdrive-player.js`, en `playlistApiUrl`.

El Worker devuelve la playlist automática en `/playlist` y sirve `/audio/<archivo>` para que el reproductor pueda generar el waveform real con CORS.

## 🔎 Indexación en Google

El sitio usa `https://ncc.ar/` como URL canónica e incluye metadatos SEO, datos estructurados JSON-LD, `robots.txt` y `sitemap.xml`.

1. Verificá la propiedad `https://ncc.ar/` en Google Search Console.
2. Enviá el sitemap: `https://ncc.ar/sitemap.xml`.
3. Usá la inspección de URL de Search Console para solicitar indexación después de publicar cambios importantes.

## 📱 Uso

1. **Reproducir música**:
   - Haz clic en una canción de la playlist o en el botón ▶️
   - Usa los botones de control o atajos de teclado

2. **Controlar reproducción**:
   - Usa los botones de control para navegar
   - Ajusta el volumen con el slider
   - Arrastra la barra de progreso para buscar en la canción

## 🎨 Personalización

### Cambiar colores

Edita las variables CSS en `styles.css`:

```css
:root {
    --primary-color: #ff6b6b;      /* Color primario (rojo)*/
    --secondary-color: #4ecdc4;    /* Color secundario (turquesa) */
    --dark-bg: #0f0f0f;            /* Fondo oscuro */
    --light-bg: #1a1a1a;           /* Fondo claro */
    --text-color: #ffffff;          /* Color de texto */
}
```

## 🔧 Tecnologías Utilizadas

- **HTML5**: Estructura semántica
- **CSS3**: Estilos modernos con variables CSS y Flexbox/Grid
- **JavaScript Vanilla**: Lógica del reproductor sin dependencias
- **Web Audio API**: Manipulación de audio
- **GitHub Pages**: Hosting gratuito
- **R2 Cloudflare**: Hosting gratuito hasta 10gb

## 🎯 Mejoras Futuras

- [ ] Sincronización con Spotify API
- [ ] Tema oscuro/claro configurable
- [ ] Estadísticas de reproducción
- [ ] Historial de reproducción
- [ ] Favoritos y listas personalizadas

## 📝 Licencia

Este proyecto está bajo la licencia MIT.

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! Si tienes ideas para mejorar el reproductor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📧 Contacto

¿Preguntas o sugerencias? ncc.dictator110@passinbox.com

---

Hecho con ❤️ para los amantes del audio de calidad.

**[🎵 Visita el sitio](https://www.ncc.ar)**

## Contador de visitas

El pie de página muestra un contador global con la fuente local Road Rage (licencia OFL incluida). Cuenta cargas y recargas de página, no personas únicas; cambiar entre solapas no suma visitas. No guarda direcciones IP ni identificadores de visitantes.

Para activarlo en producción, publicar también la versión actualizada de `cloudflare-worker.js` en el Worker existente. Utiliza el binding R2 existente (`MY_BUCKET` o `MUSIC_BUCKET`) y guarda el total en `__site/visits.json`, sin modificar los audios. `GET /visits` consulta; `POST /visits` incrementa usando escrituras condicionales para evitar perder incrementos simultáneos. El conteo empieza en cero al activarlo; no reconstruye visitas anteriores. Si el servicio falla se muestra «—», nunca un total inventado.

La vista previa local utiliza un contador SQLite separado en el servidor de edición. Las vistas previas de Sites solo consultan el total público y no lo incrementan.

## Me gusta y favoritos

Los corazones muestran un total público guardado en D1. Un identificador aleatorio por navegador evita contar dos veces la misma selección; no es un conteo de personas verificadas. Se puede retirar el like. Los favoritos siguen siendo personales y se guardan en el navegador. Si el servicio no está conectado, los likes se muestran como no disponibles; no se inventan totales.

Cada ficha ampliada integra **Freaks Comments** con el waveform y una reacción 🔥 por set. El nombre es opcional: si queda vacío, el comentario se publica como `AnonymousFreak`. El compositor aparece inmediatamente debajo de la onda y permite usar el momento actual o marcar otro punto. Cada comentario aparece sobre el waveform con iniciales, hora y una vista previa al tocarlo; la hora de la lista lleva la reproducción a ese punto. Los comentarios y las reacciones se guardan en D1; cada navegador puede publicar hasta cinco comentarios por hora y su reacción de fuego es reversible. La interfaz muestra los 100 comentarios más recientes y nunca interpreta su texto como HTML.

## Edición y enlaces de sets

Las decisiones consolidadas y la configuración de producción están en [NCC-SITE-SPEC.md](NCC-SITE-SPEC.md).

- **π (Administrar)** abre Tracklists después de iniciar sesión. Allí se editan nombre, fecha, tags, tracklist y estado publicado de los audios de R2. En la lista principal aparecen controles para subir, bajar o editar cada set. El orden manual queda guardado; antes de editarlo, la colección se muestra de la más antigua a la más reciente. Un audio nuevo se incorpora al final al actualizar el catálogo; el audio pesado se sigue subiendo a R2.
- **Editar Sets**, **Editar About**, **Editar Tour Dates** y **Editar Manifesto** permiten cambiar los textos desde la web. El guardado utiliza versiones para impedir que una ventana sobrescriba cambios más recientes de otra.
- **Exportar contenido** descarga los metadatos de los sets y los textos del sitio. No incluye los archivos de audio.
- Cada set tiene una dirección permanente `/set/slug`. Cambiar el título no cambia el slug. El nombre del reproductor y las fichas usan esa misma dirección.
- Compartir muestra Facebook, Instagram, WhatsApp, Telegram y copiar enlace. Instagram copia el enlace para pegarlo en un mensaje o en el sticker Enlace; «Más opciones» abre el menú nativo cuando está disponible. Los enlaces compartidos siempre apuntan a `https://ncc.ar`.
- La forma de onda aparece automáticamente al abrir la ficha, usando los picos guardados o analizando el audio. Abrir una ficha no cambia el audio que está sonando.
- El miniplayer abre una vista Now Playing sin crear otro audio. La ficha y la vista ampliada muestran un botón Play central sobre la waveform cuando el set está detenido.
- Tracklists incluye un buscador por artista, track, remix, set, fecha y tags. Los resultados se agrupan por set y los tracklists archivados permanecen disponibles aunque se retire su audio.
- La portada y las fichas incluyen Open Graph y Twitter con la calavera limpia sobre fondo negro (`assets/player-cover-clean.jpg`). Estos datos se entregan en el HTML, sin depender de JavaScript. Los servicios de mensajería pueden conservar una vista previa anterior en su caché.

### Desarrollo y comprobación

`node scripts/bundle-worker.mjs` incorpora el servicio de sets en el Worker. Ejecutarlo después de modificar `scripts/set-service.mjs`. `node --test tests/*.test.*` comprueba permisos, guardado, conflictos, likes, radio, reproducción y metadatos para compartir.

`node scripts/preview.mjs` abre una vista previa en `http://127.0.0.1:8765`. Agregar `--admin` permite probar la edición con una identidad efímera local. Los cambios se guardan exclusivamente en `.work/preview.db`, nunca en la web pública. No publicar este servidor como servicio de producción.
