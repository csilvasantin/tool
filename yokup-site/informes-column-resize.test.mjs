import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("./informes.html",import.meta.url),"utf8");
const source=await readFile(new URL("./yk-informes-columns.js",import.meta.url),"utf8");
const FULL_SPECS={
  agente:{label:"Agente",default:138,min:100,max:260},mision:{label:"Misión",default:170,min:130,max:360},
  proceso:{label:"Proceso",default:132,min:96,max:260},captura:{label:"Resultado",default:132,min:96,max:260},
  informe:{label:"Informe",default:280,min:180,max:520},estado:{label:"Estado",default:116,min:96,max:220},
  tiempo:{label:"Tiempo",default:150,min:120,max:280}
};

function harness(saved={},clientWidth=0,customSpecs){
  const rootListeners={},containerListeners={},values=new Map(Object.entries(saved));
  const styleValues={},handles=[];
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  const container={
    clientWidth,
    style:{setProperty:(key,value)=>{styleValues[key]=value;}},
    querySelectorAll:()=>handles,
    addEventListener:(type,handler)=>{containerListeners[type]=handler;}
  };
  const context=vm.createContext({
    addEventListener:(type,handler)=>{rootListeners[type]=handler;},
    globalThis:null
  });
  context.globalThis=context;
  vm.runInContext(source,context);
  const specs=customSpecs||{agente:{label:"Agente",default:138,min:100,max:260}};
  const api=context.YkInformesColumns.mount(container,specs,{storage,storageKey:"widths"});
  const classes=new Set();
  const handle={dataset:{resize:"agente"},attrs:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},
    closest:()=>handle,setAttribute:(key,value)=>{handle.attrs[key]=value;},setPointerCapture:()=>{}};
  handles.push(handle);api.apply();
  const event=(extra={})=>({target:handle,preventDefault(){},stopPropagation(){},...extra});
  return {api,storage,values,styleValues,handle,classes,containerListeners,rootListeners,event};
}

