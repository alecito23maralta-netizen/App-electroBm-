# Base de datos (Supabase)

Proyecto real: **`eyrntbnmtysicctjewdz`** (llamado "ElectroBM.com" en el dashboard).
La URL y la `anon key` ya están en [`../app/config.js`](../app/config.js) — la anon
key es pública a propósito, la seguridad real la da RLS (Row Level Security),
no el secreto de esa key.

## Archivos

- **`schema.sql`** — el esquema completo: tablas, roles (admin/vendedor),
  triggers y políticas RLS. Está pensado para pegarse entero en el SQL
  Editor de Supabase; usa `create table if not exists` / `add column if
  not exists` / `drop policy if exists` en todos lados, así que correrlo
  de nuevo sobre una base que ya lo tiene no rompe nada.
- **`herramientas_import.sql`** — carga puntual de 1284 productos de la
  categoría "Herramientas" (proveedor JADEVER). Ya se corrió una vez; es
  solo de referencia, no hace falta volver a ejecutarlo salvo que se
  reimporte ese catálogo desde cero.

## Cómo están protegidos los datos

Todo el control de quién puede ver/editar qué vive en las políticas RLS
de `schema.sql`, no en el JavaScript del frontend:

- Un **vendedor** solo ve sus propias cotizaciones, ventas y sesiones de
  caja (`vendedor_id = auth.uid()` / `usuario_id = auth.uid()`).
- Un **admin** ve todo de todos (`public.is_admin()`), y es el único que
  puede editar el catálogo de productos, gestionar usuarios, y tocar caja
  ajena.
- El catálogo (`productos`), clientes, promociones y medios de pago son
  de lectura libre para cualquier usuario logueado, pero de escritura
  exclusiva del admin.
- `catalogo_publico` (vista) y `configuracion` (redes sociales/WhatsApp)
  son legibles incluso **sin login** (`grant select ... to anon`), para
  que `catalogo.html` funcione como vidriera pública.

## Verificar que todo está aplicado

Si en algún momento hay dudas de si alguna actualización del `schema.sql`
quedó sin correr en producción, esto lo confirma:

```sql
-- Deberían existir todas estas tablas
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;
-- esperado: caja_movimientos, caja_sesiones, catalogo_publico (view),
-- clientes, comprobantes, configuracion, cotizaciones, medios_pago,
-- mensajes, movimientos_inventario, productos, profiles, promociones,
-- ventas

-- Debería haber policies para cada tabla de negocio
select tablename, policyname from pg_policies where schemaname = 'public';
```

## Primer usuario admin

Ver instrucciones en [`../app/index.html`](../app/index.html) — resumen:
Supabase → Authentication → Users → Add user, con email
`usuario@bm.internal` (el dominio ficticio que usa `config.js` para
convertir el "Usuario" que se escribe en el login en un email válido para
Supabase Auth), marcar "Auto Confirm User", y luego en Table Editor →
`profiles` cambiar `rol` a `admin` en esa fila.
