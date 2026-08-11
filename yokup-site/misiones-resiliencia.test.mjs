// Resiliencia del tablero de /misiones (fix 23-jul-2026, SubNeoMini).
// Cubre las TRES piezas del fix:
//   1) acceso.js: el wrapper de window.fetch reconoce el host de respaldo como
//      FIRMABLE (misma cookie HttpOnly + 401) además de api.yokup.com, sin tocar terceros.
//   2) misiones.html: el tablero hereda el fallback api.yokup.com→rtc.yokup.com.
//   3) misiones.html: un fallo de red NO se disfraza de «Sin misiones ✓» —
//      muestra un aviso honesto con reintento y no miente en los KPIs.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const accesoSrc   = await readFile(new URL('./acceso.js',    import.meta.url), 'utf8');
const missionsHtml = await readFile(new URL('./misiones.html', import.meta.url), 'utf8');
const inline = (missionsHtml.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/) || [])[1];

// ── base64url de un token con exp válido, para que sessionValid() sea true ──
function jwtWithExp(msFromNow) {
  const seg = Buffer.from(JSON.stringify({exp: Date.now() + msFromNow})).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return seg + '.sig';
}

// ── DOM/localStorage mock mínimo para que el IIFE de acceso.js corra entero ──
function mockDocForAcceso() {
  const el = () => ({
    textContent: '', innerHTML: '', src: '', async: false, defer: false,
    onload: null, onerror: null, style: {},
    classList: {add(){}, remove(){}, toggle(){}, contains(){return false;}},
    appendChild(){}, remove(){}, setAttribute(){}, getAttribute(){return null;},
    addEventListener(){}, querySelector(){return null;}, focus(){}
  });
  return {
    documentElement: el(), head: el(), body: el(),
    createElement: () => el(),
    getElementById: () => null,
    querySelector: () => null,
    addEventListener(){}
  };
}
function mockLocalStorage(initial) {
  const m = new Map(Object.entries(initial || {}));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k)
  };
}

// Corre acceso.js en un vm con una sesión (token) dada. Devuelve el contexto:
// window.fetch queda parcheado con el wrapper REAL, y rawFetch registra llamadas.
function runAcceso({token, authenticated = Boolean(token)} = {}) {
  const calls = [];
  const rawFetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : (input && input.url));
    calls.push({url, init});
    if (url.endsWith('/auth/session')) {
      return {ok: authenticated, status: authenticated ? 200 : 401,
        json: async () => authenticated ? ({ok: true, email: 'qa@example.com'}) : ({ok: false}),
        text: async () => ''};
    }
    return {ok: true, status: 200, json: async () => ({}), text: async () => ''};
  };
  const windowObj = {fetch: rawFetch};
  const ctx = vm.createContext({
    window: windowObj,
    document: mockDocForAcceso(),
    localStorage: mockLocalStorage(token ? {yk_session: token} : {}),
    location: {reload(){}},
    Headers, Promise, JSON, Date, Math,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    setTimeout, console
  });
  vm.runInContext(accesoSrc, ctx);
  return {ctx, windowObj, calls};
}

// ─────────────────────────── PIEZA 1 · acceso.js ───────────────────────────

test('acceso.js · signable() reconoce ambos hosts del worker y rechaza terceros', () => {
  const {ctx} = runAcceso({token: jwtWithExp(3_600_000)});
  const signable = ctx.window.__ykAccesoTest.signable;
  assert.equal(signable('https://api.yokup.com/tickets'), true, 'api.yokup.com es firmable');
  assert.equal(signable('https://rtc.yokup.com/tickets'), true, 'rtc.yokup.com (fallback) es firmable');
  assert.equal(signable('https://admira-telegram.csilvasantin.workers.dev/api/presence'), false, 'un tercero NO es firmable');
  assert.equal(signable('https://example.com/x'), false, 'un tercero NO es firmable');
  // Prefijo anclado: un host que sólo EMPIEZA parecido no cuela.
  assert.equal(signable('https://api.yokup.com.evil.example/x'), false, 'prefijo anclado, no cuela un homoglifo');
});

test('acceso.js · CON sesión: ambos hosts envían cookie HttpOnly; el tercero no', async () => {
  const token = jwtWithExp(3_600_000);
  const {windowObj, calls} = runAcceso({token});

  await windowObj.fetch('https://api.yokup.com/tickets?scope=fleet');
  await windowObj.fetch('https://rtc.yokup.com/tickets?scope=fleet');
  await windowObj.fetch('https://admira-telegram.csilvasantin.workers.dev/api/presence');

  const probe = calls.find(c => c.url.endsWith('/auth/session'));
  assert.equal(probe.init.headers.Authorization, 'Bearer ' + token,
    'el bearer antiguo sólo se usa una vez para migrar a cookie');
  for (const url of ['https://api.yokup.com/tickets?scope=fleet', 'https://rtc.yokup.com/tickets?scope=fleet']) {
    const call = calls.find(c => c.url === url);
    assert.equal(call.init.credentials, 'include', `${url} envía la cookie de sesión`);
    assert.ok(!call.init.headers || !call.init.headers.get || !call.init.headers.get('Authorization'),
      `${url} no expone bearer`);
  }
  // El tercero pasa por rawFetch intacto (sin credenciales reconstruidas).
  const thirdCall = calls.find(c => c.url.startsWith('https://admira-telegram.'));
  const third = thirdCall.init && thirdCall.init.headers;
  assert.ok(!third || !third.get || !third.get('Authorization'), 'el tercero NO recibe Bearer');
  assert.notEqual(thirdCall.init && thirdCall.init.credentials, 'include', 'el tercero NO recibe cookies forzadas');
});

