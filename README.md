# App-electroBm-

App interna de gestión para **Electrodomésticos BM** (Bolivia): cotizaciones,
ventas, inventario, caja, usuarios y un catálogo público para clientes.
HTML/CSS/JS plano sobre [Supabase](https://supabase.com) — sin frameworks ni
paso de build.

En producción vive en Cloudflare Workers:
**https://calm-grass-5e53.alecito23maralta.workers.dev**

## Estructura

```
app/
├── index.html            # Login + panel interno (Cotizaciones, Ventas,
│                          # Inventario, Caja, Usuarios, Chat, Comprobantes)
├── catalogo.html          # Catálogo público, sin login, para clientes
├── app.js                # Toda la lógica del panel interno
├── catalogo-publico.js    # Lógica del catálogo público
├── config.js              # Credenciales de Supabase (URL + anon key)
├── style.css              # Estilos (tema oscuro, acento verde #00e5a0)
├── offline.html            # Pantalla de respaldo sin conexión
├── manifest.json           # Metadatos de instalación (PWA)
├── sw.js                  # Service worker (app shell cacheado)
└── icons/                  # Íconos de la app

android/                  # Proyecto nativo Android generado por Capacitor
resources/                # icon.png / splash.png fuente de los íconos nativos
capacitor.config.json     # Config de Capacitor — apunta a la web en vivo
.github/workflows/        # CI que compila el .apk automáticamente
supabase/                 # schema.sql (tablas + roles + RLS) — ver supabase/README.md
```

## Cómo probarla localmente

```bash
cd app
python3 -m http.server 8080
# abrir http://localhost:8080/index.html
```

## Roles y seguridad

El acceso de cada usuario (admin/vendedor) se controla con Row Level
Security en Supabase, no en el frontend: un vendedor solo ve sus propias
ventas/cotizaciones/caja, el admin ve todo. Detalle completo en
[`supabase/README.md`](supabase/README.md).

## Instalar como PWA en el celular (sin generar APK)

Desde Chrome (Android) o Safari (iOS), abrir la web en producción y usar
"Agregar a pantalla de inicio" / "Instalar app". Queda con ícono propio,
sin barra de navegador, y con un service worker que cachea las pantallas
para que abra más rápido en conexiones débiles.

## Generar el .apk (app Android nativa)

La app está empaquetada con [Capacitor](https://capacitorjs.com). El
`.apk` no lleva una copia local del código: `capacitor.config.json` tiene
configurado `server.url` apuntando a la web en producción, así que el
APK siempre carga la versión publicada — actualizar la web actualiza la
app instalada, sin recompilar.

### Opción A — Automático con GitHub Actions (no requiere instalar nada)

1. Sube/mergea estos cambios a la rama `main` (o entra a la pestaña **Actions**
   del repo y ejecuta manualmente el workflow **Build Android APK**).
2. Cuando termine (~3-5 min), entra al run finalizado → sección **Artifacts** →
   descarga `electrobm-app-debug` (contiene `app-debug.apk`).
3. Copia el `.apk` al celular e instálalo (Android pedirá habilitar
   "Instalar apps de orígenes desconocidos" la primera vez).

Este build es de **depuración** (sin firmar), ideal para probar en dispositivos
propios. Para publicarla en Play Store se necesita un build **release firmado**
(ver más abajo).

### Opción B — Localmente con Android Studio

```bash
npm install
npx cap sync android
npx cap open android        # abre el proyecto en Android Studio
```

Desde Android Studio: `Build → Build Bundle(s) / APK(s) → Build APK(s)`.
El `.apk` queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

O por línea de comandos, si ya tenés el Android SDK instalado:

```bash
cd android
./gradlew assembleDebug
```

### Firmar un APK/AAB de release (para publicar en Play Store)

1. Generar una keystore (una sola vez, guárdala en un lugar seguro — sin ella
   no podrás actualizar la app publicada):
   ```bash
   keytool -genkey -v -keystore electrobm-release.keystore -alias electrobm \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
2. En Android Studio: `Build → Generate Signed Bundle / APK`, selecciona la
   keystore generada y sigue el asistente (genera `.aab` para subir a Play
   Console, o `.apk` firmado para distribución directa).
