import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./status.html",import.meta.url),"utf8");

test("Opciones contiene todos los proyectos con selector múltiple y Todos",()=>{
  const left=source.slice(source.indexOf('id="panelLeft"'),source.indexOf('id="rzLeft"'));
  assert.match(left,/id="projectFilterSec"/);
  assert.match(left,/id="projectFilterList"[^>]*aria-label="Filtrar por proyectos"/);
  assert.match(source,/renderScopeFilter\('projectFilterList','projectFilterCount',projects,'project'\)/);
  assert.match(source,/row\('Todos',scope===null,true/);
  assert.match(source,/for\(const project of CANON_PROJECTS\|\|\[\]\)/);
});

test("Avanzado contiene todos los equipos con el mismo contrato",()=>{
  const right=source.slice(source.indexOf('id="panelRight"'),source.indexOf('id="rzRight"'));
  assert.match(right,/id="teamFilterSec"/);
  assert.match(right,/id="teamFilterList"[^>]*aria-label="Filtrar por equipos"/);
  assert.match(source,/renderScopeFilter\('teamFilterList','teamFilterCount',teams,'team'\)/);
  assert.match(source,/for\(const machine of \(WORLD\.machines\|\|\[\]\)\.slice\(\)\.sort/);
});

test("proyecto y equipo se combinan y persisten sin alterar WORLD",()=>{
  assert.match(source,/const PROJECT_SCOPE_KEY='admiranext-status-project-scope'/);
  assert.match(source,/const TEAM_SCOPE_KEY='admiranext-status-team-scope'/);
  assert.match(source,/localStorage\.setItem\(key,JSON\.stringify\(\[\.\.\.scope\]\)\)/);
  assert.match(source,/function filteredWorld\(\)/);
  assert.match(source,/filter\(m=>teamScopeAllows\(m\.machine\)\)/);
  assert.match(source,/agents=agents\.filter\(a=>PROJECT_SCOPE\.has\(projectKeyForAgent\(a\)\)\)/);
  assert.match(source,/machines=machines\.filter\(m=>PROJECT_SCOPE\.has\(projectKeyForMachine\(m\)\) \|\| agentMachineKeys\.has/);
  assert.match(source,/const visible=filteredWorld\(\);[\s\S]*list = visible\.machines\.map/);
  assert.doesNotMatch(source,/WORLD\.machines\s*=\s*WORLD\.machines\.filter/);
});

test("los contadores y el foco leen el mismo universo filtrado",()=>{
  assert.match(source,/function updateLiveCounter\(\)[\s\S]*const visible=filteredWorld\(\)/);
  assert.match(source,/const mach=\(filteredWorld\(\)\.all\|\|\[\]\)\.filter/);
  assert.match(source,/missions:buildMissions\(scopedMachines,agents,!scoped\)/);
  assert.match(source,/projects:buildProjects\(scopedMachines,agents\)\.filter\(p=>projectScopeAllows\(p\.project\)\)/);
});
