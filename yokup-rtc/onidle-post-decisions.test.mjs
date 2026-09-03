import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './src/index.js';
import {missionDayRange} from './src/mission-visible.js';

const HOUR=3_600_000;
const agentKey=value=>String(value||'').toLowerCase().replace(/macmini$/,'mini');
const baseBody={
  agent:'OraculoMacMini',machine:'admira-macmini',project_id:'yokup',project:'Yokup',project_slug:'YOKUP',
  question:'Ventana OnIDLE: elige una mejora.',
  options:['Mejora uno','Mejora dos','Mejora tres','↩ Volver atrás','✍️ Custom · Escribe la mejora que quieras a mano'],
  recommended:0,minutes:5,onidle:true,mission:'OnIdle horario'
};

function decisionEnv({now=Date.now(),missions=[],tasks=[],decisions=[],targetMissions=[],backlog=[],activeBatches=[],activeMissionTasks=[]}={}) {
  const state={missions:missions.map(x=>({source:'fleet',...x})),tasks,
    decisions:decisions.map(x=>({...x})),targetMissions,backlog,activeBatches,activeMissionTasks,displayRefs:new Map(),nextRef:0};
  const projects=[{id:'yokup',name:'Yokup',web:'www.yokup.com',status:'activo'}];
  const members=[{project_id:'yokup',kind:'agent',ref:'OraculoMacMini'},{project_id:'yokup',kind:'machine',ref:'admira-macmini'}];
  const stmt=(sql,args=[])=>({
    sql,args,bind(...next){return stmt(sql,next);},
    async first(){
      if (sql.includes("status='pending' AND deadline > ?")) return state.decisions.filter(d=>d.status==='pending'&&agentKey(d.agent)===agentKey(args[0])&&d.deadline>args[1]).sort((a,b)=>b.created_at-a.created_at)[0]||null;
      if (sql==='SELECT id,status,project,project_id,assignee,loc,source FROM tickets WHERE id=?') return state.targetMissions.find(row=>row.id===args[0])||null;
      if (sql.includes('FROM mission_batch_items WHERE (target_mission_id=? OR mission_id=?)')) return null;
      if (sql.includes('RETURNING next_value-? AS start_seq')) {const start=state.nextRef;state.nextRef+=Number(args[0]);return {start_seq:start};}
      return null;
    },
    async all(){
      if (sql.includes("FROM tickets WHERE ")&&sql.includes("status IN ('open','in_progress','unconcluded')")) return {results:state.missions};
      if (sql.includes('FROM mission_tasks m JOIN tickets t')&&sql.includes("m.status IN ('in_progress'")) return {results:state.tasks};
      if (sql.includes("FROM decisions WHERE status='pending'")) return {results:state.decisions.filter(d=>d.status==='pending')};
      if (sql.includes('AND mission=? AND created_at>=? AND created_at<?')) return {results:state.decisions.filter(d=>d.mission===args[0]&&d.created_at>=args[1]&&d.created_at<args[2]).map(d=>({agent:d.agent,machine:d.machine}))};
      if (sql.includes('SELECT DISTINCT b.id,b.agent,b.machine FROM mission_batches')) return {results:[]};
      if (sql.startsWith('SELECT id,subject,status,priority,assignee,loc,project,project_id,created_at,updated_at FROM tickets')) return {results:state.backlog.filter(row=>
        !['resolved','cancelled','closed'].includes(String(row.status).toLowerCase())&&
        (row.project_id===args[0]||(!row.project_id&&String(row.project).toLowerCase()===String(args[1]).toLowerCase())))};
      if (sql.startsWith('SELECT agent,machine,project,options,option_targets FROM decisions WHERE mission=')) return {results:state.decisions.filter(row=>row.mission===args[0]&&(row.project===args[1]||String(row.project).toLowerCase()===String(args[2]).toLowerCase())&&!row.parent_decision)};
      if (sql.startsWith('SELECT active_mission_id,agent,machine,project_id FROM mission_batches')) return {results:state.activeBatches};
      if (sql.startsWith('SELECT DISTINCT m.mission_id FROM mission_tasks m JOIN tickets t')) return {results:state.activeMissionTasks.map(mission_id=>({mission_id}))};
      if (sql==='SELECT * FROM projects') return {results:projects};
      if (sql==='SELECT project_id,kind,ref FROM project_members') return {results:members};
      if (sql.includes('SELECT id,created_at FROM decisions WHERE replace(lower(agent)')) return {results:state.decisions.filter(d=>agentKey(d.agent)===agentKey(args[0])&&!d.parent_decision&&d.created_at>args[1]).sort((a,b)=>b.created_at-a.created_at)};
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

test('GET proposals usa el backlog global del proyecto y excluye usadas/activas globales',async()=>{
  const fresh=Date.now()-60_000;
  const decisions=[{id:'DEC-used',agent:'NeoMini',machine:'otro-equipo',project:'yokup',mission:'OnIdle horario',status:'decided',
    options:JSON.stringify(['Título usado','Otra histórica','Tercera histórica','↩ Volver atrás','✍️ Custom · Escribe la mejora que quieras a mano']),
    option_targets:JSON.stringify([{target_mission_id:'MIS-USED'},null,null,null,null]),created_at:1}];
  const common={status:'open',priority:'normal',assignee:'',loc:'',project:'yokup',project_id:'yokup'};
  const backlog=[
    {...common,id:'MIS-USED',subject:'Aunque cambió título',created_at:1},
    {...common,id:'MIS-TITLE',subject:'Título usado',created_at:2},
    {...common,id:'MIS-ACTIVE',subject:'Activa por batch',created_at:3},
    {...common,id:'MIS-1',subject:'Reducir /uno de 10 pasos a 5 y verificar 5',priority:'high',created_at:4,updated_at:fresh},
    {...common,id:'MIS-2',subject:'Corregir API /dos: 2 errores y verificar 0',assignee:'NeoMini',loc:'otro-equipo',created_at:5,updated_at:fresh},
    {...common,id:'MIS-FOREIGN',subject:'No pertenece al proyecto',project_id:'otro',project:'Otro',priority:'high',created_at:1},
    {...common,id:'MIS-3',subject:'Completar sitemap: 7 rutas de 9 y verificar 9',project_id:'',project:'Yokup',created_at:6,updated_at:fresh}
  ];
  const {env}=decisionEnv({decisions,backlog,activeBatches:[{active_mission_id:'MIS-ACTIVE',agent:'NeoMini',machine:'otro-equipo',project_id:'yokup'}]});
  const response=await worker.fetch(new Request('https://api.yokup.com/fleet/onidle-proposals?agent=OraculoMacMini&machine=admira-macmini&project_id=yokup'),env,{});
  const text=await response.text();
  assert.equal(response.status,200,text);
  assert.match(response.headers.get('content-type'),/application\/x-ndjson/);
  const rows=text.trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.map(row=>row.target_mission_id),['MIS-1','MIS-2','MIS-3']);
  assert.equal(rows.length,3);
});

test('GET proposals falla cerrado si el backlog fundado no alcanza tres',async()=>{
  const fresh=Date.now()-60_000;
  const common={status:'open',priority:'normal',assignee:'OraculoMacMini',loc:'admira-macmini',project:'yokup',project_id:'yokup'};
  const {env}=decisionEnv({backlog:[
    {...common,id:'MIS-1',subject:'Reducir /uno de 10 pasos a 5 y verificar 5',updated_at:fresh},
    {...common,id:'MIS-2',subject:'Corregir API /dos: 2 errores y verificar 0',updated_at:fresh}
  ]});
  const response=await worker.fetch(new Request('https://api.yokup.com/fleet/onidle-proposals?agent=OraculoMacMini&machine=admira-macmini&project_id=yokup'),env,{});
  const body=await response.json();
  assert.equal(response.status,409,JSON.stringify(body));
  assert.equal(body.code,'onidle_proposals_insufficient');
  assert.equal(body.available,2); assert.equal(body.action,'investigate');
});

test('GET proposals no fabrica opciones con backlog vacío',async()=>{
  const {env}=decisionEnv();
  const response=await worker.fetch(new Request('https://api.yokup.com/fleet/onidle-proposals?agent=OraculoMacMini&machine=admira-macmini&project_id=yokup'),env,{});
  const body=await response.json();
  assert.equal(response.status,409); assert.equal(body.available,0);
  assert.equal(body.action,'investigate');
});

test('GET proposals excluye tareas activas y no rellena el hueco',async()=>{
  const fresh=Date.now()-60_000;
  const common={status:'open',priority:'high',assignee:'',loc:'',project:'yokup',project_id:'yokup'};
  const {env}=decisionEnv({backlog:[
    {...common,id:'MIS-ACT',subject:'No debe salir',created_at:1},
    {...common,id:'INC-OK',subject:'Reducir /status de 216 KB a 80 KB y verificar peso',created_at:2,updated_at:fresh}
  ],activeMissionTasks:['MIS-ACT']});
  const response=await worker.fetch(new Request('https://api.yokup.com/fleet/onidle-proposals?agent=OraculoMacMini&machine=admira-macmini&project_id=yokup'),env,{});
  const body=await response.json();
  assert.equal(response.status,409); assert.equal(body.available,1);
  assert.equal(body.action,'investigate');
});

test('GET proposals rechaza evidencia de hace 65 horas aunque el título sea medible',async()=>{
  const old=Date.now()-65*HOUR,common={status:'open',priority:'high',project:'yokup',project_id:'yokup'};
  const {env}=decisionEnv({backlog:[
    {...common,id:'MIS-1',subject:'Rehacer /404: 1140 bytes y verificar salida',updated_at:old},
    {...common,id:'MIS-2',subject:'Completar sitemap: 7 rutas de 9 y verificar 9',updated_at:old},
    {...common,id:'MIS-3',subject:'Reducir /status de 216 KB a 80 KB y verificar peso',updated_at:old}
  ]});
  const response=await worker.fetch(new Request('https://api.yokup.com/fleet/onidle-proposals?agent=OraculoMacMini&machine=admira-macmini&project_id=yokup'),env,{});
  const body=await response.json();
  assert.equal(response.status,409); assert.equal(body.available,0);
  assert.equal(body.rejected.stale,3);
});

test('GET proposals exige project_id exacto aunque agent+machine tengan una sola asignación',async()=>{
  const {env}=decisionEnv();
  const response=await worker.fetch(new Request('https://api.yokup.com/fleet/onidle-proposals?agent=OraculoMacMini&machine=admira-macmini'),env,{});
  const body=await response.json();
  assert.equal(response.status,400); assert.equal(body.code,'exact_project_required');
});

test('OnIdle 1→2 abre inmediatamente tras cerrar la anterior',async()=>{
  const now=Date.UTC(2026,7,7,10);
  const {env,state}=decisionEnv({now,decisions:[{id:'DEC-1',agent:'OraculoMacMini',machine:'admira-macmini',mission:'OnIdle horario',status:'decided',created_at:now-5*60_000,deadline:now-1}]});
  const original=Date.now;Date.now=()=>now;
  try {
    const result=await response(env);
    assert.equal(result.status,200,JSON.stringify(result.json));
    assert.equal(result.json.ok,true);
    assert.equal(state.decisions.at(-1).agent,'OraculoMacMini');
  }
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
    ['decisión viva',{decisions:[{id:'DEC-live',agent:'OraculoMacMini',machine:'admira-macmini',project:'yokup',mission:'OnIdle horario',surface:'highscore',options:JSON.stringify(baseBody.options),status:'pending',created_at:now-1000,deadline:now+60_000}]},'live_decision'],
    ['misión fresca',{missions:[{id:'FLT-fresh',assignee:'OraculoMacMini',loc:'admira-macmini',status:'in_progress',created_at:fresh}]},'active_mission'],
    ['tarea fresca',{tasks:[{mission_id:'FLT-fresh',code:'a',assignee:'OraculoMacMini',loc:'admira-macmini',status:'in_progress',started_at:fresh}]},'active_task']
  ]) {
    const {env}=decisionEnv({now,...input});const original=Date.now;Date.now=()=>now;
    try {const result=await response(env);assert.equal(result.status,409,label);assert.equal(result.json.error,'onidle_blocked',label);assert.equal(result.json.code,reason,label);}
    finally {Date.now=original;}
  }
});

test('OnIdle aísla misión y tarea por familia más máquina, no por actividad ajena',async()=>{
  const now=Date.UTC(2026,7,7,10),fresh=now-HOUR+1,original=Date.now;Date.now=()=>now;
  try {
    for (const [label,input] of [
      ['Trinity en MBP14',{missions:[{id:'DCL-trinity',assignee:'TrinityMBP14',loc:'MacBookProNegro14',status:'in_progress',created_at:fresh}]}],
      ['Oraculo en otro equipo',{missions:[{id:'DCL-oraculo16',assignee:'OraculoMBP16',loc:'MacBookPro16',status:'in_progress',created_at:fresh}]}],
      ['Oraculo sin máquina',{missions:[{id:'DCL-oraculo-unknown',assignee:'Oraculo',loc:'',status:'in_progress',created_at:fresh}]}],
      ['tarea de Trinity',{tasks:[{mission_id:'DCL-trinity',code:'a',assignee:'TrinityMBP14',loc:'MacBookProNegro14',status:'in_progress',started_at:fresh}]}]
    ]) {
      const {env}=decisionEnv({now,...input}),result=await response(env);
      assert.equal(result.status,200,label+': '+JSON.stringify(result.json));
      assert.equal(result.json.ok,true,label);
    }
    let box=decisionEnv({now,missions:[{id:'DCL-own',assignee:'OraculoMacMini',loc:'Mac Mini',status:'in_progress',created_at:fresh}]});
    let result=await response(box.env);assert.equal(result.status,409);assert.equal(result.json.code,'active_mission');
    box=decisionEnv({now,tasks:[{mission_id:'DCL-own',code:'a',assignee:'SubOraculoMini',loc:'admira-macmini',status:'in_progress',started_at:fresh}]});
    result=await response(box.env);assert.equal(result.status,409);assert.equal(result.json.code,'active_task');
  } finally {Date.now=original;}
});

test('GET onidle-state no atribuye a OraculoMini la misión activa de TrinityMBP14',async()=>{
  const now=Date.UTC(2026,7,7,10),fresh=now-HOUR+1,original=Date.now;Date.now=()=>now;
  const request=new Request('https://api.yokup.com/fleet/onidle-state?agent=OraculoMini&machine=admira-macmini');
  try {
    let box=decisionEnv({now,missions:[{id:'DCL-msrsw0wrfe5n',assignee:'TrinityMBP14',loc:'MacBookProNegro14',status:'in_progress',created_at:fresh}]});
    let result=await worker.fetch(request,box.env,{}),body=await result.json();
    assert.equal(result.status,200);assert.equal(body.can_open,true);assert.equal(body.blockers.missions,0);
    box=decisionEnv({now,missions:[{id:'DCL-own',assignee:'OraculoMacMini',loc:'Mac Mini',status:'in_progress',created_at:fresh}]});
    result=await worker.fetch(request,box.env,{});body=await result.json();
    assert.equal(result.status,200);assert.equal(body.can_open,false);assert.equal(body.reason,'active_mission');assert.equal(body.blockers.missions,1);
  } finally {Date.now=original;}
});

test('GET onidle-state no atribuye prefijos hostiles a una máquina canónica',async()=>{
  const now=Date.UTC(2026,7,7,10),fresh=now-HOUR+1,original=Date.now;Date.now=()=>now;
  const request=new Request('https://api.yokup.com/fleet/onidle-state?agent=OraculoMini&machine=admira-macmini');
  try {
    for (const loc of ['MacMiniature','macmini-evil','MacBook Pro 140','macbookpro14evil','ThinkStationery']) {
      const box=decisionEnv({now,missions:[{id:'DCL-hostile',assignee:'OraculoMini',loc,status:'in_progress',created_at:fresh}]});
      const result=await worker.fetch(request,box.env,{}),body=await result.json();
      assert.equal(result.status,200,loc);
      assert.equal(body.can_open,true,loc);
      assert.equal(body.blockers.missions,0,loc);
    }
  } finally {Date.now=original;}
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
  const now=Date.UTC(2026,7,7,10),prior={id:'DEC-prior',agent:'OraculoMacMini',machine:'admira-macmini',mission:'otro',status:'pending',created_at:now-60_000,deadline:now+240_000};
  const original=Date.now;Date.now=()=>now;
  try {
    // Sin ventana viva por medio: si la hubiera, el tope saltaria ANTES que el aviso
    // de sesion y esta prueba dejaria de comprobar lo que dice comprobar.
    let box=decisionEnv({now});
    let result=await response(box.env,{...baseBody,onidle:false,mission:'manual',manual:true});
    assert.equal(result.status,401);assert.equal(result.json.code,'manual_needs_session');
    box=decisionEnv({now,decisions:[prior]});
    // Con una ventana VIVA por medio, quien rechaza es el guarda del reloj vivo y da
    // la razon exacta —ya tienes una abierta— en vez del generico del tope. Sigue
    // siendo 409: una automatica no se cuela mientras haya una esperando respuesta.
    result=await response(box.env,{...baseBody,onidle:false,mission:'automática'});
    assert.equal(result.status,409);assert.equal(result.json.error,'live_decision');
    box=decisionEnv({now});
    result=await response(box.env,{...baseBody,options:baseBody.options.slice(0,4)});
    assert.equal(result.status,400);assert.match(result.json.error,/3 mejoras/);
    box=decisionEnv({now});
    result=await response(box.env,{...baseBody,options:[baseBody.options[0],baseBody.options[0],...baseBody.options.slice(2)]});
    assert.equal(result.status,400);assert.equal(result.json.code,'invalid_onidle_options');
  } finally {Date.now=original;}
});
