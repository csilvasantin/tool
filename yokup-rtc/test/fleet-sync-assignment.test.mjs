import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {DatabaseSync} from "node:sqlite";
import {readFile} from "node:fs/promises";
import {baseAgentIdentity,parseAgentIdentity,reportAgentIdentity,scopedAgentIdentity,sameAgentFamily} from "../src/agent-identity.js";

const source=await readFile(new URL("../src/index.js",import.meta.url),"utf8");
const grab=name=>{
  const re=new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}\\n__name\\(${name}, "${name}"\\);`),m=re.exec(source);
  assert.ok(m,`no se pudo extraer ${name}`);return m[0];
};

function harness(){
  const db=new DatabaseSync(":memory:");
  db.exec("CREATE TABLE tickets(id TEXT PRIMARY KEY,screen TEXT,subject TEXT,loc TEXT,project TEXT,source TEXT,role TEXT,status TEXT,assignee TEXT,proof_image TEXT,resolved_at INTEGER,updated_at INTEGER,project_id TEXT)");
  db.exec("CREATE TABLE fleet_ids(inbox_id INTEGER PRIMARY KEY,mission_id TEXT UNIQUE,created_at INTEGER)");
  db.exec("CREATE TABLE mission_tasks(mission_id TEXT,code TEXT,title TEXT,status TEXT,owner TEXT,report TEXT,image TEXT,created_at INTEGER,updated_at INTEGER,PRIMARY KEY(mission_id,code))");
  db.exec("CREATE TABLE project_members(project_id TEXT,kind TEXT,ref TEXT)");
  const DB={prepare(sql){const stmt=db.prepare(sql);return{bind(...args){return{first:async()=>stmt.get(...args)||null,run:async()=>({meta:stmt.run(...args)}),all:async()=>({results:stmt.all(...args)})}},first:async()=>stmt.get()||null,all:async()=>({results:stmt.all()})}}};
  const listMissionTasks=async(_env,id)=>DB.prepare("SELECT * FROM mission_tasks WHERE mission_id=? ORDER BY code").bind(id).all().then(x=>x.results);
  const context=vm.createContext({Map,String,Number,Date,RegExp,Math,baseAgentIdentity,parseAgentIdentity,reportAgentIdentity,scopedAgentIdentity,sameAgentFamily,listMissionTasks,addEvent:async()=>{},__name:(fn)=>fn});
  vm.runInContext(["fleetSubject","inboxIdFromScreen","nextFreeFleetId","fleetSameEncargo","fleetMissionId","fleetAssignment","resolveFleetAssignment","fleetScreen","fleetMainTasks","ensureFleetMainTasks","reconcileFleetTicket"].map(grab).join("\n"),context);
  return{db,env:{DB},F:context};
}

const row=(db,id)=>db.prepare("SELECT * FROM tickets WHERE id=?").get(id);
const rows=(db,id)=>db.prepare("SELECT code,title,status,owner,report FROM mission_tasks WHERE mission_id=? ORDER BY code").all(id);

test("#1112 repara FLT-1140 por procedencia sin tocar FLT-1112 y queda idempotente",async()=>{
  const {db,env,F}=harness(),text="[PRIORIDAD ABSOLUTA] Yokup: corregir en /tareas la ausencia de retratos de agentes";
  db.prepare("INSERT INTO tickets VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run("FLT-1112","otra #999","Misión ajena","MacBook Pro 16","otro","fleet","otro-role","resolved","NeoMBP16","proof",7,9,"otro");
  db.prepare("INSERT INTO tickets VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run("FLT-1140","NeoMBP16·MacBook Pro 16 #1112",text,"MacBook Pro 16","yokup","fleet","otro-role","in_progress","NeoMBP16",null,null,10,"yokup");
  db.prepare("INSERT INTO fleet_ids VALUES(?,?,?)").run(1112,"FLT-1140",1);
  for(const task of [["a","Revisar ids","done","SubOraculoMini","hecho"],["b","Asignar id","done","InfraOraculoMini","verificado"],["a1","Plan de Trinity","pending","InfraTrinityMBP16",null],["b1","Ejecutar Trinity","pending","SubTrinityMBP16",null]]){
    db.prepare("INSERT INTO mission_tasks VALUES(?,?,?,?,?,?,?,?,?)").run("FLT-1140",...task,null,1,1);
  }
  db.prepare("INSERT INTO project_members VALUES('yokup','agent','OraculoMacMini'),('yokup','agent','NeoMini'),('yokup','machine','admira-macmini'),('yokup','machine','MacBookProNegro14')").run();
  const foreign=JSON.stringify(row(db,"FLT-1112")),it={id:1112,text,target_persona:"Oraculo",target_machine:null,project_id:"yokup",from_name:"yokup-misiones"};
  assert.equal(await F.fleetMissionId(env,it),"FLT-1140");
  const assignment=await F.resolveFleetAssignment(env,it);assert.equal(assignment.assignee,"OraculoMacMini");assert.equal(assignment.loc,"admira-macmini");
  const first=await F.reconcileFleetTicket(env,"FLT-1140",row(db,"FLT-1140"),it,assignment,"in_progress",20);
  assert.equal(first.changed,true);assert.equal(first.project,"yokup");
  assert.equal(JSON.stringify(row(db,"FLT-1112")),foreign);
  assert.equal(row(db,"FLT-1140").assignee,"OraculoMacMini");assert.equal(row(db,"FLT-1140").loc,"admira-macmini");
  assert.equal(row(db,"FLT-1140").project,"yokup");assert.equal(row(db,"FLT-1140").source,"fleet");assert.equal(row(db,"FLT-1140").role,"yokup-misiones");
  assert.deepEqual(rows(db,"FLT-1140").map(x=>x.code),["a","b","c"]);
  assert.deepEqual(rows(db,"FLT-1140").map(x=>x.owner),["SubOraculoMacMini","SubOraculoMacMini","InfraOraculoMacMini"]);
  assert.deepEqual(rows(db,"FLT-1140").map(x=>x.report),["hecho","verificado",null]);
  const before=JSON.stringify({ticket:row(db,"FLT-1140"),tasks:rows(db,"FLT-1140")});
  assert.equal(await F.fleetMissionId(env,it),"FLT-1140");const second=await F.reconcileFleetTicket(env,"FLT-1140",row(db,"FLT-1140"),it,assignment,"in_progress",30);assert.equal(second.changed,false);
  assert.equal(JSON.stringify({ticket:row(db,"FLT-1140"),tasks:rows(db,"FLT-1140")}),before);
});

test("mapping sin procedencia se reasigna y deja ambos tickets ajenos intactos",async()=>{
  const {db,env,F}=harness(),it={id:1112,text:"Yokup: encargo nuevo",target_persona:"Oraculo",target_machine:"admira-macmini"};
  db.prepare("INSERT INTO tickets VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run("FLT-1112","x #9",it.text,"x","otro","incident","r","resolved","Neo",null,1,1,"otro");
  db.prepare("INSERT INTO tickets VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run("FLT-1140","x #8",it.text,"x","otro","incident","r","open","Trinity",null,null,1,"otro");
  db.prepare("INSERT INTO fleet_ids VALUES(?,?,?)").run(1112,"FLT-1140",1);
  const before=JSON.stringify(db.prepare("SELECT * FROM tickets ORDER BY id").all()),id=await F.fleetMissionId(env,it);
  assert.equal(id,"FLT-1141");assert.equal(JSON.stringify(db.prepare("SELECT * FROM tickets ORDER BY id").all()),before);
  assert.equal(db.prepare("SELECT mission_id FROM fleet_ids WHERE inbox_id=1112").get().mission_id,"FLT-1141");
});

test("fleetSync usa feed público y fallback censado, nunca el privado 401",()=>{
  const start=source.indexOf("async function fleetSync(env)"),block=source.slice(start,source.indexOf("__name(fleetSync",start));
  assert.match(source,/FLEET_INBOX = "https:\/\/admira-telegram[^\"]+\/api\/public\/inbox\?limit=200"/);
  assert.doesNotMatch(source,/FLEET_INBOX = [^\n]+\/api\/bot-inbox/);
  assert.match(block,/const assignment = await resolveFleetAssignment\(env, it\)/);
  const helper=source.slice(source.indexOf("async function reconcileFleetTicket"),source.indexOf("__name(reconcileFleetTicket"));assert.match(helper,/assignment\.complete/);
  assert.match(block,/reconcileFleetTicket\(env, id, prev, it, assignment, st, now, standalone\)/);
});
