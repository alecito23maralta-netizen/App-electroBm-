// ============================================================
// Electrodomésticos BM — app.js
// ============================================================

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CATEGORIAS_PRODUCTO = ['Termotanques', 'Calefones', 'Estufas', 'Extractores', 'Cocinas', 'Lavadoras', 'Aires Acondicionados', 'Herramientas', 'Otros'];

let profile = null;        // fila de public.profiles del usuario logueado
let adminCreds = null;     // {usuario, password} en memoria, solo para re-loguear tras crear un usuario
let productosCache = [];
let clientesCache = [];
let mediosPagoCache = [];
let promocionesCache = [];
let intervaloAlertaPendientes = null;
let intervaloNotificaciones = null;
let vistaActual = 'cotizaciones';
let canalChatGlobal = null;
let sesionCajaActual = null;
let cajaVistaAdmin = 'mia'; // 'mia' | 'todas'
let libroDesde = null;
let libroHasta = null;
let filtroCotizaciones = 'todas';
let filtroVentasNA = null;
let itemsForm = [];        // items en edición dentro del modal de cotización/venta
let cotizacionEditando = null;
let ventaEditando = null;
let condicionPagoActual = 'contado';
let descuentoPctActual = 0;
let descuentoAdicionalPctActual = 0;
let cuota2PctActual = 0;
let cuota2DiasActual = '';
let ventaOrigenCotizacion = null;
let garantiasCache = [];
let ventasParaGarantiaCache = [];
let vendedoresCache = [];       // usado por el admin para elegir con quién chatear
let chatModo = 'general';       // 'general' | 'individual'
let chatHiloVendedorId = null;  // hilo elegido por el admin en modo individual (null = lista)

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function metodoLabel(m) {
  return m === 'qr' ? 'QR' : (m ? m[0].toUpperCase() + m.slice(1) : '—');
}
function money(n) {
  return 'Bs ' + Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fecha(d) {
  return new Date(d).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fechaHora(d) {
  return new Date(d).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function emailFor(usuario) {
  const limpio = usuario.trim().toLowerCase().replace(/\s+/g, '');
  return limpio.includes('@') ? limpio : limpio + '@' + AUTH_DOMAIN;
}
function uid(prefix) {
  return prefix + Math.random().toString(36).slice(2, 9);
}
function toast(msg, type) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (type === 'error' ? ' error' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = 'toast'; }, 2600);
}
function openModal(html) {
  $('#modal-sheet').innerHTML = html;
  $('#modal-overlay').classList.add('show');
}
function closeModal() {
  $('#modal-overlay').classList.remove('show');
  $('#modal-sheet').innerHTML = '';
  itemsForm = [];
  cotizacionEditando = null;
  ventaEditando = null;
  ventaOrigenCotizacion = null;
  condicionPagoActual = 'contado';
  descuentoPctActual = 0;
  descuentoAdicionalPctActual = 0;
  cuota2PctActual = 0;
  cuota2DiasActual = '';
}
$('#modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'modal-overlay') closeModal(); });

// ------------------------------------------------------------
// LOGIN / SESIÓN
// ------------------------------------------------------------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = $('#login-usuario').value.trim();
  const password = $('#login-password').value;
  const btn = $('#login-submit');
  const errBox = $('#login-error');
  errBox.classList.remove('show');
  btn.disabled = true; btn.textContent = 'Ingresando…';

  const { data, error } = await sb.auth.signInWithPassword({ email: emailFor(usuario), password });

  if (error) {
    errBox.textContent = 'Usuario o contraseña incorrectos.';
    errBox.classList.add('show');
    btn.disabled = false; btn.textContent = 'Ingresar →';
    return;
  }

  const { data: perfil, error: perfilErr } = await sb.from('profiles').select('*').eq('id', data.user.id).single();
  if (perfilErr || !perfil || !perfil.activo) {
    errBox.textContent = !perfil?.activo ? 'Tu usuario está inactivo. Consultá con el administrador.' : 'No se pudo cargar el perfil.';
    errBox.classList.add('show');
    await sb.auth.signOut();
    btn.disabled = false; btn.textContent = 'Ingresar →';
    return;
  }

  profile = perfil;
  adminCreds = { usuario, password };
  btn.disabled = false; btn.textContent = 'Ingresar →';
  await iniciarApp();
});

$('#logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
  profile = null; adminCreds = null;
  $('#app').classList.remove('active');
  $('#login-screen').style.display = 'flex';
  $('#login-usuario').value = ''; $('#login-password').value = '';
});

async function iniciarApp() {
  $('#login-screen').style.display = 'none';
  $('#app').classList.add('active');
  $('#role-chip').textContent = `${profile.nombre || profile.usuario} · ${profile.rol === 'admin' ? 'Administrador' : 'Vendedor'}`;
  $('#role-chip').classList.toggle('admin', profile.rol === 'admin');
  $('#nav-usuarios').style.display = profile.rol === 'admin' ? '' : 'none';
  $('#nav-inventario').style.display = profile.rol === 'admin' ? '' : 'none';
  $('#nav-caja').style.display = profile.rol === 'admin' ? '' : 'none';
  $('#nav-garantias').style.display = profile.rol === 'admin' ? '' : 'none';
  $('#nav-group-gestion').style.display = profile.rol === 'admin' ? '' : 'none';
  $('.nav-group[data-group="ventas"]')?.classList.add('open');
  if (profile.rol === 'admin') $('#nav-group-gestion')?.classList.add('open');

  await cargarProductos();
  await cargarClientes();
  await cargarMediosPago();
  await cargarPromociones();
  switchView('cotizaciones');
  mostrarSaludoBienvenida();
  setTimeout(mostrarBotPendientesEntrada, 1200);
  setTimeout(mostrarBotCambiosPrecio, 2600);

  if (profile.rol !== 'admin') {
    mostrarPopupPromosVendedor();
    verificarPendientesVendedor();
    verificarNotificacionesVendedor();
    clearInterval(intervaloAlertaPendientes);
    intervaloAlertaPendientes = setInterval(verificarPendientesVendedor, 60 * 60 * 1000); // cada hora
    clearInterval(intervaloNotificaciones);
    intervaloNotificaciones = setInterval(verificarNotificacionesVendedor, 5 * 60 * 1000); // cada 5 min
  }

  await inicializarNotificacionesChat();
}

const PERRITO_SVG = `
  <svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="70" width="15" height="34" rx="7.5" fill="#7fc4e8" stroke="#2f6fa8" stroke-width="3"/>
    <rect x="97" y="70" width="15" height="34" rx="7.5" fill="#7fc4e8" stroke="#2f6fa8" stroke-width="3"/>
    <rect x="40" y="112" width="17" height="17" rx="6" fill="#7fc4e8" stroke="#2f6fa8" stroke-width="3"/>
    <rect x="63" y="112" width="17" height="17" rx="6" fill="#7fc4e8" stroke="#2f6fa8" stroke-width="3"/>
    <ellipse cx="48.5" cy="129" rx="10" ry="4" fill="#2f6fa8"/>
    <ellipse cx="71.5" cy="129" rx="10" ry="4" fill="#2f6fa8"/>
    <rect x="52" y="56" width="16" height="10" fill="#5fa8d3"/>
    <rect x="24" y="64" width="72" height="38" rx="14" fill="#bfe4f5" stroke="#2f6fa8" stroke-width="3"/>
    <rect x="43" y="76" width="34" height="17" rx="4" fill="#1c2b4a"/>
    <rect x="55" y="80.5" width="10" height="10" rx="2" fill="#ffd23f" transform="rotate(45 60 85.5)"/>
    <rect x="34" y="98" width="52" height="16" rx="8" fill="#ffd23f"/>
    <text x="60" y="109.5" text-anchor="middle" font-size="10.5" font-weight="800" fill="#1c2b4a" font-family="Arial, sans-serif">BM</text>
    <circle cx="33" cy="14" r="7" fill="#a8dcf0" stroke="#2f6fa8" stroke-width="2.5"/>
    <circle cx="87" cy="14" r="7" fill="#a8dcf0" stroke="#2f6fa8" stroke-width="2.5"/>
    <rect x="28" y="8" width="64" height="50" rx="15" fill="#7fc4e8" stroke="#2f6fa8" stroke-width="3.5"/>
    <rect x="37" y="17" width="46" height="31" rx="9" fill="#1c2b4a"/>
    <circle cx="50" cy="32.5" r="6.4" fill="#ffd23f"/>
    <circle cx="70" cy="32.5" r="6.4" fill="#ffd23f"/>
    <circle cx="52" cy="30.5" r="1.8" fill="#fff8d8"/>
    <circle cx="72" cy="30.5" r="1.8" fill="#fff8d8"/>
  </svg>
`;

let botMensajesEnPantalla = 0;

// Burbuja genérica del "bot perrito": mensaje + botones opcionales.
// tipo: 'saludo' (arriba de todo) | 'aviso' (se apila debajo, para pendientes)
function mostrarBotBurbuja(tituloHtml, textoHtml, { tipo = 'aviso', botones = [], duracionMs = 15 * 60 * 1000 } = {}) {
  const offset = tipo === 'saludo' ? 16 : 16 + botMensajesEnPantalla * 92;
  const div = document.createElement('div');
  div.className = 'saludo-bienvenida bot-burbuja';
  div.style.bottom = offset + 'px';
  div.innerHTML = `
    <div class="saludo-personaje">${PERRITO_SVG}</div>
    <div class="saludo-texto">
      <strong>${tituloHtml}</strong>
      <span>${textoHtml}</span>
      ${botones.length ? `<div class="bot-botones">${botones.map((b, i) => `<button class="bot-btn" data-bot-idx="${i}">${b.label}</button>`).join('')}</div>` : ''}
    </div>
    <button class="saludo-cerrar" title="Cerrar">✕</button>
  `;
  document.body.appendChild(div);
  botMensajesEnPantalla++;
  const quitar = () => {
    div.classList.add('saludo-salir');
    setTimeout(() => { div.remove(); botMensajesEnPantalla = Math.max(0, botMensajesEnPantalla - 1); }, 300);
  };
  div.querySelector('.saludo-cerrar').addEventListener('click', quitar);
  botones.forEach((b, i) => {
    div.querySelector(`[data-bot-idx="${i}"]`).addEventListener('click', () => { b.onClick(); quitar(); });
  });
  setTimeout(quitar, duracionMs);
  return div;
}

function mostrarSaludoBienvenida() {
  const h = new Date().getHours();
  let saludo, emoji;
  if (h < 12) { saludo = 'Buenos días'; emoji = '☀️'; }
  else if (h < 19) { saludo = 'Buenas tardes'; emoji = '🌤️'; }
  else { saludo = 'Buenas noches'; emoji = '🌙'; }

  const nombre = (profile.nombre || profile.usuario || '').split(' ')[0];
  mostrarBotBurbuja(`${saludo}, ${escapeHtml(nombre)}!`, `${emoji} Me llamo BAM 🤖, tu asistente de Electrodomésticos BM`, { tipo: 'saludo' });
}

// El bot avisa pendientes al entrar: cotizaciones sin autorizar y ventas sin
// cobrar (para el admin), o los propios pendientes hace rato (para el vendedor)
async function mostrarBotPendientesEntrada() {
  if (profile.rol === 'admin') {
    const { count: nCotiz } = await sb.from('cotizaciones').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente');
    const { count: nVentas } = await sb.from('ventas').select('*', { count: 'exact', head: true }).eq('cobrado', false);
    if (!nCotiz && !nVentas) return;
    const partes = [];
    if (nCotiz) partes.push(`${nCotiz} cotización${nCotiz > 1 ? 'es' : ''} sin autorizar`);
    if (nVentas) partes.push(`${nVentas} venta${nVentas > 1 ? 's' : ''} sin cobrar`);
    mostrarBotBurbuja('🤖 BAM te avisa:', `Tenés ${partes.join(' y ')}.`, {
      botones: [{ label: 'Ir a Autorizar →', onClick: () => { cajaVistaAdmin = 'autorizar'; switchView('caja'); } }]
    });
  } else {
    const hace5h = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const { count: nCotiz } = await sb.from('cotizaciones').select('*', { count: 'exact', head: true }).eq('vendedor_id', profile.id).eq('estado', 'pendiente').lt('created_at', hace5h);
    const { count: nVentas } = await sb.from('ventas').select('*', { count: 'exact', head: true }).eq('vendedor_id', profile.id).eq('cobrado', false).lt('created_at', hace5h);
    if (!nCotiz && !nVentas) return;
    const partes = [];
    if (nCotiz) partes.push(`${nCotiz} cotización${nCotiz > 1 ? 'es' : ''}`);
    if (nVentas) partes.push(`${nVentas} venta${nVentas > 1 ? 's' : ''}`);
    mostrarBotBurbuja('🤖 BAM te avisa:', `Tenés ${partes.join(' y ')} esperando autorización o cobro hace rato. ¡Avisale a Caja!`);
  }
}

// El bot avisa a todos (admin y vendedores) sobre productos que cambiaron
// de precio en los últimos 3 días, una sola vez por cambio.
async function mostrarBotCambiosPrecio() {
  const hace3d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: cambiados } = await sb.from('productos').select('id, descripcion, precio_venta, precio_anterior, precio_actualizado_at')
    .not('precio_actualizado_at', 'is', null).gte('precio_actualizado_at', hace3d);
  if (!cambiados || cambiados.length === 0) return;

  const vistas = notifsVistas();
  const nuevos = cambiados.filter(p => Number(p.precio_venta) !== Number(p.precio_anterior) && !vistas.includes(`precio-${p.id}-${p.precio_venta}`));
  if (nuevos.length === 0) return;

  nuevos.forEach(p => marcarNotifVista(`precio-${p.id}-${p.precio_venta}`));

  const lineas = nuevos.slice(0, 5).map(p => {
    const subio = Number(p.precio_venta) > Number(p.precio_anterior);
    return `${subio ? '▲' : '▼'} ${p.descripcion}: ${money(p.precio_anterior)} → ${money(p.precio_venta)}`;
  }).join('<br>');
  const extra = nuevos.length > 5 ? `<br>y ${nuevos.length - 5} más...` : '';

  mostrarBotBurbuja('🤖 BAM te avisa:', `Cambiaron precios:<br>${lineas}${extra}`);
}

// Restaurar sesión si ya había una activa (recarga de página)
(async function checkSesionExistente() {
  const { data } = await sb.auth.getSession();
  if (data?.session) {
    const { data: perfil } = await sb.from('profiles').select('*').eq('id', data.session.user.id).single();
    if (perfil && perfil.activo) {
      profile = perfil;
      await iniciarApp();
    } else {
      await sb.auth.signOut();
    }
  }
})();

// ------------------------------------------------------------
// ALERTA: cotizaciones/ventas del vendedor sin autorizar o cobrar
// ------------------------------------------------------------
async function verificarPendientesVendedor() {
  const cont = $('#alerta-pendientes');
  if (!cont || profile.rol === 'admin') return;

  const ahora = Date.now();
  const hace5h = new Date(ahora - 5 * 60 * 60 * 1000).toISOString();

  const [{ data: cotizPend }, { data: ventasPend }] = await Promise.all([
    sb.from('cotizaciones').select('numero, created_at').eq('vendedor_id', profile.id).eq('estado', 'pendiente').lt('created_at', hace5h),
    sb.from('ventas').select('numero, created_at').eq('vendedor_id', profile.id).eq('cobrado', false).lt('created_at', hace5h)
  ]);

  const total = (cotizPend?.length || 0) + (ventasPend?.length || 0);
  if (total === 0) { cont.innerHTML = ''; return; }

  const masVieja = [...(cotizPend || []), ...(ventasPend || [])]
    .reduce((max, r) => new Date(r.created_at) < new Date(max) ? r.created_at : max, new Date().toISOString());
  const horasEspera = Math.floor((ahora - new Date(masVieja).getTime()) / (60 * 60 * 1000));
  const urgente = horasEspera >= 24;

  const partes = [];
  if (cotizPend?.length) partes.push(`${cotizPend.length} cotización${cotizPend.length > 1 ? 'es' : ''}`);
  if (ventasPend?.length) partes.push(`${ventasPend.length} venta${ventasPend.length > 1 ? 's' : ''}`);

  cont.innerHTML = `
    <div class="alerta-pendientes ${urgente ? 'urgente' : ''}">
      <span class="dot"></span>
      <span>${urgente ? '¡Urgente! ' : ''}Tenés ${partes.join(' y ')} esperando autorización o cobro hace más de ${urgente ? '24' : '5'} horas. Avisale al administrador para que las revise en Caja.</span>
      <button id="cerrar-alerta-pendientes" title="Cerrar">✕</button>
    </div>
  `;
  $('#cerrar-alerta-pendientes').addEventListener('click', () => { cont.innerHTML = ''; });
}

// ------------------------------------------------------------
// NOTIFICACIONES: cotización aprobada/rechazada o venta cobrada
// ------------------------------------------------------------
function notifsVistas() {
  try { return JSON.parse(localStorage.getItem('bm_notif_vistas') || '[]'); }
  catch (e) { return []; }
}
function marcarNotifVista(key) {
  const vistas = notifsVistas();
  if (!vistas.includes(key)) {
    vistas.push(key);
    localStorage.setItem('bm_notif_vistas', JSON.stringify(vistas.slice(-300))); // no crece infinito
  }
}

async function verificarNotificacionesVendedor() {
  const cont = $('#notificaciones-vendedor');
  if (!cont || profile.rol === 'admin') return;

  const [{ data: cotiz }, { data: ventas }] = await Promise.all([
    sb.from('cotizaciones').select('id, numero, cliente_nombre, estado').eq('vendedor_id', profile.id).in('estado', ['aprobada', 'rechazada']).order('created_at', { ascending: false }).limit(30),
    sb.from('ventas').select('id, numero, cliente_nombre, cobrado').eq('vendedor_id', profile.id).eq('cobrado', true).order('created_at', { ascending: false }).limit(30)
  ]);

  const vistas = notifsVistas();
  const nuevas = [];
  (cotiz || []).forEach(c => {
    const key = `cot-${c.id}-${c.estado}`;
    if (!vistas.includes(key)) nuevas.push({ key, tipo: c.estado === 'aprobada' ? 'ok' : 'rechazada', texto: `Cotización #${c.numero} (${c.cliente_nombre}) fue ${c.estado === 'aprobada' ? 'APROBADA — avisale a Caja para cobrar' : 'RECHAZADA'}.` });
  });
  (ventas || []).forEach(v => {
    const key = `venta-${v.id}-cobrada`;
    if (!vistas.includes(key)) nuevas.push({ key, tipo: 'ok', texto: `Venta #${v.numero} (${v.cliente_nombre}) ya fue COBRADA en Caja.` });
  });

  if (nuevas.length === 0) { return; }

  cont.innerHTML = `
    <div class="notif-lista">
      ${nuevas.map(n => `
        <div class="notif-item ${n.tipo === 'rechazada' ? 'rechazada' : ''}" data-key="${n.key}">
          <span>${n.tipo === 'rechazada' ? '⛔' : '✅'}</span>
          <span class="notif-texto">${n.texto}</span>
          <button class="notif-cerrar" data-key="${n.key}" title="Marcar como visto">✕</button>
        </div>
      `).join('')}
    </div>
  `;
  cont.querySelectorAll('.notif-cerrar').forEach(btn => {
    btn.addEventListener('click', () => {
      marcarNotifVista(btn.dataset.key);
      btn.closest('.notif-item').remove();
      if (!cont.querySelector('.notif-item')) cont.innerHTML = '';
    });
  });
}

// ------------------------------------------------------------
// NAVEGACIÓN
// ------------------------------------------------------------
$$('.nav-item').forEach(btn => btn.addEventListener('click', () => {
  switchView(btn.dataset.view);
  cerrarMenuMobile();
}));
$$('.nav-group-header').forEach(btn => btn.addEventListener('click', () => {
  btn.closest('.nav-group').classList.toggle('open');
}));
$('#menu-toggle')?.addEventListener('click', () => {
  $('#bottom-nav').classList.add('open');
  $('#nav-backdrop').classList.add('show');
});
$('#nav-backdrop')?.addEventListener('click', cerrarMenuMobile);
function cerrarMenuMobile() {
  $('#bottom-nav')?.classList.remove('open');
  $('#nav-backdrop')?.classList.remove('show');
}

async function switchView(view) {
  if ((view === 'usuarios' || view === 'inventario' || view === 'caja' || view === 'garantias') && profile.rol !== 'admin') view = 'cotizaciones';
  vistaActual = view;
  $$('.view').forEach(v => v.hidden = true);
  $(`#view-${view}`).hidden = false;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));

  if (view === 'cotizaciones') await renderCotizaciones();
  if (view === 'ventas') await renderVentas();
  if (view === 'catalogo') await renderCatalogoClientes();
  if (view === 'promos') await renderPromos();
  if (view === 'inventario') await renderInventario();
  if (view === 'caja') await renderCaja();
  if (view === 'usuarios') await renderUsuarios();
  if (view === 'garantias') await renderGarantias();
  if (view === 'chat') await renderChat();
  if (view === 'comprobantes') await renderComprobantes();
}

async function cargarProductos() {
  const { data } = await sb.from('productos').select('*').order('descripcion');
  productosCache = data || [];
}

async function cargarClientes() {
  const { data } = await sb.from('clientes').select('*').order('nombre');
  clientesCache = data || [];
}

async function cargarMediosPago() {
  const { data } = await sb.from('medios_pago').select('*').eq('activo', true).order('created_at');
  mediosPagoCache = data || [];
}

async function guardarClienteSiNoExiste(nombre, telefono, razon_social, nit) {
  const nombreNorm = nombre.trim().toLowerCase();
  const yaExiste = clientesCache.some(c => c.nombre.trim().toLowerCase() === nombreNorm);
  if (yaExiste || !nombre.trim()) return;
  const { data, error } = await sb.from('clientes').insert({
    nombre: nombre.trim(), telefono: telefono || '', razon_social: razon_social || '', nit: nit || ''
  }).select().single();
  if (!error && data) clientesCache.push(data);
}

function wireBusquedaCliente() {
  const inputCliente = $('#f-cliente');
  if (!inputCliente) return;
  inputCliente.addEventListener('change', () => {
    const match = clientesCache.find(c => c.nombre.trim().toLowerCase() === inputCliente.value.trim().toLowerCase());
    if (!match) return;
    const fTel = $('#f-telefono'), fFact = $('#f-facturar'), fNit = $('#f-nit');
    if (fTel && !fTel.value.trim()) fTel.value = match.telefono || '';
    if (fFact && !fFact.value.trim()) fFact.value = match.razon_social || '';
    if (fNit && !fNit.value.trim()) fNit.value = match.nit || '';
  });
}

