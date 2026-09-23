import {ROUTER_TITLE,routerInitial,advanceRouter,routerXml} from './calls-router.js';
import {statement as q,rows,fail,rateLimit} from './installer-portal.js';
import {ensureChain} from './calls-chain.js';

const origin='https://data.yokup.com';
const root=origin+'/api/calls/telephone';
const sidPattern=/^CA[a-f0-9]{32}$/i;
const terminal=new Set(['completed','busy','no-answer','failed','canceled']);
const escape=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const clean=s=>String(s||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,350);
const normalized=s=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.!?¿¡,]/g,'').trim();
const yes=s=>/^(si|si correcto|correcto|confirmo|de acuerdo|si confirmo|si sigue fallando|sigue fallando)$/.test(normalized(s));
const no=s=>/^(no|no es correcto|no correcto|no confirmo|ya funciona|ya esta arreglada)$/.test(normalized(s));
const handoff=s=>/\b(persona|operador|humano|no me llames|no llames|cancelar|cancelamos|para la llamada)\b/.test(normalized(s));
export function telephoneReady(env){return /^AC[a-f0-9]{32}$/i.test(env.TWILIO_ACCOUNT_SID||'')&&!!env.TWILIO_AUTH_TOKEN&&/^\+[1-9]\d{7,14}$/.test(env.TWILIO_FROM||'')&&/^\+[1-9]\d{7,14}$/.test(env.TWILIO_DEMO_TO||'');}

