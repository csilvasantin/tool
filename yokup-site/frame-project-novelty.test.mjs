import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const frame=await readFile(new URL("./yk-frame.js",import.meta.url),"utf8");
const css=await readFile(new URL("./yk-frame.css",import.meta.url),"utf8");
const start=frame.indexOf("/* YK_PROJECT_NOVELTY_CORE_START"),end=frame.indexOf("/* YK_PROJECT_NOVELTY_CORE_END */")+"/* YK_PROJECT_NOVELTY_CORE_END */".length;
const source=frame.slice(start,end);

function memory(initial={}){const values=new Map(Object.entries(initial));return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};}
function tracker(storage=memory(),publish){const context=vm.createContext({globalThis:null});context.globalThis=context;vm.runInContext(source,context);return context.YkProjectNovelty.create({storage,publish});}
function project(id,status="activo",name=id){return {id,status,name};}
function payload(cursor,projects,events=[]){return {ok:true,projects,total:projects.filter(row=>row.status!=="archivado").length,created_cursor:cursor,newest_id:events[0]?.project_id||projects.at(-1)?.id||"",latest_created_at:cursor==null?null:cursor*1000,events};}
function event(cursor,id){return {cursor,project_id:id,created_at:cursor*1000};}

test("TODOS usa el total seleccionable 0, 1 y n del contrato",()=>{
  const api=tracker();
  assert.equal(api.meta(payload(0,[])).total,0);
  assert.equal(api.meta(payload(1,[project("a")])).total,1);
  assert.equal(api.meta(payload(3,[project("a"),project("old","archivado"),project("b")])).total,2);
  assert.match(frame,/projectTotalLabel\("TODOS"\)/);
  assert.match(frame,/projectTotal=metadata\.total/);
});

test("la primera carga fija baseline silencioso",()=>{
  const api=tracker(),result=api.observe(payload(20,[project("a"),project("b")],[event(20,"b"),event(19,"a")]));
  assert.equal(result.first,true);assert.equal(result.added,0);assert.deepEqual(Array.from(result.unread_ids),[]);
  assert.equal(result.state.seen_cursor,20);assert.equal(result.state.observed_cursor,20);
});

test("cursor sólo ordena y los eventos explícitos cuentan saltos múltiples",()=>{
  const api=tracker();api.observe(payload(10,[project("a")]));
  let result=api.observe(payload(14,[project("a"),project("b"),project("c")],[event(14,"c"),event(12,"b")]));
  assert.equal(result.added,2);assert.deepEqual(Array.from(result.unread_ids).sort(),["b","c"]);
  result=api.observe(payload(18,[project("a"),project("b"),project("c")],[]));
  assert.equal(result.added,0,"los huecos de AUTOINCREMENT no son proyectos");
});

test("una respuesta HTTP antigua no retrocede ni borra una novedad",()=>{
  const api=tracker();api.observe(payload(30,[project("a")]));
  api.observe(payload(31,[project("a"),project("b")],[event(31,"b")]));
  const stale=api.observe(payload(30,[project("a")],[event(30,"a")]));
  assert.equal(stale.state.observed_cursor,31);assert.deepEqual(Array.from(stale.unread_ids),["b"]);
});

test("reload conserva unread y el ACK de ids renderizados es selectivo",()=>{
  const store=memory();let api=tracker(store);api.observe(payload(1,[project("a")]));api.observe(payload(2,[project("a"),project("b")],[event(2,"b")]));
  api=tracker(store);assert.deepEqual(Array.from(api.unreadIds()),["b"]);
  api.ack(["a"]);assert.deepEqual(Array.from(api.unreadIds()),["b"],"renderizar otro id no consume la alta");
  api.ack(["b"]);assert.deepEqual(Array.from(api.unreadIds()),[]);assert.equal(api.snapshot().seen_cursor,2);
});

test("ACK cross-tab gana a mensajes viejos",()=>{
  const store=memory(),tabA=tracker(store);tabA.observe(payload(5,[project("a")]));tabA.observe(payload(6,[project("a"),project("b")],[event(6,"b")]));
  const stale=tabA.snapshot(),tabB=tracker(store);tabB.ack(["b"]);tabA.sync(tabB.snapshot());assert.deepEqual(Array.from(tabA.unreadIds()),[]);
  tabA.sync(stale);assert.deepEqual(Array.from(tabA.unreadIds()),[],"un broadcast anterior no reenciende el punto");
});

test("edición, reorder, delete y oscilación del total no crean novedades",()=>{
  const api=tracker();api.observe(payload(8,[project("a"),project("b")]));
  assert.equal(api.observe(payload(8,[project("b","activo","B editado"),project("a")])).added,0);
  assert.equal(api.observe(payload(8,[project("b")])).added,0);
  assert.equal(api.observe({...payload(8,[project("b")]),total:99}).added,0);
  assert.deepEqual(Array.from(api.unreadIds()),[]);
});

test("archivar y reactivar un id conocido tampoco lo presenta como alta",()=>{
  const api=tracker();api.observe(payload(8,[project("a"),project("old","archivado")]));
  assert.equal(api.observe(payload(8,[project("a"),project("old","activo","Old reactivado")])).added,0);
  assert.deepEqual(Array.from(api.unreadIds()),[]);
});

test("fallback sin cursor detecta ids nuevos, no cambios de total",()=>{
  const api=tracker();api.observe(payload(null,[project("a"),project("old","archivado")]));
  assert.equal(api.observe(payload(null,[project("a","activo","A editado")])).added,0);
  const added=api.observe(payload(null,[project("a"),project("b")]));assert.equal(added.added,1);assert.deepEqual(Array.from(added.unread_ids),["b"]);
});

test("selector expone blink, ARIA, badges y ACK sólo al abrir/renderizar",()=>{
  assert.match(frame,/new window\.BroadcastChannel\("yokup-project-novelty-v1"\)/);
  assert.match(frame,/window\.addEventListener\("storage"[\s\S]*event\.key===projectNovelty\.key/);
  assert.match(frame,/live\.setAttribute\("aria-live","polite"\)/);
  assert.match(frame,/unread\.length\+" proyecto"\+\(unread\.length===1\?" nuevo":"s nuevos"\)/);
  assert.match(frame,/yk-proj-new-badge">NUEVO/);
  assert.match(frame,/if \(open\) \{[^}]*ackRenderedProjects\(\)/);
  assert.match(frame,/if \(open\) \{ ackRenderedProjects\(\); var f = menu\.querySelector\("button"\); if \(f\) f\.focus\(\); \}/,
    "el ACK repinta antes de enfocar una opción que siga conectada al DOM");
  assert.doesNotMatch(frame,/btn\.addEventListener\("(?:mouseenter|mouseover|focus)"[\s\S]*ack/);
  assert.match(frame,/window\.addEventListener\("yk:projects-changed",function\(\)\{loadProjects\(\);\}\)/);
  assert.match(css,/\.yk-proj\.has-new \.yk-proj-dot\{ animation:yk-project-new/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)[\s\S]*\.yk-proj\.has-new \.yk-proj-dot/);
});
