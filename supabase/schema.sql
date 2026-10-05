-- ============================================================
-- Electrodomésticos BM — Trabajos de Campo
-- Esquema de base de datos para Supabase (Postgres)
-- ============================================================
-- Cómo usar:
-- 1. Entrá a tu proyecto en https://supabase.com -> SQL Editor
-- 2. Pegá TODO este archivo y ejecutalo (Run) una sola vez
-- 3. Seguí las instrucciones del README para crear el primer
--    usuario administrador
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLA DE PERFILES (rol de cada usuario)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  usuario text unique not null,
  nombre text not null default '',
  telefono text not null default '',
  rol text not null default 'vendedor' check (rol in ('admin', 'vendedor')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. CATÁLOGO DE PRODUCTOS / INVENTARIO
-- ------------------------------------------------------------
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  descripcion text not null,
  categoria text not null default 'General',
  subcategoria text not null default '',
  subfamilia text not null default '',
  codigo_fabrica text not null default '',
  codigo_interno text not null default '',
  costo numeric(12,2) not null default 0,
  precio_venta numeric(12,2) not null default 0,
  margen_porcentaje numeric(6,2) not null default 0,
  stock integer not null default 0,
  stock_minimo integer not null default 5,
  created_at timestamptz not null default now()
);

create table if not exists public.movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'salida')),
  cantidad integer not null check (cantidad > 0),
  motivo text not null default '',
  usuario_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. COTIZACIONES
-- ------------------------------------------------------------
create sequence if not exists public.cotizacion_numero_seq start 1;

create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  numero integer not null default nextval('public.cotizacion_numero_seq'),
  cliente_nombre text not null,
  cliente_telefono text not null default '',
  facturar_a text not null default '',
  cliente_nit text not null default '',
  condicion_pago text not null default 'contado' check (condicion_pago in ('contado', 'credito')),
  descuento_pct numeric(5,2) not null default 0,
  descuento_adicional_pct numeric(5,2) not null default 0,
  cuota1_pct numeric(5,2) not null default 100,
  cuota1_dias integer not null default 0,
  cuota2_pct numeric(5,2) not null default 0,
  cuota2_dias integer not null default 0,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  descuento numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada', 'convertida')),
  vendedor_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4. VENTAS
-- ------------------------------------------------------------
create sequence if not exists public.venta_numero_seq start 1;

create table if not exists public.ventas (
  id uuid primary key default gen_random_uuid(),
  numero integer not null default nextval('public.venta_numero_seq'),
  cliente_nombre text not null,
  cliente_telefono text not null default '',
  facturar_a text not null default '',
  cliente_nit text not null default '',
  condicion_pago text not null default 'contado' check (condicion_pago in ('contado', 'credito')),
  descuento_pct numeric(5,2) not null default 0,
  descuento_adicional_pct numeric(5,2) not null default 0,
  cuota1_pct numeric(5,2) not null default 100,
  cuota1_dias integer not null default 0,
  cuota2_pct numeric(5,2) not null default 0,
  cuota2_dias integer not null default 0,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  descuento numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  metodo_pago text not null default 'efectivo' check (metodo_pago in ('efectivo', 'transferencia', 'qr')),
  cobrado boolean not null default false,
  cotizacion_id uuid references public.cotizaciones (id),
  vendedor_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5. CAJA
-- ------------------------------------------------------------
create table if not exists public.caja_sesiones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.profiles (id),
  monto_apertura numeric(12,2) not null default 0,
  monto_cierre numeric(12,2),
  saldo_calculado numeric(12,2),
  diferencia numeric(12,2),
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  fecha_apertura timestamptz not null default now(),
  fecha_cierre timestamptz
);

create table if not exists public.caja_movimientos (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references public.caja_sesiones (id) on delete cascade,
  tipo text not null check (tipo in ('ingreso', 'egreso')),
  concepto text not null,
  monto numeric(12,2) not null check (monto > 0),
  metodo_pago text not null default 'efectivo',
  venta_id uuid references public.ventas (id),
  usuario_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 6. FUNCIÓN AUXILIAR: ¿el usuario actual es admin?
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and rol = 'admin'
  );
$$;

-- ------------------------------------------------------------
-- 7. TRIGGER: crear perfil automáticamente al crear un usuario
--    (usado cuando el admin da de alta un usuario nuevo)
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, usuario, nombre, telefono, rol, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'usuario', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    coalesce(new.raw_user_meta_data->>'telefono', ''),
    coalesce(new.raw_user_meta_data->>'rol', 'vendedor'),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.productos enable row level security;
