// Importar inventario del Arquitecto (DCL-66d9ae0d5e756d0067127f24) · lo puro (sin DOM): leer, validar y planificar.
//
// El estudio del Arquitecto (admira.biz/arquitecto.html) inventaría un Xpacio desde fotos, vídeo o una descripción y
// manda aquí el plano (admira.xpacio-plano/1) y la lista de CI en el FRAGMENTO de la URL:
//   https://admira.app/retailer#arquitecto=v0.<base64url del JSON> | v1.<base64url del JSON en deflate-raw>
// El fragmento no viaja a ningún servidor; la cookie del portal es SameSite=Strict y admira.biz no puede llamar a
// la API del comercio, así que el alta la hace el propio titular, aquí, con su sesión y tras confirmarla.
// El contenido es NO CONFIABLE (cualquiera puede fabricar un enlace): se valida todo, se acota el tamaño (también
// el descomprimido) y no se ejecuta nada hasta que el titular elige establecimiento y pulsa «Dar de alta».
// Contrato compartido con clearchannel-tv (arquitecto-core.mjs): fixtures/arquitecto-traspaso.json en los dos repos.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YkArquitectoTraspaso = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  const SCHEMA = 'admira.arquitecto-inventario/1';
  const PLAN_SCHEMA = 'admira.xpacio-plano/1';
  const ITIL_RE = /^[A-Z0-9]{2,12}(-[A-Z0-9]{2,12}){1,3}$/;
  const PLAN_ID_RE = /^[A-Za-z0-9][\w.-]{0,159}$/;
  const CATEGORIAS = ['pantalla', 'player', 'tpv', 'audio', 'iot', 'red', 'kiosk', 'mobiliario', 'iluminacion', 'otro'];
  const ORIENTACIONES = ['', 'horizontal', 'vertical'];
  const MAX_FRAGMENTO = 200000;        // caracteres del enlace (el estudio no pasa de 120 000)
  const MAX_JSON = 300 * 1024;         // bytes del JSON, también descomprimido (el plano admite 256 KB)
  const MAX_PLAN = 256 * 1024;         // el límite de PUT /api/retailer/plano (413 plan_too_large)
  const MAX_CIS = 200;
  const LIMITES = { name: 160, role: 80, group_name: 80, position: 120 };

  const MAX_PROFUNDIDAD = 16;          // el plano de Yokup admite 12 niveles; el inventario envuelve al plano
  const texto = (v, max) => (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const cadena = v => v === undefined || v === null || typeof v === 'string';
  // Profundidad sin recursión (un JSON anidado miles de niveles revienta la pila de JSON.stringify o String()).
  function profundidad(raiz, tope) {
    const pila = [[raiz, 1]];
    let max = 0, nodos = 0;
    while (pila.length) {
      const [v, d] = pila.pop();
      if (v === null || typeof v !== 'object') continue;
      if (d > tope || ++nodos > 200000) return Infinity;
      if (d > max) max = d;
      for (const k in v) if (Object.prototype.hasOwnProperty.call(v, k)) pila.push([v[k], d + 1]);
    }
    return max;
  }
  const objeto = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const bytes = s => new TextEncoder().encode(s).length;

  // «#arquitecto=v1.xxx» → «v1.xxx» (o null). Acepta también el hash sin «#».
  function leerFragmento(hash) {
    const m = /^#?arquitecto=(v[01]\.[A-Za-z0-9_-]+)$/.exec(String(hash || ''));
    return m ? m[1] : null;
  }
  function deBase64url(s) {
    const b = s.replace(/-/g, '+').replace(/_/g, '/'), pad = b + '='.repeat((4 - b.length % 4) % 4);
    const bin = atob(pad), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Descomprime con tope: si el resultado pasa de `max` bytes, se corta y es un error (bomba de compresión).
  async function inflar(datos, max) {
    if (typeof DecompressionStream !== 'function') throw Object.assign(new Error('navegador'), { codigo: 'navegador' });
    const lector = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const trozos = []; let total = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) { try { await lector.cancel(); } catch (_) {} throw Object.assign(new Error('grande'), { codigo: 'grande' }); }
      trozos.push(value);
    }
    const out = new Uint8Array(total); let k = 0;
    for (const t of trozos) { out.set(t, k); k += t.byteLength; }
    return out;
  }
  // «v0.…» | «v1.…» → {ok, inventario} | {ok:false, error: 'formato'|'grande'|'json'|'navegador'|'esquema'…}
  async function decodificar(payload) {
    const s = String(payload || '');
    if (s.length > MAX_FRAGMENTO) return { ok: false, error: 'grande' };
    const m = /^(v[01])\.([A-Za-z0-9_-]+)$/.exec(s);
    if (!m) return { ok: false, error: 'formato' };
    let datos;
    try { datos = deBase64url(m[2]); } catch (_) { return { ok: false, error: 'formato' }; }
    try { if (m[1] === 'v1') datos = await inflar(datos, MAX_JSON); } catch (e) { return { ok: false, error: e.codigo || 'formato' }; }
    if (datos.byteLength > MAX_JSON) return { ok: false, error: 'grande' };
    let obj;
    try { obj = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(datos)); } catch (_) { return { ok: false, error: 'json' }; }
    return { ok: true, inventario: obj };
  }

  // Validación del inventario (todo lo que no cuadra es un error con su fila; nada se corrige en silencio salvo
  // recortar textos a su largo y quitar caracteres de control).
  function validar(inv) {
    const errores = [], avisos = [];
    const err = (codigo, fila, campo) => errores.push({ codigo, fila: fila == null ? -1 : fila, campo: campo || '' });
    if (!objeto(inv) || inv.schema !== SCHEMA) { err('esquema'); return { ok: false, errores, avisos, inventario: null }; }
    if (profundidad(inv, MAX_PROFUNDIDAD) > MAX_PROFUNDIDAD) { err('anidado'); return { ok: false, errores, avisos, inventario: null }; }
    const x = objeto(inv.xpacio) ? inv.xpacio : {};
    const plan = inv.plan;
    if (!objeto(plan) || plan.schema !== PLAN_SCHEMA || !Array.isArray(plan.paredes) || !Array.isArray(plan.pantallas) || !objeto(plan.planta)) err('plano');
    else {
      let n = 0;
      try { n = bytes(JSON.stringify(plan)); } catch (_) { n = Infinity; }
      if (n > MAX_PLAN) err('plano-grande');
      if (typeof plan.id !== 'string' || !PLAN_ID_RE.test(plan.id)) err('plano-id');
    }
    const lista = Array.isArray(inv.cis) ? inv.cis : null;
    if (!lista) err('cis');
    else if (lista.length > MAX_CIS) err('demasiados');
    const cis = [], codes = new Set();
    (lista || []).slice(0, MAX_CIS).forEach((c, i) => {
      if (!objeto(c)) { err('ci', i); return; }
      // Todo lo que se pinta o se manda tiene que ser texto (nada de objetos ni listas).
      for (const k of ['itil_code', 'name', 'category', 'role', 'group_name', 'position', 'orientation', 'parent_itil_code']) if (!cadena(c[k])) err('tipo', i, k);
      const code = typeof c.itil_code === 'string' ? c.itil_code : '';
      if (!ITIL_RE.test(code)) err('codigo', i, 'itil_code');
      else if (codes.has(code)) err('repetido', i, 'itil_code');
      codes.add(code);
      if (!CATEGORIAS.includes(c.category)) err('categoria', i, 'category');
      const name = texto(c.name, LIMITES.name);
      if (name.length < 2) err('nombre', i, 'name');
      const orientation = ORIENTACIONES.includes(c.orientation || '') ? (c.orientation || '') : null;
      if (orientation === null) err('orientacion', i, 'orientation');
      const parent = typeof c.parent_itil_code === 'string' ? c.parent_itil_code : '';
      if (parent && !ITIL_RE.test(parent)) err('padre', i, 'parent_itil_code');
      if (parent && parent === code) err('ciclo', i, 'parent_itil_code');
      cis.push({ itil_code: code, name, category: c.category, role: texto(c.role, LIMITES.role), group_name: texto(c.group_name, LIMITES.group_name),
        position: texto(c.position, LIMITES.position), orientation: orientation || '', parent_itil_code: parent });
    });
    // Un padre que no está en la lista tiene que existir ya en el establecimiento: se comprueba al planificar.
    for (const c of cis) if (c.parent_itil_code && !codes.has(c.parent_itil_code)) avisos.push({ codigo: 'padre-fuera', fila: cis.indexOf(c), campo: 'parent_itil_code' });
    if (tieneCiclo(cis)) err('ciclo');
    const inventario = errores.length ? null : {
      schema: SCHEMA, creado: texto(inv.creado, 40), origen: texto(inv.origen, 200),
      xpacio: { id: texto(x.id, 80), nombre: texto(x.nombre, 120), tipo: texto(x.tipo, 40) }, prefijo: texto(inv.prefijo, 12), plan, cis
    };
    return { ok: !errores.length, errores, avisos, inventario };
  }
  function tieneCiclo(cis) {
    const padre = new Map(cis.map(c => [c.itil_code, c.parent_itil_code]));
    for (const c of cis) {
      const vistos = new Set(); let k = c.itil_code;
      while (k && padre.has(k)) { if (vistos.has(k)) return true; vistos.add(k); k = padre.get(k); }
    }
    return false;
  }
  // Padres antes que hijos (players antes que pantallas).
  function ordenAlta(cis) {
    const por = new Map(cis.map(c => [c.itil_code, c])), hecho = new Set(), out = [];
    const visita = (c, pila) => {
      if (hecho.has(c.itil_code) || pila.has(c.itil_code)) return;
      pila.add(c.itil_code);
      const p = c.parent_itil_code && por.get(c.parent_itil_code);
      if (p) visita(p, pila);
      hecho.add(c.itil_code); out.push(c);
    };
    cis.forEach(c => visita(c, new Set()));
    return out;
  }

  // El plano para este establecimiento: en un Xpacio del catálogo su id es el admira_store_id (si no, Yokup responde
  // 400 plan_id_mismatch) y yokup.site_id, si viaja, el del establecimiento elegido.
  function ajustarPlan(plan, site) {
    const p = JSON.parse(JSON.stringify(plan));
    if (site && site.admira_store_id) p.id = site.admira_store_id;
    p.yokup = Object.assign({}, objeto(p.yokup) ? p.yokup : {}, { site_id: site && site.site_id });
    return p;
  }

  const CAMPOS = ['name', 'category', 'role', 'group_name', 'position', 'orientation', 'parent_itil_code'];
  // v1: SOLO ALTAS. Un CI cuyo código ya está en el establecimiento NO se toca ni se manda (sobrescribirlo cambiaría
  // su categoría, y con ella a quién llegan sus incidencias, sin vuelta atrás: itil_audit sólo guarda qué campos).
  // Por paso: crear · existe (ya está, no se toca) · padre (depende de un CI que no estará o está retirado/de catálogo).
  // catalogoActivo: equipos provisionales del catálogo vivos; el servidor los retira en CADA alta ITIL (itil.js,
  // retireCatalog), así que mientras haya alguno y se cree algo, el titular tiene que aceptarlo aparte.
  function planificar(inventario, existente) {
    const lista = (existente && existente.cis) || [];
    const actuales = new Map(lista.filter(c => c.itil_code).map(c => [c.itil_code, c]));
    const vivo = c => !!c && (c.managed_by || 'itil') === 'itil' && !(c.lifecycle && c.lifecycle.status === 'retired');
    const pasos = [], llegaran = new Set();
    for (const c of ordenAlta(inventario.cis)) {
      let accion = actuales.has(c.itil_code) ? 'existe' : 'crear';
      if (accion === 'crear' && c.parent_itil_code && !llegaran.has(c.parent_itil_code) && !vivo(actuales.get(c.parent_itil_code))) accion = 'padre';
      if (accion === 'crear' || (accion === 'existe' && vivo(actuales.get(c.itil_code)))) llegaran.add(c.itil_code);
      pasos.push({ ci: c, accion });
    }
    const stats = existente && existente.stats;
    const catalogoActivo = stats && Number.isInteger(stats.catalogo) ? stats.catalogo
      : lista.filter(c => c.managed_by === 'catalogo' && !(c.lifecycle && c.lifecycle.status === 'retired')).length;
    const altas = pasos.filter(p => p.accion === 'crear').length;
    return { pasos, altas, catalogoActivo, retiraCatalogo: altas > 0 ? catalogoActivo : 0 };
  }
  // Cuerpo de POST /api/retailer/itil/cis para un alta (todo lo de la fila; sin ciclo de vida, que lo pone el titular).
  function cuerpoCi(site, c) {
    const b = { site_id: site.site_id, itil_code: c.itil_code };
    for (const k of CAMPOS) b[k] = c[k] || '';
    return b;
  }

  // El alta, en orden: CI nuevos (padres antes) y después, si se pidió, el plano (así el cruce plano↔ITIL sale
  // enlazado). Las decisiones del titular llegan aquí: `aceptaRetirada` (retirar los provisionales del catálogo) y
  // `plano` = {guardar, base} con el sha256 que vio al revisar (si alguien lo cambió desde entonces: 409, no se pisa).
  // Idempotente: repetirla no escribe nada (lo que ya existe no se manda; el plano igual responde changed:false).
  // api(path, body, method) → Promise<json> que lanza {status, message} en error.
  async function importar({ inventario, site, api, alPaso, aceptaRetirada = false, plano = { guardar: true, base: '' } }) {
    const avisa = typeof alPaso === 'function' ? alPaso : () => {};
    const resumen = { creados: 0, existentes: 0, saltados: 0, errores: [], plano: null, retiradosCatalogo: 0 };
    const existente = await api('/itil/inventory?site_id=' + encodeURIComponent(site.site_id));
    const plan = planificar(inventario, existente);
    if (plan.retiraCatalogo && !aceptaRetirada) {
      resumen.bloqueado = 'retirada';
      avisa({ estado: 'bloqueado', error: 'retirada' });
      return resumen;
    }
    const fallidos = new Set();
    for (const p of plan.pasos) {
      const c = p.ci;
      if (p.accion === 'existe') { resumen.existentes++; avisa({ ci: c.itil_code, estado: 'existe' }); continue; }
      if (p.accion === 'padre' || (c.parent_itil_code && fallidos.has(c.parent_itil_code))) {
        resumen.saltados++; fallidos.add(c.itil_code);
        resumen.errores.push({ ci: c.itil_code, error: 'padre' });
        avisa({ ci: c.itil_code, estado: 'saltado', error: 'padre' }); continue;
      }
      try {
        const r = await api('/itil/cis', cuerpoCi(site, c));
        if (r && r.created === false) { resumen.existentes++; avisa({ ci: c.itil_code, estado: 'existe' }); }
        else { resumen.creados++; avisa({ ci: c.itil_code, estado: 'crear' }); }
        if (r && Array.isArray(r.retired_catalog)) resumen.retiradosCatalogo += r.retired_catalog.length;
      } catch (e) {
        fallidos.add(c.itil_code);
        resumen.errores.push({ ci: c.itil_code, error: (e && e.message) || 'error', status: e && e.status });
        avisa({ ci: c.itil_code, estado: 'error', error: (e && e.message) || 'error' });
      }
    }
    if (!plano || !plano.guardar) { resumen.plano = { ok: true, omitido: true }; avisa({ plano: true, estado: 'omitido' }); return resumen; }
    try {
      const r = await api('/plano', { site_id: site.site_id, plan: ajustarPlan(inventario.plan, site), base_sha256: plano.base || '' }, 'PUT');
      resumen.plano = { ok: true, changed: !(r && r.changed === false), created: !!(r && r.created), seq: r && r.seq };
      avisa({ plano: true, estado: resumen.plano.changed ? 'guardado' : 'igual' });
    } catch (e) {
      resumen.plano = { ok: false, error: (e && e.message) || 'error', status: e && e.status };
      avisa({ plano: true, estado: 'error', error: resumen.plano.error });
    }
    return resumen;
  }

  // Tipo de Xpacio del Arquitecto → tipo de establecimiento del portal (alta de establecimiento nuevo).
  const KINDS = new Map([['estanco', 'tobacco'], ['kiosco', 'kiosk'], ['supermercado', 'supermarket'], ['cafeteria', 'hospitality'], ['restaurante', 'hospitality'], ['panaderia', 'hospitality']]);
  function kindDe(tipo) { return KINDS.get(typeof tipo === 'string' ? tipo : '') || 'other'; }

  return { SCHEMA, ITIL_RE, CATEGORIAS, MAX_FRAGMENTO, MAX_JSON, MAX_PLAN, MAX_CIS, leerFragmento, decodificar, validar, ordenAlta, ajustarPlan, planificar, cuerpoCi, importar, kindDe };
});
