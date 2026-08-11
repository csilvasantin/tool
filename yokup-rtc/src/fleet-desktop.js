import { AgentStopError, normalizeAgentStopTarget, selectLiveAgentSession } from "./fleet-agent-stop.js";

const STATUSES = new Set(["queued", "running", "done", "failed"]);

function commandId(value) {
  const id = String(value == null ? "" : value).trim();
  if (!id || id.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new AgentStopError("invalid-desktop-command", 400);
  return id;
}

function requireBinding(env) {
  if (!env || !env.TELEGRAM || typeof env.TELEGRAM.fetch !== "function") throw new AgentStopError("telegram-binding-unavailable", 503);
}

function rows(payload) {
  return Array.isArray(payload) ? payload : (payload && (payload.presence || payload.rows)) || [];
}

function epochSeconds(value) {
  const n=Number(value || 0); return n > 4102444800 ? Math.floor(n / 1000) : Math.floor(n);
}

function desktopTarget(input) {
  const target=normalizeAgentStopTarget(input);
  if(target.host!=="app")throw new AgentStopError("desktop-command-requires-app",400);
  return target;
}

async function verifiedTarget(env,input) {
  requireBinding(env);const target=desktopTarget(input);let response;
  try{response=await env.TELEGRAM.fetch(new Request("https://telegram/api/presence",{headers:{accept:"application/json"}}));}
  catch{throw new AgentStopError("presence-unavailable",502);}
  if(!response.ok)throw new AgentStopError("presence-unavailable",502);
  let payload;try{payload=await response.json();}catch{throw new AgentStopError("presence-invalid",502);}
  const now=epochSeconds(payload&&payload.now)||Math.floor(Date.now()/1000),session=selectLiveAgentSession(rows(payload),target,now);
  return {machine:String(session.machine||"").trim(),persona:String(session.persona||"").trim(),runtime:String(session.runtime||"").trim(),host:"app",session_id:String(session.session_id||"").trim(),pid:Number(session.pid)};
}

async function postInternal(env,path,body,errorCode) {
  requireBinding(env);let response;
  try{response=await env.TELEGRAM.fetch(new Request("https://telegram"+path,{method:"POST",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify(body)}));}
  catch{throw new AgentStopError(errorCode+"-unavailable",502);}
  let result={};try{result=await response.json();}catch{}
  if(!response.ok)throw new AgentStopError(String(result.error||errorCode+"-rejected"),response.status===400?400:response.status===404?404:response.status===409?409:502);
  return result;
}

export async function dispatchDesktopCapture(env,input) {
  const target=await verifiedTarget(env,input),rawWindow=Number(input&&input.window_id||0);
  const body={...target};if(Number.isSafeInteger(rawWindow)&&rawWindow>0)body.window_id=rawWindow;
  const result=await postInternal(env,"/api/fleet/desktop/capture",body,"desktop-capture");
  return {target,result:{ok:true,command_id:commandId(result.command_id||result.id),status:String(result.status||"queued"),coalesced:result.coalesced===true}};
}

export async function clearDesktopCapture(env,input) {
  const target=desktopTarget(input);
  await postInternal(env,"/api/fleet/desktop/capture/clear",target,"desktop-capture-clear");
  return {ok:true,cleared:true};
}

export async function authorizeDesktopCaptureClear(db,input,owner) {
  const target=desktopTarget(input),requestedBy=String(owner||"").trim().toLowerCase();
  if(!requestedBy)throw new AgentStopError("desktop-capture-clear-forbidden",403);
  const audit=await db.prepare(
    "SELECT id FROM fleet_agent_commands WHERE action='desktop_capture' AND machine=? AND persona=? AND runtime=? AND host='app' AND session_id=? AND pid=? AND lower(requested_by)=? ORDER BY created_at DESC LIMIT 1"
  ).bind(target.machine,target.persona,target.runtime,target.session_id,target.pid,requestedBy).first();
  if(!audit)throw new AgentStopError("desktop-capture-clear-forbidden",403);
  return target;
}

export async function dispatchDesktopWrite(env,input) {
  const target=await verifiedTarget(env,input),text=String(input&&input.text||"");
  if(!text.trim()||text.length>1600||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))throw new AgentStopError("invalid-desktop-text",400);
  const result=await postInternal(env,"/api/fleet/desktop/write",{...target,text},"desktop-write");
  return {target,result:{ok:true,command_id:commandId(result.command_id||result.id),status:String(result.status||"queued")}};
}

export async function readDesktopResult(env,id,expectedAction) {
  requireBinding(env);const safeId=commandId(id),capture=expectedAction==="capture";
  const path=capture?"/api/fleet/desktop/capture/consume":"/api/fleet/agent/commands/"+encodeURIComponent(safeId);
  let response;
  try{response=await env.TELEGRAM.fetch(new Request("https://telegram"+path,capture?{method:"POST",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify({id:Number(safeId)})}:{headers:{accept:"application/json"}}));}
  catch{throw new AgentStopError("desktop-status-unavailable",502);}
  let payload={};try{payload=await response.json();}catch{}
  if(!response.ok)throw new AgentStopError(response.status===404?"desktop-command-not-found":"desktop-status-unavailable",response.status===404?404:502);
  const command=payload.command||payload,status=String(command.status||"").toLowerCase(),action=String(command.action||"").toLowerCase();
  if(!STATUSES.has(status))throw new AgentStopError("desktop-status-invalid",502);
  if(action!==(capture?"desktop_capture":"desktop_write"))throw new AgentStopError("desktop-command-mismatch",409);
  let output={};try{output=JSON.parse(String(command.output||command.result||"{}"));}catch{}
  const result={ok:status!=="failed",command_id:safeId,status,error:String(command.error||"").slice(0,300),updated_at:Number(command.updated_at||0)||null};
  if(capture&&status==="done"){
    const image=String(output.image||"");
    if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>57000)throw new AgentStopError("desktop-frame-invalid",502);
    Object.assign(result,{image,captured_at:Number(output.captured_at||0),window_id:Number(output.window_id||0)});
  }
  if(!capture&&status==="done")result.delivered=output.delivered===true;
  return result;
}
