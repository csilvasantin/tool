import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("./highscore.html",import.meta.url),"utf8");

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
  throw new Error(`función ${name} incompleta`);
}

class FakeTarget{
  constructor(){this.listeners=new Map();this.style={};this.classList={add(){}};}
  addEventListener(type,listener,options={}){
    const list=this.listeners.get(type)||[];
    list.push({listener,once:!!options.once,capture:!!options.capture});
    this.listeners.set(type,list);
  }
  removeEventListener(type,listener){
    this.listeners.set(type,(this.listeners.get(type)||[]).filter(item=>item.listener!==listener));
  }
  dispatch(type){
    const event={type,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;}};
    const ordered=(this.listeners.get(type)||[]).slice().sort((a,b)=>Number(b.capture)-Number(a.capture));
    for(const item of ordered){
      if(item.once)this.removeEventListener(type,item.listener);
      item.listener.call(this,event);
      if(event.stopped)break;
    }
    return event;
  }
  setAttribute(name,value){this[name]=String(value);}
}

function audioHarness(){
  const carga=new FakeTarget(),documentTarget=new FakeTarget();
  const nodes={carga,pagina:new FakeTarget(),btnSonido:new FakeTarget(),estadoSonido:new FakeTarget()};
  documentTarget.getElementById=id=>nodes[id];
  let userActivation=false;
  const audio={paused:true,currentTime:0,playCalls:0,pauseCalls:0,loop:false,preload:"",volume:0,
    play(){
      this.playCalls++;
      if(!userActivation)return Promise.reject(Object.assign(new Error("play() failed because the user didn't interact with the document first"),{name:"NotAllowedError"}));
      this.paused=false;
      return Promise.resolve();
    },
    pause(){this.pauseCalls++;this.paused=true;}
  };
  const sandbox={
    document:documentTarget,Audio:function(){return audio;},console,
    entradaHecha:false,entradaTimer:1,cuentaEntradaTimer:2,
    clearTimeout(){},clearInterval(){},setTimeout(fn){fn();},
    fanfarriaPodio(){},iniciaCarrera(){},
    // FLT-1423: el runtime real consulta window.__YK_PRESITE__ (primera visita
    // de la sesión → ceremonia completa) y sella sessionStorage al entrar.
    window:{__YK_PRESITE__:true},
    sessionStorage:{setItem(){},getItem(){return null;}},
  };
  vm.createContext(sandbox);
  const audioStart=source.indexOf("var ac = null, sonando = false, bgm = null;");
  const audioEnd=source.indexOf("function fanfarriaPodio",audioStart);
  assert.ok(audioStart>=0&&audioEnd>audioStart,"falta el runtime de audio del presite");
  vm.runInContext(source.slice(audioStart,audioEnd),sandbox);
  vm.runInContext(functionSource("entra"),sandbox);
  const listoStart=source.indexOf("function listo()");
  const listoEnd=source.indexOf("function entra()",listoStart);
  const listo=source.slice(listoStart,listoEnd);
  const clickWire=listo.match(/document\.getElementById\("carga"\)\.addEventListener\("click",[^;]+;/)?.[0];
  const keyWire=listo.match(/document\.addEventListener\("keydown",[^;]+;/)?.[0];
  assert.ok(clickWire&&keyWire,"faltan los eventos reales de entrada");
  vm.runInContext(`${clickWire}\n${keyWire}`,sandbox);
  return {
    audio,carga,documentTarget,sandbox,
    async settle(){await Promise.resolve();await Promise.resolve();},
    gesture(target,type){userActivation=true;try{return target.dispatch(type);}finally{userActivation=false;}}
  };
}

test("el primer gesto táctil desbloquea música audible y NO abandona el presite en el mismo click",async()=>{
  const h=audioHarness();
  await h.settle();
  assert.equal(h.audio.paused,true,"el autoplay inicial debe modelar NotAllowedError");
  h.gesture(h.carga,"pointerdown");
  h.gesture(h.carga,"click");
  await h.settle();
  assert.equal(h.sandbox.entradaHecha,false,"el click que desbloquea audio debe quedarse en la carátula");
  assert.equal(h.audio.paused,false,"la música debe seguir sonando después del primer gesto permitido");
  assert.equal(h.audio.pauseCalls,0,"entra() no puede apagar el audio recién desbloqueado en el mismo gesto");
  h.gesture(h.carga,"click");
  assert.equal(h.sandbox.entradaHecha,true,"un segundo click sí entra en Highscore");
  assert.equal(h.audio.paused,true,"al entrar se detiene y rebobina la música exclusiva del presite");
});

test("teclado respeta el mismo ciclo: primera tecla desbloquea, la siguiente entra",async()=>{
  const h=audioHarness();
  await h.settle();
  h.gesture(h.documentTarget,"keydown");
  await h.settle();
  assert.equal(h.sandbox.entradaHecha,false);
  assert.equal(h.audio.paused,false);
  h.gesture(h.documentTarget,"keydown");
  assert.equal(h.sandbox.entradaHecha,true);
  assert.equal(h.audio.paused,true);
});
