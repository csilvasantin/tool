import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './src/index.js';
import {missionDayRange} from './src/mission-visible.js';

const HOUR=3_600_000;
const baseBody={
  agent:'OraculoMacMini',machine:'admira-macmini',project_id:'yokup',project:'Yokup',project_slug:'YOKUP',
  question:'Ventana OnIDLE: elige una mejora.',
  options:['Mejora uno','Mejora dos','Mejora tres','↩ Volver atrás','✍️ Custom · Escribe la mejora que quieras a mano'],
  recommended:0,minutes:5,onidle:true,mission:'OnIdle horario'
};

function decisionEnv({now=Date.now(),missions=[],tasks=[],decisions=[],targetMissions=[]}={}) {
  const state={missions,tasks,decisions:decisions.map(x=>({...x})),targetMissions,displayRefs:new Map(),nextRef:0};
  const projects=[{id:'yokup',name:'Yokup',web:'www.yokup.com',status:'activo'}];
  const members=[{project_id:'yokup',kind:'agent',ref:'OraculoMacMini'},{project_id:'yokup',kind:'machine',ref:'admira-macmini'}];
  const stmt=(sql,args=[])=>({
    sql,args,bind(...next){return stmt(sql,next);},
    async first(){
      if (sql.includes("status='pending' AND deadline > ?")) return state.decisions.filter(d=>d.status==='pending'&&d.deadline>args[1]).sort((a,b)=>b.created_at-a.created_at)[0]||null;
      if (sql==='SELECT id,status,project,project_id,assignee,loc,source FROM tickets WHERE id=?') return state.targetMissions.find(row=>row.id===args[0])||null;
      if (sql.includes('FROM mission_batch_items WHERE (target_mission_id=? OR mission_id=?)')) return null;
      if (sql.includes('RETURNING next_value-? AS start_seq')) {const start=state.nextRef;state.nextRef+=Number(args[0]);return {start_seq:start};}
      return null;
    },
    async all(){
      if (sql.includes("FROM tickets WHERE status IN ('in_progress','unconcluded')")) return {results:state.missions};
      if (sql.includes('FROM mission_tasks m JOIN tickets t')&&sql.includes("m.status IN ('in_progress'")) return {results:state.tasks};
      if (sql.includes("FROM decisions WHERE status='pending' AND deadline>?")) return {results:state.decisions.filter(d=>d.status==='pending'&&d.deadline>args[0])};
      if (sql.includes('AND mission=? AND created_at>=? AND created_at<?')) return {results:state.decisions.filter(d=>d.mission===args[0]&&d.created_at>=args[1]&&d.created_at<args[2]).map(d=>({agent:d.agent,machine:d.machine}))};
      if (sql.includes('SELECT DISTINCT b.id,b.agent,b.machine FROM mission_batches')) return {results:[]};
      if (sql==='SELECT * FROM projects') return {results:projects};
      if (sql==='SELECT project_id,kind,ref FROM project_members') return {results:members};
      if (sql.includes('SELECT id,created_at FROM decisions WHERE lower(agent)=lower(?)')) return {results:state.decisions.filter(d=>d.agent.toLowerCase()===String(args[0]).toLowerCase()&&!d.parent_decision&&d.created_at>args[1]).sort((a,b)=>b.created_at-a.created_at)};
      if (sql.includes('SELECT entity_type,entity_key,display_ref FROM display_refs')) return {results:args.slice(1).flatMap(key=>state.displayRefs.has(key)?[{entity_type:args[0],entity_key:key,display_ref:state.displayRefs.get(key)}]:[])};
      if (sql.includes("SELECT 'objective' entity_type")) return {results:[]};
      return {results:[]};
    },
    async run(){
      if (sql.startsWith('INSERT INTO decisions')) state.decisions.push({id:args[0],machine:args[1],agent:args[2],status:'pending',created_at:args[7],deadline:args[8],mission:args[10],parent_decision:args[13],option_targets:args[15]});
      if (sql.startsWith('INSERT OR IGNORE INTO display_refs')) state.displayRefs.set(args[1],args[5]);
      return {meta:{changes:1}};
    }
  });
  const DB={async exec(){},prepare(sql){return stmt(sql);},async batch(items){for(const item of items)await item.run();return items.map(()=>({meta:{changes:1}}));}};
  return {env:{DB},state,now};
}

