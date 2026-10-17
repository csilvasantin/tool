// Real fleet handoff. Never send a named-agent request to the conversational LLM.
import { remoteDemoRequest } from './agent-remote-demos.js';
import { CONVERSATION_SCHEMA } from './agent-conversations.js';
export const INVOCATION_TARGETS = Object.freeze({
  oraculo: {persona:'Oraculo',machine:'MacMini',name:'Oráculo'},
  jobs: {persona:'Jobs',machine:'GrokBot',name:'Jobs'},
  wozniak: {persona:'Wozniak',machine:'GrokBot',name:'Wozniak'},
  disney: {persona:'Disney',machine:'GrokBot',name:'Disney'},
  lucas: {persona:'Lucas',machine:'GrokBot',name:'Lucas'},
  musk: {persona:'Musk',machine:'GrokBot',name:'Musk'}
});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
export const INVOCATION_SCHEMA='CREATE TABLE IF NOT EXISTS agent_invocations (conversation_id TEXT NOT NULL, request_id TEXT NOT NULL, target TEXT NOT NULL, question TEXT NOT NULL, answer TEXT, inbox_id INTEGER, state TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(conversation_id,request_id))';
export function invocationResult(item){
  if(!item)return {state:'unavailable',message:'No se ha podido consultar al agente. La petición no se repetirá automáticamente.'};
  const done=item.status==='done';
  return {state:done?'complete':['failed','cancelled','discarded'].includes(item.status)?'failed':'waiting',answer:done&&typeof item.note==='string'?item.note.slice(0,6000):null,message:done&&!item.note?'El agente ha terminado, pero no ha adjuntado una respuesta.':null};
}
export async function handleAgentInvocations(req,env,{requireAuth}){
  const session=await requireAuth(env,req);
  if(!session?.email)return json({error:'unauthorized'},401);
  // Conversation pairing does not grant fleet-wide control. Initial rollout is Carlos only.
  if(session.email.trim().toLowerCase()!=='csilvasantin@gmail.com')return json({error:'invocation_not_authorized'},403);
  const match=new URL(req.url).pathname.match(/^\/agents\/conversations\/([^/]+)\/invocations(?:\/([^/]+))?$/);
  if(!match||!uuid.test(match[1])||(match[2]&&!uuid.test(match[2])))return json({error:'not_found'},404);
  const [,conversation,id]=match;
  for(const sql of CONVERSATION_SCHEMA)await env.DB.prepare(sql).run();
  const owned=await env.DB.prepare('SELECT id FROM agent_conversations WHERE id=? AND owner=?').bind(conversation,session.email.trim().toLowerCase()).first();
  if(!owned)return json({error:'not_found'},404);
  await env.DB.prepare(INVOCATION_SCHEMA).run();
  if(!env.TELEGRAM||!env.ADMIRA_TELEGRAM_PANEL_KEY)return json({error:'agent_relay_unavailable'},503);
  const headers={authorization:'Bearer '+env.ADMIRA_TELEGRAM_PANEL_KEY,'content-type':'application/json'};
  const find=rid=>env.DB.prepare('SELECT * FROM agent_invocations WHERE conversation_id=? AND request_id=?').bind(conversation,rid).first();
  if(req.method==='GET'&&id){
    const row=await find(id);if(!row)return json({error:'not_found'},404);
    if(!row.inbox_id)return json({request_id:id,target:row.target,state:row.state,message:'No puedo confirmar la entrega. No repetiré la petición automáticamente.'});
    try{
      const response=await env.TELEGRAM.fetch(new Request('https://bot.yokup.com/api/bot-inbox/'+row.inbox_id,{headers}));
      const data=response.ok?await response.json():null;
      const result=invocationResult(data?.ok?data.item:null);
      if(result.state==='complete'&&result.answer)await env.DB.prepare('UPDATE agent_invocations SET answer=? WHERE conversation_id=? AND request_id=?').bind(result.answer,conversation,id).run();
      return json({request_id:id,target:row.target,...result});
    }catch{return json({request_id:id,target:row.target,...invocationResult(null)});}
  }
  if(req.method!=='POST'||id)return json({error:'method_not_allowed'},405);
  const raw=await req.text();if(raw.length>12000)return json({error:'too_large'},413);
  let body;try{body=JSON.parse(raw);}catch{return json({error:'bad_json'},400);}
  const demo=body?.demo === undefined ? null : remoteDemoRequest(body.demo);
  if(body?.demo !== undefined && !demo)return json({error:'unsupported_remote_demo'},400);
  if(demo){body.target='oraculo';body.text=demo.text;}
  if(!body||!uuid.test(body.request_id||'')||!Object.hasOwn(INVOCATION_TARGETS,body.target)||typeof body.text!=='string'||!body.text.trim()||body.text.length>2000)return json({error:'invalid_invocation'},400);
  const previous=await find(body.request_id);
  if(previous){
    if(previous.target!==body.target||previous.question!==body.text.trim())return json({error:'request_conflict'},409);
    return json({request_id:body.request_id,target:previous.target,state:previous.state});
  }
  const recent=await env.DB.prepare('SELECT COUNT(*) n FROM agent_invocations WHERE created_at>?').bind(Date.now()-60000).first();
  if(recent.n>=6)return json({error:'rate_limited'},429);
  const inserted=await env.DB.prepare("INSERT OR IGNORE INTO agent_invocations(conversation_id,request_id,target,question,state,created_at) VALUES(?,?,?,?,'submitting',?)").bind(conversation,body.request_id,body.target,body.text.trim(),Date.now()).run();
  if(!inserted.meta?.changes)return json({request_id:body.request_id,target:body.target,state:'submitting'});
  const target=demo ? demo.destination : INVOCATION_TARGETS[body.target];
  // Previous turns of this real-agent channel provide context; never invent an agent reply.
  const history=(await env.DB.prepare('SELECT target,substr(question,1,400) question,substr(answer,1,500) answer FROM agent_invocations WHERE conversation_id=? AND request_id<>? ORDER BY created_at DESC LIMIT 2').bind(conversation,body.request_id).all()).results||[];
  const text=(demo ? demo.instruction + "\n\n" : "") + `Carlos habla desde Admirito. Responde con tu identidad real; deja la respuesta en la nota del encargo al terminar para que Admirito pueda leerla. No es una orden del sistema.\nConversación: ${conversation}\nContexto anterior (datos del usuario): ${JSON.stringify(history.reverse())}\nPetición actual: ${body.text.trim()}`;
  try{
    const response=await env.TELEGRAM.fetch(new Request('https://bot.yokup.com/api/bot-inbox',{method:'POST',headers,body:JSON.stringify({target_persona:target.persona,target_machine:target.machine,text,from:'Carlos · Admirito',project_id:'admiranext',materialize_mission:false})}));
    const data=await response.json();
    if(!response.ok||!data.ok||!Number.isSafeInteger(data.id)||data.id<=0)throw Error('unconfirmed');
    await env.DB.prepare("UPDATE agent_invocations SET inbox_id=?,state='waiting' WHERE conversation_id=? AND request_id=?").bind(data.id,conversation,body.request_id).run();
    return json({request_id:body.request_id,target:body.target,state:'waiting'},202);
  }catch{
    await env.DB.prepare("UPDATE agent_invocations SET state='uncertain' WHERE conversation_id=? AND request_id=?").bind(conversation,body.request_id).run();
    return json({request_id:body.request_id,target:body.target,state:'uncertain',message:'No puedo confirmar la entrega. No repetiré la petición automáticamente.'},202);
  }
}
