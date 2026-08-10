import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dispatchCliTerminal, normalizeCliTerminalRequest, readCliTerminalResult } from "./src/fleet-cli-terminal.js";

const now=1_786_350_000;
const target={machine:"MacBookAirAzul",persona:"Smith",runtime:"Grok",host:"cli",session_id:"smith",pid:7331};
const live={...target,verified:1,source:"process_snapshot",online:1,updated:now-2};
const worker=await readFile(new URL("./src/index.js",import.meta.url),"utf8");

test("la consola sólo acepta read/write/focus sobre un CLI exacto",()=>{
  assert.deepEqual(normalizeCliTerminalRequest({...target,action:"read"}),{...target,action:"read",text:""});
  assert.deepEqual(normalizeCliTerminalRequest({...target,action:"write",text:"Responde exactamente: OK"}),{...target,action:"write",text:"Responde exactamente: OK"});
  assert.deepEqual(normalizeCliTerminalRequest({...target,action:"focus"}),{...target,action:"focus",text:""});
  assert.throws(()=>normalizeCliTerminalRequest({...target,host:"app",action:"read"}),/terminal-requires-cli/);
  assert.throws(()=>normalizeCliTerminalRequest({...target,action:"shell",text:"pwd"}),/invalid-terminal-action/);
  assert.throws(()=>normalizeCliTerminalRequest({...target,action:"write",text:"hola\u0000"}),/invalid-terminal-text/);
});

test("revalida presencia y no reenvía ningún secreto del navegador",async()=>{
  const calls=[];
  const env={TELEGRAM:{async fetch(request){calls.push(request);if(new URL(request.url).pathname==="/api/presence")return Response.json({now,presence:[live]});return Response.json({ok:true,command_id:"terminal:42",status:"queued"},{status:202});}}};
  const out=await dispatchCliTerminal(env,{...target,action:"write",text:"hola literal"});
  assert.equal(new URL(calls[1].url).pathname,"/api/fleet/cli/terminal");
  assert.deepEqual(JSON.parse(await calls[1].clone().text()),{...target,action:"write",text:"hola literal"});
  assert.deepEqual(out.result,{ok:true,command_id:"terminal:42",status:"queued"});
});

test("la lectura devuelve sólo estado y salida acotada",async()=>{
  const env={TELEGRAM:{async fetch(){return Response.json({command:{action:"terminal_read",status:"done",output:"terminal real",input:"no debe salir",updated_at:99}});}}};
  assert.deepEqual(await readCliTerminalResult(env,"terminal:42"),{ok:true,command_id:"terminal:42",action:"read",status:"done",output:"terminal real",error:"",updated_at:99});
});

test("focus conserva la sesión exacta y devuelve la confirmación del equipo",async()=>{
  const env={TELEGRAM:{async fetch(){return Response.json({command:{action:"terminal_focus",status:"done",output:"Terminal conectada a tmux:smith",updated_at:100}});}}};
  assert.deepEqual(await readCliTerminalResult(env,"terminal:43"),{ok:true,command_id:"terminal:43",action:"focus",status:"done",output:"Terminal conectada a tmux:smith",error:"",updated_at:100});
});

test("la ruta está autenticada, auditada y jamás persiste el mensaje",()=>{
  assert.match(worker,/PROTECTED[^\n]+"\/fleet\/cli\/terminal"/);
  assert.match(worker,/if \(url\.pathname === "\/fleet\/cli\/terminal"\)/);
  assert.match(worker,/terminal_" \+ terminal\.action/);
  assert.match(worker,/readCliTerminalResult\(env, commandId\)/);
  const insert=worker.match(/INSERT INTO fleet_agent_commands\(id,action,machine,persona,runtime,host,session_id,pid,requested_by,status,created_at,updated_at\)/);
  assert.ok(insert,"la auditoría conserva metadatos, no contenido");
});
