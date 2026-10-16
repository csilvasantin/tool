// Account-approved device flow. Pairing credentials never enter a URL or localStorage.
export const PAIR_SCHEMA=[`CREATE TABLE IF NOT EXISTS agent_conversation_devices (id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, code TEXT NOT NULL UNIQUE, owner TEXT, label TEXT NOT NULL, client_hash TEXT NOT NULL, created_at INTEGER NOT NULL, approved_at INTEGER, expires_at INTEGER NOT NULL)`,`CREATE INDEX IF NOT EXISTS agent_devices_owner ON agent_conversation_devices(owner)`];
const origins=new Set(['https://www.admira.app','https://admira.app','https://www.yokup.com','https://www.admira.biz']);
const cookieName='__Host-admira_agents';
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'cache-control':'no-store',...headers}});
async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
async function schema(env){for(const sql of PAIR_SCHEMA)await env.DB.prepare(sql).run();}
export async function pairedConversationSession(req,env){
  const origin=req.headers.get('origin');if(origin&&!origins.has(origin))return null;
  const value=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
  const [id,secret]=value.split('.');if(!/^[a-f0-9-]{36}$/.test(id||'')||!/^[a-f0-9]{64}$/.test(secret||''))return null;
  await schema(env);
  const row=await env.DB.prepare('SELECT owner,secret_hash,expires_at,approved_at FROM agent_conversation_devices WHERE id=?').bind(id).first();
  if(!row?.owner||!row.approved_at||row.expires_at<=Date.now()||row.secret_hash!==await hash(secret))return null;
  return {email:row.owner,conversation_device:id};
}
export async function handleAgentDevices(req,env,{requireAuth}){
  if(!origins.has(req.headers.get('origin')||new URL(req.url).origin))return json({error:'origin_not_allowed'},403);
  const path=new URL(req.url).pathname;
  await schema(env);
  const session=await requireAuth(env,req);
  if(req.method==='GET'&&path==='/agents/devices'){
    if(!session?.email)return json({error:'unauthorized'},401);
    const rows=(await env.DB.prepare('SELECT id,label,approved_at,expires_at FROM agent_conversation_devices WHERE owner=? AND expires_at>? ORDER BY approved_at DESC').bind(session.email.toLowerCase(),Date.now()).all()).results||[];
    return json({devices:rows});
  }
  if(req.method!=='POST')return json({error:'method_not_allowed'},405);
  const raw=await req.text();if(raw.length>2000)return json({error:'too_large'},413);
  let body;try{body=JSON.parse(raw);}catch{return json({error:'bad_json'},400);}
  if(!body||typeof body!=='object')return json({error:'bad_json'},400);
  const now=Date.now();
  if(path==='/agents/devices/start'){
    const client=await hash(String(env.YK_SESSION_SECRET||'')+'|'+String(req.headers.get('cf-connecting-ip')||'unknown'));
    const count=await env.DB.prepare('SELECT COUNT(*) n FROM agent_conversation_devices WHERE client_hash=? AND created_at>?').bind(client,now-600000).first();
    if(count.n>=20)return json({error:'pairing_rate_limit'},429);
    await env.DB.prepare('DELETE FROM agent_conversation_devices WHERE expires_at<=?').bind(now).run();
    const id=crypto.randomUUID(),secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code=Array.from(crypto.getRandomValues(new Uint8Array(8)),b=>alphabet[b%alphabet.length]).join('');
    await env.DB.prepare('INSERT INTO agent_conversation_devices(id,secret_hash,code,label,client_hash,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').bind(id,await hash(secret),code,'Meta Display',client,now,now+300000).run();
    return json({device_id:id,secret,code,expires_in:300},201);
  }
  if(path==='/agents/devices/approve'){
    if(!session?.email)return json({error:'unauthorized'},401);
    const code=String(body.code||'').replace(/[\s-]/g,'').toUpperCase();
    if(!/^[A-Z2-9]{8}$/.test(code))return json({error:'invalid_code'},400);
    const result=await env.DB.prepare('UPDATE agent_conversation_devices SET owner=?,approved_at=?,expires_at=? WHERE code=? AND owner IS NULL AND expires_at>?').bind(session.email.toLowerCase(),now,now+7*86400000,code,now).run();
    return result.meta?.changes?json({ok:true}):json({error:'invalid_or_expired_code'},400);
  }
  if(path==='/agents/devices/poll'){
    const id=String(body.device_id||''),secret=String(body.secret||'');
    if(!/^[a-f0-9-]{36}$/.test(id)||!/^[a-f0-9]{64}$/.test(secret))return json({error:'invalid_device'},400);
    const row=await env.DB.prepare('SELECT owner,secret_hash,expires_at,approved_at FROM agent_conversation_devices WHERE id=?').bind(id).first();
    if(!row||row.expires_at<=now||row.secret_hash!==await hash(secret))return json({error:'invalid_or_expired_device'},400);
    if(!row.owner)return json({status:'pending'});
    const maxAge=Math.max(0,Math.floor((row.expires_at-now)/1000));
    return json({status:'paired' },200,{'set-cookie':`${cookieName}=${id}.${secret}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`});
  }
  if(path==='/agents/devices/revoke'){
    if(!session?.email)return json({error:'unauthorized'},401);
    await env.DB.prepare('DELETE FROM agent_conversation_devices WHERE id=? AND owner=?').bind(String(body.device_id||''),session.email.toLowerCase()).run();
    return json({ok:true});
  }
  return json({error:'not_found'},404);
}
