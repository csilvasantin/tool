// FLT-984 — censo de proyectos y su asignación a máquinas y agentes.
// Pruebas de FORMA sobre el fuente (mismo estilo que el resto del repo): que el
// esquema, los endpoints y el carril público sigan donde se acordó.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FLEET_MISSIONS_SQL} from './src/mission-sources.js';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const responsiblesSource = await readFile(new URL('./src/project-responsibles.js', import.meta.url), 'utf8');
const missionReferenceSource = source.match(/function normalizeMissionReference\(raw\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(missionReferenceSource, 'no se encontró normalizeMissionReference');
const normalizeMissionReference = new Function(`${missionReferenceSource}\nreturn normalizeMissionReference;`)();

test('el esquema crea projects, project_members y la columna project de tickets', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS projects \(id TEXT PRIMARY KEY/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS project_members \(project_id TEXT, kind TEXT, ref TEXT/);
  assert.match(source, /ALTER TABLE tickets ADD COLUMN project TEXT/);
});

test('un proyecto se asigna a máquinas Y a agentes, por los ids de admira-fleet', () => {
  assert.match(source, /for \(const kind of \["machine", "agent"\]\)/);
  assert.match(source, /kind === "machine" \? "machines" : "agents"/);
});

test('están los cinco endpoints: listar, alta/edición, baja, asignar y misión', () => {
  assert.match(source, /url\.pathname === "\/projects" && req\.method === "GET"/);
  assert.match(source, /url\.pathname === "\/projects" && req\.method === "POST"/);
  assert.match(source, /url\.pathname === "\/projects\/delete" && req\.method === "POST"/);
  assert.match(source, /url\.pathname === "\/projects\/assign" && req\.method === "POST"/);
  assert.match(source, /url\.pathname === "\/projects\/mission" && req\.method === "POST"/);
});

test('/projects va por el carril ABIERTO: los agentes no cruzan la verja', () => {
  const protegidas = source.match(/var PROTECTED = [^;]+;/)[0];
  assert.ok(!/\/projects/.test(protegidas), 'PROTECTED no debe incluir /projects');
});

test('la baja no deja misiones apuntando a un proyecto que ya no existe', () => {
  assert.match(source, /UPDATE tickets SET project='',project_id=NULL WHERE project=\? OR project_id=\?/);
});

test('asignar una misión a un proyecto exige que el proyecto esté dado de alta', () => {
  assert.match(source, /no está dado de alta; créalo en \/equipo/);
});

test('/projects/mission conserva ids opacos y sólo canoniza referencias FLT numéricas', () => {
  assert.equal(normalizeMissionReference('MIS-DEC-mrxrv5fy5ivl-01'), 'MIS-DEC-mrxrv5fy5ivl-01');
  assert.equal(normalizeMissionReference('  MIS-DEC-AbC-01  '), 'MIS-DEC-AbC-01');
  assert.equal(normalizeMissionReference('123'), 'FLT-123');
  assert.equal(normalizeMissionReference('#456'), 'FLT-456');
  assert.equal(normalizeMissionReference('flt-789'), 'FLT-789');
  const start = source.indexOf('if (url.pathname === "/projects/mission" && req.method === "POST")');
  const endpoint = source.slice(start, source.indexOf('// CONTADORES DEL MENÚ', start));
  assert.match(endpoint, /const mid = normalizeMissionReference\(b && b\.mission\)/);
  assert.doesNotMatch(endpoint, /toUpperCase\(\)/);
});

test('las listas de misiones llevan project_id, alias legado y nombre humano', () => {
  assert.match(FLEET_MISSIONS_SQL, /SELECT id,subject,loc,project,project_id,role,source,status/);
  assert.match(source, /project_name: resolveProject\(pidx, r\.project \|\| ""\)\.name/);
});

// ── FLT-985 b / FLT-1505 — orden y responsables del proyecto ────────────────
test('el esquema conserva owner (silicio), separa carbono y añade sort_order', () => {
  assert.match(source, /ALTER TABLE projects ADD COLUMN owner TEXT/);
  assert.match(source, /ALTER TABLE projects ADD COLUMN carbon_responsible TEXT NOT NULL DEFAULT ''/);
  assert.match(source, /ALTER TABLE projects ADD COLUMN sort_order INTEGER/);
});

test('el orden manual manda y lo no colocado cae detrás con el orden de siempre', () => {
  assert.match(source, /ORDER BY \(sort_order IS NULL\), sort_order, \(status='activo'\) DESC, name COLLATE NOCASE/);
});

test('owner/silicio viaja en la lista y se guarda en el alta/edición', () => {
  assert.match(source, /const canonicalOwner = canonicalProjectAgentRef\(p\.owner \|\| ""\)/);
  assert.match(source, /owner: canonicalOwner/);
  assert.match(source, /const requestedSiliconResponsible = canonicalProjectAgentRef\(b && b\.silicon_responsible !== undefined/);
  assert.match(source, /const primaryResponsible = prev \? canonicalProjectAgentRef\(prev\.owner \|\| ""\) : requestedSiliconResponsible/);
  assert.match(source, /owner: primaryResponsible/);
  assert.match(responsiblesSource, /INSERT INTO projects \(id,name,blurb,web,status,color,owner,carbon_responsible,/);
  assert.doesNotMatch(responsiblesSource, /DO UPDATE SET[^;]*owner=|DO UPDATE SET[^;]*carbon_responsible=/);
});

test('owner es el Responsable Silicio; Principal queda como alias compatible', () => {
  assert.match(source, /primary_responsible: canonicalOwner \|\| "NeoMacMini"/);
  assert.match(source, /silicon_responsible: siliconResponsible/);
  assert.match(source, /b && b\.primary_responsible !== undefined/);
  assert.match(source, /owner: primaryResponsible/);
});

test('/projects/order guarda el orden y va por el carril ABIERTO', () => {
  assert.match(source, /url\.pathname === "\/projects\/order" && req\.method === "POST"/);
  assert.match(source, /UPDATE projects SET sort_order=\? WHERE id=\?/);
  const protegidas = source.match(/var PROTECTED = [^;]+;/)[0];
  assert.ok(!/\/projects\/order/.test(protegidas), 'PROTECTED no debe incluir /projects/order');
});

test('colocar una ficha NO cuenta como editarla: updated_at no se toca', () => {
  const bloque = source.match(/\/projects\/order[\s\S]{0,1400}?\n    \}/)[0];
  assert.ok(!/updated_at/.test(bloque), 'el endpoint de orden no debe tocar updated_at');
});

test('un id que ya no está en el censo no tumba el guardado del orden', () => {
  assert.match(source, /const orden = \[\.\.\.new Set\(ids\)\]\.filter\(\(id\) => vivos\.has\(id\)\)/);
});

// ── FLT-985 c1 — «viva» = EN CURSO ─────────────────────────────────────────
test('la ficha de proyecto cuenta como viva la misión EN CURSO, no la encargada', () => {
  assert.match(source, /SELECT project, status, COUNT\(\*\) c FROM tickets WHERE project IS NOT NULL AND project!='' AND status IN \('in_progress','open'\) GROUP BY project, status/);
  assert.match(source, /if \(m\.status === "in_progress"\) misBy\[k\] = m\.c; else pendBy\[k\] = m\.c;/);
  // la consulta vieja sumaba TODO lo no cerrado y llamaba «viva» a una cola parada
  assert.ok(!/status!='resolved' AND status!='cancelled' GROUP BY project/.test(source),
    'no debe quedar la cuenta vieja de vivas (todo lo no cerrado)');
});

test('lo encargado y sin empezar viaja aparte, no se esconde', () => {
  assert.match(source, /missions_pending: pendBy\[String\(p\.id\)\.toLowerCase\(\)\] \|\| 0/);
});

test('/shot admite capturas reales de Ainimation Studio y DigitalAvatar', () => {
  assert.match(source, /isProjectShotAllowed\(target\)/);
  assert.match(source, /page\.screenshot\(\{ type: "png", clip: \{ x: 0, y: 0, width: 960, height: 600 \} \}\)/);
});
