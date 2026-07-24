// FLT-1009 — el selector «— proyecto —» y el chip de proyecto en el front de ideas.
// Pruebas de FORMA sobre objetivos.html e ideas.html (mismo estilo que el resto de
// la carpeta): que ambas páginas ofrecen el selector de proyecto del censo, lo llenan
// desde GET /projects cacheado en el load, envían `project` en el POST /ideas y pintan
// el chip enlazado en ficha y listado. Sin scroll horizontal: el select entra en un
// .row con flex-wrap ya existente (no se toca el layout).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const OBJ = await readFile(new URL('./objetivos.html', import.meta.url), 'utf8');
const IDE = await readFile(new URL('./ideas.html', import.meta.url), 'utf8');

for (const [name, SRC] of [['objetivos.html', OBJ], ['ideas.html', IDE]]) {
  test(`${name}: el formulario tiene el selector — proyecto —`, () => {
    assert.match(SRC, /<select id="fProject"[^>]*><option value="">— proyecto —<\/option><\/select>/);
  });

  test(`${name}: cachea el censo con loadProjects (GET /projects) y llena el select`, () => {
    assert.ok(SRC.includes('async function loadProjects(){'), 'define loadProjects');
    assert.ok(SRC.includes('wfetch("/projects"'), 'lee GET /projects');
    assert.ok(SRC.includes('let PROJECTS=[], PROJ_BY={};'), 'cachea censo + índice');
    assert.ok(SRC.includes('loadProjects();'), 'lo llama en el arranque');
  });

  test(`${name}: el chip projChip resuelve slug→nombre y enlaza a la web (target _blank)`, () => {
    assert.ok(SRC.includes('function projChip(slug,cls){'), 'define projChip');
    assert.ok(SRC.includes('target="_blank" rel="noopener"'), 'la web abre en pestaña nueva');
    assert.ok(SRC.includes('function projUrl(web){'), 'normaliza la web a URL absoluta');
    // chip en ficha (card) y en fila (listRow)
    assert.ok(SRC.includes('projChip(i.project,"pchip")'), 'chip en la ficha');
    assert.ok(SRC.includes('projChip(i.project,"lproj")'), 'chip en el listado');
  });

  test(`${name}: el POST /ideas envía project y limpia el select tras guardar`, () => {
    assert.ok(SRC.includes('project:$("#fProject").value'), 'manda project en el body');
    assert.ok(SRC.includes('$("#fProject").value=""'), 'limpia el select al guardar');
  });
}
