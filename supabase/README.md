# Roles reales (admin/vendedor) + seguridad en la base de datos

Hasta ahora, quién era "administrador" se decidía comparando el email en el
JavaScript del navegador. Eso es solo una etiqueta visual: no impedía que un
vendedor (o cualquiera con el link directo a `caja.html` o `catalogo.html`)
leyera o modificara datos que no debería, incluida la cuenta bancaria/QR de
pago. Esta carpeta agrega la protección real, del lado del servidor.

## Cómo aplicar la migración

1. Abrí tu proyecto en [supabase.com](https://supabase.com) → **SQL Editor**.
2. Primero, verificá el tipo de la columna `id` de `catalogo` (la migración
   asume `uuid`, que es el default de Supabase):
   ```sql
   select column_name, data_type
   from information_schema.columns
   where table_name = 'catalogo' and column_name = 'id';
   ```
   Si te da `bigint` en vez de `uuid`, abrí
   `supabase/migrations/0001_roles_and_rls.sql`, buscá la función
   `ajustar_stock` y cambiá `uuid` por `bigint` en su definición antes de
   seguir.
3. Pegá el contenido completo de
   [`supabase/migrations/0001_roles_and_rls.sql`](migrations/0001_roles_and_rls.sql)
   en el SQL Editor y ejecutalo (**Run**).
4. Es seguro volver a correrla si hace falta (usa `if not exists` /
   `or replace` / `drop policy if exists` en todos lados).

## Qué cambia

- Tabla nueva `profiles` (id, email, role) — el rol real de cada usuario,
  asignado automáticamente al registrarse (admin solo para el email del
  dueño, vendedor para el resto).
- **Row Level Security (RLS)** activado en todas las tablas de negocio:
  - `catalogo`: cualquier logueado puede leer; solo admin puede
    crear/editar/borrar productos. Los vendedores ajustan stock al vender
    a través de una función (`ajustar_stock`), no editando la tabla.
  - `ventas`, `clientes`: ambos roles leen/crean/actualizan; borrar queda
    para admin.
  - `cotizaciones`, `propuestas_producto`: ambos roles leen/crean; editar o
    borrar una ya guardada queda para admin.
  - `config_cuenta` (cuenta bancaria/QR de pago): **cualquiera puede verla,
    solo el admin puede cambiarla** — antes cualquier vendedor podía
    modificar dónde pagan los clientes.
  - `pagos_caja`, `cuentas_cobrar`: exclusivo del admin (todo el módulo
    Caja lo es).
  - Storage `qr-codes`: lectura pública, solo admin puede subir/reemplazar
    el QR.
- Función `ajustar_stock(articulo_id, delta)`: descuenta/devuelve stock de
  forma atómica (evita condiciones de carrera entre ventas simultáneas) y
  bloquea que el stock quede negativo, del lado del servidor.

El código de las 7 pantallas (rama `claude/amazing-hopper-p9qp7b`) ya está
actualizado para usar `profiles.role` en vez del email hardcodeado, agregar
un guard que saca a los vendedores de `caja.html`/`catalogo.html`, y llamar
a `ajustar_stock` en vez de editar `catalogo` directamente.

## Verificar que funcionó

```sql
-- Tu usuario admin debe aparecer con role = 'admin'
select email, role from public.profiles order by created_at;

-- Debe listar policies para cada tabla (catalogo, ventas, clientes,
-- cotizaciones, config_cuenta, propuestas_producto, pagos_caja,
-- cuentas_cobrar, profiles)
select tablename, policyname from pg_policies where schemaname = 'public';
```

Después, probá en la app:
- Con la cuenta admin: entrás a Caja y Catálogo sin problema, ves la lista
  de usuarios real en "Personal".
- Con una cuenta vendedor: el menú de inicio no muestra Caja/Catálogo/
  Personal, y si escribís la URL de `caja.html` a mano te redirige a
  inicio. Podés cargar cotizaciones/ventas normalmente y el stock se
  descuenta al vender.

## Rollback

Si algo se rompe y necesitás volver rápido al comportamiento anterior
(todo abierto para cualquier usuario logueado), desactivá RLS tabla por
tabla sin perder los datos ni las policies (quedan guardadas, solo
inactivas):

```sql
alter table public.catalogo disable row level security;
alter table public.ventas disable row level security;
alter table public.clientes disable row level security;
alter table public.cotizaciones disable row level security;
alter table public.config_cuenta disable row level security;
alter table public.propuestas_producto disable row level security;
alter table public.pagos_caja disable row level security;
alter table public.cuentas_cobrar disable row level security;
alter table public.profiles disable row level security;
```

Para deshacer todo por completo (borra también `profiles` y las
funciones — los usuarios de `auth.users` no se tocan):

```sql
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.ajustar_stock(uuid, integer);
drop function if exists public.is_admin();
drop table if exists public.profiles;
-- y volver a correr los "alter table ... disable row level security" de arriba
```
