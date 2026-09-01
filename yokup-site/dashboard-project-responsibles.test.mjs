// FLT-1505 · responsables Carbono y Silicio separados en el Dashboard.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");
const equipo=await readFile(new URL("./equipo.html",import.meta.url),"utf8");

test("cada proyecto muestra dos bandas equivalentes y deja de hablar de Responsable Principal",()=>{
  assert.match(source,/class="pa-responsibles" aria-label="Responsables de /);
  assert.match(source,/>Responsable Carbono<\/label>/);
  assert.match(source,/<b>Responsable Silicio<\/b>/);
  assert.doesNotMatch(source,/<b>Responsable Principal<\/b>/);
  assert.match(source,/\.pa-responsibles\{display:grid;gap:5px/);
  assert.match(source,/\.pa-responsible\{display:grid;grid-template-columns:/);
});

test("Silicio conserva los alias históricos y Carbono nunca entra en familias o cables",()=>{
  assert.match(source,/hasOwnProperty\.call\(project,"silicon_responsible"\)/);
  assert.match(source,/return String\(project\.silicon_responsible\?\?""\)\.trim\(\)/);
  assert.match(source,/const explicit=paSiliconResponsible\(project\)/);
  const refs=source.slice(source.indexOf("function paProjectAgentRefs"),source.indexOf("function paProjectAgentGroups"));
  assert.doesNotMatch(refs,/carbon_responsible/);
});

test("Silicio vacío queda realmente desasignado y se comunica sin reintroducir Neo",()=>{
  assert.match(source,/esc\(silicon\|\|"Sin asignar"\)/);
  const helper=source.slice(source.indexOf("function paSiliconResponsible"),source.indexOf("function paCarbonResponsible"));
  assert.ok(helper.indexOf("hasOwnProperty")<helper.indexOf("primary_responsible"));
  assert.doesNotMatch(helper,/project\.silicon_responsible\|\|project&&project\.primary_responsible/);
});

test("Carbono es un nombre editable, vacío y limitado, con guardado explícito",()=>{
  assert.match(source,/data-pa-carbon-input=/);
  assert.match(source,/maxlength="80" autocomplete="name" placeholder="Sin asignar"/);
  assert.match(source,/data-pa-carbon-save=/);
  assert.match(source,/PROJECT_CARBON_DRAFTS/);
  assert.match(source,/PROJECT_RESPONSIBLES_PENDING/);
  assert.match(source,/carbon_responsible:next,expected_carbon_responsible:previous/);
});

test("Enter guarda, Escape revierte y los controles no pliegan ni arrastran la ficha",()=>{
  assert.match(source,/event\.key==="Enter".*paSaveCarbonResponsible\(projectId\)/s);
  assert.match(source,/event\.key==="Escape".*PROJECT_CARBON_DRAFTS\.delete\(projectId\)/s);
  assert.match(source,/input\.onpointerdown=event=>event\.stopPropagation\(\)/);
  assert.match(source,/button\.onclick=event=>\{event\.preventDefault\(\);event\.stopPropagation\(\);paSaveCarbonResponsible/);
});

test("el guardado anuncia, bloquea sólo el proyecto y reconcilia conflicto entre pestañas",()=>{
  assert.match(source,/aria-busy="true"/);
  assert.match(source,/role="status" aria-live="polite"/);
  assert.match(source,/PROJECT_RESPONSIBLES_PENDING\.add\(projectId\)/);
  assert.match(source,/current_carbon_responsible/);
  assert.match(source,/cambió en otra pestaña/);
  assert.match(source,/PROJECT_RESPONSIBLES_PENDING\.delete\(projectId\)/);
});

test("el borrador vive fuera del catálogo y sobrevive al refresco automático",()=>{
  assert.match(source,/function paCarbonDraft\(project\)\{return PROJECT_CARBON_DRAFTS\.has\(project\.id\)/);
  assert.match(source,/value="'\+esc\(draft\)\+'"/);
  assert.doesNotMatch(source,/PROJECT_CARBON_DRAFTS\.clear\(\)/);
});

test("el responsive apila la etiqueta y mantiene un botón táctil",()=>{
  assert.match(source,/@media\(max-width:620px\)\{\.pa-responsible\{grid-template-columns:minmax\(0,1fr\) auto\}/);
  assert.match(source,/@media\(pointer:coarse\)\{\.pa-responsible button\{min-width:44px;min-height:44px\}/);
});

test("Equipo edita ambos campos inequívocos y nunca vuelve a llamar Carbono a owner",()=>{
  assert.match(equipo,/\{k:"silicon_responsible",l:"Responsable Silicio"/);
  assert.match(equipo,/\{k:"carbon_responsible",l:"Responsable Carbono"/);
  assert.match(equipo,/p\.carbon_responsible\?\[\{name:p\.carbon_responsible,role:"Responsable Carbono"\}\]/);
  assert.doesNotMatch(equipo,/\{k:"owner",\s*l:"Responsable de carbono"/i);
  assert.doesNotMatch(equipo,/responsibles_text|Responsables y roles/);
  assert.match(equipo,/delete body\.silicon_responsible;\s*delete body\.carbon_responsible;/);
  assert.match(equipo,/WORKER\+"\/projects\/responsibles"/);
  assert.match(equipo,/expected_silicon_responsible=siliconActual/);
  assert.match(equipo,/expected_carbon_responsible=carbonActual/);
});
