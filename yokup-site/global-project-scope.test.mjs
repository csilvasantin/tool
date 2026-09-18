import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=name=>readFile(new URL(`./${name}`,import.meta.url),"utf8");
const [frame,missions,tasks,objectives,decisions,reports]=await Promise.all([
  "yk-frame.js","misiones.html","tareas.html","objetivos.html","yk-decisions.js","informes.html"
].map(read));

function functionSource(source,name){
  const start=source.indexOf(`function ${name}(`);assert.notEqual(start,-1,`falta ${name}`);
  const brace=source.indexOf("{",start);let depth=0,quote="",escaped=false;
  for(let index=brace;index<source.length;index++){
    const char=source[index];
    if(quote){if(escaped)escaped=false;else if(char==="\\")escaped=true;else if(char===quote)quote="";continue;}
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}
    if(char==="{")depth++;else if(char==="}"&&--depth===0)return source.slice(start,index+1);
  }
  throw new Error(`función ${name} incompleta`);
}

test("captura de regresión: cabezal Admira.tv no deja pasar una lista mixta",()=>{
  const fn=new Function(`${functionSource(frame,"projectScopeMatch")};return projectScopeMatch;`)();
  const mixed=[
    {id:"FLT-A",project:"admira-tv",project_name:"Admira.tv"},
    {id:"FLT-X",project:"xpaceos",project_name:"Admira.tv"}
  ];
  assert.deepEqual(mixed.filter(row=>fn(row,"admira-tv")).map(row=>row.id),["FLT-A"]);
  assert.equal(fn(mixed[1],"admira-tv"),false,"el nombre visible no suplanta al project_id");
  assert.deepEqual(mixed.filter(row=>fn(row,null)).map(row=>row.id),["FLT-A","FLT-X"]);
});

test("las superficies sin política conservan Todos y sólo admiten ids activos del censo",()=>{
  assert.match(frame,/var PROJECT_SCOPE_KEY = "yokup\.project\.scope\.v1"/);
  assert.match(frame,/var PROJECT_SCOPE = projectSurfacePolicy\(\)\.defaultId \|\| null, PROJECT_CATALOG = \[\]/);
  assert.match(frame,/ykFetch\("\/projects", \{cache:"no-store"\}\)/);
  assert.match(frame,/String\(p\.status \|\| "activo"\)\.toLowerCase\(\) !== "archivado"/);
  assert.match(frame,/if \(!rules\.defaultId\) return resolveProjectScope\(queryId, storedId, catalog\)/);
  assert.match(frame,/return resolveProjectSurfaceScope\(query, stored, PROJECT_CATALOG, projectSurfacePolicy\(\)\)/);
  assert.match(frame,/\[\{id:null,name:"Todos",web:"Todos los proyectos"\}\]\.concat\(selectableProjects\)/);
  assert.match(frame,/selectableProjects = globalProjectScopeSurface\(location\.pathname\) \? \[\] : PROJECT_CATALOG/);
  assert.doesNotMatch(frame,/activeProjectKey|PROJECT_ORDER|pathname[^\n]+admira-live/);
});

test("selección válida persiste por query/storage y stale o archivada vuelve a Todos",()=>{
  const resolve=new Function(`${functionSource(frame,"resolveProjectScope")};return resolveProjectScope;`)();
  const catalog=[{id:"admira-tv",status:"activo"},{id:"xpaceos",status:"activo"},{id:"old",status:"archivado"}];
  assert.equal(resolve("xpaceos","admira-tv",catalog),"xpaceos","query válida gana");
  assert.equal(resolve("corrupto","admira-tv",catalog),"admira-tv","storage válido rescata query inválida");
  assert.equal(resolve("","stale",catalog),null);
  assert.equal(resolve("old","",catalog),null,"archivado equivale a ausente");
  assert.equal(resolve("","",catalog),null,"reload limpio nace en Todos");
  assert.match(frame,/localStorage\.getItem\(PROJECT_SCOPE_KEY\)/);
  assert.match(frame,/localStorage\.setItem\(PROJECT_SCOPE_KEY, projectId\)/);
  assert.match(frame,/localStorage\.removeItem\(PROJECT_SCOPE_KEY\)/);
  assert.match(frame,/url\.searchParams\.set\("project_id", projectId\)/);
  assert.match(frame,/url\.searchParams\.delete\("project_id"\)/);
  assert.match(frame,/PROJECT_SCOPE = requestedProjectId\(\);[\s\S]*rememberProject\(PROJECT_SCOPE\)/);
  assert.match(frame,/event\.key !== PROJECT_SCOPE_KEY[\s\S]*publishProject\(validProjectId\(event\.newValue\), true\)/);
});

