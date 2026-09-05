import { canonicalMachineSuffix, machineSuffix, parseAgentIdentity, reportAgentFamily } from './agent-identity.js';

export const GROKBOT_PRESENCE_TTL_MS = 120000;
export const GROKBOT_WORK_TTL_MS = 20 * 60 * 1000;
const epoch = value => { const n=Number(value); return Number.isFinite(n)&&n>0 ? (n<1e11?n*1000:n) : 0; };

// GrokBot is a service: its heartbeat cannot provide a local Desktop PID.
// This observation alone never starts a runner or credits any work.
export function grokbotServicePresence(rows, now) {
  const result=new Map();
  for(const row of rows || []) {
    if(!row)continue;
    if(canonicalMachineSuffix(machineSuffix(row.machine))!=='GrokBot'||row.host!=='app'||row.runtime!=='Grok'||row.source!=='heartbeat'||row.online===false||row.online===0||row.cli_paused||row.operational_state==='paused')continue;
    const parsed=parseAgentIdentity(row.persona),at=epoch(row.updated);
    if(parsed.suffix&&canonicalMachineSuffix(parsed.suffix)!=='GrokBot'||!at||at>now+5000||now>=at+GROKBOT_WORK_TTL_MS)continue;
    const family=reportAgentFamily(row.persona,'GrokBot').family_key;
    if(!family.endsWith('@grokbot')||family.startsWith('external:'))continue;
    const focus=/^misión (FLT-[0-9]+) · paso ([a-z0-9._-]+) (?:in_progress|doing|active)$/i.exec(String(row.focus||''));
    const observation={at,has_focus:!!String(row.focus||'').trim(),work_ref:focus?`${focus[1]}:${focus[2]}`:''};
    const previous=result.get(family);
    if(at>(previous?.at||0))result.set(family,observation);
    else if(at===previous?.at&&(previous.ambiguous||previous.work_ref!==observation.work_ref||previous.has_focus!==observation.has_focus))result.set(family,{at,ambiguous:true});
  }
  return result;
}

// Only a currently executing canonical task qualifies. Ticket creation, generic
// mission heartbeats, completed steps and unrelated service activity do not.
export function grokbotTaskActivity({family_key,kind,item,service_presence,now}) {
  if(kind!=='task'||!family_key.endsWith('@grokbot')||!item.mission_id||!item.code||!['in_progress','doing','active'].includes(item.status)||epoch(item.ended_at)||epoch(item.resolved_at))return null;
  const started=epoch(item.started_at),observation=service_presence?.get(family_key),seen=observation?.at||0;
  if(observation?.ambiguous||!started||started>now+5000||!seen||seen>now+5000)return null;
  // MCP also emits event-driven presence when a task starts, not a periodic pulse.
  // Its exact task reference corroborates that task until the normal work cutoff.
  const exact=observation?.work_ref===`${item.mission_id}:${item.code}`&&seen>=started-5000;
  if(observation.has_focus&&!exact)return null;
  const expires=Math.min(started+GROKBOT_WORK_TTL_MS,seen+(exact?GROKBOT_WORK_TTL_MS:GROKBOT_PRESENCE_TTL_MS));
  if(now>=expires)return null;
  return {activity_basis:'grokbot_task_progress',activity_at:started,activity_expires_at:expires,
    service_observed_at:seen,service_work_ref:exact?observation.work_ref:null,service_surface:'app',runtime:'Grok',host:'app',reachable:true};
}
