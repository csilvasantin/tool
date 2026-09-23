import {routerInitial,advanceRouter,ROUTER_TITLE} from './calls-router.js';
import {telegramPrompt,telegramAudio} from './calls-telegram-prompts.js';
import {statement as q,rows,fail,hash} from './installer-portal.js';
const AUDIO='https://www.yokup.com/assets/router-voice/';
const normalize=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
export function telegramAnswer(step,text){
 const answer=normalize(text).replace(/\bruter\b/g,'router');
 const yes={consent:['si quiero continuar','si podemos continuar','si adelante','adelante','vale'],off:['ya esta apagado','he apagado el router','he desconectado el cable','si ya esta apagado'],on:['ya esta conectado','he conectado el router','lo he conectado','si ya esta conectado'],restored:['si ya funciona','ya funciona','ha vuelto internet','ya hay internet'],confirm:['si es correcto','si lo confirmo']}[step]||[];
 const no={consent:['no quiero continuar','no gracias'],off:['no puedo apagarlo'],on:['no puedo conectarlo'],restored:['no ha vuelto internet','sigue sin funcionar','no hay internet'],confirm:['no es asi']}[step]||[];
 return yes.includes(answer)?'si':no.includes(answer)?'no':answer;
}
const event=(env,c,kind,detail)=>q(env,'INSERT INTO call_events VALUES(?,?,?,?,?,?)',crypto.randomUUID(),c,'telegram-demo',kind,JSON.stringify(detail),Date.now());
const output=(env,id,s)=>q(env,'INSERT OR IGNORE INTO call_telegram_outbox(session_id,turn,prompt,audio) VALUES(?,?,?,?)',id,s.turn,telegramPrompt(s),telegramAudio(s));
export async function telegramCall(env,method,body){
 const r=await (env.TELEGRAM_FETCH||fetch)(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const data=await r.json();if(!r.ok||!data.ok)throw new Error('Telegram '+method+' no disponible ('+r.status+')');return data.result;
}
export async function telegramWorkerReady(env){const v=await q(env,"SELECT value FROM telegram_state WHERE key='demo_worker'").first();return !!env.TELEGRAM_BOT_TOKEN&&!!env.TELEGRAM_DEMO_SECRET&&Number(v?.value)>Date.now()-45000;}
export async function expireTelegram(env){
 await q(env,'UPDATE call_telegram SET ended_at=? WHERE ended_at IS NULL AND expires_at<?',Date.now(),Date.now()).run();
 await q(env,"UPDATE call_telegram_inbox SET status='expired',file_id=NULL,lease=NULL WHERE status!='done' AND session_id IN (SELECT id FROM call_telegram WHERE ended_at IS NOT NULL)").run();
}
export async function startTelegram(env,a,c){
 if(!a.admin||a.tokenId)fail(403,'Entra como superusuario desde Yokup.');
 if(!c.is_test||c.title!==ROUTER_TITLE)fail(409,'Solo se permiten expedientes ficticios del router.');
 if(!await telegramWorkerReady(env))fail(503,'El servicio de voz del Mac no está activo. Inícialo antes del ensayo.');
 await expireTelegram(env);
 let s=await q(env,'SELECT * FROM call_telegram WHERE case_id=? AND ended_at IS NULL',c.id).first();
 if(!s){const id=crypto.randomUUID(),code=crypto.randomUUID().replaceAll('-','');await env.DB.batch([
 q(env,'INSERT INTO call_telegram(id,case_id,code,state,created_at,expires_at) VALUES(?,?,?,?,?,?)',id,c.id,code,JSON.stringify(routerInitial()),Date.now(),Date.now()+30*60000),
 event(env,c.id,'telegram_demo_created',{notes:'Ensayo privado con voz sintética y transcripción local. Sin Twilio.',synthetic:true})]);s=await q(env,'SELECT * FROM call_telegram WHERE id=?',id).first();}
 const bot=await telegramCall(env,'getMe',{});
 return {id:s.id,url:`https://t.me/${bot.username}?start=router_${s.code}`,expires_at:s.expires_at,linked:!!s.chat_id};
}
export async function telegramDetails(env,c){return rows(env,'SELECT id,state,created_at,expires_at,ended_at,chat_id IS NOT NULL AS linked FROM call_telegram WHERE case_id=? ORDER BY created_at DESC',c);}

// Called only by the existing getUpdates consumer; never start a second bot poller.
export async function receiveTelegramDemo(env,u){
 const m=u.message;if(!m||m.chat?.type!=='private'||String(m.chat.id)!==String(m.from?.id)||m.from?.is_bot)return false;
 const chat=String(m.chat.id),code=/^\/start(?:@\w+)?\s+router_([a-f0-9]{32})$/.exec((m.text||'').trim())?.[1];
 if(code){
  const s=await q(env,'SELECT * FROM call_telegram WHERE code=? AND ended_at IS NULL AND expires_at>?',code,Date.now()).first();if(!s||s.chat_id&&s.chat_id!==chat)return true;
  const other=await q(env,'SELECT id FROM call_telegram WHERE chat_id=? AND ended_at IS NULL AND id!=?',chat,s.id).first();
  if(other)await q(env,'UPDATE call_telegram SET ended_at=? WHERE id=?',Date.now(),other.id).run();
  const state=JSON.parse(s.state);
  await env.DB.batch([q(env,'UPDATE call_telegram SET chat_id=? WHERE id=? AND chat_id IS NULL',chat,s.id),
   q(env,'INSERT OR IGNORE INTO call_telegram_outbox(session_id,turn,prompt,audio) SELECT id,?,?,? FROM call_telegram WHERE id=? AND chat_id=?',state.turn,telegramPrompt(state),telegramAudio(state),s.id,chat),
   q(env,"INSERT OR IGNORE INTO call_events SELECT ?,case_id,'telegram-demo','telegram_demo_linked',?,? FROM call_telegram WHERE id=? AND chat_id=?",'telegram-link:'+s.id,JSON.stringify({notes:'Participante vinculado mediante enlace privado de un solo uso.'}),Date.now(),s.id,chat)]);
  return true;
 }
 const s=await q(env,'SELECT * FROM call_telegram WHERE chat_id=? AND ended_at IS NULL AND expires_at>?',chat,Date.now()).first();if(!s)return false;
 const state=JSON.parse(s.state);
 // A reply to an earlier voice note must not answer the current question.
 if(m.reply_to_message){const last=await q(env,'SELECT message_id FROM call_telegram_outbox WHERE session_id=? AND turn=?',s.id,state.turn).first();if(last?.message_id!==m.reply_to_message.message_id)return true;}
 const delivered=await q(env,'SELECT sent_at FROM call_telegram_outbox WHERE session_id=? AND turn=?',s.id,state.turn).first();if(!delivered?.sent_at&&!/^(cancelar|parar|humano)$/.test(normalize(m.text)))return true;
 const count=await q(env,'SELECT COUNT(*) n FROM call_telegram_inbox WHERE session_id=?',s.id).first();if(count.n>=20)return true;
 if(m.voice&&(m.voice.duration>45||m.voice.file_size>2*1024*1024)){
  await telegramCall(env,'sendMessage',{chat_id:chat,text:'Envía una nota de voz de hasta 45 segundos o responde con texto: sí, no, listo o cancelar.'});return true;
 }
 if(!m.voice&&!m.text)return true;
 const transcript=m.voice?null:String(m.text).slice(0,500);
 await q(env,'INSERT OR IGNORE INTO call_telegram_inbox(update_id,session_id,turn,file_id,transcript,created_at) VALUES(?,?,?,?,?,?)',u.update_id,s.id,state.turn,m.voice?.file_id||null,transcript,Date.now()).run();
 if(transcript!==null)await applyTelegramAnswer(env,u.update_id,transcript,false);
 return true;
}
export async function applyTelegramAnswer(env,uid,transcript,uncertain){
 const j=await q(env,'SELECT * FROM call_telegram_inbox WHERE update_id=?',uid).first();if(!j||j.status==='done'||j.status==='expired')return;
 const s=await q(env,'SELECT * FROM call_telegram WHERE id=?',j.session_id).first(),old=JSON.parse(s.state);
 if(s.ended_at||s.expires_at<Date.now()||j.turn!==old.turn){await q(env,"UPDATE call_telegram_inbox SET status='expired',file_id=NULL WHERE update_id=?",uid).run();return;}
 const answer=telegramAnswer(old.step,transcript),next={...advanceRouter(old,answer,!uncertain&&['1','2','9'].includes(answer)?answer:'',uncertain),update_id:uid},value=JSON.stringify(next);
 // Optimistic turn guard makes stale replies and repeated delivery harmless.
 await env.DB.batch([
 q(env,'UPDATE call_telegram SET state=?,ended_at=? WHERE id=? AND state=? AND ended_at IS NULL',value,next.done?Date.now():null,s.id,s.state),
 q(env,"UPDATE call_telegram_inbox SET status='done',transcript=?,file_id=NULL,lease=NULL WHERE update_id=?",String(transcript).slice(0,500),uid),
 q(env,'INSERT OR IGNORE INTO call_telegram_outbox(session_id,turn,prompt,audio) SELECT id,?,?,? FROM call_telegram WHERE id=? AND state=?',next.turn,telegramPrompt(next),telegramAudio(next),s.id,value),
 q(env,'INSERT OR IGNORE INTO call_events SELECT ?,case_id,?,?,?,? FROM call_telegram WHERE id=? AND state=?','telegram:'+uid,'telegram-demo',next.done?'telegram_demo_result':'telegram_demo_answer',JSON.stringify({notes:next.done?next.notes:'Respuesta del ensayo: '+String(transcript).slice(0,500),turn:next.turn,step:next.step,uncertain:!!uncertain,synthetic:true,outcome:next.outcome||null}),Date.now(),s.id,value)]);
}
export async function flushTelegramDemo(env){
 if(!env.TELEGRAM_BOT_TOKEN)return;
 await expireTelegram(env);
 const out=await rows(env,'SELECT o.*,s.chat_id,s.state FROM call_telegram_outbox o JOIN call_telegram s ON s.id=o.session_id WHERE o.sent_at IS NULL AND s.chat_id IS NOT NULL AND s.expires_at>? ORDER BY s.created_at,o.turn LIMIT 3',Date.now());
 for(const o of out){
  const s=JSON.parse(o.state);if(s.turn!==o.turn)continue;
  try{const sent=await telegramCall(env,'sendVoice',{chat_id:o.chat_id,voice:AUDIO+o.audio+'.ogg',caption:o.prompt.slice(0,1024),reply_markup:s.done?{remove_keyboard:true}:{keyboard:[['Sí','No','Listo'],['Cancelar']],resize_keyboard:true,one_time_keyboard:true}});
   await q(env,'UPDATE call_telegram_outbox SET sent_at=?,message_id=? WHERE session_id=? AND turn=?',Date.now(),sent.message_id,o.session_id,o.turn).run();
  }catch(e){console.warn('telegram demo delivery deferred',e.message);}
 }
}

// A dedicated secret grants only this bounded voice transcription queue.
export async function telegramWorkerRoute(request,env,path,poll){
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 if(!env.TELEGRAM_DEMO_SECRET||await hash(token)!==await hash(env.TELEGRAM_DEMO_SECRET))fail(401,'Servicio de voz no autorizado.');
 if(path==='/poll'&&request.method==='POST'){
  await q(env,"INSERT OR REPLACE INTO telegram_state(key,value) VALUES('demo_worker',?)",String(Date.now())).run();
  await poll(env);return Response.json({ok:true});
 }
 if(path==='/job'&&request.method==='POST'){
  await expireTelegram(env);
  const job=await q(env,"SELECT i.* FROM call_telegram_inbox i JOIN call_telegram s ON s.id=i.session_id WHERE i.file_id IS NOT NULL AND (i.status='pending' OR (i.status='processing' AND i.lease_until<?)) AND s.ended_at IS NULL AND s.expires_at>? ORDER BY i.created_at LIMIT 1",Date.now(),Date.now()).first();
  if(!job)return Response.json({job:null});const lease=crypto.randomUUID();
  const r=await q(env,"UPDATE call_telegram_inbox SET status='processing',lease=?,lease_until=? WHERE update_id=? AND (status='pending' OR (status='processing' AND lease_until<?))",lease,Date.now()+180000,job.update_id,Date.now()).run();
  return Response.json({job:r.meta.changes?{id:job.update_id,lease}:null});
 }
 const m=/^\/(audio|result)\/(\d+)$/.exec(path);
 if(m){const j=await q(env,"SELECT i.* FROM call_telegram_inbox i JOIN call_telegram s ON s.id=i.session_id WHERE i.update_id=? AND i.status='processing' AND i.lease=? AND i.lease_until>? AND s.ended_at IS NULL AND s.expires_at>?",Number(m[2]),request.headers.get('x-job-lease')||'',Date.now(),Date.now()).first();if(!j)fail(409,'Respuesta caducada.');
  if(m[1]==='audio'&&request.method==='GET'){
   const f=await telegramCall(env,'getFile',{file_id:j.file_id});if(!/^[a-zA-Z0-9_/-]+\.oga$|^[a-zA-Z0-9_/-]+\.ogg$/.test(f.file_path)||f.file_path.includes('..')||f.file_size>2*1024*1024)fail(400,'Audio no válido.');
   const r=await (env.TELEGRAM_FETCH||fetch)(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${f.file_path}`,{signal:AbortSignal.timeout(15000)});if(!r.ok)fail(502,'Audio no disponible.');
   const data=await r.arrayBuffer();if(data.byteLength>2*1024*1024)fail(413,'Audio demasiado grande.');return new Response(data,{headers:{'Content-Type':'audio/ogg','Cache-Control':'no-store'}});
  }
  if(m[1]==='result'&&request.method==='POST'){
   const b=await request.json();if(typeof b.transcript!=='string'||b.transcript.length>500)fail(400,'Transcripción no válida.');
   await applyTelegramAnswer(env,j.update_id,b.transcript,b.uncertain!==false);return Response.json({ok:true});
  }
 }
 fail(404,'Ruta de voz no encontrada.');
}
