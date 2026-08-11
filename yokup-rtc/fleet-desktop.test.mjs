import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {authorizeDesktopCaptureClear,clearDesktopCapture,dispatchDesktopCapture,dispatchDesktopWrite,readDesktopResult} from "./src/fleet-desktop.js";

const now=1_786_400_000;
const target={machine:"MacMini",persona:"Oraculo",runtime:"Codex",host:"app",session_id:"desktop:codex",pid:4321};
const live={...target,verified:1,source:"process_snapshot",online:1,updated:now-1};

test("capture revalida el slot exacto y conserva el CGWindowID anterior",async()=>{
  const calls=[],env={TELEGRAM:{async fetch(request){calls.push(request);if(new URL(request.url).pathname==="/api/presence")return Response.json({now,presence:[live]});return Response.json({ok:true,command_id:71,status:"queued"},{status:202});}}};
  const out=await dispatchDesktopCapture(env,{...target,window_id:991});
  assert.equal(new URL(calls[1].url).pathname,"/api/fleet/desktop/capture");
  assert.deepEqual(JSON.parse(await calls[1].clone().text()),{...target,window_id:991});
  assert.equal(out.result.command_id,"71");
});

test("desktop write reenvía Unicode y shell-like literalmente a la app, no a terminal",async()=>{
  const text="[MISIÓN · DESKTOPAPP]\nÁéñ; $(touch /tmp/no) && `id`",calls=[];
  const env={TELEGRAM:{async fetch(request){calls.push(request);if(new URL(request.url).pathname==="/api/presence")return Response.json({now,presence:[live]});return Response.json({ok:true,command_id:72,status:"queued"},{status:202});}}};
  await dispatchDesktopWrite(env,{...target,text});
  assert.equal(new URL(calls[1].url).pathname,"/api/fleet/desktop/write");
  assert.equal(JSON.parse(await calls[1].clone().text()).text,text);
});

test("la lectura consume un frame efímero y sólo devuelve JPEG acotado",async()=>{
  const image="data:image/jpeg;base64,"+Buffer.from("frame").toString("base64"),calls=[];
  const env={TELEGRAM:{async fetch(request){calls.push(request);return Response.json({command:{id:71,action:"desktop_capture",status:"done",output:JSON.stringify({image,captured_at:1786400000123,window_id:991})}});}}};
  const out=await readDesktopResult(env,"71","capture");
  assert.equal(new URL(calls[0].url).pathname,"/api/fleet/desktop/capture/consume");
  assert.equal(out.image,image);assert.equal(out.window_id,991);
  assert.equal("title" in out,false);
});

test("clear exige una captura previa del mismo usuario y target exacto",async()=>{
  const statements=[];
  const db={prepare(sql){return{bind(...values){statements.push({sql,values});return{async first(){return values.at(-1)==="carlos@example.com"?{id:"capture-1"}:null;}};}};}};
  assert.deepEqual(await authorizeDesktopCaptureClear(db,target,"Carlos@Example.com"),target);
  await assert.rejects(()=>authorizeDesktopCaptureClear(db,{...target,pid:9999},"intruso@example.com"),error=>error.code==="desktop-capture-clear-forbidden"&&error.status===403);
  assert.match(statements[0].sql,/session_id=\? AND pid=\? AND lower\(requested_by\)=\?/);
});

test("clear se admite aunque la app ya haya desaparecido del snapshot",async()=>{
  const calls=[],env={TELEGRAM:{async fetch(request){calls.push(request);return Response.json({ok:true,cleared:true});}}};
  assert.deepEqual(await clearDesktopCapture(env,target),{ok:true,cleared:true});
  assert.equal(new URL(calls[0].url).pathname,"/api/fleet/desktop/capture/clear");
});

test("el polling de un comando coalescido conserva la auditoría de cada propietario",()=>{
  const source=fs.readFileSync(new URL("./src/index.js",import.meta.url),"utf8");
  assert.match(source,/upstream_command_id=\? AND action=\? AND lower\(requested_by\)=\?/);
  assert.match(source,/bind\(commandId,auditAction,String\(sess\.email \|\| ""\)\.toLowerCase\(\)\)/);
});
