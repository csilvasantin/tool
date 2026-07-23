import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  memberRefMatches,
  projectSlug,
  resolveDecisionIdentity,
  resolveDecisionProject,
  selectDecisionProjectAssignment,
} from './src/decision-project.js';

const source = await readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const canonical = {
  id:'generador-de-presentaciones', name:'Generador de Presentaciones',
  web:'www.admiranext.com', status:'activo'
};
const exact = {
  project:'Generador de Presentaciones', project_slug:'GENERADOR-DE-PRESENTACIONES',
  project_web:'www.admiranext.com', agent:'Oráculo', machine:'Mac Mini'
};

test('el esquema persiste project_slug sin perder projects/project_members', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS projects/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS project_members/);
  assert.match(source, /ALTER TABLE decisions ADD COLUMN project_slug TEXT/);
});

test('POST resuelve la intersección canónica agent+machine y falla cerrado', () => {
  assert.match(source, /async function exactDecisionProjectAssignment/);
  assert.match(source, /SELECT project_id,kind,ref FROM project_members/);
  assert.match(source, /selectDecisionProjectAssignment\(idx\.rows, members, agent, machine, requestedProjectId\)/);
  assert.match(source, /b\.project_id \|\| \(continuation && parent \? parent\.project/);
  assert.match(source, /resolveDecisionProject\(decisionInput, assignment, inherited\)/);
  assert.match(source, /code: "exact_project_required"/);
  assert.match(source, /code: "exact_identity_required"/);
});

test('POST guarda id+slug; GET lista y detalle devuelven nombre, id y slug', () => {
  assert.match(source, /project,project_slug,parent_decision,batch_id\) VALUES/);
  assert.match(source, /project: projectContext\.project, project_id: dproject, project_slug: dprojectSlug/);
  assert.match(source, /project: resolvedProject\.name, project_id: resolvedProject\.id/);
  assert.match(source, /project_slug: d\.project_slug \|\| ""/);
  assert.match(source, /project: pOne\.name, project_id: pOne\.id, project_slug: d\.project_slug \|\| ""/);
});

test('los ids D1 oraculo + admira-macmini casan con los rótulos del reloj', () => {
  assert.equal(memberRefMatches('agent','oraculo','Oráculo'), true);
  assert.equal(memberRefMatches('agent','oraculo','InfraOraculoMini'), true);
  assert.equal(memberRefMatches('machine','admira-macmini','Mac Mini'), true);
  assert.equal(memberRefMatches('machine','admira-macbookpro16','Mac Mini'), false);
});

test('acepta sólo el contexto granular Generador de Presentaciones', () => {
  assert.equal(projectSlug(canonical.name), 'GENERADOR-DE-PRESENTACIONES');
  assert.deepEqual(resolveDecisionProject(exact, canonical), {
    ok:true, project:'Generador de Presentaciones', project_id:'generador-de-presentaciones',
    project_slug:'GENERADOR-DE-PRESENTACIONES', project_web:'www.admiranext.com',
    agent:'OraculoMini', machine:'Mac Mini'
  });
});

test('canoniza aliases planos y rechaza identidad scoped contradictoria', () => {
  assert.deepEqual(resolveDecisionIdentity('Oráculo', 'Mac Mini'), {
    ok:true, agent:'OraculoMini', machine:'Mac Mini'
  });
  assert.deepEqual(resolveDecisionIdentity('SubOraculo', 'Mac Mini'), {
    ok:true, agent:'SubOraculoMini', machine:'Mac Mini'
  });
  assert.equal(resolveDecisionIdentity('Oraculo16', 'Mac Mini').ok, false);
  assert.equal(resolveDecisionIdentity('InfraOraculoMini', 'MacBook Pro 16').ok, false);
  assert.equal(resolveDecisionIdentity('Oraculo', '').ok, false);
  assert.equal(resolveDecisionIdentity('Oraculo', 'equipo-desconocido').ok, false);
});

test('project_id selecciona de forma explícita sólo una asignación autorizada', () => {
  const projects = [
    canonical,
    {id:'generador-de-presites',name:'Generador de Presites',web:'www.admiranext.com',status:'activo'}
  ];
  const members = projects.flatMap((project) => [
    {project_id:project.id,kind:'agent',ref:'oraculo'},
    {project_id:project.id,kind:'machine',ref:'admira-macmini'}
  ]);
  assert.equal(selectDecisionProjectAssignment(projects,members,'Oráculo','Mac Mini'), null);
  assert.equal(selectDecisionProjectAssignment(projects,members,'Oráculo','Mac Mini','generador-de-presites')?.name, 'Generador de Presites');
  assert.equal(selectDecisionProjectAssignment(projects,members,'Oráculo','Mac Mini','admira-tv'), null);
  assert.equal(selectDecisionProjectAssignment(projects,members,'Oráculo','MacBook Pro','generador-de-presites'), null);
});

test('rechaza ausencia, dominio, ambigüedad, Admira TV y fuente inexistente', () => {
  const bad = [
    [{agent:'Oráculo',machine:'Mac Mini'}, canonical],
    [{project:'www.admiranext.com',project_slug:'WWW-ADMIRANEXT-COM',agent:'Oráculo',machine:'Mac Mini'}, canonical],
    [{project:'Admira TV',project_slug:'ADMIRA-TV',agent:'Oráculo',machine:'Mac Mini'}, canonical],
    [{...exact,project_slug:'ADMIRANEXT'}, canonical],
    [{...exact,project_web:'admira.tv'}, canonical],
    [{...exact,project_id:'generador-de-presites'}, canonical],
    [exact, null],
  ];
  for (const [input, assignment] of bad) assert.equal(resolveDecisionProject(input, assignment).ok, false, JSON.stringify(input));
});

test('una continuación conserva raíz y asignación exactas', () => {
  const inherited = {...exact};
  assert.equal(resolveDecisionProject(exact, canonical, inherited).ok, true);
  assert.equal(resolveDecisionProject({agent:'Oráculo',machine:'Mac Mini'}, canonical, inherited).ok, true);
  assert.equal(resolveDecisionProject({...exact,project:'Admira TV',project_slug:'ADMIRA-TV'}, canonical, inherited).ok, false);
  assert.equal(resolveDecisionProject(exact, {...canonical,name:'Admira TV',id:'admira-tv'}, inherited).ok, false);
  assert.equal(resolveDecisionProject(exact, canonical, {...inherited,machine:'MacBook Pro'}).ok, false);
  assert.equal(resolveDecisionProject(exact, canonical, {...inherited,agent:'Oraculo16'}).ok, false);
  assert.equal(resolveDecisionProject({...exact,agent:'Oraculo16'}, canonical, inherited).ok, false);
  assert.equal(resolveDecisionProject({...exact,agent:'SubOraculo'}, canonical, inherited).ok, false);
});
