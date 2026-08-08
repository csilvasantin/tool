import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const frame=await readFile(new URL("./yk-frame.js",import.meta.url),"utf8");
const highscore=await readFile(new URL("./highscore.html",import.meta.url),"utf8");

function functionSource(source,name){
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

function advancedNav(pathname){
  function el(tag,className,innerHTML){
    return {
      tag,className:className||"",innerHTML:innerHTML||"",children:[],attributes:{},href:"",
      appendChild(child){this.children.push(child);return child;},
      setAttribute(key,value){this.attributes[key]=String(value);},
    };
  }
  return new Function("el","location",`${functionSource(frame,"buildAdvancedNav")}\nreturn buildAdvancedNav();`)(el,{pathname});
}

test("/highscore no repite HIGHSCORE en Avanzado y conserva Normativa",()=>{
  for(const path of ["/highscore","/highscore/","/highscore.html"]){
    const nav=advancedNav(path);
    assert.deepEqual(nav.children.map(node=>[node.href,node.innerHTML]),[
      ["/normativa",'<span aria-hidden="true">§</span> NORMATIVA'],
    ]);
  }
});

test("las demás rutas conservan HIGHSCORE antes de NORMATIVA y sus opciones superiores",()=>{
  const nav=advancedNav("/dashboard");
  assert.deepEqual(nav.children.map(node=>node.href),["/highscore","/normativa"]);
  assert.match(nav.children[0].innerHTML,/HIGHSCORE/);
  assert.match(nav.children[1].innerHTML,/NORMATIVA/);

  // HIGHSCORE cierra la barra, justo a la derecha de NOTIFICACIONES (Carlos, 2026-08-08).
  const expected=["DASHBOARD","OBJETIVOS","DECISIONES","MISIONES","TAREAS","INCIDENCIAS","INFORMES","NOTIFICACIONES","HIGHSCORE"];
  const block=frame.slice(frame.indexOf("var APP_NAV = ["),frame.indexOf("var COUNTER_KEY"));
  const actual=[...block.matchAll(/\["([A-ZÁÉÍÓÚ]+)",\s+"\/[^"]+"\]/g)].map(match=>match[1]);
  assert.deepEqual(actual,expected);
});

test("la columna conserva un solo th y muestra exactamente VENTANA sobre DECISIÓN",()=>{
  const headers=[...highscore.matchAll(/data-sort-col="ventanas"/g)];
  assert.equal(headers.length,1,"no se crea otra columna para la segunda línea");
  const th=highscore.match(/<th class="num" data-sort-col="ventanas"[\s\S]*?<\/th>/)?.[0]||"";
  assert.match(th,/<span class="sort-label-stack"><span>Ventana<\/span><span>Decisión<\/span><\/span>/);
  assert.doesNotMatch(th,/Ventanas hoy/i);
  assert.match(th,/data-sort="ventanas"/);
  assert.match(th,/aria-label="Ordenar por ventanas de decisión"/);

  const colgroup=highscore.match(/<colgroup>([\s\S]*?)<\/colgroup>/)?.[1]||"";
  assert.equal((colgroup.match(/<col\b/g)||[]).length,9,"la tabla mantiene sus nueve anchos canónicos");
  assert.match(highscore,/data-sort-col="objetivos"[\s\S]*data-sort-col="ventanas"[\s\S]*data-sort-col="misiones"/);
});

test("el rótulo apilado es responsive y no rompe controles existentes",()=>{
  assert.match(highscore,/\.sort-label-stack\{display:inline-flex;flex-direction:column;align-items:flex-end;justify-content:center;line-height:1\.05\}/);
  assert.match(highscore,/\.sort-head\{[^}]*display:flex[^}]*align-items:center/);
  assert.match(highscore,/@media \(max-width:620px\)[\s\S]*\.progression\{/);
  assert.doesNotMatch(highscore,/\.sort-label-stack\{[^}]*display:none/);

  assert.match(highscore,/data-yk-slot="right"[^>]*id="advancedMenu"/);
  assert.match(highscore,/class="score-number score-day daily-'\s*\+\s*esc\(state\)/);
  assert.match(highscore,/<button class="score-toggle" type="button" aria-expanded="false"/);
  assert.match(highscore,/\.score-progress\[hidden\]\{display:none\}/);
});
