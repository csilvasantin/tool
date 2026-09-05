import { canonicalMachineSuffix, parseAgentIdentity, reportAgentFamily, machineSuffix } from './agent-identity.js';
const epoch=value=>{if(value===null||value===undefined||value==='')return 0;const n=Number(value);return Number.isFinite(n)&&n>0?(n<1e11?n*1000:n):0;};
// Read-only projection: process reachability alone is never a turn of work.
export function desktopTurnParticipant(row,now=Date.now()) {
  const turn=row?.app_turn,at=epoch(row?.updated),pid=Number(row?.pid),birth=epoch(row?.process_birth);
  if(!turn || row.host!=='app' || row.source!=='process_snapshot' || row.verified!==1 ||
    row.online===false || row.online===0 || ['closed','unknown'].includes(row.process_state) ||
    !row.session_id||!Number.isSafeInteger(pid)||pid<=1||!birth||at<now-30000||at>now+5000)return null;
  const basis={Claude:'claude_desktop_transcript',Codex:'codex_desktop_turn_store'}[row.runtime];
  const start=epoch(turn.started_at),observed=epoch(turn.observed_at),end=epoch(turn.ended_at);
  if(!basis||turn.basis!==basis||turn.state!=='active'||end||!start||!observed||
    !/^[a-f0-9]{64}$/.test(turn.turn_key||'')||epoch(turn.process_birth)!==birth||start<birth||
    start>observed||observed<now-120000||observed>now+5000||start>now+5000)return null;
  const parsed=parseAgentIdentity(row.persona),physical=canonicalMachineSuffix(machineSuffix(row.machine));
  if(!physical||!parsed.persona||parsed.suffix&&canonicalMachineSuffix(parsed.suffix)!==physical)return null;
  const family=reportAgentFamily(parsed.persona,physical);
  if(family.family_key.startsWith('external:'))return null;
  return {family_key:family.family_key,agent:family.family_name,executor:family.family_name,machine:physical,
    kind:'session',reference:'',title:'Actividad Desktop APP',state:'running',reachable:true,
    runtime:row.runtime,session_id:String(row.session_id),process_birth:birth,host:'app',session_surface:'app',session_state:'open',session_basis:'verified_app_turn',
    activity_basis:basis,activity_at:observed,activity_expires_at:Math.min(at+30000,observed+120000),
    work_started_at:start,work_progress_at:observed,ended_at:null,elapsed_ms:now-start,timing_basis:'desktop_turn',
    race_revision:'session:'+turn.turn_key,active_at:observed,presence_at:at,assignment_priority:0};
}
export function desktopTurnParticipants(rows,now=Date.now()) {
  const groups=new Map();
  for(const row of rows||[]){const candidate=desktopTurnParticipant(row,now);if(!candidate)continue;
    const group=groups.get(candidate.family_key)||new Map();
    group.set([row.pid,row.process_birth,candidate.runtime,candidate.race_revision].join('|'),candidate);groups.set(candidate.family_key,group);}
  // Two simultaneous sessions in one family are ambiguous; do not choose one.
  return [...groups.values()].filter(group=>group.size===1).map(group=>[...group.values()][0]);
}
