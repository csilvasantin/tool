const MCP = "https://mcp-tv.admira.store/mcp";
const SIGNAGE = "https://api.admira.store/signage/screens";
const SCREEN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const CODE = /^[A-Z0-9]{2,12}(-[A-Z0-9]{2,12}){1,3}$/;
const STORE = /^[A-Za-z0-9][\w.:-]{0,159}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const DEVICE_COMMANDS = ["pause","play","next","prev","mute","unmute","standby","resume","info-show","info-hide"];
export const DEVICE_FRESH_MS = 90_000;
const schemas = new WeakMap();
const clip = (v,n=160) => typeof v === "string" ? v.trim().slice(0,n) : "";
const error = (code,status=400) => Object.assign(new Error(code),{status,code});
export const canManageDevices = (session,access) => session?.email === "agentes@silicio.admiranext.com" || access?.allowed === true && access?.canChangeProject === true;
export function recentSignal(status,now=Date.now()) {
  const at=Number(status?.last_seen);return status?.signal_recent === true && at>0 && at<=now+10000 && now-at<=DEVICE_FRESH_MS;
}
async function schema(db) {
  if(!schemas.has(db)) schemas.set(db,(async()=>{
    await db.prepare(`CREATE TABLE IF NOT EXISTS supervisor_device_bindings (
      xpacio TEXT NOT NULL,code TEXT NOT NULL,screen TEXT NOT NULL UNIQUE,label TEXT NOT NULL,
      scope TEXT NOT NULL,actor TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(xpacio,code))`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS supervisor_device_commands (
      id TEXT PRIMARY KEY,xpacio TEXT NOT NULL,code TEXT NOT NULL,screen TEXT NOT NULL,
      command TEXT NOT NULL,actor TEXT NOT NULL,status TEXT NOT NULL,receipt TEXT,
      created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`).run();
  })().catch(e=>{schemas.delete(db);throw e;}));
  await schemas.get(db);
}
export async function deviceRpc(env,name,args,{write=false,fetchImpl=fetch}={}) {
  if(!["player_status","player_command","player_command_status"].includes(name))throw error("tool_forbidden",403);
  if(write !== (name === "player_command"))throw error("tool_forbidden",403);
  if(write && !env.SUPERVISOR_PLAYER_KEY)throw error("control_unconfigured",503);
  const headers={"Content-Type":"application/json",Accept:"application/json"};
  if(write)headers.Authorization="Bearer "+env.SUPERVISOR_PLAYER_KEY;
  const r=await fetchImpl(MCP,{method:"POST",headers,redirect:"manual",signal:AbortSignal.timeout(12000),body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:args}})});
  const raw=await r.text();if(raw.length>262144)throw error("upstream_unavailable",502);
  let d;try{d=JSON.parse(raw);}catch{throw error("upstream_unavailable",502);}
  if(!r.ok||d.error)throw error("upstream_unavailable",502);
  const result=d.result;if(result?.isError)throw error("device_rejected",409);
  const item=result?.content?.find(c=>c.type==="text");let value;
  try{value=JSON.parse(item.text);}catch{throw error("upstream_unavailable",502);}
  return value;
}
async function inventory(env,xpacio) {
  if(!STORE.test(xpacio))throw error("invalid_xpacio");
  if(!env.INCIDENT_DESK?.fetch)throw error("inventory_unavailable",503);
  const r=await env.INCIDENT_DESK.fetch(new Request("https://yokup-api.internal/internal/itil/xpacios/"+encodeURIComponent(xpacio)));
  const d=await r.json();
  if(r.status===404||d.xpacio?.removed_at)throw error("xpacio_not_found",404);
  if(!r.ok||d.ok!==true||d.xpacio?.admira_store_id!==xpacio||!Array.isArray(d.cis))throw error("inventory_unavailable",502);
  return d.cis.filter(c=>c.lifecycle?.status!=="retired");
}
async function registered(fetchImpl=fetch) {
  const r=await fetchImpl(SIGNAGE,{cache:"no-store",redirect:"manual",signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw error("telemetry_unavailable",502);
  const d=await r.json();if(!Array.isArray(d.screens))throw error("telemetry_unavailable",502);
  return d.screens.filter(s=>SCREEN.test(s.screen||"")&&s.player_type!=="virtual"&&!/^(?:xtore-)?virtual-/.test(s.screen));
}
function sanitizedStatus(status,screen,now) {
  if(status?.screen!==screen)throw error("telemetry_identity_mismatch",502);
  const seen=Number(status.last_seen)||null,playing=status.playing;
  return {screen,source:"player_status",observed_at:now,last_seen:seen,recent:recentSignal(status,now),
    standby:typeof status.standby==="boolean"?status.standby:null,
    playing:playing&&typeof playing==="object"?{id:clip(playing.id),title:clip(playing.title),type:clip(playing.type,32),started_at:Number(playing.startedAt)||null}:null,
    software:status.software&&typeof status.software==="object"?{player:clip(status.software.player,80),version:clip(status.software.version,80)}:null,
    capabilities:{remote_commands:status.capabilities?.remote_commands===true},
    note:"Señal del reproductor; no acredita encendido físico del panel."};
}
function publicBinding(row) {return row?{code:row.code,screen:row.screen,label:row.label,scope:row.scope,updated_at:row.updated_at}:null;}
function publicOrder(row,extra={}) {return {id:row.id,xpacio:row.xpacio,code:row.code,screen:row.screen,command:row.command,status:row.status,created_at:row.created_at,updated_at:row.updated_at,...extra};}
async function body(req) {
  const raw=await req.text();if(raw.length>4096)throw error("body_too_large",413);
  try{const b=JSON.parse(raw);if(!b||typeof b!=="object"||Array.isArray(b))throw Error();return b;}catch{throw error("invalid_json");}
}
export async function handleSupervisorDevices(req,env,{session,access,json,fetchImpl=fetch,rpc=deviceRpc,now=Date.now()}) {
  const reply=(value,status=200)=>{const r=json(value,status);r.headers.set("Cache-Control","no-store");return r;};
  if(!canManageDevices(session,access))return reply({ok:false,error:"control_forbidden"},403);
  const url=new URL(req.url),path=url.pathname,actor=session.email;
  try {
    await schema(env.DB);
    if(path==="/supervisor/devices" && req.method==="GET") {
      const rows=await registered(fetchImpl);
      return reply({ok:true,generated_at:now,devices:rows.slice(0,80).map(s=>({screen:s.screen,name:clip(s.name||s.screen),runtime:clip(s.player,80),last_seen:Number(s.last_seen)||null,source:"physical_registry"}))});
    }
    if(path==="/supervisor/connections" && req.method==="GET") {
      const xpacio=url.searchParams.get("xpacio")||"";const cis=await inventory(env,xpacio);
      const rows=(await env.DB.prepare("SELECT * FROM supervisor_device_bindings WHERE xpacio=?").bind(xpacio).all()).results||[];
      const codes=new Set(cis.map(c=>c.itil_code)),bindings=rows.filter(r=>codes.has(r.code));
      const orders=(await env.DB.prepare("SELECT * FROM supervisor_device_commands WHERE xpacio=? AND actor=? ORDER BY created_at DESC LIMIT 200").bind(xpacio,actor).all()).results||[];
      const latest=new Map();for(const order of orders)if(!latest.has(order.code))latest.set(order.code,publicOrder(order));
      const connections=[];
      const read=async row=>{
        const base={...publicBinding(row),last_order:latest.get(row.code)||null,control_configured:Boolean(env.SUPERVISOR_PLAYER_KEY)};
        try{const status=await rpc(env,"player_status",{screen:row.screen},{fetchImpl});return {...base,telemetry:sanitizedStatus(status,row.screen,now)};}
        catch{return {...base,telemetry:null,error:"telemetry_unavailable"};}
      };
      for(let i=0;i<Math.min(bindings.length,40);i+=4)connections.push(...await Promise.all(bindings.slice(i,i+4).map(read)));
      return reply({ok:true,xpacio,generated_at:now,connections});
    }
    if(path==="/supervisor/connections" && req.method==="POST") {
      const b=await body(req);if(Object.keys(b).some(k=>!["xpacio","code","screen","label","scope"].includes(k)))throw error("invalid_fields");
      const xpacio=clip(b.xpacio),code=clip(b.code,52);if(!CODE.test(code))throw error("invalid_code");
      const cis=await inventory(env,xpacio);if(!cis.some(c=>c.itil_code===code))throw error("ci_not_found",404);
      if(b.screen===null){await env.DB.prepare("DELETE FROM supervisor_device_bindings WHERE xpacio=? AND code=?").bind(xpacio,code).run();return reply({ok:true,removed:true});}
      if(!cis.some(c=>c.itil_code===code&&["pantalla","tpv"].includes(c.category)))throw error("player_category_required",409);
      if(!SCREEN.test(b.screen||"")||b.scope!=="demo")throw error("invalid_binding");
      const rows=await registered(fetchImpl);if(!rows.some(r=>r.screen===b.screen))throw error("physical_device_not_registered",409);
      const conflict=await env.DB.prepare("SELECT xpacio,code FROM supervisor_device_bindings WHERE screen=?").bind(b.screen).first();
      if(conflict&&(conflict.xpacio!==xpacio||conflict.code!==code))throw error("device_already_bound",409);
      const label=clip(b.label,80)||b.screen;
      await env.DB.prepare(`INSERT INTO supervisor_device_bindings(xpacio,code,screen,label,scope,actor,updated_at) VALUES(?,?,?,?,'demo',?,?)
        ON CONFLICT(xpacio,code) DO UPDATE SET screen=excluded.screen,label=excluded.label,scope=excluded.scope,actor=excluded.actor,updated_at=excluded.updated_at`).bind(xpacio,code,b.screen,label,actor,now).run();
      return reply({ok:true,binding:{code,screen:b.screen,label,scope:"demo",updated_at:now}});
    }
    if(path==="/supervisor/command" && req.method==="POST") {
      const b=await body(req);if(Object.keys(b).some(k=>!["xpacio","code","command","request_id"].includes(k)))throw error("invalid_fields");
      if(!STORE.test(b.xpacio||"")||!CODE.test(b.code||"")||!UUID.test(b.request_id||"")||!DEVICE_COMMANDS.includes(b.command))throw error("invalid_command");
      const prior=await env.DB.prepare("SELECT * FROM supervisor_device_commands WHERE id=?").bind(b.request_id).first();
      if(prior){if(prior.actor!==actor||prior.xpacio!==b.xpacio||prior.code!==b.code||prior.command!==b.command)throw error("request_conflict",409);return reply({ok:true,order:publicOrder(prior)},202);}
      const cis=await inventory(env,b.xpacio);if(!cis.some(c=>c.itil_code===b.code))throw error("ci_not_found",404);
      const binding=await env.DB.prepare("SELECT * FROM supervisor_device_bindings WHERE xpacio=? AND code=?").bind(b.xpacio,b.code).first();
      if(!binding)throw error("device_not_bound",409);if(!env.SUPERVISOR_PLAYER_KEY)throw error("control_unconfigured",503);
      const rows=await registered(fetchImpl);if(!rows.some(s=>s.screen===binding.screen))throw error("physical_device_not_registered",409);
      const status=await rpc(env,"player_status",{screen:binding.screen},{fetchImpl});
      if(status.screen!==binding.screen||!recentSignal(status,now)||status.capabilities?.remote_commands!==true)throw error("device_without_recent_signal",409);
      const order={id:b.request_id,xpacio:b.xpacio,code:b.code,screen:binding.screen,command:b.command,actor,status:"sending",created_at:now,updated_at:now};
      const reserved=await env.DB.prepare(`INSERT OR IGNORE INTO supervisor_device_commands(id,xpacio,code,screen,command,actor,status,created_at,updated_at)
        SELECT ?,?,?,?,?,?,'sending',?,? WHERE NOT EXISTS (SELECT 1 FROM supervisor_device_commands WHERE screen=? AND status IN ('sending','queued'))`).bind(order.id,order.xpacio,order.code,order.screen,order.command,actor,now,now,order.screen).run();
      if(!Number(reserved.meta?.changes))throw error("command_in_progress",409);
      let receipt=null;
      try {
        receipt=await rpc(env,"player_command",{screen:order.screen,command:order.command},{write:true,fetchImpl});
        if(receipt.screen!==order.screen||receipt.command!==order.command||!UUID.test(receipt.action||"")||!Number.isSafeInteger(receipt.cid)||receipt.cid<1||receipt.status!=="queued")throw Error("invalid_receipt");
        order.status="queued";
      } catch {order.status="unknown";receipt=null;}
      await env.DB.prepare("UPDATE supervisor_device_commands SET status=?,receipt=?,updated_at=? WHERE id=?").bind(order.status,receipt?JSON.stringify(receipt):null,now,order.id).run();
      return reply({ok:true,order:publicOrder(order)},202);
    }
    if(path==="/supervisor/command" && req.method==="GET") {
      const id=url.searchParams.get("id")||"";if(!UUID.test(id))throw error("invalid_request_id");
      const row=await env.DB.prepare("SELECT * FROM supervisor_device_commands WHERE id=? AND actor=?").bind(id,actor).first();if(!row)throw error("order_not_found",404);
      if(row.status==="sending"&&now-row.created_at>20000){row.status="unknown";row.updated_at=now;await env.DB.prepare("UPDATE supervisor_device_commands SET status=?,updated_at=? WHERE id=?").bind(row.status,now,row.id).run();}
      if(row.status!=="queued"||!row.receipt)return reply({ok:true,order:publicOrder(row)});
      const receipt=JSON.parse(row.receipt);let result;
      try{result=await rpc(env,"player_command_status",{screen:row.screen,command:row.command,action:receipt.action,cid:receipt.cid},{fetchImpl});}
      catch{return reply({ok:true,order:publicOrder(row),poll_error:"ack_unavailable"});}
      if(result.screen!==row.screen||result.command!==row.command||result.action!==receipt.action||result.cid!==receipt.cid)throw error("ack_identity_mismatch",502);
      const status=["executed","failed","ignored","pending","unknown"].includes(result.status)?result.status:"unknown";
      if(status!=="pending") {row.status=status;row.updated_at=now;await env.DB.prepare("UPDATE supervisor_device_commands SET status=?,updated_at=? WHERE id=?").bind(status,now,row.id).run();}
      return reply({ok:true,order:publicOrder(row,{executed:status==="executed",applied_at:Number(result.appliedAt)||null})});
    }
    return reply({ok:false,error:"method_not_allowed"},405);
  } catch(e) {return reply({ok:false,error:e.code||"device_service_unavailable"},e.status||502);}
}
