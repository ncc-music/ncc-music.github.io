🎵 NCC Music 
==============================================

Un reproductor de audio moderno y elegante para archivos de alta calidad, incluyendo formatos FLAC y WAV, alojado en GitHub Pages.

## 🌟 Características

- ✅ **Soporte para múltiples formatos**: FLAC, WAV, MP3, OGG
- ✅ **Playlist completa**: Gestión de múltiples canciones
- ✅ **Controles avanzados**:
  - Play/Pause
  - Siguiente/Anterior
  - Control de volumen
  - Barra de progreso interactiva

- ✅ **Interfaz moderna**: Diseño responsive y atractivo
- ✅ **Visualización**: Visualizador de disco giratorio
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
   - O directamente en `https://ncc-music.github.io`

## ☁️ Playlist automática desde Cloudflare R2

La web se aloja en GitHub Pages y los archivos de audio se alojan en Cloudflare R2. Para que la playlist se genere sola, un Worker mínimo lista los archivos del bucket y devuelve JSON al reproductor.

1. **Subir audios a R2**
   - Subí tus archivos de audio al bucket.
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
   - `ALLOWED_ORIGIN`: `https://ncc-music.github.io`.
   - `ALLOWED_ORIGINS`: opcional si querés permitir varios orígenes separados por coma.
   - `AUDIO_PREFIX`: opcional, sólo si tus audios están dentro de una carpeta, por ejemplo `mixes/`.

5. **Conectar GitHub Pages con el Worker**
   - Copiá la URL del Worker.
   - Pegala en `js/gdrive-player.js`, en `playlistApiUrl`.

El Worker devuelve la playlist automática en `/playlist` y sirve `/audio/<archivo>` para que el reproductor pueda generar el waveform real con CORS.

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

**[🎵 Visita el sitio](https://ncc-music.github.io)**