alter table public.movimientos_inventario enable row level security;
alter table public.cotizaciones enable row level security;
alter table public.ventas enable row level security;
alter table public.caja_sesiones enable row level security;
alter table public.caja_movimientos enable row level security;

-- PROFILES
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (public.is_admin());

-- PRODUCTOS
drop policy if exists "productos_select" on public.productos;
create policy "productos_select" on public.productos
  for select using (auth.uid() is not null);

drop policy if exists "productos_write" on public.productos;
create policy "productos_write" on public.productos
  for all using (public.is_admin()) with check (public.is_admin());

-- MOVIMIENTOS DE INVENTARIO
drop policy if exists "movimientos_select" on public.movimientos_inventario;
create policy "movimientos_select" on public.movimientos_inventario
  for select using (auth.uid() is not null);

drop policy if exists "movimientos_insert" on public.movimientos_inventario;
create policy "movimientos_insert" on public.movimientos_inventario
  for insert with check (auth.uid() is not null);

drop policy if exists "movimientos_delete" on public.movimientos_inventario;
create policy "movimientos_delete" on public.movimientos_inventario
  for delete using (public.is_admin());

-- COTIZACIONES
drop policy if exists "cotizaciones_select" on public.cotizaciones;
create policy "cotizaciones_select" on public.cotizaciones
  for select using (vendedor_id = auth.uid() or public.is_admin());

drop policy if exists "cotizaciones_insert" on public.cotizaciones;
create policy "cotizaciones_insert" on public.cotizaciones
  for insert with check (vendedor_id = auth.uid() or public.is_admin());

drop policy if exists "cotizaciones_update" on public.cotizaciones;
create policy "cotizaciones_update" on public.cotizaciones
  for update using (vendedor_id = auth.uid() or public.is_admin());

drop policy if exists "cotizaciones_delete" on public.cotizaciones;
create policy "cotizaciones_delete" on public.cotizaciones
  for delete using (vendedor_id = auth.uid() or public.is_admin());

-- VENTAS
drop policy if exists "ventas_select" on public.ventas;
create policy "ventas_select" on public.ventas
  for select using (vendedor_id = auth.uid() or public.is_admin());

drop policy if exists "ventas_insert" on public.ventas;
create policy "ventas_insert" on public.ventas
  for insert with check (vendedor_id = auth.uid() or public.is_admin());

drop policy if exists "ventas_delete" on public.ventas;
create policy "ventas_delete" on public.ventas
  for delete using (public.is_admin());

drop policy if exists "ventas_update" on public.ventas;
create policy "ventas_update" on public.ventas
  for update using (public.is_admin());

-- CAJA SESIONES
drop policy if exists "caja_sesiones_select" on public.caja_sesiones;
create policy "caja_sesiones_select" on public.caja_sesiones
  for select using (usuario_id = auth.uid() or public.is_admin());

drop policy if exists "caja_sesiones_insert" on public.caja_sesiones;
create policy "caja_sesiones_insert" on public.caja_sesiones
  for insert with check (usuario_id = auth.uid() or public.is_admin());

drop policy if exists "caja_sesiones_update" on public.caja_sesiones;
create policy "caja_sesiones_update" on public.caja_sesiones
  for update using (usuario_id = auth.uid() or public.is_admin());

-- CAJA MOVIMIENTOS
drop policy if exists "caja_movimientos_select" on public.caja_movimientos;
create policy "caja_movimientos_select" on public.caja_movimientos
  for select using (usuario_id = auth.uid() or public.is_admin());

drop policy if exists "caja_movimientos_insert" on public.caja_movimientos;
create policy "caja_movimientos_insert" on public.caja_movimientos
  for insert with check (usuario_id = auth.uid() or public.is_admin());

drop policy if exists "caja_movimientos_delete" on public.caja_movimientos;
create policy "caja_movimientos_delete" on public.caja_movimientos
  for delete using (public.is_admin());

-- ============================================================
-- FIN DEL ESQUEMA
-- ============================================================

-- ============================================================
-- ACTUALIZACIÓN: subcategoría de producto (ej. Gas / Eléctrico)
-- Ejecutar solo si el proyecto ya existía sin esta columna
-- ============================================================
alter table public.productos add column if not exists subcategoria text not null default '';

-- ============================================================
-- ACTUALIZACIÓN: métodos de pago (efectivo/transferencia/qr)
-- y flujo de autorización + cobro desde Caja
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================

