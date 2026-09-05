import test from "node:test";
import assert from "node:assert/strict";
import {access,readFile} from "node:fs/promises";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");
const frame=await readFile(new URL("./yk-frame.js",import.meta.url),"utf8");
const landing=await readFile(new URL("./index.html",import.meta.url),"utf8");
const redirects=await readFile(new URL("./_redirects",import.meta.url),"utf8");
await import("./yk-agent-identity.js");
const identity=globalThis.ykAgentIdentity;

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);assert.notEqual(start,-1,`falta ${name}`);
  const brace=source.indexOf("{",start);let depth=0,quote="",escaped=false;
  for(let i=brace;i<source.length;i++){
    const char=source[i];
    if(quote){if(escaped)escaped=false;else if(char==="\\")escaped=true;else if(char===quote)quote="";continue;}
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}
    if(char==="{")depth++;else if(char==="}"&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`función ${name} incompleta`);
}

const familyApi=new Function("window","ykAgentIdentity",[
  "paStopKey","paAgentId","paFamilyId","paAgentRole","paTeamKey","paAgentFamilies"
].map(functionSource).join("\n")+"\nreturn {paAgentFamilies};")({ykAgentIdentity:identity},identity);

test("el Dashboard vive en /dashboard y conserva /agentica sólo como retorno compatible",async()=>{
  await assert.rejects(access(new URL("./agentica.html",import.meta.url)),error=>error&&error.code==="ENOENT");
  assert.match(frame,/\["DASHBOARD",\s+"\/dashboard"\]/);
  assert.match(landing,/href="\/dashboard" class="btn access"/);
  assert.doesNotMatch(frame,/\/agentica/);
  assert.doesNotMatch(landing,/\/agentica/);
  assert.match(redirects,/^\/agentica\s+\/dashboard\s+301$/m);
  assert.match(redirects,/^\/agentica\.html\s+\/dashboard\s+301$/m);
});