test('acceso.js · SIN sesión: los hosts firmables esperan sesión; el tercero pasa igual que antes', async () => {
  const {windowObj, calls} = runAcceso({authenticated: false}); // sin cookie → sessionReady pendiente

  // Host firmable sin sesión: el wrapper NO llama a rawFetch (espera login),
  // exactamente el comportamiento previo de api.yokup.com.
  windowObj.fetch('https://api.yokup.com/tickets');
  windowObj.fetch('https://rtc.yokup.com/tickets');
  // Tercero: pasa directo a rawFetch, sin Bearer, idéntico a hoy.
  windowObj.fetch('https://admira-telegram.csilvasantin.workers.dev/api/presence');

  await new Promise(r => setTimeout(r, 10));
  const appCalls = calls.filter(c => !c.url.endsWith('/auth/session'));
  assert.equal(appCalls.length, 1, 'sólo el tercero llega a la red; los firmables esperan sesión');
  assert.equal(appCalls[0].url, 'https://admira-telegram.csilvasantin.workers.dev/api/presence');
  const h = appCalls[0].init && appCalls[0].init.headers;
  assert.ok(!h || !h.get || !h.get('Authorization'), 'el tercero sigue sin Bearer');
});

// ──────────────────── PIEZAS 2 y 3 · tablero de misiones ────────────────────

// Mock de DOM del tablero (mismo espíritu que /tmp/harness_mis.mjs del diagnóstico).
function makeEl(id) {
  const cl = new Set();
  const el = {
    id, value: '', innerHTML: '', textContent: '', _on: {},
    classList: {add: c => cl.add(c), remove: c => cl.delete(c),
      toggle: (c, f) => {if (f === undefined) f = !cl.has(c); f ? cl.add(c) : cl.delete(c); return f;},
      contains: c => cl.has(c)},
    get className() {return [...cl].join(' ');},
    set className(v) {cl.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => cl.add(c));},
    addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {},
    setAttribute() {}, getAttribute() {return null;}, focus() {}, closest() {return null;},
    querySelectorAll() {return [];}, querySelector() {return null;},
    get options() {return [...String(el.innerHTML).matchAll(/<option value="([^"]*)"/g)].map(x => ({value: x[1]}));},
    set onchange(f) {el._on.change = f;}, get onchange() {return el._on.change;},
    set onclick(f) {el._on.click = f;}, get onclick() {return el._on.click;}
  };
  return el;
}

function makeBoard() {
  const REG = {};
  const listeners = {};
  const getById = id => REG[id] || (REG[id] = makeEl(id));
  const document = {
    getElementById: getById, querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, createElement: () => makeEl('x'),
    body: makeEl('body'), head: makeEl('head'), documentElement: makeEl('html')
  };
  const estadoDe = t => {
    const s = t.status;
    if (s === 'resolved') return {l: 'Finalizada'};
    if (s === 'in_progress') return {l: 'En curso'};
    if (s === 'open' || s === 'pending') return t.assignee ? {l: 'Pendiente'} : {l: 'Sin asignar'};
    return {l: 'Sin asignar'};
  };
  const YkMisiones = {
    init() {}, customizeReady: 0, setProyectos() {}, setLiveMachines() {},
    machineOf: t => t.machine || t.loc || '', canonMachine: x => String(x || ''),
    estadoDe, coincideEstado: () => true, tercios: () => ({done: 0, total: 3, txt: '0/3'}),
    fetchAllTasks: async () => [], bindRows() {}, markWorking() {}, fillActivity() {},
    rowHtml: t => `<div class="tk" data-id="${t.id}"></div>`,
    boardPrefs: () => ({})
  };
  const YkDecisions = {mount() {}};
  const YkCabezal = {mount: () => ({setDay(d) {getById('selDia').value = d;}})};

  // fetch escenificable: MODE decide qué host RECHAZA (fallo de red).
  const state = {mode: 'ok', tickets: [], ticketQueue: []};
  const fetchStub = async (url) => {
    url = String(url);
    const isApi = url.startsWith('https://api.yokup.com');
    const isFb  = url.startsWith('https://rtc.yokup.com');
    if (isApi && (state.mode === 'apiDown' || state.mode === 'bothDown')) throw new TypeError('net-api');
    if (isFb && state.mode === 'bothDown') throw new TypeError('net-fb');
    if (url.includes('/tickets') && state.ticketQueue.length) return state.ticketQueue.shift();
    const body = url.includes('/projects') ? {projects: []}
      : url.includes('/tickets') ? {tickets: state.tickets, stats: {}}
      : url.includes('/tasks/all') ? {tasks: []}
      : {items: [], presence: [], browsers: []};
    return {ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body)};
  };
  const windowObj = {fetch: fetchStub,
    addEventListener(type, fn) {(listeners[type] = listeners[type] || []).push(fn);}
  }; // window.ykFetch NO existe: se prueba el fallback local ykf

  const ctx = vm.createContext({
    document, window: windowObj, console,
    fetch: fetchStub, alert() {}, confirm: () => true,
    setInterval: () => 0, setTimeout: (f) => {if (typeof f === 'function') f(); return 0;}, clearInterval: () => {},
    YkMisiones, YkDecisions, YkCabezal,
    Date, Math, JSON, Set, Map, Object, Array, String, Number, Boolean, RegExp, Promise,
    Headers: class {set() {} get() {} }
  });
  vm.runInContext(inline, ctx);
  vm.runInContext('globalThis.__load = load;', ctx);
  return {ctx, getById, state,
    changeProject(project_id) {(listeners['yk:project-change'] || []).forEach(fn => fn({detail:{project_id}}));}
  };
}

