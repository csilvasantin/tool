import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./yk-decisions.js', import.meta.url), 'utf8');
const missionsHtml = await readFile(new URL('./misiones.html', import.meta.url), 'utf8');
const decisionsHtml = await readFile(new URL('./decisiones.html', import.meta.url), 'utf8');

const context = vm.createContext({window: {}});
vm.runInContext(
  `${source}\nglobalThis.renderDecisionCard = window.YkDecisions._test.card; globalThis.decisionProjectName = window.YkDecisions._test.projectName; globalThis.groupDecisions = window.YkDecisions._test.groupDecisions; globalThis.renderDecisionGroups = window.YkDecisions._test.renderGroups; globalThis.decisionStateText = window.YkDecisions._test.stateText;`,
  context
);

const options = [
  'Aplicar ahora',
  'Preparar borrador',
  'Pedir revisión',
  'Programar después',
  'Delegar al equipo',
  'Volver atrás'
];

function render(status, extra = {}) {
  return context.renderDecisionCard({
    id: `decision-${status}`,
    machine: 'Mac Mini',
    agent: 'Oráculo',
    surface: 'desktop',
    question: '¿Qué camino seguimos?',
    options,
    recommended: 1,
    status,
    secondsLeft: 90,
    created_at: 1_000,
    deadline: 301_000,
    project: 'Generador de Presentaciones',
    project_slug: 'GENERADOR-DE-PRESENTACIONES',
    ...extra
  });
}

function buttons(card) {
  return card.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) || [];
}

function assertAllOptionsRemainVisible(card) {
  const renderedButtons = buttons(card);
  assert.equal(renderedButtons.length, 6, 'deben conservarse 5 opciones y Volver atrás');
  options.forEach((option, index) => assert.match(renderedButtons[index], new RegExp(option)));
  return renderedButtons;
}

function assertProjectHeaderPrecedesDecision(card, name) {
  assert.match(card, /<article\b[^>]*aria-labelledby=/);
  assert.match(card, new RegExp(`PROYECTO[\\s\\S]*${name}`));
  assert.ok(card.indexOf('dec-project') < card.indexOf('dec-top'), 'la cabecera del proyecto precede a los metadatos');
  assert.ok(card.indexOf('dec-project') < card.indexOf('dec-q'), 'la cabecera del proyecto precede a la pregunta');
}

test('una decisión pendiente mantiene las cinco opciones y Volver atrás accionables', () => {
  const card = render('pending');
  assertProjectHeaderPrecedesDecision(card, 'Generador de Presentaciones');
  const renderedButtons = assertAllOptionsRemainVisible(card);
  assert.doesNotMatch(renderedButtons[0], /\bdisabled\b/);
  assert.match(renderedButtons[1], /class="[^"]*\brec\b/);
});

test('una decisión elegida conserva todas las opciones y resalta la aplicada', () => {
  // El proyecto llega ya resuelto por el worker contra el censo; el título de la
  // misión se queda en su sitio y no suplanta al proyecto.
  const card = render('decided', {chosen: 3, mission: 'Generador de Presentaciones · carrusel secuencial'});
  assertProjectHeaderPrecedesDecision(card, 'Generador de Presentaciones');
  const renderedButtons = assertAllOptionsRemainVisible(card);
  renderedButtons.forEach(button => {
    assert.match(button, /\bdisabled\b/);
    assert.match(button, /aria-disabled="true"/);
  });
  assert.match(renderedButtons[3], /class="[^"]*\beffective\b/);
  assert.match(renderedButtons[3], /aria-current="true"/);
  renderedButtons.filter((_, index) => index !== 3).forEach(button => {
    assert.doesNotMatch(button, /aria-current=/);
  });
  assert.match(card, /decisión aplicada:[\s\S]*Programar después/);
});