function post(env,body=baseBody){
  return worker.fetch(new Request('https://api.yokup.com/decisions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),env,{});
}

async function response(env,body){const r=await post(env,body),json=await r.json();return {status:r.status,json};}

test('OnIdle 1→2 abre inmediatamente tras cerrar la anterior',async()=>{
  const now=Date.UTC(2026,7,7,10);
  const {env}=decisionEnv({now,decisions:[{id:'DEC-1',agent:'OraculoMacMini',machine:'admira-macmini',mission:'OnIdle horario',status:'decided',created_at:now-5*60_000,deadline:now-1}]});
  const original=Date.now;Date.now=()=>now;
  try {const result=await response(env);assert.equal(result.status,200,JSON.stringify(result.json));assert.equal(result.json.ok,true);}
  finally {Date.now=original;}
});

test('POST persiste option_targets estructurado y rechaza ids inexistentes antes del INSERT',async()=>{
  const now=Date.UTC(2026,7,7,10),target={id:'INC-OMPEIL',status:'open',project:'yokup',project_id:'yokup',source:'onidle'};
  const original=Date.now;Date.now=()=>now;
  try {
    let box=decisionEnv({now,targetMissions:[target]});
    let result=await response(box.env,{...baseBody,option_targets:[{target_mission_id:target.id},null,null,null,null]});
    assert.equal(result.status,200,JSON.stringify(result.json));
    assert.deepEqual(JSON.parse(box.state.decisions.at(-1).option_targets),[{target_mission_id:target.id},null,null,null,null]);
    box=decisionEnv({now});
    result=await response(box.env,{...baseBody,option_targets:[{target_mission_id:'INC-NO-EXISTE'},null,null,null,null]});
    assert.equal(result.status,400); assert.equal(result.json.code,'invalid_option_target');
    assert.equal(box.state.decisions.length,0);
  } finally {Date.now=original;}
});

test('OnIdle mantiene bloqueos por decisión viva, misión fresca y tarea fresca',async()=>{
  const now=Date.UTC(2026,7,7,10),fresh=now-HOUR+1;
  for (const [label,input,reason] of [
    ['decisión viva',{decisions:[{id:'DEC-live',agent:'OraculoMacMini',machine:'admira-macmini',mission:'OnIdle horario',status:'pending',created_at:now-1000,deadline:now+60_000}]},'live_decision'],
    ['misión fresca',{missions:[{id:'FLT-fresh',assignee:'OraculoMacMini',loc:'admira-macmini',status:'in_progress',created_at:fresh}]},'active_mission'],
    ['tarea fresca',{tasks:[{mission_id:'FLT-fresh',code:'a',assignee:'OraculoMacMini',loc:'admira-macmini',status:'in_progress',started_at:fresh}]},'active_task']
  ]) {
    const {env}=decisionEnv({now,...input});const original=Date.now;Date.now=()=>now;
    try {const result=await response(env);assert.equal(result.status,409,label);assert.equal(result.json.error,'onidle_blocked',label);assert.equal(result.json.code,reason,label);}
    finally {Date.now=original;}
  }
});

test('OnIdle bloquea exactamente al consumir 8/8',async()=>{
  const now=Date.UTC(2026,7,7,10),range=missionDayRange('2026-08-07');
  const decisions=Array.from({length:8},(_,i)=>({id:`DEC-${i}`,agent:'OraculoMacMini',machine:'admira-macmini',mission:'OnIdle horario',status:'decided',created_at:range.start+i*60_000,deadline:range.start+i*60_000+300_000}));
  const {env}=decisionEnv({now,decisions}),original=Date.now;Date.now=()=>now;
  try {const result=await response(env);assert.equal(result.status,409);assert.equal(result.json.code,'daily_limit');assert.deepEqual(result.json.quota,{used:8,limit:8,remaining:0});}
  finally {Date.now=original;}
});

test('medianoche de Madrid reinicia el 8/8 y permite la nueva ventana',async()=>{
  const now=Date.UTC(2026,7,6,22,5),previous=now-10*60_000;
  const decisions=Array.from({length:8},(_,i)=>({id:`DEC-old-${i}`,agent:'OraculoMacMini',machine:'admira-macmini',mission:'OnIdle horario',status:'decided',created_at:previous-i*60_000,deadline:previous-i*60_000+300_000}));
  const {env}=decisionEnv({now,decisions}),original=Date.now;Date.now=()=>now;
  try {const result=await response(env);assert.equal(result.status,200,JSON.stringify(result.json));assert.equal(result.json.ok,true);}
  finally {Date.now=original;}
});

test('la excepción OnIdle no relaja decisiones manuales, automáticas ni formato',async()=>{
  const now=Date.UTC(2026,7,7,10),prior={id:'DEC-prior',agent:'OraculoMacMini',machine:'admira-macmini',mission:'otro',status:'decided',created_at:now-60_000,deadline:now-1};
  const original=Date.now;Date.now=()=>now;
  try {
    let box=decisionEnv({now,decisions:[prior]});
    let result=await response(box.env,{...baseBody,onidle:false,mission:'manual',manual:true});
    assert.equal(result.status,401);assert.equal(result.json.code,'manual_needs_session');
    box=decisionEnv({now,decisions:[prior]});
    result=await response(box.env,{...baseBody,onidle:false,mission:'automática'});
    assert.equal(result.status,409);assert.equal(result.json.error,'hourly_limit');
    box=decisionEnv({now});
    result=await response(box.env,{...baseBody,options:baseBody.options.slice(0,4)});
    assert.equal(result.status,400);assert.match(result.json.error,/3 mejoras/);
  } finally {Date.now=original;}
});
