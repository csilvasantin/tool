import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("./highscore.html",import.meta.url),"utf8");

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`falta ${name}`);
  const brace=source.indexOf("{",start);
  let depth=0,quote="",escaped=false;
  for(let index=brace;index<source.length;index++){
    const char=source[index];
    if(quote){
      if(escaped)escaped=false;
      else if(char==="\\")escaped=true;
      else if(char===quote)quote="";
      continue;
    }
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}
    if(char==="{")depth++;
    else if(char==="}"&&--depth===0)return source.slice(start,index+1);
  }
  throw new Error(`funcion ${name} incompleta`);
}

function trendApi(hourly){
  const datos={actividadMeta:{hourly}};
  return new Function("datos",[
    functionSource("normaliza"),functionSource("claveHoraria"),functionSource("identidadFamiliaHoraria"),
    functionSource("filasFamiliaHoraria"),functionSource("tendenciaHoraria"),"return tendenciaHoraria;"
  ].join("\n"))(datos);
}

test("la cifra horaria procede del payload factual y el fallback es conservador",()=>{
  const tendencia=trendApi({window_ms:3600000,scores:[
    {agent:"OraculoMacMini",current:75,reference:55,reference_at:1000,trend:"up",reliable:true},
    {agent:"NeoMacMini",current:20,reference:20,reference_at:1000,trend:"same",reliable:true},
  ]});
  assert.deepEqual(tendencia({agente:"OraculoMacMini",total:75}),{
    state:"up",current:75,reference:55,points:20,referenceAt:1000,reliable:true,
  });
  assert.deepEqual(tendencia({agente:"NeoMacMini",total:20}),{
    state:"same",current:20,reference:20,points:0,referenceAt:1000,reliable:true,
  });
  assert.deepEqual(tendencia({agente:"AgenteNuevoMacMini",total:12}),{
    state:"same",current:12,reference:12,points:0,referenceAt:0,reliable:false,
  });
  assert.match(source,/class="score-number score-hour '\+hourClass/);
  assert.match(source,/class="score-number score-day daily-'\+esc\(state\)/);
  assert.doesNotMatch(source,/\(up \? "↑" : "="\)/);
});

test("todas las evoluciones nacen contraidas y Puntos es el unico control",()=>{
  assert.match(source,/var alterna = i % 2 \? " alt" : "", progressId = "score-progress-" \+ hsAgentKey\(a\.agente\)/);
  assert.match(source,/<td class="tot">' \+ puntosHtml\(a, progressId\) \+ '<\/td><\/tr>'/);
  assert.match(source,/<button class="score-toggle" type="button" aria-expanded="false" aria-controls="' \+ esc\(progressId\)/);
  assert.match(source,/<tr class="score-progress' \+ alterna \+ '" id="' \+ esc\(progressId\) \+ '" hidden>/);
  assert.match(source,/\.score-progress\[hidden\]\{display:none\}/);
});

test("clic o teclado nativo en Puntos alterna solo su detalle y el segundo gesto lo cierra",()=>{
  let clickHandler=null;
  const attrs=new Map([
    ["aria-controls","score-progress-oraculomacmini"],
    ["aria-expanded","false"],
    ["aria-label","75 puntos. Ha aumentado. Mostrar evolución"],
  ]);
  const button={
    getAttribute:key=>attrs.get(key),
    setAttribute:(key,value)=>attrs.set(key,String(value)),
  };
  const detail={hidden:true};
  const filas={
    dataset:{},contains:node=>node===button,
    addEventListener(type,handler){if(type==="click")clickHandler=handler;},
  };
  const document={getElementById:id=>id==="filas"?filas:(id==="score-progress-oraculomacmini"?detail:null)};
  new Function("document",`${functionSource("iniciaProgresionToggle")}\niniciaProgresionToggle();`)(document);
  assert.equal(typeof clickHandler,"function");

  clickHandler({target:{closest:()=>null}});
  assert.equal(detail.hidden,true,"otra celda no abre la evolución");
  assert.equal(attrs.get("aria-expanded"),"false");

  const target={closest:selector=>selector===".score-toggle"?button:null};
  clickHandler({target});
  assert.equal(detail.hidden,false);
  assert.equal(attrs.get("aria-expanded"),"true");
  assert.match(attrs.get("aria-label"),/Ocultar evolución$/);

  clickHandler({target});
  assert.equal(detail.hidden,true);
  assert.equal(attrs.get("aria-expanded"),"false");
  assert.match(attrs.get("aria-label"),/Mostrar evolución$/);
  assert.doesNotMatch(functionSource("iniciaProgresionToggle"),/keydown|keypress|keyup/,
    "Enter y Espacio deben conservar la activación nativa del button");
});

test("filtrar agentes renumera y el repintado vuelve a contraer sus detalles",()=>{
  const functions=["normaliza","hsAgentKey","hsAgentScopeAllows","aplicaAgentScope"].map(functionSource).join("\n");
  const apply=new Function(`${functions}\nvar AGENT_SCOPE=new Set(["neomacmini"]);return aplicaAgentScope;`)();
  const filtered=apply([
    {agente:"OraculoMacMini",posicion:1,total:75},
    {agente:"NeoMacMini",posicion:2,total:20},
  ]);
  assert.deepEqual(filtered.map(row=>[row.agente,row.posicion]),[["NeoMacMini",1]]);
  assert.match(source,/function pintaVistaFiltrada\(\)[\s\S]*pintaTabla\(listaVisible\(listaCache\)\)/);
  assert.match(source,/function pintaTabla\(lista\)[\s\S]*progressId = "score-progress-" \+ hsAgentKey\(a\.agente\)[\s\S]*id="' \+ esc\(progressId\) \+ '" hidden>/);
});