test("Supervisor fija admira-tv para usuario normal y sólo el superusuario puede sustituirlo",()=>{
  const resolveSurface=new Function(
    `${functionSource(frame,"resolveProjectScope")};${functionSource(frame,"resolveProjectSurfaceScope")};return resolveProjectSurfaceScope;`
  )();
  const catalog=[
    {id:"admira-tv",name:"Admira TV",status:"activo"},
    {id:"xpaceos",name:"XpaceOS",status:"activo"},
    {id:"old",name:"Archivado",status:"archivado"}
  ];
  const normal={defaultId:"admira-tv",required:true,canChange:false};
  const superuser={defaultId:"admira-tv",required:true,canChange:true};

  assert.equal(resolveSurface("xpaceos","xpaceos",catalog,normal),"admira-tv",
    "query y storage no pueden sacar al usuario normal de su proyecto fijo");
  assert.equal(resolveSurface("xpaceos","",catalog,superuser),"xpaceos",
    "un superusuario sí puede elegir otro proyecto activo");
  assert.equal(resolveSurface("","xpaceos",catalog,superuser),"xpaceos",
    "el último proyecto válido se restaura sólo cuando hay permiso de cambio");
  assert.equal(resolveSurface("","",catalog,superuser),"admira-tv",
    "Supervisor sigue siendo operativo con el default si el superusuario no eligió otro");
  assert.equal(resolveSurface("xpaceos","",catalog,{defaultId:"missing",required:true,canChange:false}),null,
    "un default ausente del censo falla cerrado");
  assert.equal(resolveSurface("xpaceos","",catalog,{defaultId:"old",required:true,canChange:false}),null,
    "un default archivado tampoco puede utilizarse");

  assert.match(frame,/data-yk-project-default/);
  assert.match(frame,/access\.capabilities\.supervisor_project_switch === true/);
  assert.match(frame,/wrap\.classList\.toggle\("locked",policy\.required&&!policy\.canChange\)/);
  assert.match(frame,/btn\.disabled=policy\.required&&!policy\.canChange/);
  assert.match(frame,/if\(policy\.required&&!policy\.canChange\)options=\[\]/,
    "el usuario normal no recibe opciones focusables de cambio");
  assert.match(frame,/if \(projectSurfacePolicy\(\)\.required && !projectSurfacePolicy\(\)\.canChange\) return/,
    "el botón bloqueado tampoco abre el menú por código");
  assert.match(frame,/if \(!globalOnly && \(!policy\.required \|\| policy\.canChange\)\)/,
    "el scope fijo no pisa la preferencia global guardada");
  assert.match(frame,/can_change_project:policy\.canChange/);
  assert.match(frame,/canChange: function \(\) \{ return projectSurfacePolicy\(\)\.canChange; \}/);
});

test("misiones y tareas filtran por id exacto antes de agrupar y contar",()=>{
  const missionFilter=missions.indexOf('rawTickets=rawTickets.filter(t=>String(t.project_id||t.project||"")===PROJECT_SCOPE)');
  const missionGroup=missions.indexOf('agrupaFlota(rawTickets)');
  assert.ok(missionFilter>0&&missionFilter<missionGroup);
  assert.match(missions,/if\(projectId\)path\+="&project_id="\+encodeURIComponent\(projectId\)/,
    "el scope exacto viaja al servidor; el filtro cliente queda como fallback legacy");
  const taskFilter=tasks.indexOf('rows.filter(row=>String(row.project||"")===PROJECT_SCOPE)');
  const taskGroup=tasks.indexOf('YkMisiones.groupByMission(scopedRows)');
  assert.ok(taskFilter>0&&taskFilter<taskGroup);
  assert.match(missions,/window\.addEventListener\("yk:project-change"[\s\S]*load\(\)/);
  assert.match(tasks,/window\.addEventListener\("yk:project-change"[\s\S]*load\(\)/);
});

test("cambiar proyecto es atómico aunque el fetch de refresco siga pendiente",()=>{
  const publish=functionSource(frame,"publishProject");
  assert.ok(publish.indexOf('dispatchEvent(new CustomEvent("yk:project-change"')<publish.indexOf("paintProject();"),
    "el contenido recibe el scope antes de que cambie el label");
  const missionListener=missions.slice(missions.indexOf('window.addEventListener("yk:project-change"'),missions.indexOf("// (día del tablero"));
  assert.ok(missionListener.indexOf("board.innerHTML")<missionListener.indexOf("load();"),
    "Misiones retira las filas viejas antes de iniciar el fetch");
  const taskListener=tasks.slice(tasks.indexOf('window.addEventListener("yk:project-change"'),tasks.indexOf("// Estado canónico"));
  assert.ok(taskListener.indexOf("board.innerHTML")<taskListener.indexOf("load();"),
    "Tareas retira las filas viejas antes de iniciar el fetch");
  assert.match(frame,/esc\(p\.id \? \(projectHost\(p\) \|\| p\.id\) : "Todos los proyectos"\)/,
    "las opciones normalizan el host igual que el label");
});

test("las superficies con project_id fiable aplican el mismo scope exacto",()=>{
  assert.match(objectives,/IDEAS\.filter\(i=>!PROJECT_SCOPE\|\|String\(i\.project\|\|""\)===PROJECT_SCOPE\)/);
  assert.match(decisions,/String\(d\.project_id \|\| ""\) === projectScope/);
  assert.match(reports,/ALL\.filter\(t=>!PROJECT_SCOPE\|\|String\(t\.project\|\|""\)===PROJECT_SCOPE\)/);
  for(const source of [objectives,decisions,reports]){
    assert.match(source,/yk:project-change/);
    assert.doesNotMatch(source,/project_name[^\n]*(includes|indexOf)|hostname[^\n]*(includes|indexOf)/i);
  }
});

test("el formulario de asignación de objetivo sigue separado del filtro global",()=>{
  assert.match(objectives,/id="fProject"/);
  assert.match(objectives,/const sel=\$\("#fProject"\)/);
  assert.doesNotMatch(objectives,/PROJECT_SCOPE\s*=\s*\$\("#fProject"\)/);
});
