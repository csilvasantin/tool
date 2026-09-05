import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const names = ['isBackOption','isCustomOption','isInitialMissionDecision','isContinuationMissionDecision','isMissionDecision','orderedMissionOptions','continuationMissionOrder','remainingBatchItems'];
const functions = names.map((name) => source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0] || '').join('\n');
// isMissionDecision descarta por NOMBRE las ventanas de formación (9-ago-2026), así
// que el trozo de fuente que se evalúa aquí necesita también su marcador. Un sandbox
// hecho a mano tiene que crecer con las dependencias de lo que mete dentro.
const marcador = source.match(/var ACADEMY_DECISION_PARENT = [^\n]+;/)?.[0] || '';
const context = vm.createContext({});
vm.runInContext(`${marcador}\n${functions}\nglobalThis.contract={isInitialMissionDecision,isContinuationMissionDecision,isMissionDecision,orderedMissionOptions,continuationMissionOrder,remainingBatchItems};`, context);
const contract = context.contract;
const back = 'Volver atrás';
const custom = '✍️ Custom · Escribe la mejora que quieras a mano';

test('la decisión inicial conserva exactamente tres misiones, back y custom', () => {
  assert.equal(contract.isInitialMissionDecision(['1','2','3',back,custom]), true);
  assert.equal(contract.isInitialMissionDecision(['1','2','3',back]), false);
  assert.equal(contract.isInitialMissionDecision(['1','2',back]), false);
  assert.equal(contract.isInitialMissionDecision(['1','2','3',custom,back]), false);
});

test('las continuaciones aceptan la secuencia 2→1 más back sólo si están enlazadas', () => {
  for (const count of [2,1]) {
    const options = Array.from({length:count}, (_, i) => `Misión ${i + 1}`).concat(back);
    assert.equal(contract.isContinuationMissionDecision(options, {parent_decision:'DEC-parent',batch_id:'BATCH-parent'}), true);
    assert.equal(contract.isContinuationMissionDecision(options, {}), false);
  }
});

test('batch_id añadido a una decisión inicial no la reclasifica como continuación', () => {
  const initial = ['1','2','3',back,custom];
  assert.equal(contract.isContinuationMissionDecision(initial, {batch_id:'BATCH-initial'}), false);
  assert.equal(contract.isMissionDecision(initial, {batch_id:'BATCH-initial'}), true);
});

test('Custom materializa únicamente el texto escrito y no las tres propuestas', () => {
  const ordered = contract.orderedMissionOptions(['A','B','C',back,'✍️ Custom: Mi mejora propia'], 4);
  assert.deepEqual(Array.from(ordered, item => ({option_index:item.option_index,title:item.title})), [
    {option_index:4,title:'Mi mejora propia'}
  ]);
});

test('una propuesta normal materializa sólo la elegida; las otras son alternativas', () => {
  const ordered = contract.orderedMissionOptions(['A','B','C',back,custom], 1);
  assert.deepEqual(Array.from(ordered, item => ({option_index:item.option_index,title:item.title})), [
    {option_index:1,title:'B'}
  ]);
});

test('la continuación rota desde chosen sin crear ni duplicar elementos', () => {
  const queued = [1,2].map((n, position) => ({title:`Misión ${n}`,position}));
  const ordered = contract.continuationMissionOrder(['Misión 1','Misión 2',back], 1, queued);
  assert.deepEqual(Array.from(ordered, (item) => item.title), ['Misión 2','Misión 1']);
  assert.equal(new Set(Array.from(ordered, (item) => item.title)).size, 2);
});

test('rechaza completadas reintroducidas y títulos duplicados', () => {
  const queued = [{title:'Pendiente B',position:1},{title:'Pendiente C',position:2}];
  assert.equal(contract.continuationMissionOrder(['Completada A','Pendiente B',back], 0, queued).length, 0);
  assert.equal(contract.continuationMissionOrder(['Pendiente B','Pendiente B',back], 0, queued).length, 0);
});

test('reconcilia queued obsoletos contra ticket resolved/cancelled y deja sólo FLT-975/976', () => {
  const rows = [
    {mission_id:'FLT-973',title:'Antigua 973',status:'queued',ticket_status:'resolved',position:1},
    {mission_id:'FLT-974',title:'Antigua 974',status:'queued',ticket_status:'cancelled',position:2},
    {mission_id:'FLT-975',title:'Pendiente 975',status:'queued',ticket_status:'open',position:3},
    {mission_id:'FLT-976',title:'Pendiente 976',status:'queued',ticket_status:'open',position:4}
  ];
  const remaining = contract.remainingBatchItems(rows);
  assert.deepEqual(Array.from(remaining, (item) => item.mission_id), ['FLT-975','FLT-976']);
  assert.equal(contract.continuationMissionOrder(['Antigua 973','Antigua 974','Pendiente 975','Pendiente 976',back], 0, remaining).length, 0, 'las opciones obsoletas ya no pasan el contrato');
  assert.equal(contract.continuationMissionOrder(['Pendiente 975','Pendiente 976',back], 0, remaining).length, 2);
});

