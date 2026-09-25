// FLT-100941 (#4210): detección y clasificación; el despacho/cierre pertenece al Desk.
export const SENSOR_VERSION = 'incident-sensors-v1';
export const AGENT_OFFLINE_MS = 20 * 60000;
const ms = v => { const n=Number(v); return Number.isFinite(n) && n>0 ? (n<4102444800?n*1000:n) : 0; };
const canon = v => String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const run = (env,sql,...args) => env.DB.prepare(sql).bind(...args).run();
const all = async (env,sql,...args) => (await env.DB.prepare(sql).bind(...args).all()).results || [];
const first = (env,sql,...args) => env.DB.prepare(sql).bind(...args).first();

export function classifyIncident(signal) {
  if (signal.sensor==='player') return {channel:'campo',kind:'player_offline',reason:'Player DOOH sin señal de emisión; requiere diagnóstico del equipo y su red.'};
  if (signal.sensor==='agent') return {channel:'digital',kind:'agent_offline',reason:'Agente con trabajo en curso sin proceso verificado durante 20 minutos.'};
  throw new Error('unsupported_incident_sensor');
}
export function playerSignals(data,now=Date.now()) {
  if (!data || !Array.isArray(data.screens)) throw new Error('players_telemetry_invalid');
  const fetched=ms(data.fetched_at);
  if (!fetched || now-fetched>5*60000 || fetched>now+60000) throw new Error('players_telemetry_stale');
  return data.screens.filter(s=>s.screen && s.online===false && Number(s.age_seconds)>=300).map(s=>({
    sensor:'player',resource:String(s.screen),subject:'Pantalla sin señal de emisión',
    loc:s.locName || s.loc || '',age:s.age_seconds,
    latitude:s.latitude ?? s.lat ?? s.location?.latitude,
    longitude:s.longitude ?? s.lng ?? s.location?.longitude,
    detail:`Player ${s.screen}: ${s.age_seconds} segundos sin señal de emisión.`
  }));
}
export function agentSamples(data,assignments,now=Date.now()) {
  if (!data?.ok || !Array.isArray(data.presence) || !Array.isArray(data.control_machines)) throw new Error('agents_telemetry_invalid');
  const samples=[];
  for (const assignment of assignments) {
    const machine=canon(assignment.loc), owner=canon(assignment.assignee);
    const control=data.control_machines.find(m=>canon(m.machine)===machine);
    // Una máquina sin telemetría no demuestra la caída de un agente.
    if (!control || now-ms(control.updated)>2*60000 || ms(control.updated)>now+60000) continue;
    const slots=(control.slots||[]).filter(s=>canon(s.persona)+machine===owner || canon(s.persona)===owner);
    if (!slots.length) continue;
    const rows=data.presence.filter(r=>canon(r.machine)===machine && slots.some(s=>canon(s.persona)===canon(r.persona)));
    if (rows.some(r=>r.cli_paused===true || ['paused','stopped','disabled'].includes(r.operational_state))) continue;
    const verified=rows.filter(r=>(r.verified===true || r.verified===1) && r.source==='process_snapshot');
    const seen=Math.max(0,...verified.map(r=>ms(r.updated)).filter(t=>t<=now+60000));
    samples.push({resource:'agt:'+owner,owner:assignment.assignee,machine:assignment.loc,seen,
      healthy:seen>0 && now-seen<=2*60000});
  }
  return [...new Map(samples.map(s=>[s.resource,s])).values()];
}
export async function ensureSensorSchema(env) {
  await run(env,`CREATE TABLE IF NOT EXISTS incident_sensor_agents(resource TEXT PRIMARY KEY,last_seen INTEGER NOT NULL)`);
  await run(env,`CREATE TABLE IF NOT EXISTS incident_sensor_outbox(ticket_id TEXT PRIMARY KEY,resource TEXT NOT NULL,channel TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,desk_id TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`);
}
export async function queueSignal(env,ticketId,signal,now=Date.now()) {
  if (!ticketId) throw new Error('sensor_ticket_missing');
  const c=classifyIncident(signal);
  const payload={external_id:'rtc:'+ticketId,channel:c.channel,title:signal.subject,
    description:signal.detail,triage:c.reason,
    device:{id:(signal.sensor==='player'?'player:':'')+signal.resource,name:signal.resource,
      skill:signal.sensor==='player'?'player':'network',address:signal.loc||signal.machine||'Flota',
      ...(Number.isFinite(signal.latitude)&&Number.isFinite(signal.longitude)?{latitude:signal.latitude,longitude:signal.longitude}:{})}};
  await run(env,`INSERT INTO incident_sensor_outbox(ticket_id,resource,channel,kind,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(ticket_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at WHERE incident_sensor_outbox.status!='delivered'`,ticketId,signal.resource,c.channel,c.kind,JSON.stringify(payload),now,now);
}
export async function flushSensorOutbox(env,now=Date.now()) {
  const result={delivered:0,pending:0,errors:[]};
  const rows=await all(env,"SELECT * FROM incident_sensor_outbox WHERE status='pending' ORDER BY updated_at LIMIT 20");
  for (const row of rows) {
    const payload=JSON.parse(row.payload);
    let error='';
    const ticket=await first(env,'SELECT status FROM tickets WHERE id=?',row.ticket_id);
    if (!ticket || ['resolved','cancelled'].includes(ticket.status)) {
      await run(env,"UPDATE incident_sensor_outbox SET status='obsolete',updated_at=? WHERE ticket_id=?",now,row.ticket_id);
      continue;
    }
    if (row.channel==='campo' && (!Number.isFinite(payload.device.latitude)||!Number.isFinite(payload.device.longitude))) error='player_coordinates_required';
    else if (!env.ADMIRA_TELEGRAM_PANEL_KEY) error='desk_credentials_missing';
    else {
      try {
        const request=new Request('https://data.yokup.com/api/desk/incidents',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.ADMIRA_TELEGRAM_PANEL_KEY},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
        const response=await (env.INCIDENT_DESK ? env.INCIDENT_DESK.fetch(request) : fetch(request));
        const data=await response.json();
        if (!response.ok || data.ok!==true || !data.id || data.channel!==row.channel) error='desk_rejected_'+response.status;
        else {
          await run(env,"UPDATE incident_sensor_outbox SET status='delivered',desk_id=?,last_error=NULL,attempts=attempts+1,updated_at=? WHERE ticket_id=?",data.id,now,row.ticket_id);
          result.delivered++;
        }
      } catch { error='desk_unreachable'; }
    }
    if (error) {
      await run(env,"UPDATE incident_sensor_outbox SET attempts=attempts+1,last_error=?,updated_at=? WHERE ticket_id=?",error,now,row.ticket_id);
      result.pending++; result.errors.push({ticket_id:row.ticket_id,error});
    }
  }
  return result;
}
export async function runIncidentSensors(env,adapters,now=Date.now()) {
  await ensureSensorSchema(env);
  const result={version:SENSOR_VERSION,players:0,agents:0,errors:[]};
  try {
    const response=await (adapters.fetch||fetch)('https://api.admira.store/signage/screens',{signal:AbortSignal.timeout(10000),cf:{cacheTtl:0}});
    if (!response.ok) throw new Error('players_telemetry_unavailable');
    for (const signal of playerSignals(await response.json(),now)) {
      const id=await adapters.createPlayer({screen:signal.resource,loc:signal.loc,age:signal.age});
      await queueSignal(env,id,signal,now); result.players++;
    }
  } catch(error) { result.errors.push(String(error.message)); }
  try {
    if (!env.TELEGRAM) throw new Error('agents_telemetry_unavailable');
    const response=await env.TELEGRAM.fetch(new Request('https://bot.yokup.com/api/presence',{signal:AbortSignal.timeout(10000)}));
    if (!response.ok) throw new Error('agents_telemetry_unavailable');
    const assignments=await all(env,"SELECT DISTINCT assignee,loc FROM tickets WHERE source='fleet' AND status='in_progress'");
    for (const sample of agentSamples(await response.json(),assignments,now)) {
      if(sample.healthy) {
        await run(env,'INSERT INTO incident_sensor_agents(resource,last_seen) VALUES(?,?) ON CONFLICT(resource) DO UPDATE SET last_seen=MAX(last_seen,excluded.last_seen)',sample.resource,sample.seen);
        await adapters.recoverAgent(sample.resource); continue;
      }
      const old=await first(env,'SELECT last_seen FROM incident_sensor_agents WHERE resource=?',sample.resource);
      // Sólo vigilamos agentes previamente observados, nunca inventamos ausencias.
      if (!old || now-Math.max(old.last_seen,sample.seen)<AGENT_OFFLINE_MS) continue;
      const signal={sensor:'agent',resource:sample.resource,subject:'Agente sin proceso verificado: '+sample.owner,
        machine:sample.machine,detail:`${sample.owner} tiene trabajo en curso; sin proceso verificado desde ${new Date(Math.max(old.last_seen,sample.seen)).toISOString()}.`};
      const id=await adapters.createAgent({...signal,kind:'agent',source:'sensor-agent',project_id:'yokup',assignee:'Yokup Desk',by:'Sensor de agentes'});
      await queueSignal(env,id,signal,now); result.agents++;
    }
  } catch(error) { result.errors.push(String(error.message)); }
  result.delivery=await flushSensorOutbox(env,now);
  return result;
}
