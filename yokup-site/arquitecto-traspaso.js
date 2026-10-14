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

  const texto = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
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
    const x = objeto(inv.xpacio) ? inv.xpacio : {};
    const plan = inv.plan;
    if (!objeto(plan) || plan.schema !== PLAN_SCHEMA || !Array.isArray(plan.paredes) || !Array.isArray(plan.pantallas) || !objeto(plan.planta)) err('plano');
    else {
      let n = 0;
      try { n = bytes(JSON.stringify(plan)); } catch (_) { n = Infinity; }
      if (n > MAX_PLAN) err('plano-grande');
      if (!PLAN_ID_RE.test(String(plan.id || ''))) err('plano-id');
    }
    const lista = Array.isArray(inv.cis) ? inv.cis : null;
    if (!lista) err('cis');
    else if (lista.length > MAX_CIS) err('demasiados');
    const cis = [], codes = new Set();
    (lista || []).slice(0, MAX_CIS).forEach((c, i) => {
      if (!objeto(c)) { err('ci', i); return; }
      const code = String(c.itil_code || '');
      if (!ITIL_RE.test(code)) err('codigo', i, 'itil_code');
      else if (codes.has(code)) err('repetido', i, 'itil_code');
      codes.add(code);
      if (!CATEGORIAS.includes(c.category)) err('categoria', i, 'category');
      const name = texto(c.name, LIMITES.name);
      if (name.length < 2) err('nombre', i, 'name');
      const orientation = ORIENTACIONES.includes(c.orientation || '') ? (c.orientation || '') : null;
      if (orientation === null) err('orientacion', i, 'orientation');
      const parent = String(c.parent_itil_code || '');
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
  // Qué se hará con cada CI frente al inventario actual del establecimiento (GET /itil/inventory):
  // crear · actualizar (existe con otros datos; sólo se mandan los campos con valor) · igual (nada que hacer) ·
  // conflicto (el código es un CI de catálogo o retirado aquí) · padre (depende de un CI que no estará).
  function planificar(inventario, existente) {
    const actuales = new Map(((existente && existente.cis) || []).filter(c => c.itil_code).map(c => [c.itil_code, c]));
    const pasos = [], llegaran = new Set();
    for (const c of ordenAlta(inventario.cis)) {
      const ya = actuales.get(c.itil_code);
      let accion = 'crear';
      if (ya && (ya.managed_by && ya.managed_by !== 'itil')) accion = 'conflicto';
      else if (ya && ya.lifecycle && ya.lifecycle.status === 'retired') accion = 'conflicto';
      else if (ya) accion = CAMPOS.every(k => (c[k] || '') === (ya[k] == null ? '' : String(ya[k])) || (!c[k] && k !== 'category')) ? 'igual' : 'actualizar';
      const padre = c.parent_itil_code && actuales.get(c.parent_itil_code);
      const padreVivo = padre && (padre.managed_by || 'itil') === 'itil' && !(padre.lifecycle && padre.lifecycle.status === 'retired');
      if (c.parent_itil_code && !llegaran.has(c.parent_itil_code) && !padreVivo) accion = 'padre';
      if (accion !== 'conflicto' && accion !== 'padre') llegaran.add(c.itil_code);
      pasos.push({ ci: c, accion });
    }
    const itil = ((existente && existente.cis) || []).filter(c => c.managed_by === 'itil').length;
    const catalogo = ((existente && existente.cis) || []).filter(c => c.managed_by === 'catalogo' && !(c.lifecycle && c.lifecycle.status === 'retired')).length;
    return { pasos, retiraCatalogo: itil === 0 && catalogo > 0 && pasos.some(p => p.accion === 'crear') ? catalogo : 0 };
  }
  // Cuerpo de POST /api/retailer/itil/cis: al crear, todo; al actualizar, sólo lo que trae valor (lo omitido se conserva).
  function cuerpoCi(site, c, accion) {
    const b = { site_id: site.site_id, itil_code: c.itil_code };
    for (const k of CAMPOS) if (accion === 'crear' || c[k]) b[k] = c[k] || '';
    return b;
  }

  // El alta, en orden: CI (padres antes) y después el plano (así el cruce plano↔ITIL sale enlazado). Idempotente:
  // repetirla no escribe nada (los CI iguales no se mandan y el plano igual responde changed:false).
  // api(path, body, method) → Promise<json> que lanza {status, message} en error.
  async function importar({ inventario, site, api, alPaso }) {
    const avisa = typeof alPaso === 'function' ? alPaso : () => {};
    const resumen = { creados: 0, actualizados: 0, iguales: 0, saltados: 0, errores: [], plano: null, retiradosCatalogo: 0 };
    const existente = await api('/itil/inventory?site_id=' + encodeURIComponent(site.site_id));
    const { pasos } = planificar(inventario, existente);
    const fallidos = new Set();
    for (const p of pasos) {
      const c = p.ci;
      if (p.accion === 'igual') { resumen.iguales++; avisa({ ci: c.itil_code, estado: 'igual' }); continue; }
      if (p.accion === 'conflicto' || p.accion === 'padre' || (c.parent_itil_code && fallidos.has(c.parent_itil_code))) {
        resumen.saltados++; fallidos.add(c.itil_code);
        resumen.errores.push({ ci: c.itil_code, error: p.accion === 'conflicto' ? 'conflicto' : 'padre' });
        avisa({ ci: c.itil_code, estado: 'saltado', error: p.accion === 'conflicto' ? 'conflicto' : 'padre' }); continue;
      }
      try {
        const r = await api('/itil/cis', cuerpoCi(site, c, p.accion));
        if (r && r.changed === false) resumen.iguales++; else if (p.accion === 'crear') resumen.creados++; else resumen.actualizados++;
        if (r && Array.isArray(r.retired_catalog)) resumen.retiradosCatalogo += r.retired_catalog.length;
        avisa({ ci: c.itil_code, estado: r && r.changed === false ? 'igual' : p.accion });
      } catch (e) {
        fallidos.add(c.itil_code);
        resumen.errores.push({ ci: c.itil_code, error: (e && e.message) || 'error', status: e && e.status });
        avisa({ ci: c.itil_code, estado: 'error', error: (e && e.message) || 'error' });
      }
    }
    // El plano: con el sha256 vigente como base (sin pisar a nadie); igual → changed:false.
    try {
      let base = '';
      try { const actual = await api('/plano?site_id=' + encodeURIComponent(site.site_id)); base = (actual && actual.current && actual.current.sha256) || ''; } catch (e) { if (!e || e.status !== 404) throw e; }
      const r = await api('/plano', { site_id: site.site_id, plan: ajustarPlan(inventario.plan, site), base_sha256: base }, 'PUT');
      resumen.plano = { ok: true, changed: !(r && r.changed === false), created: !!(r && r.created), seq: r && r.seq };
      avisa({ plano: true, estado: resumen.plano.changed ? 'guardado' : 'igual' });
    } catch (e) {
      resumen.plano = { ok: false, error: (e && e.message) || 'error', status: e && e.status };
      avisa({ plano: true, estado: 'error', error: resumen.plano.error });
    }
    return resumen;
  }

  // Tipo de Xpacio del Arquitecto → tipo de establecimiento del portal (alta de establecimiento nuevo).
  function kindDe(tipo) {
    return { estanco: 'tobacco', kiosco: 'kiosk', supermercado: 'supermarket', cafeteria: 'hospitality', restaurante: 'hospitality', panaderia: 'hospitality' }[tipo] || 'other';
  }

  return { SCHEMA, ITIL_RE, CATEGORIAS, MAX_FRAGMENTO, MAX_JSON, MAX_PLAN, MAX_CIS, leerFragmento, decodificar, validar, ordenAlta, ajustarPlan, planificar, cuerpoCi, importar, kindDe };
});
