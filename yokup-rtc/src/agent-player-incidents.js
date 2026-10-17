// Fixed laboratory only. Paired phones report; authenticated Supervisor operators close.
const screen='virtual-lab-admirito-fold';
const json=(b,status=200)=>Response.json(b,{status,headers:{'cache-control':'no-store'}});
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
export function labIssues(x,now=Date.now()){
 const d=x?.device?.display;
 if(x?.screen!==screen||typeof x.lastSeen!=='number'||now-x.lastSeen>40000||x.lastSeen>now+5000||x.standby===true||!d||!['paintedRotation','overlay','visible','chromeTop'].every(k=>Number.isFinite(d[k]))||typeof d.playbackPaused!=='boolean')throw new Error('player_not_recent');
 const issues=[];
 if((d.paintedRotation-(d.rotation||0)+360)%360)issues.push('contenido girado');
 if(d.overlay>=10)issues.push('popup sobre la emisión');
 if(d.visible<90)issues.push('contenido recortado');
 if(d.chromeTop>=8)issues.push('barra superior');
 if(d.playbackPaused)issues.push('vídeo pausado');
 if(d.canvas?.w>0&&d.canvas?.h>0&&d.viewportWidth>0&&d.viewportHeight>0&&(d.canvas.w>=d.canvas.h)!==(d.viewportWidth>=d.viewportHeight))issues.push('proporción incorrecta');
 return issues;
}
async function photo(req,env){
 if(!/^image\/jpeg(?:;|$)/i.test(req.headers.get('content-type')||''))throw new Error('jpeg_required');
 const bytes=new Uint8Array(await req.arrayBuffer());
 if(bytes.length<4||bytes.length>4*1024*1024||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw new Error('invalid_photo');
 const hash=await digest(bytes),key='fleet/'+hash+'.jpeg';
 await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
 return {hash,url:'https://api.yokup.com/media/'+key};
}
export async function handlePlayerIncidents(req,env,deps){
 const origin=req.headers.get('origin');
 if(origin&&!['https://www.admira.app','https://admira.app','https://www.admira.biz','https://admira.biz','https://www.yokup.com','https://www.admira.live'].includes(origin))return json({error:'origin_not_allowed'},403);
 const session=await deps.requireAuth(env,req);
 if(!session?.email)return json({error:'unauthorized'},401);
 if(session.conversation_device&&session.conversation_device_label!=='Admirito iOS')return json({error:'ios_scope_required'},403);
 const owner=session.email.toLowerCase(),path=new URL(req.url).pathname.split('/').filter(Boolean),id=path[2],action=path[3];
 if(path.length>4||id&&!/^INC-[A-Z0-9]{4,16}$/.test(id))return json({error:'not_found'},404);
 await deps.ensureSchema(env);
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS agent_player_incidents(owner TEXT NOT NULL,request_id TEXT NOT NULL,ticket_id TEXT,photo_hash TEXT NOT NULL,photo TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(owner,request_id))').run();
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS agent_player_recovery(ticket_id TEXT PRIMARY KEY,photo_hash TEXT NOT NULL,photo TEXT NOT NULL,captured_at INTEGER NOT NULL,seen REAL NOT NULL)').run();
 const row=id?await env.DB.prepare('SELECT * FROM agent_player_incidents WHERE ticket_id=? AND (owner=? OR ?=1)').bind(id,owner,session.conversation_device?0:1).first():null;
 if(id&&!row)return json({error:'not_found'},404);
 if(req.method==='GET'&&id&&!action){
  const ticket=await env.DB.prepare('SELECT id,status,subject FROM tickets WHERE id=?').bind(id).first();return json({ticket,url:'https://www.admira.app/ticket?id='+id});
 }
 if(req.method!=='POST')return json({error:'method_not_allowed'},405);
 if(Number(req.headers.get('content-length'))>4*1024*1024)return json({error:'too_large'},413);
 if(id&&action!=='recovery')return json({error:'not_found'},404);
 // Conversation credentials can NEVER submit optical recovery or close tickets.
 if(id&&session.conversation_device)return json({error:'supervisor_session_required'},403);
 try{
  const requestId=req.headers.get('x-request-id')||'';
  if(!id&&/^[a-f0-9-]{36}$/i.test(requestId)){const replay=await env.DB.prepare('SELECT * FROM agent_player_incidents WHERE owner=? AND request_id=?').bind(owner,requestId).first();if(replay?.ticket_id)return json({ok:true,id:replay.ticket_id,url:'https://www.admira.app/ticket?id='+replay.ticket_id,replayed:true});}
  const now=Date.now();
  const snapshot=await (deps.snapshot?deps.snapshot():fetch('https://api.admira.store/signage/now?screen='+screen+'&t='+now,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('player_unavailable');return r.json()}));
  const issues=labIssues(snapshot,now);
  if(!id){
   const requestId=req.headers.get('x-request-id')||'';
   if(!/^[a-f0-9-]{36}$/i.test(requestId))return json({error:'request_id_required'},400);
   const prior=await env.DB.prepare('SELECT * FROM agent_player_incidents WHERE owner=? AND request_id=?').bind(owner,requestId).first();
   if(prior?.ticket_id)return json({ok:true,id:prior.ticket_id,url:'https://www.admira.app/ticket?id='+prior.ticket_id,replayed:true});
   if(!issues.length)return json({error:'no_current_fault'},409);
   const p=await photo(req,env);
   if(prior&&prior.photo_hash!==p.hash)return json({error:'request_conflict'},409);
   await env.DB.prepare('INSERT OR IGNORE INTO agent_player_incidents(owner,request_id,photo_hash,photo,created_at) VALUES(?,?,?,?,?)').bind(owner,requestId,p.hash,p.url,now).run();
   const claimed=await env.DB.prepare('SELECT photo_hash FROM agent_player_incidents WHERE owner=? AND request_id=?').bind(owner,requestId).first();
   if(claimed.photo_hash!==p.hash)return json({error:'request_conflict'},409);
   const resource='supervisor:admirito-fold:'+await digest(new TextEncoder().encode(owner));
   const ticket=await deps.createIncident(env,{resource,subject:'Bugito · Fold · '+issues.join(', '),kind:'screen',severity:'normal',source:'supervisor-player',project_id:'admiranext',by:'Bugito · Admirito iPhone',detail:'Prueba autorizada de laboratorio. Fallo comunicado por el player: '+issues.join(', ')+'. Pieza: '+String(snapshot.item?.title||'sin identificar').slice(0,180)+'. Foto capturada y enviada desde el iPhone: '+p.url+'. Foto sin verificación óptica automática. Cierre reservado a Supervisor Insta360 con dos observaciones de recuperación.'});
   if(!ticket)throw new Error('incident_not_created');
   const linked=await env.DB.prepare('UPDATE agent_player_incidents SET ticket_id=? WHERE owner=? AND request_id=? AND ticket_id IS NULL').bind(ticket,owner,requestId).run();
   if(linked.meta?.changes)await deps.addEvent(env,ticket,'observation','Bugito · iPhone','Foto adjunta por iPhone, sin verificación óptica automática: '+p.url+' · player comunica: '+issues.join(', '));
   return json({ok:true,id:ticket,url:'https://www.admira.app/ticket?id='+ticket},201);
  }
  if(issues.length){await env.DB.prepare('DELETE FROM agent_player_recovery WHERE ticket_id=?').bind(id).run();return json({error:'player_still_faulty',issues},409);}
  const captured=Number(req.headers.get('x-captured-at'));
  if(!Number.isSafeInteger(captured)||captured>now+5000||now-captured>120000||req.headers.get('x-camera-source')!=='macmini-insta360'||req.headers.get('x-optical-review')!=='recovered')return json({error:'fresh_reviewed_insta360_required'},400);
  const ticket=await env.DB.prepare('SELECT status FROM tickets WHERE id=?').bind(id).first();
  if(['resolved','cancelled'].includes(ticket?.status))return json({ok:true,id,status:ticket.status,applied:false});
  const p=await photo(req,env),previous=await env.DB.prepare('SELECT * FROM agent_player_recovery WHERE ticket_id=?').bind(id).first();
  const confirmed=previous&&previous.photo_hash!==p.hash&&captured>previous.captured_at+1000&&now-previous.captured_at<120000&&snapshot.lastSeen>previous.seen;
  const note='Supervisor Insta360 · revisión óptica por '+owner+' · recuperación observada · captura '+captured+' · '+p.url+' · player sin fallos comunicados, lastSeen '+snapshot.lastSeen;
  await deps.addEvent(env,id,'observation','Supervisor Insta360',note);
  if(!confirmed){
   if(!previous||captured>previous.captured_at&&p.hash!==previous.photo_hash)await env.DB.prepare('INSERT INTO agent_player_recovery(ticket_id,photo_hash,photo,captured_at,seen) VALUES(?,?,?,?,?) ON CONFLICT(ticket_id) DO UPDATE SET photo_hash=excluded.photo_hash,photo=excluded.photo,captured_at=excluded.captured_at,seen=excluded.seen').bind(id,p.hash,p.url,captured,snapshot.lastSeen).run();
   return json({ok:true,id,status:'pending_second_observation',closed:false});
  }
  const held=await deps.portalAssigned(env,id);if(held)return json({error:'technician_assigned'},409);
  const update=await env.DB.prepare("UPDATE tickets SET status='resolved',updated_at=?,resolved_at=? WHERE id=? AND status NOT IN ('resolved','cancelled')").bind(now,now,id).run();
  if(update.meta?.changes)await deps.addEvent(env,id,'close','Supervisor Insta360','Dos capturas ópticas distintas revisadas y dos lecturas recientes sin fallos. Antes: '+row.photo+' · recuperación: '+previous.photo+' · segunda: '+p.url);
  return json({ok:true,id,status:'resolved',closed:true,url:'https://www.admira.app/ticket?id='+id});
 }catch(e){return json({error:String(e.message||'incident_failed')},409)}
}
