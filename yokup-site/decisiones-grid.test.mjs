import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./yk-decisions.js', import.meta.url), 'utf8');
const page = await readFile(new URL('./decisiones.html', import.meta.url), 'utf8');
const equipo = await readFile(new URL('./equipo.html', import.meta.url), 'utf8');
const context = vm.createContext({window: {}});
vm.runInContext(
  `${source}\nglobalThis.renderDecisionGridRows = window.YkDecisions._test.renderDecisionGridRows; globalThis.decisionGridDuration = window.YkDecisions._test.durationText;`,
  context
);

function decision(status, extra = {}) {
  return {
    id: `DEC-${status}-17`, display_ref: `DCL-08/${status}`,
    machine: 'Mac Mini', agent: 'SubOraculoMini', surface: 'cli',
    project: 'Yokup', project_slug: 'YOKUP', project_id: 'project-yokup',
    question: '¿Qué mejora priorizamos?',
    options: ['Capturar proceso', 'Ordenar cabezales', 'Revisar contraste', 'Volver atrás'],
    recommended: 1, chosen: 0, chosen_by: 'Carlos', status,
    created_at: 1_700_000_000_000, deadline: 1_700_000_300_000,
    decided_at: 1_700_000_180_000,
    ...extra
  };
}

test('el histórico declara una hoja con los seis encabezados contratados', () => {
  assert.match(page, /id="decisionGrid"[^>]*role="table"/);
  assert.match(page, /class="decision-grid-head"[^>]*role="row"/);
  assert.match(page, /id="decsHistList"/);
  assert.match(source, /class=\"decision-grid-hour\" role=\"rowgroup\"/);
  const columns = Array.from(page.matchAll(/data-decision-col="([^"]+)"/g), match => match[1]);
  assert.deepEqual(columns, ['agent', 'project', 'decision', 'result', 'state', 'time']);
});

test('una decisión cerrada se convierte en una sola fila estable y ordenable', () => {
  const html = context.renderDecisionGridRows([decision('decided')]);
  assert.equal((html.match(/class="decision-grid-row"/g) || []).length, 1);
  assert.match(html, /data-row-key="DEC-decided-17"/);
  for (const key of ['agent', 'project', 'decision', 'result', 'state', 'time']) {
    assert.match(html, new RegExp(`data-sort-${key}="[^"]+"`));
  }
  assert.equal((html.match(/role="cell"/g) || []).length, 6);
  assert.doesNotMatch(html, /dec-machine|dec-agent-cards|dec-fold/);
});

test('las celdas conservan decisión, recomendación, desenlace, ejecutor y plataforma', () => {
  const html = context.renderDecisionGridRows([decision('decided')]);
  assert.match(html, /SubOraculoMini/);
  assert.match(html, /Mac Mini/);
  assert.match(html, /CLI/);
  assert.match(html, /Yokup/);
  assert.match(html, /DCL-08\/decided/);
  assert.match(html, /¿Qué mejora priorizamos\?/);
  assert.match(html, /Capturar proceso/);
  assert.match(html, /Recomendada: Ordenar cabezales/);
  assert.match(html, /Eligió: Carlos/);
  assert.match(html, /Ejecuta: SubOraculoMini · Mac Mini/);
  assert.match(html, /3 min/);
});

test('el detalle de cada fila conserva todas las opciones y metadatos operativos', () => {
  const html = context.renderDecisionGridRows([decision('decided', {
    mission: 'Misión de prueba', url: 'https://yokup.com/misiones',
    batch_id: 'batch-7', parent_decision: 'DEC-parent',
    batch: {status:'paused', pause_reason:'espera criterio', items:[
      {status:'active', title:'Implementar'}, {status:'queued', title:'Verificar'}
    ]}
  })]);
  assert.match(html, /<details class="decision-grid-detail">/);
  for (const option of ['Capturar proceso', 'Ordenar cabezales', 'Revisar contraste', 'Volver atrás']) {
    assert.match(html, new RegExp(option));
  }
  assert.match(html, /Misión de prueba/);
  assert.match(html, /https:\/\/yokup\.com\/misiones/);
  assert.match(html, /batch-7/);
  assert.match(html, /DEC-parent/);
  assert.match(html, /Implementar/);
  assert.match(html, /Verificar/);
  assert.match(html, /espera criterio/);
});

test('la fila conserva los 23 campos del contrato API sin perder datos al compactar', () => {
  const record = decision('decided', {
    id:'DEC-23-campos', display_ref:'REF-23', agent:'Agente23', machine:'Maquina23',
    surface:'cli', project:'Proyecto23', project_id:'pid-23', project_slug:'slug-23',
    mission:'Mision23', url:'https://yokup.com/decisiones/23', question:'Pregunta23',
    options:['Opcion23-A','Opcion23-B'], recommended:1, chosen:0, chosen_by:'Carlos23',
    parent_decision:'parent-23', batch_id:'batch-23', secondsLeft:23,
    created_at:1_700_000_000_000, deadline:1_700_000_300_000, decided_at:1_700_000_180_000,
    batch:{status:'paused', pause_reason:'Motivo23', items:[{status:'active',title:'Activa23'},{status:'queued',title:'Cola23'}]}
  });
  const html = context.renderDecisionGridRows([record]);
  for (const visible of [
    'DEC-23-campos','REF-23','Agente23','Maquina23','CLI','Proyecto23','pid-23','slug-23',
    'Mision23','https://yokup.com/decisiones/23','Pregunta23','Opcion23-A','Opcion23-B','Carlos23',
    'parent-23','batch-23','23 s','Motivo23','Activa23','Cola23','Hecha'
  ]) assert.match(html, new RegExp(visible.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /is-effective/); // chosen
  assert.match(html, /is-recommended/); // recommended
  assert.match(html, /Creada:[\s\S]*datetime="2023-11-14T22:13:20\.000Z"/);
  assert.match(html, /Límite:[\s\S]*datetime="2023-11-14T22:18:20\.000Z"/);
  assert.match(html, /Cerrada:[\s\S]*datetime="2023-11-14T22:16:20\.000Z"/);
});

test('decidida, vencida y cancelada se leen con resultados y badges inequívocos', () => {
  const html = context.renderDecisionGridRows([
    decision('decided'),
    decision('expired', {id:'DEC-exp', display_ref:'DCL-exp', decided_at:0}),
    decision('cancelled', {id:'DEC-can', display_ref:'DCL-can', chosen:3})
  ]);
  assert.equal((html.match(/class="decision-grid-row"/g) || []).length, 3);
  assert.match(html, /decision-grid-state decided">Hecha/);
  assert.match(html, /decision-grid-state expired">Vencida/);
  assert.match(html, /Automática · sin respuesta/);
  assert.match(html, /decision-grid-state cancelled">Cancelada/);
  assert.match(html, /Volver atrás/);
});

test('la hoja permite scroll horizontal y pasa a rótulos por celda en móvil', () => {
  assert.match(source, /\.decision-grid-scroll\{[^}]*overflow-x:auto/);
  assert.match(source, /\.decision-grid\{min-width:1040px/);
  for (const key of ['agent', 'project', 'decision', 'result', 'state', 'time']) {
    assert.match(source, new RegExp(`var\\(--decision-col-${key},`));
  }
  assert.match(source, /@media\(max-width:560px\)[\s\S]*\.decision-grid-head\{display:none\}/);
  assert.match(source, /\.decision-grid-cell:before\{content:attr\(data-label\)/);
  assert.match(source, /closedShown\.length\?decisionHistoryByHour\(closedShown,"list"\)/);
  assert.match(source, /list\.innerHTML = live\.length \? decisionHistoryByHour\(live,"detail"\)/);
});

test('/equipo y los relojes vivos conservan su renderer y actualización en tiempo real', () => {
  assert.match(equipo, /YkDecisions\.mount\(\{worker:WORKER, onData:/);
  assert.doesNotMatch(equipo, /yk-decisiones-grid|YkDecisionesGrid/);
  assert.match(source, /function renderLive\(\) \{[\s\S]*decisions\.map\(function \(d\) \{ return card\(d\); \}\)/);
  assert.match(source, /data-clock=\\"/);
  assert.match(source, /setInterval\(function \(\) \{ var refresh = false;[\s\S]*\}, 1000\)/);
  assert.match(source, /querySelector\("\[data-clock='" \+ d\.id/);
  assert.match(source, /querySelector\("\[data-fill='" \+ d\.id/);
});

test('filtros y rerender históricos siguen alimentando filas ordenables', () => {
  assert.match(source, /var histStatus = \(filter && filter !== "pending"\) \? filter : null/);
  assert.match(source, /closed\.filter\(function \(d\) \{ return d\.status === histStatus; \}\)/);
  assert.match(source, /histList\.innerHTML=closedShown\.length\?decisionHistoryByHour\(closedShown,"list"\)/);
  assert.match(source, /histSig = null; paintChips\(\); renderFull\(\)/);
});
