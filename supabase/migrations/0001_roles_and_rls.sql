-- =========================================================================
-- Electrodomésticos BM — Roles reales (admin/vendedor) + Row Level Security
-- =========================================================================
--
-- QUÉ RESUELVE:
-- Hoy el rol de "administrador" se decide comparando el email en el
-- JavaScript que corre en el navegador (`session.user.email === ADMIN_EMAIL`).
-- Eso es solo una pista visual: no hay ninguna regla en la base de datos que
-- impida a un vendedor (o a cualquiera con el enlace directo a caja.html o
-- catalogo.html) leer o modificar datos que no debería. Esta migración:
--
--   1. Crea una tabla `profiles` con el rol real de cada usuario.
--   2. Crea un trigger que asigna el rol automáticamente cuando alguien
--      se registra (admin solo para el email del dueño, vendedor para
--      el resto).
--   3. Activa Row Level Security (RLS) en todas las tablas de negocio y
--      define qué puede hacer cada rol — esta es la protección real,
--      aplicada en el servidor, no en el navegador.
--   4. Crea una función `ajustar_stock` para que un vendedor pueda descontar
--      stock al vender sin tener permiso para editar el catálogo completo.
--
-- ANTES DE CORRER ESTO:
-- Verificá el tipo de la columna `id` de `catalogo` (se asume `uuid`, que es
-- el default de Supabase). Corré esto primero en el SQL Editor:
--
--   select column_name, data_type
--   from information_schema.columns
--   where table_name = 'catalogo' and column_name = 'id';
--
-- Si te da "bigint" en vez de "uuid", cambiá `uuid` por `bigint` en la
-- definición de la función ajustar_stock() más abajo antes de ejecutar.
--
-- CÓMO APLICARLA:
-- Supabase → tu proyecto → SQL Editor → pegar todo este archivo → Run.
-- Es segura para volver a correr (usa IF NOT EXISTS / OR REPLACE / DROP...
-- IF EXISTS en todos lados).
--
-- CÓMO DESHACERLA (si algo se rompe):
-- Ver supabase/README.md, sección "Rollback".
-- =========================================================================

-- Cambiá este email si el dueño/admin real es otro.
-- (Es el mismo que ya está hardcodeado como ADMIN_EMAIL en el frontend.)
do $$
declare
  v_admin_email text := 'alejandro23mtz@electrodomesticosbm.com';
begin
  perform set_config('app.admin_email', v_admin_email, false);
end $$;

-- -------------------------------------------------------------------------
-- 1) Tabla de perfiles con el rol de cada usuario
-- -------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'vendedor' check (role in ('admin', 'vendedor')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- -------------------------------------------------------------------------
-- 2) Helper is_admin(): evita repetir la subconsulta en cada policy y evita
--    problemas de recursión al usarse dentro de policies de profiles.
-- -------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- -------------------------------------------------------------------------
-- 3) Trigger: crea el perfil automáticamente cuando se registra un usuario
-- -------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    case
      when new.email = current_setting('app.admin_email', true) then 'admin'
      else 'vendedor'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: crea el perfil para usuarios que ya existían antes de esta migración.
insert into public.profiles (id, email, role)
select
  u.id,
  u.email,
  case when u.email = current_setting('app.admin_email', true) then 'admin' else 'vendedor' end
from auth.users u
on conflict (id) do nothing;

-- -------------------------------------------------------------------------
-- 4) Policies de profiles
--    - Cualquier usuario ve su propio perfil; el admin ve todos (lo usa la
--      pantalla "Personal" para listar usuarios reales).
--    - Solo el admin puede cambiar roles.
-- -------------------------------------------------------------------------
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- (No hay policy de insert/delete: el trigger crea filas con SECURITY
-- DEFINER y eso no pasa por RLS. Nadie más puede insertar/borrar perfiles.)

-- -------------------------------------------------------------------------
-- 5) Catálogo — lectura para todos los logueados, escritura solo admin.
--    Los vendedores ajustan stock por la función ajustar_stock(), no
--    editando la tabla directamente.
-- -------------------------------------------------------------------------
alter table public.catalogo enable row level security;

drop policy if exists "catalogo_select" on public.catalogo;
create policy "catalogo_select" on public.catalogo
  for select using (auth.role() = 'authenticated');

drop policy if exists "catalogo_write_admin" on public.catalogo;
create policy "catalogo_write_admin" on public.catalogo
  for all using (public.is_admin()) with check (public.is_admin());

-- Función para que un vendedor descuente/devuelva stock al vender, sin
-- necesitar permiso de escritura sobre toda la tabla catalogo.
-- OJO: p_articulo_id asume que catalogo.id es uuid (default de Supabase).
-- Si tu columna id es bigint, cambiá "uuid" por "bigint" acá abajo.
create or replace function public.ajustar_stock(p_articulo_id uuid, p_delta integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nuevo_stock integer;
begin
  update public.catalogo
  set stock = coalesce(stock, 0) + p_delta
  where id = p_articulo_id
  returning stock into v_nuevo_stock;

  if v_nuevo_stock is null then
    raise exception 'Artículo no encontrado';
  end if;

  if v_nuevo_stock < 0 then
    -- revertir: no dejamos stock negativo
    update public.catalogo set stock = stock - p_delta where id = p_articulo_id;
    raise exception 'Stock insuficiente';
  end if;

  return v_nuevo_stock;
end;
$$;

grant execute on function public.ajustar_stock(uuid, integer) to authenticated;

-- -------------------------------------------------------------------------
-- 6) Ventas y clientes — ambos roles leen/crean/actualizan (lo usan en
--    ventas.html). Borrar una venta o cliente queda reservado al admin.
-- -------------------------------------------------------------------------
alter table public.ventas enable row level security;