test('una decisión vencida conserva todas las opciones y resalta la recomendación efectiva', () => {
  const card = render('expired', {url: 'https://www.admiranext.com/presentaciones/generador/'});
  assertProjectHeaderPrecedesDecision(card, 'Generador de Presentaciones');
  const renderedButtons = assertAllOptionsRemainVisible(card);
  assert.match(renderedButtons[1], /class="[^"]*\beffective\b[^"]*\bexpired\b/);
  assert.match(renderedButtons[1], /aria-current="true"/);
  renderedButtons.filter((_, index) => index !== 1).forEach(button => {
    assert.doesNotMatch(button, /aria-current=/);
  });
  assert.match(card, /se aplicó la recomendada:[\s\S]*Preparar borrador/);
});

test('una decisión cerrada enseña la misión activa y la cola persistente', () => {
  const card = render('decided', {
    chosen: 4,
    batch: {
      status: 'active',
      items: [
        {status: 'active', title: 'Exportación fiable PDF/PPTX'},
        {status: 'queued', title: 'Borradores y recuperación'},
        {status: 'queued', title: 'Brief asistido'},
        {status: 'queued', title: 'Kit de marca'},
        {status: 'queued', title: 'Preview en vivo'}
      ]
    }
  });
  assert.match(card, /▶ <b>activa<\/b>:[\s\S]*Exportación fiable PDF\/PPTX/);
  assert.match(card, /cola:[\s\S]*Borradores y recuperación[\s\S]*Preview en vivo/);
});

test('Volver atrás deja constancia de que el lote fue descartado', () => {
  const card = render('cancelled', {chosen: 5});
  assert.match(card, /lote descartado/);
});

test('Volver atrás en una continuación conserva el batch actual', () => {
  const card = render('cancelled', {chosen: 2, options:['Pendiente B','Pendiente C','Volver atrás'], parent_decision:'DEC-parent', batch_id:'BATCH-parent'});
  assert.match(card, /continuación descartada: se conserva la tanda actual/);
  assert.doesNotMatch(card, /no se iniciará ninguna misión/);
});

test('un reloj pending exige proyecto+slug exactos y jamás infiere mission/url/question', () => {
  assert.equal(context.decisionProjectName({status:'pending',project:'Generador de Presentaciones',project_slug:'GENERADOR-DE-PRESENTACIONES'}), 'Generador de Presentaciones');
  assert.equal(context.decisionProjectName({status:'pending',project:'Admira TV',project_slug:'ADMIRA-TV'}), 'Admira TV');
  // El worker nunca entregaría Admira TV para esta pareja; la UI sólo comprueba
  // integridad title↔slug. La autorización vive en D1, no duplicada en JS.
  assert.equal(context.decisionProjectName({status:'pending',mission:'Generador de Presentaciones',url:'https://www.admiranext.com/presentaciones/'}), 'Sin proyecto exacto');
  assert.equal(context.decisionProjectName({status:'pending',question:'¿Publicamos Nike?'}), 'Sin proyecto exacto');
});

test('sólo el histórico cerrado conserva fallback legacy de lectura', () => {
  assert.equal(context.decisionProjectName({status:'decided',project:'Yokup cuadrático',mission:'otra'}), 'Yokup cuadrático');
  assert.equal(context.decisionProjectName({status:'expired',mission:'Generador de Presentaciones · carrusel'}), 'Generador de Presentaciones · AdmiraNeXT');
  assert.equal(context.decisionProjectName({status:'cancelled',url:'https://www.admiranext.com/presentaciones/'}), 'Generador de Presentaciones · AdmiraNeXT');
  assert.equal(context.decisionProjectName({status:'decided',question:'¿Publicamos Nike?'}), 'Sin proyecto');
});

test('la UI muestra proyecto y misiones restantes en continuaciones 4→3→2→1', () => {
  for (const count of [4,3,2,1]) {
    const continuationOptions = Array.from({length:count}, (_, i) => `Pendiente ${i + 1}`).concat('Volver atrás');
    const card = render('pending', {options:continuationOptions, parent_decision:'DEC-parent', batch_id:'BATCH-parent'});
    assert.match(card, new RegExp(`${count} misi[oó]n(?:es)? restante`));
    assert.equal(buttons(card).length, count + 1);
    assert.ok(card.indexOf('dec-project-name') < card.indexOf('dec-project-rest'));
  }
});

test('/misiones sólo conserva contador+enlace y monta el modo summary', () => {
  assert.match(missionsHtml, /id="decSummary"[^>]*aria-label="Resumen de decisiones"/);
  assert.match(missionsHtml, /href="\/decisiones"/);
  assert.match(missionsHtml, /id="decSummaryCount"/);
  assert.match(missionsHtml, /YkDecisions\.mount\(\{worker:WORKER,mode:"summary"\}\)/);
  assert.doesNotMatch(missionsHtml, /id="decsList"|id="decsHistList"|class="dec-opts"/);
  const summaryBody = source.match(/function renderSummary\(\) \{[\s\S]*?\n    \}/)?.[0] || '';
  assert.doesNotMatch(summaryBody, /card\(|dec-opts|innerHTML/);
  assert.match(source, /\?status=pending&limit=500&_t=/);
});

test('/decisiones monta full y agrupa en orden determinista máquina → agente', () => {
  assert.match(decisionsHtml, /YkDecisions\.mount\(\{worker:"[^"]+", mode:"full"\}\)/);
  const items = [
    {...renderData('decided'), id:'d4', machine:'Beta', agent:'Zeta', created_at:4},
    {...renderData('pending'), id:'d3', machine:'Alpha', agent:'Zeta', created_at:3},
    {...renderData('expired'), id:'d2', machine:'Alpha', agent:'Ana', created_at:2, deadline:2},
    {...renderData('cancelled'), id:'d1', machine:'Alpha', agent:'Ana', created_at:1, decided_at:1},
  ];
  const groups = context.groupDecisions(items);
  assert.deepEqual(Array.from(groups, g => g.name), ['Alpha','Beta']);
  assert.deepEqual(Array.from(groups[0].agents, a => a.name), ['Ana','Zeta']);
  assert.deepEqual(Array.from(groups[0].agents[0].items, d => d.id), ['d2','d1']);
  assert.equal(context.decisionStateText(groups[0].items), '1 viva · 1 vencida · 1 cancelada');
});

test('el renderer jerárquico usa headings, recuentos, aria y cards responsive', () => {
  const items = [
    {...renderData('pending'), id:'live-a', machine:'Mac Mini', agent:'Oráculo'},
    {...renderData('decided'), id:'done-a', machine:'Mac Mini', agent:'Oráculo'},
  ];
  const html = context.renderDecisionGroups(items, {stamp:true});
  assert.match(html, /<section class="dec-machine" aria-labelledby="[^"]+">/);
  assert.match(html, /<h2 id="[^"]+">🖥 Mac Mini<\/h2>/);
  assert.match(html, /<section class="dec-agent" aria-labelledby="[^"]+">/);
  assert.match(html, /<h3 class="dec-agent-title"[^>]*>[\s\S]*Oráculo<\/span><\/h3>/);
  assert.match(html, /2 · 1 viva · 1 decidida/);
  assert.equal((html.match(/<article class="dec/g) || []).length, 2);
  assert.match(source, /grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,320px\),1fr\)\)/);
  assert.match(source, /@media\(max-width:520px\)[\s\S]*\.dec-agent-cards\{grid-template-columns:minmax\(0,1fr\)/);
});

function renderData(status) {
  return {
    id:`sample-${status}`, machine:'Mac Mini', agent:'Oráculo', surface:'desktop',
    question:'¿Qué camino seguimos?', options, recommended:1, status,
    secondsLeft:90, created_at:1_000, deadline:301_000,
    project:'Generador de Presentaciones', project_slug:'GENERADOR-DE-PRESENTACIONES'
  };
}
