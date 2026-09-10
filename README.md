# App-electroBm-

App interna de gestión para **Electrodomésticos BM** (línea blanca y línea gas, Bolivia): información de mercado, cotizaciones, caja, catálogo y ventas.

Todo el código vive en la carpeta [`app/`](app). Es una PWA instalable (manifest + service worker) construida en HTML/CSS/JS plano sobre [Supabase](https://supabase.com) — sin frameworks ni paso de build.

## Estructura

```
app/
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
```

## Cómo probarla localmente

```bash
cd app
python3 -m http.server 8080
# abrir http://localhost:8080/login.html
```

## Instalar como app en el celular

Desde Chrome (Android) o Safari (iOS), abrir `login.html` publicado y usar
"Agregar a pantalla de inicio" / "Instalar app". Queda con ícono propio,
sin barra de navegador, y con un service worker que cachea las pantallas
para que abra más rápido en conexiones débiles.