// ============================================================
// MÓDULO: COTIZACIONES
// ============================================================
async function renderCotizaciones() {
  const el = $('#view-cotizaciones');
  el.innerHTML = `
    <div class="section-head">
      <div><h2>Cotizaciones</h2><p class="sub">Crear y consultar presupuestos</p></div>
      <button class="btn btn-primary" id="btn-nueva-cotizacion">+ Nueva cotización</button>
    </div>
    <div class="tabs" id="cotiz-tabs">
      ${['todas','pendiente','aprobada','convertida','rechazada'].map(f => `
        <button class="tab-btn ${filtroCotizaciones === f ? 'active' : ''}" data-f="${f}">${f === 'todas' ? 'Todas' : f[0].toUpperCase()+f.slice(1)+'s'}</button>
      `).join('')}
    </div>
    <div id="cotiz-table"></div>
  `;
  $('#btn-nueva-cotizacion').addEventListener('click', () => abrirFormCotizacion());
  $$('#cotiz-tabs .tab-btn').forEach(b => b.addEventListener('click', () => { filtroCotizaciones = b.dataset.f; renderCotizaciones(); }));

  let query = sb.from('cotizaciones').select('*').order('created_at', { ascending: false });
  if (filtroCotizaciones !== 'todas') query = query.eq('estado', filtroCotizaciones);
  const { data, error } = await query;

  const cont = $('#cotiz-table');
  if (error) { cont.innerHTML = `<div class="empty-state">Error cargando cotizaciones.</div>`; return; }
  if (!data || data.length === 0) { cont.innerHTML = `<div class="empty-state">No hay cotizaciones para mostrar.</div>`; return; }

  cont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>N°</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead>
    <tbody>
      ${data.map(c => `
        <tr>
          <td>#${c.numero}</td>
          <td>${escapeHtml(c.cliente_nombre)}</td>
          <td>${money(c.total)}</td>
          <td><span class="badge badge-${c.estado}">${c.estado}</span></td>
          <td>${fecha(c.created_at)}</td>
          <td><div class="row-actions">
            <button class="icon-btn" data-act="ver" data-id="${c.id}" title="Ver / editar">✎</button>
            <button class="icon-btn" data-act="previa" data-id="${c.id}" title="Vista previa / PDF / WhatsApp">👁</button>
            <button class="icon-btn" data-act="mediopago" data-id="${c.id}" title="Compartir medio de pago">💳</button>
            ${c.estado !== 'convertida' ? `<button class="icon-btn" data-act="convertir" data-id="${c.id}" title="Convertir a venta">🧾</button>` : ''}
            <button class="icon-btn" data-act="eliminar" data-id="${c.id}" title="Eliminar">🗑</button>
          </div></td>
        </tr>
      `).join('')}
    </tbody>
  </table></div>`;

  cont.querySelectorAll('[data-act]').forEach(btn => {
    const c = data.find(x => x.id === btn.dataset.id);
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (act === 'ver') abrirFormCotizacion(c);
      if (act === 'previa') abrirVistaPrevia(c, 'Cotización', 'COT');
      if (act === 'mediopago') abrirSelectorMedioPago(c, 'Cotización');
      if (act === 'convertir') convertirCotizacionAVenta(c);
      if (act === 'eliminar') eliminarRegistro('cotizaciones', c.id, renderCotizaciones);
    });
  });
}

function metodoPagoHtml(metodoActual) {
  return `
    <div class="field" style="margin-top:10px"><label>Método de pago</label>
      <select id="f-metodo">
        <option value="efectivo" ${metodoActual === 'efectivo' ? 'selected' : ''}>Efectivo</option>
        <option value="transferencia" ${metodoActual === 'transferencia' ? 'selected' : ''}>Transferencia</option>
        <option value="qr" ${metodoActual === 'qr' ? 'selected' : ''}>QR</option>
      </select>
    </div>
    <div class="field" id="medio-pago-container" style="margin-top:10px; ${metodoActual === 'efectivo' ? 'display:none' : ''}">
      <label>Cuenta / QR a mostrar en la nota</label>
      <select id="f-medio-pago"></select>
    </div>
  `;
}

function poblarSelectMedioPago(metodo, medioIdActual) {
  const sel = $('#f-medio-pago');
  if (!sel) return;
  const tipoBuscado = metodo === 'qr' ? 'qr' : 'banco';
  const filtrados = mediosPagoCache.filter(m => m.tipo === tipoBuscado && m.activo);

  // Si no venía un medio preseleccionado y hay uno solo disponible, lo tomamos por defecto
  if (!medioIdActual && filtrados.length === 1) medioIdActual = filtrados[0].id;

  sel.innerHTML = `<option value="">— Ninguno (no se va a mostrar cuenta/QR en la nota) —</option>` + filtrados.map(m => `
    <option value="${m.id}" ${medioIdActual === m.id ? 'selected' : ''}>${m.tipo === 'qr' ? '📷 QR' : '🏦 ' + escapeHtml(m.banco || 'Cuenta')}${m.titular ? ' — ' + escapeHtml(m.titular) : ''}</option>
  `).join('');

  actualizarAvisoMedioPago(metodo, filtrados.length);
  sel.removeEventListener('change', actualizarAvisoMedioPagoDesdeSelect);
  sel.addEventListener('change', actualizarAvisoMedioPagoDesdeSelect);
}

function actualizarAvisoMedioPagoDesdeSelect() {
  const metodo = $('#f-metodo')?.value;
  const tipoBuscado = metodo === 'qr' ? 'qr' : 'banco';
  const n = mediosPagoCache.filter(m => m.tipo === tipoBuscado && m.activo).length;
  actualizarAvisoMedioPago(metodo, n);
}

function actualizarAvisoMedioPago(metodo, cantidadDisponibles) {
  const cont = $('#medio-pago-container');
  if (!cont) return;
  let aviso = $('#aviso-medio-pago');
  if (!aviso) {
    aviso = document.createElement('p');
    aviso.id = 'aviso-medio-pago';
    aviso.style.cssText = 'font-size:12px;margin-top:6px';
    cont.appendChild(aviso);
  }
  const seleccionado = $('#f-medio-pago')?.value;
  if (metodo === 'efectivo') { aviso.textContent = ''; return; }
  if (cantidadDisponibles === 0) {
    aviso.style.color = 'var(--accent-2)';
    aviso.textContent = `No tenés ninguna ${metodo === 'qr' ? 'QR' : 'cuenta bancaria'} cargada. Andá a Caja → Medios de pago para agregar una.`;
  } else if (!seleccionado) {
    aviso.style.color = 'var(--accent-2)';
    aviso.textContent = '⚠️ Elegí una cuenta/QR arriba para que se muestre en la nota — si no, se manda sin esa información.';
  } else {
    aviso.style.color = 'var(--accent)';
    aviso.textContent = '✓ Esta cuenta/QR va a aparecer en la nota.';
  }
}

function wireMetodoPagoToggle(medioIdActual) {
  poblarSelectMedioPago($('#f-metodo').value, medioIdActual);
  $('#f-metodo').addEventListener('change', (e) => {
    const cont = $('#medio-pago-container');
    if (cont) cont.style.display = e.target.value === 'efectivo' ? 'none' : '';
    poblarSelectMedioPago(e.target.value, null);
  });
}

function condicionToggleHtml() {
  return `<div class="tabs" id="condicion-toggle" style="margin-top:10px">
    <button type="button" class="tab-btn ${condicionPagoActual === 'contado' ? 'active' : ''}" data-cond="contado">☑ Contado</button>
    <button type="button" class="tab-btn ${condicionPagoActual === 'credito' ? 'active' : ''}" data-cond="credito">☑ Crédito</button>
  </div>`;
}
function descuentosPctHtml() {
  return `<div class="grid-2" style="margin-top:10px">
    <div class="field"><label>Descuento general (%)</label><input type="number" id="f-desc-pct" value="${descuentoPctActual}" min="0" max="100" step="0.01" /></div>
    <div class="field"><label>Descuento adicional (%)</label><input type="number" id="f-desc-adic-pct" value="${descuentoAdicionalPctActual}" min="0" max="100" step="0.01" /></div>
  </div>`;
}
function cuotasHtml() {
  return `<div class="grid-2" id="cuotas-fields" style="margin-top:10px; ${condicionPagoActual === 'credito' ? '' : 'display:none'}">
    <div class="field"><label>2da cuota (%)</label><input type="number" id="f-cuota2-pct" value="${cuota2PctActual}" min="0" max="100" step="0.01" /></div>
    <div class="field"><label>2da cuota — días</label><input type="number" id="f-cuota2-dias" value="${cuota2DiasActual}" min="0" step="1" placeholder="Ej: 15" /></div>
  </div>`;
}
function wireCondicionToggle() {
  $$('#condicion-toggle .tab-btn').forEach(btn => btn.addEventListener('click', () => {
    condicionPagoActual = btn.dataset.cond;
    $$('#condicion-toggle .tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    const cuotasEl = $('#cuotas-fields');
    if (cuotasEl) cuotasEl.style.display = condicionPagoActual === 'credito' ? '' : 'none';
  }));
  $('#f-desc-pct')?.addEventListener('input', recalcularTotal);
  $('#f-desc-adic-pct')?.addEventListener('input', recalcularTotal);
}

async function abrirFormCotizacion(existing) {
  await cargarMediosPago();
  cotizacionEditando = existing || null;
  itemsForm = existing ? JSON.parse(JSON.stringify(existing.items)) : [];
  condicionPagoActual = existing?.condicion_pago || 'contado';
  descuentoPctActual = existing?.descuento_pct || 0;
  descuentoAdicionalPctActual = existing?.descuento_adicional_pct || 0;
  cuota2PctActual = existing?.cuota2_pct || 0;
  cuota2DiasActual = existing?.cuota2_dias || '';
  openModal(`
    <div class="sheet-head"><h3>${existing ? 'Editar cotización #' + existing.numero : 'Nueva cotización'}</h3><button class="sheet-close" id="sheet-close">✕</button></div>
    <div class="field"><label>Nombre del cliente *</label><input id="f-cliente" list="clientes-datalist" value="${existing ? escapeHtml(existing.cliente_nombre) : ''}" required /></div>
    <datalist id="clientes-datalist">${clientesCache.map(c => `<option value="${escapeHtml(c.nombre)}"></option>`).join('')}</datalist>
    <div class="field" style="margin-top:10px"><label>Teléfono (para WhatsApp)</label><input id="f-telefono" value="${existing ? escapeHtml(existing.cliente_telefono || '') : ''}" placeholder="+591 7xx xxxxx" /></div>
    <div class="grid-2" style="margin-top:10px">
      <div class="field"><label>Facturar a (razón social)</label><input id="f-facturar" value="${existing ? escapeHtml(existing.facturar_a || '') : ''}" placeholder="Opcional" /></div>
      <div class="field"><label>NIT</label><input id="f-nit" value="${existing ? escapeHtml(existing.cliente_nit || '') : ''}" placeholder="Opcional" /></div>
    </div>
    <div class="card-title" style="margin-top:18px">Artículos</div>
    <div id="items-container"></div>
    <button class="btn btn-secondary btn-sm" id="btn-add-item" style="margin-top:6px">+ Agregar artículo</button>
    <div class="field" style="margin-top:14px"><label>Descuento (Bs)</label><input type="number" id="f-descuento" value="${existing ? existing.descuento : 0}" min="0" step="0.01" /></div>
    <div id="descuentos-pct-container">${descuentosPctHtml()}</div>
    <div class="field" style="margin-top:12px"><label>Condición de pago</label>${condicionToggleHtml()}</div>
    ${cuotasHtml()}
    ${metodoPagoHtml(existing?.metodo_pago || 'efectivo')}
    <div class="items-total"><span>Total</span><strong id="items-total-val">${money(0)}</strong></div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar-cotiz">Cancelar</button>
      <button class="btn btn-primary" id="btn-guardar-cotiz">💾 Guardar cotización</button>
    </div>
  `);
  $('#sheet-close').addEventListener('click', closeModal);
  $('#btn-cancelar-cotiz').addEventListener('click', closeModal);
  $('#btn-add-item').addEventListener('click', () => { itemsForm.push({ id: uid('it'), producto_id: '', descripcion: '', cantidad: 1, precio_unitario: 0 }); renderItemRows(); });
  $('#f-descuento').addEventListener('input', recalcularTotal);
  $('#btn-guardar-cotiz').addEventListener('click', guardarCotizacion);
  wireCondicionToggle();
  wireBusquedaCliente();
  wireMetodoPagoToggle(existing?.medio_pago_id || null);
  if (itemsForm.length === 0) itemsForm.push({ id: uid('it'), producto_id: '', descripcion: '', cantidad: 1, precio_unitario: 0 });
  renderItemRows();
}

function productoLabel(p) {
  return p.codigo_fabrica ? `${p.descripcion} — ${p.codigo_fabrica}` : p.descripcion;
}

// Devuelve { subio: bool, texto: 'Subió de precio' | 'Bajó de precio' } si el producto
// tuvo un cambio de precio en los últimos 7 días, o null si no hay cambio reciente.
function alertaCambioPrecio(p) {
  if (!p.precio_actualizado_at || p.precio_anterior == null) return null;
  const dias = (Date.now() - new Date(p.precio_actualizado_at).getTime()) / (1000 * 60 * 60 * 24);
  if (dias > 7) return null;
  const nuevo = Number(p.precio_venta), anterior = Number(p.precio_anterior);
  if (nuevo === anterior) return null;
  return nuevo > anterior
    ? { subio: true, texto: '▲ Subió de precio' }
    : { subio: false, texto: '▼ Bajó de precio' };
}

function badgeCambioPrecioHtml(p) {
  const alerta = alertaCambioPrecio(p);
  if (!alerta) return '';
  return `<div class="precio-alerta ${alerta.subio ? 'precio-alerta-sube' : 'precio-alerta-baja'}">${alerta.texto}</div>`;
}

function renderItemRows() {
  const cont = $('#items-container');
  if (!cont) return;

  cont.innerHTML = itemsForm.map(it => {
    const productoActual = productosCache.find(p => p.id === it.producto_id);
    return `
    <div class="item-row" data-row="${it.id}">
      <div class="field" style="position:relative"><label>Producto</label>
        <input class="it-producto-search" placeholder="Buscar por nombre o código…" value="${productoActual ? escapeHtml(productoLabel(productoActual)) : escapeHtml(it._busqueda || '')}" autocomplete="off" />
        <div class="it-sugerencias" hidden></div>
        ${!it.producto_id ? `<input class="it-desc" placeholder="Descripción manual" value="${escapeHtml(it.descripcion || '')}" style="margin-top:6px" />` : ''}
      </div>
      <div class="field"><label>Cant.</label><input type="number" class="it-cant" value="${it.cantidad}" min="1" /></div>
      <div class="field"><label>Precio (Bs)</label><input type="number" class="it-precio" value="${it.precio_unitario}" min="0" step="0.01" /></div>
      <button class="icon-btn it-del" title="Quitar">🗑</button>
    </div>
  `;
  }).join('');

  itemsForm.forEach(it => {
    const row = cont.querySelector(`[data-row="${it.id}"]`);
    const inputBusqueda = row.querySelector('.it-producto-search');
    const sugerenciasEl = row.querySelector('.it-sugerencias');

    function mostrarSugerencias(texto) {
      const q = texto.trim().toLowerCase();
      if (q.length < 2) { sugerenciasEl.hidden = true; sugerenciasEl.innerHTML = ''; return; }
      const resultados = productosCache.filter(p =>
        p.descripcion.toLowerCase().includes(q) ||
        (p.codigo_fabrica || '').toLowerCase().includes(q) ||
        (p.codigo_interno || '').toLowerCase().includes(q)
      ).slice(0, 30);
      if (resultados.length === 0) { sugerenciasEl.hidden = true; sugerenciasEl.innerHTML = ''; return; }
      sugerenciasEl.innerHTML = resultados.map(p => `
        <button type="button" class="it-sugerencia" data-id="${p.id}">
          <span class="it-sugerencia-desc">
            ${escapeHtml(p.descripcion)}
            ${badgeCambioPrecioHtml(p)}
          </span>
          <span class="it-sugerencia-precio">${money(p.precio_venta)}</span>
        </button>
      `).join('');
      sugerenciasEl.hidden = false;
      sugerenciasEl.querySelectorAll('.it-sugerencia').forEach(btn => {
        btn.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          const p = productosCache.find(x => x.id === btn.dataset.id);
          it.producto_id = p.id;
          it.descripcion = p.descripcion;
          it.precio_unitario = Number(p.precio_venta);
          it._busqueda = '';
          renderItemRows();
        });
      });
    }

    inputBusqueda.addEventListener('input', (e) => {
      const val = e.target.value;
      it._busqueda = val;
      if (it.producto_id) { it.producto_id = ''; it.descripcion = ''; }
      mostrarSugerencias(val);
    });
    inputBusqueda.addEventListener('focus', (e) => { if (!it.producto_id) mostrarSugerencias(e.target.value); });
    inputBusqueda.addEventListener('blur', () => { setTimeout(() => { sugerenciasEl.hidden = true; }, 150); });

    const descInput = row.querySelector('.it-desc');
    if (descInput) descInput.addEventListener('input', (e) => { it.descripcion = e.target.value; });
    row.querySelector('.it-cant').addEventListener('input', (e) => { it.cantidad = Number(e.target.value) || 1; recalcularTotal(); });
    row.querySelector('.it-precio').addEventListener('input', (e) => { it.precio_unitario = Number(e.target.value) || 0; recalcularTotal(); });
    row.querySelector('.it-del').addEventListener('click', () => { itemsForm = itemsForm.filter(x => x.id !== it.id); renderItemRows(); recalcularTotal(); });
  });
  actualizarVisibilidadDescuentosPct();
  recalcularTotal();
}

function tieneItemHerramienta() {
  return itemsForm.some(it => {
    const p = productosCache.find(x => x.id === it.producto_id);
    return p && p.categoria === 'Herramientas';
  });
}

function actualizarVisibilidadDescuentosPct() {
  const cont = $('#descuentos-pct-container');
  if (!cont) return;
  const hay = tieneItemHerramienta();
  cont.style.display = hay ? '' : 'none';
  if (!hay) {
    const fp = $('#f-desc-pct'), fa = $('#f-desc-adic-pct');
    if (fp) fp.value = 0;
    if (fa) fa.value = 0;
  }
}

function calcularSubtotal() {
  return itemsForm.reduce((sum, it) => sum + (Number(it.cantidad) * Number(it.precio_unitario)), 0);
}
function recalcularTotal() {
  const sub = calcularSubtotal();
  const descBs = Number($('#f-descuento')?.value || 0);
  const descPct = Number($('#f-desc-pct')?.value || 0) / 100;
  const descAdicPct = Number($('#f-desc-adic-pct')?.value || 0) / 100;
  let total = Math.max(0, sub - descBs);
  total = Math.max(0, total * (1 - descPct) * (1 - descAdicPct));
  const elTotal = $('#items-total-val');
  if (elTotal) elTotal.textContent = money(total);
}

async function guardarCotizacion() {
  const cliente_nombre = $('#f-cliente').value.trim();
  if (!cliente_nombre) { toast('Ingresá el nombre del cliente', 'error'); return; }
  if (itemsForm.length === 0 || itemsForm.every(it => !it.descripcion && !it.producto_id)) { toast('Agregá al menos un artículo', 'error'); return; }

  const items = itemsForm.map(it => ({
    producto_id: it.producto_id || null,
    descripcion: it.descripcion || (productosCache.find(p => p.id === it.producto_id)?.descripcion) || 'Artículo',
    cantidad: Number(it.cantidad),
    precio_unitario: Number(it.precio_unitario),
    subtotal: Number(it.cantidad) * Number(it.precio_unitario)
  }));
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const descuento = Number($('#f-descuento').value || 0);
  const descuento_pct = Number($('#f-desc-pct')?.value || 0);
  const descuento_adicional_pct = Number($('#f-desc-adic-pct')?.value || 0);
  let total = Math.max(0, subtotal - descuento);
  total = Math.max(0, total * (1 - descuento_pct / 100) * (1 - descuento_adicional_pct / 100));
  const telefono = $('#f-telefono').value.trim();
  const facturar_a = $('#f-facturar').value.trim();
  const cliente_nit = $('#f-nit').value.trim();
  const cuota2_pct = condicionPagoActual === 'credito' ? Number($('#f-cuota2-pct')?.value || 0) : 0;
  const cuota2_dias = condicionPagoActual === 'credito' ? (Number($('#f-cuota2-dias')?.value) || 0) : 0;
  const metodo_pago = $('#f-metodo')?.value || 'efectivo';
  const medio_pago_id = $('#f-medio-pago')?.value || null;

  const payload = { cliente_nombre, cliente_telefono: telefono, facturar_a, cliente_nit, condicion_pago: condicionPagoActual, descuento_pct, descuento_adicional_pct, cuota2_pct, cuota2_dias, metodo_pago, medio_pago_id, items, subtotal, descuento, total };

  let resp;
  if (cotizacionEditando) {
    resp = await sb.from('cotizaciones').update(payload).eq('id', cotizacionEditando.id).select().single();
  } else {
    resp = await sb.from('cotizaciones').insert({ ...payload, vendedor_id: profile.id, estado: 'pendiente' }).select().single();
  }
  if (resp.error) { toast('Error al guardar: ' + resp.error.message, 'error'); return; }
  await guardarClienteSiNoExiste(cliente_nombre, telefono, facturar_a, cliente_nit);
  toast('Cotización guardada correctamente');
  closeModal();
  volverTrasGuardar(renderCotizaciones);
  abrirVistaPrevia(resp.data, 'Cotización', 'COT');
}

async function convertirCotizacionAVenta(cotizacion) {
  ventaOrigenCotizacion = cotizacion;
  await abrirFormVenta(null, cotizacion);
}

// ============================================================
// MÓDULO: VENTAS
// ============================================================
async function renderVentas() {
  const el = $('#view-ventas');
  el.innerHTML = `
    <div class="section-head">
      <div><h2>Ventas</h2><p class="sub">Registro de ventas realizadas</p></div>
      <button class="btn btn-primary" id="btn-nueva-venta">+ Nueva venta</button>
    </div>
    <div id="ventas-table"></div>
  `;
  $('#btn-nueva-venta').addEventListener('click', () => abrirFormVenta());

  const { data, error } = await sb.from('ventas').select('*').order('created_at', { ascending: false });
  const cont = $('#ventas-table');
  if (error) { cont.innerHTML = `<div class="empty-state">Error cargando ventas.</div>`; return; }
  if (!data || data.length === 0) { cont.innerHTML = `<div class="empty-state">Todavía no hay ventas registradas.</div>`; return; }

  const totalMes = data.filter(v => sameMonth(v.created_at)).reduce((s, v) => s + Number(v.total), 0);
  el.querySelector('.section-head').insertAdjacentHTML('afterend', `
    <div class="stats-row">
      <div class="stat-chip accent"><div class="label">Ventas este mes</div><div class="value">${money(totalMes)}</div></div>
      <div class="stat-chip"><div class="label">Total de ventas</div><div class="value">${data.length}</div></div>
    </div>
  `);

  cont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>N°</th><th>Cliente</th><th>Total</th><th>Pago</th><th>Cobro</th><th>Fecha</th><th>Acciones</th></tr></thead>
    <tbody>
      ${data.map(v => `
        <tr>
          <td>#${v.numero}</td>
          <td>${escapeHtml(v.cliente_nombre)}</td>
          <td>${money(v.total)}</td>
          <td>${metodoLabel(v.metodo_pago)}</td>
          <td><span class="badge ${v.cobrado ? 'badge-ok' : 'badge-pendiente'}">${v.cobrado ? 'Cobrada' : 'Pendiente'}</span></td>
          <td>${fecha(v.created_at)}</td>
          <td><div class="row-actions">
            <button class="icon-btn" data-act="previa" data-id="${v.id}" title="Vista previa / PDF / WhatsApp">👁</button>
            <button class="icon-btn" data-act="mediopago" data-id="${v.id}" title="Compartir medio de pago">💳</button>
            ${profile.rol === 'admin' && !v.cobrado ? `<button class="icon-btn" data-act="editar" data-id="${v.id}" title="Editar">✎</button>` : ''}
            ${profile.rol === 'admin' ? `<button class="icon-btn" data-act="eliminar" data-id="${v.id}" title="Eliminar">🗑</button>` : ''}
          </div></td>
        </tr>
      `).join('')}
    </tbody>
  </table></div>`;

  cont.querySelectorAll('[data-act]').forEach(btn => {
    const v = data.find(x => x.id === btn.dataset.id);
    btn.addEventListener('click', () => {
      if (btn.dataset.act === 'previa') abrirVistaPrevia(v, 'Venta', 'VTA');
      if (btn.dataset.act === 'mediopago') abrirSelectorMedioPago(v, 'Venta');
      if (btn.dataset.act === 'editar') abrirFormVenta(v);
      if (btn.dataset.act === 'eliminar') eliminarRegistro('ventas', v.id, renderVentas);
    });
  });
}

async function abrirFormVenta(existing, desdeCotizacion) {
  await cargarMediosPago();
  ventaEditando = existing || null;
  itemsForm = desdeCotizacion ? JSON.parse(JSON.stringify(desdeCotizacion.items)) : (existing ? JSON.parse(JSON.stringify(existing.items)) : []);
  const clienteInicial = desdeCotizacion?.cliente_nombre || existing?.cliente_nombre || '';
  const telInicial = desdeCotizacion?.cliente_telefono || existing?.cliente_telefono || '';
  const descInicial = desdeCotizacion?.descuento || existing?.descuento || 0;
  const facturarInicial = desdeCotizacion?.facturar_a || existing?.facturar_a || '';
  const nitInicial = desdeCotizacion?.cliente_nit || existing?.cliente_nit || '';
  condicionPagoActual = desdeCotizacion?.condicion_pago || existing?.condicion_pago || 'contado';
  descuentoPctActual = desdeCotizacion?.descuento_pct || existing?.descuento_pct || 0;
  descuentoAdicionalPctActual = desdeCotizacion?.descuento_adicional_pct || existing?.descuento_adicional_pct || 0;
  cuota2PctActual = desdeCotizacion?.cuota2_pct || existing?.cuota2_pct || 0;
  cuota2DiasActual = desdeCotizacion?.cuota2_dias || existing?.cuota2_dias || '';
  const metodoInicial = desdeCotizacion?.metodo_pago || existing?.metodo_pago || 'efectivo';
  const medioPagoInicial = desdeCotizacion?.medio_pago_id || existing?.medio_pago_id || null;

  openModal(`
    <div class="sheet-head"><h3>${existing ? 'Editar venta #' + existing.numero : (desdeCotizacion ? 'Convertir cotización #' + desdeCotizacion.numero + ' a venta' : 'Nueva venta')}</h3><button class="sheet-close" id="sheet-close">✕</button></div>
    <div class="field"><label>Nombre del cliente *</label><input id="f-cliente" list="clientes-datalist" value="${escapeHtml(clienteInicial)}" required /></div>
    <datalist id="clientes-datalist">${clientesCache.map(c => `<option value="${escapeHtml(c.nombre)}"></option>`).join('')}</datalist>
    <div class="field" style="margin-top:10px"><label>Teléfono</label><input id="f-telefono" value="${escapeHtml(telInicial)}" /></div>
    <div class="grid-2" style="margin-top:10px">
      <div class="field"><label>Facturar a (razón social)</label><input id="f-facturar" value="${escapeHtml(facturarInicial)}" placeholder="Opcional" /></div>
      <div class="field"><label>NIT</label><input id="f-nit" value="${escapeHtml(nitInicial)}" placeholder="Opcional" /></div>
    </div>
    <div class="field" style="margin-top:10px"><label>Método de pago</label>
      <select id="f-metodo">
        <option value="efectivo" ${metodoInicial === 'efectivo' ? 'selected' : ''}>Efectivo</option>
        <option value="transferencia" ${metodoInicial === 'transferencia' ? 'selected' : ''}>Transferencia</option>
        <option value="qr" ${metodoInicial === 'qr' ? 'selected' : ''}>QR</option>
      </select>
    </div>
    <div class="field" id="medio-pago-container" style="margin-top:10px; ${metodoInicial === 'efectivo' ? 'display:none' : ''}">
      <label>Cuenta / QR a mostrar en la nota</label>
      <select id="f-medio-pago"></select>
    </div>
    <div class="card-title" style="margin-top:18px">Artículos</div>
    <div id="items-container"></div>
    <button class="btn btn-secondary btn-sm" id="btn-add-item" style="margin-top:6px">+ Agregar artículo</button>
    <div class="field" style="margin-top:14px"><label>Descuento (Bs)</label><input type="number" id="f-descuento" value="${descInicial}" min="0" step="0.01" /></div>
    <div id="descuentos-pct-container">${descuentosPctHtml()}</div>
    <div class="field" style="margin-top:12px"><label>Condición de pago</label>${condicionToggleHtml()}</div>
    ${cuotasHtml()}
    <div class="items-total"><span>Total</span><strong id="items-total-val">${money(0)}</strong></div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar-venta">Cancelar</button>
      <button class="btn btn-primary" id="btn-guardar-venta">💾 ${existing ? 'Guardar cambios' : 'Registrar venta'}</button>
    </div>
  `);
  $('#sheet-close').addEventListener('click', closeModal);
  $('#btn-cancelar-venta').addEventListener('click', closeModal);
  $('#btn-add-item').addEventListener('click', () => { itemsForm.push({ id: uid('it'), producto_id: '', descripcion: '', cantidad: 1, precio_unitario: 0 }); renderItemRows(); });
  $('#f-descuento').addEventListener('input', recalcularTotal);
  $('#btn-guardar-venta').addEventListener('click', () => guardarVenta(desdeCotizacion));
  wireCondicionToggle();
  wireBusquedaCliente();
  wireMetodoPagoToggle(medioPagoInicial);
  if (itemsForm.length === 0) itemsForm.push({ id: uid('it'), producto_id: '', descripcion: '', cantidad: 1, precio_unitario: 0 });
  renderItemRows();
}

