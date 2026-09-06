import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const grab=name=>{
  const re=new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}\\n__name\\(${name}, "${name}"\\);`),match=re.exec(source);
  assert.ok(match,`no se pudo extraer ${name}`);return match[0];
};

function concurrentEnv(){
  const mappings=new Map(),missionOwners=new Map();let waiters=[],takenCalls=0;
  const rendezvous=()=>new Promise(resolve=>{waiters.push(resolve);if(waiters.length===2){const release=waiters;waiters=[];for(const done of release)done();}});
  const DB={prepare(sql){const directFirst=async()=>{
    if(sql.startsWith("SELECT MAX(CAST(SUBSTR(id,5)"))return {mx:2000};
    if(sql.startsWith("SELECT MAX(CAST(SUBSTR(mission_id,5)"))return {mx:Math.max(0,...[...mappings.values()].map(v=>Number(String(v).replace(/^FLT-/,""))||0))};
    if(sql.startsWith("SELECT MAX(inbox_id)"))return {mx:Math.max(0,...mappings.keys())};
    throw new Error(`direct first SQL no soportado: ${sql}`);
  };return{first:directFirst,bind(...args){return{
    async first(){
      if(sql.startsWith("SELECT mission_id FROM fleet_ids WHERE inbox_id="))return mappings.has(args[0])?{mission_id:mappings.get(args[0])}:null;
      if(sql.startsWith("SELECT subject,screen,source FROM tickets WHERE id="))return {subject:"misión ajena",screen:"",source:"incident"};
      if(sql.startsWith("SELECT MAX(CAST(SUBSTR(id,5)"))return {mx:2000};
      // serie propia de misiones (FLT-2705): el MAX también mira los ids ya reservados en fleet_ids
      if(sql.startsWith("SELECT MAX(CAST(SUBSTR(mission_id,5)"))return {mx:Math.max(0,...[...mappings.values()].map(v=>Number(String(v).replace(/^FLT-/,""))||0))};
      if(sql.startsWith("SELECT MAX(inbox_id)"))return {mx:Math.max(0,...mappings.keys())};
      if(sql.startsWith("SELECT 1 x FROM tickets")){takenCalls++;if(takenCalls<=2)await rendezvous();return missionOwners.has(args[0])?{x:1}:null;}
      throw new Error(`first SQL no soportado: ${sql}`);
    },
    async run(){
      if(sql.startsWith("INSERT OR IGNORE INTO fleet_ids")){
        const [inboxId,missionId]=args;
        if(!mappings.has(inboxId)&&!missionOwners.has(missionId)){mappings.set(inboxId,missionId);missionOwners.set(missionId,inboxId);}
        return {meta:{changes:mappings.get(inboxId)===missionId?1:0}};
      }
      if(sql.startsWith("UPDATE fleet_ids SET")){const [missionId,,inboxId]=args;if(!missionOwners.has(missionId)){mappings.set(inboxId,missionId);missionOwners.set(missionId,inboxId);}return{meta:{}};}
      throw new Error(`run SQL no soportado: ${sql}`);
    }
  }}}}};
  return{DB,mappings};
}

test("dos repartos concurrentes obtienen ids distintos y mappings confirmados",async()=>{
  const {DB,mappings}=concurrentEnv(),context=vm.createContext({Number,String,Date,Math,__name:fn=>fn,FLEET_MISSION_SERIES_START:100001,
    fleetSubject:text=>String(text||"").split("\n")[0].trim(),inboxIdFromScreen:()=>"",addEvent:async()=>{}});
  vm.runInContext(["nextFreeFleetId","fleetSameEncargo","fleetMissionId"].map(grab).join("\n"),context);
  const [a,b]=await Promise.all([
    context.fleetMissionId({DB},{id:1115,text:"encargo concurrente A"}),
    context.fleetMissionId({DB},{id:1116,text:"encargo concurrente B"})
  ]);
  assert.notEqual(a,b,"cada encargo debe reintentar hasta reservar un mission_id propio");
  assert.equal(mappings.get(1115),a,"el id devuelto por A debe estar confirmado en fleet_ids");
  assert.equal(mappings.get(1116),b,"el id devuelto por B debe estar confirmado en fleet_ids");
});
