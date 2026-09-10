# App-electroBm-

App interna de gestión para **Electrodomésticos BM** (línea blanca y línea gas, Bolivia): información de mercado, cotizaciones, caja, catálogo y ventas.

Todo el código vive en la carpeta [`app/`](app). Es una PWA instalable (manifest + service worker) construida en HTML/CSS/JS plano sobre [Supabase](https://supabase.com) — sin frameworks ni paso de build.

## Estructura

```
app/
├── index.html            # Redirige a login.html (entrada por defecto de Capacitor)
├── login.html          # Autenticación
├── inicio.html          # Dashboard con accesos por rol (admin / vendedor)
├── mercados.html         # Relevamiento de mercado y propuestas de producto
├── cotizaciones.html    # Generar y enviar cotizaciones (incluye QR de pago)
├── caja.html            # Ingresos, egresos, cuentas por cobrar y arqueo
├── catalogo.html         # Alta/edición de productos y precios
├── ventas.html          # Registro de ventas, clientes y facturación
├── offline.html          # Pantalla de respaldo sin conexión
├── manifest.json         # Metadatos de instalación (PWA)
├── sw.js                # Service worker (app shell cacheado, offline básico)
└── icons/                # Íconos de la app (192/512/maskable/apple-touch-icon)

android/                  # Proyecto nativo Android generado por Capacitor
resources/                # icon.png / splash.png fuente para generar los íconos nativos
capacitor.config.json     # Configuración de Capacitor (appId, nombre, webDir)
.github/workflows/        # CI que compila el .apk automáticamente
supabase/                 # Migración SQL de roles (admin/vendedor) + RLS — ver supabase/README.md
```

## Roles y seguridad (admin / vendedor)

El rol de cada usuario vive en la tabla `profiles` de Supabase y se hace
cumplir con Row Level Security (RLS) — no solo ocultando botones en el
frontend. **Antes de desplegar el código de `app/` a producción hace falta
correr la migración SQL una sola vez** (`supabase/migrations/0001_roles_and_rls.sql`).
Instrucciones completas, qué protege cada policy y cómo revertir si algo
sale mal: [`supabase/README.md`](supabase/README.md).

⚠️ Si el código nuevo llega a producción sin haber corrido la migración,
`caja.html` y `catalogo.html` van a redirigir a todos —admin incluido— de
vuelta a `inicio.html`, porque la tabla `profiles` todavía no existe.
Corré la migración primero.

## Cómo probarla localmente (navegador)

```bash
cd app
python3 -m http.server 8080
# abrir http://localhost:8080/login.html
```

## Instalar como PWA en el celular (sin generar APK)

Desde Chrome (Android) o Safari (iOS), abrir `login.html` publicado y usar
"Agregar a pantalla de inicio" / "Instalar app". Queda con ícono propio,
sin barra de navegador, y con un service worker que cachea las pantallas
para que abra más rápido en conexiones débiles.

## Generar el .apk (app Android nativa)

La app está empaquetada con [Capacitor](https://capacitorjs.com), que envuelve
exactamente el mismo código de `app/` dentro de un proyecto Android nativo
(`android/`). Dos formas de obtener el `.apk`:

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

Requiere tener instalado [Android Studio](https://developer.android.com/studio)
(incluye el Android SDK).

```bash
npm install
npx cap sync android
npx cap open android        # abre el proyecto en Android Studio
```

Desde Android Studio: `Build → Build Bundle(s) / APK(s) → Build APK(s)`.
El `.apk` queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

También puede compilarse por línea de comandos si ya tienes el Android SDK
instalado y `ANDROID_HOME` configurado:

```bash
cd android
./gradlew assembleDebug
```

### Cada vez que cambies algo en `app/`

Vuelve a sincronizar antes de compilar, para que el proyecto Android tenga
la última versión del código web:

```bash
npx cap sync android
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