-- 1) Nueva columna para saber si una venta ya fue cobrada
alter table public.ventas add column if not exists cobrado boolean not null default false;

-- 2) Actualizar los métodos de pago permitidos en ventas
update public.ventas set metodo_pago = 'efectivo' where metodo_pago not in ('efectivo', 'transferencia', 'qr');
alter table public.ventas drop constraint if exists ventas_metodo_pago_check;
alter table public.ventas add constraint ventas_metodo_pago_check check (metodo_pago in ('efectivo', 'transferencia', 'qr'));

-- 3) Política de actualización de ventas (faltaba: el admin necesita
--    poder marcar una venta como cobrada)
drop policy if exists "ventas_update" on public.ventas;
create policy "ventas_update" on public.ventas
  for update using (public.is_admin());


-- ============================================================
-- ACTUALIZACIÓN: vista previa estilo "Nota de Venta"
-- (Facturar a, NIT, Condición de pago Contado/Crédito)
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
alter table public.cotizaciones add column if not exists facturar_a text not null default '';
alter table public.cotizaciones add column if not exists cliente_nit text not null default '';
alter table public.cotizaciones add column if not exists condicion_pago text not null default 'contado';
alter table public.cotizaciones drop constraint if exists cotizaciones_condicion_pago_check;
alter table public.cotizaciones add constraint cotizaciones_condicion_pago_check check (condicion_pago in ('contado', 'credito'));

alter table public.ventas add column if not exists facturar_a text not null default '';
alter table public.ventas add column if not exists cliente_nit text not null default '';
alter table public.ventas add column if not exists condicion_pago text not null default 'contado';
alter table public.ventas drop constraint if exists ventas_condicion_pago_check;
alter table public.ventas add constraint ventas_condicion_pago_check check (condicion_pago in ('contado', 'credito'));

-- ============================================================
-- ACTUALIZACIÓN: catálogo de Herramientas + descuento doble y
-- cuotas de cobranza en Cotizaciones/Ventas
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
alter table public.productos add column if not exists subfamilia text not null default '';
alter table public.productos add column if not exists codigo_fabrica text not null default '';
alter table public.productos add column if not exists codigo_interno text not null default '';
alter table public.productos add column if not exists margen_porcentaje numeric(6,2) not null default 0;

alter table public.cotizaciones add column if not exists descuento_pct numeric(5,2) not null default 0;
alter table public.cotizaciones add column if not exists descuento_adicional_pct numeric(5,2) not null default 0;
alter table public.cotizaciones add column if not exists cuota1_pct numeric(5,2) not null default 100;
alter table public.cotizaciones add column if not exists cuota1_dias integer not null default 0;
alter table public.cotizaciones add column if not exists cuota2_pct numeric(5,2) not null default 0;
alter table public.cotizaciones add column if not exists cuota2_dias integer not null default 0;

alter table public.ventas add column if not exists descuento_pct numeric(5,2) not null default 0;
alter table public.ventas add column if not exists descuento_adicional_pct numeric(5,2) not null default 0;
alter table public.ventas add column if not exists cuota1_pct numeric(5,2) not null default 100;
alter table public.ventas add column if not exists cuota1_dias integer not null default 0;
alter table public.ventas add column if not exists cuota2_pct numeric(5,2) not null default 0;
alter table public.ventas add column if not exists cuota2_dias integer not null default 0;

-- ============================================================
-- ACTUALIZACIÓN: base de datos de Clientes + Medios de pago
-- (cuentas bancarias y QR) para compartir al cobrar
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================

-- 1) CLIENTES: para buscar y reutilizar datos en Cotizaciones/Ventas
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null default '',
  razon_social text not null default '',
  nit text not null default '',
  created_at timestamptz not null default now()
);

alter table public.clientes enable row level security;

drop policy if exists "clientes_select" on public.clientes;
create policy "clientes_select" on public.clientes
  for select using (auth.uid() is not null);

drop policy if exists "clientes_insert" on public.clientes;
create policy "clientes_insert" on public.clientes
  for insert with check (auth.uid() is not null);

drop policy if exists "clientes_update" on public.clientes;
create policy "clientes_update" on public.clientes
  for update using (public.is_admin());

drop policy if exists "clientes_delete" on public.clientes;
create policy "clientes_delete" on public.clientes
  for delete using (public.is_admin());