test('chosen, back y expiry conservan el desenlace contractual', () => {
  assert.match(source, /const effective = decision\.status === "decided" \? Number\(decision\.chosen\) : decision\.status === "expired" \? Number\(decision\.recommended\) : null/);
  assert.match(source, /const back = initial \? idx === 3 : idx === o\.length - 1 && isMissionDecision\(o, d\)/);
  assert.match(source, /custom_text requerido/);
  assert.match(source, /\.bind\(back \? "cancelled" : "decided", idx/);
});

test('parent_decision y batch_id migran, persisten y viajan en GET/POST', () => {
  assert.match(source, /ALTER TABLE decisions ADD COLUMN parent_decision TEXT/);
  assert.match(source, /ALTER TABLE decisions ADD COLUMN batch_id TEXT/);
  assert.match(source, /ALTER TABLE decisions ADD COLUMN option_targets TEXT/);
  // The shared atomic INSERT SELECT keeps the same ordered payload fields.
  const insert = source.match(/async function guardedAutomaticDecisionInsert\([^]*?\n\}/)?.[0] || '';
  assert.match(insert, /const columns='id,machine,agent,surface,question,options,recommended,status,created_at,deadline,url,mission,project,project_slug,parent_decision,batch_id,option_targets'/);
  assert.match(insert, /INSERT INTO decisions \(.*columns.*SELECT/);
  assert.match(insert, /automationFenceSql\('\?','\?','\?'\)/, 'automatic windows retain the publication barrier');
  assert.match(source, /guardedAutomaticDecisionInsert\(env,\[id,machine,agent,[^\n]*dproject,dprojectSlug,dparent,dbatch,JSON\.stringify\(targetContract\.targets\)\]/,
    'project, parent, batch and targets are passed to the same ordered columns');
  assert.match(source, /parent_decision: d\.parent_decision \|\| "", batch_id: d\.batch_id \|\| ""/);
});

test('el POST no trunca contratos largos ni admite dos continuaciones pendientes', () => {
  assert.match(source, /rawOpts\.length !== opts\.length/);
  assert.match(source, /SELECT id FROM decisions WHERE batch_id=\? AND status='pending' LIMIT 1/);
  assert.match(source, /error: "continuation_pending"/);
  assert.match(source, /batch\.status !== "awaiting_continuation"/);
});

test('el reloj horario permanece para decisiones ordinarias y excluye OnIdle', () => {
  assert.match(source, /var HOURLY_WINDOW_MS = 60 \* 60 \* 1000;/);
  assert.match(source, /error: "hourly_limit"/);
  assert.match(source, /if \(!continuation && !userOverride && !onIdle\)/);
  assert.match(source, /operationalOnIdleState\(env, decisionIdentity, requestedProjectId\)/);
  // la consulta mira los ultimos 60 min, no la clave de hora
  // openInitial mira solo la ultima (LIMIT 1); POST /decisions cuenta cuantas
  // decisiones ORDINARIAS caben, porque a mano el cupo es 6 y no 1.
  // EL CRITERIO CAMBIO (Carlos, 3-sep-2026: «el limite es por agente no por hora»).
  // Ya no es «una cada 60 minutos» sino UNA VIVA por agente: pendiente y dentro de
  // plazo. Una caducada dejo de reservar sitio, que es lo que impedia abrir una
  // propuesta real —la automatica de las 06:13, con opciones de hace 540 horas,
  // ocupaba el hueco—. Lo que se conserva es que las DOS puertas compartan criterio.
  // El «parent_decision» distingue las dos puertas del TOPE de los dos relojes vivos
  // que ya existian: los cuatro miran ahora lo mismo, pero se fijan estas dos.
  assert.equal((source.match(/parent_decision=''\) AND status='pending' AND deadline > \?/g) || []).length, 2,
    'las DOS puertas del tope comparten criterio: una ventana VIVA por agente');
  assert.doesNotMatch(source, /AND created_at > \? ORDER BY created_at DESC/,
    'ninguna puerta puede volver al reloj de 60 minutos');
  assert.doesNotMatch(source, /madridHourKey\(row\.created_at\) === hour/,
    'ya no se compara por clave de hora natural');
  // y el 409 dice CUANDO se podra
  // openInitial libera con SU unica previa; POST /decisions con la mas vieja de
  // las que siguen dentro de la hora, que es la que deja hueco primero.
  assert.match(source, /nextAt: Number\(previous\.deadline\)/);
  assert.match(source, /nextAt: Number\(masVieja\.deadline\)/);
});

test('una continuación reutiliza el batch, reordena queued y habilita una única activación', () => {
  const body = source.match(/async function ensureMissionBatchFromDecision\([^]*?\n\}/)?.[0] || '';
  assert.match(body, /if \(continuation\)/);
  assert.match(body, /batch\.status !== "awaiting_continuation"/);
  assert.match(body, /reconcileQueuedBatchItems\(env, batchId\)/);
  assert.match(body, /await env\.DB\.batch\(statements\)/, 'el reordenado se aplica atómicamente');
  assert.match(body, /SET status='active',pause_reason=NULL[\s\S]*status='awaiting_continuation'/);
  assert.match(body, /return activateNextMissionBatchItem\(env, batchId, decision\.id\)/);
  assert.equal((body.match(/INSERT OR IGNORE INTO mission_batches/g) || []).length, 1, 'el único INSERT pertenece a la rama inicial');
});

test('snapshot, activación y POST reconcilian estados reales antes de exponer remaining', () => {
  assert.match(source, /SELECT i\.\*,t\.status AS ticket_status FROM mission_batch_items i LEFT JOIN tickets t ON t\.id=i\.mission_id/);
  assert.match(source, /item\.ticket_status === "cancelled" \? "cancelled" : "completed"/);
  assert.ok((source.match(/reconcileQueuedBatchItems\(env,/g) || []).length >= 4);
});