// Speech recognition is real; interpretation is deliberately bounded, not an LLM.
export function advanceTelephone(previous,speech='',digits='',confidence=''){
 if(previous.scenario==='router')return previous.done?previous:advanceRouter(previous,normalized(speech),digits,confidence!==''&&Number(confidence)<0.6);
 const s={...previous,turn:previous.turn+1},answer=clean(speech);
 if(s.done)return s;
 const end=(outcome,notes)=>({...s,done:true,outcome,notes});
 if(digits==='9'||handoff(answer))return end('human_handoff','El contacto solicita atención de una persona. No se ha confirmado ninguna cita.');
 if(s.turn>=8)return end('human_handoff','Límite de turnos alcanzado. Revisar con una persona; no hay cita confirmada.');
 const uncertain=confidence!==''&&Number.isFinite(Number(confidence))&&Number(confidence)<0.6;
 const binary=digits==='1'?'yes':digits==='2'?'no':!uncertain&&yes(answer)?'yes':!uncertain&&no(answer)?'no':null;
 const retry=()=>s.retries?end('human_handoff','No se ha podido confirmar la respuesta. Revisar con una persona.'):{...s,retries:1,prompt:'No he entendido con seguridad. '+question(s)};
 if(s.step==='fault'){
  if(binary==='no')return end('human_handoff','El contacto indica que el equipo ya funciona. Pendiente de validación humana; no cerrar automáticamente.');
  if(binary!=='yes')return retry();
  return {...s,step:'availability',retries:0,prompt:question({step:'availability'})};
 }
 if(s.step==='availability'||s.step==='access'){
  if(uncertain||answer.length<3||digits)return retry();
  s[s.step]=answer;s.retries=0;s.step=s.step==='availability'?'access':'confirm';s.prompt=question(s);return s;
 }
 if(s.step==='confirm'){
  if(binary==='yes')return end('availability','El contacto confirma expresamente disponibilidad y acceso. Pendiente de propuesta y aceptación del técnico.');
  if(binary==='no'&&!s.corrected)return {...s,step:'availability',availability:'',access:'',retries:0,corrected:true,prompt:'Vamos a corregirlo. '+question({step:'availability'})};
  return retry();
 }
 return end('human_handoff','Respuesta fuera del recorrido previsto; revisar con una persona.');
}
function question(s){
 return {fault:'¿La pantalla sigue sin mostrar imagen? Di sí o pulsa uno. Si ya funciona, di no o pulsa dos. Para hablar con una persona, pulsa nueve.',availability:'¿Qué día y en qué franja horaria podría ir un técnico? Dilo después de la señal. Todavía no estamos confirmando una cita.',access:'¿Quién podrá recibir al técnico y cómo accede al equipo? No indiques códigos de alarma ni contraseñas.',confirm:`He entendido esta disponibilidad: ${s.availability||''}. Para el acceso: ${s.access||''}. ¿Es correcto y quieres que lo registre en el expediente? Di sí o pulsa uno para confirmar; no o dos para corregir. La cita necesitará también la aceptación del técnico.`}[s.step]||'';
}
export function telephoneXml(s,c,attempt){
 if(s.scenario==='router')return routerXml(s,escape,`${root}/${encodeURIComponent(attempt)}/voice?turn=${s.turn+1}`);
 const say=t=>`<Say language="es-ES">${escape(t)}</Say>`;
 if(s.done)return '<?xml version="1.0" encoding="UTF-8"?><Response>'+say(s.outcome==='availability'?'Gracias. He guardado tu disponibilidad y el acceso en el expediente de Yokup. El siguiente paso es proponer la visita y confirmarla con ambas partes. Esta es una demostración: no se avisará a un técnico real. Hasta pronto.':'Gracias. Dejo el resultado pendiente de revisión por una persona. No hay ninguna visita confirmada. Esta prueba de Yokup termina aquí. Hasta pronto.')+'<Hangup/></Response>';
 const intro=s.turn===0?`Hola. Soy el asistente automático de Yokup. Esta es una demostración de gestión de incidencias con voz sintética. Te llamo por ${c.title} en ${c.site_name}. Guardaremos tus respuestas en el expediente de prueba. No hay una avería real ni se concertará una visita real. `:'';
 return '<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech dtmf" language="es-ES" timeout="6" speechTimeout="auto" numDigits="1" actionOnEmptyResult="true" method="POST" action="'+escape(`${root}/${encodeURIComponent(attempt)}/voice?turn=${s.turn+1}`)+'">'+say(intro+(s.prompt||question(s)))+'</Gather><Hangup/></Response>';
}
export async function twilioSignature(url,params,token){
 let message=url;for(const key of [...new Set(params.keys())].sort())for(const value of [...new Set(params.getAll(key))].sort())message+=key+value;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(token),{name:'HMAC',hash:'SHA-1'},false,['sign']);
 return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message)))));
}
async function authenticate(req,env){
 if(req.method!=='POST'||!env.TWILIO_AUTH_TOKEN)fail(403,'Webhook no autorizado.');
 if(!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))fail(415,'Formato no válido.');
 const raw=await req.text();if(raw.length>16000)fail(413,'Petición demasiado grande.');
 const p=new URLSearchParams(raw),expected=await twilioSignature(req.url,p,env.TWILIO_AUTH_TOKEN),provided=req.headers.get('x-twilio-signature')||'';
 let mismatch=expected.length^provided.length;for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^(provided.charCodeAt(i)||0);
 if(mismatch||p.get('AccountSid')!==env.TWILIO_ACCOUNT_SID||!sidPattern.test(p.get('CallSid')||''))fail(403,'Firma no válida.');
 return p;
}
const event=(env,c,kind,detail)=>q(env,'INSERT INTO call_events VALUES(?,?,?,?,?,?)',crypto.randomUUID(),c,'Twilio · Yokup',kind,JSON.stringify(detail),Date.now());
const transport=(env,url,options)=>(env.TWILIO_FETCH||fetch)(url,options);
const providerUrl=(env,suffix='')=>`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Calls${suffix}.json`;
const authHeaders=env=>({Authorization:'Basic '+btoa(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN)});