-- 2) MEDIOS DE PAGO: cuentas bancarias y QR (solo el admin las carga)
create table if not exists public.medios_pago (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('banco', 'qr')),
  banco text not null default '',
  titular text not null default '',
  numero_cuenta text not null default '',
  nit_titular text not null default '',
  imagen_base64 text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.medios_pago enable row level security;

drop policy if exists "medios_pago_select" on public.medios_pago;
create policy "medios_pago_select" on public.medios_pago
  for select using (auth.uid() is not null);

drop policy if exists "medios_pago_write" on public.medios_pago;
create policy "medios_pago_write" on public.medios_pago
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- ACTUALIZACIÓN: Catálogo con fotos para mostrar a clientes
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
alter table public.productos add column if not exists imagen_base64 text;
alter table public.productos add column if not exists visible_catalogo boolean not null default true;

-- Los 1284 productos de Herramientas (sin foto) no ensucian el catálogo visual:
update public.productos set visible_catalogo = false where categoria = 'Herramientas';

-- ============================================================
-- ACTUALIZACIÓN: Promociones (splash al entrar a la app)
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
create table if not exists public.promociones (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text not null default '',
  etiqueta text not null default 'Descuento', -- Descuento / 2x1 / Otro (libre)
  imagen_base64 text,
  fecha_inicio timestamptz not null default now(),
  fecha_fin timestamptz,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.promociones enable row level security;

drop policy if exists "promociones_select" on public.promociones;
create policy "promociones_select" on public.promociones
  for select using (auth.uid() is not null);

drop policy if exists "promociones_write" on public.promociones;
create policy "promociones_write" on public.promociones
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- ACTUALIZACIÓN: Promociones (descuentos, 2x1, etc.)
-- Aparecen como popup al vendedor al entrar a la app
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
create table if not exists public.promociones (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text not null default '',
  tipo text not null default 'descuento' check (tipo in ('descuento', '2x1', 'otro')),
  imagen_base64 text,
  fecha_fin date,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.promociones enable row level security;

drop policy if exists "promociones_select" on public.promociones;
create policy "promociones_select" on public.promociones
  for select using (auth.uid() is not null);

drop policy if exists "promociones_write" on public.promociones;
create policy "promociones_write" on public.promociones
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- ACTUALIZACIÓN: Chat del equipo (mensajes y fotos)
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
create table if not exists public.mensajes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.profiles (id),
  nombre_remitente text not null default '',
  rol_remitente text not null default 'vendedor',
  texto text,
  imagen_base64 text,
  created_at timestamptz not null default now()
);

alter table public.mensajes enable row level security;

drop policy if exists "mensajes_select" on public.mensajes;
create policy "mensajes_select" on public.mensajes
  for select using (auth.uid() is not null);

drop policy if exists "mensajes_insert" on public.mensajes;
create policy "mensajes_insert" on public.mensajes
  for insert with check (usuario_id = auth.uid());

drop policy if exists "mensajes_delete" on public.mensajes;
create policy "mensajes_delete" on public.mensajes
  for delete using (usuario_id = auth.uid() or public.is_admin());

-- Habilitar actualización en vivo (Realtime) para esta tabla
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensajes'
  ) then
    alter publication supabase_realtime add table public.mensajes;
  end if;
end $$;

-- ============================================================
-- ACTUALIZACIÓN: medio de pago incrustado en la nota
-- (cuenta bancaria o QR se muestran directo en Vista previa/PDF/WhatsApp)
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
alter table public.ventas add column if not exists medio_pago_id uuid references public.medios_pago (id);

alter table public.cotizaciones add column if not exists metodo_pago text not null default 'efectivo';
alter table public.cotizaciones drop constraint if exists cotizaciones_metodo_pago_check;
alter table public.cotizaciones add constraint cotizaciones_metodo_pago_check check (metodo_pago in ('efectivo', 'transferencia', 'qr'));
alter table public.cotizaciones add column if not exists medio_pago_id uuid references public.medios_pago (id);

-- ============================================================
-- ACTUALIZACIÓN: teléfono del usuario (para catálogo con contacto de asesor)
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
alter table public.profiles add column if not exists telefono text not null default '';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, usuario, nombre, telefono, rol, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'usuario', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    coalesce(new.raw_user_meta_data->>'telefono', ''),
    coalesce(new.raw_user_meta_data->>'rol', 'vendedor'),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ============================================================
