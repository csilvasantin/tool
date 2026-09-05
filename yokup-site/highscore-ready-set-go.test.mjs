import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html=fs.readFileSync(new URL("./highscore.html",import.meta.url),"utf8");
const start=html.indexOf("function centraLlamadaCarrera()");
const end=html.indexOf("\n  var observadorLlamadaCarrera",start);
const centerSource=html.slice(start,end);

test("la placa es única, persistente y ajena a active/stale/recent/empty/unavailable",()=>{
  assert.equal((html.match(/id="raceCall"/g)||[]).length,1);
  const lanes=html.indexOf('id="refreshLanes"'),call=html.indexOf('id="raceCall"');
  assert.ok(lanes<call && call<html.indexOf('id="refreshCount"'));
  const renderer=html.slice(html.indexOf("function actualizaCarreraPodio("),html.indexOf("\n\n  function pintaFormula"));
  assert.doesNotMatch(renderer,/race-call|raceCall/);
  assert.match(renderer,/TRABAJO NO DISPONIBLE|SIN TRABAJO VERIFICADO/);
  assert.match(renderer,/refresh-lane-idle/);
  assert.match(renderer,/refresh-lane-last/);
});

test("READY cian, SET ámbar y GO verde conservan opacidad y filtro neutros",()=>{
  assert.match(html,/phase-ready \.race-call[^}]*--call:#78f3ff[^}]*color:#eaffff/);
  assert.match(html,/phase-set \.race-call[^}]*--call:#ffd866[^}]*color:#fff7b8/);
  assert.match(html,/phase-go \.race-call[^}]*--call:#88ffaa[^}]*color:#ecfff1/);
  assert.match(html,/phase-ready \.race-call,[^}]*phase-go \.race-call\{opacity:1;filter:none\}/);
  assert.doesNotMatch(html,/@keyframes race-call-(?:ready|set|go)\{[^}]*(?:filter:|opacity:)/);
});

test("centro matemático <=1px y caja contenida a 1265/1024/760/390/320",()=>{
  assert.doesNotMatch(html,/--finish-gutter/,
    "la geometría no puede depender de la variable eliminada que causó el descentramiento");
  for(const viewport of [1265,1024,760,390,320]){
    const page=Math.min(1080,viewport-36);
    const mobile=viewport<=620;
    const agent=mobile?(viewport<=340?92:126):(viewport<=800?150:220);
    const elapsed=mobile?(viewport<=340?54:65):96;
    const gaps=mobile?10:20;
    const trackWidth=page-agent-elapsed-gaps;
    const race={getBoundingClientRect:()=>({left:18,top:10,right:18+page,width:page,height:90})};
    const track={getBoundingClientRect:()=>({left:18+agent+(mobile?5:10),right:18+agent+(mobile?5:10)+trackWidth,top:28,width:trackWidth,height:30})};
    const call={style:{},dataset:{}};
    const context={
      document:{
        getElementById:id=>id==="refreshRace"?race:id==="raceCall"?call:null,
        querySelectorAll:()=>[track]
      },
      getComputedStyle:()=>({getPropertyValue:name=>name==="--track-start"?"2px":name==="--finish-width"?"7px":""}),
      Number,Array,Math,parseFloat
    };
    vm.runInNewContext(centerSource+"\ncentraLlamadaCarrera();",context);
    const startPx=track.getBoundingClientRect().left-race.getBoundingClientRect().left+2;
    const finishPx=track.getBoundingClientRect().right-race.getBoundingClientRect().left-7;
    const expected=(startPx+finishPx)/2;
    const actual=parseFloat(call.style.left),max=parseFloat(call.style.maxWidth);
    assert.ok(Math.abs(actual-expected)<=1,`${viewport}px: centro ${actual} vs ${expected}`);
    assert.ok(actual-max/2>=startPx-1 && actual+max/2<=finishPx+1,`${viewport}px: caja fuera de pista`);
  }
});

test("ResizeObserver recalcula y reduced-motion conserva las tres fases sin RAF",()=>{
  assert.match(html,/new ResizeObserver\(centraLlamadaCarrera\)/);
  assert.match(html,/observadorLlamadaCarrera\.observe\(document\.getElementById\("refreshRace"\)\)/);
  assert.match(html,/@media \(prefers-reduced-motion:reduce\)[\s\S]*\.race-call[^}]*animation:none!important;transition:none!important/);
  const reduced=html.slice(html.indexOf("function programaCarreraReducida"),html.indexOf("function avanzaCarrera"));
  assert.match(reduced,/PASO_SALIDA_MS, 2 \* PASO_SALIDA_MS, SALIDA_MS/);
  assert.doesNotMatch(reduced,/requestAnimationFrame/);
});
