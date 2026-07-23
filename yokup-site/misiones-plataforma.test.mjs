// La 2ª línea de la celda AGENTE = PLATAFORMA REAL, no el estado (fix 23-jul-2026,
// SubNeoMini). Encargo de Carlos: «porque pone que la plataforma es pendiente? o es
// CLI o es Desktop». Ese hueco reutilizaba «Pendiente» (estado del claim) cuando la
// misión no estaba reclamada; ahora muestra SIEMPRE «RUNTIME · SUPERFICIE» del agente
// asignado deducido de la presencia viva (radar → setLiveSurfaces). Sin claim y sin
// presencia → «—» honesto, jamás «Pendiente». El estado sigue vivo en su insignia.
//
// El módulo es un script clásico (expone window.YkMisiones) y lee window.ykAgentIdentity
// para colapsar NeoMini→Neo / Morfeo16→Morfeo; se cargan AMBOS tal cual en un vm.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const identSrc = await readFile(new URL('./yk-agent-identity.js', import.meta.url), 'utf8');
const misSrc   = await readFile(new URL('./yk-misiones.js', import.meta.url), 'utf8');

function loadModule() {
  const noop = () => {};
  const windowObj = {};
  const documentObj = {addEventListener: noop, querySelector: () => null};
  const ctx = vm.createContext({
    window: windowObj, document: documentObj,
    localStorage: {getItem: () => null, setItem: noop, removeItem: noop},
    Date, Math, JSON, Promise, RegExp, Object, Array, String, Number, Boolean,
    setTimeout, clearTimeout, console
  });
  vm.runInContext(identSrc, ctx);   // define window.ykAgentIdentity
  vm.runInContext(misSrc, ctx);     // define window.YkMisiones (ya lo puede leer)
  return {YK: windowObj.YkMisiones, win: windowObj};
}
const {YK} = loadModule();

// Presencia viva REAL simulada (23-jul-2026): NeoMini/SmithMini en el Mac Mini por
// CLI, Morfeo16 en el MacBook Pro 16 por Desktop. Se indexa como lo hace el radar:
// por nombre pelado Y por persona base.
function setPresencia(pares) {
  const SURF = {};
  for (const {persona, runtime, host} of pares) {
    const sf = {runtime, host};
    const kf = YK.agentKey(persona), kb = YK.baseAgentKey(persona);
    if (kf && !SURF[kf]) SURF[kf] = sf;
    if (kb && SURF[kb] === undefined) SURF[kb] = sf;
  }
  YK.setLiveSurfaces(SURF);
  return SURF;
}
const platDe = html => (String(html).match(/<small class="agent-surface[^"]*"[^>]*>([^<]*)<\/small>/) || [,''])[1];

// ── El caso del encargo: asignada SIN claim, agente vivo por CLI → «Claude · CLI».
test('sin claim + agente CLI vivo ⇒ «Claude · CLI» (nunca «Pendiente»)', () => {
  setPresencia([{persona: 'NeoMini', runtime: 'Claude', host: 'cli'}]);
  assert.equal(YK.liveSurfaceOf(['NeoMini']), 'Claude · CLI');
  const html = YK.whoHtml('NeoMini', '', ['NeoMini'], null);
  assert.equal(platDe(html), 'Claude · CLI');
  assert.doesNotMatch(html, /Pendiente/);
});

// ── El apellido de máquina no rompe la resolución: NeoMini casa por persona base,
//    y una misión asignada al pelado «Neo» casa con la presencia de «NeoMini». ──
test('naming: NeoMini↔Neo y Morfeo16↔Morfeo colapsan por persona base', () => {
  setPresencia([
    {persona: 'NeoMini',  runtime: 'Claude', host: 'cli'},
    {persona: 'Morfeo16', runtime: 'Claude', host: 'app'}
  ]);
  assert.equal(YK.liveSurfaceOf(['Neo']), 'Claude · CLI');        // assignee pelado ↔ presencia NeoMini
  assert.equal(YK.liveSurfaceOf(['Morfeo16']), 'Claude · Desktop');
  assert.equal(YK.liveSurfaceOf(['Morfeo']), 'Claude · Desktop'); // pelado ↔ presencia Morfeo16
});

// ── El nombre COMPLETO se resuelve primero; runtime no-Claude también. ──
test('nombre completo primero + runtime Grok', () => {
  setPresencia([{persona: 'SmithMini', runtime: 'Grok', host: 'cli'}]);
  assert.equal(YK.liveSurfaceOf(['SmithMini']), 'Grok · CLI');
  assert.equal(YK.liveSurfaceOf(['Smith']), 'Grok · CLI');
});

// ── Con CLAIM manda la superficie del claim (lo de siempre), sin tocar presencia. ──
test('con claim ⇒ la superficie del claim, intacta', () => {
  setPresencia([{persona: 'NeoMini', runtime: 'Claude', host: 'cli'}]);
  const html = YK.whoHtml('Oraculo16', 'Codex · Desktop', ['Oraculo16'], null);
  assert.equal(platDe(html), 'Codex · Desktop');
});

// ── Agente SIN presencia viva ⇒ «—» honesto, nunca «Pendiente». ──
test('agente sin presencia ⇒ «—» (jamás «Pendiente»)', () => {
  setPresencia([{persona: 'NeoMini', runtime: 'Claude', host: 'cli'}]);
  assert.equal(YK.liveSurfaceOf(['Trinity']), '');   // Trinity no late
  const html = YK.whoHtml('Trinity', '', ['Trinity'], null);
  assert.equal(platDe(html), '—');
  assert.doesNotMatch(html, /Pendiente/);
});

// ── Sin datos de presencia todavía (null) ⇒ «—», sin petar. ──
test('LIVE_SURFACES aún null ⇒ «—» sin petar', () => {
  YK.setLiveSurfaces(null);
  assert.doesNotThrow(() => YK.liveSurfaceOf(['NeoMini']));
  assert.equal(YK.liveSurfaceOf(['NeoMini']), '');
  assert.equal(platDe(YK.whoHtml('NeoMini', '', ['NeoMini'], null)), '—');
});

// ── Runtime sin host confirmado ⇒ solo el runtime (deducir como las reclamadas). ──
test('presencia con runtime pero sin host ⇒ solo el runtime', () => {
  setPresencia([{persona: 'NeoMini', runtime: 'Claude', host: ''}]);
  assert.equal(YK.liveSurfaceOf(['NeoMini']), 'Claude');
});

// ── La máquina destino apagada sigue avisando cuando no hay claim ni presencia. ──
test('sin claim ni presencia pero máquina apagada ⇒ «⚠️ apagada» (aviso conservado)', () => {
  YK.setLiveSurfaces(null);
  const html = YK.whoHtml('Neo', '', ['Neo'], {machine: 'MacBookAirRosa', since: Date.now()});
  assert.match(platDe(html), /apagada/);
});

// ── Null-safe con formas raras del payload. ──
test('null-safe: agents vacío/undefined y nombres vacíos no petan', () => {
  setPresencia([{persona: 'NeoMini', runtime: 'Claude', host: 'cli'}]);
  assert.doesNotThrow(() => YK.liveSurfaceOf([]));
  assert.equal(YK.liveSurfaceOf([]), '');
  assert.doesNotThrow(() => YK.liveSurfaceOf(undefined));
  assert.doesNotThrow(() => YK.liveSurfaceOf([null, '', undefined]));
  assert.equal(YK.liveSurfaceOf([null, '', undefined]), '');
  assert.doesNotThrow(() => YK.whoHtml('Neo', '', undefined, null));
});
