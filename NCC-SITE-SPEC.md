# NCC.ar — decisiones y puesta en producción

Consolidado el 20 de septiembre de 2026 a partir de las conversaciones «Cambios para compartir sets» «Costo plan ChatGPT» y «Mejoras de compartir sociales».

## Arquitectura y alcance

GitHub Pages conserva la web. Cloudflare R2 conserva los audios; no migrar a Cloudflare Pages ni subir audios a GitHub. El Worker existente entrega catálogo, páginas de sets, likes y edición. D1 guarda los metadatos y textos; no se necesitan cuentas para escuchar.

Secciones: Sets, Tracklists, Radio, About, Tour Dates y el Manifesto existente. NC Music queda oculta. Radio utiliza exclusivamente `radio/`; sin archivos, su botón permanece deshabilitado. No modificar su diseño ni recuperar el cartel Coming Soon.

El reproductor es fijo, compacto y redondeado, con progreso simple, nombre clickeable, corazón con contador y compartir. Se quita la etiqueta LOSSLESS del reproductor; la etiqueta de la página y las descripciones de formato se conservan. El audio continúa al navegar.

Cada ficha muestra nombre, fecha si está cargada, tracklist completo, controles/likes/compartir y waveform interactivo. Freaks Comments forma parte del bloque del waveform: el comentario toma automáticamente el momento que está sonando al enviarlo, y las marcas muestran iniciales, hora y vista previa sobre la onda. El nombre del comentarista es opcional y usa `AnonymousFreak` por defecto. Cada navegador puede sumar o retirar una reacción 🔥 por set. El waveform tiene una parte principal y un reflejo inferior reducido. Sin BPM, estilo ni asociación entre pistas y tiempos. Las fichas y Tracklists comparten la misma información. El slug se conserva al editar.

## Administración

El panel permite editar los metadatos de los audios presentes en R2, publicar u ocultar un set, preparar waveform FLAC, editar los textos de Sets, About, Tour Dates y Manifesto en ambos idiomas, y exportar el contenido. También permite elegir por set una imagen fija PNG y una animación MP4 para el reproductor ampliado, con controles independientes para restaurar los archivos predeterminados. Los nuevos audios se incorporan desde R2 al actualizar. La subida de audio continúa en R2.

El acceso de edición requiere Cloudflare Access y validación del JWT en el Worker. Sin configuración, las operaciones de administración se rechazan. El administrador dispone de un botón **Editar ficha** destacado en la lista para abrir el editor completo, además de subir o bajar cada set; el orden se guarda por colección. Sin un orden manual, los sets se ordenan cronológicamente con el más reciente al final. Los textos se muestran como texto, no como HTML ejecutable. Los guardados detectan conflictos de versión.

## Activación en ncc.ar

1. Ejecutar `scripts/schema.sql` en la base D1 de producción `ncdata`. Las sentencias `CREATE TABLE IF NOT EXISTS` conservan los datos existentes y agregan `site_content`, `comments` y `fire_reactions` si faltan. El servicio agrega automáticamente `comments.position_seconds` a instalaciones anteriores para ubicar comentarios en el waveform.
2. Conectar esa base al Worker `rapid-silence-8ef7` con el binding `SITE_DB`. Conservar el binding R2 `MUSIC_BUCKET` existente.
3. Proteger `ncc.ar/api/admin/*` con una aplicación Cloudflare Access y una política que permita únicamente el correo elegido por el propietario. Hacer lo mismo para `www.ncc.ar/api/admin/*` si ese host sirve la web sin redirigir al canónico.
4. Configurar `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` y `ADMIN_EMAIL` en el Worker con los valores reales de esa aplicación. No guardar secretos ni tokens en GitHub.
5. Generar y publicar `cloudflare-worker.js`. Mantener las URL de R2 existentes.
6. Crear rutas hacia ese Worker para `ncc.ar/api/*` y `ncc.ar/set/*`, y sus equivalentes con `www` cuando corresponda. El resto sigue en GitHub Pages. Cloudflare exige que los registros DNS correspondientes estén proxied para ejecutar estas rutas: revisar el estado actual antes de cambiarlo.
7. Publicar los archivos de la web en GitHub Pages. Verificar `/api/sets`, `/api/content`, la imagen social y una ficha real; comprobar también que el acceso anónimo al editor se rechaza.
8. Iniciar sesión con el correo autorizado, guardar un cambio real y comprobarlo en otra sesión. Validar compartir y la reproducción sin cortes al navegar.

Documentación de rutas: https://developers.cloudflare.com/workers/configuration/routing/routes/

## Estado final — 20 de septiembre de 2026

La configuración está publicada en ncc.ar y verificada:

- GitHub Pages conserva el sitio y R2 conserva el audio. Los cuatro registros A de ncc.ar están proxied, conservando sus direcciones originales de GitHub Pages. www redirige al dominio canónico, incluida la ruta de cada set.
- El Worker tiene los bindings MUSIC_BUCKET y SITE_DB; este último utiliza la base ncdata. Las rutas ncc.ar/api/* y ncc.ar/set/* están activas. El catálogo, los contenidos y las fichas responden correctamente en el dominio público.
- Cloudflare Access protege ncc.ar/api/admin/* con la aplicación NCC Administración y la política Propietario NCC, limitada a ncardu@proton.me. Las variables ACCESS_TEAM_DOMAIN, ACCESS_AUD y ADMIN_EMAIL están publicadas. El ingreso funciona con Cloudflare; la sesión autorizada mostró los editores y permitió guardar About. La versión guardada se comprobó mediante la API pública.
- El acceso anónimo al panel redirige al inicio de sesión. El acceso directo al Worker sin identidad válida devuelve 401.
- Los likes se probaron agregando y retirando uno; el total quedó restaurado. La reproducción continuó al navegar de About a Tracklists. Compartir muestra el enlace permanente y copiar devuelve confirmación. La ficha servida por el Worker contiene la calavera en Open Graph y Twitter.
- El set NCC Records 001 - RAW Preview tiene fecha 18.09.2026, 13 pistas y 1400 valores de waveform guardados. Conserva el slug ncc-records-raw-preview-001-d6a88456 después de cambiar el título.
- Las 34 pruebas locales pasan después de incorporar las mejoras de reproducción, archivo y medios visuales por set.

Radio todavía no tiene audios en su carpeta radio/ y permanece deshabilitada hasta que se carguen. Es contenido pendiente, no una conexión con las otras colecciones.

Para administrar: abrir https://ncc.ar/api/admin/login e ingresar con la cuenta Cloudflare del correo autorizado. Desde Tracklists se editan sets y las secciones del sitio; los audios nuevos se siguen subiendo a R2.

## Mejoras de compartir sociales — 21 de septiembre de 2026

- Menú de compartir con Facebook, Instagram, WhatsApp y Telegram; enlace permanente y símbolo universal de tres nodos. Instagram copia el enlace para pegarlo en un mensaje o historia.
- El pie intercambia About y Administración; esta última se muestra como π, manteniendo su nombre accesible.
- Waveform automático en cada ficha, independiente del audio actual hasta que el oyente lo utiliza para desplazarse. Verificado en la ficha pública con los picos guardados y avance por teclado.
- Manifesto editable en inglés y español desde el panel, con validación y control de versiones. El texto original se conserva hasta su primera edición.
- El Worker publicado admite Manifesto y los cambios sociales están disponibles en ncc.ar.

## mejorasncc1 — 21 de septiembre de 2026

- El miniplayer inferior y la vista ampliada Now Playing controlan la misma instancia de audio. El nombre, la imagen y el control de expansión abren la vista; minimizar o navegar conserva el set y la posición.
- Now Playing muestra identidad, nombre y fecha, controles, tiempo, waveform, likes, compartir y tracklist completo. En escritorio ocupa una superficie más ancha y reserva la mayor parte del espacio para la onda; Escape minimiza la vista.
- La waveform de la ficha y de Now Playing incluye un botón Play central. El botón desaparece durante la reproducción y nunca se interpreta como un salto al centro del audio. La imagen situada a la derecha del waveform también alterna reproducción y pausa, y reproduce su animación cuando el audio está activo; en celulares su icono superpuesto permanece oculto y toda la imagen conserva la acción.
- En todas las vistas de Tracklists, el artista que precede al primer separador se muestra con peso seminegrita 600. El formato se conserva durante las búsquedas y en el reproductor ampliado. La calavera mostaza HQ del encabezado y la del miniplayer utilizan un tamaño adaptable ampliado y se integran con sus respectivos fondos oscuros.
- La firma gráfica principal conserva el lettering de pincel y representa la O de NICOLÁS con el símbolo Ø: “MIXED BY NICØLÁS CARDÚ”.
- En la lista de Sets, el botón de reproducción del set activo cambia a cinco barras de vúmetro animadas en blanco y negro. Al pausar recupera el icono de play y, con movimiento reducido, conserva barras estáticas de alturas distintas.
- La sección conserva el nombre **Tracklists** y funciona como archivo compacto con búsqueda por artista, track, remix, set o fecha. La búsqueda ignora mayúsculas y acentos, agrupa por set y conserva todas las apariciones.
- Los tracklists publicados permanecen en el archivo si el audio se retira de R2, claramente identificados como archivo y sin ofrecer reproducción.
- Al guardar un set FLAC sin picos, el CMS prepara automáticamente su waveform antes de publicar el cambio.
