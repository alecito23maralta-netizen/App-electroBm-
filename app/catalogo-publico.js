// ============================================================
// Catálogo público — Electrodomésticos BM
// Página de solo lectura, sin login, para compartir con clientes.
// ============================================================

const sbPub = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let WHATSAPP_NUMERO = '59178704870'; // valor por defecto, se sobreescribe con lo cargado desde Usuarios → Redes sociales
let FACEBOOK_URL = '';
let TIKTOK_URL = '';

async function cargarConfiguracionTienda() {
  try {
    const { data } = await sbPub.from('configuracion').select('*').eq('id', 1).single();
    if (data) {
      if (data.whatsapp_numero) WHATSAPP_NUMERO = data.whatsapp_numero;
      FACEBOOK_URL = data.facebook_url || '';
      TIKTOK_URL = data.tiktok_url || '';
    }
  } catch (e) { /* si falla, seguimos con los valores por defecto */ }
}

let productosPub = [];
let categoriaActual = 'todas';
let busquedaActual = '';

const $ = (sel) => document.querySelector(sel);

function money(n) {
  return 'Bs ' + Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function linkWhatsapp(texto) {
  const base = WHATSAPP_NUMERO ? `https://wa.me/${WHATSAPP_NUMERO}` : `https://wa.me/`;
  return `${base}?text=${encodeURIComponent(texto)}`;
}

function wireBotonesWhatsapp() {
  const texto = 'Hola, quisiera cotizar un producto de Electrodomésticos BM 🙂';
  ['header-whatsapp-btn', 'hero-whatsapp-btn', 'cta-whatsapp-btn'].forEach(id => {
    const el = $(`#${id}`);
    if (el) el.href = linkWhatsapp(texto);
  });
}

const ICONO_FACEBOOK = `<svg viewBox="0 0 24 24" fill="#00875f"><path d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.78l-.44 2.91h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z"/></svg>`;
const ICONO_TIKTOK = `<svg viewBox="0 0 24 24" fill="#00875f"><path d="M16.6 5.82c-.9-.98-1.4-2.26-1.4-3.6h-3.15v13.44a3.13 3.13 0 0 1-5.63 1.87 3.13 3.13 0 0 1 2.5-5.02c.3 0 .58.04.85.12V9.6a6.28 6.28 0 0 0-.85-.06 6.29 6.29 0 1 0 6.29 6.29V8.28a8.36 8.36 0 0 0 4.87 1.56V6.7a4.85 4.85 0 0 1-3.48-.88Z"/></svg>`;
const ICONO_WHATSAPP = `<svg viewBox="0 0 24 24" fill="#00875f"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.05-1.32A10 10 0 1 0 12 2Zm0 18.2a8.15 8.15 0 0 1-4.16-1.14l-.3-.18-3 .78.8-2.92-.19-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.14c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.78.95-.14.16-.29.18-.53.06-.24-.12-1.03-.38-1.96-1.21-.72-.64-1.21-1.44-1.35-1.68-.14-.24-.02-.37.11-.49.11-.11.24-.29.36-.43.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.42-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.85.83-.85 2.02 0 1.19.87 2.35.99 2.51.12.16 1.71 2.61 4.14 3.66.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z"/></svg>`;

function renderRedesSociales() {
  const cont = $('#pub-redes');
  if (!cont) return;
  const links = [];
  if (FACEBOOK_URL) links.push(`<a href="${FACEBOOK_URL}" target="_blank" rel="noopener" class="pub-red-icon" title="Facebook">${ICONO_FACEBOOK}</a>`);
  if (TIKTOK_URL) links.push(`<a href="${TIKTOK_URL}" target="_blank" rel="noopener" class="pub-red-icon" title="TikTok">${ICONO_TIKTOK}</a>`);
  links.push(`<a href="${linkWhatsapp('Hola, quisiera más información sobre un producto de Electrodomésticos BM 🙂')}" target="_blank" rel="noopener" class="pub-red-icon" title="WhatsApp">${ICONO_WHATSAPP}</a>`);
  cont.innerHTML = links.join('');
  $('#pub-redes-bar').style.display = links.length > 0 ? '' : 'none';
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

function mostrarSaludoPerrito() {
  const div = document.createElement('div');
  div.className = 'saludo-bienvenida';
  div.innerHTML = `
    <div class="saludo-personaje">${PERRITO_SVG}</div>
    <div class="saludo-texto">
      <strong>¡Hola! Me llamo BAM 🤖</strong>
      <span>Bienvenido a ElectrodomésticosBM — tenemos productos y herramientas para tu comodidad</span>
    </div>
    <button class="saludo-cerrar" title="Cerrar">✕</button>
  `;
  document.body.appendChild(div);
  const quitar = () => { div.classList.add('saludo-salir'); setTimeout(() => div.remove(), 300); };
  div.querySelector('.saludo-cerrar').addEventListener('click', quitar);
  setTimeout(quitar, 15 * 60 * 1000);
}

function abrirFormConsultaWhatsapp(productoPreseleccionado) {
  const overlay = document.createElement('div');
  overlay.className = 'pub-detalle-overlay';
  overlay.innerHTML = `
    <div class="pub-detalle-card pub-consulta-card">
      <button class="pub-detalle-cerrar" title="Cerrar">✕</button>
      <div class="pub-detalle-info">
        <h3 style="margin-bottom:16px">💬 Contanos qué necesitás</h3>
        <form id="form-consulta-wa">
          <div class="pub-consulta-grid">
            <div class="field"><label>Nombre completo *</label><input id="fc-nombre" required /></div>
            <div class="field"><label>Ciudad</label><input id="fc-ciudad" placeholder="Ej: Tarija" /></div>
          </div>
          <div class="pub-consulta-grid" style="margin-top:10px">
            <div class="field">
              <label>Producto</label>
              ${productoPreseleccionado ? `
                <input value="${escapeHtml(productoPreseleccionado.descripcion)}" disabled />
              ` : `
                <select id="fc-producto">
                  <option value="">Varios / no estoy seguro</option>
                  ${productosPub.map(p => `<option value="${escapeHtml(p.descripcion)}">${escapeHtml(p.descripcion)}</option>`).join('')}
                </select>
              `}
            </div>
            <div class="field"><label>Teléfono *</label><input id="fc-telefono" type="tel" placeholder="7xxxxxxx" required /></div>
          </div>
          <div class="field" style="margin-top:10px">
            <label>Producto(s) y cantidad</label>
            <textarea id="fc-detalle" rows="4" placeholder="Describí los productos que necesitás y las cantidades">${productoPreseleccionado ? `1 x ${productoPreseleccionado.descripcion}` : ''}</textarea>
          </div>
          <button type="submit" class="pub-btn pub-btn-primary" style="width:100%;justify-content:center;margin-top:16px">Enviar consulta</button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const cerrar = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
  overlay.querySelector('.pub-detalle-cerrar').addEventListener('click', cerrar);

  overlay.querySelector('#form-consulta-wa').addEventListener('submit', (e) => {
    e.preventDefault();
    const nombre = $('#fc-nombre').value.trim();
    const ciudad = $('#fc-ciudad').value.trim();
    const producto = productoPreseleccionado ? productoPreseleccionado.descripcion : ($('#fc-producto')?.value || '');
    const detalle = $('#fc-detalle').value.trim();

    let texto = `Hola, soy *${nombre}*`;
    if (ciudad) texto += ` de ${ciudad}`;
    texto += '.';
    if (producto) texto += `\nMe interesa: *${producto}*`;
    if (detalle) texto += `\n${detalle}`;
    texto += '\n\n_Consulta enviada desde el catálogo — Electrodomésticos BM_';

    window.open(linkWhatsapp(texto), '_blank');
    cerrar();
  });
}

function crearBotFlotante() {
  const cont = document.createElement('div');
  cont.className = 'bot-flotante-cont';
  cont.innerHTML = `
    <span class="bot-flotante-globo">Chatea con BAM 🤖</span>
    <button class="bot-flotante" title="Chatea con BAM por WhatsApp">${PERRITO_SVG}</button>
  `;
  document.body.appendChild(cont);
  cont.addEventListener('click', () => abrirFormConsultaWhatsapp());
}

async function cargarCatalogoPublico() {
  await cargarConfiguracionTienda();
  wireBotonesWhatsapp();
  renderRedesSociales();
  mostrarSaludoPerrito();
  crearBotFlotante();
  const { data, error } = await sbPub.from('catalogo_publico').select('*').order('categoria').order('descripcion');
  const grid = $('#pub-grid');
  if (error) {
    grid.innerHTML = `<div class="pub-empty">No se pudo cargar el catálogo en este momento. Intentá de nuevo más tarde.</div>`;
    return;
  }
  productosPub = data || [];
  renderStats();
  renderCategorias();
  renderTabs();
  renderGrid();
}

function renderStats() {
  const categorias = new Set(productosPub.map(p => p.categoria));
  $('#pub-stats').innerHTML = `
    <div class="pub-stat"><div class="num">${productosPub.length}+</div><div class="lbl">Productos disponibles</div></div>
    <div class="pub-stat"><div class="num">${categorias.size}</div><div class="lbl">Categorías</div></div>
  `;
}

function agruparPorCategoria() {
  const mapa = {};
  productosPub.forEach(p => {
    if (!mapa[p.categoria]) mapa[p.categoria] = {};
    const sub = p.subcategoria || 'General';
    mapa[p.categoria][sub] = (mapa[p.categoria][sub] || 0) + 1;
  });
  return mapa;
}

function renderCategorias() {
  const mapa = agruparPorCategoria();
  const cont = $('#pub-cat-grid');
  cont.innerHTML = Object.keys(mapa).map(cat => {
    const subcats = Object.entries(mapa[cat]).sort((a, b) => b[1] - a[1]);
    const total = subcats.reduce((s, [, n]) => s + n, 0);
    return `
      <div class="pub-cat-card">
        <h3>${escapeHtml(cat)} <span class="count">${total} prod.</span></h3>
        <div class="pub-subcat-list">
          ${subcats.slice(0, 5).map(([sub, n]) => `
            <div class="pub-subcat-item" data-cat="${escapeHtml(cat)}" data-sub="${escapeHtml(sub)}">
              <span>${escapeHtml(sub)}</span>
              <span class="n">${n} prod.</span>
            </div>
          `).join('')}
        </div>
        <button class="pub-cat-ver-todos" data-cat-todos="${escapeHtml(cat)}">Ver todos — ${total} prod.</button>
      </div>
    `;
  }).join('');

  cont.querySelectorAll('[data-cat-todos]').forEach(btn => {
    btn.addEventListener('click', () => irACategoria(btn.dataset.catTodos));
  });
  cont.querySelectorAll('.pub-subcat-item').forEach(item => {
    item.addEventListener('click', () => irACategoria(item.dataset.cat, item.dataset.sub));
  });
}

function irACategoria(cat, sub) {
  categoriaActual = cat;
  busquedaActual = sub || '';
  $('#pub-buscar').value = busquedaActual;
  renderTabs();
  renderGrid();
  $('#pub-grid-section').scrollIntoView({ behavior: 'smooth' });
}

function renderTabs() {
  const categorias = [...new Set(productosPub.map(p => p.categoria))];
  const cont = $('#pub-tabs');
  cont.innerHTML = `
    <button class="tab-btn ${categoriaActual === 'todas' ? 'active' : ''}" data-cat="todas">Todas</button>
    ${categorias.map(c => `<button class="tab-btn ${categoriaActual === c ? 'active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
  `;
  cont.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => { categoriaActual = btn.dataset.cat; renderTabs(); renderGrid(); });
  });
}

function renderGrid() {
  const grid = $('#pub-grid');
  const q = busquedaActual.trim().toLowerCase();
  let items = productosPub;
  if (categoriaActual !== 'todas') items = items.filter(p => p.categoria === categoriaActual);
  if (q) items = items.filter(p => p.descripcion.toLowerCase().includes(q) || (p.subcategoria || '').toLowerCase().includes(q));

  if (items.length === 0) {
    grid.innerHTML = `<div class="pub-empty">No hay productos para mostrar.</div>`;
    return;
  }

  grid.innerHTML = `<div class="catalogo-grid">
    ${items.map(p => `
      <div class="catalogo-card" data-producto="${p.id}" style="cursor:pointer">
        <div class="catalogo-img">
          ${p.imagen_base64 ? `<img src="${p.imagen_base64}" alt="${escapeHtml(p.descripcion)}" />` : `<span class="catalogo-img-placeholder">Sin foto</span>`}
        </div>
        <div class="catalogo-body">
          <div class="catalogo-desc">${escapeHtml(p.descripcion)}</div>
          ${p.subcategoria ? `<div class="catalogo-sub">${escapeHtml(p.subcategoria)}</div>` : ''}
          <div class="catalogo-precio">${money(p.precio_venta)}</div>
        </div>
      </div>
    `).join('')}
  </div>`;

  grid.querySelectorAll('[data-producto]').forEach(card => {
    card.addEventListener('click', () => {
      const p = items.find(x => x.id === card.dataset.producto);
      if (p) abrirDetalleProducto(p);
    });
  });
}

function abrirDetalleProducto(p) {
  const overlay = document.createElement('div');
  overlay.className = 'pub-detalle-overlay';
  overlay.innerHTML = `
    <div class="pub-detalle-card">
      <button class="pub-detalle-cerrar" title="Cerrar">✕</button>
      <div class="pub-detalle-img">
        ${p.imagen_base64 ? `<img src="${p.imagen_base64}" alt="${escapeHtml(p.descripcion)}" />` : `<span class="catalogo-img-placeholder">Sin foto</span>`}
      </div>
      <div class="pub-detalle-info">
        ${p.subcategoria ? `<div class="pub-detalle-etiqueta">${escapeHtml(p.subcategoria)}</div>` : ''}
        <h3>${escapeHtml(p.descripcion)}</h3>
        <div class="pub-detalle-precio">${money(p.precio_venta)}</div>
        <div class="pub-detalle-divisor"></div>
        <div class="pub-detalle-seccion-titulo">Formas de pago</div>
        <div class="pub-detalle-pagos">
          <span>💵 Efectivo</span>
          <span>🏦 Transferencia bancaria</span>
          <span>📷 QR</span>
        </div>
        <div class="pub-detalle-seccion-titulo" style="margin-top:14px">Entrega</div>
        <p class="pub-detalle-entrega">🚚 Coordinamos la entrega con vos apenas confirmamos tu pedido por WhatsApp.</p>
        <button class="pub-btn pub-btn-primary" id="btn-consultar-producto" style="width:100%;justify-content:center;margin-top:16px">💬 Consultar por WhatsApp</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const cerrar = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
  overlay.querySelector('.pub-detalle-cerrar').addEventListener('click', cerrar);
  overlay.querySelector('#btn-consultar-producto').addEventListener('click', () => {
    cerrar();
    abrirFormConsultaWhatsapp(p);
  });
}

$('#pub-buscar').addEventListener('input', (e) => { busquedaActual = e.target.value; renderGrid(); });

cargarCatalogoPublico();
