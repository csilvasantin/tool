// FLT-1504 · cinco estrellas interactivas junto al nombre del proyecto.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./dashboard.html", import.meta.url), "utf8");
const blockStart = source.indexOf("function paImportance(project)");
const blockEnd = source.indexOf("function paReplaceProject(project)", blockStart);
const block = source.slice(blockStart, blockEnd);
const esc = (value) => String(value).replace(/[&<>\"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
const api = new Function("esc", "PROJECT_IMPORTANCE_PENDING", `${block}\nreturn {paImportance,paImportanceControl};`)(esc, new Map());

test("renderiza exactamente cinco botones a la derecha del nombre", () => {
  assert.match(source, /class="pa-project-heading"><b[^>]*>.*<\/b>'\+paImportanceControl\(project\)/);
  const html = api.paImportanceControl({id:"yokup",name:"Yokup",importance:0});
  assert.equal((html.match(/<button /g) || []).length, 5);
  assert.match(html, /role="group" aria-label="Importancia de Yokup: 0 de 5"/);
});

test("0, 3 y 5 rellenan cero, tres y cinco estrellas", () => {
  const count = (value) => (api.paImportanceControl({id:"p",name:"P",importance:value}).match(/class="filled"/g) || []).length;
  assert.equal(count(0), 0);
  assert.equal(count(3), 3);
  assert.equal(count(5), 5);
});

test("sólo el valor exacto está seleccionado para tecnología asistiva", () => {
  const html = api.paImportanceControl({id:"p",name:"P",importance:3});
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(html, /data-pa-importance-value="3"[^>]*aria-label="Quitar importancia de P"[^>]*aria-pressed="true"/);
});

test("pulsar de nuevo la seleccionada guarda 0 y otra estrella guarda 1..5", () => {
  assert.match(source, /const current=paImportance\(previous\),next=clicked===current\?0:clicked/);
  assert.match(source, /expected_importance:current/);
});

test("clic, puntero y teclado nativo no abren el detalle ni activan arrastre", () => {
  assert.match(source, /button\.onpointerdown=event=>event\.stopPropagation\(\)/);
  assert.match(source, /button\.onclick=event=>\{event\.preventDefault\(\);event\.stopPropagation\(\)/);
  assert.match(source, /<button type="button"/);
  assert.match(source, /\.pa-importance button:focus-visible\{outline:2px solid var\(--accent\)/);
  assert.match(source, /touch-action:manipulation/);
});

test("cada proyecto guarda de forma independiente, optimista y con rollback", () => {
  assert.match(source, /const PROJECT_IMPORTANCE_PENDING=new Map\(\)/);
  assert.match(source, /PROJECT_IMPORTANCE_PENDING\.set\(projectId,\{previous,current,next\}\)/);
  assert.match(source, /paReplaceProject\(\{\.\.\.previous,importance:next\}\)/);
  assert.match(source, /hasServerValue\?\{\.\.\.previous,importance:serverValue\}:previous/);
  assert.match(source, /finally\{PROJECT_IMPORTANCE_PENDING\.delete\(projectId\)/);
});

test("actualiza catálogo y filas, conserva foco y anuncia éxito o error", () => {
  assert.match(source, /PROJECT_CATALOG=PROJECT_CATALOG\.map/);
  assert.match(source, /PROJECT_ROWS=paProjectsForScope\(\)/);
  assert.match(source, /function paFocusImportance/);
  assert.match(source, /paMessage\("✓ importancia de /);
  assert.match(source, /"✗ no se guardó la importancia · "/);
});

test("un GET anterior al clic no pisa el valor pendiente o recién confirmado", () => {
  assert.match(source, /const importanceRevision=PROJECT_IMPORTANCE_REV/);
  assert.match(source, /if\(importanceRevision!==PROJECT_IMPORTANCE_REV\)/);
  assert.match(source, /PROJECT_IMPORTANCE_PENDING\.has\(project\.id\)/);
});

test("el responsive mantiene el grupo fijo y deja que el nombre se trunque", () => {
  assert.match(source, /\.pa-project-heading\{display:flex;align-items:center;gap:6px;min-width:0\}/);
  assert.match(source, /\.pa-project-heading>b\{min-width:0;flex:1\}/);
  assert.match(source, /\.pa-importance\{display:inline-flex;align-items:center;gap:6px;flex:none\}/);
  assert.match(source, /\.pa-importance button\{width:18px;height:24px/);
});

test("paJson conserva status y payload para reconciliar errores canónicos", async () => {
  const start=source.indexOf("async function paJson(path,options)");
  const end=source.indexOf("function paRender()",start);
  const paJson=new Function("fetch","AbortSignal",`const PROJECTS_API="https://api.yokup.test";${source.slice(start,end)};return paJson;`)(
    async()=>({ok:false,status:409,json:async()=>({ok:false,error:"importance conflict",current_importance:5})}),AbortSignal
  );
  await assert.rejects(()=>paJson("/projects/importance"),error=>{
    assert.equal(error.status,409);
    assert.equal(error.payload.current_importance,5);
    return true;
  });
});

async function runImportanceFailure(error){
  const importanceStart=source.indexOf("function paImportance(project)");
  const importanceEnd=source.indexOf("function paImportanceControl",importanceStart);
  const replaceStart=source.indexOf("function paReplaceProject(project)");
  const replaceEnd=source.indexOf("function paPhysicalTeamCensus",replaceStart);
  return new Function("failure",`
    let PROJECT_CATALOG=[{id:"p",name:"Proyecto",importance:0}],PROJECT_ROWS=[];
    const PROJECT_IMPORTANCE_PENDING=new Map();let PROJECT_IMPORTANCE_REV=0;
    const paProjectsForScope=()=>PROJECT_CATALOG.slice();
    const paJson=async()=>{throw failure;};
    const paRender=()=>{};const paMessage=()=>{};const requestAnimationFrame=()=>{};
    ${source.slice(importanceStart,importanceEnd)}
    ${source.slice(replaceStart,replaceEnd)}
    return paSetProjectImportance("p",3).then(()=>PROJECT_CATALOG[0].importance);
  `)(error);
}

test("un 409 adopta current_importance y un 500 restaura el valor anterior", async () => {
  assert.equal(await runImportanceFailure(Object.assign(new Error("conflict"),{status:409,payload:{current_importance:5}})),5);
  assert.equal(await runImportanceFailure(Object.assign(new Error("fallo"),{status:500,payload:{}})),0);
});