-- ACTUALIZACIÓN: Catálogo público (sin login) para clientes
-- Solo expone descripción, categoría, subcategoría, precio de
-- venta e imagen — nunca el precio de proveedor ni datos internos.
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
create or replace view public.catalogo_publico as
select id, descripcion, categoria, subcategoria, precio_venta, imagen_base64
from public.productos
where visible_catalogo = true;

grant select on public.catalogo_publico to anon;

-- ============================================================
-- ACTUALIZACIÓN: Comprobantes de pago (recibos formales)
-- Historial de impresión visible a admin/vendedores, generación
-- de comprobantes solo para admin.
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
create sequence if not exists public.comprobante_numero_seq start 1;

create table if not exists public.comprobantes (
  id uuid primary key default gen_random_uuid(),
  numero integer not null default nextval('public.comprobante_numero_seq'),
  fecha date not null default current_date,
  cliente_nombre text not null,
  venta_numero text,
  forma_pago text not null default 'efectivo' check (forma_pago in ('efectivo', 'transferencia', 'mixto')),
  monto_total numeric(12,2) not null default 0,
  monto_efectivo numeric(12,2) not null default 0,
  monto_transferido numeric(12,2) not null default 0,
  saldo_pendiente numeric(12,2) not null default 0,
  banco text,
  cuenta_destino text,
  cajero_id uuid references public.profiles (id),
  cajero_nombre text not null default '',
  created_at timestamptz not null default now()
);

alter table public.comprobantes enable row level security;

drop policy if exists "comprobantes_select" on public.comprobantes;
create policy "comprobantes_select" on public.comprobantes
  for select using (auth.uid() is not null);

drop policy if exists "comprobantes_write" on public.comprobantes;
create policy "comprobantes_write" on public.comprobantes
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- ACTUALIZACIÓN: enlazar Caja con Comprobantes
-- Cada cobro genera su comprobante, y cada comprobante manual
-- genera su movimiento de caja — quedan enlazados entre sí.
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
alter table public.comprobantes add column if not exists caja_movimiento_id uuid references public.caja_movimientos (id);
alter table public.caja_movimientos add column if not exists comprobante_id uuid references public.comprobantes (id);

alter table public.comprobantes drop constraint if exists comprobantes_forma_pago_check;
alter table public.comprobantes add constraint comprobantes_forma_pago_check check (forma_pago in ('efectivo', 'transferencia', 'qr', 'mixto'));

