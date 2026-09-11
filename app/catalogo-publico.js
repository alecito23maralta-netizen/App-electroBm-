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
  <svg viewBox="0 0 140 150" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="70" cy="142" rx="34" ry="6" fill="#000" opacity="0.18"/>
    <line x1="70" y1="9" x2="70" y2="24" stroke="#00b384" stroke-width="4" stroke-linecap="round"/>
    <circle cx="70" cy="7" r="6.5" fill="#00e5a0"/>
    <rect x="26" y="78" width="14" height="34" rx="7" fill="#00b384"/>
    <rect x="34" y="66" width="72" height="60" rx="24" fill="#00e5a0"/>
    <circle cx="70" cy="98" r="13" fill="#05130f"/>
    <text x="70" y="102.3" text-anchor="middle" font-size="11" font-weight="800" fill="#00e5a0" font-family="Arial, sans-serif">BM</text>
    <rect x="46" y="122" width="14" height="16" rx="7" fill="#00b384"/>
    <rect x="80" y="122" width="14" height="16" rx="7" fill="#00b384"/>
    <rect x="30" y="22" width="80" height="54" rx="26" fill="#0d0f14" stroke="#00e5a0" stroke-width="3"/>
    <circle cx="54" cy="49" r="9" fill="#00e5a0"/>
    <circle cx="86" cy="49" r="9" fill="#00e5a0"/>
    <circle cx="57" cy="46" r="2.6" fill="#eafff6"/>
    <circle cx="89" cy="46" r="2.6" fill="#eafff6"/>
    <path d="M56 62 Q70 70 84 62" stroke="#00e5a0" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <rect x="97" y="53" width="14" height="32" rx="7" fill="#00b384" transform="rotate(-30 104 69)"/>
    <circle cx="115" cy="45" r="9" fill="#00b384"/>
    <rect x="106" y="12" width="30" height="21" rx="9" fill="#fff"/>
    <polygon points="112,31 121,31 112,40" fill="#fff"/>
    <circle cx="115" cy="22.5" r="2" fill="#00b384"/>
    <circle cx="121" cy="22.5" r="2" fill="#00b384"/>
    <circle cx="127" cy="22.5" r="2" fill="#00b384"/>
  </svg>
`;

function mostrarSaludoPerrito() {
  const div = document.createElement('div');
  div.className = 'saludo-bienvenida';
  div.innerHTML = `
    <button class="saludo-cerrar" title="Cerrar">✕</button>
    <div class="saludo-personaje">${PERRITO_SVG}</div>
    <div class="saludo-texto">
      <strong>¡Hola! Soy BAM 🤖</strong>
      <span>Te ayudo a encontrar el producto ideal para tu hogar</span>
      <button class="saludo-cta" id="saludo-cta-chatear">💬 Chatear con BAM</button>
    </div>
  `;
  document.body.appendChild(div);
  const quitar = () => { div.classList.add('saludo-salir'); setTimeout(() => div.remove(), 300); };
  div.querySelector('.saludo-cerrar').addEventListener('click', quitar);
  div.querySelector('#saludo-cta-chatear').addEventListener('click', () => { quitar(); abrirFormConsultaWhatsapp(); });
  setTimeout(quitar, 15 * 1000);
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
