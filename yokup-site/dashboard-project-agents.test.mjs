import test from "node:test";
import assert from "node:assert/strict";
import {access,readFile} from "node:fs/promises";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");
const frame=await readFile(new URL("./yk-frame.js",import.meta.url),"utf8");
const landing=await readFile(new URL("./index.html",import.meta.url),"utf8");
const redirects=await readFile(new URL("./_redirects",import.meta.url),"utf8");

test("el Dashboard vive en /dashboard y conserva /agentica sólo como retorno compatible",async()=>{
  await assert.rejects(access(new URL("./agentica.html",import.meta.url)),error=>error&&error.code==="ENOENT");
  assert.match(frame,/\["DASHBOARD",\s+"\/dashboard"\]/);
  assert.match(landing,/href="\/dashboard" class="btn access"/);
  assert.doesNotMatch(frame,/\/agentica/);
  assert.doesNotMatch(landing,/\/agentica/);
  assert.match(redirects,/^\/agentica\s+\/dashboard\s+301$/m);
  assert.match(redirects,/^\/agentica\.html\s+\/dashboard\s+301$/m);
});

test("Pulso, Proyectos y Xperiencias nacen compactados y se pueden desplegar",()=>{
  assert.match(source,/<details class="dash-section" id="pulseSection">\s*<summary class="shd">Pulso de la flota/);
  assert.match(source,/<details class="dash-section" id="projectAgentSection">\s*<summary class="shd">Proyectos y agentes/);
  assert.match(source,/<details class="dash-section" id="liveExperiencesSection">\s*<summary class="shd">Xperiencias en vivo/);
  assert.doesNotMatch(source,/<details class="dash-section"[^>]*\sopen(?:\s|>)/);
  assert.match(source,/\.dash-section\[open\]>\.shd::before/);
  assert.match(source,/projectAgentSection"\)\.addEventListener\("toggle"/);
});

test("el Dashboard incluye la gestión de agentes por proyecto",()=>{
  assert.match(source,/Proyectos y agentes/);
  assert.match(source,/id="projectAgentAgents"/);
  assert.match(source,/id="projectAgentProjects"/);
  assert.match(source,/id="projectAgentSvg"/);
  assert.match(source,/id="projectAgentRefresh"/);
  assert.match(source,/aria-live="polite"/);
});

test("los proyectos aparecen antes que los agentes y las flechas recorren ambos sentidos",()=>{
  assert.match(source,/id="projectAgentProjects"[\s\S]*id="projectAgentAgents"/);
  assert.match(source,/\.pa-agent-node \.pa-port\{left:8px\}/);
  assert.match(source,/\.pa-project-node \.pa-port\{right:8px/);
  assert.match(source,/const direction=b\.x>=a\.x\?1:-1/);
});

test("el Dashboard carga proyectos y toma los agentes del mismo pulso físico",()=>{
  assert.match(source,/const PROJECTS_API="https:\/\/api\.yokup\.com"/);
  assert.match(source,/paJson\("\/projects"\)/);
  assert.match(source,/PROJECT_ROSTER=paPhysicalAgents\(fresh\)/);
  assert.match(source,/ykAgentIdentity\.display\(p\.persona,p\.machine\)/);
  assert.match(source,/TrinityMBP14 → Yokup\.com/);
});

test("arrastrar una flecha hasta un proyecto guarda la asociación",()=>{
  assert.match(source,/data-link-agent/);
  assert.match(source,/data-project-node/);
  assert.match(source,/onpointerdown=paStartDrag/);
  assert.match(source,/document\.elementFromPoint\(event\.clientX,event\.clientY\)/);
  assert.match(source,/paAssign\(project\.dataset\.projectNode,agent,false\)/);
  assert.match(source,/tapped=!LINK_DRAG\.moved/);
  assert.match(source,/LINK_CLICK_AGENT=agent/);
  assert.match(source,/paJson\("\/projects\/assign"/);
  assert.match(source,/JSON\.stringify\(\{project,kind:"agent",ref:agent,remove:!!remove\}\)/);
  assert.match(source,/data-pa-remove/);
});

test("las uniones persistidas se dibujan como flechas SVG y pueden retirarse",()=>{
  assert.match(source,/function paDrawLinks\(\)/);
  assert.match(source,/marker-end="url\(#paArrow\)"/);
  assert.match(source,/project\.agents\|\|\[\]/);
  assert.match(source,/Referencia histórica; el agente no está latiendo ahora/);
});

test("cada agente conectado puede abrir mejoras del proyecto en una Ventana de Decisión",()=>{
  assert.match(source,/PROJECT_ROWS\.filter\(project=>project\.status!=="archivado"&&\(project\.agents\|\|\[\]\)\.includes\(agent\.id\)\)/);
  assert.match(source,/data-pa-decision=/);
  assert.match(source,/Ventana de Decisión ·/);
  assert.match(source,/function paOpenDecision\(projectId,agentId\)/);
  assert.match(source,/paJson\("\/projects\/decision"/);
  assert.match(source,/JSON\.stringify\(\{project:project\.id,agent:agent\.id,machine:agent\.machine\}\)/);
  assert.match(source,/target\.searchParams\.set\("decision",d\.decision_id\)/);
});
