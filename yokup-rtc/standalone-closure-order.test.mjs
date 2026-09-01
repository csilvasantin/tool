import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './src/index.js';

const FINAL_IMAGE='https://api.yokup.com/media/fleet/standalone.png';

function standaloneEnv() {
  const now=Date.now();
  const state={
    ticket:{id:'FLT-1243',source:'fleet',role:'standalone-task',status:'in_progress',assignee:'OraculoMacMini',loc:'Mac Mini',screen:'OraculoMacMini·Mac Mini #1243',created_at:now-60_000,
      proof_image:null,proof_kind:null,live_shot:'https://api.yokup.com/media/fleet/process.png',live_at:now-30_000,live_kind:'process',live_surface:'desktop',live_context:'request'},
    tasks:new Map([['a',{mission_id:'FLT-1243',code:'a',title:'Tarea standalone',status:'in_progress',owner:'SubOraculoMacMini',report:null,image:null,image_kind:null,created_at:now-60_000,updated_at:now-30_000}]]),
    events:[],inboxStatus:'in_progress',displayRefs:new Map(),nextRef:0
  };
  const stmt=(sql,args=[])=>({
    sql,args,bind(...next){return stmt(sql,next);},
    async first(){
      if (sql.includes('SELECT id,source,proof_image,status,assignee,loc,created_at,live_shot')) return {...state.ticket};
      if (sql.includes('SELECT id,assignee,loc,status,source,screen,created_at,proof_image,proof_kind')) return {...state.ticket};
      if (sql.includes('SELECT id,source,status,assignee,loc,screen FROM tickets')) return {...state.ticket};
      if (sql.includes('SELECT id,source,status,assignee,loc,screen,role FROM tickets')) return {...state.ticket};
      if (sql.includes('SELECT assignee,loc FROM tickets')) return {assignee:state.ticket.assignee,loc:state.ticket.loc};
      if (sql.includes('SELECT proof_image,proof_kind FROM tickets')) return {proof_image:state.ticket.proof_image,proof_kind:state.ticket.proof_kind};
      if (sql.includes('SELECT proof_image FROM tickets')) return {proof_image:state.ticket.proof_image};
      if (sql.includes('SELECT * FROM mission_tasks WHERE mission_id=? AND code=?')) return state.tasks.get(args[1])||null;
      if (sql.includes("SELECT owner,report,image,image_kind FROM mission_tasks WHERE mission_id=? AND code='z1'")) return state.tasks.get('z1')||null;
      if (sql.includes("SELECT image FROM mission_tasks WHERE mission_id=? AND image_kind='final'")) return [...state.tasks.values()].reverse().find(x=>x.image_kind==='final'&&x.image)||null;
      if (sql.includes('SELECT inbox_id FROM fleet_ids')) return {inbox_id:1243};
      if (sql.includes('SELECT text FROM events')) return state.events.at(-1)||null;
      if (sql.includes('RETURNING next_value-? AS start_seq')) { const start=state.nextRef; state.nextRef+=Number(args[0]); return {start_seq:start}; }
      return null;
    },
    async all(){
      if (sql.includes('FROM mission_tasks WHERE mission_id=? ORDER BY code')) return {results:[...state.tasks.values()].map(x=>({...x})).sort((a,b)=>a.code.localeCompare(b.code))};
      if (sql.includes('SELECT entity_type,entity_key,display_ref FROM display_refs')) {
        return {results:args.slice(1).flatMap(key=>state.displayRefs.has(key)?[{entity_type:args[0],entity_key:key,display_ref:state.displayRefs.get(key)}]:[])};
      }
      if (sql.includes("SELECT 'objective' entity_type")) return {results:[]};
      return {results:[]};
    },
    async run(){
      // Convergencia de padres (FLT-1373): actualiza POR CONDICIÓN, no por clave, así
      // que el doble de D1 tiene que reconocerla antes que el update por código.
      if (sql.includes('length(code)=1') && sql.includes('h.code LIKE mission_tasks.code||')) {
        for (const t of state.tasks.values()) {
          if (String(t.code).length!==1 || t.status==='done') continue;
          const hijas=[...state.tasks.values()].filter(h=>String(h.code).length===2&&String(h.code)[0]===t.code);
          if (hijas.length && hijas.every(h=>h.status==='done')) { t.status='done'; t.updated_at=args[0]; }
        }
        return {meta:{changes:1}};
      }
      if (sql.startsWith('UPDATE mission_tasks SET status=')) {
        const task=state.tasks.get(args.at(-1));
        Object.assign(task,{status:args[0],report:args[1],owner:args[2],executor:args[3],image:args[4],image_kind:args[5],updated_at:args[9]});
      } else if (sql.startsWith("UPDATE tickets SET proof_image=?,proof_kind='final'")) {
        state.ticket.proof_image=args[0]; state.ticket.proof_kind='final';
      } else if (sql.startsWith('UPDATE tickets SET status=?, updated_at=')) {
        state.ticket.status=args[0];
      } else if (sql.startsWith("UPDATE tickets SET proof_image=?")) {
        state.ticket.proof_image=args[0]; state.ticket.proof_kind='final';
      } else if (sql.startsWith('INSERT INTO events')) {
        state.events.push({text:args[4],kind:args[2]});
      }
      return {meta:{changes:1}};
    }
  });
  const DB={
    async exec(){},prepare(sql){return stmt(sql);},
    async batch(statements){
      for (const item of statements) {
        const {sql,args}=item;
        if (sql.startsWith('INSERT OR IGNORE INTO display_refs')) state.displayRefs.set(args[1],args[5]);
        else if (sql.startsWith('INSERT INTO mission_tasks')) {
          state.tasks.set(args[1],{mission_id:args[0],code:args[1],title:args[2],status:'done',owner:args[4],executor:args[5],report:args[6],image:args[7],image_kind:args[8],created_at:args[9],updated_at:args[10]});
        } else if (sql.startsWith("UPDATE tickets SET status='resolved'")) {
          state.ticket.status='resolved'; state.ticket.proof_image=args[1]; state.ticket.proof_kind='final';
        } else if (sql.startsWith("UPDATE tickets SET proof_image=?,proof_kind='final',agent_runtime=")) {
          state.ticket.proof_image=args[0]; state.ticket.proof_kind='final';
          state.ticket.agent_runtime=args[1]||state.ticket.agent_runtime;
          state.ticket.agent_host=args[2]||state.ticket.agent_host;
          state.ticket.points_end??=args[3]; state.ticket.points_start??=args[4];
        } else if (sql.startsWith('INSERT INTO events')) state.events.push({text:args[4],kind:args[2]});
      }
      return statements.map(()=>({meta:{changes:1}}));
    }
  };
  const env={DB,MEDIA:{async head(){return {httpMetadata:{contentType:'image/png'}};}},TELEGRAM:{async fetch(request){
    if (request.url.includes('bulk-status')) state.inboxStatus=(await request.json()).status;
    return new Response('{}',{status:200});
  }}};
  return {env,state};
}