test("el título principal abre el contenido y Proyectos precede a la zona secundaria",()=>{
  assert.match(source,/<div class="wrap">\s*<h1>Plataforma agéntica de gestión de Xperiencias<\/h1>\s*<section class="record-pace"[\s\S]*?<\/section>\s*<details class="dash-section" id="projectAgentSection">/);
  assert.match(source,/<details class="dash-section" id="pulseSection">\s*<summary class="shd">Flota de Agentes Silicio/);
  assert.match(source,/<details class="dash-section" id="projectAgentSection">\s*<summary class="shd">Proyectos y agentes/);
  assert.match(source,/<details class="dash-section" id="liveExperiencesSection">\s*<summary class="shd">Xperiencias en vivo/);
  assert.match(source,/<details class="dash-section" id="modulesSection">\s*<summary class="shd">Módulos<\/summary>\s*<div class="dash-section-body">[\s\S]*?<div class="foot">/);
  assert.doesNotMatch(source,/<details class="dash-section" id="(?:pulseSection|liveExperiencesSection|modulesSection)"[^>]*\sopen(?:\s|>)/);
  assert.match(source,/\.dash-section\[open\]>\.shd::before/);
  assert.match(source,/projectAgentSection"\)\.addEventListener\("toggle"/);
});

test("el Dashboard incluye proyectos y equipos con agentes anidados",()=>{
  assert.match(source,/Proyectos y agentes/);
  assert.match(source,/id="projectAgentProjects"/);
  assert.match(source,/id="projectAgentTeams"/);
  assert.match(source,/class="pa-team-agents"/);
  assert.match(source,/data-agent-node=/);
  assert.match(source,/data-agent-online=/);
  assert.match(source,/id="projectAgentSvg"/);
  assert.match(source,/id="projectAgentRefresh"/);
  assert.match(source,/aria-live="polite"/);
});

test("proyectos y organización son compactables y separan Equipos, Silicio y Carbono",()=>{
  assert.match(source,/<details class="pa-col" id="projectAgentProjectsPane" open>/);
  assert.match(source,/<details class="pa-col" id="projectAgentTeamsPane" open>/);
  assert.doesNotMatch(source,/id="projectAgentAgentsPane"/);
  assert.match(source,/Proyectos <span class="pa-count" id="projectAgentProjectsN">/);
  assert.match(source,/role="tab" data-pa-roster-tab="teams"[\s\S]*Equipos físicos <span class="pa-count" id="projectAgentTeamsN">/);
  assert.match(source,/role="tab" data-pa-roster-tab="silicon"[\s\S]*Agentes de Silicio <span class="pa-count" id="projectAgentSiliconN">/);
  assert.match(source,/role="tab" data-pa-roster-tab="carbon"[\s\S]*Agentes de Carbono <span class="pa-count" id="projectAgentCarbonN">/);
  assert.doesNotMatch(source,/id="projectAgentInfrasN"/);
  assert.match(source,/pa\("projectAgentProjectsN"\)\.textContent=visibleActive\+"\/"\+active/);
  assert.match(source,/pa\("projectAgentTeamsN"\)\.textContent=visibleTeams\.length\+"\/"\+teams\.length/);
  assert.match(source,/pa\("projectAgentSiliconN"\)\.textContent=roleCounts\.main\.active\+"\/"\+roleCounts\.main\.total/);
  assert.match(source,/pa\("projectAgentCarbonN"\)\.textContent=String\(carbonAgents\.length\)/);
});

test("el mapa coloca proyectos a la izquierda y equipos con agentes a la derecha",()=>{
  assert.match(source,/id="projectAgentProjects"[\s\S]*id="projectAgentTeams"/);
  assert.match(source,/\.pa-map\{[^}]*grid-template-columns:minmax\(280px,520px\) minmax\(300px,560px\)/);
  assert.match(source,/\.pa-map\{[^}]*gap:clamp\(88px,10vw,420px\);justify-content:space-between/);
  assert.match(source,/\.pa-agent-node \.pa-port\{left:5px\}/);
  assert.match(source,/\.pa-project-node \.pa-port\{top:auto;right:4px;bottom:4px/);
  assert.match(source,/const direction=b\.x>=a\.x\?1:-1/);
});

test("el Dashboard aprovecha el ancho completo y escala hasta pantallas 4K",()=>{
  assert.match(source,/\.wrap\{width:100%;max-width:none/);
  assert.match(source,/padding:clamp\(18px,1\.35vw,52px\) clamp\(14px,2\.1vw,84px\)/);
  assert.match(source,/@media\(max-width:1200px\)\{\.wrap\{padding:22px 24px 48px\}/);
  assert.match(source,/@media\(min-width:2200px\)\{/);
  assert.match(source,/\.pa-map\{grid-template-columns:minmax\(440px,620px\) minmax\(460px,660px\)\}/);
  assert.match(source,/\.frame iframe\{height:clamp\(420px,26vw,760px\)\}/);
});

test("el Dashboard carga proyectos y separa pulso físico de asignación permanente",()=>{
  assert.match(source,/const PROJECTS_API="https:\/\/api\.yokup\.com"/);
  assert.match(source,/paJson\("\/projects"\)/);
  assert.match(source,/PROJECT_LIVE_ROSTER=paPhysicalAgents\(fresh\)/);
  assert.match(source,/PROJECT_ROSTER=paProjectRoster\(PROJECT_LIVE_ROSTER,PROJECT_ROWS\)/);
  assert.match(source,/ykAgentIdentity\.display\(p\.persona,p\.machine\)/);
  assert.match(source,/Arrastra la <b>flecha de un agente<\/b>/);
  assert.match(source,/pulsa <b>detalle<\/b>/);
});

test("las asignaciones de Webmaster permanecen visibles aunque el agente no esté activo",()=>{
  assert.match(source,/let PROJECT_LIVE_ROSTER=\[\]/);
  assert.match(source,/function paProjectRoster\(live,projects\)/);
  assert.match(source,/paProjectAgentRefs\(project\)/);
  assert.match(source,/canonicalMachine\(id\)/);
  assert.match(source,/online:false,assigned:true/);
  assert.match(source,/asignado · sin actividad/);
  assert.match(source,/paProjectHasFamily\(project,agent\)/);
});

test("el censo conserva identidades reportadas y las contrasta con el navegador físico",()=>{
  // Dominio propio navegadores.yokup.com (FLT-1633): LaLiga bloquea workers.dev en horas de fútbol.
  assert.match(source,/const BROWSERS="https:\/\/navegadores\.yokup\.com\/api\/browsers"/);
  assert.match(source,/const AGENT_FRESH_SECONDS=240/);
  assert.match(source,/const AGENT_REFRESH_MS=3000/);
  assert.match(source,/function paPresencePersona\(row\)/);
  assert.match(source,/if\(raw\)return raw/);
  assert.match(source,/function paFreshPresence\(rows,now\)/);
  assert.doesNotMatch(source,/const slot=twin/);
  assert.match(source,/function paVerifiedPresence\(rows,browsers,now\)/);
  assert.match(source,/row\.source==="process_snapshot"&&row\.verified/);
  assert.match(source,/if\(snapshotTeams\.has\(team\)\)return/);
  assert.match(source,/snapshots\.concat\(verified,reported\.filter/);
  assert.match(source,/browser\.reporter&&browser\.reporter\.persona/);
  assert.match(source,/verifiedTeams\.has\(paTeamKey\(row\.machine\)\)/);
  assert.match(source,/const fresh=paVerifiedPresence\(d\.presence\|\|\[\],nav&&nav\.browsers\|\|\[\],now\)/);
  assert.match(source,/setInterval\(pulse,AGENT_REFRESH_MS\)/);
});

test("modelo y envoltorio son superficies internas del agente principal",()=>{
  assert.match(source,/function paHost\(value\)/);
  assert.match(source,/host==="app"\?"APP":host==="cli"\?"CLI"/);
  assert.match(source,/function paRuntimeSurface\(row\)/);
  assert.match(source,/runtime\+\(host\?" "\+host:""\)/);
  assert.match(source,/const slot="agent\|"\+base\+"\|"\+machine\+"\|"\+runtime\+"\|"\+host/);
  assert.match(source,/instanceId=id\+"\|"\+String\(runtime\)\.toLowerCase\(\)\+"\|"\+\(host\|\|"unknown"\)/);
  assert.match(source,/function paAgentFamilies\(rows\)/);
  assert.match(source,/instanceId:"family\|"\+id/);
  assert.match(source,/surfaces:uniqueSlots\(family\.slots\)/);
  assert.match(source,/class="pa-surfaces"/);
  assert.match(source,/data-agent-node="'\+esc\(agent\.instanceId\)/);
  assert.match(source,/agent\.surfaces\.map\(paRuntimeSurface\)/);
});

test("Sub queda como ejecución de Silicio e Infra se excluye de la vista",()=>{
  assert.match(source,/function paFamilyId\(value,machine\)/);
  assert.match(source,/ykAgentIdentity\.scoped\(parsed\.persona,resolved,"main"\)/);
  assert.match(source,/if\(role==="infra"\)return/);
  assert.match(source,/if\(role==="main"\)family\.slots\.push\(agent\);else family\.helpers\.push/);
  assert.match(source,/class="pa-family-helpers"/);
  assert.match(source,/Silicio · ejecución/);
  assert.match(source,/families=paAgentFamilies\(PROJECT_ROSTER\)/);
  assert.match(source,/families\.length\+" agentes de Silicio/);
  assert.match(source,/roleCounts\.main\.active\+"\/"\+roleCounts\.main\.total/);
  assert.match(source,/teamRoleCounts\.main\.active\+'\/'\+teamRoleCounts\.main\.total\+' Agentes de Silicio · '\+teamCarbons\.length\+' Agentes de Carbono'/);
  assert.doesNotMatch(source,/PROJECT_ROSTER\.length\+" agentes/);
});

test("dos superficies y Sub producen una familia; Infra no entra",()=>{
  const rows=[
    {id:"NeoMini",machine:"Mac Mini",team:"Mini",teamMachine:"Mac Mini",runtime:"Claude",host:"app",online:true,updated:4},
    {id:"NeoMini",machine:"Mac Mini",team:"Mini",teamMachine:"Mac Mini",runtime:"Claude",host:"cli",online:true,updated:3},
    {id:"SubNeoMini",machine:"Mac Mini",team:"Mini",teamMachine:"Mac Mini",runtime:"Claude",host:"cli",online:true,updated:2},
    {id:"InfraNeoMini",machine:"Mac Mini",team:"Mini",teamMachine:"Mac Mini",runtime:"Codex",host:"app",online:false,assigned:true,updated:0},
    {id:"OraculoMini",machine:"Mac Mini",team:"Mini",teamMachine:"Mac Mini",runtime:"Codex",host:"app",online:true,updated:5}
  ];
  // Las filas entran con el apellido legado («NeoMini») y salen ya reescritas con el
  // del diccionario vigente («NeoMacMini»): regla 03, corrección de Carlos 04-08-2026.
  const families=familyApi.paAgentFamilies(rows),neo=families.find(family=>family.id==="NeoMacMini");
  assert.equal(families.length,2);
  assert.equal(neo.surfaces.length,2);
  assert.deepEqual(neo.helpers.map(helper=>helper.id),["SubNeoMacMini"]);
  assert.equal(neo.memberIds.length,2);
});

test("las asignaciones Silicio se agrupan y las referencias Infra se filtran",()=>{
  assert.match(source,/function paProjectAgentGroups\(project\)/);
  assert.match(source,/function paProjectFamilyRefs\(project\)/);
  assert.match(source,/function paProjectRefsForFamily\(project,family\)/);
  assert.match(source,/filter\(ref=>paAgentRole\(ref\)!=="infra"\)/);
  assert.match(source,/assignedGroups\.length\+' agentes de Silicio/);
  assert.doesNotMatch(source,/group\.helpers\.map\(ref=>esc\(ref\)\)/);
  assert.match(source,/async function paRemoveFamily\(project,familyId\)/);
  assert.match(source,/for\(const ref of refs\)/);
});

test("cada proyecto usa una captura real de su solución en vez de una carpeta genérica",()=>{
  assert.match(source,/function paProjectShot\(project\)/);
  assert.match(source,/PROJECTS_API\+"\/shot\?url="\+encodeURIComponent\(shotUrl\.href\)/);
  assert.match(source,/project\.id==="yokup-ideas-objetivos"\?"https:\/\/www\.yokup\.com\/objetivos"/);
  assert.match(source,/pixeria\\\.com\$\/i\.test\(shotUrl\.hostname\)\)shotUrl\.searchParams\.set\("gate","off"\)/);
  assert.match(source,/<img loading="lazy" alt="Captura de /);
  assert.match(source,/versioned\?'<span class="pa-version-thumb"/);
  assert.match(source,/\.pa-folder img\{[^}]*object-fit:cover;object-position:top center/);
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

test("el detalle llama Responsable Silicio al agente existente y conserva NeoMacMini por defecto",()=>{
  assert.match(source,/function paSiliconResponsible\(project\)/);
  assert.match(source,/hasOwnProperty\.call\(project,"silicon_responsible"\)/);
  assert.match(source,/primary_responsible\|\|project&&project\.owner\|\|"NeoMacMini"/);
  assert.match(source,/<b>Responsable Silicio<\/b>/);
  assert.doesNotMatch(source,/<b>Responsable Principal<\/b>/);
  assert.match(source,/class="pa-responsible pa-responsible-silicon"/);
  assert.match(source,/isPrimary=group\.id===primaryId/);
  assert.match(source,/isPrimary\?'Responsable Silicio'/);
});

test("cada equipo físico contiene sus agentes latiendo y su flecha individual",()=>{
  assert.match(source,/<details class="pa-team-node" data-team-key=/);
  assert.match(source,/<summary class="pa-team-summary">/);
  assert.match(source,/<div class="pa-team-agents">/);
  assert.match(source,/team\.agents\.map\(agent=>/);
  assert.match(source,/data-agent-ref=/);
  assert.match(source,/data-link-agent=/);
  assert.match(source,/Conectar .* con un proyecto/);
});

test("los agentes nacen compactados dentro de cada equipo",()=>{
  assert.match(source,/const openTeams=new Set\(\[\.\.\.document\.querySelectorAll\("#projectAgentTeams \[data-team-key\]\[open\],#projectAgentSilicon \[data-team-key\]\[open\]"\)\]/);
  assert.match(source,/openTeams\.has\(team\.key\)\?' open':''/);
  assert.doesNotMatch(source,/closedTeams\.has\(team\.key\)\?'':' open'/);
  assert.match(source,/\.pa-team-node:not\(\[open\]\)>\.pa-team-agents/);
});

test("proyectos y equipos se pueden ocultar por ficha y restaurar desde sus filtros",()=>{
  assert.match(source,/id="projectAgentProjectsAll"[^>]*aria-pressed="true"[^>]*>Todos<\/button>/);
  assert.match(source,/id="projectAgentTeamsAll"[^>]*aria-pressed="true">Todos<\/button>/);
  assert.match(source,/data-pa-hide-project=/);
  assert.match(source,/data-pa-hide-team=/);
  assert.match(source,/PROJECT_SCOPE=paSetScopeItem\(PROJECT_SCOPE,button\.dataset\.paHideProject,false/);
  assert.match(source,/TEAM_SCOPE=paSetExactScopeItem\(TEAM_SCOPE,button\.dataset\.paHideTeam,false/);
  assert.match(source,/recupéralo desde Opciones/);
  assert.match(source,/recupéralo desde Avanzado/);
});

test("Opciones y Avanzado conservan multiselección sólo durante el documento",()=>{
  assert.match(source,/data-yk-slot="left" aria-label="Filtrar proyectos del Dashboard"/);
  assert.match(source,/id="paProjectScopeList"/);
  assert.match(source,/data-yk-slot="right" aria-label="Filtrar equipos físicos del Dashboard"/);
  assert.match(source,/id="paTeamScopeList"/);
  assert.match(source,/const PROJECT_SCOPE_KEY="yokup\.dashboard\.projects\.v1"/);
  assert.match(source,/const TEAM_SCOPE_KEY="yokup\.dashboard\.teams\.v1"/);
  assert.match(source,/function paClearLegacyScopes\(\)/);
  assert.match(source,/paClearLegacyScopes\(\);\s*let PROJECT_SCOPE=null;\s*let TEAM_SCOPE=null/);
  assert.match(source,/function paReadProjectScope\(\)/);
  assert.match(source,/function paWriteProjectScope\(\)\{\}/);
  assert.match(source,/function paReadScope\(\)\{return null;\}/);
  assert.match(source,/function paWriteScope\(\)\{\}/);
  assert.match(source,/function paSetScopeItem\(scope,key,checked,keys\)/);
  assert.match(source,/function paSetExactScopeItem\(scope,key,checked,keys\)/);
  assert.match(source,/data-pa-scope-all/);
  assert.match(source,/data-pa-scope-item/);
  assert.match(source,/selected=paScopeIsAll\(scope\)\?items\.length/);
  assert.match(source,/paScopeAllows\(PROJECT_SCOPE,project\.id\)/);
  assert.match(source,/paScopeAllows\(TEAM_SCOPE,team\.key\)/);
  assert.match(source,/paWriteProjectScope\(PROJECT_SCOPE\)/);
  assert.match(source,/paWriteScope\(TEAM_SCOPE_KEY,TEAM_SCOPE\)/);
});

test("Todos alterna con proyectos sin equipo y equipos sin proyecto",()=>{
  assert.match(source,/id="projectAgentProjectsUnassigned"[^>]*>Sin equipo<\/button>/);
  assert.match(source,/id="projectAgentTeamsUnassigned"[^>]*>Sin proyecto<\/button>/);
  assert.match(source,/let PROJECT_FILTER="all"/);
  assert.match(source,/let TEAM_FILTER="all"/);
  assert.match(source,/PROJECT_FILTER!=="unassigned"\|\|!\(project\.machines\|\|\[\]\)\.length/);
  assert.match(source,/TEAM_FILTER!=="unassigned"\|\|!paTeamHasProject\(team\)/);
  assert.match(source,/function paTeamHasProject\(team\)/);
  assert.match(source,/PROJECT_FILTER="unassigned";paRender\(\)/);
  assert.match(source,/TEAM_FILTER="unassigned";paRender\(\)/);
  assert.match(source,/PROJECT_FILTER="all";PROJECT_SCOPE=null/);
  assert.match(source,/TEAM_FILTER="all";TEAM_SCOPE=null/);
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
  assert.match(source,/\["projectAgentProjectsPane","projectAgentTeamsPane"\]\.forEach\(id=>pa\(id\)\.addEventListener\("toggle",\(\)=>\{paDrawLinks\(\);requestAnimationFrame\(paRefreshNodeLayout\);\}\)\)/);
  assert.match(source,/id="projectAgentSvg"[^>]*preserveAspectRatio="none"/);
  assert.match(source,/svg\.setAttribute\("viewBox","0 0 "\+Math\.max\(1,rect\.width\)\+" "\+Math\.max\(1,rect\.height\)\)/);
  assert.doesNotMatch(source,/pa\("projectAgentLinks"\)\.innerHTML=""/,"paRender no puede vaciar los cables: los reconcilia paDrawLinks");
  assert.match(source,/new ResizeObserver\(\(\)=>requestAnimationFrame\(paRefreshNodeLayout\)\)\.observe\(pa\("projectAgentMap"\)\)/);
  assert.match(source,/marker-end="url\(#paArrow\)"/);
  assert.match(source,/paProjectAgentRefs\(project\)/);
  assert.match(source,/data-agent-node=/);
  assert.match(source,/data-link-agent/);
  assert.match(source,/teamNode\.open&&agentNode\.getClientRects\(\)\.length/);
  assert.match(source,/teamNode\.querySelector\(':scope>\.pa-team-summary'\)/);
  assert.match(source,/!source\|\|!source\.getClientRects\(\)\.length/);
});

test("cada unión agente-proyecto recibe un color distinto y estable dentro del mapa",()=>{
  assert.match(source,/function paConnectionColors\(\)/);
  assert.match(source,/new Set\(PROJECT_ROWS\.flatMap/);
  assert.match(source,/index\*137\.508/);
  assert.match(source,/color=colors\.get\(agentNode\.dataset\.agentNode\+'\|'\+project\.id\)/);
  assert.match(source,/\.pa-link\{fill:none;stroke-width:2;stroke-linecap:round/);
});

test("los cables activos transportan luz en ambos sentidos y los asignados solo respiran",()=>{
  assert.match(source,/agentNode\.dataset\.agentOnline==="true"/);
  assert.match(source,/data-link-state="active"/);
  assert.match(source,/data-link-state="assigned"/);
  assert.match(source,/pa-link-flow pa-link-flow-out/);
  assert.match(source,/pa-link-flow pa-link-flow-back/);
  assert.match(source,/pathLength="100"/);
  assert.match(source,/@keyframes pa-data-out\{from\{stroke-dashoffset:0\}to\{stroke-dashoffset:-100\}\}/);
  assert.match(source,/@keyframes pa-data-back\{from\{stroke-dashoffset:-100\}to\{stroke-dashoffset:0\}\}/);
  assert.match(source,/@keyframes pa-cable-breathe/);
  assert.match(source,/@media\(prefers-reduced-motion:reduce\)\{\.pa-link-flow\{display:none\}/);
});

test("las columnas se pueden mover horizontalmente y las flechas siguen su posición",()=>{
  assert.match(source,/data-pa-move="projects"/);
  assert.match(source,/data-pa-move="teams"/);
  assert.match(source,/const COLUMN_OFFSETS=\{projects:0,teams:0\}/);
  assert.match(source,/function paStartColumnMove\(event\)/);
  assert.match(source,/function paMoveColumn\(event\)/);
  assert.match(source,/paSetColumnOffset\(COLUMN_DRAG\.key,next\);paDrawLinks\(\)/);
  assert.match(source,/handle\.onpointerdown=paStartColumnMove/);
  assert.match(source,/handle\.ondblclick=paResetColumn/);
  assert.match(source,/window\.addEventListener\("pointermove",paMoveColumn\)/);
  assert.match(source,/window\.addEventListener\("pointerup",paEndColumnMove\)/);
  assert.match(source,/\.pa-col,\.pa-project-node,\.pa-team-node,\.pa-agent-node,\.pa-carbon-node\{transform:none!important\}/);
});

test("cada ficha se puede mover libremente y sus conectores la siguen",()=>{
  assert.match(source,/data-pa-node-move=/);
  assert.match(source,/data-pa-node-key=/);
  assert.match(source,/const NODE_OFFSETS=new Map\(\)/);
  assert.match(source,/function paStartNodeMove\(event\)/);
  assert.match(source,/function paMoveNode\(event\)/);
  assert.match(source,/paSetNodeOffset\(NODE_DRAG\.key,next\.x,next\.y,NODE_DRAG\.node\);paDrawLinks\(\)/);
  assert.match(source,/handle\.onpointerdown=paStartNodeMove/);
  assert.match(source,/handle\.ondblclick=paResetNode/);
  assert.match(source,/window\.addEventListener\("pointermove",paMoveNode\)/);
  assert.match(source,/window\.addEventListener\("pointerup",paEndNodeMove\)/);
  assert.match(source,/\.pa-project-node,\.pa-team-node,\.pa-agent-node,\.pa-carbon-node\{transform:translate\(var\(--pa-node-x,0px\),var\(--pa-node-y,0px\)\)/);
  assert.doesNotMatch(source,/\.pa-agent-node,\.pa-team-node,\.pa-project-node\{[^}]*transition:[^}]*transform/);
});

test("el mapa conserva el scroll y se apila en pantallas estrechas",()=>{
  assert.match(source,/\.pa-scroll\{overflow:visible/);
  assert.doesNotMatch(source,/\.pa-scroll\{[^}]*overscroll-behavior:contain/);
  const mobileAt=source.indexOf("@media(max-width:900px){");
  assert.ok(mobileAt>=0,"falta la media query principal de 900px");
  const nextMedia=source.indexOf("@media",mobileAt+1);
  const mobile=source.slice(mobileAt,nextMedia<0?source.length:nextMedia);
  assert.match(mobile,/\.pa-map\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(mobile,/\.pa-links\{display:none\}/);
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
