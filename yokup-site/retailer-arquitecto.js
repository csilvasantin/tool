// Portal del comercio · «Importar inventario del Arquitecto» (DCL-66d9ae0d5e756d0067127f24).
// El estudio del Arquitecto de admira.biz manda aquí, en el #fragmento (#arquitecto=v1.…), el plano y los CI que
// inventarió; o el titular sube el JSON que descargó del estudio. El titular elige el establecimiento (o crea uno),
// ve lo que se va a crear y, sólo cuando lo confirma, se dan de alta los CI (players antes que pantallas) con
// POST /api/retailer/itil/cis y el plano con PUT /api/retailer/plano, con su sesión y su perímetro. Idempotente.
// Lo puro está en arquitecto-traspaso.js (YkArquitectoTraspaso). Solo textContent: el contenido no es confiable.
(() => {
const API = 'https://data.yokup.com/api/retailer';
const T = window.YkArquitectoTraspaso;
const $ = s => document.querySelector(s);
const el = (tag, content, cls) => { const n = document.createElement(tag); if (content !== undefined && content !== null) n.textContent = content; if (cls) n.className = cls; return n; };
const ERRORES = { formato: 'El enlace del Arquitecto no tiene un formato válido.', grande: 'El inventario es demasiado grande para un enlace: descárgalo en el estudio y súbelo aquí.',
  json: 'El inventario no es un JSON válido.', navegador: 'Este navegador no sabe descomprimir el enlace: descarga el inventario en el estudio y súbelo aquí.',
  esquema: 'No es un inventario del Arquitecto (admira.arquitecto-inventario/1).', plano: 'El inventario no trae un plano admira.xpacio-plano/1.', 'plano-grande': 'El plano pasa de 256 KB.',
  'plano-id': 'El plano no tiene un id válido.', cis: 'El inventario no trae la lista de CI.', demasiados: 'Más de 200 CI: divide el inventario.', ci: 'Hay una fila que no es un CI.',
  codigo: 'código ITIL no válido', repetido: 'código repetido', categoria: 'categoría no válida', nombre: 'falta el nombre', orientacion: 'orientación no válida', padre: 'relación no válida', ciclo: 'relación circular' };
const ACCION = { crear: 'Se crea', actualizar: 'Se actualiza', igual: 'Ya está igual', conflicto: 'En conflicto (equipo de catálogo o retirado)', padre: 'Depende de un CI que no estará' };
let canEdit = true, sites = [], pendiente = null, inv = null, plan = null, siteId = '', corriendo = false;

async function api(path, body, method) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(API + path, { method: method || (body ? 'POST' : 'GET'), credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
    let result = null; try { result = await r.json(); } catch (_) {}
    if (!r.ok) throw Object.assign(new Error((result && result.error) || 'No se pudo completar la operación.'), { status: r.status });
    return result;
  } catch (e) { if (e.name === 'AbortError') throw Object.assign(new Error('La conexión ha tardado demasiado. Actualiza para comprobar si se guardó antes de repetir.'), { status: 0 }); throw e; }
  finally { clearTimeout(timeout); }
}
function status(t, err) { const s = $('#arq-import-status'); s.textContent = t || ''; s.classList.toggle('error', !!err); }

// El enlace se lee una vez y se quita de la barra de direcciones (no queda en el historial nuevo ni se comparte sin querer).
function tomarFragmento() {
  const p = T && T.leerFragmento(location.hash);
  if (!p) return false;
  pendiente = p;
  try { history.replaceState(history.state, '', location.pathname + location.search + '#arquitecto'); } catch (_) {}
  return true;
}
async function abrir(payload) {
  const section = $('#arquitecto-import'); section.hidden = false;
  if (!payload) { status('Sube el inventario (JSON) que descargaste en el estudio del Arquitecto.'); return; }
  const d = await T.decodificar(payload);
  if (!d.ok) { status(ERRORES[d.error] || ERRORES.formato, true); return; }
  cargar(d.inventario);
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function cargar(obj) {
  const v = T.validar(obj);
  inv = null; plan = null;
  $('#arq-import-preview').hidden = true;
  if (!v.ok) {
    const filas = v.errores.slice(0, 6).map(e => (e.fila >= 0 ? 'CI ' + (e.fila + 1) + ': ' : '') + (ERRORES[e.codigo] || e.codigo));
    status('No se puede importar: ' + filas.join(' · '), true); return;
  }
  inv = v.inventario;
  status('');
  pintarXpacio();
  pintarSites();
  $('#arq-import-preview').hidden = false;
  if (siteId) elegir(siteId);
}
function pintarXpacio() {
  const p = inv.plan, pantallas = p.pantallas.length, players = inv.cis.filter(c => c.category === 'player').length;
  const box = $('#arq-import-xpacio'); box.replaceChildren();
  box.append(el('strong', inv.xpacio.nombre || inv.xpacio.id), document.createTextNode(' · ' + (inv.xpacio.tipo || 'Xpacio') + ' · plano de ' + p.planta.ancho + ' × ' + p.planta.fondo + ' m, ' + p.paredes.length + ' paredes, ' + pantallas + (pantallas === 1 ? ' pantalla' : ' pantallas') + ' · ' + inv.cis.length + ' CI (' + players + ' players)'));
  if (inv.creado) box.append(el('span', ' · estimado el ' + inv.creado.slice(0, 10), 'muted'));
}
async function cargarSites() {
  try { const r = await api('/itil'); sites = r.sites || []; } catch (e) { if (e.status !== 401) status(e.message, true); sites = []; }
}
function pintarSites() {
  const select = $('#arq-import-site'); select.replaceChildren(el('option', 'Elige el establecimiento…'));
  select.firstChild.value = '';
  for (const s of sites) { const o = el('option', s.name + (s.admira_store_id ? ' · Xpacio ' + s.admira_store_id : '') + ' · ' + (s.itil_cis ? s.itil_cis + ' CI ITIL' : 'sin ITIL') + (s.plan_version ? ' · plano ' + s.plan_version : '')); o.value = s.site_id; select.append(o); }
  select.value = sites.some(s => s.site_id === siteId) ? siteId : '';
  $('#arq-import-new-site').hidden = !canEdit;
}
async function elegir(id) {
  siteId = id; plan = null;
  const site = sites.find(s => s.site_id === id);
  pintarTabla(null); pintarAvisos(site, null); actualizarBoton();
  if (!site || !inv) return;
  try { const existente = await api('/itil/inventory?site_id=' + encodeURIComponent(id)); if (siteId !== id) return; plan = T.planificar(inv, existente); }
  catch (e) { status(e.message, true); return; }
  pintarTabla(plan); pintarAvisos(site, plan); actualizarBoton();
}
function pintarTabla(pl) {
  const table = $('#arq-import-table'), head = el('thead'), tr = el('tr'), body = el('tbody');
  ['Código ITIL', 'Nombre', 'Categoría', 'Depende de', 'Qué pasará'].forEach(t => tr.append(el('th', t)));
  head.append(tr);
  const pasos = pl ? pl.pasos : T.ordenAlta(inv ? inv.cis : []).map(ci => ({ ci, accion: '' }));
  for (const p of pasos) {
    const row = el('tr'); if (p.accion) row.className = 'arq-' + p.accion;
    row.append(el('td', p.ci.itil_code, 'code'), el('td', p.ci.name), el('td', p.ci.category), el('td', p.ci.parent_itil_code || '—'), el('td', p.accion ? ACCION[p.accion] : 'Elige el establecimiento'));
    body.append(row);
  }
  table.replaceChildren(head, body);
}
function pintarAvisos(site, pl) {
  const ul = $('#arq-import-warnings'); ul.replaceChildren();
  const add = t => ul.append(el('li', t));
  if (!canEdit) add('Tu acceso es de solo lectura: pide al titular que haga el alta.');
  if (!site) return;
  const planId = site.admira_store_id || inv.plan.id;
  add('El plano se guardará en «' + site.name + '» con el id ' + planId + (site.plan_version ? '; ya tiene plano (versión ' + site.plan_version + '): será una versión nueva y el histórico conserva la anterior.' : '.'));
  if (pl && pl.retiraCatalogo) add('Es el primer CI ITIL de este establecimiento: sus ' + pl.retiraCatalogo + ' equipos provisionales del catálogo quedarán retirados («Sustituido por ITIL»), salvo los que tengan una incidencia abierta.');
  if (pl && pl.pasos.some(p => p.accion === 'conflicto' || p.accion === 'padre')) add('Hay CI que no se darán de alta (marcados abajo); el resto sí.');
  if (pl && pl.pasos.every(p => p.accion === 'igual')) add('Todo ya está dado de alta tal cual: repetir no cambia nada.');
}
function actualizarBoton() { $('#arq-import-go').disabled = corriendo || !canEdit || !inv || !plan || !$('#arq-import-ok').checked; }

async function importar() {
  const site = sites.find(s => s.site_id === siteId);
  if (!site || !inv || !plan || corriendo || !$('#arq-import-ok').checked) return;
  corriendo = true; actualizarBoton();
  const log = $('#arq-import-log'); log.replaceChildren();
  const paso = p => log.append(el('li', p.plano ? 'Plano: ' + ({ guardado: 'guardado', igual: 'ya estaba igual', error: 'no se pudo guardar · ' + (p.error || '') })[p.estado]
    : p.ci + ': ' + ({ crear: 'creado', actualizar: 'actualizado', igual: 'ya estaba igual', saltado: 'no se da de alta (' + (p.error === 'conflicto' ? 'conflicto' : 'su padre no está') + ')', error: 'error · ' + (p.error || '') })[p.estado], p.estado === 'error' || p.estado === 'saltado' ? 'err' : ''));
  status('Dando de alta…');
  try {
    const r = await T.importar({ inventario: inv, site, api, alPaso: paso });
    const partes = [r.creados + ' CI creados', r.actualizados + ' actualizados', r.iguales + ' ya estaban'];
    if (r.saltados || r.errores.length) partes.push(r.errores.length + ' con problemas');
    partes.push(r.plano && r.plano.ok ? (r.plano.changed ? 'plano guardado' + (r.plano.seq ? ' (versión ' + r.plano.seq + ')' : '') : 'plano sin cambios') : 'el plano no se guardó');
    if (r.retiradosCatalogo) partes.push(r.retiradosCatalogo + ' equipos de catálogo retirados');
    $('#arq-import-summary').textContent = 'Resumen: ' + partes.join(' · ') + '.';
    status(r.errores.length || !(r.plano && r.plano.ok) ? 'Alta hecha con avisos: revisa la lista.' : 'Alta hecha. Ya lo tienes en el Inventario ITIL.', r.errores.length > 0 || !(r.plano && r.plano.ok));
    document.dispatchEvent(new CustomEvent('retailer-sites-imported'));
    await cargarSites(); pintarSites(); await elegir(siteId);
  } catch (e) { status(e.message, true); }
  finally { corriendo = false; actualizarBoton(); }
}

// Establecimiento nuevo: el diálogo de siempre del portal, con el nombre y el tipo del Xpacio ya puestos.
function nuevoSite() {
  const dialog = $('#site-dialog'); if (!dialog || !inv) return;
  const form = dialog.querySelector('form'); form.reset(); form.querySelector('.form-status').textContent = '';
  if (form.elements.name) form.elements.name.value = (inv.xpacio.nombre || inv.xpacio.id).slice(0, 120);
  if (form.elements.kind) form.elements.kind.value = T.kindDe(inv.xpacio.tipo);
  if ($('#country')) $('#country').value = 'ES';
  const antes = new Set(sites.map(s => s.site_id));
  dialog.addEventListener('close', async () => { await cargarSites(); const nuevo = sites.find(s => !antes.has(s.site_id)); pintarSites(); if (nuevo) { $('#arq-import-site').value = nuevo.site_id; elegir(nuevo.site_id); } }, { once: true });
  dialog.showModal();
}

$('#arq-import-site').onchange = e => elegir(e.target.value);
$('#arq-import-ok').onchange = actualizarBoton;
$('#arq-import-go').onclick = importar;
$('#arq-import-new-site').onclick = nuevoSite;
$('#arq-import-open').onclick = () => abrir(null);
$('#arq-import-close').onclick = () => { inv = null; plan = null; pendiente = null; $('#arquitecto-import').hidden = true; $('#arq-import-preview').hidden = true; status(''); };
$('#arq-import-file').onchange = async e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  if (f.size > T.MAX_JSON) { status(ERRORES.grande, true); return; }
  let obj; try { obj = JSON.parse(await f.text()); } catch (_) { status(ERRORES.json, true); return; }
  cargar(obj);
};
tomarFragmento();
window.addEventListener('hashchange', () => { if (tomarFragmento() && !$('#workspace').hidden) abrir(pendiente); });
document.addEventListener('portal-auth', async e => {
  if (e.detail?.kind !== 'retailer') return;
  if (!e.detail.authenticated) { inv = null; plan = null; sites = []; $('#arquitecto-import').hidden = true; return; }
  try { const me = await api('/me'); canEdit = me.access?.can_edit !== false; } catch (_) { canEdit = false; }
  $('#arq-import-open').hidden = !canEdit;
  await cargarSites();
  if (pendiente) { const p = pendiente; pendiente = null; await abrir(p); }
});
})();