function taskRequest(overrides={}){
  return new Request('https://api.yokup.com/fleet/task-status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mission:'FLT-1243',code:'a',status:'done',owner:'SubOraculoMacMini',report:'Tarea verificada',image:FINAL_IMAGE,...overrides})});
}
function informeRequest(){
  return new Request('https://api.yokup.com/fleet/informe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mission:'FLT-1243',owner:'InfraOraculoMacMini',report:'Informe final standalone',image:FINAL_IMAGE,runtime:'Codex',host:'app'})});
}

function assertCanonical(state){
  assert.equal(state.tasks.get('a')?.status,'done','A debe quedar done');
  assert.equal(state.tasks.get('z1')?.status,'done','debe existir z1/informe');
  assert.equal(state.tasks.get('z1')?.report,'Informe final standalone');
  assert.equal(state.ticket.status,'resolved');
  assert.equal(state.ticket.proof_image,FINAL_IMAGE);
  assert.equal(state.ticket.proof_kind,'final');
  assert.equal(state.inboxStatus,'done');
}

async function ok(response,label){
  const body=await response.json();
  assert.equal(response.status,200,`${label}: ${JSON.stringify(body)}`);
  assert.equal(body.ok,true,label);
  return body;
}

test('standalone converge si task-status A done precede al informe',async()=>{
  const {env,state}=standaloneEnv();
  await ok(await worker.fetch(taskRequest(),env,{}),'task-status inicial');
  await ok(await worker.fetch(informeRequest(),env,{}),'informe posterior');
  assertCanonical(state);
  const retry=await ok(await worker.fetch(taskRequest(),env,{}),'retry task-status');
  assert.equal(retry.applied,false,'el retry exacto no vuelve a escribir A');
  await ok(await worker.fetch(informeRequest(),env,{}),'retry informe');
  assertCanonical(state);
});

test('standalone converge si informe precede a task-status A done',async()=>{
  const {env,state}=standaloneEnv();
  await ok(await worker.fetch(informeRequest(),env,{}),'informe inicial');
  await ok(await worker.fetch(taskRequest(),env,{}),'task-status posterior');
  assertCanonical(state);
  await ok(await worker.fetch(informeRequest(),env,{}),'retry informe');
  const retry=await ok(await worker.fetch(taskRequest(),env,{}),'retry task-status');
  assert.equal(retry.applied,false,'el retry exacto no vuelve a escribir A');
  assertCanonical(state);
});

test('standalone resuelto rechaza cualquier cambio y conserva el cierre',async()=>{
  const {env,state}=standaloneEnv();
  await ok(await worker.fetch(taskRequest(),env,{}),'task-status inicial');
  await ok(await worker.fetch(informeRequest(),env,{}),'informe posterior');
  assertCanonical(state);
  const before=structuredClone({ticket:state.ticket,tasks:[...state.tasks.entries()]});
  for (const [label,overrides] of [
    ['informe distinto',{report:'Informe de tarea alterado'}],
    ['prueba distinta',{image:'https://api.yokup.com/media/fleet/otra.png'}],
    ['estado distinto',{status:'in_progress'}],
    ['tarea distinta',{code:'b'}]
  ]) {
    const response=await worker.fetch(taskRequest(overrides),env,{});
    const body=await response.json();
    assert.equal(response.status,409,label);
    assert.equal(body.code,'mission_closed',label);
    assert.equal(body.applied,false,label);
  }
  assert.deepEqual({ticket:state.ticket,tasks:[...state.tasks.entries()]},before);
  assertCanonical(state);
});

test('árbol fleet: task-status resuelve antes y /fleet/informe completa z1 una sola vez',async()=>{
  const {env,state}=standaloneEnv();
  state.ticket.role='status-web';
  state.tasks=new Map([
    ['a',{mission_id:'FLT-1243',code:'a',title:'A',status:'done',owner:'SubOraculoMacMini',report:'A hecha',image:null,image_kind:'task',created_at:1,updated_at:1}],
    ['b',{mission_id:'FLT-1243',code:'b',title:'B',status:'done',owner:'SubOraculoMacMini',report:'B hecha',image:null,image_kind:'task',created_at:1,updated_at:2}],
    ['c',{mission_id:'FLT-1243',code:'c',title:'C',status:'in_progress',owner:'InfraOraculoMacMini',report:null,image:null,image_kind:null,created_at:1,updated_at:3}]
  ]);
  const task=await ok(await worker.fetch(taskRequest({code:'c',owner:'InfraOraculoMacMini'}),env,{}),'task-status C');
  assert.equal(task.fleet.status,'resolved');
  assert.equal(state.ticket.status,'resolved');
  assert.equal(state.tasks.has('z1'),false,'el auto-reconcile todavía no inventa informe');

  const repaired=await ok(await worker.fetch(informeRequest(),env,{}),'informe tras auto-resolve');
  assert.equal(repaired.repaired_auto_resolved,true);
  assertCanonical(state);
  assert.equal(state.ticket.agent_runtime,'Codex');
  assert.equal(state.ticket.agent_host,'app');
  const events=state.events.length,pointsEnd=state.ticket.points_end;

  const retry=await ok(await worker.fetch(informeRequest(),env,{}),'retry informe exacto');
  assert.equal(retry.resumed,true);
  assert.equal(retry.repaired_auto_resolved,undefined);
  assert.equal(state.events.length,events,'el retry no duplica eventos de cierre');
  assert.equal(state.ticket.points_end,pointsEnd,'el retry no recalcula ni duplica puntos');
  assertCanonical(state);
});

test('árbol fleet auto-resuelto no acepta otra prueba ni muta un cierre con z1',async()=>{
  const {env,state}=standaloneEnv();
  state.ticket.role='status-web'; state.ticket.status='resolved';
  state.ticket.proof_image=FINAL_IMAGE; state.ticket.proof_kind='final';
  state.tasks.set('z1',{mission_id:'FLT-1243',code:'z1',title:'Informe',status:'done',owner:'OraculoMacMini',
    report:'Informe final standalone',image:FINAL_IMAGE,image_kind:'final',created_at:1,updated_at:2});
  const before=structuredClone({ticket:state.ticket,tasks:[...state.tasks.entries()],events:state.events});
  const changed=new Request('https://api.yokup.com/fleet/informe',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({mission:'FLT-1243',owner:'InfraOraculoMacMini',report:'Informe final standalone',
      image:'https://api.yokup.com/media/fleet/otra.png',runtime:'OpenCode',host:'cli'})});
  const response=await worker.fetch(changed,env,{}),body=await response.json();
  assert.equal(response.status,409);
  assert.equal(body.code,'mission_closed');
  assert.equal(body.applied,false);
  assert.deepEqual({ticket:state.ticket,tasks:[...state.tasks.entries()],events:state.events},before);
});
