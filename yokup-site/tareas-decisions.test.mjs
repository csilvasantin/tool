import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('./yk-decisions.js', import.meta.url), 'utf8');

const context = vm.createContext({window: {}});
vm.runInContext(
  `${source}\nglobalThis.renderDecisionCard = window.YkDecisions._test.card; globalThis.decisionProjectName = window.YkDecisions._test.projectName;`,
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
  const card = render('pending', {project: 'Generador de Presentaciones · AdmiraNeXT'});
  assertProjectHeaderPrecedesDecision(card, 'Generador de Presentaciones · AdmiraNeXT');
  const renderedButtons = assertAllOptionsRemainVisible(card);
  assert.doesNotMatch(renderedButtons[0], /\bdisabled\b/);
  assert.match(renderedButtons[1], /class="[^"]*\brec\b/);
});

test('una decisión elegida conserva todas las opciones y resalta la aplicada', () => {
  // El proyecto llega ya resuelto por el worker contra el censo; el título de la
  // misión se queda en su sitio y no suplanta al proyecto.
  const card = render('decided', {chosen: 3, project: 'Generador de Presentaciones · AdmiraNeXT', mission: 'Generador de Presentaciones · carrusel secuencial'});
  assertProjectHeaderPrecedesDecision(card, 'Generador de Presentaciones · AdmiraNeXT');
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
  const card = render('expired', {project: 'Generador de Presentaciones · AdmiraNeXT', url: 'https://www.admiranext.com/presentaciones/generador/'});
  assertProjectHeaderPrecedesDecision(card, 'Generador de Presentaciones · AdmiraNeXT');
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

test('el proyecto sale del censo o no sale: ni misión, ni url, ni pregunta', () => {
  // Lo que manda es `project`, que el worker ya resuelve al nombre del censo.
  assert.equal(context.decisionProjectName({project:'Yokup cuadrático', mission:'otra', url:'https://admiranext.com'}), 'Yokup cuadrático');
  // El título de la misión NO es el proyecto (apaño retirado en FLT-984 a·b).
  assert.equal(context.decisionProjectName({mission:'Generador de Presentaciones · carrusel', url:'https://yokup.com'}), 'Sin proyecto');
  // Ni el dominio de la url (apaño retirado en FLT-984 c): fingía proyectos que
  // nadie había dado de alta — «Yokup», «Generador de Presentaciones · AdmiraNeXT».
  assert.equal(context.decisionProjectName({url:'https://www.admiranext.com/presentaciones/'}), 'Sin proyecto');
  assert.equal(context.decisionProjectName({url:'https://www.yokup.com/decisiones'}), 'Sin proyecto');
  // Ni la pregunta.
  assert.equal(context.decisionProjectName({question:'¿Publicamos Nike?'}), 'Sin proyecto');
});

test('la UI muestra proyecto y misiones restantes en continuaciones 4→3→2→1', () => {
  for (const count of [4,3,2,1]) {
    const continuationOptions = Array.from({length:count}, (_, i) => `Pendiente ${i + 1}`).concat('Volver atrás');
    const card = render('pending', {project:'Generador de Presentaciones · AdmiraNeXT', options:continuationOptions, parent_decision:'DEC-parent', batch_id:'BATCH-parent'});
    assert.match(card, new RegExp(`${count} misi[oó]n(?:es)? restante`));
    assert.equal(buttons(card).length, count + 1);
    assert.ok(card.indexOf('dec-project-name') < card.indexOf('dec-project-rest'));
  }
});
