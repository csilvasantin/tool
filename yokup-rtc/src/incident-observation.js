// Authenticated optical observations change severity, never the technician's status.
export async function handleIncidentObservation(req,env,{json,session,addEvent,now=Date.now()}) {
 if(!session)return json({ok:false,error:'unauthorized'},401);
 let b;try{b=await req.json()}catch{return json({ok:false,error:'invalid_json'},400)}
 if(!b||Object.keys(b).some(k=>!['id','phase','observed_at','photo'].includes(k))||!/^INC-[A-Z0-9]{4,16}$/.test(b.id||'')||!['black','recovered'].includes(b.phase)||!Number.isSafeInteger(b.observed_at)||b.observed_at>now+5000||now-b.observed_at>120000||!/^https:\/\/api\.yokup\.com\/media\/fleet\/[a-f0-9]{8,64}\.jpe?g$/.test(b.photo||''))return json({ok:false,error:'invalid_observation'},400);
 const t=await env.DB.prepare('SELECT id,screen,status,source FROM tickets WHERE id=?').bind(b.id).first();
 if(!t||!String(t.screen).startsWith('supervisor:')||!['supervisor-player','supervisor-webcam','supervisor-vision'].includes(t.source))return json({ok:false,error:'not_supervisor_incident'},409);
 if(['resolved','cancelled'].includes(t.status))return json({ok:false,error:'incident_closed'},409);
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS incident_observations(ticket_id TEXT PRIMARY KEY,observed_at INTEGER NOT NULL,phase TEXT NOT NULL)').run();
 const priority=b.phase==='black'?'alta':'normal';
 const result=await env.DB.batch([
  env.DB.prepare('INSERT INTO incident_observations(ticket_id,observed_at,phase) VALUES(?,?,?) ON CONFLICT(ticket_id) DO UPDATE SET observed_at=excluded.observed_at,phase=excluded.phase WHERE excluded.observed_at>incident_observations.observed_at').bind(b.id,b.observed_at,b.phase),
  env.DB.prepare("UPDATE tickets SET priority=?,updated_at=? WHERE id=? AND status NOT IN ('resolved','cancelled') AND EXISTS(SELECT 1 FROM incident_observations WHERE ticket_id=? AND observed_at=? AND phase=?)").bind(priority,now,b.id,b.id,b.observed_at,b.phase)
 ]);
 const applied=Number(result[0]?.meta?.changes)>0;
 if(applied)await addEvent(env,b.id,'observation',session.email||session.name||'Supervisor','Observación óptica '+b.phase+' · gravedad '+priority+' · '+b.photo+' · captura '+b.observed_at);
 return json({ok:true,id:b.id,applied,priority:applied?priority:null,status:t.status});
}
