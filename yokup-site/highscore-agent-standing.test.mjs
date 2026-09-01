import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("./highscore.html",import.meta.url),"utf8");

test("nombre y bloque horario nacen a ambos lados de la pista",()=>{
  assert.match(html,/\.refresh-agent-meta\{[^}]*justify-content:flex-start[^}]*width:100%/);
  assert.match(html,/\.refresh-timing\{[^}]*justify-content:flex-end[^}]*gap:5px[^}]*width:100%/);
  assert.match(html,/\.refresh-agent\{[^}]*flex:0 1 auto[^}]*text-overflow:ellipsis[^}]*text-align:left[^}]*color:var\(--accent\)/);
  assert.match(html,/\.refresh-started,\.refresh-ended\{[^}]*flex:0 0 auto[^}]*min-width:8ch[^}]*color:var\(--ink\)[^}]*font-weight:800[^}]*tabular-nums/);
  assert.doesNotMatch(html,/refresh-lane-idle\{[^}]*opacity|refresh-lane-last\{[^}]*(?:opacity|filter)/);
  assert.match(html,/refresh-lane-idle \.refresh-lane-center\{opacity:/);
  assert.match(html,/refresh-lane-last \.refresh-lane-center\{filter:grayscale\(1\);opacity:/);
});

test("work_started_at ausente no produce datetime vacío",()=>{
  assert.match(html,/var marcaInicio = resumen\.startedAt[\s\S]*'<time class="refresh-started" data-race-time="start" datetime="'/);
  assert.match(html,/class="refresh-started" data-race-time="start" title="Hora de inicio no disponible">—/);
  assert.doesNotMatch(html,/datetime="' \+ \(enlace\.trabajo\.startedAt/);
});

test("amarillo e ink superan contraste AA sobre el fondo real",()=>{
  const rgb=hex=>hex.match(/[a-f\d]{2}/gi).map(part=>parseInt(part,16)/255)
    .map(value=>value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4));
  const luminance=hex=>{const [r,g,b]=rgb(hex);return .2126*r+.7152*g+.0722*b};
  const contrast=(a,b)=>{const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (hi+.05)/(lo+.05)};
  assert.ok(contrast("#ffd866","#02080d")>=4.5,"el nombre amarillo debe conservar contraste AA");
  assert.ok(contrast("#dff8ff","#02080d")>=4.5,"el reloj brillante debe conservar contraste AA");
});

test("standing es un sprite dedicado para last_work y stale conserva carrera cosmética",()=>{
  assert.match(html,/id="runnerStanding"/);
  assert.match(html,/class="runner-standing"[^>]*><use href="#runnerStanding"/);
  assert.match(html,/data-work-state="last_work"\] \.runner-standing\{display:block;animation:none\}/);
  for(const phase of ["ready","set","go"])
    assert.match(html,new RegExp(`phase-${phase} \\.refresh-lane\\[data-work-state="last_work"\\] \\.runner-pose-${phase}`));
  assert.match(html,/carreraCosmetica = estadoTrabajo === "assigned_stale"/);
});

test("running compite; stale cruza B\/N sin ganar y last queda quieto en meta",()=>{
  assert.match(html,/phase-ready \.runner-pose-ready\{display:block;opacity:1\}/);
  assert.match(html,/phase-set \.runner-pose-set\{display:block;opacity:1\}/);
  assert.match(html,/phase-go \.runner-pose-go\{display:block;opacity:1\}/);
  assert.match(html,/\.runner-run-a\{animation:runner-run-a/);
  assert.match(html,/finished\.race-winner \.runner-finish-win\{display:block/);
  assert.match(html,/progresoAtleta = trabajoFinalizado \? 1 : noCorre \? 0 : Math\.min\(1, progresoCarril/);
  assert.match(html,/toggle\("cosmetic-finished", carreraCosmetica && progresoAtleta >= 1\)/);
  assert.match(html,/\.refresh-lane\.cosmetic-finished \.runner-standing\{display:block/);
  assert.match(html,/!carreraCosmetica && ordenLlegada === 1/);
  assert.match(html,/if \(noCorre\)[\s\S]*relleno\.style\.width = "0px"[\s\S]*return;/);
});

test("responsive conserva identidad, pista y tiempo a la derecha",()=>{
  assert.match(html,/grid-template-columns:minmax\(148px,210px\) minmax\(0,1fr\) minmax\(158px,190px\)/);
  assert.match(html,/@media \(max-width:620px\)[\s\S]*grid-template-columns:minmax\(112px,142px\) minmax\(54px,1fr\) minmax\(110px,124px\)/);
  assert.match(html,/@media \(max-width:340px\)\{\.refresh-lane\{grid-template-columns:minmax\(92px,112px\) minmax\(42px,1fr\) minmax\(108px,118px\)/);
  for(const width of [1265,1024,760,390,320]){
    const mobile=width<=620,content=Math.min(1080,width-36)-(mobile?6:0);
    const agentMin=width<=340?92:mobile?112:width<=800?128:width<=1100?138:148;
    const timingMin=width<=340?108:mobile?110:width<=800?142:width<=1100?150:158;
    const gaps=width<=340?2:mobile?4:8;
    const trackMin=width<=340?42:mobile?54:0;
    assert.ok(content-agentMin-timingMin-gaps>=trackMin,`${width}px conserva pista sin overflow`);
  }
  assert.ok(1265/2-36-6-112-110-4>=54,"zoom 200% del escritorio conserva las tres columnas");
  assert.match(html,/\.refresh-started,\.refresh-ended\{[^}]*white-space:nowrap/);
  assert.match(html,/\.refresh-agent\{[^}]*min-width:0[^}]*overflow:hidden[^}]*text-overflow:ellipsis/);
});
