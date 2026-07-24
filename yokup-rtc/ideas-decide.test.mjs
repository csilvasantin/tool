import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  parseDecideOptions,
  ideaDeliberationText,
  buildDecideDecisionOptions,
} from './src/ideas-decide.js';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
// Espejo del invariante isInitialMissionDecision de index.js (6 opciones con la
// salida terminal): exactamente lo que la maquinaria de relojes exige a una tanda.
const isInitialMissionDecision = (opts) =>
  Array.isArray(opts) && opts.length === 6 && /volver\s+atr[aá]s|no\s+iniciar/i.test(String(opts[5] || ''));

// ── parseDecideOptions: robusto a lo que devuelva Workers AI ──────────────────
test('parseDecideOptions lee el objeto {opciones:[…]}', () => {
  const o = parseDecideOptions({opciones:['A','B','C','D','E','F']}, 5);
  assert.deepEqual(o, ['A','B','C','D','E']);
});
test('parseDecideOptions lee un array pelado y {options}', () => {
  assert.deepEqual(parseDecideOptions(['x','y'],5), ['x','y']);
  assert.deepEqual(parseDecideOptions({options:['p','q']},5), ['p','q']);
});
test('parseDecideOptions extrae JSON embebido en texto con markdown alrededor', () => {
  const raw = 'Claro, aquí tienes:\n```json\n{"opciones":["uno","dos","tres","cuatro","cinco"]}\n```';
  assert.deepEqual(parseDecideOptions(raw,5), ['uno','dos','tres','cuatro','cinco']);
});
test('parseDecideOptions cae a líneas numeradas o con viñeta', () => {
  const raw = '1) Primera acción\n2) Segunda acción\n- Tercera acción';
  assert.deepEqual(parseDecideOptions(raw,5), ['Primera acción','Segunda acción','Tercera acción']);
});
test('parseDecideOptions limpia comillas y marcadores de lista, no dígitos internos', () => {
  assert.deepEqual(parseDecideOptions(['"Hacer 3 cosas"'],5), ['Hacer 3 cosas']);
});
test('parseDecideOptions nunca lanza y siempre devuelve un array', () => {
  assert.deepEqual(parseDecideOptions(null,5), []);
  assert.deepEqual(parseDecideOptions(undefined,5), []);
  assert.ok(Array.isArray(parseDecideOptions(42,5)));
  assert.deepEqual(parseDecideOptions('',5), []);
});
test('parseDecideOptions respeta el tope n y recorta a 150 chars', () => {
  const many = Array.from({length:9},(_,i)=>'op'+i);
  assert.equal(parseDecideOptions(many,5).length, 5);
  const long = parseDecideOptions(['x'.repeat(400)],5)[0];
  assert.equal(long.length, 150);
});

// ── ideaDeliberationText: resume la deliberación del Consejo para el prompt ───
test('ideaDeliberationText resume pros/cons desde string JSON u objeto', () => {
  const review = {pros:[{text:'a favor 1'},{text:'a favor 2'}], cons:[{text:'en contra 1'}]};
  const txt = ideaDeliberationText(review);
  assert.match(txt, /A favor: a favor 1; a favor 2/);
  assert.match(txt, /En contra: en contra 1/);
  assert.equal(ideaDeliberationText(JSON.stringify(review)), txt);
});
test('ideaDeliberationText devuelve "" sin review o con basura', () => {
  assert.equal(ideaDeliberationText(null), '');
  assert.equal(ideaDeliberationText('no-json'), '');
  assert.equal(ideaDeliberationText({}), '');
});

// ── buildDecideDecisionOptions: 5 opciones + «Volver atrás» = decisión inicial ─
test('buildDecideDecisionOptions arma exactamente 6 con la salida al final', () => {
  const opts = buildDecideDecisionOptions(['1','2','3','4','5']);
  assert.equal(opts.length, 6);
  assert.equal(opts[5], 'Volver atrás');
  // Y es una decisión INICIAL válida para la maquinaria de relojes.
  assert.equal(isInitialMissionDecision(opts), true);
});
test('buildDecideDecisionOptions descarta vacías y recorta a 5', () => {
  const opts = buildDecideDecisionOptions(['a','','b','c','d','e','f']);
  assert.deepEqual(opts, ['a','b','c','d','e','Volver atrás']);
});

// ── Wiring en index.js (mismo estilo source-string del resto del harness) ─────
test('el esquema de ideas gana la columna aditiva decision_id', () => {
  assert.match(source, /ALTER TABLE ideas ADD COLUMN decision_id TEXT/);
});
test('POST /ideas/decide existe y es idempotente sobre una decisión viva', () => {
  assert.match(source, /url\.pathname === "\/ideas\/decide" && req\.method === "POST"/);
  assert.match(source, /prev\.status === "pending" && prev\.deadline > Date\.now\(\)/);
  assert.match(source, /existing: true/);
});
test('decide abre la ventana reutilizando los guardas del alta de decisiones', () => {
  assert.match(source, /async function openInitialMissionDecision/);
  assert.match(source, /resolveDecisionIdentity\(input\.agent, input\.machine\)/);
  assert.match(source, /exactDecisionProjectAssignment\(env, identity\.agent, identity\.machine, requestedProjectId\)/);
  assert.match(source, /resolveDecisionProject\(\{ \.\.\.input, agent: identity\.agent, machine: identity\.machine \}, assignment, null\)/);
  assert.match(source, /code: "exact_identity_required"/);
  assert.match(source, /code: "exact_project_required"/);
  assert.match(source, /isInitialMissionDecision\(opts\)/);
});
test('decide corre bajo NeoMini·Mac Mini, 3 min, recomendada 0, url /decisiones', () => {
  assert.match(source, /DECIDE_AGENT = "NeoMini"/);
  assert.match(source, /DECIDE_MACHINE = "admira-macmini"/);
  assert.match(source, /DECIDE_FALLBACK_PROJECT = "yokup-ideas-objetivos"/);
  assert.match(source, /DECIDE_URL = "https:\/\/www\.yokup\.com\/decisiones"/);
  assert.match(source, /minutes: 3/);
  assert.match(source, /recommended: 0/);
  assert.match(source, /buildDecideDecisionOptions\(options\)/);
});
test('el proyecto de la idea sólo se usa si está censado Y asignado; si no, respaldo', () => {
  assert.match(source, /let proj = idea\.project \? idx\.get\(idea\.project\) : null/);
  assert.match(source, /if \(!a \|\| String\(a\.id\) !== String\(proj\.id\)\) proj = null/);
  assert.match(source, /if \(!proj\) proj = idx\.get\(DECIDE_FALLBACK_PROJECT\)/);
});
test('la decisión lleva el idea id trazable (mission) y la idea guarda decision_id', () => {
  assert.match(source, /mission: idea\.id/);
  assert.match(source, /UPDATE ideas SET decision_id=\?, updated_at=\? WHERE id=\?/);
});
test('GET /ideas expone decision_id y sincroniza lazy con la decisión resuelta', () => {
  assert.match(source, /SELECT id,title,body,author,tag,status,created_at,updated_at,mission_id,seat,review,media,project,decision_id FROM ideas/);
  assert.match(source, /async function syncIdeaFromDecision/);
  assert.match(source, /UPDATE ideas SET status='mision', mission_id=\?, updated_at=\? WHERE id=\? AND status!='mision'/);
  assert.match(source, /const s = await syncIdeaFromDecision\(env, it\)/);
});
test('el camino viejo POST /ideas/promote sigue existiendo (enlazar a mano)', () => {
  assert.match(source, /url\.pathname === "\/ideas\/promote" && req\.method === "POST"/);
});
