// DCL-f6b866caf42f78fbb696c867 · nexos Carbono y persistencia de Silicio.
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

const carbon=new Function(`${functionSource("paCarbonResponsible")}
${functionSource("paCarbonKey")}
${functionSource("paCarbonConnections")}
${functionSource("paCarbonLinkColor")}
return {paCarbonKey,paCarbonConnections,paCarbonLinkColor};`)();

test("Carbono crea un nexo estable por pareja responsable-proyecto visible",()=>{
  const rows=[
    {id:"xpaceos",carbon_responsible:" Carlos3.0 ",status:"activo"},
    {id:"playertaza",carbon_responsible:"CARLOS3.0",status:"activo"},
    {id:"xpaceos",carbon_responsible:"Cárlos3.0",status:"activo"},
    {id:"archivado",carbon_responsible:"Carlos3.0",status:"archivado"},
    {id:"vacio",carbon_responsible:"",status:"activo"},
    {id:"",carbon_responsible:"Carlos3.0",status:"activo"}
  ];
  assert.deepEqual(carbon.paCarbonConnections(rows).map(row=>row.key),[
    "carbon|carlos3.0|playertaza",
    "carbon|carlos3.0|xpaceos"
  ]);
});

test("el color del responsable es determinista y no depende del orden",()=>{
  assert.equal(carbon.paCarbonLinkColor(" Carlos3.0 "),carbon.paCarbonLinkColor("Cárlos3.0"));
  assert.match(carbon.paCarbonLinkColor("Carlos3.0"),/^hsl\(\d+ 84% 68%\)$/);
  const before=carbon.paCarbonLinkColor("Carlos3.0");carbon.paCarbonLinkColor("Mateo3.0");
  assert.equal(carbon.paCarbonLinkColor("Carlos3.0"),before);
});

test("el DOM ofrece anclas Carbono propias y conserva la relación textual",()=>{
  const agents=functionSource("paCarbonAgentsMarkup"),render=functionSource("paRender");
  assert.match(agents,/data-carbon-agent-port=/);
  assert.match(agents,/aria-hidden="true"/);
  assert.match(agents,/data-carbon-project=/);
  assert.match(render,/data-carbon-project-port=/);
  assert.match(render,/Proyecto asociado a/);
  assert.doesNotMatch(agents,/data-link-agent|paStartDrag/);
});

test("cada topología se reconcilia en su namespace sin borrar la otra",()=>{
  const silicon=functionSource("paSyncLink"),carbonSync=functionSource("paSyncCarbonLink"),draw=functionSource("paDrawLinks");
  assert.match(silicon,/data-link-kind="silicon"/);
  assert.match(silicon,/node\.dataset\.linkKind="silicon"/);
  assert.match(carbonSync,/data-link-kind="carbon"/);
  assert.match(carbonSync,/node\.dataset\.linkKind="carbon"/);
  assert.match(draw,/PA_ROSTER_VIEW==="silicon"\)paDrawSiliconLinks/);
  assert.match(draw,/PA_ROSTER_VIEW==="carbon"\)paDrawCarbonLinks/);
  assert.doesNotMatch(draw,/PA_ROSTER_VIEW!=="silicon"[\s\S]*group\.innerHTML/);
});

test("los nexos Carbono son informativos, estáticos y sin flecha de actividad",()=>{
  const sync=functionSource("paSyncCarbonLink");
  assert.match(sync,/pa-link pa-link-carbon/);
  assert.doesNotMatch(sync,/marker-end|pa-link-flow|pa-link-active|pa-link-assigned|animation/);
  assert.match(source,/\.pa-link-carbon\{[^}]*stroke-dasharray:7 5[^}]*opacity:\.72/);
});

test("Silicio conserva nodos y fase al alternar subgrupos",()=>{
  const setter=functionSource("paSetRosterView"),draw=functionSource("paDrawLinks"),sync=functionSource("paSyncLink");
  assert.doesNotMatch(setter,/group\.innerHTML|projectAgentLinks/);
  assert.match(sync,/node&&node\.dataset\.linkState!==state/);
  assert.match(sync,/for\(const path of node\.children\)/);
  assert.match(source,/const FLOW_T0=Date\.now\(\)/);
  assert.match(source,/animation-delay:[^;]*FLOW_T0/);
  assert.match(draw,/PA_ROSTER_VIEW==="teams"[\s\S]*return/);
});

test("móvil limpia el SVG oculto y escritorio lo redibuja al cambiar tamaño",()=>{
  const draw=functionSource("paDrawLinks");
  assert.match(draw,/matchMedia\("\(max-width:900px\)"\)\.matches[\s\S]*group\.innerHTML=""/);
  assert.match(source,/@media\(max-width:900px\)\{[\s\S]{0,800}\.pa-links\{display:none\}/);
  assert.match(source,/window\.addEventListener\("resize",\(\)=>requestAnimationFrame\(paDrawLinks\)\)/);
});
