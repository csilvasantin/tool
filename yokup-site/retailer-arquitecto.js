// Portal del comercio · «Importar inventario del Arquitecto» (DCL-66d9ae0d5e756d0067127f24).
// El estudio del Arquitecto de admira.biz manda aquí, en el #fragmento (#arquitecto=v1.…), el plano y los CI que
// inventarió; o el titular sube el JSON que descargó del estudio. El titular elige el establecimiento (o crea uno),
// ve lo que se va a crear y, sólo cuando lo confirma, se dan de alta los CI NUEVOS (players antes que pantallas) con
// POST /api/retailer/itil/cis y, si lo pide, el plano con PUT /api/retailer/plano. v1: sólo altas; lo que ya existe
// no se toca. Lo puro está en arquitecto-traspaso.js (YkArquitectoTraspaso). Solo textContent: no es contenido fiable.
(() => {
const API = 'https://data.yokup.com/api/retailer';
const T = window.YkArquitectoTraspaso;
const GUARDA = 'yk-arquitecto-enlace';   // el enlace sobrevive a un login que pase por otra página (p. ej. /superusuario)
const $ = s => document.querySelector(s);
const el = (tag, content, cls) => { const n = document.createElement(tag); if (content !== undefined && content !== null) n.textContent = content; if (cls) n.className = cls; return n; };
const ERRORES = { formato: 'El enlace del Arquitecto no tiene un formato válido.', grande: 'El inventario es demasiado grande para un enlace: descárgalo en el estudio y súbelo aquí.',
  json: 'El inventario no es un JSON válido.', navegador: 'Este navegador no sabe descomprimir el enlace: descarga el inventario en el estudio y súbelo aquí.',
  esquema: 'No es un inventario del Arquitecto (admira.arquitecto-inventario/1).', anidado: 'El inventario está anidado de forma anómala.', plano: 'El inventario no trae un plano admira.xpacio-plano/1.',
  'plano-grande': 'El plano pasa de 256 KB.', 'plano-id': 'El plano no tiene un id válido.', cis: 'El inventario no trae la lista de CI.', demasiados: 'Más de 200 CI: divide el inventario.', ci: 'Hay una fila que no es un CI.',
  tipo: 'un campo que debería ser texto no lo es', codigo: 'código ITIL no válido', repetido: 'código repetido', categoria: 'categoría no válida', nombre: 'falta el nombre', orientacion: 'orientación no válida', padre: 'relación no válida', ciclo: 'relación circular' };
const ACCION = { crear: 'Se crea', existe: 'Ya existe aquí: no se toca', padre: 'No se crea: depende de un CI que no estará' };
let sesion = null, canEdit = false, autenticado = false, sites = [], pendiente = null, inv = null, avisosInv = [], plan = null, siteId = '', planoActual = null, corriendo = false, revision = 0;

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
function guardar(p) { try { if (p) sessionStorage.setItem(GUARDA, p); else sessionStorage.removeItem(GUARDA); } catch (_) {} }

// El enlace se lee una vez y se quita de la barra de direcciones; queda en la pestaña (sessionStorage) hasta usarlo o descartarlo.
function tomarFragmento() {
  const p = T && T.leerFragmento(location.hash);
  if (!p) return false;
  pendiente = p; guardar(p);
  try { history.replaceState(history.state, '', location.pathname + location.search + '#arquitecto'); } catch (_) {}
  return true;
}
// /me y /itil sólo cuando se abre el import (no en cada visita del portal).
async function prepararSesion() {
  if (sesion) return sesion;
  sesion = (async () => {
    try { const me = await api('/me'); canEdit = me.access?.can_edit !== false; } catch (_) { canEdit = false; }
    await cargarSites();
  })();
  return sesion;
}
// Formulario desarmado: cada inventario nuevo (enlace, JSON) o «Descartar» empieza sin nada marcado ni elegido.
function desarmar() {
  revision++;
  siteId = ''; plan = null; planoActual = null;
  for (const id of ['#arq-import-ok', '#arq-import-retirada', '#arq-import-plano']) $(id).checked = false;
  $('#arq-import-retirada-l').hidden = true; $('#arq-import-plano-l').hidden = true;
  $('#arq-import-log').replaceChildren(); $('#arq-import-summary').textContent = ''; $('#arq-import-warnings').replaceChildren();
  if ($('#arq-import-site').options.length) $('#arq-import-site').value = '';
}
async function abrir(payload) {
  try {
    const section = $('#arquitecto-import'); section.hidden = false;
    await prepararSesion();
    pintarSites();
    if (!payload) { status('Sube el inventario (JSON) que descargaste en el estudio del Arquitecto.'); return; }
    const d = await T.decodificar(payload);
    if (!d.ok) { status(ERRORES[d.error] || ERRORES.formato, true); return; }
    cargar(d.inventario);
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (_) { status(ERRORES.formato, true); }
}
function cargar(obj) {
  desarmar();
  inv = null; avisosInv = [];
  $('#arq-import-preview').hidden = true;
  let v;
  try { v = T.validar(obj); } catch (_) { status(ERRORES.formato, true); return; }
  if (!v.ok) {
    const filas = v.errores.slice(0, 6).map(e => (e.fila >= 0 ? 'CI ' + (e.fila + 1) + ': ' : '') + (ERRORES[e.codigo] || e.codigo));
    status('No se puede importar: ' + filas.join(' · '), true); return;
  }
  inv = v.inventario; avisosInv = v.avisos;
  status(canEdit ? '' : 'Tu acceso es de solo lectura: puedes revisar el inventario, pero el alta la hace el titular.');
  pintarXpacio(); pintarSites(); pintarTabla(); pintarAvisos(null);
  $('#arq-import-preview').hidden = false;
  actualizarBoton();
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
// Al revisar se fija todo lo que decide el alta: lo que ya existe, los equipos de catálogo y el sha256 del plano vigente.
async function elegir(id) {
  const mia = ++revision;
  siteId = id; plan = null; planoActual = null;
  for (const c of ['#arq-import-ok', '#arq-import-retirada', '#arq-import-plano']) $(c).checked = false;
  $('#arq-import-log').replaceChildren(); $('#arq-import-summary').textContent = '';
  const site = sites.find(s => s.site_id === id);
  pintarTabla(); pintarAvisos(site); actualizarBoton();
  if (!site || !inv) return;
  try {
    const existente = await api('/itil/inventory?site_id=' + encodeURIComponent(id));
    let actual = null;
    try { const r = await api('/plano?site_id=' + encodeURIComponent(id)); if (r && r.has_plan !== false && r.current && r.current.sha256) actual = { sha: r.current.sha256, version: r.current.version || '', seq: r.current.seq }; }
    catch (e) { if (e.status !== 404) throw e; }
    if (mia !== revision) return;
    plan = T.planificar(inv, existente); planoActual = actual;
  } catch (e) { if (mia === revision) status(e.message, true); return; }
  pintarTabla(); pintarAvisos(site); actualizarBoton();
}
function pintarTabla() {
  const table = $('#arq-import-table'), head = el('thead'), tr = el('tr'), body = el('tbody');
  ['Código ITIL', 'Nombre', 'Categoría', 'Depende de', 'Qué pasará'].forEach(t => tr.append(el('th', t)));
  head.append(tr);
  const pasos = plan ? plan.pasos : T.ordenAlta(inv ? inv.cis : []).map(ci => ({ ci, accion: '' }));
  for (const p of pasos) {
    const row = el('tr'); if (p.accion) row.className = 'arq-' + p.accion;
    row.append(el('td', p.ci.itil_code, 'code'), el('td', p.ci.name), el('td', p.ci.category), el('td', p.ci.parent_itil_code || '—'), el('td', p.accion ? ACCION[p.accion] : 'Elige el establecimiento'));
    body.append(row);
  }
  table.replaceChildren(head, body);
}
function pintarAvisos(site) {
  const ul = $('#arq-import-warnings'); ul.replaceChildren();
  const add = t => ul.append(el('li', t));
  for (const a of avisosInv) if (a.codigo === 'padre-fuera' && inv.cis[a.fila]) add(inv.cis[a.fila].itil_code + ' depende de ' + inv.cis[a.fila].parent_itil_code + ', que no viene en el inventario: tiene que existir ya en el establecimiento.');
  if (!canEdit) add('Tu acceso es de solo lectura: pide al titular que haga el alta.');
  $('#arq-import-retirada-l').hidden = true; $('#arq-import-plano-l').hidden = true;
  if (!site || !plan) return;
  add('Sólo altas: los códigos que ya existen en «' + site.name + '» no se tocan (ni nombre, ni categoría, ni relaciones).');
  if (plan.retiraCatalogo) {
    $('#arq-import-retirada-txt').textContent = 'Acepto que, al dar de alta CI ITIL, se retiren los ' + plan.retiraCatalogo + ' equipos provisionales del catálogo de este establecimiento («Sustituido por ITIL»), salvo los que tengan una incidencia abierta.';
    $('#arq-import-retirada-l').hidden = false;
  }
  const planId = site.admira_store_id || inv.plan.id;
  if (planoActual) {
    $('#arq-import-plano-txt').textContent = 'Sustituir el plano actual' + (planoActual.version ? ' (versión ' + planoActual.version + ')' : '') + ' por el del Arquitecto, con el id ' + planId + '. El histórico conserva el anterior.';
    $('#arq-import-plano-l').hidden = false;
  } else add('El plano del Arquitecto se guardará como primer plano del establecimiento, con el id ' + planId + '.');
  if (plan.pasos.some(p => p.accion === 'padre')) add('Hay CI que no se crearán (marcados abajo); el resto sí.');
  if (!plan.altas) add('No hay nada nuevo que dar de alta: todos los códigos ya existen aquí.');
}
function guardaPlano() { return !planoActual || $('#arq-import-plano').checked; }
function actualizarBoton() {
  const listo = canEdit && inv && plan && !corriendo && $('#arq-import-ok').checked && (!plan.retiraCatalogo || $('#arq-import-retirada').checked) && (plan.altas > 0 || guardaPlano());
  $('#arq-import-go').disabled = !listo;
}

async function importar() {
  const site = sites.find(s => s.site_id === siteId);
  if (!site || !inv || !plan || corriendo || $('#arq-import-go').disabled) return;
  corriendo = true; actualizarBoton();
  const log = $('#arq-import-log'); log.replaceChildren();
  const paso = p => log.append(el('li', p.plano ? 'Plano: ' + ({ guardado: 'guardado', igual: 'ya estaba igual', omitido: 'no se toca', error: 'no se pudo guardar · ' + (p.error || '') })[p.estado]
    : p.estado === 'bloqueado' ? 'Alta detenida: hay equipos de catálogo que se retirarían y no lo has aceptado.'
    : p.ci + ': ' + ({ crear: 'creado', existe: 'ya existía, no se toca', saltado: 'no se crea (su padre no está)', error: 'error · ' + (p.error || '') })[p.estado], p.estado === 'error' || p.estado === 'saltado' || p.estado === 'bloqueado' ? 'err' : ''));
  status('Dando de alta…');
  try {
    const r = await T.importar({ inventario: inv, site, api, alPaso: paso, aceptaRetirada: $('#arq-import-retirada').checked, plano: { guardar: guardaPlano(), base: planoActual ? planoActual.sha : '' } });
    if (r.bloqueado) { status('Hay equipos de catálogo que se retirarían: revisa los avisos y acéptalo para seguir.', true); return; }
    const partes = [r.creados + ' CI creados', r.existentes + ' ya existían'];
    if (r.errores.length) partes.push(r.errores.length + ' con problemas');
    partes.push(r.plano && r.plano.ok ? (r.plano.omitido ? 'plano sin tocar' : r.plano.changed ? 'plano guardado' + (r.plano.seq ? ' (versión ' + r.plano.seq + ')' : '') : 'plano sin cambios') : 'el plano no se guardó');
    if (r.retiradosCatalogo) partes.push(r.retiradosCatalogo + ' equipos de catálogo retirados');
    const resumen = 'Resumen: ' + partes.join(' · ') + '.';
    const malo = r.errores.length > 0 || !(r.plano && r.plano.ok);
    status(malo ? 'Alta hecha con avisos: revisa la lista.' : 'Alta hecha. Ya lo tienes en el Inventario ITIL.', malo);
    if (!malo) { pendiente = null; guardar(null); }
    document.dispatchEvent(new CustomEvent('retailer-sites-imported'));
    await cargarSites(); pintarSites(); await elegir(siteId);
    $('#arq-import-summary').textContent = resumen;
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
for (const id of ['#arq-import-ok', '#arq-import-retirada', '#arq-import-plano']) $(id).onchange = actualizarBoton;
$('#arq-import-go').onclick = importar;
$('#arq-import-new-site').onclick = nuevoSite;
$('#arq-import-open').onclick = () => abrir(null);
$('#arq-import-close').onclick = () => { desarmar(); inv = null; avisosInv = []; pendiente = null; guardar(null); $('#arquitecto-import').hidden = true; $('#arq-import-preview').hidden = true; status(''); };
$('#arq-import-file').onchange = async e => {
  const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.size > T.MAX_JSON) { status(ERRORES.grande, true); return; }
  let obj; try { obj = JSON.parse(await f.text()); } catch (_) { status(ERRORES.json, true); return; }
  await prepararSesion();
  cargar(obj);
};
if (!tomarFragmento()) { try { const g = sessionStorage.getItem(GUARDA); if (g && T.leerFragmento('#arquitecto=' + g)) pendiente = g; } catch (_) {} }
window.addEventListener('hashchange', () => { if (tomarFragmento() && autenticado) abrir(pendiente); });
function alAutenticar(si) {
  autenticado = si;
  $('#arq-import-open').hidden = !autenticado;
  if (!autenticado) { desarmar(); inv = null; sites = []; sesion = null; $('#arquitecto-import').hidden = true; return; }
  if (pendiente) abrir(pendiente);
}
document.addEventListener('portal-auth', e => {
  if (e.detail?.kind !== 'retailer') return;
  alAutenticar(!!e.detail.authenticated);
});
// retailer-portal.js se carga antes (defer, en orden) y puede confirmar la sesión antes de que este
// script escuche: el 14-oct-2026 el «portal-auth» se perdió, el botón siguió oculto y el enlace del
// Arquitecto no abrió el panel. Si al cargar el área de trabajo ya está visible, la sesión ya entró.
if (document.getElementById('workspace') && !document.getElementById('workspace').hidden) alAutenticar(true);
})();
