import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const source = await readFile(new URL("./acceso.js", import.meta.url), "utf8");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem:key => values.has(key) ? values.get(key) : null,
    setItem:(key, value) => values.set(key, String(value)),
    removeItem:key => values.delete(key),
    entries:() => Object.fromEntries(values)
  };
}

async function authenticatedAccess(session) {
  const events = [];
  const storage = memoryStorage();
  const classes = new Set();
  const element = () => ({
    id:"", textContent:"", innerHTML:"", async:false, defer:false,
    appendChild(){}, remove(){}, setAttribute(){}, addEventListener(){}
  });
  const document = {
    documentElement:{classList:{add:value => classes.add(value), remove:value => classes.delete(value)}},
    head:{appendChild(){}}, body:{appendChild(){}},
    createElement:element, getElementById:() => null, querySelector:() => null,
    addEventListener(){}
  };
  const rawFetch = async (input) => {
    assert.match(String(input), /https:\/\/api\.yokup\.com\/auth\/session$/);
    return {ok:true, status:200, json:async () => ({ok:true, ...session})};
  };
  const window = {
    fetch:rawFetch,
    dispatchEvent:event => { events.push(event); return true; }
  };
  class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }
  const context = vm.createContext({
    window, document, localStorage:storage,
    location:{pathname:"/supervisor", search:"", hash:"", reload(){}},
    CustomEvent, Promise, Object, String, Boolean, JSON, Date, Math, URL, console
  });
  vm.runInContext(source, context);
  const ready = await window.YkAccess.ready;
  return {ready, current:window.YkAccess.get(), events, storage:storage.entries(), classes};
}

test("acceso.js conserva capacidades y defaults firmados sólo en memoria", async () => {
  const result = await authenticatedAccess({
    email:"operador@example.com", name:"Operador",
    capabilities:{supervisor_project_switch:false},
    defaults:{supervisor_project_id:"admira-tv", supervisor_project_label:"admira.tv"}
  });

  assert.equal(result.ready, result.current);
  assert.deepEqual({...result.current.capabilities}, {supervisor_project_switch:false});
  assert.deepEqual({...result.current.defaults}, {
    supervisor_project_id:"admira-tv", supervisor_project_label:"admira.tv"
  });
  assert.ok(Object.isFrozen(result.current));
  assert.ok(Object.isFrozen(result.current.capabilities));
  assert.ok(Object.isFrozen(result.current.defaults));
  assert.deepEqual(result.storage, {yk_email:"operador@example.com"},
    "el storage sólo conserva el email decorativo, nunca permisos o defaults");
  assert.equal(result.events.at(-1).type, "yk:access-ready");
  assert.equal(result.events.at(-1).detail, result.current);
  assert.equal(result.classes.has("yk-locked"), false);
});

test("el permiso de cambio depende de la capacidad, no de un correo privilegiado", async () => {
  const sameEmailWithoutCapability = await authenticatedAccess({
    email:"csilva@admira.com", capabilities:{supervisor_project_switch:false},
    defaults:{supervisor_project_id:"admira-tv", supervisor_project_label:"admira.tv"}
  });
  const ordinaryEmailWithCapability = await authenticatedAccess({
    email:"supervisor@example.com", capabilities:{supervisor_project_switch:true},
    defaults:{supervisor_project_id:"admira-tv", supervisor_project_label:"admira.tv"}
  });

  assert.equal(sameEmailWithoutCapability.current.capabilities.supervisor_project_switch, false);
  assert.equal(ordinaryEmailWithCapability.current.capabilities.supervisor_project_switch, true);
  assert.doesNotMatch(source, /csilva@admira\.com|email[^\n]*(?:superuser|supervisor_project_switch)/i);
});
