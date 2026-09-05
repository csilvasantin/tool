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
    if(parsed.suffix&&canonicalMachineSuffix(parsed.suffix)!=='GrokBot'||!at||at>now+5000||now>=at+GROKBOT_PRESENCE_TTL_MS)continue;
    const family=reportAgentFamily(row.persona,'GrokBot').family_key;
    if(!family.endsWith('@grokbot')||family.startsWith('external:'))continue;
    result.set(family,Math.max(result.get(family)||0,at));
  }
  return result;
}

// Only a currently executing canonical task qualifies. Ticket creation, generic
// mission heartbeats, completed steps and unrelated service activity do not.
export function grokbotTaskActivity({family_key,kind,item,service_presence,now}) {
  if(kind!=='task'||!family_key.endsWith('@grokbot')||!item.mission_id||!item.code||!['in_progress','doing','active'].includes(item.status)||epoch(item.ended_at)||epoch(item.resolved_at))return null;
  const started=epoch(item.started_at),seen=service_presence?.get(family_key)||0;
  if(!started||started>now+5000||!seen||seen>now+5000)return null;
  const expires=Math.min(started+GROKBOT_WORK_TTL_MS,seen+GROKBOT_PRESENCE_TTL_MS);
  if(now>=expires)return null;
  return {activity_basis:'grokbot_task_progress',activity_at:started,activity_expires_at:expires,
    service_observed_at:seen,service_surface:'app',runtime:'Grok',host:'app',reachable:true};
}
