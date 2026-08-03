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
  "paFamilyId","paAgentRole","paTeamKey","paAgentFamilies"
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
  assert.match(source,/<details class="pa-col" id="projectAgentTeamsPane">/);
  assert.doesNotMatch(source,/<details class="pa-col" id="projectAgentTeamsPane" open>/);
  assert.doesNotMatch(source,/id="projectAgentAgentsPane"/);
  assert.match(source,/Proyectos <span class="pa-count" id="projectAgentProjectsN">/);
  assert.match(source,/Equipos físicos <span class="pa-count" id="projectAgentTeamsN">/);
  assert.match(source,/· Agentes <span class="pa-count" id="projectAgentAgentsN">/);
  assert.match(source,/pa\("projectAgentProjectsN"\)\.textContent=visibleActive\+"\/"\+active/);
  assert.match(source,/pa\("projectAgentTeamsN"\)\.textContent=visibleTeams\.length\+"\/"\+teams\.length/);
  assert.match(source,/pa\("projectAgentAgentsN"\)\.textContent=visibleAgents\+"\/"\+families\.length/);
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
  assert.match(source,/const BROWSERS="https:\/\/admira-navegadores\.csilvasantin\.workers\.dev\/api\/browsers"/);
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

test("Sub e Infra se anidan en su agente principal y nunca cuentan como agentes",()=>{
  assert.match(source,/function paFamilyId\(value,machine\)/);
  assert.match(source,/ykAgentIdentity\.scoped\(parsed\.persona,resolved,"main"\)/);
  assert.match(source,/if\(role==="main"\)family\.slots\.push\(agent\);else family\.helpers\.push/);
  assert.match(source,/class="pa-family-helpers"/);
  assert.match(source,/helper\.role==="sub"\?"ejecución":"infra · QA"/);
  assert.match(source,/families=paAgentFamilies\(PROJECT_ROSTER\)/);
  assert.match(source,/families\.length\+" agentes principales/);
  assert.match(source,/visibleAgents\+"\/"\+families\.length/);
  assert.match(source,/team\.agents\.length\+' agente'[\s\S]*' principal'/);
  assert.doesNotMatch(source,/PROJECT_ROSTER\.length\+" agentes/);
});

test("dos superficies, Sub e Infra producen una sola familia contable",()=>{
  const rows=[
    {id:"NeoMini",machine:"Mac Mini",team:"Mini",teamMachine:"Mac Mini",runtime:"Claude",host:"app",online:true,updated:4},
    {id:"NeoMini",machine:"Mac Mini",team:"Mini",teamMachine:"Mac Mini",runtime:"Claude",host:"cli",online:true,updated:3},
    {id:"SubNeoMini",machine:"Mac Mini",team:"Mini",teamMachine:"Mac Mini",runtime:"Claude",host:"cli",online:true,updated:2},
    {id:"InfraNeoMini",machine:"Mac Mini",team:"Mini",teamMachine:"Mac Mini",runtime:"Codex",host:"app",online:false,assigned:true,updated:0},
    {id:"OraculoMini",machine:"Mac Mini",team:"Mini",teamMachine:"Mac Mini",runtime:"Codex",host:"app",online:true,updated:5}
  ];
  const families=familyApi.paAgentFamilies(rows),neo=families.find(family=>family.id==="NeoMini");
  assert.equal(families.length,2);
  assert.equal(neo.surfaces.length,2);
  assert.deepEqual(neo.helpers.map(helper=>helper.id).sort(),["InfraNeoMini","SubNeoMini"]);
  assert.equal(neo.memberIds.length,3);
});

test("las asignaciones de Sub e Infra se agrupan en una sola familia de proyecto",()=>{
  assert.match(source,/function paProjectAgentGroups\(project\)/);
  assert.match(source,/function paProjectFamilyRefs\(project\)/);
  assert.match(source,/function paProjectRefsForFamily\(project,family\)/);
  assert.match(source,/assignedGroups\.length\+' agentes principales/);
  assert.match(source,/group\.helpers\.map\(ref=>esc\(ref\)\)/);
  assert.match(source,/async function paRemoveFamily\(project,familyId\)/);
  assert.match(source,/for\(const ref of refs\)/);
});

test("cada proyecto usa una captura real de su solución en vez de una carpeta genérica",()=>{
  assert.match(source,/function paProjectShot\(project\)/);
  assert.match(source,/PROJECTS_API\+"\/shot\?url="\+encodeURIComponent\(shotUrl\.href\)/);
  assert.match(source,/project\.id==="yokup-ideas-objetivos"\?"https:\/\/www\.yokup\.com\/objetivos"/);
  assert.match(source,/pixeria\\\.com\$\/i\.test\(shotUrl\.hostname\)\)shotUrl\.searchParams\.set\("gate","off"\)/);
  assert.match(source,/<img loading="lazy" alt="" src=/);
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

test("el detalle muestra el Responsable Principal y NeoMacMini es el valor por defecto",()=>{
  assert.match(source,/function paPrimaryResponsible\(project\)/);
  assert.match(source,/primary_responsible\|\|project&&project\.owner\|\|"NeoMacMini"/);
  assert.match(source,/<b>Responsable Principal<\/b>/);
  assert.match(source,/class="pa-primary"/);
  assert.match(source,/isPrimary=group\.id===primaryId/);
  assert.match(source,/isPrimary\?'Responsable Principal'/);
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
  assert.match(source,/const openTeams=new Set\(\[\.\.\.teamsBox\.querySelectorAll\("\[data-team-key\]\[open\]"\)\]/);
  assert.match(source,/openTeams\.has\(team\.key\)\?' open':''/);
  assert.doesNotMatch(source,/closedTeams\.has\(team\.key\)\?'':' open'/);
  assert.match(source,/\.pa-team-node:not\(\[open\]\)>\.pa-team-agents/);
});

test("proyectos y equipos se pueden ocultar por ficha y restaurar desde sus filtros",()=>{
  assert.match(source,/id="projectAgentProjectsAll"[^>]*aria-pressed="true">Todos<\/button>/);
  assert.match(source,/id="projectAgentTeamsAll"[^>]*aria-pressed="true">Todos<\/button>/);
  assert.match(source,/data-pa-hide-project=/);
  assert.match(source,/data-pa-hide-team=/);
  assert.match(source,/PROJECT_SCOPE=paSetScopeItem\(PROJECT_SCOPE,button\.dataset\.paHideProject,false/);
  assert.match(source,/TEAM_SCOPE=paSetScopeItem\(TEAM_SCOPE,button\.dataset\.paHideTeam,false/);
  assert.match(source,/recupéralo desde Opciones/);
  assert.match(source,/recupéralo desde Avanzado/);
});

test("Opciones lista todos los proyectos y Avanzado todos los equipos con multiselección persistente",()=>{
  assert.match(source,/data-yk-slot="left" aria-label="Filtrar proyectos del Dashboard"/);
  assert.match(source,/id="paProjectScopeList"/);
  assert.match(source,/data-yk-slot="right" aria-label="Filtrar equipos físicos del Dashboard"/);
  assert.match(source,/id="paTeamScopeList"/);
  assert.match(source,/const PROJECT_SCOPE_KEY="yokup\.dashboard\.projects\.v1"/);
  assert.match(source,/const TEAM_SCOPE_KEY="yokup\.dashboard\.teams\.v1"/);
  assert.match(source,/function paReadScope\(key\)/);
  assert.match(source,/function paWriteScope\(key,scope\)/);
  assert.match(source,/function paSetScopeItem\(scope,key,checked,keys\)/);
  assert.match(source,/data-pa-scope-all/);
  assert.match(source,/data-pa-scope-item/);
  assert.match(source,/selected=scope===null\?items\.length/);
  assert.match(source,/paScopeAllows\(PROJECT_SCOPE,project\.id\)/);
  assert.match(source,/paScopeAllows\(TEAM_SCOPE,team\.key\)/);
  assert.match(source,/paWriteScope\(PROJECT_SCOPE_KEY,PROJECT_SCOPE\)/);
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
  assert.match(source,/\["projectAgentProjectsPane","projectAgentTeamsPane"\]\.forEach\(id=>pa\(id\)\.addEventListener\("toggle",\(\)=>\{paDrawLinks\(\);requestAnimationFrame\(paDrawLinks\);\}\)\)/);
  assert.match(source,/id="projectAgentSvg"[^>]*preserveAspectRatio="none"/);
  assert.match(source,/svg\.setAttribute\("viewBox","0 0 "\+Math\.max\(1,rect\.width\)\+" "\+Math\.max\(1,rect\.height\)\)/);
  assert.match(source,/pa\("projectAgentLinks"\)\.innerHTML=""/);
  assert.match(source,/new ResizeObserver\(\(\)=>requestAnimationFrame\(paDrawLinks\)\)\.observe\(pa\("projectAgentMap"\)\)/);
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
  assert.match(source,/stroke="'\+colors\.get\(agentNode\.dataset\.agentNode\+'\|'\+project\.id\)/);
  assert.match(source,/\.pa-link\{fill:none;stroke-width:2;opacity:\.58/);
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
  assert.match(source,/\.pa-col,\.pa-project-node,\.pa-team-node\{transform:none!important\}/);
});

test("cada ficha se puede mover libremente y sus conectores la siguen",()=>{
  assert.match(source,/data-pa-node-move=/);
  assert.match(source,/data-pa-node-key=/);
  assert.match(source,/const NODE_OFFSETS=new Map\(\)/);
  assert.match(source,/function paStartNodeMove\(event\)/);
  assert.match(source,/function paMoveNode\(event\)/);
  assert.match(source,/paSetNodeOffset\(NODE_DRAG\.key,x,y,NODE_DRAG\.node\);paDrawLinks\(\)/);
  assert.match(source,/handle\.onpointerdown=paStartNodeMove/);
  assert.match(source,/handle\.ondblclick=paResetNode/);
  assert.match(source,/window\.addEventListener\("pointermove",paMoveNode\)/);
  assert.match(source,/window\.addEventListener\("pointerup",paEndNodeMove\)/);
  assert.match(source,/\.pa-project-node,\.pa-team-node\{transform:translate\(var\(--pa-node-x,0px\),var\(--pa-node-y,0px\)\)/);
  assert.doesNotMatch(source,/\.pa-agent-node,\.pa-team-node,\.pa-project-node\{[^}]*transition:[^}]*transform/);
});

test("el mapa conserva el scroll y se apila en pantallas estrechas",()=>{
  assert.match(source,/\.pa-scroll\{overflow:visible/);
  assert.doesNotMatch(source,/\.pa-scroll\{[^}]*overscroll-behavior:contain/);
  assert.match(source,/@media\(max-width:900px\)\{\.pa-map\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(source,/\.pa-links\{display:none\}/);
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