export async function startTelephone(env,a,j,c,b){
 if(!telephoneReady(env))fail(503,'Falta configurar la cuenta y el número de prueba de Twilio.');
 if(!a.admin||a.tokenId)fail(403,'La prueba telefónica requiere un superusuario en la web.');
 if(!c.is_test||c.stage!=='open'||j.target!=='retailer')fail(409,'Usa el contacto del comercio de un expediente de prueba abierto.');
 if(await q(env,"SELECT id FROM call_proposals WHERE case_id=? AND status IN ('proposed','confirmed')",c.id).first())fail(409,'Esta llamada recoge datos iniciales; el expediente ya tiene una propuesta.');
 const key=String(b.request_key||'');if(!/^[a-f0-9-]{36}$/i.test(key)||b.authorized!==true)fail(400,'Confirma el destino y proporciona una solicitud válida.');
 const prior=await q(env,'SELECT t.*,a.job_id,a.actor FROM call_telephone t JOIN call_attempts a ON a.id=t.attempt_id WHERE t.attempt_id=?',key).first();
 if(prior){if(prior.actor!==a.email||prior.job_id!==j.id)fail(409,'Solicitud ya utilizada.');return {attempt_id:key,call_sid:prior.call_sid,status:prior.provider_status,replayed:true};}
 const contact=await q(env,"SELECT * FROM call_contacts WHERE case_id=? AND kind='retailer'",c.id).first();
 if(contact?.phone!==env.TWILIO_DEMO_TO)fail(400,'El contacto debe coincidir con el único móvil verificado para esta prueba.');
 if((await ensureChain(env,c.id)).state!=='active')fail(409,'La cadena está pausada.');
 await rateLimit(env,'telephone-start:'+a.email,3,86400000);
 const now=Date.now();let out;
 try{out=await env.DB.batch([
  q(env,`INSERT INTO call_attempts(id,job_id,actor,mode,channel,created_at,cycle) SELECT ?,id,?,'assistant','telephone',?,cycle FROM call_jobs WHERE id=? AND attempt_id IS NULL AND (status='pending' OR (status='reserved' AND owner=?))`,key,a.email,now,j.id,a.email),
  q(env,`INSERT INTO call_telephone(attempt_id,to_phone,created_at,expires_at,state) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM call_attempts WHERE id=?)`,key,contact.phone,now,now+3600000,JSON.stringify(c.title===ROUTER_TITLE?routerInitial():{step:'fault',turn:0,retries:0}),key),
  q(env,"UPDATE call_jobs SET status='in_call',mode='assistant',owner=?,attempt_id=?,lease_until=NULL WHERE id=? AND EXISTS(SELECT 1 FROM call_telephone WHERE attempt_id=?)",a.email,key,j.id,key)
 ]);}catch{fail(409,'Ya existe una conversación activa. No se ha enviado otra llamada.');}
 if(!out[0].meta.changes)fail(409,'La llamada no está disponible.');
 const body=new URLSearchParams({To:contact.phone,From:env.TWILIO_FROM,Url:`${root}/${key}/voice?turn=0`,Method:'POST',StatusCallback:`${root}/${key}/status`,StatusCallbackMethod:'POST',Timeout:'25',TimeLimit:c.title===ROUTER_TITLE?'300':'180'});
 if(env.TWILIO_TRIAL_MODE==='true'){for(const key of ['Method','StatusCallbackMethod','Timeout','TimeLimit'])body.delete(key);}
 else for(const e of ['initiated','ringing','answered','completed'])body.append('StatusCallbackEvent',e);
 let res,data;
 try{res=await transport(env,providerUrl(env),{method:'POST',headers:{...authHeaders(env),'Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),signal:AbortSignal.timeout(12000)});data=await res.json();}
 catch{await q(env,"UPDATE call_telephone SET provider_status='unknown' WHERE attempt_id=? AND call_sid IS NULL",key).run();return {attempt_id:key,status:'unknown',message:'Twilio no ha confirmado el resultado. No repitas: comprueba su consola.'};}
 if(res.status>=500){await q(env,"UPDATE call_telephone SET provider_status='unknown' WHERE attempt_id=? AND call_sid IS NULL",key).run();return {attempt_id:key,status:'unknown',message:'Estado no confirmado. Comprueba Twilio antes de continuar.'};}
 if(!res.ok){
  const rawError=data.message||data.error?.message||data.error||data.errors||data;
  const reason=clean(typeof rawError==='string'?rawError:JSON.stringify(rawError)).split(env.TWILIO_AUTH_TOKEN).join('[redacted]');
  const rejection='Twilio rechazó la llamada. Código '+String(data.code||res.status).slice(0,12)+'. '+reason;
  await env.DB.batch([q(env,"UPDATE call_telephone SET provider_status='rejected' WHERE attempt_id=?",key),q(env,"UPDATE call_attempts SET status='completed',outcome='other',notes=?,ended_at=? WHERE id=?",rejection,Date.now(),key),q(env,"UPDATE call_jobs SET status='escalated',attempt_id=NULL,owner=NULL WHERE id=? AND attempt_id=?",j.id,key),event(env,c.id,'telephone_rejected',{notes:rejection})]);
  fail(502,rejection+' No se ha reintentado.');
 }
 if(!sidPattern.test(data.sid||'')){await q(env,"UPDATE call_telephone SET provider_status='unknown' WHERE attempt_id=? AND call_sid IS NULL",key).run();return {attempt_id:key,status:'unknown'};}
 await env.DB.batch([q(env,"UPDATE call_telephone SET call_sid=?,provider_status=CASE WHEN provider_status IN ('starting','unknown') THEN ? ELSE provider_status END WHERE attempt_id=? AND (call_sid IS NULL OR call_sid=?)",data.sid,data.status||'queued',key,data.sid),event(env,c.id,'telephone_started',{attempt_id:key,notes:'Llamada telefónica de demostración enviada; pendiente de respuesta.'})]);
 return {attempt_id:key,call_sid:data.sid,status:data.status||'queued'};
}

async function load(env,id){return q(env,'SELECT t.*,a.job_id,a.actor,a.ended_at,j.case_id FROM call_telephone t JOIN call_attempts a ON a.id=t.attempt_id JOIN call_jobs j ON j.id=a.job_id WHERE t.attempt_id=?',id).first();}
async function complete(env,t,state,finish){
 const j=await q(env,'SELECT * FROM call_jobs WHERE id=?',t.job_id).first();if(j.attempt_id!==t.attempt_id||j.status!=='in_call')return;
 const c=await q(env,'SELECT * FROM call_cases WHERE id=?',t.case_id).first();
 try{await finish(env,{email:t.actor},j,c,{outcome:state.outcome,notes:state.notes,availability:state.outcome==='availability'?`Disponibilidad: ${state.availability}. Acceso: ${state.access}`:''});}catch(e){if(e.status!==409)throw e;}
}
export async function reconcileTelephone(env,a,j,c,b,finish){
 if(!a.admin||a.tokenId||!telephoneReady(env))fail(403,'Solo un superusuario puede comprobar esta llamada.');
 const t=await load(env,String(b.attempt_id||''));if(!t||t.job_id!==j.id||t.case_id!==c.id)fail(404,'Intento no encontrado.');
 const sid=t.call_sid||String(b.call_sid||'');if(!sidPattern.test(sid))fail(400,'Copia la referencia CA de la llamada desde el historial de Twilio. No inicies otra llamada.');
 const res=await transport(env,providerUrl(env,'/'+sid),{headers:authHeaders(env),signal:AbortSignal.timeout(10000)});
 if(!res.ok)fail(502,'No se ha podido consultar la llamada en Twilio.');const data=await res.json();
 const created=Date.parse(data.date_created);
 if(data.sid!==sid||data.account_sid!==env.TWILIO_ACCOUNT_SID||data.to!==t.to_phone||data.from!==env.TWILIO_FROM||!Number.isFinite(created)||created<t.created_at-10000||created>t.created_at+180000)fail(409,'La referencia no corresponde a este intento.');
 await q(env,'UPDATE call_telephone SET call_sid=?,provider_status=? WHERE attempt_id=? AND (call_sid IS NULL OR call_sid=?)',sid,data.status,t.attempt_id,sid).run();
 let state=JSON.parse(t.state);
 if(terminal.has(data.status)){
  if(!state.done){state={...state,done:true,outcome:data.status==='busy'?'busy':data.status==='no-answer'?'no_answer':'human_handoff',notes:'Twilio confirma '+data.status+'. No se han confirmado todos los datos; revisar con una persona.'};await q(env,'UPDATE call_telephone SET state=? WHERE attempt_id=? AND state=?',JSON.stringify(state),t.attempt_id,t.state).run();state=JSON.parse((await load(env,t.attempt_id)).state);}
  await complete(env,t,state,finish);
 }
 return {status:data.status,call_sid:sid};
}
export async function telephoneWebhook(req,env,path,finish){
 const match=/^\/telephone\/([a-f0-9-]{36})\/(voice|status)$/.exec(path);if(!match)fail(404,'Ruta no encontrada.');
 const p=await authenticate(req,env),id=match[1],callSid=p.get('CallSid');let t=await load(env,id);
 if(!t||t.expires_at<Date.now()||p.get('To')!==t.to_phone||p.get('From')!==env.TWILIO_FROM)fail(403,'Llamada no autorizada.');
 await q(env,'UPDATE call_telephone SET call_sid=? WHERE attempt_id=? AND call_sid IS NULL',callSid,id).run();t=await load(env,id);if(t.call_sid!==callSid)fail(403,'Otra llamada.');
 let state=JSON.parse(t.state);
 if(match[2]==='status'){
  const status=p.get('CallStatus')||'';if(!['queued','initiated','ringing','in-progress',...terminal].includes(status))fail(400,'Estado no válido.');
  await q(env,"UPDATE call_telephone SET provider_status=? WHERE attempt_id=? AND provider_status NOT IN ('completed','busy','no-answer','failed','canceled','rejected')",status,id).run();
  if(terminal.has(status)){
   if(!state.done){state={...state,done:true,outcome:status==='busy'?'busy':status==='no-answer'?'no_answer':'human_handoff',notes:'Llamada '+status+' antes de confirmar los datos. Revisar el expediente; no hay cita confirmada.'};await q(env,'UPDATE call_telephone SET state=? WHERE attempt_id=? AND state=?',JSON.stringify(state),id,t.state).run();state=JSON.parse((await load(env,id)).state);}
   await complete(env,t,state,finish);
  }
  return new Response('',{status:204});
 }
 const turn=Number(new URL(req.url).searchParams.get('turn'));if(!Number.isInteger(turn)||turn<0||turn>8)fail(400,'Turno no válido.');
 const cached=await q(env,'SELECT response_xml FROM call_telephone_turns WHERE attempt_id=? AND turn=?',id,turn).first();
 if(cached){if(state.done)await complete(env,t,state,finish);return xmlResponse(cached.response_xml);}
 const c=await q(env,'SELECT * FROM call_cases WHERE id=?',t.case_id).first();
 if(state.done||t.ended_at)return xmlResponse(telephoneXml({...state,done:true},c,id));
 if(turn!==0&&turn!==state.turn+1||turn===0&&state.turn!==0)fail(409,'Turno fuera de orden.');
 const next=turn===0?state:advanceTelephone(state,p.get('SpeechResult'),p.get('Digits'),p.get('Confidence')??'');
 const xml=telephoneXml(next,c,id);
 // One response per turn. CAS and cache are committed together on D1.
 await env.DB.batch([
  q(env,'INSERT OR IGNORE INTO call_telephone_turns(attempt_id,turn,response_xml) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM call_telephone WHERE attempt_id=? AND state=?)',id,turn,xml,id,t.state),
  q(env,'UPDATE call_telephone SET state=? WHERE attempt_id=? AND state=? AND EXISTS(SELECT 1 FROM call_telephone_turns WHERE attempt_id=? AND turn=? AND response_xml=?)',JSON.stringify(next),id,t.state,id,turn,xml),
  q(env,'INSERT OR IGNORE INTO call_events(id,case_id,actor,kind,detail,created_at) SELECT ?,?,\'Twilio · Yokup\',\'telephone_turn\',?,? WHERE EXISTS(SELECT 1 FROM call_telephone_turns WHERE attempt_id=? AND turn=? AND response_xml=?)','telephone:'+id+':'+turn,t.case_id,JSON.stringify({notes:turn===0?'Se presenta la incidencia de demostración.':'Respuesta: '+(clean(p.get('SpeechResult'))||p.get('Digits')||'Silencio'),meaning:next.done?next.notes:'Pendiente de completar y confirmar los datos.'}),Date.now(),id,turn,xml)
 ]);
 const stored=await q(env,'SELECT response_xml FROM call_telephone_turns WHERE attempt_id=? AND turn=?',id,turn).first();if(!stored)fail(409,'El turno ha cambiado.');
 t=await load(env,id);state=JSON.parse(t.state);if(state.done)await complete(env,t,state,finish);
 return xmlResponse(stored.response_xml);
}
const xmlResponse=xml=>new Response(xml,{headers:{'Content-Type':'text/xml; charset=utf-8','Cache-Control':'no-store'}});
export async function telephoneDetails(env,caseId){return rows(env,'SELECT t.attempt_id,t.call_sid,t.provider_status,t.state,t.created_at FROM call_telephone t JOIN call_attempts a ON a.id=t.attempt_id JOIN call_jobs j ON j.id=a.job_id WHERE j.case_id=? ORDER BY t.created_at DESC',caseId);}
