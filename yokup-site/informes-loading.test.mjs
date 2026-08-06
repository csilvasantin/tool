import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./informes.html", import.meta.url), "utf8");
const avatarSource = await readFile(new URL("./yk-avatar.js", import.meta.url), "utf8");
const frameSource = await readFile(new URL("./yk-frame.js", import.meta.url), "utf8");
const main = html.match(/<script>\s*(const WORKER="https:\/\/api\.yokup\.com";[\s\S]*?)<\/script>/)?.[1];
assert.ok(main, "no se encontró el controlador inline de informes");

const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function element(innerHTML = "") {
  return {
    innerHTML, hidden:false, value:"", dataset:{}, disabled:false, textContent:"",
    classList:{add(){},remove(){},toggle(){}},
    setAttribute(name,value){ this[name]=value; },
    addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }
  };
}

test("proyecto temprano conserva loading; datos, deuda y avatar no se serializan", async () => {
  const tasks = deferred(), avatar = deferred(), listeners = {}, intervals = [], calls = [];
  const elements = { reps:element('<div class="empty loading">Cargando informes…</div>'), tfilter:element(), tfDate:element(), debe:element(), lb:element() };
  elements.lb.querySelector = () => element();
  const fetch = (url) => {
    calls.push(url);
    if (url.includes("/tasks/all")) return tasks.promise;
    if (url.includes("/fleet/informes-deuda")) return Promise.resolve({ok:true,status:200,json:async()=>({missions:[]})});
    throw new Error("fetch inesperado: " + url);
  };
  const window = {
    ykAvatar:{ready:avatar.promise}, ykAgentIdentity:null,
    addEventListener(type,fn){ listeners[type]=fn; }
  };
  const document = {
    getElementById(id){ return elements[id]; },
    addEventListener(){}, querySelector(){ return null; }
  };
  const context = vm.createContext({
    window, document, fetch, console, Date, Promise, encodeURIComponent, ykAvatar:window.ykAvatar,
    YkInformesSort:{sort:(rows)=>rows},
    setInterval(fn){ intervals.push(fn); return intervals.length; }, setTimeout(){},
  });
  vm.runInContext(main, context);

  assert.equal(calls.filter((url)=>url.includes("/tasks/all")).length, 1, "tasks arranca sin esperar avatar");
  assert.equal(calls.filter((url)=>url.includes("/fleet/informes-deuda")).length, 1, "deuda arranca en paralelo");

  listeners["yk:project-change"]({detail:{project_id:null,ready:true}});
  assert.match(elements.reps.innerHTML, /Cargando informes/);
  assert.doesNotMatch(elements.reps.innerHTML, /Sin informes/);

  intervals[0]();
  assert.equal(calls.filter((url)=>url.includes("/tasks/all")).length, 1, "un tick solapado reutiliza la petición en vuelo");

  tasks.resolve({ok:true,status:200,json:async()=>({tasks:[]})});
  await tick(); await tick();
  assert.match(elements.reps.innerHTML, /Sin informes de hoy/,
    "el estado vacío sólo aparece después de una respuesta válida");
  avatar.resolve();
});

test("avatar y panel comparten un solo GET de personalización", async () => {
  let requests = 0;
  const window = {fetch:async()=>{ requests++; return {json:async()=>({customize:{agents:{},machines:{}}})}; }};
  const context = vm.createContext({window,localStorage:{getItem(){return null;}},Promise});
  vm.runInContext(avatarSource, context);
  vm.runInContext(avatarSource, context);
  await context.window.ykAvatar.ready;
  assert.equal(requests, 1);
  assert.match(frameSource, /window\.__ykCustomizeRequest \|\| window\.fetch\(WORKER \+ "\/prefs\/customize"/);
  assert.match(frameSource, /typeof r\.json === "function" \? r\.json\(\) : r/);
});

test("el contrato de carga impide empty prematuro y mantiene refresco", () => {
  assert.match(html, /let LOAD_STATE="loading", LOAD_INFLIGHT=null/);
  assert.match(html, /if\(LOAD_STATE==="error"\)\{ renderLoadError\(\); return; \}/);
  assert.match(html, /if\(LOAD_STATE!=="ready"\|\|!PROJECT_READY\)\{ renderLoading\(\); return; \}/);
  assert.match(html, /if\(!d\|\|!Array\.isArray\(d\.tasks\)\)throw/);
  assert.match(html, /ALL=all; LOAD_STATE="ready"; applyFilter\(\)/);
  assert.match(html, /if\(LOAD_INFLIGHT\)return LOAD_INFLIGHT/);
  assert.match(html, /load\(\);[\s\S]*ykAvatar\.ready[\s\S]*setInterval\(load,15000\)/);
  assert.doesNotMatch(html, /ykAvatar\.ready\s*:\s*Promise\.resolve\(\)\)\.then\(load\)/);
});
