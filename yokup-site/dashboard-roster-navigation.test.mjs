// FLT-1521 · navegación exclusiva entre Equipos, Silicio y Carbono.
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");

function functionSource(name){
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

const navigation=new Function(`const PA_ROSTER_VIEWS=["teams","silicon","carbon"];
${functionSource("paNormalizeRosterView")}
${functionSource("paNextRosterView")}
return {paNormalizeRosterView,paNextRosterView};`)();

test("hay tres tabs accesibles y exactamente uno nace seleccionado",()=>{
  const start=source.indexOf('id="projectAgentRosterTabs"'),end=source.indexOf('</div>',start),tabs=source.slice(start,end);
  assert.match(tabs,/role="tablist"/);
  assert.equal((tabs.match(/role="tab"/g)||[]).length,3);
  assert.equal((tabs.match(/aria-selected="true"/g)||[]).length,1);
  assert.equal((tabs.match(/tabindex="0"/g)||[]).length,1);
  assert.equal((tabs.match(/tabindex="-1"/g)||[]).length,2);
  for(const view of ["teams","silicon","carbon"]){
    assert.match(tabs,new RegExp(`data-pa-roster-tab="${view}"[^>]*aria-controls="projectAgent${view[0].toUpperCase()+view.slice(1)}"`));
  }
  assert.match(tabs,/data-pa-roster-tab="carbon"[^>]*aria-selected="true"[^>]*tabindex="0"/);
  assert.match(source,/id="projectAgentShell" data-pa-roster-view="carbon"/);
  assert.match(source,/let PA_ROSTER_VIEW="carbon"/);
  assert.equal(navigation.paNormalizeRosterView("desconocido"),"carbon");
});

test("Carbono nace visible y los otros paneles nacen ocultos y vacíos",()=>{
  assert.match(source,/id="projectAgentTeams" role="tabpanel" aria-labelledby="projectAgentTeamsTab" hidden><\/div>/);
  assert.match(source,/id="projectAgentSilicon" role="tabpanel" aria-labelledby="projectAgentSiliconTab" hidden><\/div>/);
  assert.match(source,/id="projectAgentCarbon" role="tabpanel" aria-labelledby="projectAgentCarbonTab"><div class="pa-loading">Cargando responsables…<\/div><\/div>/);
  assert.match(source,/id="projectAgentTeamControls" hidden/);
  assert.match(source,/id="projectAgentProjectsAll"[^>]* hidden/);
  assert.match(source,/id="projectAgentProjectsUnassigned"[^>]* hidden/);
  assert.match(functionSource("paSyncRosterTabs"),/panel\.hidden=view!==PA_ROSTER_VIEW/);
  assert.match(functionSource("paRender"),/paPaint\(teamBox,PA_ROSTER_VIEW==="teams"[\s\S]*paPaint\(siliconBox,PA_ROSTER_VIEW==="silicon"[\s\S]*paPaint\(carbonBox,PA_ROSTER_VIEW==="carbon"/);
});

test("la elección posterior depende sólo del tab pulsado y no vuelve al valor inicial",()=>{
  const setter=functionSource("paSetRosterView"),render=functionSource("paRender");
  assert.match(setter,/PA_ROSTER_VIEW=next/);
  assert.doesNotMatch(setter,/PA_ROSTER_VIEW="carbon"/);
  assert.doesNotMatch(render,/PA_ROSTER_VIEW\s*=(?!=)/);
  assert.match(source,/tab\.onclick=\(\)=>paSetRosterView\(tab\.dataset\.paRosterTab,true\)/);
});

test("flechas, Inicio y Fin recorren el selector con retorno circular",()=>{
  const {paNextRosterView}=navigation;
  assert.equal(paNextRosterView("teams","ArrowRight"),"silicon");
  assert.equal(paNextRosterView("silicon","ArrowDown"),"carbon");
  assert.equal(paNextRosterView("carbon","ArrowRight"),"teams");
  assert.equal(paNextRosterView("teams","ArrowLeft"),"carbon");
  assert.equal(paNextRosterView("carbon","Home"),"teams");
  assert.equal(paNextRosterView("teams","End"),"carbon");
  assert.equal(paNextRosterView("teams","Enter"),"");
});

test("Carbono se deriva de proyectos visibles con responsable y no del filtro de equipos",()=>{
  const render=functionSource("paRender");
  assert.match(render,/scopedProjects=paSortProjectsByVersion/);
  assert.match(render,/carbonProjects=scopedProjects\.filter\(project=>project\.status!=="archivado"&&paCarbonResponsible\(project\)\)/);
  assert.match(render,/visibleProjects=PA_ROSTER_VIEW==="carbon"\?carbonProjects:regularProjects/);
  assert.doesNotMatch(render,/carbonProjects=.*visibleTeams/);
});

test("Carbono pinta sólo responsables y chips de sus proyectos asociados",()=>{
  const render=functionSource("paRender"),markup=functionSource("paCarbonAgentsMarkup")+functionSource("paCarbonProjectMarkup");
  assert.match(render,/paPaint\(carbonBox,PA_ROSTER_VIEW==="carbon"[\s\S]*paCarbonAgentsMarkup\(carbonAgents\)/);
  assert.match(markup,/data-carbon-agent=/);
  assert.match(markup,/data-carbon-project=/);
  assert.match(render,/responsables · '\+carbonProjects\.length\+' proyectos asociados/);
});

test("la ficha de proyecto Carbono no incorpora Silicio ni puertos interactivos, pero sí un ancla de nexo",()=>{
  const render=functionSource("paRender");
  assert.match(render,/const projectPort=carbonMode\?'<span class="pa-carbon-anchor pa-carbon-anchor-project" data-carbon-project-port=/);
  assert.match(render,/const projectDetail=carbonMode[\s\S]*paCarbonResponsibleMarkup\(project\)[\s\S]*: '<div class="pa-project-detail">/);
  assert.match(render,/const target=!carbonMode&&LINK_CLICK_AGENT/);
  assert.match(functionSource("paCarbonAgentsMarkup"),/data-carbon-agent-port=/);
  assert.doesNotMatch(functionSource("paCarbonAgentsMarkup"),/data-link-agent=/);
  assert.match(source,/No hay proyectos con Responsable Carbono asignado/);
});

test("cambiar de subgrupo limpia selección y arrastre sin destruir las animaciones de Silicio",()=>{
  const setter=functionSource("paSetRosterView"),draw=functionSource("paDrawLinks");
  assert.match(setter,/LINK_DRAG=null;LINK_CLICK_AGENT=""/);
  assert.doesNotMatch(setter,/projectAgentLinks|group\.innerHTML/);
  assert.match(setter,/temp\.setAttribute\("d",""\)/);
  assert.match(draw,/if\(PA_ROSTER_VIEW==="teams"\)\{temp\.setAttribute\("d",""\);return;\}/);
  assert.match(draw,/PA_ROSTER_VIEW==="silicon"\)paDrawSiliconLinks[\s\S]*PA_ROSTER_VIEW==="carbon"\)paDrawCarbonLinks/);
  assert.match(source,/data-link-kind="carbon"\][^}]*visibility:hidden/);
});

test("los controles de equipos y proyectos sin equipo desaparecen en Carbono",()=>{
  const sync=functionSource("paSyncRosterTabs"),render=functionSource("paRender");
  assert.match(sync,/controls\.hidden=PA_ROSTER_VIEW==="carbon"/);
  assert.match(render,/projectAgentProjectsAll"\)\.hidden=PA_ROSTER_VIEW==="carbon"/);
  assert.match(render,/projectAgentProjectsUnassigned"\)\.hidden=PA_ROSTER_VIEW==="carbon"/);
});

test("el subgrupo activo no depende sólo del color",()=>{
  assert.match(source,/\.pa-roster-tab\[aria-selected="true"\][^{]*\{[^}]*border-color:var\(--accent\)[^}]*box-shadow:/);
  assert.match(source,/\.pa-roster-tab\[aria-selected="true"\]::before\{content:"●"/);
  assert.match(source,/\.pa-roster-tab:focus-visible\{outline:2px solid var\(--brand\)/);
  assert.match(functionSource("paSyncRosterTabs"),/aria-selected/);
});

test("en móvil los tres subgrupos se apilan y conservan targets táctiles",()=>{
  assert.match(source,/@media\(max-width:620px\)\{\.pa-roster-tabs\{grid-template-columns:1fr\}/);
  assert.match(source,/\.pa-roster-tab\{min-height:44px/);
  assert.match(source,/\.pa-roster-panel\[hidden\]\{display:none!important\}/);
});