function todayTicket(over) {
  return {id: 'FLT-1001', subject: 'Alfa', status: 'in_progress', assignee: 'Oraculo',
    machine: 'MacMini', created_at: Date.now(), ...over};
}

test('tablero · fetch OK: pinta las filas de la misión', async () => {
  const {ctx, getById, state} = makeBoard();
  state.mode = 'ok';
  state.tickets = [todayTicket()];
  await ctx.__load();
  await new Promise(resolve => setImmediate(resolve));
  const html = getById('list').innerHTML;
  assert.match(html, /data-id="FLT-1001"/, 'la fila de la misión aparece pintada');
  assert.doesNotMatch(html, /No se pudo cargar/, 'no hay aviso de error en el camino feliz');
});

test('tablero · api.yokup.com RECHAZA pero el fallback rtc.yokup.com responde: pinta filas vía fallback', async () => {
  const {ctx, getById, state} = makeBoard();
  state.mode = 'apiDown';           // api.yokup.com cae; rtc.yokup.com sigue
  state.tickets = [todayTicket()];
  await ctx.__load();
  await new Promise(resolve => setImmediate(resolve));
  const html = getById('list').innerHTML;
  assert.match(html, /data-id="FLT-1001"/, 'el fallback recupera las misiones y las pinta');
  assert.doesNotMatch(html, /No se pudo cargar/, 'con fallback OK no se muestra error');
});

test('tablero · AMBOS hosts caídos: aviso honesto + KPIs «—», nunca «Sin misiones ✓»', async () => {
  const {ctx, getById, state} = makeBoard();
  state.mode = 'bothDown';          // api Y rtc.yokup.com caen
  state.tickets = [todayTicket()];
  await ctx.__load();
  const html = getById('list').innerHTML;
  assert.match(html, /No se pudo cargar el tablero/, 'muestra el aviso honesto');
  assert.match(html, /id="tkRetry"/, 'ofrece botón de reintento');
  assert.doesNotMatch(html, /Sin misiones/, 'NO se disfraza de tablero vacío');
  for (const k of ['kAsig', 'kProg', 'kNoCon', 'kRes', 'kDel']) {
    assert.equal(getById(k).textContent, '—', `el KPI ${k} no miente con un 0`);
  }
});

test('tablero · fetch OK sin misiones: vacío legítimo «Sin misiones ✓» (no es error)', async () => {
  const {ctx, getById, state} = makeBoard();
  state.mode = 'ok';
  state.tickets = [];               // de verdad no hay misiones
  await ctx.__load();
  const html = getById('list').innerHTML;
  assert.match(getById('missionEmpty').textContent, /Sin misiones/, 'un vacío real sí puede decir Sin misiones');
  assert.doesNotMatch(html, /No se pudo cargar/, 'un vacío real no es un error de red');
});

test('tablero · una carga vieja suspendida no repinta después de cambiar project_id', async () => {
  const {ctx, getById, state, changeProject} = makeBoard();
  let releaseOld;
  state.ticketQueue.push(new Promise(resolve => { releaseOld = resolve; }));
  const oldLoad = ctx.__load();

  state.tickets = [todayTicket({id:'FLT-NEW', project:'xpaceos'})];
  changeProject('xpaceos');
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.match(getById('list').innerHTML, /data-id="FLT-NEW"/, 'la generación nueva pinta su scope');

  releaseOld({ok:true,status:200,json:async()=>({tickets:[todayTicket({id:'FLT-OLD',project:'admira-tv'})],stats:{}})});
  await oldLoad;
  await new Promise(resolve => setImmediate(resolve));
  const html=getById('list').innerHTML;
  assert.match(html, /data-id="FLT-NEW"/);
  assert.doesNotMatch(html, /FLT-OLD|No se pudo cargar/, 'la respuesta vieja no toca filas ni error');
});