async function guardarVenta(desdeCotizacion) {
  const cliente_nombre = $('#f-cliente').value.trim();
  if (!cliente_nombre) { toast('Ingresá el nombre del cliente', 'error'); return; }
  if (itemsForm.length === 0) { toast('Agregá al menos un artículo', 'error'); return; }

  const items = itemsForm.map(it => ({
    producto_id: it.producto_id || null,
    descripcion: it.descripcion || (productosCache.find(p => p.id === it.producto_id)?.descripcion) || 'Artículo',
    cantidad: Number(it.cantidad),
    precio_unitario: Number(it.precio_unitario),
    subtotal: Number(it.cantidad) * Number(it.precio_unitario)
  }));
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const descuento = Number($('#f-descuento').value || 0);
  const descuento_pct = Number($('#f-desc-pct')?.value || 0);
  const descuento_adicional_pct = Number($('#f-desc-adic-pct')?.value || 0);
  let total = Math.max(0, subtotal - descuento);
  total = Math.max(0, total * (1 - descuento_pct / 100) * (1 - descuento_adicional_pct / 100));
  const metodo_pago = $('#f-metodo').value;
  const medio_pago_id = $('#f-medio-pago')?.value || null;
  const telefono = $('#f-telefono').value.trim();
  const facturar_a = $('#f-facturar').value.trim();
  const cliente_nit = $('#f-nit').value.trim();
  const cuota2_pct = condicionPagoActual === 'credito' ? Number($('#f-cuota2-pct')?.value || 0) : 0;
  const cuota2_dias = condicionPagoActual === 'credito' ? (Number($('#f-cuota2-dias')?.value) || 0) : 0;
  const payload = { cliente_nombre, cliente_telefono: telefono, facturar_a, cliente_nit, condicion_pago: condicionPagoActual, descuento_pct, descuento_adicional_pct, cuota2_pct, cuota2_dias, items, subtotal, descuento, total, metodo_pago, medio_pago_id };

  if (ventaEditando) {
    const { data: ventaActualizada, error } = await sb.from('ventas').update(payload).eq('id', ventaEditando.id).select().single();
    if (error) { toast('Error al guardar: ' + error.message, 'error'); return; }
    toast('Venta actualizada correctamente');
    closeModal();
    volverTrasGuardar(() => switchView('ventas'));
    abrirVistaPrevia(ventaActualizada, 'Venta', 'VTA');
    return;
  }

  const { data: venta, error } = await sb.from('ventas').insert({
    ...payload, vendedor_id: profile.id, cotizacion_id: desdeCotizacion ? desdeCotizacion.id : null
  }).select().single();

  if (error) { toast('Error al guardar: ' + error.message, 'error'); return; }

  // El stock se descuenta recién cuando la venta se cobra en Caja → Autorizar
  if (desdeCotizacion) {
    await sb.from('cotizaciones').update({ estado: 'convertida' }).eq('id', desdeCotizacion.id);
  }

  await guardarClienteSiNoExiste(cliente_nombre, telefono, facturar_a, cliente_nit);
  toast('Venta registrada correctamente');
  closeModal();
  switchView('ventas');
  abrirVistaPrevia(venta, 'Venta', 'VTA');
}

function sameMonth(dateStr) {
  const d = new Date(dateStr); const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

// ============================================================
// MÓDULO: INVENTARIO
// ============================================================
let tabInventario = 'catalogo';
let filtroCategoriaInventario = 'todas';
let busquedaInventario = '';
let catalogoBusqueda = '';
let catalogoCategoria = 'todas';

async function renderInventario() {
  await cargarProductos();
  const bajos = productosCache.filter(p => p.stock <= p.stock_minimo);
  const el = $('#view-inventario');
  el.innerHTML = `
    <div class="section-head">
      <div><h2>Inventario</h2><p class="sub">Catálogo, stock y movimientos</p></div>
      ${profile.rol === 'admin' ? `<button class="btn btn-primary" id="btn-nuevo-producto">+ Agregar producto</button>` : ''}
    </div>
    ${bajos.length > 0 ? `<div class="low-stock-banner"><span class="dot"></span>${bajos.length} producto${bajos.length > 1 ? 's' : ''} con stock bajo — revisá el catálogo</div>` : ''}
    <div class="tabs">
      <button class="tab-btn ${tabInventario === 'catalogo' ? 'active' : ''}" id="tab-catalogo">Catálogo</button>
      <button class="tab-btn ${tabInventario === 'movimientos' ? 'active' : ''}" id="tab-movimientos">Movimientos</button>
    </div>
    <div id="inv-content"></div>
  `;
  if (profile.rol === 'admin') $('#btn-nuevo-producto').addEventListener('click', () => abrirFormProducto());
  $('#tab-catalogo').addEventListener('click', () => { tabInventario = 'catalogo'; renderInventario(); });
  $('#tab-movimientos').addEventListener('click', () => { tabInventario = 'movimientos'; renderInventario(); });

  if (tabInventario === 'catalogo') renderCatalogoProductos();
  else renderMovimientosInventario();
}

function filaProductoHtml(p) {
  return `
    <tr>
      <td>${escapeHtml(p.descripcion)}${p.codigo_fabrica ? `<br><span style="color:var(--text-faint);font-size:11px">${escapeHtml(p.codigo_fabrica)}${p.codigo_interno ? ' · ' + escapeHtml(p.codigo_interno) : ''}</span>` : ''}</td>
      <td>${escapeHtml(p.subcategoria || '—')}</td>
      <td>${money(p.costo)}</td>
      <td>${money(p.precio_venta)}${badgeCambioPrecioHtml(p)}</td>
      <td><span class="badge ${p.stock <= p.stock_minimo ? 'badge-bajo' : 'badge-ok'}">${p.stock} u.</span></td>
      <td><div class="row-actions">
        <button class="icon-btn" data-act="entrada" data-id="${p.id}" title="Registrar entrada">＋</button>
        <button class="icon-btn" data-act="salida" data-id="${p.id}" title="Registrar salida">－</button>
        ${profile.rol === 'admin' ? `<button class="icon-btn" data-act="editar" data-id="${p.id}" title="Editar">✎</button>
        <button class="icon-btn" data-act="eliminar" data-id="${p.id}" title="Eliminar">🗑</button>` : ''}
      </div></td>
    </tr>`;
}

function wireFilaAcciones(cont, items) {
  cont.querySelectorAll('[data-act]').forEach(btn => {
    const p = items.find(x => x.id === btn.dataset.id);
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (act === 'entrada') abrirFormMovimiento(p, 'entrada');
      if (act === 'salida') abrirFormMovimiento(p, 'salida');
      if (act === 'editar') abrirFormProducto(p);
      if (act === 'eliminar') eliminarRegistro('productos', p.id, renderInventario);
    });
  });
}

function renderCatalogoProductos() {
  const cont = $('#inv-content');
  if (productosCache.length === 0) { cont.innerHTML = `<div class="empty-state">Todavía no cargaste ningún producto.</div>`; return; }

  const buscadorHtml = `<div class="field" style="margin-bottom:14px">
    <input id="inv-buscar" placeholder="🔍 Buscar por nombre, código o subcategoría…" value="${escapeHtml(busquedaInventario)}" />
  </div>`;

  const q = busquedaInventario.trim().toLowerCase();

  if (q) {
    const items = productosCache.filter(p =>
      p.descripcion.toLowerCase().includes(q) ||
      (p.codigo_fabrica || '').toLowerCase().includes(q) ||
      (p.codigo_interno || '').toLowerCase().includes(q) ||
      (p.subcategoria || '').toLowerCase().includes(q)
    );
    cont.innerHTML = buscadorHtml + (items.length === 0
      ? `<div class="empty-state">Sin resultados para "${escapeHtml(busquedaInventario)}".</div>`
      : `<div class="table-wrap"><table>
          <thead><tr><th>Descripción</th><th>Subcat.</th><th>Precio Mayorista<br><span style="font-weight:400;text-transform:none">(tu proveedor)</span></th><th>Precio Venta<br><span style="font-weight:400;text-transform:none">(al cliente)</span></th><th>Stock</th><th>Acciones</th></tr></thead>
          <tbody>${items.map(filaProductoHtml).join('')}</tbody>
        </table></div>`);
    wireFilaAcciones(cont, items);
    $('#inv-buscar').addEventListener('input', (e) => { busquedaInventario = e.target.value; renderCatalogoProductos(); });
    $('#inv-buscar').focus();
    $('#inv-buscar').setSelectionRange(busquedaInventario.length, busquedaInventario.length);
    return;
  }

  // Agrupar productos por categoría, respetando el orden de CATEGORIAS_PRODUCTO
  const categoriasPresentes = CATEGORIAS_PRODUCTO.filter(cat => productosCache.some(p => p.categoria === cat));
  // por si hay productos con una categoría vieja que ya no está en la lista fija
  const otrasCategorias = [...new Set(productosCache.map(p => p.categoria).filter(c => !CATEGORIAS_PRODUCTO.includes(c)))];
  const ordenFinal = [...categoriasPresentes, ...otrasCategorias];

  cont.innerHTML = buscadorHtml + ordenFinal.map((cat, idx) => {
    const items = productosCache.filter(p => p.categoria === cat);
    return `
      <details class="cat-section" ${(idx === 0 && items.length <= 30) ? 'open' : ''}>
        <summary class="cat-header">${escapeHtml(cat)} <span class="cat-count">${items.length}</span></summary>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Descripción</th>
              <th>Subcat.</th>
              <th>Precio Mayorista<br><span style="font-weight:400;text-transform:none">(tu proveedor)</span></th>
              <th>Precio Venta<br><span style="font-weight:400;text-transform:none">(al cliente)</span></th>
              <th>Stock</th>
              <th>Acciones</th>
            </tr></thead>
            <tbody>${items.map(filaProductoHtml).join('')}</tbody>
          </table>
        </div>
      </details>
    `;
  }).join('');

  $('#inv-buscar').addEventListener('input', (e) => { busquedaInventario = e.target.value; renderCatalogoProductos(); });
  wireFilaAcciones(cont, productosCache);
}