drop policy if exists "ventas_rw" on public.ventas;
create policy "ventas_rw" on public.ventas
  for select using (auth.role() = 'authenticated');
drop policy if exists "ventas_insert" on public.ventas;
create policy "ventas_insert" on public.ventas
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "ventas_update" on public.ventas;
create policy "ventas_update" on public.ventas
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "ventas_delete_admin" on public.ventas;
create policy "ventas_delete_admin" on public.ventas
  for delete using (public.is_admin());

alter table public.clientes enable row level security;

drop policy if exists "clientes_select" on public.clientes;
create policy "clientes_select" on public.clientes
  for select using (auth.role() = 'authenticated');
drop policy if exists "clientes_insert" on public.clientes;
create policy "clientes_insert" on public.clientes
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "clientes_update" on public.clientes;
create policy "clientes_update" on public.clientes
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "clientes_delete_admin" on public.clientes;
create policy "clientes_delete_admin" on public.clientes
  for delete using (public.is_admin());

-- -------------------------------------------------------------------------
-- 7) Cotizaciones — ambos roles leen/crean. Editar/borrar una cotización ya
--    guardada queda para el admin (hoy la app no lo hace, pero por si acaso).
-- -------------------------------------------------------------------------
alter table public.cotizaciones enable row level security;

drop policy if exists "cotizaciones_select" on public.cotizaciones;
create policy "cotizaciones_select" on public.cotizaciones
  for select using (auth.role() = 'authenticated');
drop policy if exists "cotizaciones_insert" on public.cotizaciones;
create policy "cotizaciones_insert" on public.cotizaciones
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "cotizaciones_write_admin" on public.cotizaciones;
create policy "cotizaciones_write_admin" on public.cotizaciones
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "cotizaciones_delete_admin" on public.cotizaciones;
create policy "cotizaciones_delete_admin" on public.cotizaciones
  for delete using (public.is_admin());

-- -------------------------------------------------------------------------
-- 8) Config de cuenta (banco/QR de pago) — CUALQUIERA logueado puede verla
--    (se muestra en las cotizaciones a los clientes), pero solo el admin
--    puede cambiarla. Esto es lo más sensible: hoy cualquier vendedor podía
--    cambiar la cuenta bancaria/QR donde los clientes pagan.
-- -------------------------------------------------------------------------
alter table public.config_cuenta enable row level security;

drop policy if exists "config_cuenta_select" on public.config_cuenta;
create policy "config_cuenta_select" on public.config_cuenta
  for select using (auth.role() = 'authenticated');
drop policy if exists "config_cuenta_write_admin" on public.config_cuenta;
create policy "config_cuenta_write_admin" on public.config_cuenta
  for all using (public.is_admin()) with check (public.is_admin());

-- -------------------------------------------------------------------------
-- 9) Propuestas de producto (mercados) — ambos roles leen/crean.
-- -------------------------------------------------------------------------
alter table public.propuestas_producto enable row level security;

drop policy if exists "propuestas_select" on public.propuestas_producto;
create policy "propuestas_select" on public.propuestas_producto
  for select using (auth.role() = 'authenticated');
drop policy if exists "propuestas_insert" on public.propuestas_producto;
create policy "propuestas_insert" on public.propuestas_producto
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "propuestas_write_admin" on public.propuestas_producto;
create policy "propuestas_write_admin" on public.propuestas_producto
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "propuestas_delete_admin" on public.propuestas_producto;
create policy "propuestas_delete_admin" on public.propuestas_producto
  for delete using (public.is_admin());

-- -------------------------------------------------------------------------
-- 10) Caja (pagos_caja, cuentas_cobrar) — módulo exclusivo del admin.
-- -------------------------------------------------------------------------
alter table public.pagos_caja enable row level security;

drop policy if exists "pagos_caja_admin" on public.pagos_caja;
create policy "pagos_caja_admin" on public.pagos_caja
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.cuentas_cobrar enable row level security;

drop policy if exists "cuentas_cobrar_admin" on public.cuentas_cobrar;
create policy "cuentas_cobrar_admin" on public.cuentas_cobrar
  for all using (public.is_admin()) with check (public.is_admin());

-- -------------------------------------------------------------------------
-- 11) Storage — bucket qr-codes: lectura pública (se muestra a clientes),
--     solo el admin puede subir/reemplazar el QR de pago.
-- -------------------------------------------------------------------------
drop policy if exists "qr_codes_select" on storage.objects;
create policy "qr_codes_select" on storage.objects
  for select using (bucket_id = 'qr-codes');

drop policy if exists "qr_codes_write_admin" on storage.objects;
create policy "qr_codes_write_admin" on storage.objects
  for all using (bucket_id = 'qr-codes' and public.is_admin())
  with check (bucket_id = 'qr-codes' and public.is_admin());

-- =========================================================================
-- Fin de la migración.
-- Verificá el resultado con las consultas de supabase/README.md
-- (sección "Verificar que funcionó").
-- =========================================================================
