import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./yk-decisions.js', import.meta.url), 'utf8');
const page = await readFile(new URL('./decisiones.html', import.meta.url), 'utf8');
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
  assert.match(page, /id="decsHistList"[^>]*role="rowgroup"/);
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
  assert.match(source, /closedShown\.length \? renderDecisionGridRows\(closedShown\)/);
  assert.match(source, /list\.innerHTML = live\.length \? renderGroups\(live, null\)/);
});