test("Agente encabeza tanto cabeceras como celdas y la ordenación sigue intacta",()=>{
  assert.match(html,/const SORT_COLUMNS=\[\s*\["agente","Agente"\],\["mision","Misión"\]/);
  const row=html.slice(html.indexOf('return `<div class="grow item"'),html.indexOf('}).join("");',html.indexOf('return `<div class="grow item"')));
  assert.ok(row.indexOf("ykAvatar.html(agent)")<row.indexOf('class="gc mis"'));
  assert.match(html,/role="columnheader" aria-sort=/);
  assert.match(html,/class="sort-head" type="button" data-sort=/);
});

test("anchos restaurados se validan, aplican y persisten por columna",()=>{
  const h=harness({widths:JSON.stringify({agente:999})});
  assert.equal(h.api.widths.agente,260,"un valor persistido nunca supera el máximo");
  assert.equal(h.styleValues["--col-agente"],"260px");
  assert.equal(h.handle.attrs["aria-valuenow"],"260");
  h.api.set("agente",172);
  assert.equal(JSON.parse(h.values.get("widths")).agente,172);
});

test("flechas redimensionan y teclado accesible restaura el ancho por defecto",()=>{
  const h=harness();
  h.containerListeners.keydown(h.event({key:"ArrowRight",shiftKey:false}));
  assert.equal(h.api.widths.agente,146);
  assert.equal(h.handle.attrs["aria-valuetext"],"146 píxeles");
  assert.match(h.handle.attrs["aria-label"],/Flechas cambian el ancho/);
  h.containerListeners.keydown(h.event({key:"Enter",shiftKey:false}));
  assert.equal(h.api.widths.agente,138);
});

test("pointer unifica ratón y touch, persiste al soltar y doble clic restaura",()=>{
  const h=harness();
  h.containerListeners.pointerdown(h.event({clientX:100,pointerId:4}));
  assert.ok(h.classes.has("dragging"));
  h.rootListeners.pointermove(h.event({clientX:150}));
  assert.equal(h.api.widths.agente,188);
  h.rootListeners.pointerup(h.event());
  assert.equal(JSON.parse(h.values.get("widths")).agente,188);
  assert.ok(!h.classes.has("dragging"));
  h.containerListeners.dblclick(h.event());
  assert.equal(h.api.widths.agente,138);
});

test("la hoja elimina overflow desktop y cambia a tarjetas sin barra móvil",()=>{
  assert.match(html,/\.sheet-wrap\{width:100%;min-width:0;overflow-x:hidden/);
  assert.match(html,/\.sheet\{width:100%;min-width:0\}/);
  assert.match(html,/\.grow\{width:100%;min-width:0;display:grid;grid-template-columns:minmax\(0,var\(--col-agente/);
  assert.match(html,/@media\(max-width:900px\)[\s\S]*?\.ghead\{position:absolute!important;width:1px;height:1px[\s\S]*?clip:rect\(0,0,0,0\)[\s\S]*?\.grow\.item\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(html,/@media\(max-width:520px\)[\s\S]*?\.grow\.item\{grid-template-columns:minmax\(0,1fr\)/);
  assert.doesNotMatch(html,/width:max-content|overflow-x:auto/);
  assert.deepEqual(Array.from(html.matchAll(/role="cell" data-label="([^"]+)"/g),m=>m[1]),
    ["Agente","Misión","Proceso","Resultado","Informe","Estado","Tiempo"]);
  assert.match(html,/\.col-resize\{[^}]*touch-action:none/);
  assert.match(html,/@media\(max-width:900px\)[\s\S]*?\.col-resize\{display:none/);
  assert.match(html,/role="separator" aria-orientation="vertical" tabindex="0"/);
});

test("redistribuye al 100% y respeta límites al redimensionar en desktop",()=>{
  const specs={
    agente:{label:"Agente",default:138,min:100,max:260},
    mision:{label:"Misión",default:170,min:130,max:360},
    informe:{label:"Informe",default:280,min:180,max:520}
  };
  const h=harness({},600,specs);
  assert.equal(Object.values(h.api.widths).reduce((a,b)=>a+b,0),600);
  const before=h.api.widths.mision+h.api.widths.informe,old=h.api.widths.agente;
  h.api.set("agente",220);
  assert.equal(h.api.widths.agente,220);
  assert.equal(h.api.widths.mision+h.api.widths.informe,before-(220-old));
  assert.equal(Object.values(h.api.widths).reduce((a,b)=>a+b,0),600,"la suma nunca desborda la caja");
  Object.entries(h.api.widths).forEach(([key,value])=>{
    assert.ok(value>=specs[key].min&&value<=specs[key].max,key+" conserva límites");
  });
  h.api.apply();
  assert.equal(h.api.widths.agente,220,"apply()->fit() no deshace la columna locked");
});

test("el teclado conserva suma, límites y ARIA en una caja medida",()=>{
  const specs={agente:{label:"Agente",default:138,min:100,max:260},informe:{label:"Informe",default:280,min:180,max:520}};
  const h=harness({},500,specs);
  assert.equal(Object.values(h.api.widths).reduce((a,b)=>a+b,0),500);
  h.containerListeners.keydown(h.event({key:"ArrowRight",shiftKey:false}));
  assert.equal(Object.values(h.api.widths).reduce((a,b)=>a+b,0),500);
  assert.match(h.handle.attrs["aria-label"],/Flechas cambian el ancho/);
  h.containerListeners.keydown(h.event({key:"Home",shiftKey:false}));
  assert.equal(Object.values(h.api.widths).reduce((a,b)=>a+b,0),500);
});

test("1280, 1440, 1500 y 1920 encajan exactamente en el wrapper desktop",()=>{
  for(const viewport of [1280,1440,1500,1920]){
    const content=Math.min(1180,viewport)-48;
    const h=harness({},content,FULL_SPECS);
    assert.equal(Object.values(h.api.widths).reduce((a,b)=>a+b,0),content,viewport+"px: suma exacta");
    Object.entries(h.api.widths).forEach(([key,value])=>{
      assert.ok(value>=FULL_SPECS[key].min&&value<=FULL_SPECS[key].max,viewport+"px: "+key+" dentro de límites");
    });
  }
});

test("anchos persistidos extremos se normalizan sin overflow",()=>{
  const saved={};Object.keys(FULL_SPECS).forEach(key=>{saved[key]=key==="informe"?9999:-9999;});
  const h=harness({widths:JSON.stringify(saved)},1132,FULL_SPECS);
  assert.equal(Object.values(h.api.widths).reduce((a,b)=>a+b,0),1132);
  Object.entries(h.api.widths).forEach(([key,value])=>{
    assert.ok(value>=FULL_SPECS[key].min&&value<=FULL_SPECS[key].max,key+" saneado");
  });
});
