import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const highscore = fs.readFileSync(new URL("./highscore.html", import.meta.url), "utf8");
const detailHtml = fs.readFileSync(new URL("./highscoreDetail.html", import.meta.url), "utf8");
const identitySource = fs.readFileSync(new URL("./yk-agent-identity.js", import.meta.url), "utf8");
const detailSource = fs.readFileSync(new URL("./highscore-detail.js", import.meta.url), "utf8");
const context = vm.createContext({ Intl, Date, sessionStorage:{ getItem:()=>null } });
vm.runInContext(identitySource, context);
vm.runInContext(detailSource, context);
const D = context.YkHighscoreDetail, ID = context.ykAgentIdentity;

test("los tres puestos del podio navegan por click, Enter nativo y Space a la ruta exacta", () => {
  assert.match(highscore, /var detalleUrl = "\/highscoreDetail\?agent=" \+ encodeURIComponent\(a\.agente\)/);
  assert.match(highscore, /return '<a class="plaza ' \+ clases\[i\][\s\S]*href="' \+ esc\(detalleUrl\)/);
  assert.match(highscore, /aria-label="Ver detalle de /);
  assert.match(highscore, /evento\.key !== " " && evento\.key !== "Spacebar"/);
  assert.match(highscore, /evento\.preventDefault\(\); enlace\.click\(\)/);
  assert.doesNotMatch(highscore, /tabindex="-1"/);
});

test("el detalle valida identidad, conserva vuelta y no depende de texto inventado", () => {
  assert.match(detailHtml, /href="\/highscore"[^>]*aria-label="Volver al Highscore"/);
  assert.match(detailHtml, /new URLSearchParams\(location\.search\)\.get\("agent"\)/);
  assert.match(detailHtml, /DETAIL\.validAgent\(agent,ID\)/);
  assert.match(detailHtml, /Falta el agente/);
  assert.match(detailHtml, /Agente no encontrado/);
  assert.equal(D.validAgent("MorfeoMBP16", ID), true);
  assert.equal(D.validAgent("OraculoMacMini", ID), true);
  assert.equal(D.validAgent("Morfeo", ID), false);
  assert.equal(D.validAgent("<img src=x>", ID), false);
});

test("estadísticas y hechos usan únicamente payloads operativos atribuibles", () => {
  const now = Date.UTC(2026,7,3,10);
  const tasks = [
    {mission_id:"M1",code:"a",status:"done",owner:"SubMorfeoMBP16",loc:"MacBook Pro 16",updated_at:now,report:"Verificado"},
    {mission_id:"M1",code:"a1",status:"done",owner:"SubMorfeoMBP16",loc:"MacBook Pro 16",updated_at:now,report:""},
    {mission_id:"M2",code:"b",status:"in_progress",owner:"Morfeo",assignee:"Morfeo",loc:"MacBook Pro 16",updated_at:now,report:""},
    {mission_id:"M3",code:"a",status:"done",owner:"SubMorfeoMBA16",loc:"MacBookAir16plata",updated_at:now,report:"otro equipo"}
  ];
  const daily={scores:[{agent:"MorfeoMBP16",machine:"MacBook Pro 16",objective_points:20,window_points:8,mission_points:40}]};
  const score=D.scoreFor("MorfeoMBP16",daily,tasks,ID,now);
  assert.deepEqual(JSON.parse(JSON.stringify(score)),{objectives:20,windows:8,missions:40,tasks:40,taskCount:2,total:108});
  assert.equal(D.taskCountToday("MorfeoMBP16",tasks,ID,now),2);
  const facts=D.facts("MorfeoMBP16",tasks,
    [{id:"M1",assignee:"Morfeo",loc:"MacBook Pro 16",status:"resolved"},{id:"M2",assignee:"MorfeoMBP16",loc:"MacBook Pro 16",status:"in_progress"}],
    [{id:"I1",assignee:"MorfeoMBP16",loc:"MacBook Pro 16",status:"open"}],ID);
  assert.deepEqual(Array.from(facts.good, x=>x.label),["misiones finalizadas","tareas principales terminadas","informes con contenido"]);
  assert.deepEqual(Array.from(facts.improve, x=>x.label),["misiones abiertas o en curso","tareas principales aún no terminadas","incidencias abiertas o en curso"]);
});

test("la evolución agrupa sólo timestamps reales de hoy en Europe/Madrid", () => {
  const now=Date.UTC(2026,7,3,12), at=Date.UTC(2026,7,3,9,15);
  const hours=D.timeline("OraculoMacMini",
    [{mission_id:"M1",code:"a",status:"done",owner:"SubOraculoMini",loc:"admira-macmini",updated_at:at,report:"Informe real"},
     {mission_id:"M0",code:"a",status:"done",owner:"SubOraculoMini",loc:"admira-macmini",updated_at:Date.UTC(2026,7,2,9),report:"Ayer"}],
    [{id:"M1",assignee:"OraculoMini",loc:"admira-macmini",status:"resolved",updated_at:at}],[],ID,now);
  assert.equal(hours.length,1);
  assert.equal(hours[0].hour,"11:00");
  assert.equal(hours[0].count,3);
  assert.deepEqual(Array.from(hours[0].events,e=>e.type),["Tarea","Informe","Misión"]);
  assert.equal(D.timeZone,"Europe/Madrid");
});

test("la vista usa DOM seguro, estados vacíos y diseño responsive", () => {
  assert.match(detailHtml, /node\.textContent = String\(value\)/);
  assert.match(detailHtml, /target\.replaceChildren\(\)/);
  assert.doesNotMatch(detailHtml, /innerHTML\s*=/);
  assert.match(detailHtml, /No hay hechos positivos verificables/);
  assert.match(detailHtml, /No hay pendientes o incidencias atribuibles/);
  assert.match(detailHtml, /No hay eventos con hora real atribuibles/);
  assert.doesNotMatch(detailHtml, /Math\.round\(calculated\.tasks\s*\/\s*15\)/);
  assert.match(detailHtml, /data\.available\.tasks\?calculated\.taskCount/);
  assert.match(detailHtml, /return \{ ok:false, value:fallback \}/);
  assert.match(detailHtml, /Datos no disponibles para completar esta sección/);
  assert.match(detailHtml, /Datos no disponibles para reconstruir la evolución por horas/);
  assert.match(detailHtml, /if \(!known && !identitySourcesAvailable\) \{ state\("Datos no disponibles"/);
  assert.match(detailHtml, /data\.incidents\.some\(function\(i\)/);
  assert.match(detailHtml, /@media\(max-width:760px\)/);
  assert.match(detailHtml, /@media\(max-width:470px\)/);
  assert.match(detailHtml, /\/tasks\/all\?scope=fleet/);
  assert.match(detailHtml, /\/fleet\/missions/);
  assert.match(detailHtml, /\/tickets\?scope=campo/);
});