async function renderMovimientosInventario() {
  const cont = $('#inv-content');
  const { data, error } = await sb.from('movimientos_inventario').select('*, productos(descripcion)').order('created_at', { ascending: false }).limit(200);
  if (error || !data || data.length === 0) { cont.innerHTML = `<div class="empty-state">No hay movimientos registrados.</div>`; return; }
  cont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Producto</th><th>Tipo</th><th>Cant.</th><th>Motivo</th><th>Fecha</th></tr></thead>
    <tbody>
      ${data.map(m => `
        <tr>
          <td>${escapeHtml(m.productos?.descripcion || '—')}</td>
          <td><span class="badge ${m.tipo === 'entrada' ? 'badge-ok' : 'badge-bajo'}">${m.tipo}</span></td>
          <td>${m.cantidad}</td>
          <td>${escapeHtml(m.motivo || '—')}</td>
          <td>${fechaHora(m.created_at)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table></div>`;
}

function abrirFormProducto(existing) {
  const catInicial = existing?.categoria || CATEGORIAS_PRODUCTO[0];
  openModal(`
    <div class="sheet-head"><h3>${existing ? 'Editar producto' : 'Agregar producto'}</h3><button class="sheet-close" id="sheet-close">✕</button></div>
    <div class="field"><label>Descripción *</label><input id="f-desc" value="${existing ? escapeHtml(existing.descripcion) : ''}" required /></div>
    <div class="grid-2" style="margin-top:10px">
      <div class="field"><label>Categoría</label>
        <select id="f-cat">
          ${CATEGORIAS_PRODUCTO.map(cat => `<option value="${cat}" ${catInicial === cat ? 'selected' : ''}>${cat}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Subcategoría</label><input id="f-subcat" placeholder="Ej: Gas, Eléctrico" value="${existing ? escapeHtml(existing.subcategoria || '') : ''}" /></div>
    </div>
    <div class="grid-2" id="campos-codigos" style="margin-top:10px; ${catInicial === 'Herramientas' ? '' : 'display:none'}">
      <div class="field"><label>Código de fábrica</label><input id="f-codfab" value="${existing ? escapeHtml(existing.codigo_fabrica || '') : ''}" placeholder="Ej: JDCC8395" /></div>
      <div class="field"><label>Código interno</label><input id="f-codint" value="${existing ? escapeHtml(existing.codigo_interno || '') : ''}" placeholder="Ej: H0001" /></div>
    </div>
    <div class="field" style="margin-top:10px"><label>Precio Mayorista<br><span style="font-weight:400;color:var(--text-faint)">lo que te cobra tu proveedor</span></label><input type="number" id="f-costo" value="${existing ? existing.costo : 0}" min="0" step="0.01" /></div>
    <div class="field" style="margin-top:10px"><label>Precio Venta<br><span style="font-weight:400;color:var(--text-faint)">lo que le cobrás al cliente</span></label><input type="number" id="f-precio" value="${existing ? existing.precio_venta : 0}" min="0" step="0.01" /></div>
    <div class="grid-2" style="margin-top:10px">
      <div class="field"><label>Stock inicial</label><input type="number" id="f-stock" value="${existing ? existing.stock : 0}" min="0" ${existing ? 'disabled' : ''} /></div>
      <div class="field"><label>Stock mínimo (alerta)</label><input type="number" id="f-stockmin" value="${existing ? existing.stock_minimo : 5}" min="0" /></div>
    </div>
    <div class="field" style="margin-top:10px"><label>Foto (para el catálogo de clientes)</label><input type="file" id="f-imagen-producto" accept="image/*" /></div>
    <div id="preview-imagen-producto">${existing?.imagen_base64 ? `<img src="${existing.imagen_base64}" style="width:100%;max-width:200px;border-radius:8px;margin-top:8px" />` : ''}</div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13.5px;color:var(--text-dim)">
      <input type="checkbox" id="f-visible-catalogo" ${(existing ? existing.visible_catalogo !== false : true) ? 'checked' : ''} style="width:16px;height:16px" />
      Mostrar este producto en el Catálogo para clientes
    </label>
    ${existing ? '<p style="color:var(--text-faint);font-size:12px;margin-top:8px">Para cambiar el stock usá los botones ＋ / － del catálogo.</p>' : ''}
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-primary" id="btn-guardar">💾 Guardar</button>
    </div>
  `);
  $('#sheet-close').addEventListener('click', closeModal);
  $('#btn-cancelar').addEventListener('click', closeModal);
  $('#f-cat').addEventListener('change', (e) => {
    $('#campos-codigos').style.display = e.target.value === 'Herramientas' ? '' : 'none';
  });

  let imagenNuevaBase64 = null;
  $('#f-imagen-producto').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const recortada = await abrirRecortadorFoto(archivo);
    e.target.value = ''; // el archivo ya se procesó; lo que vale de acá en más es imagenNuevaBase64
    if (!recortada) return; // canceló el recorte: se queda con la foto que ya tenía (si había)
    imagenNuevaBase64 = recortada;
    $('#preview-imagen-producto').innerHTML = `<img src="${recortada}" style="width:100%;max-width:200px;border-radius:8px;margin-top:8px" />`;
  });

  $('#btn-guardar').addEventListener('click', async () => {
    const esHerramienta = $('#f-cat').value === 'Herramientas';
    const imagen_base64 = imagenNuevaBase64 || existing?.imagen_base64 || null;
    const nuevoPrecioVenta = Number($('#f-precio').value || 0);
    const payload = {
      descripcion: $('#f-desc').value.trim(),
      categoria: $('#f-cat').value,
      subcategoria: $('#f-subcat').value.trim(),
      codigo_fabrica: esHerramienta ? $('#f-codfab').value.trim() : '',
      codigo_interno: esHerramienta ? $('#f-codint').value.trim() : '',
      precio_venta: nuevoPrecioVenta,
      costo: Number($('#f-costo').value || 0),
      stock_minimo: Number($('#f-stockmin').value || 0),
      imagen_base64,
      visible_catalogo: $('#f-visible-catalogo').checked
    };
    if (existing && nuevoPrecioVenta !== Number(existing.precio_venta)) {
      payload.precio_anterior = Number(existing.precio_venta);
      payload.precio_actualizado_at = new Date().toISOString();
    }
    if (!payload.descripcion) { toast('Ingresá una descripción', 'error'); return; }
    let resp;
    if (existing) resp = await sb.from('productos').update(payload).eq('id', existing.id);
    else resp = await sb.from('productos').insert({ ...payload, stock: Number($('#f-stock').value || 0) });
    if (resp.error) { toast('Error: ' + resp.error.message, 'error'); return; }
    toast('Producto guardado');
    closeModal();
    renderInventario();
  });
}

function abrirFormMovimiento(producto, tipo) {
  openModal(`
    <div class="sheet-head"><h3>${tipo === 'entrada' ? 'Registrar entrada' : 'Registrar salida'}</h3><button class="sheet-close" id="sheet-close">✕</button></div>
    <p style="color:var(--text-dim);font-size:13.5px;margin:-8px 0 14px">${escapeHtml(producto.descripcion)} — stock actual: <strong style="color:var(--text)">${producto.stock}</strong></p>
    <div class="field"><label>Cantidad *</label><input type="number" id="f-cant" min="1" value="1" required /></div>
    <div class="field" style="margin-top:10px"><label>Motivo</label><input id="f-motivo" placeholder="${tipo === 'entrada' ? 'Ej: compra a proveedor' : 'Ej: producto dañado'}" /></div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-primary" id="btn-guardar">💾 Registrar</button>
    </div>
  `);
  $('#sheet-close').addEventListener('click', closeModal);
  $('#btn-cancelar').addEventListener('click', closeModal);
  $('#btn-guardar').addEventListener('click', async () => {
    const cant = Number($('#f-cant').value || 0);
    if (cant <= 0) { toast('Ingresá una cantidad válida', 'error'); return; }
    const motivo = $('#f-motivo').value.trim() || (tipo === 'entrada' ? 'Entrada manual' : 'Salida manual');
    await ajustarStock(producto.id, tipo === 'entrada' ? cant : -cant, motivo);
    toast('Movimiento registrado');
    closeModal();
    await cargarProductos();
    renderInventario();
  });
}

async function ajustarStock(productoId, delta, motivo) {
  const producto = productosCache.find(p => p.id === productoId) || (await sb.from('productos').select('*').eq('id', productoId).single()).data;
  if (!producto) return;
  const nuevoStock = Math.max(0, Number(producto.stock) + delta);
  await sb.from('productos').update({ stock: nuevoStock }).eq('id', productoId);
  await sb.from('movimientos_inventario').insert({
    producto_id: productoId,
    tipo: delta >= 0 ? 'entrada' : 'salida',
    cantidad: Math.abs(delta),
    motivo,
    usuario_id: profile.id
  });
}

// ============================================================
// MÓDULO: CAJA
// ============================================================
async function mostrarBannerPendientesAdmin() {
  const cont = $('#admin-pendientes-banner');
  if (!cont) return;
  const { count: nCotiz } = await sb.from('cotizaciones').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente');
  const { count: nVentas } = await sb.from('ventas').select('*', { count: 'exact', head: true }).eq('cobrado', false);

  if (!nCotiz && !nVentas) { cont.innerHTML = ''; return; }

  const partes = [];
  if (nCotiz) partes.push(`${nCotiz} cotización${nCotiz > 1 ? 'es' : ''} sin autorizar`);
  if (nVentas) partes.push(`${nVentas} venta${nVentas > 1 ? 's' : ''} sin cobrar`);

  cont.innerHTML = `
    <div class="admin-pendientes-banner">
      <span>💰</span>
      <span>Tenés ${partes.join(' y ')}.</span>
      <button class="btn btn-primary btn-sm" id="btn-ir-autorizar">Ir a Autorizar →</button>
    </div>
  `;
  $('#btn-ir-autorizar').addEventListener('click', () => { cajaVistaAdmin = 'autorizar'; renderCaja(); });
}

async function renderCaja() {
  const el = $('#view-caja');
  const { data: abiertas } = await sb.from('caja_sesiones').select('*').eq('usuario_id', profile.id).eq('estado', 'abierta').limit(1);
  sesionCajaActual = abiertas && abiertas[0] ? abiertas[0] : null;

  el.innerHTML = `
    <div class="section-head">
      <div><h2>Caja</h2><p class="sub">Control de ingresos y egresos</p></div>
    </div>
    <div id="admin-pendientes-banner"></div>
    ${profile.rol === 'admin' ? `
      <div class="tabs">
        <button class="tab-btn ${cajaVistaAdmin === 'mia' ? 'active' : ''}" id="tab-mi-caja">Mi caja</button>
        <button class="tab-btn ${cajaVistaAdmin === 'autorizar' ? 'active' : ''}" id="tab-autorizar">Autorizar</button>
        <button class="tab-btn ${cajaVistaAdmin === 'todas' ? 'active' : ''}" id="tab-todas-cajas">Todas las cajas</button>
        <button class="tab-btn ${cajaVistaAdmin === 'libro' ? 'active' : ''}" id="tab-libro-diario">Libro diario</button>
        <button class="tab-btn ${cajaVistaAdmin === 'medios' ? 'active' : ''}" id="tab-medios-pago">Medios de pago</button>
        <button class="tab-btn ${cajaVistaAdmin === 'promos' ? 'active' : ''}" id="tab-promos">Promociones</button>
      </div>
    ` : ''}
    <div id="caja-content"></div>
  `;
  if (profile.rol === 'admin') {
    $('#tab-mi-caja').addEventListener('click', () => { cajaVistaAdmin = 'mia'; renderCaja(); });
    $('#tab-autorizar').addEventListener('click', () => { cajaVistaAdmin = 'autorizar'; renderCaja(); });
    $('#tab-todas-cajas').addEventListener('click', () => { cajaVistaAdmin = 'todas'; renderCaja(); });
    $('#tab-libro-diario').addEventListener('click', () => { cajaVistaAdmin = 'libro'; renderCaja(); });
    $('#tab-medios-pago').addEventListener('click', () => { cajaVistaAdmin = 'medios'; renderCaja(); });
    $('#tab-promos').addEventListener('click', () => { cajaVistaAdmin = 'promos'; renderCaja(); });
    mostrarBannerPendientesAdmin();
  }

  if (profile.rol === 'admin' && cajaVistaAdmin === 'todas') return renderTodasLasCajas();
  if (profile.rol === 'admin' && cajaVistaAdmin === 'autorizar') return renderAutorizaciones();
  if (profile.rol === 'admin' && cajaVistaAdmin === 'libro') return renderLibroDiario();
  if (profile.rol === 'admin' && cajaVistaAdmin === 'medios') return renderMediosPago();
  if (profile.rol === 'admin' && cajaVistaAdmin === 'promos') return renderPromociones();
  return renderMiCaja();
}

async function renderMiCaja() {
  const cont = $('#caja-content');
  if (!sesionCajaActual) {
    cont.innerHTML = `
      <div class="card">
        <div class="card-title">Abrir caja</div>
        <p style="color:var(--text-dim);font-size:13.5px;margin-top:-4px">Registrá el monto con el que iniciás el día para poder llevar el control de ingresos y egresos.</p>
        <div class="field" style="margin-top:12px"><label>Monto de apertura (Bs)</label><input type="number" id="f-apertura" min="0" step="0.01" value="0" /></div>
        <button class="btn btn-primary btn-block" id="btn-abrir-caja" style="margin-top:14px">Abrir caja</button>
      </div>
    `;
    $('#btn-abrir-caja').addEventListener('click', async () => {
      const monto = Number($('#f-apertura').value || 0);
      const { error } = await sb.from('caja_sesiones').insert({ usuario_id: profile.id, monto_apertura: monto });
      if (error) { toast('Error: ' + error.message, 'error'); return; }
      toast('Caja abierta');
      renderCaja();
    });
    return;
  }

  const { data: movs } = await sb.from('caja_movimientos').select('*').eq('sesion_id', sesionCajaActual.id).order('created_at', { ascending: false });
  const ingresos = (movs || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
  const egresos = (movs || []).filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0);
  const saldo = Number(sesionCajaActual.monto_apertura) + ingresos - egresos;

  cont.innerHTML = `
    <div class="caja-layout">
      <div class="caja-col-principal">
        <div class="stats-row">
          <div class="stat-chip"><div class="label">Apertura</div><div class="value">${money(sesionCajaActual.monto_apertura)}</div></div>
          <div class="stat-chip accent"><div class="label">Ingresos</div><div class="value">${money(ingresos)}</div></div>
          <div class="stat-chip danger"><div class="label">Egresos</div><div class="value">${money(egresos)}</div></div>
          <div class="stat-chip warn"><div class="label">Saldo actual</div><div class="value" style="color:var(--accent)">${money(saldo)}</div></div>
        </div>
        <div class="form-actions" style="margin-bottom:16px">
          <button class="btn btn-secondary" id="btn-ingreso">＋ Ingreso</button>
          <button class="btn btn-secondary" id="btn-egreso">－ Egreso</button>
          <button class="btn btn-primary" id="btn-cerrar-caja">Cerrar caja</button>
        </div>
        <div id="caja-movs"></div>
      </div>
      <aside class="caja-col-recibos">
        <div class="card-title" style="margin-bottom:10px">🧾 Recibos — reenviar rápido</div>
        <div class="field" style="margin-bottom:10px"><input id="recibos-buscar" placeholder="🔍 Buscar cliente o N°…" /></div>
        <div id="recibos-lista"></div>
      </aside>
    </div>
  `;
  $('#btn-ingreso').addEventListener('click', () => abrirFormMovimientoCaja('ingreso'));
  $('#btn-egreso').addEventListener('click', () => abrirFormMovimientoCaja('egreso'));
  $('#btn-cerrar-caja').addEventListener('click', () => abrirFormCierreCaja(saldo));

  const movCont = $('#caja-movs');
  if (!movs || movs.length === 0) { movCont.innerHTML = `<div class="empty-state">Sin movimientos todavía en esta caja.</div>`; }
  else {
    movCont.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Tipo</th><th>Concepto</th><th>Monto</th><th>Pago</th><th>Hora</th><th>Recibo</th></tr></thead>
      <tbody>
        ${movs.map(m => `
          <tr>
            <td><span class="badge ${m.tipo === 'ingreso' ? 'badge-ok' : 'badge-rechazada'}">${m.tipo}</span></td>
            <td>${escapeHtml(m.concepto)}</td>
            <td>${money(m.monto)}</td>
            <td>${metodoLabel(m.metodo_pago)}</td>
            <td>${fechaHora(m.created_at)}</td>
            <td>${m.comprobante_id ? `<button class="icon-btn" data-ver-recibo="${m.comprobante_id}" title="Ver recibo">🧾</button>` : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>`;

    movCont.querySelectorAll('[data-ver-recibo]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { data: comp } = await sb.from('comprobantes').select('*').eq('id', btn.dataset.verRecibo).single();
        if (comp) abrirVistaPreviaComprobante(comp);
      });
    });
  }

  await cargarComprobantes();
  renderPanelRecibos();
  $('#recibos-buscar').addEventListener('input', () => renderPanelRecibos());
}

function renderPanelRecibos() {
  const cont = $('#recibos-lista');
  if (!cont) return;
  const q = ($('#recibos-buscar')?.value || '').trim().toLowerCase();
  let items = comprobantesCache;
  if (q) items = items.filter(c => c.cliente_nombre.toLowerCase().includes(q) || String(c.numero).includes(q));
  items = items.slice(0, 25);

  if (items.length === 0) { cont.innerHTML = `<div class="empty-state">No hay recibos para mostrar.</div>`; return; }

  cont.innerHTML = items.map(c => `
    <div class="recibo-mini">
      <div class="recibo-mini-info">
        <strong>#${String(c.numero).padStart(5, '0')} — ${escapeHtml(c.cliente_nombre)}</strong>
        <span>${money(c.monto_total)} · ${fecha(c.created_at)}</span>
      </div>
      <div class="recibo-mini-acciones">
        <button class="icon-btn" data-act="previa" data-id="${c.id}" title="Vista previa">👁</button>
        <button class="icon-btn" data-act="pdf" data-id="${c.id}" title="Descargar PDF">⬇</button>
        <button class="icon-btn" data-act="wa" data-id="${c.id}" title="Reenviar por WhatsApp">📷</button>
      </div>
    </div>
  `).join('');

  cont.querySelectorAll('[data-act]').forEach(btn => {
    const c = comprobantesCache.find(x => x.id === btn.dataset.id);
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (act === 'previa') abrirVistaPreviaComprobante(c);
      if (act === 'pdf') generarPdfComprobante(c);
      if (act === 'wa') compartirImagenComprobanteWhatsapp(c);
    });
  });
}

function abrirFormMovimientoCaja(tipo) {
  openModal(`
    <div class="sheet-head"><h3>${tipo === 'ingreso' ? 'Registrar ingreso' : 'Registrar egreso'}</h3><button class="sheet-close" id="sheet-close">✕</button></div>
    <div class="field"><label>Concepto *</label><input id="f-concepto" placeholder="${tipo === 'ingreso' ? 'Ej: cobro venta #12' : 'Ej: pago de flete'}" required /></div>
    <div class="field" style="margin-top:10px"><label>Monto (Bs) *</label><input type="number" id="f-monto" min="0.01" step="0.01" required /></div>
    <div class="field" style="margin-top:10px"><label>Método de pago</label>
      <select id="f-metodo"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="qr">QR</option></select>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-primary" id="btn-guardar">💾 Registrar</button>
    </div>
  `);
  $('#sheet-close').addEventListener('click', closeModal);
  $('#btn-cancelar').addEventListener('click', closeModal);
  $('#btn-guardar').addEventListener('click', async () => {
    const concepto = $('#f-concepto').value.trim();
    const monto = Number($('#f-monto').value || 0);
    if (!concepto || monto <= 0) { toast('Completá concepto y monto', 'error'); return; }
    const { error } = await sb.from('caja_movimientos').insert({
      sesion_id: sesionCajaActual.id, tipo, concepto, monto, metodo_pago: $('#f-metodo').value, usuario_id: profile.id
    });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast('Movimiento registrado');
    closeModal();
    renderCaja();
  });
}

function abrirFormCierreCaja(saldoCalculado) {
  openModal(`
    <div class="sheet-head"><h3>Cerrar caja</h3><button class="sheet-close" id="sheet-close">✕</button></div>
    <p style="color:var(--text-dim);font-size:13.5px;margin-top:-6px">Saldo calculado según el sistema: <strong style="color:var(--accent)">${money(saldoCalculado)}</strong></p>
    <div class="field" style="margin-top:12px"><label>Monto real contado (Bs) *</label><input type="number" id="f-cierre" min="0" step="0.01" required /></div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-primary" id="btn-guardar">Cerrar caja</button>
    </div>
  `);
  $('#sheet-close').addEventListener('click', closeModal);
  $('#btn-cancelar').addEventListener('click', closeModal);
  $('#btn-guardar').addEventListener('click', async () => {
    const cierre = Number($('#f-cierre').value || 0);
    const diferencia = cierre - saldoCalculado;
    const { error } = await sb.from('caja_sesiones').update({
      monto_cierre: cierre, saldo_calculado: saldoCalculado, diferencia, estado: 'cerrada', fecha_cierre: new Date().toISOString()
    }).eq('id', sesionCajaActual.id);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast(diferencia === 0 ? 'Caja cerrada sin diferencias' : `Caja cerrada — diferencia: ${money(diferencia)}`);
    closeModal();
    renderCaja();
  });
}

async function renderTodasLasCajas() {
  const cont = $('#caja-content');
  const { data, error } = await sb.from('caja_sesiones').select('*, profiles(nombre, usuario)').order('fecha_apertura', { ascending: false }).limit(100);
  if (error || !data || data.length === 0) { cont.innerHTML = `<div class="empty-state">No hay sesiones de caja registradas.</div>`; return; }
  cont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Usuario</th><th>Apertura</th><th>Cierre</th><th>Estado</th><th>Diferencia</th><th>Fecha</th></tr></thead>
    <tbody>
      ${data.map(s => `
        <tr>
          <td>${escapeHtml(s.profiles?.nombre || s.profiles?.usuario || '—')}</td>
          <td>${money(s.monto_apertura)}</td>
          <td>${s.monto_cierre != null ? money(s.monto_cierre) : '—'}</td>
          <td><span class="badge ${s.estado === 'abierta' ? 'badge-pendiente' : 'badge-ok'}">${s.estado}</span></td>
          <td>${s.diferencia != null ? money(s.diferencia) : '—'}</td>
          <td>${fecha(s.fecha_apertura)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table></div>`;
}

// ------------------------------------------------------------
// LIBRO DIARIO: registro cronológico de ingresos y egresos
// ------------------------------------------------------------
function fechaISO(d) {
  return new Date(d).toISOString().slice(0, 10);
}
function fechaLarga(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-BO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

async function renderLibroDiario() {
  const cont = $('#caja-content');

  if (!libroDesde) {
    const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30);
    libroDesde = fechaISO(hace30);
    libroHasta = fechaISO(new Date());
  }

  cont.innerHTML = `
    <div class="grid-2" style="margin-bottom:16px">
      <div class="field"><label>Desde</label><input type="date" id="f-libro-desde" value="${libroDesde}" /></div>
      <div class="field"><label>Hasta</label><input type="date" id="f-libro-hasta" value="${libroHasta}" /></div>
    </div>
    <div id="libro-content"><div class="empty-state">Cargando…</div></div>
  `;
  $('#f-libro-desde').addEventListener('change', (e) => { libroDesde = e.target.value; renderLibroDiario(); });
  $('#f-libro-hasta').addEventListener('change', (e) => { libroHasta = e.target.value; renderLibroDiario(); });

  const desdeISO = `${libroDesde}T00:00:00`;
  const hastaISO = `${libroHasta}T23:59:59`;

  const { data, error } = await sb.from('caja_movimientos')
    .select('*, profiles(nombre, usuario)')
    .gte('created_at', desdeISO)
    .lte('created_at', hastaISO)
    .order('created_at', { ascending: false });

  const target = $('#libro-content');
  if (error) { target.innerHTML = `<div class="empty-state">Error al cargar el libro diario.</div>`; return; }
  if (!data || data.length === 0) { target.innerHTML = `<div class="empty-state">No hay movimientos registrados en ese rango de fechas.</div>`; return; }

  const totalIngresos = data.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
  const totalEgresos = data.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0);

  // Agrupar por día
  const porDia = {};
  data.forEach(m => {
    const dia = fechaISO(m.created_at);
    if (!porDia[dia]) porDia[dia] = [];
    porDia[dia].push(m);
  });
  const diasOrdenados = Object.keys(porDia).sort((a, b) => b.localeCompare(a));

  let html = `
    <div class="stats-row">
      <div class="stat-chip accent"><div class="label">Ingresos del período</div><div class="value">${money(totalIngresos)}</div></div>
      <div class="stat-chip danger"><div class="label">Egresos del período</div><div class="value">${money(totalEgresos)}</div></div>
      <div class="stat-chip warn"><div class="label">Saldo neto</div><div class="value" style="color:var(--accent)">${money(totalIngresos - totalEgresos)}</div></div>
    </div>
  `;

  diasOrdenados.forEach(dia => {
    const movs = porDia[dia];
    const ingDia = movs.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0);
    const egDia = movs.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0);
    html += `
      <details class="cat-section" open>
        <summary class="cat-header" style="text-transform:capitalize">${fechaLarga(dia)} <span class="cat-count">Neto: ${money(ingDia - egDia)}</span></summary>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Tipo</th><th>Concepto</th><th>Monto</th><th>Pago</th><th>Usuario</th><th>Hora</th></tr></thead>
            <tbody>
              ${movs.map(m => `
                <tr>
                  <td><span class="badge ${m.tipo === 'ingreso' ? 'badge-ok' : 'badge-rechazada'}">${m.tipo}</span></td>
                  <td>${escapeHtml(m.concepto)}</td>
                  <td>${money(m.monto)}</td>
                  <td>${metodoLabel(m.metodo_pago)}</td>
                  <td>${escapeHtml(m.profiles?.nombre || m.profiles?.usuario || '—')}</td>
                  <td>${new Date(m.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </details>
    `;
  });

  target.innerHTML = html;
}

// Recortador de fotos de producto: arrastrar para mover + zoom, siempre
// encuadrado en cuadrado (así se ven en el catálogo). Se usa antes de
// guardar, para que el vendedor vea el resultado en vez de confiar en
// que el recorte automático del centro salga bien.
// Devuelve un dataURL JPEG cuadrado, o null si se canceló.
// Es un overlay propio (no usa openModal/closeModal) para poder mostrarse
// arriba del formulario de producto sin perder lo que ya se completó ahí.
function abrirRecortadorFoto(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        const overlay = document.createElement('div');
        overlay.className = 'overlay show';
        overlay.style.zIndex = '60';
        overlay.innerHTML = `
          <div class="sheet">
            <div class="sheet-head"><h3>Encuadrá la foto</h3><button class="sheet-close" id="crop-cerrar">✕</button></div>
            <p style="color:var(--text-dim);font-size:13px;margin-bottom:12px">Arrastrá para mover y usá el control para acercar. Así se va a ver en el catálogo.</p>
            <div id="crop-viewport" style="position:relative;width:100%;max-width:320px;aspect-ratio:1/1;margin:0 auto;overflow:hidden;border-radius:12px;background:var(--surface-2);border:1px solid var(--border);touch-action:none;cursor:grab">
              <img id="crop-img" src="${reader.result}" draggable="false" style="position:absolute;top:0;left:0;transform-origin:0 0;user-select:none;pointer-events:none" />
            </div>
            <div class="field" style="margin-top:14px"><label>Zoom</label><input type="range" id="crop-zoom" min="100" max="300" value="100" style="width:100%" /></div>
            <div class="form-actions">
              <button class="btn btn-secondary" id="crop-cancelar">Cancelar</button>
              <button class="btn btn-primary" id="crop-confirmar">✓ Usar esta foto</button>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);

        const viewport = overlay.querySelector('#crop-viewport');
        const imgEl = overlay.querySelector('#crop-img');
        const zoomInput = overlay.querySelector('#crop-zoom');
        const VIEW = viewport.clientWidth;

        const scaleBase = VIEW / Math.min(img.width, img.height); // cubre el cuadro a zoom 1
        let zoom = 1;
        let pos = { x: 0, y: 0 };

        function tamano() {
          const s = scaleBase * zoom;
          return { w: img.width * s, h: img.height * s };
        }
        function clampPos() {
          const { w, h } = tamano();
          const minX = Math.min(0, VIEW - w), minY = Math.min(0, VIEW - h);
          pos.x = Math.min(0, Math.max(minX, pos.x));
          pos.y = Math.min(0, Math.max(minY, pos.y));
        }
        function aplicar() {
          const { w, h } = tamano();
          imgEl.style.width = w + 'px';
          imgEl.style.height = h + 'px';
          imgEl.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
        }

        pos = { x: (VIEW - tamano().w) / 2, y: (VIEW - tamano().h) / 2 };
        aplicar();

        let arrastrando = false;
        let inicio = { x: 0, y: 0 };
        let posInicio = { x: 0, y: 0 };

        viewport.addEventListener('pointerdown', (e) => {
          arrastrando = true;
          viewport.style.cursor = 'grabbing';
          inicio = { x: e.clientX, y: e.clientY };
          posInicio = { ...pos };
          viewport.setPointerCapture?.(e.pointerId);
        });
        viewport.addEventListener('pointermove', (e) => {
          if (!arrastrando) return;
          pos = { x: posInicio.x + (e.clientX - inicio.x), y: posInicio.y + (e.clientY - inicio.y) };
          clampPos();
          aplicar();
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => viewport.addEventListener(ev, () => {
          arrastrando = false;
          viewport.style.cursor = 'grab';
        }));

        zoomInput.addEventListener('input', () => {
          // Mantiene fijo el centro del recorte mientras se acerca/aleja.
          const { w: wAntes, h: hAntes } = tamano();
          const fracX = (VIEW / 2 - pos.x) / wAntes;
          const fracY = (VIEW / 2 - pos.y) / hAntes;
          zoom = zoomInput.value / 100;
          const { w: wDespues, h: hDespues } = tamano();
          pos = { x: VIEW / 2 - fracX * wDespues, y: VIEW / 2 - fracY * hDespues };
          clampPos();
          aplicar();
        });

        function cerrar(valor) {
          overlay.remove();
          resolve(valor);
        }
        overlay.querySelector('#crop-cerrar').addEventListener('click', () => cerrar(null));
        overlay.querySelector('#crop-cancelar').addEventListener('click', () => cerrar(null));
        overlay.querySelector('#crop-confirmar').addEventListener('click', () => {
          const SALIDA = 800; // foto final cuadrada, en px
          const factor = SALIDA / VIEW;
          const { w, h } = tamano();
          const canvas = document.createElement('canvas');
          canvas.width = SALIDA; canvas.height = SALIDA;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, pos.x * factor, pos.y * factor, w * factor, h * factor);
          cerrar(canvas.toDataURL('image/jpeg', 0.85));
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function fileToResizedBase64(file, maxWidth = 640, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagen inválida'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function renderMediosPago() {
  const cont = $('#caja-content');
  const { data, error } = await sb.from('medios_pago').select('*').order('created_at', { ascending: false });
  const html = `
    <div class="section-head">
      <div><h2 style="font-size:16px">Medios de pago</h2><p class="sub">Cuentas bancarias y QR para compartir con los clientes al cobrar</p></div>
      <button class="btn btn-primary btn-sm" id="btn-nuevo-medio">+ Agregar</button>
    </div>
    <div id="medios-list"></div>
  `;
  cont.innerHTML = html;
  $('#btn-nuevo-medio').addEventListener('click', () => abrirFormMedioPago());

  const list = $('#medios-list');
  if (error || !data || data.length === 0) { list.innerHTML = `<div class="empty-state">Todavía no cargaste ninguna cuenta ni QR.</div>`; return; }

  list.innerHTML = `<div class="grid-2">${data.map(m => `
    <div class="card" data-medio="${m.id}">
      <div class="card-title">${m.tipo === 'qr' ? '📷 QR' : '🏦 Cuenta bancaria'} ${!m.activo ? '<span class="badge badge-rechazada">Inactivo</span>' : ''}</div>
      ${m.imagen_base64 ? `<img src="${m.imagen_base64}" style="width:100%;max-width:220px;border-radius:8px;margin-bottom:10px;display:block" />` : ''}
      ${m.banco ? `<div style="font-size:13px;margin-bottom:2px"><strong>${escapeHtml(m.banco)}</strong></div>` : ''}
      ${m.titular ? `<div style="font-size:12.5px;color:var(--text-dim)">Titular: ${escapeHtml(m.titular)}</div>` : ''}
      ${m.numero_cuenta ? `<div style="font-size:12.5px;color:var(--text-dim)">Cuenta: ${escapeHtml(m.numero_cuenta)}</div>` : ''}
      ${m.nit_titular ? `<div style="font-size:12.5px;color:var(--text-dim)">NIT: ${escapeHtml(m.nit_titular)}</div>` : ''}
      <div class="row-actions" style="margin-top:10px">
        <button class="icon-btn" data-act="editar" data-id="${m.id}" title="Editar">✎</button>
        <button class="icon-btn" data-act="${m.activo ? 'desactivar' : 'activar'}" data-id="${m.id}" title="${m.activo ? 'Desactivar' : 'Activar'}">${m.activo ? '⛔' : '✅'}</button>
        <button class="icon-btn" data-act="eliminar" data-id="${m.id}" title="Eliminar">🗑</button>
      </div>
    </div>
  `).join('')}</div>`;

  list.querySelectorAll('[data-act]').forEach(btn => {
    const m = data.find(x => x.id === btn.dataset.id);
    btn.addEventListener('click', async () => {
      const act = btn.dataset.act;
      if (act === 'editar') abrirFormMedioPago(m);
      if (act === 'eliminar') eliminarRegistro('medios_pago', m.id, renderMediosPago);
      if (act === 'activar' || act === 'desactivar') {
        await sb.from('medios_pago').update({ activo: act === 'activar' }).eq('id', m.id);
        toast(act === 'activar' ? 'Medio activado' : 'Medio desactivado');
        await cargarMediosPago();
        renderMediosPago();
      }
    });
  });
}

function abrirFormMedioPago(existing) {
  const tipoInicial = existing?.tipo || 'banco';
  openModal(`
    <div class="sheet-head"><h3>${existing ? 'Editar medio de pago' : 'Nuevo medio de pago'}</h3><button class="sheet-close" id="sheet-close">✕</button></div>
    <div class="field"><label>Tipo</label>
      <select id="f-tipo-medio">
        <option value="banco" ${tipoInicial === 'banco' ? 'selected' : ''}>Cuenta bancaria</option>
        <option value="qr" ${tipoInicial === 'qr' ? 'selected' : ''}>QR</option>
      </select>
    </div>
    <div class="field" style="margin-top:10px"><label>Banco</label><input id="f-banco" value="${existing ? escapeHtml(existing.banco || '') : ''}" placeholder="Ej: Banco BISA" /></div>
    <div class="field" style="margin-top:10px"><label>Titular</label><input id="f-titular" value="${existing ? escapeHtml(existing.titular || '') : ''}" placeholder="Nombre del titular" /></div>
    <div class="grid-2" id="campos-banco" style="margin-top:10px; ${tipoInicial === 'qr' ? 'display:none' : ''}">
      <div class="field"><label>N° de cuenta</label><input id="f-numcuenta" value="${existing ? escapeHtml(existing.numero_cuenta || '') : ''}" /></div>
      <div class="field"><label>NIT del titular</label><input id="f-nittitular" value="${existing ? escapeHtml(existing.nit_titular || '') : ''}" /></div>
    </div>
    <div class="field" style="margin-top:10px"><label>Imagen (QR o logo del banco, opcional)</label><input type="file" id="f-imagen" accept="image/*" /></div>
    ${existing?.imagen_base64 ? `<img src="${existing.imagen_base64}" style="width:100%;max-width:200px;border-radius:8px;margin-top:8px" />` : ''}
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-primary" id="btn-guardar">💾 Guardar</button>
    </div>
  `);
  $('#sheet-close').addEventListener('click', closeModal);
  $('#btn-cancelar').addEventListener('click', closeModal);
  $('#f-tipo-medio').addEventListener('change', (e) => {
    $('#campos-banco').style.display = e.target.value === 'qr' ? 'none' : '';
  });
  $('#btn-guardar').addEventListener('click', async () => {
    const tipo = $('#f-tipo-medio').value;
    const banco = $('#f-banco').value.trim();
    const titular = $('#f-titular').value.trim();
    const numero_cuenta = $('#f-numcuenta')?.value.trim() || '';
    const nit_titular = $('#f-nittitular')?.value.trim() || '';
    const archivo = $('#f-imagen').files[0];

    let imagen_base64 = existing?.imagen_base64 || null;
    if (archivo) {
      try { imagen_base64 = await fileToResizedBase64(archivo); }
      catch (e) { toast('Error al procesar la imagen: ' + e.message, 'error'); return; }
    }

    const payload = { tipo, banco, titular, numero_cuenta, nit_titular, imagen_base64 };
    let resp;
    if (existing) resp = await sb.from('medios_pago').update(payload).eq('id', existing.id);
    else resp = await sb.from('medios_pago').insert(payload);
    if (resp.error) { toast('Error: ' + resp.error.message, 'error'); return; }
    toast('Medio de pago guardado');
    closeModal();
    await cargarMediosPago();
    renderMediosPago();
  });
}

// ------------------------------------------------------------
// COMPARTIR MEDIO DE PAGO POR WHATSAPP (desde Cotizaciones/Ventas/Cobro)
// ------------------------------------------------------------
function dataURLtoBlob(dataurl) {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

// Comparte uno o más archivos + texto por WhatsApp. Usa el selector nativo
// del celular (navigator.share) cuando está disponible: ahí WhatsApp
// aparece como una opción y manda la foto y el texto juntos, en un solo
// paso. Si el navegador no lo soporta (típico en computadora, o algunos
// Android viejos) descarga los archivos al dispositivo y abre WhatsApp
// con el texto, para adjuntarlos a mano desde Descargas — más confiable
// que abrir la imagen en otra pestaña, que en muchos celulares no se deja
// adjuntar directo desde ahí.
async function compartirArchivosWhatsapp({ files, texto, titulo, numeroWa }) {
  try {
    if (navigator.canShare && navigator.canShare({ files })) {
      await navigator.share({ files, text: texto, title: titulo });
      return true;
    }
  } catch (e) {
    if (e.name === 'AbortError') return true; // canceló el panel nativo: no insistir con otro flujo
    // cualquier otro error: seguimos al fallback de descarga + wa.me
  }
  files.forEach(descargarArchivo);
  const aviso = files.length > 1
    ? '\n\n(Descargamos las fotos a tu dispositivo — adjuntalas vos en este chat)'
    : '\n\n(Descargamos la foto a tu dispositivo — adjuntala vos en este chat)';
  const base = numeroWa ? `https://wa.me/${numeroWa}` : 'https://wa.me/';
  window.open(`${base}?text=${encodeURIComponent(texto + aviso)}`, '_blank');
  return false;
}

function descargarArchivo(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function abrirSelectorMedioPago(doc, tipoLabel) {
  if (mediosPagoCache.length === 0) {
    toast('Todavía no cargaste ninguna cuenta ni QR en Caja → Medios de pago', 'error');
    return;
  }
  openModal(`
    <div class="sheet-head"><h3>Compartir medio de pago</h3><button class="sheet-close" id="sheet-close">✕</button></div>
    <p style="color:var(--text-dim);font-size:13px;margin-top:-6px">${tipoLabel} de ${escapeHtml(doc.cliente_nombre)} — ${money(doc.total)}</p>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">
      ${mediosPagoCache.map(m => `
        <button class="card" data-medio-id="${m.id}" style="text-align:left;cursor:pointer;border:1px solid var(--border)">
          <div class="card-title">${m.tipo === 'qr' ? '📷 QR' : '🏦 ' + escapeHtml(m.banco || 'Cuenta bancaria')}</div>
          ${m.titular ? `<div style="font-size:12.5px;color:var(--text-dim)">${escapeHtml(m.titular)}</div>` : ''}
          ${m.numero_cuenta ? `<div style="font-size:12.5px;color:var(--text-dim)">Cuenta: ${escapeHtml(m.numero_cuenta)}</div>` : ''}
        </button>
      `).join('')}
    </div>
  `);
  $('#sheet-close').addEventListener('click', closeModal);
  $$('[data-medio-id]').forEach(btn => {
    const medio = mediosPagoCache.find(m => m.id === btn.dataset.medioId);
    btn.addEventListener('click', () => compartirMedioPagoWhatsapp(doc, tipoLabel, medio));
  });
}

async function compartirMedioPagoWhatsapp(doc, tipoLabel, medio) {
  const numeroTel = numeroDoc(doc, tipoLabel === 'Venta' ? 'VTA' : 'COT');
  let textoMedio = '';
  if (medio.tipo === 'qr') {
    textoMedio = `Escaneá este QR para pagar${medio.titular ? ' (' + medio.titular + ')' : ''}.`;
  } else {
    textoMedio = `Podés transferir a:\n${medio.banco || 'Banco'}\nTitular: ${medio.titular || '—'}\nN° de cuenta: ${medio.numero_cuenta || '—'}${medio.nit_titular ? '\nNIT: ' + medio.nit_titular : ''}`;
  }
  const texto = `*${tipoLabel} ${numeroTel} — Electrodomésticos BM*\nCliente: ${doc.cliente_nombre}\nTotal: ${money(doc.total)}\n\n${textoMedio}`;
  const numeroWa = (doc.cliente_telefono || '').replace(/[^0-9]/g, '');

  if (medio.imagen_base64) {
    const blob = dataURLtoBlob(medio.imagen_base64);
    const file = new File([blob], 'medio_pago.jpg', { type: blob.type });
    await compartirArchivosWhatsapp({ files: [file], texto, titulo: 'Medio de pago', numeroWa });
  } else {
    window.open(`https://wa.me/${numeroWa}?text=${encodeURIComponent(texto)}`, '_blank');
  }
  closeModal();
}

// ------------------------------------------------------------
// AUTORIZAR (solo admin): aprobar cotizaciones y cobrar ventas
// ------------------------------------------------------------
async function renderAutorizaciones() {
  const cont = $('#caja-content');
  cont.innerHTML = `<div id="autorizar-content"><div class="empty-state">Cargando…</div></div>`;

  const [{ data: cotizPend }, { data: ventasPend }] = await Promise.all([
    sb.from('cotizaciones').select('*').eq('estado', 'pendiente').order('created_at', { ascending: false }),
    sb.from('ventas').select('*, profiles(nombre, usuario)').eq('cobrado', false).order('created_at', { ascending: false })
  ]);

  let html = `<div class="card-title">Cotizaciones por autorizar</div>`;
  if (!cotizPend || cotizPend.length === 0) {
    html += `<div class="empty-state">No hay cotizaciones pendientes.</div>`;
  } else {
    html += `<div class="table-wrap"><table>
      <thead><tr><th>N°</th><th>Cliente</th><th>Total</th><th>Fecha</th><th>Acciones</th></tr></thead>
      <tbody>
        ${cotizPend.map(c => `
          <tr>
            <td>#${c.numero}</td><td>${escapeHtml(c.cliente_nombre)}</td><td>${money(c.total)}</td><td>${fecha(c.created_at)}</td>
            <td><div class="row-actions">
              <button class="icon-btn" data-acte="editar" data-id="${c.id}" title="Modificar">✎</button>
              <button class="icon-btn" data-actc="aprobar" data-id="${c.id}" title="Aprobar">✅</button>
              <button class="icon-btn" data-actc="rechazar" data-id="${c.id}" title="Rechazar">⛔</button>
            </div></td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>`;
  }

  html += `<div class="card-title" style="margin-top:24px">Ventas pendientes de cobro</div>`;
  if (!ventasPend || ventasPend.length === 0) {
    html += `<div class="empty-state">No hay ventas pendientes de cobro.</div>`;
  } else {
    html += `<div class="table-wrap"><table>
      <thead><tr><th>N°</th><th>Cliente</th><th>Vendedor</th><th>Total</th><th>Fecha</th><th>Acciones</th></tr></thead>
      <tbody>
        ${ventasPend.map(v => `
          <tr>
            <td>#${v.numero}</td><td>${escapeHtml(v.cliente_nombre)}</td>
            <td>${escapeHtml(v.profiles?.nombre || v.profiles?.usuario || '—')}</td>
            <td>${money(v.total)}</td><td>${fecha(v.created_at)}</td>
            <td><div class="row-actions">
              <button class="icon-btn" data-actev="editar" data-id="${v.id}" title="Modificar">✎</button>
              <button class="btn btn-primary btn-sm" data-actv="cobrar" data-id="${v.id}">💰 Cobrar</button>
            </div></td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>`;
  }

  const target = $('#autorizar-content');
  target.innerHTML = html;

  target.querySelectorAll('[data-acte]').forEach(btn => {
    const c = cotizPend.find(x => x.id === btn.dataset.id);
    btn.addEventListener('click', () => abrirFormCotizacion(c));
  });

  target.querySelectorAll('[data-actev]').forEach(btn => {
    const v = ventasPend.find(x => x.id === btn.dataset.id);
    btn.addEventListener('click', () => abrirFormVenta(v));
  });

  target.querySelectorAll('[data-actc]').forEach(btn => {
    const c = cotizPend.find(x => x.id === btn.dataset.id);
    btn.addEventListener('click', async () => {
      const nuevoEstado = btn.dataset.actc === 'aprobar' ? 'aprobada' : 'rechazada';
      const { error } = await sb.from('cotizaciones').update({ estado: nuevoEstado }).eq('id', c.id);
      if (error) { toast('Error: ' + error.message, 'error'); return; }
      toast('Cotización ' + nuevoEstado);
      renderAutorizaciones();
    });
  });

  target.querySelectorAll('[data-actv]').forEach(btn => {
    const v = ventasPend.find(x => x.id === btn.dataset.id);
    btn.addEventListener('click', () => abrirFormCobrarVenta(v));
  });
}

function abrirFormCobrarVenta(venta) {
  if (!sesionCajaActual) {
    toast('Primero abrí tu caja en la pestaña "Mi caja"', 'error');
    return;
  }
  openModal(`
    <div class="sheet-head"><h3>Cobrar venta #${venta.numero}</h3><button class="sheet-close" id="sheet-close">✕</button></div>
    <p style="color:var(--text-dim);font-size:13.5px;margin-top:-6px">Cliente: ${escapeHtml(venta.cliente_nombre)}</p>
    <div class="field" style="margin-top:12px"><label>Monto a cobrar (Bs)</label><input type="number" id="f-monto" value="${venta.total}" disabled /></div>
    <div class="field" style="margin-top:10px"><label>Método de pago</label>
      <select id="f-metodo">
        <option value="efectivo" ${venta.metodo_pago === 'efectivo' ? 'selected' : ''}>Efectivo</option>
        <option value="transferencia" ${venta.metodo_pago === 'transferencia' ? 'selected' : ''}>Transferencia</option>
        <option value="qr" ${venta.metodo_pago === 'qr' ? 'selected' : ''}>QR</option>
      </select>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-secondary" id="btn-mediopago" type="button">💳 Enviar medio de pago</button>
      <button class="btn btn-primary" id="btn-guardar">💾 Registrar cobro</button>
    </div>
  `);
  $('#sheet-close').addEventListener('click', closeModal);
  $('#btn-cancelar').addEventListener('click', closeModal);
  $('#btn-mediopago').addEventListener('click', () => abrirSelectorMedioPago(venta, 'Venta'));
  $('#btn-guardar').addEventListener('click', async () => {
    const metodo = $('#f-metodo').value;
    const { data: movimiento, error: e1 } = await sb.from('caja_movimientos').insert({
      sesion_id: sesionCajaActual.id,
      tipo: 'ingreso',
      concepto: `Cobro venta #${venta.numero} - ${venta.cliente_nombre}`,
      monto: venta.total,
      metodo_pago: metodo,
      usuario_id: profile.id,
      venta_id: venta.id
    }).select().single();
    if (e1) { toast('Error: ' + e1.message, 'error'); return; }
    const { error: e2 } = await sb.from('ventas').update({ cobrado: true, metodo_pago: metodo }).eq('id', venta.id);
    if (e2) { toast('Error: ' + e2.message, 'error'); return; }

    // Generamos el comprobante de pago enlazado a este movimiento de caja
    const formaComprobante = metodo === 'efectivo' ? 'efectivo' : (metodo === 'qr' ? 'qr' : 'transferencia');
    const { data: comprobante } = await sb.from('comprobantes').insert({
      cliente_nombre: venta.cliente_nombre,
      venta_numero: `#${venta.numero}`,
      forma_pago: formaComprobante,
      monto_total: venta.total,
      monto_efectivo: metodo === 'efectivo' ? venta.total : 0,
      monto_transferido: metodo !== 'efectivo' ? venta.total : 0,
      saldo_pendiente: 0,
      cajero_id: profile.id,
      cajero_nombre: profile.nombre || profile.usuario,
      caja_movimiento_id: movimiento.id
    }).select().single();
    if (comprobante) await sb.from('caja_movimientos').update({ comprobante_id: comprobante.id }).eq('id', movimiento.id);

    // Recién ahora, al cobrarse, se descuenta el stock real
    for (const it of (venta.items || [])) {
      if (it.producto_id) await ajustarStock(it.producto_id, -it.cantidad, `Venta #${venta.numero} (cobrada)`);
    }
    await cargarProductos();

    toast('Cobro registrado y comprobante generado');
    closeModal();
    renderCaja();
    if (comprobante) abrirVistaPreviaComprobante(comprobante);
  });
}

// ============================================================
// MÓDULO: CATÁLOGO (todos los roles) — fotos para mostrar a clientes
// ============================================================
async function renderCatalogoClientes() {
  await cargarProductos();
  const el = $('#view-catalogo');
  el.innerHTML = `
    <div class="section-head">
      <div><h2>Catálogo</h2><p class="sub">Mostrale fotos y precios a tus clientes</p></div>
      <button class="btn btn-primary btn-sm" id="btn-descargar-catalogo">⬇ Descargar catálogo</button>
    </div>
    <div class="field" style="margin-bottom:12px">
      <input id="cat-buscar" placeholder="🔍 Buscar producto…" value="${escapeHtml(catalogoBusqueda)}" />
    </div>
    <div class="tabs" id="cat-cliente-tabs"></div>
    <div id="catalogo-grid"></div>
  `;
  $('#cat-buscar').addEventListener('input', (e) => { catalogoBusqueda = e.target.value; renderGridCatalogo(); });
  $('#btn-descargar-catalogo').addEventListener('click', () => descargarCatalogoPDF());

  const categoriasConProductos = CATEGORIAS_PRODUCTO.filter(c => productosCache.some(p => p.categoria === c && p.visible_catalogo !== false));
  $('#cat-cliente-tabs').innerHTML = `
    <button class="tab-btn ${catalogoCategoria === 'todas' ? 'active' : ''}" data-c="todas">Todas</button>
    ${categoriasConProductos.map(c => `<button class="tab-btn ${catalogoCategoria === c ? 'active' : ''}" data-c="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
  `;
  $$('#cat-cliente-tabs .tab-btn').forEach(b => b.addEventListener('click', () => { catalogoCategoria = b.dataset.c; renderCatalogoClientes(); }));

  renderGridCatalogo();
}

function renderGridCatalogo() {
  const cont = $('#catalogo-grid');
  const q = catalogoBusqueda.trim().toLowerCase();
  let items = productosCache.filter(p => p.visible_catalogo !== false);
  if (catalogoCategoria !== 'todas') items = items.filter(p => p.categoria === catalogoCategoria);
  if (q) items = items.filter(p => p.descripcion.toLowerCase().includes(q) || (p.subcategoria || '').toLowerCase().includes(q));

  if (items.length === 0) {
    cont.innerHTML = `<div class="empty-state">${profile.rol === 'admin' ? 'Todavía no cargaste fotos de productos. Andá a Inventario, editá un producto y subí su imagen.' : 'Tu administrador todavía no cargó productos en el catálogo.'}</div>`;
    return;
  }

  cont.innerHTML = `<div class="catalogo-grid">${items.map(p => `
    <div class="catalogo-card" data-id="${p.id}">
      <div class="catalogo-img">${p.imagen_base64 ? `<img src="${p.imagen_base64}" />` : `<div class="catalogo-img-placeholder">Sin foto</div>`}</div>
      <div class="catalogo-body">
        <div class="catalogo-desc">${escapeHtml(p.descripcion)}</div>
        ${p.subcategoria ? `<div class="catalogo-sub">${escapeHtml(p.subcategoria)}</div>` : ''}
        <div class="catalogo-precio">${money(p.precio_venta)}</div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button class="btn btn-secondary btn-sm" data-act="ver" data-id="${p.id}" style="flex:1">👁 Ver</button>
          <button class="btn btn-secondary btn-sm" data-act="compartir" data-id="${p.id}" style="flex:1">📤 Compartir</button>
        </div>
      </div>
    </div>
  `).join('')}</div>`;

  cont.querySelectorAll('[data-act="ver"]').forEach(btn => {
    const p = items.find(x => x.id === btn.dataset.id);
    btn.addEventListener('click', () => verProductoCatalogo(p));
  });
  cont.querySelectorAll('[data-act="compartir"]').forEach(btn => {
    const p = items.find(x => x.id === btn.dataset.id);
    btn.addEventListener('click', () => compartirProductoCatalogo(p));
  });
}

// Vista previa antes de compartir — así el vendedor ve exactamente lo
// que le va a llegar al cliente (misma foto recortada en cuadrado).
function verProductoCatalogo(p) {
  openModal(`
    <div class="sheet-head"><h3>Vista previa</h3><button class="sheet-close" id="sheet-close">✕</button></div>
    <div style="width:100%;aspect-ratio:1/1;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;display:flex;align-items:center;justify-content:center">
      ${p.imagen_base64 ? `<img src="${p.imagen_base64}" style="width:100%;height:100%;object-fit:cover" />` : `<span style="color:var(--text-faint)">Sin foto</span>`}
    </div>
    <div style="margin-top:14px">
      ${p.subcategoria ? `<div style="color:var(--accent);font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-bottom:4px">${escapeHtml(p.subcategoria)}</div>` : ''}
      <div style="font-family:var(--font-display);font-weight:700;font-size:17px">${escapeHtml(p.descripcion)}</div>
      <div style="font-family:var(--font-display);font-weight:800;font-size:22px;color:var(--accent);margin-top:6px">${money(p.precio_venta)}</div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cerrar-preview">Cerrar</button>
      <button class="btn btn-primary" id="btn-compartir-preview">📤 Compartir</button>
    </div>
  `);
  $('#sheet-close').addEventListener('click', closeModal);
  $('#btn-cerrar-preview').addEventListener('click', closeModal);
  $('#btn-compartir-preview').addEventListener('click', () => { closeModal(); compartirProductoCatalogo(p); });
}

async function compartirProductoCatalogo(p) {
  const texto = `*${p.descripcion}*${p.subcategoria ? '\n' + p.subcategoria : ''}\nPrecio: ${money(p.precio_venta)}\n\n_Electrodomésticos BM_`;
  if (p.imagen_base64) {
    const blob = dataURLtoBlob(p.imagen_base64);
    const file = new File([blob], 'producto.jpg', { type: blob.type });
    await compartirArchivosWhatsapp({ files: [file], texto, titulo: p.descripcion });
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  }
}

async function descargarCatalogoPDF() {
  const q = catalogoBusqueda.trim().toLowerCase();
  let items = productosCache.filter(p => p.visible_catalogo !== false);
  if (catalogoCategoria !== 'todas') items = items.filter(p => p.categoria === catalogoCategoria);
  if (q) items = items.filter(p => p.descripcion.toLowerCase().includes(q) || (p.subcategoria || '').toLowerCase().includes(q));

  if (items.length === 0) { toast('No hay productos para descargar en esta categoría', 'error'); return; }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  const tituloCategoria = catalogoCategoria === 'todas' ? 'Catálogo completo' : `Catálogo — ${catalogoCategoria}`;
  const asesorNombre = profile.nombre || profile.usuario;
  const asesorTelefono = profile.telefono || '';

  function encabezado() {
    pdf.setFontSize(16);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(20, 20, 20);
    pdf.text('Electrodomésticos BM', 14, 16);
    pdf.setFontSize(11);
    pdf.setFont(undefined, 'normal');
    pdf.text(tituloCategoria, 14, 23);
    pdf.setDrawColor(20, 20, 20);
    pdf.line(14, 27, 196, 27);
  }
  function piePagina() {
    pdf.setFontSize(9);
    pdf.setTextColor(107, 114, 128);
    pdf.text(`Asesor: ${asesorNombre}${asesorTelefono ? ' — ' + asesorTelefono : ''}`, 14, 289);
  }

  encabezado();
  piePagina();
  let y = 36;
  const alturaFila = 42;

  items.forEach((p, i) => {
    if (y + alturaFila > 280) {
      pdf.addPage();
      encabezado();
      piePagina();
      y = 36;
    }
    if (p.imagen_base64) {
      try { pdf.addImage(p.imagen_base64, 'JPEG', 14, y, 36, 36); } catch (e) { /* imagen inválida, seguimos sin ella */ }
    } else {
      pdf.setDrawColor(200, 200, 200);
      pdf.rect(14, y, 36, 36);
      pdf.setFontSize(8);
      pdf.setTextColor(180, 180, 180);
      pdf.text('Sin foto', 24, y + 20);
    }
    pdf.setFontSize(12);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(20, 20, 20);
    pdf.text(p.descripcion, 56, y + 10, { maxWidth: 130 });
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'normal');
    pdf.setTextColor(90, 90, 90);
    if (p.subcategoria) pdf.text(p.subcategoria, 56, y + 18);
    pdf.setFontSize(13);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(0, 150, 100);
    pdf.text(money(p.precio_venta), 56, y + 30);

    pdf.setDrawColor(230, 230, 230);
    pdf.line(14, y + alturaFila - 4, 196, y + alturaFila - 4);
    y += alturaFila;
  });

  pdf.save(`Catalogo_${catalogoCategoria === 'todas' ? 'completo' : catalogoCategoria.replace(/\s+/g, '_')}.pdf`);
}

// ============================================================
// MÓDULO: PROMOCIONES
// ============================================================
async function cargarPromociones() {
  const { data } = await sb.from('promociones').select('*').order('created_at', { ascending: false });
  promocionesCache = data || [];
}

function promocionesActivas() {
  const hoy = new Date(new Date().toDateString());
  return promocionesCache.filter(p => p.activa && (!p.fecha_fin || new Date(p.fecha_fin) >= hoy));
}

function mostrarPopupPromosVendedor() {
  const activas = promocionesActivas();
  if (activas.length === 0) return;
  openModal(`
    <div class="sheet-head"><h3>🎉 Promociones activas</h3><button class="sheet-close" id="sheet-close">✕</button></div>
    <p style="color:var(--text-dim);font-size:13px;margin-top:-6px">Contales esto a tus clientes:</p>
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px">
      ${activas.map(p => `
        <div class="card">
          ${p.imagen_base64 ? `<img src="${p.imagen_base64}" style="width:100%;border-radius:8px;margin-bottom:10px" />` : ''}
          <div class="card-title">${escapeHtml(p.titulo)} <span class="badge badge-ok">${p.tipo === '2x1' ? '2x1' : (p.tipo === 'descuento' ? 'Descuento' : 'Promo')}</span></div>
          <p style="font-size:13px;color:var(--text-dim);margin:6px 0 0">${escapeHtml(p.descripcion)}</p>
          ${p.fecha_fin ? `<p style="font-size:11.5px;color:var(--text-faint);margin-top:6px">Válido hasta ${fecha(p.fecha_fin)}</p>` : ''}
          <button class="btn btn-secondary btn-sm" data-compartir-promo="${p.id}" style="margin-top:10px">📤 Compartir con un cliente</button>
        </div>
      `).join('')}
    </div>
    <div class="form-actions"><button class="btn btn-primary btn-block" id="btn-entendido-promo">Entendido, continuar</button></div>
  `);
  $('#sheet-close').addEventListener('click', closeModal);
  $('#btn-entendido-promo').addEventListener('click', closeModal);
  $$('[data-compartir-promo]').forEach(btn => {
    const p = activas.find(x => x.id === btn.dataset.compartirPromo);
    btn.addEventListener('click', () => compartirPromocionWhatsapp(p));
  });
}

async function compartirPromocionWhatsapp(p) {
  const texto = `*🎉 ${p.titulo}*\n${p.descripcion}${p.fecha_fin ? '\nVálido hasta ' + fecha(p.fecha_fin) : ''}\n\n_Electrodomésticos BM_`;
  if (p.imagen_base64) {
    const blob = dataURLtoBlob(p.imagen_base64);
    const file = new File([blob], 'promo.jpg', { type: blob.type });
    await compartirArchivosWhatsapp({ files: [file], texto, titulo: p.titulo });
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  }
}

async function renderPromos() {
  await cargarPromociones();
  const el = $('#view-promos');
  el.innerHTML = `
    <div class="section-head">
      <div><h2>Promociones</h2><p class="sub">${profile.rol === 'admin' ? 'Descuentos, 2x1 y otras ofertas para contarle a los clientes' : 'Promos activas para contarle a tus clientes'}</p></div>
      ${profile.rol === 'admin' ? `<button class="btn btn-primary" id="btn-nueva-promo">+ Nueva promoción</button>` : ''}
    </div>
    <div id="promos-list"></div>
  `;
  if (profile.rol === 'admin') $('#btn-nueva-promo').addEventListener('click', () => abrirFormPromocion());

  const list = $('#promos-list');
  const items = profile.rol === 'admin' ? promocionesCache : promocionesActivas();
  if (items.length === 0) {
    list.innerHTML = `<div class="empty-state">${profile.rol === 'admin' ? 'Todavía no cargaste ninguna promoción.' : 'No hay promociones activas por ahora.'}</div>`;
    return;
  }

  list.innerHTML = `<div class="grid-2">${items.map(p => `
    <div class="card">
      ${p.imagen_base64 ? `<img src="${p.imagen_base64}" style="width:100%;border-radius:8px;margin-bottom:10px" />` : ''}
      <div class="card-title">${escapeHtml(p.titulo)} <span class="badge ${p.activa ? 'badge-ok' : 'badge-rechazada'}">${p.tipo === '2x1' ? '2x1' : (p.tipo === 'descuento' ? 'Descuento' : 'Promo')}${!p.activa ? ' · Inactiva' : ''}</span></div>
      <p style="font-size:13px;color:var(--text-dim);margin:6px 0 0">${escapeHtml(p.descripcion)}</p>
      ${p.fecha_fin ? `<p style="font-size:11.5px;color:var(--text-faint);margin-top:6px">Válido hasta ${fecha(p.fecha_fin)}</p>` : ''}
      <div class="row-actions" style="margin-top:10px">
        <button class="icon-btn" data-act="compartir" data-id="${p.id}" title="Compartir">📤</button>
        ${profile.rol === 'admin' ? `
          <button class="icon-btn" data-act="editar" data-id="${p.id}" title="Editar">✎</button>
          <button class="icon-btn" data-act="${p.activa ? 'desactivar' : 'activar'}" data-id="${p.id}" title="${p.activa ? 'Desactivar' : 'Activar'}">${p.activa ? '⛔' : '✅'}</button>
          <button class="icon-btn" data-act="eliminar" data-id="${p.id}" title="Eliminar">🗑</button>
        ` : ''}
      </div>
    </div>
  `).join('')}</div>`;

  list.querySelectorAll('[data-act]').forEach(btn => {
    const p = items.find(x => x.id === btn.dataset.id);
    btn.addEventListener('click', async () => {
      const act = btn.dataset.act;
      if (act === 'compartir') compartirPromocionWhatsapp(p);
      if (act === 'editar') abrirFormPromocion(p);
      if (act === 'eliminar') eliminarRegistro('promociones', p.id, renderPromos);
      if (act === 'activar' || act === 'desactivar') {
        await sb.from('promociones').update({ activa: act === 'activar' }).eq('id', p.id);
        toast(act === 'activar' ? 'Promoción activada' : 'Promoción desactivada');
        renderPromos();
      }
    });
  });
}

function abrirFormPromocion(existing) {
  openModal(`
    <div class="sheet-head"><h3>${existing ? 'Editar promoción' : 'Nueva promoción'}</h3><button class="sheet-close" id="sheet-close">✕</button></div>
    <div class="field"><label>Título *</label><input id="f-titulo" value="${existing ? escapeHtml(existing.titulo) : ''}" placeholder="Ej: 20% off en termotanques a gas" required /></div>
    <div class="field" style="margin-top:10px"><label>Descripción</label><textarea id="f-desc-promo" placeholder="Detalle de la promoción...">${existing ? escapeHtml(existing.descripcion || '') : ''}</textarea></div>
    <div class="grid-2" style="margin-top:10px">
      <div class="field"><label>Tipo</label>
        <select id="f-tipo-promo">
          <option value="descuento" ${(!existing || existing.tipo === 'descuento') ? 'selected' : ''}>Descuento</option>
          <option value="2x1" ${existing?.tipo === '2x1' ? 'selected' : ''}>2x1</option>
          <option value="otro" ${existing?.tipo === 'otro' ? 'selected' : ''}>Otro</option>
        </select>
      </div>
      <div class="field"><label>Válido hasta (opcional)</label><input type="date" id="f-fecha-fin" value="${existing?.fecha_fin || ''}" /></div>
    </div>
    <div class="field" style="margin-top:10px"><label>Imagen (opcional)</label><input type="file" id="f-imagen-promo" accept="image/*" /></div>
    ${existing?.imagen_base64 ? `<img src="${existing.imagen_base64}" style="width:100%;max-width:200px;border-radius:8px;margin-top:8px" />` : ''}
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-primary" id="btn-guardar">💾 Guardar</button>
    </div>
  `);
  $('#sheet-close').addEventListener('click', closeModal);
  $('#btn-cancelar').addEventListener('click', closeModal);
  $('#btn-guardar').addEventListener('click', async () => {
    const titulo = $('#f-titulo').value.trim();
    if (!titulo) { toast('Ingresá un título', 'error'); return; }
    const archivo = $('#f-imagen-promo').files[0];
    let imagen_base64 = existing?.imagen_base64 || null;
    if (archivo) {
      try { imagen_base64 = await fileToResizedBase64(archivo); }
      catch (e) { toast('Error al procesar la imagen: ' + e.message, 'error'); return; }
    }
    const payload = {
      titulo,
      descripcion: $('#f-desc-promo').value.trim(),
      tipo: $('#f-tipo-promo').value,
      fecha_fin: $('#f-fecha-fin').value || null,
      imagen_base64
    };
    let resp;
    if (existing) resp = await sb.from('promociones').update(payload).eq('id', existing.id);
    else resp = await sb.from('promociones').insert({ ...payload, activa: true });
    if (resp.error) { toast('Error: ' + resp.error.message, 'error'); return; }
    toast('Promoción guardada');
    closeModal();
    await cargarPromociones();
    renderPromos();
  });
}

// ============================================================
// MÓDULO: GARANTÍAS (exclusivo del administrador)
// ============================================================
let busquedaGarantias = '';

function estadoGarantia(g) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const venc = new Date(g.fecha_vencimiento + 'T00:00:00');
  return venc >= hoy ? 'vigente' : 'vencida';
}

async function cargarGarantias() {
  const { data, error } = await sb.from('garantias').select('*').order('fecha_vencimiento', { ascending: true });
  if (error) { toast('Error cargando garantías: ' + error.message, 'error'); garantiasCache = []; return; }
  garantiasCache = data || [];
}

async function renderGarantias() {
  const el = $('#view-garantias');
  el.innerHTML = `
    <div class="section-head">
      <div><h2>Garantías</h2><p class="sub">Registrá hasta qué fecha queda cubierta cada venta</p></div>
      <button class="btn btn-primary" id="btn-nueva-garantia">+ Registrar garantía</button>
    </div>
    <div class="field" style="margin-bottom:14px">
      <input id="gar-buscar" placeholder="🔍 Buscar por cliente o producto…" value="${escapeHtml(busquedaGarantias)}" />
    </div>
    <div id="garantias-table"><div class="empty-state">Cargando…</div></div>
  `;
  $('#btn-nueva-garantia').addEventListener('click', () => abrirFormGarantia());
  $('#gar-buscar').addEventListener('input', (e) => { busquedaGarantias = e.target.value; renderTablaGarantias(); });

  await cargarGarantias();
  renderTablaGarantias();
}

function renderTablaGarantias() {
  const cont = $('#garantias-table');
  if (!cont) return;
  const q = busquedaGarantias.trim().toLowerCase();
  const lista = garantiasCache.filter(g =>
    !q || g.cliente_nombre.toLowerCase().includes(q) || g.producto_descripcion.toLowerCase().includes(q)
  );

  if (lista.length === 0) {
    cont.innerHTML = `<div class="empty-state">${q ? 'Sin resultados.' : 'Todavía no registraste ninguna garantía.'}</div>`;
    return;
  }

  cont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Cliente</th><th>Producto</th><th>Venta</th><th>Vence</th><th>Estado</th><th>Acciones</th></tr></thead>
    <tbody>
      ${lista.map(g => {
        const estado = estadoGarantia(g);
        return `
        <tr>
          <td>${escapeHtml(g.cliente_nombre)}${g.cliente_telefono ? `<div style="color:var(--text-dim);font-size:11px;margin-top:1px">${escapeHtml(g.cliente_telefono)}</div>` : ''}</td>
          <td>${escapeHtml(g.producto_descripcion)}</td>
          <td>${g.venta_numero ? '#' + g.venta_numero : '—'}</td>
          <td>${fecha(g.fecha_vencimiento)}</td>
          <td><span class="badge ${estado === 'vigente' ? 'badge-ok' : 'badge-rechazada'}">${estado === 'vigente' ? 'Vigente' : 'Vencida'}</span></td>
          <td><div class="row-actions">
            <button class="icon-btn" data-act="eliminar" data-id="${g.id}" title="Eliminar">🗑</button>
          </div></td>
        </tr>
      `;}).join('')}
    </tbody>
  </table></div>`;

  cont.querySelectorAll('[data-act="eliminar"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta garantía?')) return;
      const { error } = await sb.from('garantias').delete().eq('id', btn.dataset.id);
      if (error) { toast('Error: ' + error.message, 'error'); return; }
      toast('Garantía eliminada');
      await cargarGarantias();
      renderTablaGarantias();
    });
  });
}

async function abrirFormGarantia() {
  const { data } = await sb.from('ventas').select('*').order('created_at', { ascending: false }).limit(500);
  ventasParaGarantiaCache = data || [];

  openModal(`
    <div class="sheet-head"><h3>Registrar garantía</h3><button class="sheet-close" id="sheet-close">✕</button></div>

    <div class="field"><label>Venta *</label>
      <input id="g-venta-busqueda" list="ventas-datalist" placeholder="Buscá por N° o nombre del cliente…" autocomplete="off" required />
      <datalist id="ventas-datalist">${ventasParaGarantiaCache.map(v => `<option value="#${v.numero} — ${escapeHtml(v.cliente_nombre)}"></option>`).join('')}</datalist>
    </div>

    <div class="field" style="margin-top:10px"><label>Producto de esa venta *</label>
      <select id="g-producto" disabled><option value="">Elegí primero una venta…</option></select>
    </div>

    <div class="grid-2" style="margin-top:10px">
      <div class="field"><label>Cliente *</label><input id="g-cliente" required /></div>
      <div class="field"><label>Teléfono</label><input id="g-telefono" /></div>
    </div>

    <div class="grid-2" style="margin-top:10px">
      <div class="field"><label>Fecha de compra</label><input type="date" id="g-fecha-compra" /></div>
      <div class="field"><label>Garantía vence el *</label><input type="date" id="g-fecha-vencimiento" required /></div>
    </div>

    <div class="field" style="margin-top:10px"><label>Notas (opcional)</label><input id="g-notas" placeholder="Ej: 6 meses por defectos de fábrica" /></div>

    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-primary" id="btn-guardar">💾 Guardar garantía</button>
    </div>
  `);

  let ventaSeleccionada = null;

  $('#sheet-close').addEventListener('click', closeModal);
  $('#btn-cancelar').addEventListener('click', closeModal);

  $('#g-venta-busqueda').addEventListener('change', (e) => {
    const m = e.target.value.match(/^#(\d+)/);
    ventaSeleccionada = m ? ventasParaGarantiaCache.find(v => v.numero === Number(m[1])) : null;

    const selProducto = $('#g-producto');
    if (!ventaSeleccionada) {
      selProducto.disabled = true;
      selProducto.innerHTML = '<option value="">Venta no encontrada — elegí una de la lista</option>';
      return;
    }

    const items = Array.isArray(ventaSeleccionada.items) ? ventaSeleccionada.items : [];
    selProducto.disabled = false;
    selProducto.innerHTML = items.length
      ? items.map((it, i) => `<option value="${i}">${escapeHtml(it.descripcion)}</option>`).join('')
      : '<option value="">Esa venta no tiene ítems cargados</option>';

    $('#g-cliente').value = ventaSeleccionada.cliente_nombre || '';
    $('#g-telefono').value = ventaSeleccionada.cliente_telefono || '';
    $('#g-fecha-compra').value = (ventaSeleccionada.created_at || '').slice(0, 10);
  });

  $('#btn-guardar').addEventListener('click', async () => {
    const cliente_nombre = $('#g-cliente').value.trim();
    const fecha_vencimiento = $('#g-fecha-vencimiento').value;
    const idxItem = $('#g-producto').value;
    const items = ventaSeleccionada && Array.isArray(ventaSeleccionada.items) ? ventaSeleccionada.items : [];
    const producto_descripcion = items[idxItem]?.descripcion || '';

    if (!cliente_nombre) { toast('Falta el nombre del cliente', 'error'); return; }
    if (!producto_descripcion) { toast('Elegí una venta y un producto', 'error'); return; }
    if (!fecha_vencimiento) { toast('Falta la fecha de vencimiento de la garantía', 'error'); return; }

    const payload = {
      venta_id: ventaSeleccionada?.id || null,
      venta_numero: ventaSeleccionada?.numero || null,
      cliente_nombre,
      cliente_telefono: $('#g-telefono').value.trim(),
      producto_descripcion,
      fecha_compra: $('#g-fecha-compra').value || new Date().toISOString().slice(0, 10),
      fecha_vencimiento,
      notas: $('#g-notas').value.trim(),
      registrado_por: profile.id
    };

    const { error } = await sb.from('garantias').insert(payload);
    if (error) { toast('Error al guardar: ' + error.message, 'error'); return; }

    toast('Garantía registrada ✓');
    closeModal();
    await cargarGarantias();
    renderTablaGarantias();
  });
}

// ============================================================
// MÓDULO: CHAT — general (todo el equipo) + individuales
// (cada vendedor con la administración; cualquier admin ve y
// responde todos los hilos individuales)
// ============================================================
let chatImagenPendiente = null;
let chatNoLeidosPorHilo = {}; // 'general' | <id de vendedor> -> cantidad de no leídos

// 'general' usa la misma clave de siempre (no perder el estado ya guardado
// en el dispositivo); los hilos individuales usan una clave por vendedor.
function claveVistoHilo(hilo) {
  return hilo === 'general' ? `bm_chat_visto_${profile.id}` : `bm_chat_visto_${profile.id}_ind_${hilo}`;
}
function totalNoLeidos() {
  return Object.values(chatNoLeidosPorHilo).reduce((a, b) => a + b, 0);
}
function marcarHiloVisto(hilo) {
  localStorage.setItem(claveVistoHilo(hilo), new Date().toISOString());
  chatNoLeidosPorHilo[hilo] = 0;
  actualizarBadgeChat();
}
function actualizarBadgeChat() {
  const badge = $('#chat-badge');
  if (!badge) return;
  const total = totalNoLeidos();
  if (total > 0) { badge.hidden = false; badge.textContent = total > 9 ? '9+' : total; }
  else { badge.hidden = true; }
}

// A qué hilo pertenece un mensaje: null (general) o el id del vendedor dueño del hilo.
function hiloDeMensaje(m) {
  return m.conversacion_con || 'general';
}
// Si me corresponde enterarme de este mensaje (el admin ve todos los hilos,
// un vendedor solo el general y el suyo — coincide con la policy de RLS).
function esMensajeRelevante(m) {
  if (profile.rol === 'admin') return true;
  return !m.conversacion_con || m.conversacion_con === profile.id;
}

// Timbre corto generado con Web Audio (sin archivo externo, funciona
// offline) + vibración en celulares que la soportan.
function sonarNotificacion() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.25);
  } catch (e) { /* el navegador puede bloquear audio sin interacción previa */ }
  if (navigator.vibrate) navigator.vibrate(200);
}

async function cargarVendedores() {
  const { data } = await sb.from('profiles').select('*').eq('rol', 'vendedor').order('nombre');
  vendedoresCache = data || [];
}

async function inicializarNotificacionesChat() {
  chatNoLeidosPorHilo = {};

  const vistoGeneral = localStorage.getItem(claveVistoHilo('general')) || new Date(0).toISOString();
  const { count: nGeneral } = await sb.from('mensajes').select('*', { count: 'exact', head: true })
    .is('conversacion_con', null).gt('created_at', vistoGeneral).neq('usuario_id', profile.id);
  chatNoLeidosPorHilo.general = nGeneral || 0;

  if (profile.rol === 'admin') {
    await cargarVendedores();
    for (const v of vendedoresCache) {
      const visto = localStorage.getItem(claveVistoHilo(v.id)) || new Date(0).toISOString();
      const { count } = await sb.from('mensajes').select('*', { count: 'exact', head: true })
        .eq('conversacion_con', v.id).gt('created_at', visto).neq('usuario_id', profile.id);
      chatNoLeidosPorHilo[v.id] = count || 0;
    }
  } else {
    const visto = localStorage.getItem(claveVistoHilo(profile.id)) || new Date(0).toISOString();
    const { count } = await sb.from('mensajes').select('*', { count: 'exact', head: true })
      .eq('conversacion_con', profile.id).gt('created_at', visto).neq('usuario_id', profile.id);
    chatNoLeidosPorHilo[profile.id] = count || 0;
  }
  actualizarBadgeChat();

  if (canalChatGlobal) sb.removeChannel(canalChatGlobal);
  canalChatGlobal = sb.channel('mensajes-global')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, (payload) => {
      const m = payload.new;
      if (m.usuario_id === profile.id) return; // el propio ya se agrega al enviar
      if (!esMensajeRelevante(m)) return;

      const hilo = hiloDeMensaje(m);
      const hiloAbierto = chatModo === 'general' ? 'general' : (profile.rol === 'admin' ? chatHiloVendedorId : profile.id);
      const viendoEsteHilo = vistaActual === 'chat' && hilo === hiloAbierto;

      if (viendoEsteHilo) {
        agregarMensajeAlDOM(m);
        const c = $('#chat-mensajes');
        if (c) c.scrollTop = c.scrollHeight;
        marcarHiloVisto(hilo);
      } else {
        chatNoLeidosPorHilo[hilo] = (chatNoLeidosPorHilo[hilo] || 0) + 1;
        actualizarBadgeChat();
        if (vistaActual === 'chat' && chatModo === 'individual' && profile.rol === 'admin' && !chatHiloVendedorId) {
          renderListaVendedoresChat();
        }
      }
      sonarNotificacion();
    })
    .subscribe();
}

