// FLT-985 c — «misión viva» = EN CURSO, y el reloj de decisión donde ya se mira.
// Pruebas de FORMA sobre el fuente de /equipo y sobre el módulo compartido, en el
// mismo estilo que el resto del repo: la página es un HTML de una pieza y no hay
// bundler que permita importarla, así que se comprueba el contrato en el texto.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const equipo = await readFile(new URL('./equipo.html', import.meta.url), 'utf8');
const modulo = await readFile(new URL('./yk-decisions.js', import.meta.url), 'utf8');

// ── c1 · viva = en curso ────────────────────────────────────────────────────
test('el contador de la cabecera cuenta lo EN CURSO, no todo lo no cerrado', () => {
  assert.match(equipo, /\$\("kMis"\)\.textContent=enCurso\(MIS\)\.length/);
  assert.match(equipo, /const enCurso=ms=>ms\.filter\(m=>m\.status==="in_progress"\)/);
});

test('una misión cancelada ya no entra en el saco de las misiones', () => {
  assert.match(equipo, /filter\(t=>t\.status!=="resolved"&&t\.status!=="cancelled"\)/);
});

test('el rótulo es singular y sin adverbios, y no vuelve el «misión(es) viva(s)»', () => {
  assert.match(equipo, /<span>Misión en curso<\/span>/);
  assert.match(equipo, /return "sin misión en curso";/);
  assert.ok(!/misi[oó]n\(es\)/.test(equipo), 'fuera los plurales entre paréntesis');
  assert.ok(!/sin misiones vivas|misiones activas/.test(equipo), 'fuera los rótulos viejos');
});

test('lo pendiente se dice aparte en vez de sumarse a lo vivo', () => {
  assert.ok(equipo.includes(`if(nCurso) return '<b>'+nCurso+'</b> en curso'`));
  assert.ok(equipo.includes(`class="mpend">· '+nPend+' pendiente<`));
  assert.ok(equipo.includes('rotuloMisiones(+p.missions||0,+p.missions_pending||0)'));
});

// ── c2 · el reloj abierto, en el mismo sitio ────────────────────────────────
test('/equipo monta el panel de decisiones del módulo compartido, sin copiarlo', () => {
  assert.match(equipo, /<section class="decs" id="decs" hidden>/);
  assert.match(equipo, /<div class="decs-list" id="decsList"><\/div>/);
  assert.match(equipo, /<script src="\/yk-decisions\.js\?v=/);
  assert.match(equipo, /YkDecisions\.mount\(\{worker:WORKER, onData:/);
  // ni un render propio de la ficha de decisión: card() sigue siendo del módulo
  assert.ok(!/dec-opts|dec-project-name/.test(equipo), '/equipo no debe pintar fichas de decisión por su cuenta');
});

test('la ficha del agente marca su reloj en el mismo renglón de sus misiones', () => {
  assert.match(equipo, /relojDe\(a\.name\|\|a\.id\)\+rotuloMisiones\(/);
  assert.match(equipo, /class="decreloj" href="#decs"/);
  assert.match(equipo, /DEC_PEND=\(ds\|\|\[\]\)\.filter\(function\(d\)\{ return d\.status==="pending"; \}\)/);
});

test('el módulo avisa de sus datos y sigue teniendo un único render', () => {
  assert.match(modulo, /if \(typeof config\.onData === "function"\)/);
  assert.ok((modulo.match(/function card\(/g) || []).length === 1, 'card\\(\\) es la única fuente de la ficha');
});

test('onData recibe las decisiones y un fallo suyo no deja el panel sin pintar', async () => {
  const items = [
    {id: 'DEC-1', status: 'pending', agent: 'infraNeo', machine: 'Mac Mini', surface: 'CLI',
     question: '¿Seguimos?', options: ['a','b','c','d','e','↩ Volver atrás'], recommended: 0,
     secondsLeft: 120, created_at: Date.now(), deadline: Date.now() + 120000, project: 'Yokup', project_slug: 'YOKUP'}
  ];
  const nodo = () => ({textContent: '', innerHTML: '', hidden: true, querySelectorAll: () => [], closest: () => null});
  const nodos = {decs: nodo(), decsList: nodo(), decsN: nodo()};
  const ctx = vm.createContext({
    window: {},
    document: {
      getElementById: (id) => nodos[id] || null,
      querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({}), head: {appendChild() {}},
      addEventListener() {}
    },
    fetch: async () => ({json: async () => ({ok: true, items})}),
    setInterval: () => 0, clearInterval: () => {}, Date
  });
  vm.runInContext(`${modulo}\nglobalThis.M = window.YkDecisions;`, ctx);
  const visto = [];
  ctx.M.mount({worker: 'https://ejemplo.invalid', onData: (ds) => { visto.push(ds); throw new Error('boom'); }});
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(visto.length, 1, 'onData se llama en el render');
  assert.equal(visto[0][0].agent, 'infraNeo');
  assert.match(nodos.decsList.innerHTML, /DEC-1/, 'el panel se pinta aunque onData reviente');
  assert.equal(nodos.decs.hidden, false);
});
