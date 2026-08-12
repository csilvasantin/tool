import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("./highscore.html",import.meta.url),"utf8");

test("nombre y hora nacen en una columna izquierda estable y legible",()=>{
  assert.match(html,/\.refresh-agent-meta\{[^}]*justify-content:flex-start[^}]*gap:5px[^}]*width:100%/);
  assert.match(html,/\.refresh-agent\{[^}]*flex:0 1 auto[^}]*text-overflow:ellipsis[^}]*text-align:left[^}]*color:var\(--accent\)/);
  assert.match(html,/\.refresh-assignment\{[^}]*flex:0 0 auto[^}]*min-width:5ch[^}]*color:var\(--ink\)[^}]*font-weight:800[^}]*tabular-nums/);
  assert.doesNotMatch(html,/refresh-lane-idle\{[^}]*opacity|refresh-lane-last\{[^}]*(?:opacity|filter)/);
  assert.match(html,/refresh-lane-idle \.refresh-lane-center\{opacity:/);
  assert.match(html,/refresh-lane-last \.refresh-lane-center\{filter:grayscale\(1\);opacity:/);
});

test("assignment_at ausente no produce datetime vacío",()=>{
  assert.match(html,/enlace\.trabajo\.assignmentAt[\s\S]*datetime="'[\s\S]*aria-label="Asignado a las/);
  assert.match(html,/title="Hora de asignación no disponible" aria-label="Hora de asignación no disponible"/);
  assert.doesNotMatch(html,/datetime="' \+ \(enlace\.trabajo\.assignmentAt/);
});

test("amarillo e ink superan contraste AA sobre el fondo real",()=>{
  const rgb=hex=>hex.match(/[a-f\d]{2}/gi).map(part=>parseInt(part,16)/255)
    .map(value=>value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4));
  const luminance=hex=>{const [r,g,b]=rgb(hex);return .2126*r+.7152*g+.0722*b};
  const contrast=(a,b)=>{const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (hi+.05)/(lo+.05)};
  assert.ok(contrast("#ffd866","#02080d")>=4.5,"el nombre amarillo debe conservar contraste AA");
  assert.ok(contrast("#dff8ff","#02080d")>=4.5,"el reloj brillante debe conservar contraste AA");
});

test("standing es un sprite dedicado y todos los carriles no-running lo conservan",()=>{
  assert.match(html,/id="runnerStanding"/);
  assert.match(html,/class="runner-standing"[^>]*><use href="#runnerStanding"/);
  assert.match(html,/data-work-state\]:not\(\[data-work-state="running"\]\) \.runner-standing\{display:block;animation:none\}/);
  for(const phase of ["ready","set","go"])
    assert.match(html,new RegExp(`phase-${phase} \\.refresh-lane\\[data-work-state\\]:not\\(\\[data-work-state="running"\\]\\) \\.runner-pose-${phase}`));
  assert.match(html,/noCorre = !!estadoTrabajo && estadoTrabajo !== "running"/);
});

test("running conserva salida, zancadas y meta; stale/last quedan en salida",()=>{
  assert.match(html,/phase-ready \.runner-pose-ready\{display:block;opacity:1\}/);
  assert.match(html,/phase-set \.runner-pose-set\{display:block;opacity:1\}/);
  assert.match(html,/phase-go \.runner-pose-go\{display:block;opacity:1\}/);
  assert.match(html,/\.runner-run-a\{animation:runner-run-a/);
  assert.match(html,/finished\.race-winner \.runner-finish-win\{display:block/);
  assert.match(html,/progresoAtleta = noCorre \? 0 : progresoCarril/);
  assert.match(html,/if \(noCorre\)[\s\S]*relleno\.style\.width = "0px"[\s\S]*return;/);
});

test("responsive conserva reloj fijo y nombre truncable en cinco anchos y zoom 200%",()=>{
  assert.match(html,/grid-template-columns:minmax\(150px,220px\) minmax\(0,1fr\) minmax\(118px,160px\)/);
  assert.match(html,/@media \(max-width:620px\)[\s\S]*grid-template-columns:minmax\(92px,126px\) minmax\(0,1fr\) minmax\(104px,116px\)/);
  for(const width of [1265,1024,760,390,320]){
    const content=Math.min(1080,width-36), mobile=width<=620;
    const agentMin=mobile?92:150, elapsedMin=mobile?104:118, gaps=mobile?8:16;
    assert.ok(content-agentMin-elapsedMin-gaps>=0,`${width}px conserva pista sin overflow`);
  }
  assert.ok(1265/2-36-92-104-8>=0,"zoom 200% del escritorio conserva las tres columnas");
  assert.match(html,/\.refresh-assignment\{[^}]*white-space:nowrap/);
  assert.match(html,/\.refresh-agent\{[^}]*min-width:0[^}]*overflow:hidden[^}]*text-overflow:ellipsis/);
});