-- ============================================================
-- ACTUALIZACIÓN: Configuración de la tienda (redes sociales,
-- WhatsApp) editable desde Usuarios → 🔗 Redes sociales,
-- visible en el catálogo público sin necesidad de login.
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
create table if not exists public.configuracion (
  id integer primary key default 1,
  whatsapp_numero text not null default '',
  facebook_url text not null default '',
  tiktok_url text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.configuracion (id) values (1) on conflict (id) do nothing;

alter table public.configuracion enable row level security;

drop policy if exists "configuracion_select" on public.configuracion;
create policy "configuracion_select" on public.configuracion
  for select using (true);

drop policy if exists "configuracion_write" on public.configuracion;
create policy "configuracion_write" on public.configuracion
  for update using (public.is_admin()) with check (public.is_admin());

grant select on public.configuracion to anon;

-- ============================================================
-- ACTUALIZACIÓN: firma del interesado en comprobantes (dibujada
-- a mano en el formulario, se guarda como imagen)
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
alter table public.comprobantes add column if not exists firma_base64 text;

-- ============================================================
-- ACTUALIZACIÓN: alertas de cambio de precio (subida/bajada)
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
alter table public.productos add column if not exists precio_anterior numeric(12,2);
alter table public.productos add column if not exists precio_actualizado_at timestamptz;

-- ============================================================
-- ACTUALIZACIÓN: Garantías (ligadas a una venta ya guardada)
-- El admin registra hasta qué fecha queda cubierta cada venta.
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
create table if not exists public.garantias (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid references public.ventas (id) on delete set null,
  venta_numero integer,
  cliente_nombre text not null,
  cliente_telefono text not null default '',
  producto_descripcion text not null,
  fecha_compra date not null default current_date,
  fecha_vencimiento date not null,
  notas text not null default '',
  registrado_por uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.garantias enable row level security;

-- Cualquier usuario logueado puede consultar (útil para atender un reclamo
-- de un cliente aunque no haya sido el vendedor que hizo la venta).
-- Solo el admin registra, edita o borra garantías.
drop policy if exists "garantias_select" on public.garantias;
create policy "garantias_select" on public.garantias
  for select using (auth.uid() is not null);

drop policy if exists "garantias_write" on public.garantias;
create policy "garantias_write" on public.garantias
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- ACTUALIZACIÓN: Chat individual (cada vendedor con la administración),
-- además del chat general que ya existía.
-- conversacion_con = null      -> mensaje del chat general (como antes)
-- conversacion_con = <id de un vendedor> -> hilo privado de ESE vendedor
--   con la administración. Cualquier admin puede leer/escribir en
--   cualquier hilo; un vendedor solo ve y escribe el suyo.
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
alter table public.mensajes add column if not exists conversacion_con uuid references public.profiles (id);

drop policy if exists "mensajes_select" on public.mensajes;
create policy "mensajes_select" on public.mensajes
  for select using (
    conversacion_con is null
    or conversacion_con = auth.uid()
    or usuario_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "mensajes_insert" on public.mensajes;
create policy "mensajes_insert" on public.mensajes
  for insert with check (
    usuario_id = auth.uid()
    and (conversacion_con is null or conversacion_con = auth.uid() or public.is_admin())
  );

-- ============================================================
-- ACTUALIZACIÓN: Certificado de garantía — número correlativo,
-- datos del producto/compra para el impreso, condiciones de
-- cobertura y firma del cliente (igual que en comprobantes).
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
alter table public.garantias add column if not exists numero integer;
alter table public.garantias add column if not exists cliente_ci text not null default '';
alter table public.garantias add column if not exists numero_serie text not null default '';
alter table public.garantias add column if not exists precio numeric(12,2);
alter table public.garantias add column if not exists condiciones text not null default '';
alter table public.garantias add column if not exists firma_base64 text;
alter table public.garantias add column if not exists registrado_por_nombre text not null default '';

-- ============================================================
-- ACTUALIZACIÓN: descuento máximo por producto (tope de descuento
-- que se le puede dar al cliente final en cotizaciones/ventas).
-- null = sin límite (no cambia el comportamiento de los productos
-- que ya tenías cargados).
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
alter table public.productos add column if not exists descuento_maximo_pct numeric(5,2);

-- ============================================================
-- ACTUALIZACIÓN: umbral de margen mínimo aceptable (para el panel
-- de Rentabilidad en Inventario — marca en rojo los productos por
-- debajo de este %).
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
alter table public.configuracion add column if not exists margen_minimo_pct numeric(5,2) not null default 20;

-- ============================================================
-- ACTUALIZACIÓN: autorización de ventas a crédito en Bs 0.
-- Una venta a crédito recién hecha no tiene que mover la caja (el
-- cliente todavía no pagó nada) — antes, el único botón disponible
-- en Caja → Autorizar era "Cobrar", que siempre registraba el monto
-- total como ingreso, aumentando el saldo aunque no haya entrado
-- plata real. Ahora las ventas a crédito pasan primero por
-- "Autorizar" (registra Bs 0 en caja_movimientos, sin tocar el
-- saldo) y recién cuando el cliente efectivamente paga se usa
-- "Cobrar" (igual que antes, con el monto real).
-- default false para que las ventas a crédito ya cargadas y aún no
-- cobradas pidan esta autorización la próxima vez que se las vea.
-- También se afloja la restricción de caja_movimientos.monto (antes
-- exigía > 0) para poder registrar este movimiento en Bs 0.
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
alter table public.ventas add column if not exists autorizada boolean not null default false;
alter table public.caja_movimientos drop constraint if exists caja_movimientos_monto_check;
alter table public.caja_movimientos add constraint caja_movimientos_monto_check check (monto >= 0);

-- ============================================================
-- ACTUALIZACIÓN: abonos/amortizaciones a ventas a crédito.
-- Antes, una venta a crédito ya autorizada solo se podía "Cobrar" por
-- el total completo de una sola vez. Ahora se le pueden ir registrando
-- abonos parciales (cada uno genera su propio caja_movimientos, por
-- la plata que efectivamente entra ese día) hasta cubrir el saldo —
-- recién ahí la venta queda marcada como cobrada de verdad.
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
create table if not exists public.venta_abonos (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas (id) on delete cascade,
  monto numeric(12,2) not null check (monto > 0),
  metodo_pago text not null default 'efectivo',
  usuario_id uuid references public.profiles (id),
  caja_movimiento_id uuid references public.caja_movimientos (id),
  created_at timestamptz not null default now()
);
alter table public.venta_abonos enable row level security;

drop policy if exists "venta_abonos_select" on public.venta_abonos;
create policy "venta_abonos_select" on public.venta_abonos
  for select using (
    public.is_admin()
    or exists (select 1 from public.ventas v where v.id = venta_id and v.vendedor_id = auth.uid())
  );

drop policy if exists "venta_abonos_insert" on public.venta_abonos;
create policy "venta_abonos_insert" on public.venta_abonos
  for insert with check (public.is_admin());

-- ============================================================
-- ACTUALIZACIÓN: permisos de acceso por módulo (grilla de checkboxes
-- en el formulario de Usuarios). Por ahora es solo informativo — el
-- acceso real lo sigue controlando el rol Vendedor/Administrador
-- como hasta ahora; esto queda guardado para conectarlo más adelante.
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
alter table public.profiles add column if not exists permisos text[] not null default '{}';

-- ============================================================
-- ACTUALIZACIÓN: subgrupo "Costos" dentro de Inventario — réplica
-- del libro de costos que se llevaba en Excel. Un lote_costos agrupa
-- una compra con su flete total y % de ganancia; cada items_costos
-- es un ítem de esa compra (descripción, cantidad, monto total
-- pagado). El costo unitario, el envío repartido, el costo final y
-- el precio de venta se calculan en la app (no se guardan, para que
-- siempre reflejen los parámetros actuales del lote). Cuando un ítem
-- se sube a Inventario como producto nuevo, queda linkeado en
-- items_costos.producto_id.
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
create table if not exists public.lotes_costos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  flete_total numeric(12,2) not null default 0,
  ganancia_pct numeric(6,2) not null default 100,
  usuario_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.items_costos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes_costos (id) on delete cascade,
  descripcion text not null,
  cantidad integer not null check (cantidad > 0),
  monto_compra numeric(12,2) not null default 0,
  producto_id uuid references public.productos (id),
  created_at timestamptz not null default now()
);

alter table public.lotes_costos enable row level security;
alter table public.items_costos enable row level security;

drop policy if exists "lotes_costos_all" on public.lotes_costos;
create policy "lotes_costos_all" on public.lotes_costos
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "items_costos_all" on public.items_costos;
create policy "items_costos_all" on public.items_costos
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- ACTUALIZACIÓN: subgrupo "Rotación" dentro de Inventario — vas
-- subiendo las planchas de pedido (u otra planilla con Código y
-- Cantidad) una por una y quedan en un historial acumulado, para ver
-- qué mercadería sale más y cuándo. Cada importación queda en
-- importaciones_rotacion; cada línea (código + cantidad + fecha) en
-- rotacion_items, con producto_id enlazado cuando el código coincide
-- con un producto ya cargado en Inventario (en ese caso la
-- descripción que se muestra es la del producto real, no la del
-- archivo).
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
create table if not exists public.importaciones_rotacion (
  id uuid primary key default gen_random_uuid(),
  nombre_archivo text not null,
  mes text not null,
  lineas integer not null default 0,
  usuario_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.rotacion_items (
  id uuid primary key default gen_random_uuid(),
  importacion_id uuid not null references public.importaciones_rotacion (id) on delete cascade,
  codigo text not null,
  descripcion text not null default '',
  cantidad numeric(12,2) not null default 0,
  fecha date not null,
  producto_id uuid references public.productos (id),
  created_at timestamptz not null default now()
);

alter table public.importaciones_rotacion enable row level security;
alter table public.rotacion_items enable row level security;

drop policy if exists "importaciones_rotacion_all" on public.importaciones_rotacion;
create policy "importaciones_rotacion_all" on public.importaciones_rotacion
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "rotacion_items_all" on public.rotacion_items;
create policy "rotacion_items_all" on public.rotacion_items
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- ACTUALIZACIÓN: permite borrar un abono de venta a crédito. Hacía
-- falta para poder deshacer del todo un cobro mal cargado desde Caja
-- (movimiento + comprobante + abono, los tres juntos) — sin esta
-- política, el borrado del abono quedaba silenciosamente bloqueado
-- por RLS aunque el usuario fuera admin.
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
drop policy if exists "venta_abonos_delete" on public.venta_abonos;
create policy "venta_abonos_delete" on public.venta_abonos
  for delete using (public.is_admin());

-- ============================================================
-- ACTUALIZACIÓN: BAM en el Chat — pestaña propia con informe diario
-- (ventas/cobranzas/cotizaciones/créditos por vencer) y agenda de
-- recordatorios personales. Cada usuario solo ve sus propios mensajes
-- de BAM y sus propios recordatorios (aunque el CONTENIDO del informe
-- del admin resuma a todo el equipo, el registro en sí es privado).
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
create table if not exists public.bam_mensajes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles (id) on delete cascade,
  tipo text not null default 'informe' check (tipo in ('informe', 'recordatorio')),
  contenido text not null,
  fecha date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.bam_recordatorios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles (id) on delete cascade,
  texto text not null,
  fecha date not null,
  cumplido boolean not null default false,
  avisado boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.bam_mensajes enable row level security;
alter table public.bam_recordatorios enable row level security;

drop policy if exists "bam_mensajes_all" on public.bam_mensajes;
create policy "bam_mensajes_all" on public.bam_mensajes
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists "bam_recordatorios_all" on public.bam_recordatorios;
create policy "bam_recordatorios_all" on public.bam_recordatorios
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- ============================================================
-- ACTUALIZACIÓN: recordatorios de la agenda con BAM ahora avisan en
-- 3 momentos (antes solo se avisaba una vez, al llegar la fecha):
--   1) la noche anterior (20:00)
--   2) la mañana del día acordado (07:00)
--   3) 30 minutos antes de la hora puesta en la agenda (si se cargó
--      una hora — el campo "hora" es opcional, así los recordatorios
--      viejos sin hora siguen avisando los primeros dos momentos)
-- Se reemplaza el único flag "avisado" por uno por momento, para que
-- cada aviso se dispare una sola vez.
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
alter table public.bam_recordatorios add column if not exists hora time;
alter table public.bam_recordatorios add column if not exists avisado_noche boolean not null default false;
alter table public.bam_recordatorios add column if not exists avisado_manana boolean not null default false;
alter table public.bam_recordatorios add column if not exists avisado_30min boolean not null default false;

