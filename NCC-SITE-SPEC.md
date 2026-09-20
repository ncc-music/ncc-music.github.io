# NCC.ar — decisiones y puesta en producción

Consolidado el 20 de septiembre de 2026 a partir de las conversaciones «Cambios para compartir sets» y «Costo plan ChatGPT».

## Arquitectura y alcance

GitHub Pages conserva la web. Cloudflare R2 conserva los audios; no migrar a Cloudflare Pages ni subir audios a GitHub. El Worker existente entrega catálogo, páginas de sets, likes y edición. D1 guarda los metadatos y textos; no se necesitan cuentas para escuchar.

Secciones: Sets, Tracklists, Radio, About, Tour Dates y el Manifesto existente. NC Music queda oculta. Radio utiliza exclusivamente `radio/`; sin archivos, su botón permanece deshabilitado. No modificar su diseño ni recuperar el cartel Coming Soon.

El reproductor es fijo, compacto y redondeado, con progreso simple, nombre clickeable, corazón con contador y compartir. Se quita la etiqueta LOSSLESS del reproductor; la etiqueta de la página y las descripciones de formato se conservan. El audio continúa al navegar.

Cada ficha muestra nombre, fecha si está cargada, tracklist completo, controles/likes/compartir y waveform interactivo al final. El waveform tiene una parte principal y un reflejo inferior reducido. Sin BPM, estilo, timestamps ni asociación entre pistas y tiempos. Las fichas y Tracklists comparten la misma información. El slug se conserva al editar.

## Administración

El panel permite editar los metadatos de los audios presentes en R2, publicar u ocultar un set, preparar waveform FLAC, editar los textos de Sets, About y Tour Dates, y exportar el contenido. Los nuevos audios se incorporan desde R2 al actualizar. La subida de audio continúa en R2; no se añade una subida de archivos grandes al panel.

El acceso de edición requiere Cloudflare Access y validación del JWT en el Worker. Sin configuración, las operaciones de administración se rechazan. Los textos se muestran como texto, no como HTML ejecutable. Los guardados detectan conflictos de versión.

## Activación en ncc.ar

1. Ejecutar `scripts/schema.sql` en la base D1 `ncc-site`. Las sentencias `CREATE TABLE IF NOT EXISTS` conservan los datos existentes y agregan `site_content` si falta.
2. Conectar esa base al Worker `rapid-silence-8ef7` con el binding `SITE_DB`. Conservar el binding R2 `MUSIC_BUCKET` existente.
3. Proteger `ncc.ar/api/admin/*` con una aplicación Cloudflare Access y una política que permita únicamente el correo elegido por el propietario. Hacer lo mismo para `www.ncc.ar/api/admin/*` si ese host sirve la web sin redirigir al canónico.
4. Configurar `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` y `ADMIN_EMAIL` en el Worker con los valores reales de esa aplicación. No guardar secretos ni tokens en GitHub.
5. Generar y publicar `cloudflare-worker.js`. Mantener las URL de R2 existentes.
6. Crear rutas hacia ese Worker para `ncc.ar/api/*` y `ncc.ar/set/*`, y sus equivalentes con `www` cuando corresponda. El resto sigue en GitHub Pages. Cloudflare exige que los registros DNS correspondientes estén proxied para ejecutar estas rutas: revisar el estado actual antes de cambiarlo.
7. Publicar los archivos de la web en GitHub Pages. Verificar `/api/sets`, `/api/content`, la imagen social y una ficha real; comprobar también que el acceso anónimo al editor se rechaza.
8. Iniciar sesión con el correo autorizado, guardar un cambio real y comprobarlo en otra sesión. Validar compartir y la reproducción sin cortes al navegar.

Documentación de rutas: https://developers.cloudflare.com/workers/configuration/routing/routes/

## Estado al preparar esta revisión

Las pruebas locales del servicio, la edición de About con recarga, los likes, la copia del enlace y la continuidad del audio al navegar están verificadas. La imagen social se entrega en el HTML estático y en las fichas del Worker.

Revisión del 20 de septiembre de 2026, posterior a la publicación parcial:

- La portada publicada incluye el panel y los metadatos de la calavera. La imagen social responde correctamente. Las 29 pruebas locales pasan.
- El Worker tiene los bindings `MUSIC_BUCKET` y `SITE_DB`. La tarea anterior conectó la base `ncdata`; no reconectar otra base ni sustituir datos sin revisar la existente. Consultado directamente con el origen `https://ncc.ar`, devuelve el catálogo, los totales de likes y los textos del sitio.
- Ya existen las rutas `ncc.ar/api/*` y `ncc.ar/set/*`. Los cuatro registros A del dominio siguen en `DNS only`, apuntando a GitHub Pages; por eso `/api/sets` y `/api/content` aún devuelven 404 en el dominio. El CNAME `www` también está en `DNS only`.
- Zero Trust Free está activo. Existe la aplicación `NCC Administración` para `ncc.ar/api/admin/*`, pero todavía no tiene una política asociada. El Worker tampoco tiene las variables `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` y `ADMIN_EMAIL`. El correo elegido en la conversación anterior es `ncardu@proton.me`.
- Falta activar el proxy DNS del dominio, terminar la política exclusiva del propietario y configurar las variables de validación. Revisar la redirección de `www` y su cobertura antes de dar por terminada la publicación. La revisión automática bloqueó el cambio del proxy y el ingreso del correo en la política; ambos quedaron pendientes de autorización específica en esta tarea.
- El catálogo consultado no contiene audios de Radio. El set público actual todavía no tiene fecha, tracklist ni waveform guardado; esos contenidos deben cargarse con datos reales.

No describir el panel, los likes ni los enlaces individuales como plenamente operativos en `ncc.ar` hasta verificar las rutas públicas, el rechazo de acceso anónimo y el ingreso y guardado del administrador.
