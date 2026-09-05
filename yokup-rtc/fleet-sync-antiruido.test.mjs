import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {agentFamilyKey, agentFamilySqlKey} from './src/agent-identity.js';
import {onIdleProposalTitleKey} from './src/onidle-proposals.js';

// Anti-ruido de misiones de flota (misión DCL-b0e2a4, 05/09/2026): el bot de yokup no
// encarga trabajo, un texto sin sustancia no es misión, un asunto repetido se acumula y
// los GrokBot tienen cupo por hora.
const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
function extract(name) {
  const m = new RegExp(`(?:async\\s+)?function ${name}\\(`).exec(source); assert.ok(m, `falta ${name}`);
  const start = m.index, brace = source.indexOf('{', start); let depth = 0, quote = '', esc = false;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === quote) quote = ''; continue; }
    if ('"\'`'.includes(ch)) { quote = ch; continue; }
    if (ch === '{') depth += 1; else if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('función incompleta: ' + name);
}
const charla = source.match(/var FLEET_CHARLA_RE = (.*);/)[1];
const quota = Number(source.match(/var FLEET_GROKBOT_HOURLY_QUOTA = (\d+);/)[1]);
const build = new Function('onIdleProposalTitleKey', 'agentFamilySqlKey', 'agentFamilyKey', `
  var FLEET_CHARLA_RE = ${charla}; var FLEET_GROKBOT_HOURLY_QUOTA = ${quota}; var __name = (f) => f;
  ${extract('quitarPreambuloDeAgente')} ${extract('fleetEsRuido')} ${extract('fleetHourlyQuotaFor')} ${extract('fleetLiveTwin')} ${extract('fleetEsMision')}
  return {fleetEsMision, fleetEsRuido, fleetHourlyQuotaFor, fleetLiveTwin};`);
const F = build(onIdleProposalTitleKey, agentFamilySqlKey, agentFamilyKey);
const enc = (text, extra = {}) => ({ id: 1, text, target_persona: 'Neo', from_name: 'Carlos', ...extra });

test('el bot de yokup (Admirito) y los saludos no son misiones; un encargo real sí', () => {
  assert.equal(F.fleetEsMision(enc('Soy Admirito. 🗳 VENTANA DE DECISION · 1147 … ¿Qué mejora priorizamos?')), false);
  assert.equal(F.fleetEsMision(enc('Ventana abierta', { from_name: 'Admirito' })), false);
  assert.equal(F.fleetEsMision(enc('Soy Admirito.')), false);
  assert.equal(F.fleetEsMision(enc('ok')), false);
  assert.equal(F.fleetEsMision(enc('gracias Neo')), false);
  assert.equal(F.fleetEsMision(enc('Hola buenas')), false);
  assert.equal(F.fleetEsMision(enc('Neo: revisa el checkout de clearchannel.tv y publica el sello')), true);
  assert.equal(F.fleetEsMision(enc('Soy MorfeoMacMini y estoy corriendo en el ordenador MacMini. Neo: en MBP14 haz git pull de admira-vault y despliega')), true, 'el preámbulo se quita y la petición se conserva');
  assert.equal(F.fleetEsMision(enc('Hola Neo, necesito que subas la versión r6 de xpaceos hoy')), true, 'un saludo seguido de encargo largo sigue siendo misión');
});

test('cupo por hora sólo para los consejeros GrokBot', () => {
  assert.equal(F.fleetHourlyQuotaFor('DisneyGrokBot'), quota);
  assert.equal(F.fleetHourlyQuotaFor('WozniakGrokBot'), quota);
  assert.equal(F.fleetHourlyQuotaFor('NeoMBP14'), 0);
  assert.equal(F.fleetHourlyQuotaFor('MorfeoMacMini'), 0);
  assert.ok(quota >= 4 && quota <= 20);
});

test('un asunto repetido de la misma persona en 24 h se acumula en la misión viva', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE tickets (id TEXT PRIMARY KEY, subject TEXT, source TEXT, status TEXT, assignee TEXT, created_at INTEGER)');
  const now = Date.now();
  const ins = db.prepare('INSERT INTO tickets VALUES(?,?,?,?,?,?)');
  ins.run('FLT-1', 'Avisar a Oráculo del trono de Superman', 'fleet', 'open', 'LucasGrokBot', now - 3600e3);
  ins.run('FLT-2', 'Avisar a Oráculo del trono de Superman', 'fleet', 'resolved', 'LucasGrokBot', now - 7200e3);
  ins.run('FLT-3', 'Avisar a Oráculo del trono de Superman', 'fleet', 'open', 'JobsGrokBot', now - 600e3);
  ins.run('FLT-4', 'Otra cosa distinta', 'fleet', 'open', 'LucasGrokBot', now - 600e3);
  ins.run('FLT-5', 'Avisar a Oráculo del trono de Superman', 'fleet', 'open', 'LucasGrokBot', now - 30 * 3600e3);
  const env = { DB: { prepare(sql) { return { bind(...b) { return { all: async () => ({ results: db.prepare(sql).all(...b) }) }; } }; } } };
  const twin = await F.fleetLiveTwin(env, 'Avisar a Oráculo del trono de Superman', 'LucasGrokBot', now);
  assert.equal(twin && twin.id, 'FLT-1', 'la viva más antigua de la misma persona en 24 h');
  assert.equal(await F.fleetLiveTwin(env, 'Avisar a Oráculo del trono de Superman', 'NeoMBP14', now), null, 'otra persona no cuenta');
  assert.equal(await F.fleetLiveTwin(env, 'Asunto nuevo de verdad', 'LucasGrokBot', now), null);
});

test('fleetSync devuelve deduped y deferred y tiene tabla fleet_dedupe', () => {
  assert.match(source, /created, updated, rejected, deduped, deferred \}/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS fleet_dedupe/);
  assert.match(source, /SELECT mission_id FROM fleet_dedupe WHERE inbox_id=\?/);
  assert.match(source, /code:"hourly_quota"/);
});