update public.bam_recordatorios set avisado_noche = true, avisado_manana = true, avisado_30min = true
  where avisado = true;

alter table public.bam_recordatorios drop column if exists avisado;

-- ============================================================
-- ACTUALIZACIÓN: Control Físico de Inventario — nueva pestaña dentro
-- de Inventario para hacer un conteo físico (stock real contado a
-- mano/con cámara) contra el stock del sistema. Queda compartido en
-- Supabase (una "sesión" de conteo que cualquier admin puede seguir
-- cargando desde otro celular) en vez de guardarse solo en el
-- dispositivo. Por ahora es solo informe/comparación: NO ajusta
-- productos.stock ni categoria/subcategoria automáticamente — eso
-- se hace aparte, a mano, en Catálogo, si hace falta corregir algo.
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
create table if not exists public.control_fisico_sesiones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  usuario_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  cerrada_at timestamptz
);

create table if not exists public.control_fisico_items (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references public.control_fisico_sesiones (id) on delete cascade,
  producto_id uuid references public.productos (id),
  codigo text not null default '',
  descripcion text not null default '',
  categoria text not null default '',
  subcategoria text not null default '',
  categoria_editada boolean not null default false,
  stock_sistema integer not null default 0,
  stock_fisico integer not null default 0,
  adiciones jsonb not null default '[]'::jsonb,
  es_nuevo boolean not null default false,
  foto_base64 text,
  usuario_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- único por producto real dentro de la sesión (evita contarlo 2 veces);
  -- los ítems "nuevos" (producto_id null, no están en el catálogo) no
  -- chocan entre sí — Postgres no aplica unicidad entre NULLs.
  unique (sesion_id, producto_id)
);

alter table public.control_fisico_sesiones enable row level security;
alter table public.control_fisico_items enable row level security;

drop policy if exists "control_fisico_sesiones_all" on public.control_fisico_sesiones;
create policy "control_fisico_sesiones_all" on public.control_fisico_sesiones
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "control_fisico_items_all" on public.control_fisico_items;
create policy "control_fisico_items_all" on public.control_fisico_items
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- ACTUALIZACIÓN: email de notificaciones por usuario — el admin lo carga
-- en Usuarios (cada quien puede cargar/editar el suyo propio también),
-- separado del email sintético (usuario@bm.internal) que ya se usa para
-- el login con Supabase Auth. Se usa para mandar por email, además de
-- los avisos dentro de la app, los recordatorios de la Agenda con BAM
-- (y a futuro otros avisos) al Gmail real de cada persona.
-- Ejecutar en el proyecto que ya tenías creado
-- ============================================================
alter table public.profiles add column if not exists email_notificaciones text;
