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

test("Proyectos abre arriba del todo; Pulso y Xperiencias nacen compactados",()=>{
  assert.match(source,/<div class="wrap">\s*<details class="dash-section" id="projectAgentSection" open>/);
  assert.match(source,/<details class="dash-section" id="pulseSection">\s*<summary class="shd">Pulso de la flota/);
  assert.match(source,/<details class="dash-section" id="projectAgentSection" open>\s*<summary class="shd">Proyectos y agentes/);
  assert.match(source,/<details class="dash-section" id="liveExperiencesSection">\s*<summary class="shd">Xperiencias en vivo/);
  assert.doesNotMatch(source,/<details class="dash-section" id="(?:pulseSection|liveExperiencesSection)"[^>]*\sopen(?:\s|>)/);
  assert.match(source,/\.dash-section\[open\]>\.shd::before/);
  assert.match(source,/projectAgentSection"\)\.addEventListener\("toggle"/);
});

test("el Dashboard incluye proyectos y equipos con agentes anidados",()=>{
  assert.match(source,/Proyectos y agentes/);
  assert.match(source,/id="projectAgentProjects"/);
  assert.match(source,/id="projectAgentTeams"/);
  assert.match(source,/class="pa-team-agents"/);
  assert.match(source,/data-agent-node=/);
  assert.match(source,/id="projectAgentSvg"/);
  assert.match(source,/id="projectAgentRefresh"/);
  assert.match(source,/aria-live="polite"/);
});

test("proyectos y equipos son compactables y enseñan sus tres recuentos",()=>{
  assert.match(source,/<details class="pa-col" id="projectAgentProjectsPane" open>/);
  assert.match(source,/<details class="pa-col" id="projectAgentTeamsPane" open>/);
  assert.doesNotMatch(source,/id="projectAgentAgentsPane"/);
  assert.match(source,/Proyectos <span class="pa-count" id="projectAgentProjectsN">/);
  assert.match(source,/Equipos físicos <span class="pa-count" id="projectAgentTeamsN">/);
  assert.match(source,/· Agentes <span class="pa-count" id="projectAgentAgentsN">/);
  assert.match(source,/pa\("projectAgentProjectsN"\)\.textContent=HIDDEN_PROJECTS\.size\?visibleActive\+"\/"\+active:active/);
  assert.match(source,/pa\("projectAgentTeamsN"\)\.textContent=HIDDEN_TEAMS\.size\?visibleTeams\.length\+"\/"\+teams\.length:teams\.length/);
  assert.match(source,/pa\("projectAgentAgentsN"\)\.textContent=HIDDEN_TEAMS\.size\?visibleAgents\+"\/"\+PROJECT_ROSTER\.length:PROJECT_ROSTER\.length/);
});

test("el mapa coloca proyectos a la izquierda y equipos con agentes a la derecha",()=>{
  assert.match(source,/id="projectAgentProjects"[\s\S]*id="projectAgentTeams"/);
  assert.match(source,/\.pa-map\{[^}]*grid-template-columns:minmax\(240px,340px\) minmax\(260px,360px\)/);
  assert.match(source,/\.pa-map\{[^}]*gap:88px;justify-content:center/);
  assert.match(source,/\.pa-agent-node \.pa-port\{left:5px\}/);
  assert.match(source,/\.pa-project-node \.pa-port\{top:auto;right:4px;bottom:4px/);
  assert.match(source,/const direction=b\.x>=a\.x\?1:-1/);
});

test("el Dashboard carga proyectos y toma los agentes del mismo pulso físico",()=>{
  assert.match(source,/const PROJECTS_API="https:\/\/api\.yokup\.com"/);
  assert.match(source,/paJson\("\/projects"\)/);
  assert.match(source,/PROJECT_ROSTER=paPhysicalAgents\(fresh\)/);
  assert.match(source,/ykAgentIdentity\.display\(p\.persona,p\.machine\)/);
  assert.match(source,/Arrastra la <b>flecha de un agente<\/b>/);
  assert.match(source,/pulsa <b>detalle<\/b>/);
});

test("cada proyecto nace como cabecera y permite expandir sus detalles",()=>{
  assert.match(source,/<details class="pa-project-node/);
  assert.match(source,/<summary class="pa-project-summary">/);
  assert.match(source,/<div class="pa-project-main"><div class="pa-name">/);
  assert.match(source,/<div class="pa-project-controls">'\+target\+'<span class="pa-state/);
  assert.match(source,/<span class="pa-expand">detalle<\/span>/);
  assert.match(source,/<div class="pa-project-detail">/);
  assert.match(source,/const openProjects=new Set/);
  assert.match(source,/openProjects\.has\(project\.id\)\?' open':''/);
  assert.match(source,/data-project-port=/);
});

test("cada equipo físico contiene sus agentes latiendo y su flecha individual",()=>{
  assert.match(source,/<details class="pa-team-node" data-team-key=/);
  assert.match(source,/<summary class="pa-team-summary">/);
  assert.match(source,/<div class="pa-team-agents">/);
  assert.match(source,/team\.agents\.map\(agent=>/);
  assert.match(source,/data-agent-node=/);
  assert.match(source,/data-link-agent=/);
  assert.match(source,/Conectar .* con un proyecto/);
});

test("los agentes nacen compactados dentro de cada equipo",()=>{
  assert.match(source,/const openTeams=new Set\(\[\.\.\.teamsBox\.querySelectorAll\("\[data-team-key\]\[open\]"\)\]/);
  assert.match(source,/openTeams\.has\(team\.key\)\?' open':''/);
  assert.doesNotMatch(source,/closedTeams\.has\(team\.key\)\?'':' open'/);
});

test("proyectos y equipos se pueden ocultar por ficha y restaurar con Todos",()=>{
  assert.match(source,/id="projectAgentProjectsAll"[^>]*hidden>Todos<\/button>/);
  assert.match(source,/id="projectAgentTeamsAll"[^>]*hidden>Todos<\/button>/);
  assert.match(source,/const HIDDEN_PROJECTS=new Set\(\)/);
  assert.match(source,/const HIDDEN_TEAMS=new Set\(\)/);
  assert.match(source,/data-pa-hide-project=/);
  assert.match(source,/data-pa-hide-team=/);
  assert.match(source,/HIDDEN_PROJECTS\.add\(button\.dataset\.paHideProject\)/);
  assert.match(source,/HIDDEN_TEAMS\.add\(button\.dataset\.paHideTeam\)/);
  assert.match(source,/HIDDEN_PROJECTS\.clear\(\);paRender\(\)/);
  assert.match(source,/HIDDEN_TEAMS\.clear\(\);paRender\(\)/);
  assert.match(source,/Proyectos ocultos · pulsa Todos/);
  assert.match(source,/Equipos ocultos · pulsa Todos/);
});

test("arrastrar un agente asocia primero su máquina y después el propio agente",()=>{
  assert.match(source,/data-link-agent/);
  assert.match(source,/data-project-node/);
  assert.match(source,/onpointerdown=paStartDrag/);
  assert.match(source,/document\.elementFromPoint\(event\.clientX,event\.clientY\)/);
  assert.match(source,/paConnectAgent\(project\.dataset\.projectNode,agent\)/);
  assert.match(source,/tapped=!LINK_DRAG\.moved/);
  assert.match(source,/LINK_CLICK_AGENT=agent/);
  assert.match(source,/async function paConnectAgent\(project,agent\)/);
  assert.match(source,/JSON\.stringify\(\{project,kind:"machine",ref:teamRef,remove:false\}\)/);
  assert.match(source,/JSON\.stringify\(\{project,kind:"agent",ref:agent,remove:false,machine:row\.machine\}\)/);
  assert.match(source,/data-pa-target=/);
  assert.match(source,/data-pa-remove-team/);
});

test("las uniones agente-proyecto se dibujan con flechas",()=>{
  assert.match(source,/function paDrawLinks\(\)/);
  assert.match(source,/pa\("projectAgentProjectsPane"\)\.open&&pa\("projectAgentTeamsPane"\)\.open/);
  assert.match(source,/\["projectAgentProjectsPane","projectAgentTeamsPane"\]\.forEach\(id=>pa\(id\)\.addEventListener\("toggle",\(\)=>\{paDrawLinks\(\);requestAnimationFrame\(paDrawLinks\);\}\)\)/);
  assert.match(source,/marker-end="url\(#paArrow\)"/);
  assert.match(source,/project\.agents\|\|\[\]/);
  assert.match(source,/data-agent-node=/);
  assert.match(source,/data-link-agent/);
  assert.match(source,/!source\.getClientRects\(\)\.length\|\|!target\.getClientRects\(\)\.length/);
});

test("el mapa conserva el scroll y se apila en pantallas estrechas",()=>{
  assert.match(source,/\.pa-scroll\{overflow:visible/);
  assert.doesNotMatch(source,/\.pa-scroll\{[^}]*overscroll-behavior:contain/);
  assert.match(source,/@media\(max-width:900px\)\{\.pa-map\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(source,/\.pa-links\{display:none\}\}/);
});

test("cada agente conectado puede abrir mejoras del proyecto en una Ventana de Decisión",()=>{
  assert.match(source,/const assignedProjects=PROJECT_ROWS\.filter\(project=>/);
  assert.match(source,/data-pa-decision=/);
  assert.match(source,/Ventana de Decisión/);
  assert.match(source,/function paOpenDecision\(projectId,agentId\)/);
  assert.match(source,/paJson\("\/projects\/decision"/);
  assert.match(source,/JSON\.stringify\(\{project:project\.id,agent:agent\.id,machine:agent\.machine\}\)/);
  assert.match(source,/target\.searchParams\.set\("decision",d\.decision_id\)/);
});
