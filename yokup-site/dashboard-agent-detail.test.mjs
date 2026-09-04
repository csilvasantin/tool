import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import detail from "./agent-detail.js";

const dashboard=await readFile(new URL("./dashboard.html",import.meta.url),"utf8");
const page=await readFile(new URL("./agentDetail.html",import.meta.url),"utf8");
const controller=await readFile(new URL("./agent-detail-page.js",import.meta.url),"utf8");

test("la tarjeta CLI conserva los discriminantes públicos sin exponer session_id",()=>{
  assert.equal(detail.detailUrl({persona:"Oraculo",machine:"MacMini",runtime:"Codex",host:"cli",session_id:"oraculo"}),
    "/agentDetail?agent=Oraculo&machine=MacMini&runtime=Codex&surface=cli");
  assert.equal(detail.detailUrl({persona:"Neo",machine:"MacBook Pro 14",runtime:"Claude",host:"app"}),
    "/agentDetail?agent=Neo&machine=MacBook+Pro+14&runtime=Claude&surface=app");
  assert.equal(detail.detailUrl({persona:"Neo",machine:"",runtime:"Claude",host:"cli"}),"");
});

test("el Dashboard hace navegables las tarjetas verificadas APP y CLI con enlace nativo",()=>{
  assert.match(dashboard,/src="\/agent-detail\.js\?v=/);
  assert.match(dashboard,/const href=p\.verified&&window\.YkAgentDetail\?YkAgentDetail\.detailUrl\(p\):""/);
  assert.match(dashboard,/<a class="\\?ag ag-link/);
  assert.match(dashboard,/aria-label="Abrir actividad e histórico de /);
  assert.match(dashboard,/\.ag-link:focus-visible\{[^}]*outline:2px solid var\(--brand\)/);
});

test("la query y el endpoint preservan identidad pública y página pero descartan la sesión",()=>{
  const state=detail.queryState("?agent=Oraculo&machine=MacMini&runtime=Codex&surface=cli&session_id=abc&limit=200&offset=4");
  assert.deepEqual({...state},{agent:"Oraculo",machine:"MacMini",runtime:"Codex",surface:"cli",limit:100,offset:4});
  assert.equal(detail.endpoint("https://api.yokup.com",state),
    "https://api.yokup.com/fleet/agent-detail?agent=Oraculo&machine=MacMini&runtime=Codex&surface=cli&limit=100&offset=4");
  assert.doesNotMatch(detail.detailUrl({persona:"Oraculo",machine:"MacMini",runtime:"Codex",host:"cli",session_id:"secreto"}),/session_id|secreto/);
  assert.doesNotMatch(detail.endpoint("https://api.yokup.com",{...state,session_id:"secreto"}),/session_id|secreto/);
  assert.doesNotMatch(page,/session_id/);
  assert.doesNotMatch(controller,/session_id/);
});

test("una URL normal sin paginación pide 25 filas desde el inicio",()=>{
  const state=detail.queryState("?agent=Oraculo&machine=MacMini&runtime=Codex&surface=cli");
  assert.equal(state.limit,25);
  assert.equal(state.offset,0);
  assert.match(detail.endpoint("https://api.yokup.com",state),/[?&]limit=25&offset=0$/);
});

test("la ficha declara actividad actual, histórico claro y estados honestos",()=>{
  assert.match(page,/id="agentDetail"[^>]*aria-live="polite"/);
  assert.match(controller,/Actividad actual/);
  assert.match(controller,/Histórico de actividad/);
  assert.match(controller,/Sin actividad actual atribuible/);
  assert.match(controller,/Todavía no hay actividad histórica atribuible/);
  assert.match(controller,/No se pudo cargar la ficha/);
  assert.match(controller,/No se sustituyen datos ausentes por ceros/);
  assert.match(controller,/Cargar más actividad/);
  assert.match(controller,/target\.setAttribute\("aria-busy","true"\)/);
  assert.match(controller,/target\.setAttribute\("aria-busy","false"\)/);
});

test("la página es responsive y sus acciones conservan teclado nativo",()=>{
  assert.match(page,/@media\(max-width:620px\)/);
  assert.match(page,/\.agent-more,\.agent-retry\{min-height:44px/);
  assert.match(page,/\.back\{[^}]*min-height:44px/);
  assert.match(page,/\.agent-detail-link\{[^}]*min-height:40px/);
  assert.doesNotMatch(controller,/onkeydown|keyCode/);
  assert.match(controller,/button\.type="button"/);
});

test("normaliza vacíos y sólo acepta enlaces internos de Yokup",()=>{
  const normalized=detail.normalize({ok:true,identity:{agent:"Oraculo",machine:"MacMini",runtime:"Codex",surface:"cli"},presence:{available:true,matched:false,fresh:false},current:null,history:{items:[],limit:25,offset:0,total:0,has_more:false}});
  assert.equal(normalized.current,null);assert.deepEqual(normalized.history.items,[]);assert.equal(normalized.presence.fresh,false);
  assert.equal(detail.safeDetailUrl("/misiones?mission=FLT-1"),"/misiones?mission=FLT-1");
  assert.equal(detail.safeDetailUrl("https://evil.example/steal"),"");
  assert.equal(detail.normalize({ok:false}),null);
});

test("la actividad actual usa el último progreso o latido y conserva el título de tarea",()=>{
  const normalized=detail.normalize({ok:true,identity:{agent:"Oraculo",machine:"MacMini",runtime:"Codex",surface:"app"},presence:{available:true,matched:true,fresh:true},current:{title:"Misión",task_title:"Tarea exacta",work_progress_at:1234},history:{items:[],limit:25,offset:0,total:0,has_more:false}});
  assert.equal(normalized.current.taskTitle,"Tarea exacta");assert.equal(normalized.current.activityAt,1234);
});