async function renderChat() {
  const el = $('#view-chat');
  const soyAdmin = profile.rol === 'admin';
  el.innerHTML = `
    <div class="section-head">
      <div><h2>Chat</h2><p class="sub">${soyAdmin ? 'Chat general del equipo y conversaciones individuales' : 'Chat general y conversación privada con administración'}</p></div>
    </div>
    <div class="tabs" id="chat-tabs">
      <button class="tab-btn ${chatModo === 'general' ? 'active' : ''}" data-modo="general">General</button>
      <button class="tab-btn ${chatModo === 'individual' ? 'active' : ''}" data-modo="individual">${soyAdmin ? 'Individuales' : 'Con administración'}</button>
    </div>
    <div id="chat-cuerpo"></div>
  `;

  $$('#chat-tabs .tab-btn').forEach(btn => btn.addEventListener('click', () => {
    chatModo = btn.dataset.modo;
    if (chatModo === 'general') chatHiloVendedorId = null;
    renderChatCuerpo();
  }));

  await renderChatCuerpo();
}

async function renderChatCuerpo() {
  $$('#chat-tabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.modo === chatModo));

  if (chatModo === 'individual' && profile.rol === 'admin' && !chatHiloVendedorId) {
    await renderListaVendedoresChat();
    return;
  }
  const hilo = chatModo === 'general' ? 'general' : (profile.rol === 'admin' ? chatHiloVendedorId : profile.id);
  await renderHiloChat(hilo);
}

async function renderListaVendedoresChat() {
  const cont = $('#chat-cuerpo');
  await cargarVendedores();
  if (vendedoresCache.length === 0) {
    cont.innerHTML = `<div class="empty-state">Todavía no hay vendedores registrados.</div>`;
    return;
  }
  cont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Vendedor</th><th></th></tr></thead>
    <tbody>
      ${vendedoresCache.map(v => {
        const n = chatNoLeidosPorHilo[v.id] || 0;
        return `<tr class="chat-vendedor-row" data-id="${v.id}" style="cursor:pointer">
          <td>${escapeHtml(v.nombre || v.usuario)}</td>
          <td style="text-align:right">${n > 0 ? `<span class="badge badge-pendiente">${n > 9 ? '9+' : n}</span>` : '<span style="color:var(--text-faint)">Abrir →</span>'}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;

  cont.querySelectorAll('.chat-vendedor-row').forEach(row => {
    row.addEventListener('click', () => { chatHiloVendedorId = row.dataset.id; renderChatCuerpo(); });
  });
}

async function renderHiloChat(hilo) {
  const cont = $('#chat-cuerpo');
  const volverBtn = (chatModo === 'individual' && profile.rol === 'admin')
    ? `<button class="btn btn-secondary btn-sm" id="chat-volver-lista" style="margin-bottom:10px">← Vendedores</button>`
    : '';
  const tituloHilo = (chatModo === 'individual' && profile.rol === 'admin')
    ? `<p style="color:var(--text-dim);font-size:13.5px;margin:-4px 0 10px">Con ${escapeHtml(vendedoresCache.find(v => v.id === hilo)?.nombre || 'vendedor')}</p>`
    : '';

  cont.innerHTML = `
    ${volverBtn}
    ${tituloHilo}
    <div class="chat-box">
      <div class="chat-mensajes" id="chat-mensajes"><div class="empty-state">Cargando…</div></div>
      <div class="chat-preview-img" id="chat-preview-img" hidden>
        <img id="chat-preview-img-el" />
        <button id="chat-quitar-img" title="Quitar foto">✕</button>
      </div>
      <div class="chat-input-row">
        <label class="icon-btn" id="chat-adjuntar" title="Adjuntar foto">📷<input type="file" id="chat-file" accept="image/*" style="display:none" /></label>
        <input type="text" id="chat-texto" placeholder="Escribí un mensaje…" />
        <button class="btn btn-primary btn-sm" id="chat-enviar">Enviar</button>
      </div>
    </div>
  `;

  $('#chat-volver-lista')?.addEventListener('click', () => { chatHiloVendedorId = null; renderChatCuerpo(); });

  let query = sb.from('mensajes').select('*').order('created_at', { ascending: true }).limit(200);
  query = hilo === 'general' ? query.is('conversacion_con', null) : query.eq('conversacion_con', hilo);
  const { data, error } = await query;

  const msgCont = $('#chat-mensajes');
  chatImagenPendiente = null;

  if (error) { msgCont.innerHTML = `<div class="empty-state">No se pudo cargar el chat.</div>`; }
  else {
    msgCont.innerHTML = data.length === 0 ? `<div class="empty-state">Todavía no hay mensajes. ¡Escribí el primero!</div>` : '';
    data.forEach(m => agregarMensajeAlDOM(m));
    msgCont.scrollTop = msgCont.scrollHeight;
  }

  $('#chat-file').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    try {
      chatImagenPendiente = await fileToResizedBase64(archivo, 800, 0.8);
      $('#chat-preview-img-el').src = chatImagenPendiente;
      $('#chat-preview-img').hidden = false;
    } catch (err) { toast('No se pudo procesar la imagen', 'error'); }
  });
  $('#chat-quitar-img').addEventListener('click', () => {
    chatImagenPendiente = null;
    $('#chat-file').value = '';
    $('#chat-preview-img').hidden = true;
  });
  $('#chat-enviar').addEventListener('click', () => enviarMensajeChat(hilo));
  $('#chat-texto').addEventListener('keydown', (e) => { if (e.key === 'Enter') enviarMensajeChat(hilo); });

  marcarHiloVisto(hilo);
}

function agregarMensajeAlDOM(m) {
  const cont = $('#chat-mensajes');
  if (!cont) return;
  if (cont.querySelector('.empty-state')) cont.innerHTML = '';
  const propio = m.usuario_id === profile.id;
  const hora = new Date(m.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = `chat-msg ${propio ? 'propio' : ''}`;
  div.innerHTML = `
    ${!propio ? `<div class="chat-msg-remitente">${escapeHtml(m.nombre_remitente || 'Usuario')} ${m.rol_remitente === 'admin' ? '· Admin' : ''}</div>` : ''}
    <div class="chat-msg-bubble">
      ${m.imagen_base64 ? `<img src="${m.imagen_base64}" class="chat-msg-img" />` : ''}
      ${m.texto ? `<div class="chat-msg-texto">${escapeHtml(m.texto)}</div>` : ''}
      <div class="chat-msg-hora">${hora}</div>
    </div>
  `;
  cont.appendChild(div);
}

async function enviarMensajeChat(hilo) {
  const input = $('#chat-texto');
  const texto = input.value.trim();
  if (!texto && !chatImagenPendiente) return;

  const btn = $('#chat-enviar');
  btn.disabled = true;
  const payload = {
    usuario_id: profile.id,
    nombre_remitente: profile.nombre || profile.usuario,
    rol_remitente: profile.rol,
    texto: texto || null,
    imagen_base64: chatImagenPendiente || null,
    conversacion_con: hilo === 'general' ? null : hilo
  };
  const { data, error } = await sb.from('mensajes').insert(payload).select().single();
  btn.disabled = false;
  if (error) { toast('Error al enviar: ' + error.message, 'error'); return; }

  agregarMensajeAlDOM(data);
  const cont = $('#chat-mensajes');
  if (cont) cont.scrollTop = cont.scrollHeight;

  input.value = '';
  chatImagenPendiente = null;
  $('#chat-file').value = '';
  $('#chat-preview-img').hidden = true;
}

// ============================================================
// MÓDULO: COMPROBANTES DE PAGO
// ============================================================
let comprobantesCache = [];
let comprobanteBusqueda = '';

async function cargarComprobantes() {
  const { data } = await sb.from('comprobantes').select('*').order('numero', { ascending: false });
  comprobantesCache = data || [];
}

// Convierte un monto a letras, formato boliviano: "CINCO MIL NOVECIENTOS SESENTA Y DOS 00/100 BOLIVIANOS"
function numeroALetras(monto) {
  const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const DIEZ_A_DIECINUEVE = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  function tresDigitos(n) {
    n = Number(n);
    if (n === 0) return '';
    if (n === 100) return 'CIEN';
    let partes = [];
    const c = Math.floor(n / 100), d = Math.floor((n % 100) / 10), u = n % 10;
    if (c > 0) partes.push(CENTENAS[c]);
    if (d === 1) partes.push(DIEZ_A_DIECINUEVE[u]);
    else if (d === 2 && u > 0) partes.push('VEINTI' + UNIDADES[u].toLowerCase().replace(/^\w/, m => m).toUpperCase());
    else {
      if (d > 0) partes.push(DECENAS[d]);
      if (u > 0) partes.push((d > 0 && d !== 2 ? 'Y ' : '') + UNIDADES[u]);
    }
    return partes.join(' ').trim();
  }

  function entero(n) {
    n = Math.floor(n);
    if (n === 0) return 'CERO';
    let partes = [];
    const millones = Math.floor(n / 1000000);
    const miles = Math.floor((n % 1000000) / 1000);
    const resto = n % 1000;
    if (millones > 0) partes.push(millones === 1 ? 'UN MILLÓN' : tresDigitos(millones) + ' MILLONES');
    if (miles > 0) partes.push(miles === 1 ? 'MIL' : tresDigitos(miles) + ' MIL');
    if (resto > 0) partes.push(tresDigitos(resto));
    return partes.join(' ').trim();
  }

  const centavos = Math.round((Number(monto) - Math.floor(Number(monto))) * 100);
  return `${entero(monto)} ${String(centavos).padStart(2, '0')}/100 BOLIVIANOS`;
}

async function renderComprobantes() {
  await cargarComprobantes();
  const el = $('#view-comprobantes');
  el.innerHTML = `
    <div class="section-head">
      <div><h2>Comprobantes</h2><p class="sub">Historial de impresión — recibos de pago</p></div>
      ${profile.rol === 'admin' ? `<button class="btn btn-primary" id="btn-nuevo-comprobante">+ Nuevo comprobante</button>` : ''}
    </div>
    <div class="field" style="margin-bottom:14px"><input id="comp-buscar" placeholder="🔍 Buscar por cliente o N°…" value="${escapeHtml(comprobanteBusqueda)}" /></div>
    <div id="comp-lista"></div>
  `;
  if (profile.rol === 'admin') $('#btn-nuevo-comprobante').addEventListener('click', () => abrirFormComprobante());
  $('#comp-buscar').addEventListener('input', (e) => { comprobanteBusqueda = e.target.value; renderListaComprobantes(); });
  renderListaComprobantes();
}

function renderListaComprobantes() {
  const cont = $('#comp-lista');
  const q = comprobanteBusqueda.trim().toLowerCase();
  let items = comprobantesCache;
  if (q) items = items.filter(c => c.cliente_nombre.toLowerCase().includes(q) || String(c.numero).includes(q));

  if (items.length === 0) { cont.innerHTML = `<div class="empty-state">No hay comprobantes para mostrar.</div>`; return; }

  cont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>N°</th><th>Cliente</th><th>Monto</th><th>Forma de pago</th><th>Fecha</th><th>Cajero</th><th>Acciones</th></tr></thead>
    <tbody>
      ${items.map(c => `
        <tr>
          <td>#${String(c.numero).padStart(5, '0')}</td>
          <td>${escapeHtml(c.cliente_nombre)}</td>
          <td>${money(c.monto_total)}</td>
          <td style="text-transform:capitalize">${c.forma_pago}</td>
          <td>${fecha(c.created_at)}</td>
          <td>${escapeHtml(c.cajero_nombre || '—')}</td>
          <td><div class="row-actions">
            <button class="icon-btn" data-act="previa" data-id="${c.id}" title="Vista previa">👁</button>
            <button class="icon-btn" data-act="pdf" data-id="${c.id}" title="Descargar PDF">⬇</button>
            <button class="icon-btn" data-act="wa" data-id="${c.id}" title="WhatsApp">📷</button>
            ${profile.rol === 'admin' ? `<button class="icon-btn" data-act="eliminar" data-id="${c.id}" title="Eliminar">🗑</button>` : ''}
          </div></td>
        </tr>
      `).join('')}
    </tbody>
  </table></div>`;

  cont.querySelectorAll('[data-act]').forEach(btn => {
    const c = items.find(x => x.id === btn.dataset.id);
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (act === 'previa') abrirVistaPreviaComprobante(c);
      if (act === 'pdf') generarPdfComprobante(c);
      if (act === 'wa') compartirImagenComprobanteWhatsapp(c);
      if (act === 'eliminar') eliminarRegistro('comprobantes', c.id, renderComprobantes);
    });
  });
}

function abrirFormComprobante() {
  const numeroSiguiente = comprobantesCache.length > 0 ? Math.max(...comprobantesCache.map(c => c.numero)) + 1 : 1;
  openModal(`
    <div class="sheet-head"><h3>Nuevo comprobante de pago</h3><button class="sheet-close" id="sheet-close">✕</button></div>
    <div class="grid-2">
      <div class="field"><label>N° comprobante</label><input value="#${String(numeroSiguiente).padStart(5, '0')}" disabled /></div>
      <div class="field"><label>Fecha</label><input type="date" id="f-comp-fecha" value="${new Date().toISOString().slice(0, 10)}" /></div>
    </div>
    <div class="field" style="margin-top:10px"><label>Recibimos de (cliente) *</label><input id="f-comp-cliente" list="clientes-datalist" required /></div>
    <datalist id="clientes-datalist">${clientesCache.map(c => `<option value="${escapeHtml(c.nombre)}"></option>`).join('')}</datalist>
    <div class="field" style="margin-top:10px"><label>N° de venta (opcional)</label><input id="f-comp-venta" placeholder="Ej: 235-5-2026" /></div>
    <div class="field" style="margin-top:10px"><label>Forma de pago</label>
      <select id="f-comp-forma">
        <option value="efectivo">Efectivo</option>
        <option value="transferencia">Transferencia</option>
        <option value="qr">QR</option>
        <option value="mixto">Mixto (Efectivo + Transferencia)</option>
      </select>
    </div>
    <div class="field" style="margin-top:10px"><label>Total a pagar (Bs) *</label><input type="number" id="f-comp-total" min="0" step="0.01" required /></div>
    <div class="grid-2" style="margin-top:10px">
      <div class="field"><label>Recibido en efectivo (Bs)</label><input type="number" id="f-comp-efectivo" min="0" step="0.01" value="0" /></div>
      <div class="field"><label>Recibido por transferencia (Bs)</label><input type="number" id="f-comp-transferido" min="0" step="0.01" value="0" /></div>
    </div>
    <div class="grid-2" id="comp-datos-transferencia" style="margin-top:10px; display:none">
      <div class="field"><label>Banco</label><input id="f-comp-banco" /></div>
      <div class="field"><label>Cuenta destino</label><input id="f-comp-cuenta" /></div>
    </div>
    <div class="field" style="margin-top:12px">
      <label>Firma del interesado</label>
      <div class="firma-box">
        <canvas id="firma-canvas" class="firma-canvas"></canvas>
        <button type="button" class="firma-borrar" id="btn-borrar-firma" title="Borrar firma">🗑</button>
      </div>
      <p style="font-size:11px;color:var(--text-faint);margin-top:4px">Dibujá la firma con el dedo o el mouse.</p>
    </div>
    <p style="font-size:12px;color:var(--text-dim);margin-top:10px">Saldo pendiente: <strong id="comp-saldo-preview" style="color:var(--accent)">Bs 0,00</strong></p>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-primary" id="btn-guardar">💾 Generar comprobante</button>
    </div>
  `);
  $('#sheet-close').addEventListener('click', closeModal);
  $('#btn-cancelar').addEventListener('click', closeModal);

  const firmaCanvas = $('#firma-canvas');
  const firmaCtx = firmaCanvas.getContext('2d');
  function ajustarTamanoCanvas() {
    const rect = firmaCanvas.getBoundingClientRect();
    firmaCanvas.width = rect.width * 2;
    firmaCanvas.height = rect.height * 2;
    firmaCtx.scale(2, 2);
    firmaCtx.strokeStyle = '#14161c';
    firmaCtx.lineWidth = 2;
    firmaCtx.lineCap = 'round';
    firmaCtx.lineJoin = 'round';
  }
  setTimeout(ajustarTamanoCanvas, 0);

  let dibujando = false, huboTrazo = false;
  function posDesdeEvento(e) {
    const rect = firmaCanvas.getBoundingClientRect();
    const punto = e.touches ? e.touches[0] : e;
    return { x: punto.clientX - rect.left, y: punto.clientY - rect.top };
  }
  function empezarTrazo(e) {
    e.preventDefault();
    dibujando = true; huboTrazo = true;
    const { x, y } = posDesdeEvento(e);
    firmaCtx.beginPath();
    firmaCtx.moveTo(x, y);
  }
  function seguirTrazo(e) {
    if (!dibujando) return;
    e.preventDefault();
    const { x, y } = posDesdeEvento(e);
    firmaCtx.lineTo(x, y);
    firmaCtx.stroke();
  }
  function terminarTrazo() { dibujando = false; }

  firmaCanvas.addEventListener('mousedown', empezarTrazo);
  firmaCanvas.addEventListener('mousemove', seguirTrazo);
  window.addEventListener('mouseup', terminarTrazo);
  firmaCanvas.addEventListener('touchstart', empezarTrazo, { passive: false });
  firmaCanvas.addEventListener('touchmove', seguirTrazo, { passive: false });
  firmaCanvas.addEventListener('touchend', terminarTrazo);

  $('#btn-borrar-firma').addEventListener('click', () => {
    firmaCtx.clearRect(0, 0, firmaCanvas.width, firmaCanvas.height);
    huboTrazo = false;
  });

  function actualizarVisibilidadForma() {
    const forma = $('#f-comp-forma').value;
    $('#comp-datos-transferencia').style.display = (forma === 'transferencia' || forma === 'mixto') ? '' : 'none';
    $('#f-comp-efectivo').closest('.field').style.display = (forma === 'transferencia' || forma === 'qr') ? 'none' : '';
    $('#f-comp-transferido').closest('.field').style.display = (forma === 'efectivo') ? 'none' : '';
  }
  function actualizarSaldo() {
    const total = Number($('#f-comp-total').value || 0);
    const ef = Number($('#f-comp-efectivo').value || 0);
    const tr = Number($('#f-comp-transferido').value || 0);
    const saldo = Math.max(0, total - ef - tr);
    $('#comp-saldo-preview').textContent = money(saldo);
  }
  $('#f-comp-forma').addEventListener('change', () => { actualizarVisibilidadForma(); actualizarSaldo(); });
  $('#f-comp-total').addEventListener('input', actualizarSaldo);
  $('#f-comp-efectivo').addEventListener('input', actualizarSaldo);
  $('#f-comp-transferido').addEventListener('input', actualizarSaldo);
  actualizarVisibilidadForma();

  $('#btn-guardar').addEventListener('click', async () => {
    const cliente_nombre = $('#f-comp-cliente').value.trim();
    const monto_total = Number($('#f-comp-total').value || 0);
    if (!cliente_nombre || monto_total <= 0) { toast('Completá el cliente y el total a pagar', 'error'); return; }

    const { data: sesionesAbiertas } = await sb.from('caja_sesiones').select('*').eq('usuario_id', profile.id).eq('estado', 'abierta').limit(1);
    const sesionAbierta = sesionesAbiertas && sesionesAbiertas[0];
    if (!sesionAbierta) {
      toast('Primero abrí tu caja en Caja → Mi caja para poder generar el comprobante', 'error');
      return;
    }

    const forma_pago = $('#f-comp-forma').value;
    const monto_efectivo = (forma_pago === 'transferencia' || forma_pago === 'qr') ? 0 : Number($('#f-comp-efectivo').value || 0);
    const monto_transferido = forma_pago === 'efectivo' ? 0 : Number($('#f-comp-transferido').value || 0);
    const saldo_pendiente = Math.max(0, monto_total - monto_efectivo - monto_transferido);
    const montoRecibido = monto_efectivo + monto_transferido;

    // Movimiento de caja enlazado (solo por lo efectivamente recibido, no el saldo pendiente)
    const { data: movimiento, error: eMov } = await sb.from('caja_movimientos').insert({
      sesion_id: sesionAbierta.id,
      tipo: 'ingreso',
      concepto: `Comprobante — ${cliente_nombre}`,
      monto: montoRecibido > 0 ? montoRecibido : monto_total,
      metodo_pago: forma_pago === 'mixto' ? 'efectivo' : forma_pago,
      usuario_id: profile.id
    }).select().single();
    if (eMov) { toast('Error al registrar el movimiento de caja: ' + eMov.message, 'error'); return; }

    const payload = {
      fecha: $('#f-comp-fecha').value,
      cliente_nombre,
      venta_numero: $('#f-comp-venta').value.trim() || null,
      forma_pago,
      monto_total, monto_efectivo, monto_transferido, saldo_pendiente,
      banco: (forma_pago !== 'efectivo') ? $('#f-comp-banco').value.trim() : null,
      cuenta_destino: (forma_pago !== 'efectivo') ? $('#f-comp-cuenta').value.trim() : null,
      cajero_id: profile.id,
      cajero_nombre: profile.nombre || profile.usuario,
      caja_movimiento_id: movimiento.id,
      firma_base64: huboTrazo ? firmaCanvas.toDataURL('image/png') : null
    };

    const { data, error } = await sb.from('comprobantes').insert(payload).select().single();
    if (error) { toast('Error al generar: ' + error.message, 'error'); return; }
    await sb.from('caja_movimientos').update({ comprobante_id: data.id }).eq('id', movimiento.id);

    await guardarClienteSiNoExiste(cliente_nombre, '', '', '');
    toast('Comprobante generado y enlazado a tu caja');
    closeModal();
    await cargarComprobantes();
    switchView('comprobantes');
    abrirVistaPreviaComprobante(data);
  });
}

function abrirVistaPreviaComprobante(c) {
  const numeroFmt = `N° ${String(c.numero).padStart(5, '0')}`;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="docprev-overlay" id="docprev-overlay">
      <div class="docprev-topbar">
        <span>Vista previa — Comprobante ${numeroFmt}</span>
        <div class="docprev-actions">
          <button class="docprev-btn docprev-btn-pdf" id="docprev-pdf">⬇ Descargar PDF</button>
          <button class="docprev-btn docprev-btn-wa" id="docprev-wa">📷 WhatsApp</button>
          <button class="docprev-btn docprev-btn-x" id="docprev-close">✕</button>
        </div>
      </div>
      <div class="docprev-scroll">
        <div class="docprev-paper" id="docprev-paper-el">
          ${comprobanteHtml(c)}
        </div>
      </div>
    </div>
  `);
  document.getElementById('docprev-close').addEventListener('click', () => document.getElementById('docprev-overlay').remove());
  document.getElementById('docprev-pdf').addEventListener('click', () => generarPdfComprobante(c));
  document.getElementById('docprev-wa').addEventListener('click', () => compartirImagenComprobanteWhatsapp(c));
}

function comprobanteHtml(c) {
  const esMixto = c.forma_pago === 'mixto';
  const esTransferencia = c.forma_pago === 'transferencia';
  const esQr = c.forma_pago === 'qr';
  const tituloForma = esMixto ? 'MIXTO (Efectivo + Transferencia)' : esTransferencia ? 'TRANSFERENCIA' : esQr ? 'QR' : 'EFECTIVO';
  const etiquetaNoEfectivo = esQr ? 'Pagado por QR:' : 'Transferido:';
  return `
    <div class="docprev-header">
      <div class="docprev-brand">
        <div class="docprev-logo">BM</div>
        <div>
          <div class="docprev-brand-name">ELECTRODOMÉSTICOS BM</div>
          <div class="docprev-brand-sub">Bolivia</div>
        </div>
      </div>
      <div class="docprev-doc-info">
        <div class="docprev-doc-title">COMPROBANTE DE INGRESO</div>
        <div class="docprev-doc-num">N° ${String(c.numero).padStart(5, '0')}</div>
        <div class="docprev-doc-date">${fechaHora(c.created_at)}</div>
      </div>
    </div>
    <div class="docprev-divider"></div>
    <div class="docprev-fields">
      <div class="docprev-field"><span class="docprev-flabel">Recibimos de:</span> ${escapeHtml(c.cliente_nombre)}</div>
      ${c.venta_numero ? `<div class="docprev-field"><span class="docprev-flabel">Vta N°:</span> ${escapeHtml(c.venta_numero)}</div>` : ''}
    </div>
    <div class="comp-suma-box">
      <div class="comp-suma-label">La suma de</div>
      <div class="comp-suma-texto">${numeroALetras(c.monto_total)}</div>
    </div>
    <div class="comp-detalle">
      <div class="comp-detalle-titulo">${tituloForma}</div>
      <div class="comp-linea"><span>Total a pagar:</span><strong>${money(c.monto_total)}</strong></div>
      ${c.forma_pago !== 'transferencia' && c.forma_pago !== 'qr' ? `<div class="comp-linea"><span>En efectivo:</span><strong>${money(c.monto_efectivo)}</strong></div>` : ''}
      ${c.forma_pago !== 'efectivo' ? `<div class="comp-linea"><span>${etiquetaNoEfectivo}</span><strong>${money(c.monto_transferido)}</strong></div>` : ''}
      ${c.saldo_pendiente > 0 ? `<div class="comp-linea comp-saldo"><span>Saldo pendiente:</span><strong>${money(c.saldo_pendiente)}</strong></div>` : ''}
    </div>
    ${(c.forma_pago !== 'efectivo' && (c.banco || c.cuenta_destino)) ? `
      <div class="comp-detalle" style="margin-top:10px">
        <div class="comp-detalle-titulo">Datos de transferencia</div>
        ${c.banco ? `<div class="comp-linea"><span>Banco:</span><strong>${escapeHtml(c.banco)}</strong></div>` : ''}
        ${c.cuenta_destino ? `<div class="comp-linea"><span>Cuenta destino:</span><strong>${escapeHtml(c.cuenta_destino)}</strong></div>` : ''}
        <div class="comp-linea"><span>Fecha:</span><strong>${fecha(c.fecha || c.created_at)}</strong></div>
      </div>
    ` : ''}
    <div class="comp-firma-row">
      <div class="comp-firma">
        ${c.firma_base64 ? `<img src="${c.firma_base64}" class="comp-firma-img" />` : ''}
        <div class="comp-firma-linea"></div>Firma del interesado
      </div>
      <div class="comp-firma"><div class="comp-firma-linea"></div>Cajero<br><strong>${escapeHtml((c.cajero_nombre || '').toUpperCase())}</strong></div>
    </div>
    <div class="docprev-gracias">Señor cliente mantenga este recibo como constancia de su pago. Para reclamos, comuníquese con nosotros.</div>
  `;
}

function generarPdfComprobante(c) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  pdf.setFontSize(16); pdf.setFont(undefined, 'bold'); pdf.setTextColor(20, 20, 20);
  pdf.text('Electrodomésticos BM', 14, 18);
  pdf.setFontSize(9); pdf.setFont(undefined, 'normal'); pdf.setTextColor(107, 114, 128);
  pdf.text('Bolivia', 14, 24);

  pdf.setFontSize(13); pdf.setFont(undefined, 'bold'); pdf.setTextColor(220, 38, 38);
  pdf.text('COMPROBANTE DE INGRESO', 196, 18, { align: 'right' });
  pdf.setFontSize(11);
  pdf.text(`N° ${String(c.numero).padStart(5, '0')}`, 196, 25, { align: 'right' });
  pdf.setFontSize(9); pdf.setFont(undefined, 'normal'); pdf.setTextColor(107, 114, 128);
  pdf.text(fechaHora(c.created_at), 196, 30, { align: 'right' });

  pdf.setDrawColor(20, 20, 20); pdf.line(14, 34, 196, 34);

  pdf.setFontSize(10); pdf.setTextColor(20, 20, 20);
  pdf.text(`Recibimos de: ${c.cliente_nombre}`, 14, 43);
  if (c.venta_numero) pdf.text(`Vta N°: ${c.venta_numero}`, 14, 49);

  let y = c.venta_numero ? 58 : 52;
  pdf.setFillColor(243, 244, 246);
  pdf.rect(14, y, 182, 20, 'F');
  pdf.setFontSize(8.5); pdf.setTextColor(107, 114, 128);
  pdf.text('La suma de', 18, y + 7);
  pdf.setFontSize(10.5); pdf.setFont(undefined, 'bold'); pdf.setTextColor(20, 20, 20);
  pdf.text(numeroALetras(c.monto_total), 18, y + 14, { maxWidth: 174 });
  y += 28;

  pdf.setFont(undefined, 'bold'); pdf.setFontSize(10);
  const tituloFormaPdf = c.forma_pago === 'mixto' ? 'MIXTO (Efectivo + Transferencia)' : c.forma_pago === 'transferencia' ? 'TRANSFERENCIA' : c.forma_pago === 'qr' ? 'QR' : 'EFECTIVO';
  pdf.text(tituloFormaPdf, 14, y);
  y += 7;
  pdf.setFont(undefined, 'normal'); pdf.setFontSize(9.5);
  pdf.text(`Total a pagar: ${money(c.monto_total)}`, 14, y); y += 6;
  if (c.forma_pago !== 'transferencia' && c.forma_pago !== 'qr') { pdf.text(`En efectivo: ${money(c.monto_efectivo)}`, 14, y); y += 6; }
  if (c.forma_pago !== 'efectivo') { pdf.text(`${c.forma_pago === 'qr' ? 'Pagado por QR' : 'Transferido'}: ${money(c.monto_transferido)}`, 14, y); y += 6; }
  if (c.saldo_pendiente > 0) { pdf.setTextColor(220, 38, 38); pdf.text(`Saldo pendiente: ${money(c.saldo_pendiente)}`, 14, y); pdf.setTextColor(20, 20, 20); y += 6; }

  if (c.forma_pago !== 'efectivo' && (c.banco || c.cuenta_destino)) {
    y += 4;
    pdf.setFont(undefined, 'bold'); pdf.text('Datos de transferencia', 14, y); y += 6;
    pdf.setFont(undefined, 'normal');
    if (c.banco) { pdf.text(`Banco: ${c.banco}`, 14, y); y += 6; }
    if (c.cuenta_destino) { pdf.text(`Cuenta destino: ${c.cuenta_destino}`, 14, y); y += 6; }
  }

  y += 20;
  if (c.firma_base64) {
    try { pdf.addImage(c.firma_base64, 'PNG', 25, y - 16, 50, 16); } catch (e) { /* firma inválida, seguimos sin ella */ }
  }
  pdf.setDrawColor(150, 150, 150);
  pdf.line(20, y, 85, y); pdf.line(125, y, 190, y);
  pdf.setFontSize(8.5);
  pdf.text('Firma del interesado', 20, y + 6);
  pdf.text('Cajero', 125, y + 6);
  pdf.setFont(undefined, 'bold');
  pdf.text((c.cajero_nombre || '').toUpperCase(), 125, y + 11);

  pdf.setFont(undefined, 'italic'); pdf.setFontSize(8.5); pdf.setTextColor(31, 41, 55);
  pdf.text('Señor cliente mantenga este recibo como constancia de su pago.', 105, y + 24, { align: 'center' });

  pdf.save(`Comprobante_${String(c.numero).padStart(5, '0')}_${c.cliente_nombre.replace(/\s+/g, '_')}.pdf`);
}

async function compartirImagenComprobanteWhatsapp(c) {
  const yaAbierto = document.getElementById('docprev-overlay');
  if (yaAbierto) {
    await generarYCompartirComprobanteImagen(c);
    return;
  }
  abrirVistaPreviaComprobante(c);
  setTimeout(() => generarYCompartirComprobanteImagen(c), 250);
}

async function generarYCompartirComprobanteImagen(c) {
  const elPapel = document.getElementById('docprev-paper-el');
  if (!elPapel || typeof html2canvas === 'undefined') return;
  try {
    const canvas = await html2canvas(elPapel, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const texto = `*Comprobante de pago N° ${String(c.numero).padStart(5, '0')} — Electrodomésticos BM*\nRecibimos de: ${c.cliente_nombre}\nMonto: ${money(c.monto_total)}`;
    if (blob) {
      const file = new File([blob], `comprobante_${c.numero}.png`, { type: 'image/png' });
      await compartirArchivosWhatsapp({ files: [file], texto, titulo: 'Comprobante de pago' });
    }
  } catch (e) {
    toast('No se pudo generar la imagen del comprobante', 'error');
  }
}

// ------------------------------------------------------------
// REDES SOCIALES / CONTACTO DE LA TIENDA (para el catálogo público)
// ------------------------------------------------------------
async function abrirFormRedesSociales() {
  const { data: config } = await sb.from('configuracion').select('*').eq('id', 1).single();
  openModal(`
    <div class="sheet-head"><h3>Redes sociales y contacto</h3><button class="sheet-close" id="sheet-close">✕</button></div>
    <p style="color:var(--text-dim);font-size:13px;margin-top:-6px">Esto se muestra en el catálogo público para tus clientes.</p>
    <div class="field" style="margin-top:12px"><label>WhatsApp de la tienda</label><input id="f-red-whatsapp" placeholder="Ej: 59178704870" value="${escapeHtml(config?.whatsapp_numero || '')}" /></div>
    <div class="field" style="margin-top:10px"><label>Facebook (link completo)</label><input id="f-red-facebook" placeholder="https://facebook.com/..." value="${escapeHtml(config?.facebook_url || '')}" /></div>
    <div class="field" style="margin-top:10px"><label>TikTok (link completo)</label><input id="f-red-tiktok" placeholder="https://tiktok.com/@..." value="${escapeHtml(config?.tiktok_url || '')}" /></div>
    <p style="color:var(--text-faint);font-size:11.5px;margin-top:8px">Dejá un campo vacío para que ese ícono no se muestre en el catálogo.</p>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-primary" id="btn-guardar">💾 Guardar</button>
    </div>
  `);
  $('#sheet-close').addEventListener('click', closeModal);
  $('#btn-cancelar').addEventListener('click', closeModal);
  $('#btn-guardar').addEventListener('click', async () => {
    const payload = {
      whatsapp_numero: $('#f-red-whatsapp').value.trim(),
      facebook_url: $('#f-red-facebook').value.trim(),
      tiktok_url: $('#f-red-tiktok').value.trim()
    };
    const { error } = await sb.from('configuracion').update(payload).eq('id', 1);
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    toast('Datos de contacto guardados');
    closeModal();
  });
}

// ============================================================
// MÓDULO: USUARIOS (solo admin)
// ============================================================
async function renderUsuarios() {
  const el = $('#view-usuarios');
  el.innerHTML = `
    <div class="section-head">
      <div><h2>Usuarios</h2><p class="sub">Gestión de accesos al sistema</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" id="btn-redes-sociales">🔗 Redes sociales</button>
        <button class="btn btn-primary" id="btn-nuevo-usuario">+ Nuevo usuario</button>
      </div>
    </div>
    <div id="usuarios-table"></div>
  `;
  $('#btn-nuevo-usuario').addEventListener('click', () => abrirFormUsuario());
  $('#btn-redes-sociales').addEventListener('click', abrirFormRedesSociales);

  const { data, error } = await sb.from('profiles').select('*').order('created_at');
  const cont = $('#usuarios-table');
  if (error || !data) { cont.innerHTML = `<div class="empty-state">Error cargando usuarios.</div>`; return; }

  cont.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Usuario</th><th>Nombre</th><th>Teléfono</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
    <tbody>
      ${data.map(u => `
        <tr>
          <td>${escapeHtml(u.usuario)}</td>
          <td>${escapeHtml(u.nombre || '—')}</td>
          <td>${escapeHtml(u.telefono || '—')}</td>
          <td style="text-transform:capitalize">${u.rol}</td>
          <td><span class="badge ${u.activo ? 'badge-ok' : 'badge-rechazada'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
          <td><div class="row-actions">
            <button class="icon-btn" data-act="editar" data-id="${u.id}" title="Editar usuario">✎</button>
            ${u.id === profile.id ? `<span style="color:var(--text-faint);font-size:12px">vos</span>` : ''}
          </div></td>
        </tr>
      `).join('')}
    </tbody>
  </table></div>`;

  cont.querySelectorAll('[data-act="editar"]').forEach(btn => {
    const u = data.find(x => x.id === btn.dataset.id);
    btn.addEventListener('click', () => abrirFormUsuario(u));
  });
}

// Un solo formulario para crear y editar usuarios — solo el admin llega
// acá (la vista Usuarios entera es admin-only). Crear, cambiar rol y
// habilitar/deshabilitar quedan todos en el mismo lugar.
function abrirFormUsuario(existing) {
  const esUnoMismo = existing && existing.id === profile.id;
  let estadoActual = existing ? existing.activo : true;

  openModal(`
    <div class="sheet-head"><h3>${existing ? 'Editar usuario' : 'Nuevo usuario'}</h3><button class="sheet-close" id="sheet-close">✕</button></div>

    <div class="card-title">Datos de acceso</div>
    <div class="field"><label>Nombre de usuario (login) *</label>
      <input id="f-usuario" value="${existing ? escapeHtml(existing.usuario) : ''}" ${existing ? 'disabled' : ''} placeholder="sin espacios, ej: jperez" required />
      ${existing ? `<p style="color:var(--text-dim);font-size:13.5px;margin-top:4px">No se puede cambiar una vez creado el usuario.</p>` : ''}
    </div>
    ${!existing ? `<div class="field" style="margin-top:10px"><label>Contraseña *</label><input type="password" id="f-password" required minlength="6" /></div>` : ''}

    <div class="card-title" style="margin-top:18px">Datos personales</div>
    <div class="field"><label>Nombre completo *</label><input id="f-nombre" value="${existing ? escapeHtml(existing.nombre || '') : ''}" required /></div>
    <div class="field" style="margin-top:10px"><label>Teléfono (para el catálogo enviado a clientes)</label><input id="f-telefono" value="${existing ? escapeHtml(existing.telefono || '') : ''}" placeholder="+591 7xx xxxxx" /></div>

    ${!esUnoMismo ? `
    <div class="card-title" style="margin-top:18px">Rol</div>
    <div class="field"><select id="f-rol">
      <option value="vendedor" ${(!existing || existing.rol === 'vendedor') ? 'selected' : ''}>Vendedor / campo</option>
      <option value="admin" ${existing?.rol === 'admin' ? 'selected' : ''}>Administrador</option>
    </select></div>` : ''}

    ${existing && !esUnoMismo ? `
    <div class="card-title" style="margin-top:18px">Estado de la cuenta</div>
    <div id="estado-box" style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px">
      <div>
        <div id="estado-titulo" style="font-weight:700">${existing.activo ? 'Habilitado' : 'Deshabilitado'}</div>
        <p id="estado-sub" style="color:var(--text-dim);font-size:13.5px;margin-top:2px">${existing.activo ? 'Puede iniciar sesión normalmente.' : 'No puede iniciar sesión hasta que lo vuelvas a habilitar.'}</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" id="btn-toggle-estado" style="${existing.activo ? 'border-color:var(--danger);color:var(--danger)' : 'border-color:var(--accent);color:var(--accent)'}">${existing.activo ? 'Deshabilitar' : 'Habilitar'}</button>
    </div>` : ''}

    <div class="form-actions">
      <button class="btn btn-secondary" id="btn-cancelar">Cancelar</button>
      <button class="btn btn-primary" id="btn-guardar">💾 ${existing ? 'Guardar cambios' : 'Crear usuario'}</button>
    </div>
  `);

  $('#sheet-close').addEventListener('click', closeModal);
  $('#btn-cancelar').addEventListener('click', closeModal);

  $('#btn-toggle-estado')?.addEventListener('click', () => {
    estadoActual = !estadoActual;
    $('#btn-toggle-estado').textContent = estadoActual ? 'Deshabilitar' : 'Habilitar';
    $('#btn-toggle-estado').style.borderColor = estadoActual ? 'var(--danger)' : 'var(--accent)';
    $('#btn-toggle-estado').style.color = estadoActual ? 'var(--danger)' : 'var(--accent)';
    $('#estado-titulo').textContent = estadoActual ? 'Habilitado' : 'Deshabilitado';
    $('#estado-sub').textContent = estadoActual ? 'Puede iniciar sesión normalmente.' : 'No puede iniciar sesión hasta que lo vuelvas a habilitar.';
  });

  $('#btn-guardar').addEventListener('click', async () => {
    const nombre = $('#f-nombre').value.trim();
    const telefono = $('#f-telefono').value.trim();
    if (!nombre) { toast('Falta el nombre completo', 'error'); return; }

    if (existing) {
      const payload = { nombre, telefono };
      if (!esUnoMismo) {
        payload.rol = $('#f-rol').value;
        payload.activo = estadoActual;
      }
      const { error } = await sb.from('profiles').update(payload).eq('id', existing.id);
      if (error) { toast('Error: ' + error.message, 'error'); return; }
      toast('Usuario actualizado');
      closeModal();
      if (esUnoMismo) { profile.nombre = nombre; profile.telefono = telefono; }
      renderUsuarios();
      return;
    }

    const usuario = $('#f-usuario').value.trim();
    const password = $('#f-password').value;
    const rol = $('#f-rol').value;
    if (!usuario || password.length < 6) { toast('Completá usuario y contraseña (6+ caracteres)', 'error'); return; }

    const { error } = await sb.auth.signUp({
      email: emailFor(usuario),
      password,
      options: { data: { usuario, nombre, rol, telefono } }
    });
    if (error) { toast('Error al crear usuario: ' + error.message, 'error'); return; }

    // El signUp deja logueado al usuario nuevo — volvemos a entrar como admin
    if (adminCreds) await sb.auth.signInWithPassword({ email: emailFor(adminCreds.usuario), password: adminCreds.password });

    toast('Usuario creado correctamente');
    closeModal();
    renderUsuarios();
  });
}

// ============================================================
// VISTA PREVIA / PDF / WHATSAPP
// ============================================================
function numeroDoc(doc, prefijo) {
  return `${prefijo}-${String(doc.numero).padStart(6, '0')}`;
}

function medioPagoBoxHtml(doc) {
  const medio = mediosPagoCache.find(m => m.id === doc.medio_pago_id);
  if (!medio) return '';
  if (medio.tipo === 'qr') {
    return `
      <div class="docprev-pago-box">
        <div class="docprev-pago-titulo">📷 Pagar con QR${medio.titular ? ' — ' + escapeHtml(medio.titular) : ''}</div>
        ${medio.imagen_base64 ? `<img src="${medio.imagen_base64}" class="docprev-qr-img" />` : '<p style="font-size:11px;color:#6b7280">(sin imagen cargada)</p>'}
      </div>
    `;
  }
  return `
    <div class="docprev-pago-box">
      <div class="docprev-pago-titulo">🏦 ${escapeHtml(medio.banco || 'Transferencia bancaria')}</div>
      ${medio.titular ? `<div class="docprev-pago-linea">Titular: ${escapeHtml(medio.titular)}</div>` : ''}
      ${medio.numero_cuenta ? `<div class="docprev-pago-linea">N° de cuenta: ${escapeHtml(medio.numero_cuenta)}</div>` : ''}
      ${medio.nit_titular ? `<div class="docprev-pago-linea">NIT: ${escapeHtml(medio.nit_titular)}</div>` : ''}
    </div>
  `;
}

function abrirVistaPrevia(doc, tipoLabel, prefijo) {
  const tituloDoc = tipoLabel === 'Venta' ? 'NOTA DE VENTA' : 'COTIZACIÓN';
  const esContado = (doc.condicion_pago || 'contado') === 'contado';

  const filasItems = (doc.items || []).map(it => {
    const producto = productosCache.find(p => p.id === it.producto_id);
    const foto = producto?.imagen_base64;
    return `
    <tr>
      <td>${foto ? `<img src="${foto}" class="docprev-item-foto" />` : ''}</td>
      <td>${escapeHtml(it.descripcion)}</td>
      <td style="text-align:center">${it.cantidad}</td>
      <td style="text-align:right">${Number(it.precio_unitario).toFixed(2)}</td>
      <td style="text-align:right"><strong>${Number(it.subtotal).toFixed(2)}</strong></td>
    </tr>
  `;
  }).join('');

  const hayFotos = (doc.items || []).some(it => productosCache.find(p => p.id === it.producto_id)?.imagen_base64);

  const mostrarBtnMedioPago = tipoLabel === 'Venta' && (doc.metodo_pago === 'qr' || doc.metodo_pago === 'transferencia');

  document.body.insertAdjacentHTML('beforeend', `
    <div class="docprev-overlay" id="docprev-overlay">
      <div class="docprev-topbar">
        <span>Vista previa — ${numeroDoc(doc, prefijo)}</span>
        <div class="docprev-actions">
          <button class="docprev-btn docprev-btn-pdf" id="docprev-pdf">⬇ Descargar PDF</button>
          <button class="docprev-btn docprev-btn-wa" id="docprev-wa">📷 WhatsApp</button>
          ${hayFotos ? `<button class="docprev-btn" style="background:#0ea5e9;color:#fff" id="docprev-fotos">🖼️ Fotos artículos</button>` : ''}
          ${mostrarBtnMedioPago ? `<button class="docprev-btn" style="background:#7c3aed;color:#fff" id="docprev-mediopago">💳 Medio de pago</button>` : ''}
          <button class="docprev-btn docprev-btn-x" id="docprev-close">✕</button>
        </div>
      </div>
      <div class="docprev-scroll">
        <div class="docprev-paper" id="docprev-paper-el">
          <div class="docprev-header">
            <div class="docprev-brand">
              <div class="docprev-logo">BM</div>
              <div>
                <div class="docprev-brand-name">ELECTRODOMÉSTICOS BM</div>
                <div class="docprev-brand-sub">Bolivia</div>
              </div>
            </div>
            <div class="docprev-doc-info">
              <div class="docprev-doc-title">${tituloDoc}</div>
              <div class="docprev-doc-num">${numeroDoc(doc, prefijo)}</div>
              <div class="docprev-doc-date">${fechaHora(doc.created_at)}</div>
            </div>
          </div>
          <div class="docprev-divider"></div>
          <div class="docprev-fields">
            <div><span class="docprev-flabel">Cliente:</span> ${escapeHtml(doc.cliente_nombre)}</div>
            <div><span class="docprev-flabel">Teléfono:</span> ${escapeHtml(doc.cliente_telefono || '—')}</div>
            <div><span class="docprev-flabel">Facturar a:</span> ${escapeHtml(doc.facturar_a || '—')}</div>
            <div><span class="docprev-flabel">NIT:</span> ${escapeHtml(doc.cliente_nit || '—')}</div>
          </div>
          <table class="docprev-table">
            <thead><tr><th></th><th>Descripción</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
            <tbody>${filasItems}</tbody>
          </table>
          ${(doc.descuento_pct || doc.descuento_adicional_pct) ? `
          <div class="docprev-descuentos">
            ${doc.descuento_pct ? `<span>Descuento general: <strong>${Number(doc.descuento_pct).toFixed(2)}%</strong></span>` : ''}
            ${doc.descuento_adicional_pct ? `<span>Descuento adicional: <strong>${Number(doc.descuento_adicional_pct).toFixed(2)}%</strong></span>` : ''}
          </div>` : ''}
          <div class="docprev-bottom">
            <div class="docprev-checks">
              <span class="docprev-check">${esContado ? '☑' : '☐'} CONTADO</span>
              <span class="docprev-check">${!esContado ? '☑' : '☐'} CRÉDITO</span>
              ${!esContado && doc.cuota2_pct ? `<div class="docprev-cuotas">1ra cuota: ${(100 - Number(doc.cuota2_pct)).toFixed(0)}% al contado<br>2da cuota: ${Number(doc.cuota2_pct).toFixed(0)}% a ${doc.cuota2_dias || '—'} días</div>` : ''}
            </div>
            <div class="docprev-totalbox">
              <div class="docprev-total-label">TOTAL ${tipoLabel === 'Venta' ? 'VENTA' : 'COTIZACIÓN'}</div>
              <div class="docprev-total-val">${money(doc.total)}</div>
            </div>
          </div>
          ${medioPagoBoxHtml(doc)}
          <div class="docprev-gracias">Gracias por su compra y preferencia</div>
        </div>
      </div>
    </div>
  `);

  document.getElementById('docprev-close').addEventListener('click', () => document.getElementById('docprev-overlay').remove());
  document.getElementById('docprev-pdf').addEventListener('click', () => generarPdfDocumento(doc, tipoLabel, prefijo));
  document.getElementById('docprev-wa').addEventListener('click', () => compartirImagenDocumentoWhatsapp(doc, tipoLabel, prefijo));
  if (hayFotos) {
    document.getElementById('docprev-fotos').addEventListener('click', () => abrirGaleriaFotosItems(doc, tipoLabel, prefijo));
  }
  if (mostrarBtnMedioPago) {
    document.getElementById('docprev-mediopago').addEventListener('click', () => abrirSelectorMedioPago(doc, tipoLabel));
  }
}

function abrirGaleriaFotosItems(doc, tipoLabel, prefijo) {
  const itemsConFoto = (doc.items || []).map(it => {
    const p = productosCache.find(x => x.id === it.producto_id);
    return { descripcion: it.descripcion, precio_unitario: it.precio_unitario, imagen: p?.imagen_base64 || null };
  }).filter(it => it.imagen);

  if (itemsConFoto.length === 0) {
    toast('Ninguno de estos artículos tiene foto cargada en Inventario', 'error');
    return;
  }

  openModal(`
    <div class="sheet-head"><h3>Fotos de los artículos</h3><button class="sheet-close" id="sheet-close">✕</button></div>
    <p style="color:var(--text-dim);font-size:13px;margin-top:-6px">${numeroDoc(doc, prefijo)} — ${escapeHtml(doc.cliente_nombre)}</p>
    <div class="fotos-grid">
      ${itemsConFoto.map((it, idx) => `
        <div class="foto-card">
          <img src="${it.imagen}" />
          <div class="foto-card-desc">${escapeHtml(it.descripcion)}</div>
          <div class="foto-card-precio">${money(it.precio_unitario)}</div>
          <button class="btn btn-secondary btn-sm" data-foto-idx="${idx}">📤 Compartir</button>
        </div>
      `).join('')}
    </div>
    ${itemsConFoto.length > 1 ? `<div class="form-actions" style="margin-top:14px"><button class="btn btn-primary btn-block" id="btn-compartir-todas-fotos">📤 Compartir todas por WhatsApp</button></div>` : ''}
  `);
  $('#sheet-close').addEventListener('click', closeModal);
  $$('[data-foto-idx]').forEach(btn => {
    btn.addEventListener('click', () => compartirFotosItems([itemsConFoto[Number(btn.dataset.fotoIdx)]], doc, prefijo));
  });
  $('#btn-compartir-todas-fotos')?.addEventListener('click', () => compartirFotosItems(itemsConFoto, doc, prefijo));
}

async function compartirFotosItems(items, doc, prefijo) {
  const numeroWa = (doc.cliente_telefono || '').replace(/[^0-9]/g, '');
  const texto = `Fotos de los artículos — ${numeroDoc(doc, prefijo)}\n` + items.map(it => `• ${it.descripcion} — ${money(it.precio_unitario)}`).join('\n');

  const files = items.map((it, i) => {
    const blob = dataURLtoBlob(it.imagen);
    return new File([blob], `articulo_${i + 1}.jpg`, { type: blob.type });
  });
  await compartirArchivosWhatsapp({ files, texto, titulo: 'Artículos cotizados', numeroWa });
}

async function compartirImagenDocumentoWhatsapp(doc, tipoLabel, prefijo) {
  const btn = document.getElementById('docprev-wa');
  const elPapel = document.getElementById('docprev-paper-el');
  if (!elPapel || typeof html2canvas === 'undefined') {
    compartirWhatsapp(doc, tipoLabel, prefijo);
    return;
  }
  const textoOriginal = btn.textContent;
  btn.textContent = '⏳ Generando…';
  btn.disabled = true;
  try {
    const canvas = await html2canvas(elPapel, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const numeroTel = (doc.cliente_telefono || '').replace(/[^0-9]/g, '');
    const texto = `*${tipoLabel === 'Venta' ? 'NOTA DE VENTA' : 'COTIZACIÓN'} ${numeroDoc(doc, prefijo)} — Electrodomésticos BM*\nCliente: ${doc.cliente_nombre}\nTotal: ${money(doc.total)}`;

    if (blob) {
      const file = new File([blob], `${prefijo}_${doc.numero}.png`, { type: 'image/png' });
      await compartirArchivosWhatsapp({ files: [file], texto, titulo: tipoLabel, numeroWa: numeroTel });
    } else {
      compartirWhatsapp(doc, tipoLabel, prefijo);
    }
  } catch (e) {
    toast('No se pudo generar la imagen, se comparte el texto', 'error');
    compartirWhatsapp(doc, tipoLabel, prefijo);
  } finally {
    btn.textContent = textoOriginal;
    btn.disabled = false;
  }
}

function generarPdfDocumento(doc, tipoLabel, prefijo) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  const tituloDoc = tipoLabel === 'Venta' ? 'NOTA DE VENTA' : 'COTIZACIÓN';
  const esContado = (doc.condicion_pago || 'contado') === 'contado';

  // Logo simple (cuadrado verde con "BM")
  pdf.setFillColor(0, 229, 160);
  pdf.roundedRect(14, 12, 12, 12, 2, 2, 'F');
  pdf.setTextColor(5, 19, 15);
  pdf.setFontSize(9);
  pdf.setFont(undefined, 'bold');
  pdf.text('BM', 17, 20);

  pdf.setTextColor(20, 20, 20);
  pdf.setFontSize(14);
  pdf.text('ELECTRODOMÉSTICOS BM', 30, 18);
  pdf.setFont(undefined, 'normal');
  pdf.setFontSize(9);
  pdf.text('Bolivia', 30, 23);

  pdf.setFontSize(13);
  pdf.setFont(undefined, 'bold');
  pdf.text(tituloDoc, 196, 16, { align: 'right' });
  pdf.setFontSize(11);
  pdf.text(numeroDoc(doc, prefijo), 196, 22, { align: 'right' });
  pdf.setFont(undefined, 'normal');
  pdf.setFontSize(9);
  pdf.text(fechaHora(doc.created_at), 196, 27, { align: 'right' });

  pdf.line(14, 32, 196, 32);

  pdf.setFontSize(10);
  pdf.text(`Cliente: ${doc.cliente_nombre}`, 14, 40);
  pdf.text(`Teléfono: ${doc.cliente_telefono || '—'}`, 110, 40);
  pdf.text(`Facturar a: ${doc.facturar_a || '—'}`, 14, 46);
  pdf.text(`NIT: ${doc.cliente_nit || '—'}`, 110, 46);

  let y = 58;
  pdf.setFontSize(9);
  pdf.setFont(undefined, 'bold');
  pdf.text('Descripción', 24, y); pdf.text('Cant.', 120, y); pdf.text('P. Unit.', 145, y); pdf.text('Subtotal', 175, y);
  pdf.setFont(undefined, 'normal');
  y += 4; pdf.line(14, y, 196, y); y += 3;
  (doc.items || []).forEach(it => {
    const producto = productosCache.find(p => p.id === it.producto_id);
    const filaAlto = producto?.imagen_base64 ? 11 : 7;
    if (producto?.imagen_base64) {
      try { pdf.addImage(producto.imagen_base64, 'JPEG', 14, y, 9, 9); } catch (e) { /* imagen inválida, seguimos sin ella */ }
    }
    const yTexto = y + (producto?.imagen_base64 ? 6 : 4);
    pdf.text(String(it.descripcion).slice(0, 42), 24, yTexto);
    pdf.text(String(it.cantidad), 122, yTexto);
    pdf.text(Number(it.precio_unitario).toFixed(2), 145, yTexto);
    pdf.text(Number(it.subtotal).toFixed(2), 175, yTexto);
    y += filaAlto;
  });
  y += 4; pdf.line(14, y, 196, y); y += 8;

  const yTotales = y;
  pdf.text(`[${esContado ? 'X' : ' '}] CONTADO      [${!esContado ? 'X' : ' '}] CRÉDITO`, 14, y);
  if (!esContado && doc.cuota2_pct) {
    y += 6;
    pdf.setFontSize(8);
    pdf.text(`1ra cuota: ${(100 - Number(doc.cuota2_pct)).toFixed(0)}% al contado   ·   2da cuota: ${Number(doc.cuota2_pct).toFixed(0)}% a ${doc.cuota2_dias || '—'} días`, 14, y);
    pdf.setFontSize(9);
  }
  if (doc.descuento_pct || doc.descuento_adicional_pct) {
    y += 6;
    const partesDesc = [];
    if (doc.descuento_pct) partesDesc.push(`Desc. general ${Number(doc.descuento_pct).toFixed(2)}%`);
    if (doc.descuento_adicional_pct) partesDesc.push(`Desc. adicional ${Number(doc.descuento_adicional_pct).toFixed(2)}%`);
    pdf.text(partesDesc.join('   ·   '), 14, y);
  }

  let rightY = yTotales;
  pdf.text(`Subtotal: ${money(doc.subtotal)}`, 145, rightY); rightY += 6;
  pdf.text(`Descuento: ${money(doc.descuento)}`, 145, rightY); rightY += 6;
  pdf.setFontSize(12);
  pdf.setFont(undefined, 'bold');
  pdf.text(`Total: ${money(doc.total)}`, 145, rightY);

  // Caja de medio de pago (cuenta bancaria o QR), si la venta/cotización tiene una asociada
  const medio = mediosPagoCache.find(m => m.id === doc.medio_pago_id);
  let yFinal = Math.max(y, rightY);
  if (medio) {
    let yPago = yFinal + 14;
    pdf.setDrawColor(20, 20, 20);
    const alturaCaja = medio.tipo === 'qr' && medio.imagen_base64 ? 55 : 28;
    pdf.roundedRect(14, yPago, 182, alturaCaja, 2, 2);
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'bold');
    if (medio.tipo === 'qr') {
      pdf.text(`Pagar con QR${medio.titular ? ' — ' + medio.titular : ''}`, 20, yPago + 8);
      if (medio.imagen_base64) {
        try { pdf.addImage(medio.imagen_base64, 'JPEG', 20, yPago + 12, 40, 40); } catch (e) { /* imagen inválida, seguimos sin ella */ }
      }
    } else {
      pdf.text(medio.banco || 'Transferencia bancaria', 20, yPago + 8);
      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(9);
      let yLinea = yPago + 15;
      if (medio.titular) { pdf.text(`Titular: ${medio.titular}`, 20, yLinea); yLinea += 6; }
      if (medio.numero_cuenta) { pdf.text(`N° de cuenta: ${medio.numero_cuenta}`, 20, yLinea); yLinea += 6; }
      if (medio.nit_titular) { pdf.text(`NIT: ${medio.nit_titular}`, 20, yLinea); }
    }
    yFinal = yPago + alturaCaja;
  }

  pdf.setFontSize(9);
  pdf.setFont(undefined, 'italic');
  pdf.setTextColor(31, 41, 55);
  pdf.text('Gracias por su compra y preferencia', 105, yFinal + 14, { align: 'center' });

  pdf.save(`${numeroDoc(doc, prefijo)}_${doc.cliente_nombre.replace(/\s+/g, '_')}.pdf`);
}

function compartirWhatsapp(doc, tipoLabel, prefijo) {
  const tituloDoc = tipoLabel === 'Venta' ? 'NOTA DE VENTA' : 'COTIZACIÓN';
  const esContado = (doc.condicion_pago || 'contado') === 'contado';
  const lineas = (doc.items || []).map(it => `• ${it.descripcion} x${it.cantidad} — ${money(it.subtotal)}`).join('\n');
  const partesDesc = [];
  if (doc.descuento_pct) partesDesc.push(`Desc. general ${Number(doc.descuento_pct).toFixed(2)}%`);
  if (doc.descuento_adicional_pct) partesDesc.push(`Desc. adicional ${Number(doc.descuento_adicional_pct).toFixed(2)}%`);
  const lineaDescPct = partesDesc.length ? `\n${partesDesc.join(' · ')}` : '';
  const lineaCuotas = (!esContado && doc.cuota2_pct) ? `\n1ra cuota: ${(100 - Number(doc.cuota2_pct)).toFixed(0)}% al contado — 2da cuota: ${Number(doc.cuota2_pct).toFixed(0)}% a ${doc.cuota2_dias || '—'} días` : '';
  const texto = `*${tituloDoc} ${numeroDoc(doc, prefijo)} — Electrodomésticos BM*\nCliente: ${doc.cliente_nombre}\n${doc.facturar_a ? `Facturar a: ${doc.facturar_a}\n` : ''}${doc.cliente_nit ? `NIT: ${doc.cliente_nit}\n` : ''}\n${lineas}\n\nSubtotal: ${money(doc.subtotal)}\nDescuento: ${money(doc.descuento)}${lineaDescPct}\n*Total: ${money(doc.total)}*\nCondición: ${esContado ? 'Contado' : 'Crédito'}${lineaCuotas}`;
  const numero = (doc.cliente_telefono || '').replace(/[^0-9]/g, '');
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
}


// ============================================================
// GENÉRICO
// ============================================================
function volverTrasGuardar(fallbackFn) {
  const vistaCaja = $('#view-caja');
  if (vistaCaja && !vistaCaja.hidden) renderCaja();
  else fallbackFn();
}

async function eliminarRegistro(tabla, id, callback) {
  if (!confirm('¿Seguro que querés eliminar este registro? Esta acción no se puede deshacer.')) return;
  const { error } = await sb.from(tabla).delete().eq('id', id);
  if (error) { toast('Error al eliminar: ' + error.message, 'error'); return; }
  toast('Registro eliminado');
  callback();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
