import { agentFamilyKey, groupingIdentityKey, machineIdentityKey, parseAgentIdentity, scopedAgentIdentity } from './agent-identity.js';
import { assessOnIdleProposal, onIdleProposalTitleKey } from './onidle-proposals.js';

export const MODE_HOUR_MS = 3600000;
const MODES = new Set(['manual', 'learning', 'training']);
const text = value => String(value == null ? '' : value).trim();
const seconds = value => Number(value) > 4102444800 ? Number(value) / 1000 : Number(value);
export function hourlySlot(now = Date.now()) { return Math.floor(now / MODE_HOUR_MS) * MODE_HOUR_MS; }
export function normalizeModeTarget(body = {}) {
  const persona = text(body.persona || body.agent), machine = text(body.machine);
  const runtime = text(body.runtime), host = text(body.host).toLowerCase();
  if (!persona || !machine || !runtime || !['app', 'cli'].includes(host) || [persona,machine,runtime].some(v => v.length > 120 || /[\u0000-\u001f]/.test(v))) {
    throw Object.assign(new Error('exact_target_required'), {status:400});
  }
  return {agent:scopedAgentIdentity(persona,machine), persona:parseAgentIdentity(persona).persona || persona, machine, runtime, host};
}
export function modeTargetKey(target) {
  return [groupingIdentityKey(target.agent || target.persona,target.machine),machineIdentityKey(target.machine),text(target.runtime).toLowerCase(),text(target.host).toLowerCase()].join('|');
}
function sameTarget(row, target) {
  return modeTargetKey({...row,host:row.host || row.surface}) === modeTargetKey(target);
}
export function evaluateModeOpportunity(pref, telemetry = {}, activity = {}, now = Date.now()) {
  if (!pref || pref.mode === 'manual') return {eligible:false,status:'manual',reason:'manual'};
  if (activity.busy) return {eligible:false,status:'waiting',reason:activity.reason || 'active_mission'};
  const machine = (telemetry.control_machines || []).find(row => machineIdentityKey(row.machine) === machineIdentityKey(pref.machine));
  const sample = seconds(machine && (machine.updated || machine.updated_at));
  if (!machine || !sample || now/1000-sample > 30 || sample > now/1000+5) return {eligible:false,status:'unavailable',reason:'telemetry_unavailable'};
  const humanAt = seconds(machine.human_sampled_at);
  if (!Number.isFinite(machine.human_idle_seconds) || !humanAt || now/1000-humanAt>30 || humanAt>now/1000+5) return {eligible:false,status:'unavailable',reason:'human_activity_unknown'};
  if (machine.human_idle_seconds < 300) return {eligible:false,status:'waiting',reason:'human_active'};
  const live = (telemetry.presence || []).filter(row => sameTarget(row,pref) && row.source==='process_snapshot' && (row.verified===true || row.verified===1) && row.online!==false && row.online!==0 && seconds(row.updated)>0 && now/1000-seconds(row.updated)<=30 && seconds(row.updated)<=now/1000+5);
  if (live.length>1) return {eligible:false,status:'unavailable',reason:'ambiguous_surface'};
  const capabilities = Array.isArray(machine.capabilities) ? machine.capabilities : [];
  const needed = pref.host==='app' ? 'desktop_write' : 'hourly_cli_'+pref.runtime.toLowerCase();
  if (!capabilities.includes(needed) || !capabilities.includes('hourly_modes')) return {eligible:false,status:'unavailable',reason:'consumer_unavailable'};
  if (pref.host==='app' && !capabilities.includes('hourly_desktop_'+pref.runtime.toLowerCase())) return {eligible:false,status:'unavailable',reason:'consumer_unavailable'};
  if (pref.host==='cli') {
    if ((machine.slots || []).filter(row=>sameTarget({...row,machine:machine.machine},pref)).length!==1) return {eligible:false,status:'unavailable',reason:'surface_not_configured'};
    if (!(machine.hourly_targets || []).some(row=>sameTarget({...row,machine:row.machine || machine.machine},pref))) return {eligible:false,status:'unavailable',reason:'consumer_unavailable'};
    return {eligible:true,status:live.length?'open':'closed',reason:'isolated_runner_ready',target:{...pref},start:false};
  }
  if (!live.length) {
    const slots=(machine.slots || []).filter(row=>sameTarget({...row,machine:machine.machine},pref));
    if (slots.length!==1) return {eligible:false,status:'unavailable',reason:'surface_not_configured'};
    return {eligible:true,status:'closed',reason:'start_required',target:{...slots[0],machine:machine.machine},start:true};
  }
  const row=live[0];
  if (row.busy===true || row.human_active===true) return {eligible:false,status:'waiting',reason:'agent_busy'};
  if (!row.session_id || !Number.isSafeInteger(Number(row.pid)) || Number(row.pid)<2) return {eligible:false,status:'unavailable',reason:'target_unverified'};
  return {eligible:true,status:'open',reason:'ready',target:row,start:false};
}

export async function ensureHourlyModeSchema(env) {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS fleet_agent_modes (identity_key TEXT PRIMARY KEY, agent TEXT NOT NULL, persona TEXT NOT NULL, machine TEXT NOT NULL, runtime TEXT NOT NULL, host TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'manual', project_id TEXT NOT NULL DEFAULT '', requested_by TEXT NOT NULL, enabled_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, next_run INTEGER, status TEXT NOT NULL DEFAULT 'manual', reason TEXT NOT NULL DEFAULT 'manual')");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS fleet_agent_mode_runs (id TEXT PRIMARY KEY, identity_key TEXT NOT NULL, hour_start INTEGER NOT NULL, mode TEXT NOT NULL, project_id TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', command_id TEXT, decision_id TEXT, capsule_id TEXT, deliverable_url TEXT, evidence_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(identity_key,hour_start))");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS fleet_hourly_work (run_id TEXT PRIMARY KEY, mission_id TEXT UNIQUE NOT NULL, transcript TEXT, publish_claim INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)");
  await env.DB.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_hourly_capsule_once ON fleet_agent_mode_runs(capsule_id) WHERE capsule_id IS NOT NULL');
  await env.DB.exec('CREATE TABLE IF NOT EXISTS fleet_hourly_family_leases (family_key TEXT PRIMARY KEY, run_id TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL)');
}
export async function listAgentModes(env) {
  await ensureHourlyModeSchema(env);
  const [modes,runs]=await Promise.all([
    env.DB.prepare("SELECT m.*,p.name project_name FROM fleet_agent_modes m LEFT JOIN projects p ON p.id=m.project_id ORDER BY m.agent,m.machine,m.runtime,m.host").all(),
    env.DB.prepare("SELECT r.* FROM fleet_agent_mode_runs r JOIN (SELECT identity_key,MAX(hour_start) hour_start FROM fleet_agent_mode_runs GROUP BY identity_key) latest ON latest.identity_key=r.identity_key AND latest.hour_start=r.hour_start").all()
  ]);
  const last=new Map((runs.results || []).map(row=>[row.identity_key,row]));
  return (modes.results || []).map(row=>{
    row.last_run=last.get(row.identity_key) || null;
    row.project_name=row.project_name || row.project_id;
    delete row.requested_by;
    return row;
  });
}

export async function saveAgentMode(env, body, requestedBy, projectFor, now = Date.now()) {
  const target=normalizeModeTarget(body), mode=text(body.mode).toLowerCase();
  if (!MODES.has(mode)) throw Object.assign(new Error('invalid_mode'),{status:400});
  const project=mode==='manual'?null:await projectFor(target,body.project_id || '',now);
  if (mode!=='manual' && !project?.id) throw Object.assign(new Error('project_required'),{status:409});
  await ensureHourlyModeSchema(env);
  const key=modeTargetKey(target), previous=await env.DB.prepare('SELECT * FROM fleet_agent_modes WHERE identity_key=?').bind(key).first();
  // Saving the same selection cannot postpone its next opportunity.
  const next=mode==='manual'?null:previous?.mode===mode && previous.project_id===project.id ? previous.next_run : hourlySlot(now)+MODE_HOUR_MS;
  await env.DB.prepare("INSERT INTO fleet_agent_modes (identity_key,agent,persona,machine,runtime,host,mode,project_id,requested_by,enabled_at,updated_at,next_run,status,reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(identity_key) DO UPDATE SET agent=excluded.agent,persona=excluded.persona,machine=excluded.machine,runtime=excluded.runtime,host=excluded.host,mode=excluded.mode,project_id=excluded.project_id,requested_by=excluded.requested_by,enabled_at=excluded.enabled_at,updated_at=excluded.updated_at,next_run=excluded.next_run,status=excluded.status,reason=excluded.reason")
    .bind(key,target.agent,target.persona,target.machine,target.runtime,target.host,mode,project?.id || '',text(requestedBy),previous?.mode===mode?previous.enabled_at:now,now,next,mode==='manual'?'manual':'scheduled',mode==='manual'?'manual':'next_hour').run();
  return (await listAgentModes(env)).find(row=>row.identity_key===key);
}
async function runId(key,hour) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key+'|'+hour));
  return 'HMODE-'+Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,28);
}
export async function runHourlyModes(env, adapters, now = Date.now()) {
  await ensureHourlyModeSchema(env);
  // Ambiguous dispatches are never retried: expire their bookkeeping, then the
  // next hour still has to pass live activity and human guards independently.
  await env.DB.prepare("UPDATE fleet_agent_mode_runs SET status='failed',reason='delivery_timeout',updated_at=? WHERE status IN ('reserved','starting','resuming','dispatched','awaiting_delivery','completing') AND created_at<?")
    .bind(now,now-45*60000).run();
  await env.DB.prepare('DELETE FROM fleet_hourly_family_leases WHERE expires_at<=?').bind(now).run();
  if (adapters.resume) await adapters.resume(now);
  const prefs=(await env.DB.prepare("SELECT * FROM fleet_agent_modes WHERE mode IN ('learning','training') ORDER BY identity_key").all()).results || [];
  if (!prefs.length) return {ok:true,results:[]};
  const telemetry=await adapters.readTelemetry(), hour=hourlySlot(now), results=[];
  for (const pref of prefs) {
    if (Number(pref.next_run)>hour) continue;
    const id=await runId(pref.identity_key,hour);
    // One attempt per current hour only. The UNIQUE index also covers mode changes.
    const insert=await env.DB.prepare("INSERT OR IGNORE INTO fleet_agent_mode_runs (id,identity_key,hour_start,mode,project_id,status,reason,created_at,updated_at) VALUES (?,?,?,?,?,'reserved','evaluating',?,?)").bind(id,pref.identity_key,hour,pref.mode,pref.project_id,now,now).run();
    if (!insert.meta?.changes) continue;
    let result;
    try {
      const project=await adapters.projectFor(pref,pref.project_id,now);
      if (!project?.id || project.id!==pref.project_id) result={status:'skipped',reason:'principal_project_changed'};
      else {
        const pending=await env.DB.prepare("SELECT id FROM fleet_agent_mode_runs WHERE identity_key=? AND id<>? AND status IN ('reserved','starting','resuming','dispatched','awaiting_delivery') LIMIT 1").bind(pref.identity_key,id).first();
        const activity=pending?{busy:true,reason:'previous_run_pending'}:await adapters.activityFor(pref,project,now);
        const eligibility=evaluateModeOpportunity(pref,telemetry,activity,now);
        if (!eligibility.eligible) result={status:'skipped',reason:eligibility.reason};
        else {
          const current=await env.DB.prepare('SELECT * FROM fleet_agent_modes WHERE identity_key=?').bind(pref.identity_key).first();
          if (!current || current.mode!==pref.mode || current.project_id!==pref.project_id || current.updated_at!==pref.updated_at) result={status:'skipped',reason:'preference_changed'};
          else {
            const family=agentFamilyKey(pref.agent)+'|'+machineIdentityKey(pref.machine);
            const lease=await env.DB.prepare('INSERT INTO fleet_hourly_family_leases(family_key,run_id,expires_at) VALUES(?,?,?) ON CONFLICT(family_key) DO UPDATE SET run_id=excluded.run_id,expires_at=excluded.expires_at WHERE fleet_hourly_family_leases.expires_at<=?')
              .bind(family,id,now+45*60000,now).run();
            result=lease.meta?.changes?await adapters.execute({id,pref,project,eligibility,hour_start:hour,now}):{status:'skipped',reason:'family_busy'};
          }
        }
      }
    } catch (error) { result={status:'failed',reason:text(error.code || error.message || 'execution_failed').slice(0,120)}; }
    await env.DB.prepare("UPDATE fleet_agent_mode_runs SET status=?,reason=?,command_id=?,decision_id=?,deliverable_url=?,updated_at=? WHERE id=?")
      .bind(result.status,result.reason || '',result.command_id || null,result.decision_id || null,result.deliverable_url || null,now,id).run();
    await env.DB.prepare('UPDATE fleet_agent_modes SET next_run=?,status=?,reason=?,updated_at=? WHERE identity_key=? AND mode=?')
      .bind(hour+MODE_HOUR_MS,result.status,result.reason || '',now,pref.identity_key,pref.mode).run();
    if (['skipped','failed','completed'].includes(result.status)) await env.DB.prepare('DELETE FROM fleet_hourly_family_leases WHERE run_id=?').bind(id).run();
    results.push({id,...result});
  }
  return {ok:true,results};
}

export function learningPrompt(run, lesson) {
  return `Modo Learning horario autorizado para ${run.pref.agent} en ${run.pref.machine}, proyecto principal ${run.project.id}. Encargo ${run.id}. Estudia ${lesson}. Crea una cápsula ORIGINAL con aprendizaje útil y aplicación concreta a este proyecto; registra el trabajo en Yokup antes de ejecutarlo. Publica la cápsula en Pixeria (tipo capsula, etiqueta ${run.id.replace(/^HMODE-/, '')}); incluye fuente verificable y al menos 120 caracteres de conocimiento. Al publicar, comunica {run_id:"${run.id}",capsule_id:"ID_REAL"} con POST autenticado https://api.yokup.com/fleet/agent/mode/complete. No afirmes completado sin publicación verificada. No cambies de proyecto ni abras otras misiones; si Carlos interviene, priorízalo y deja el encargo pendiente. Una sola cápsula para esta oportunidad.`;
}

export function trainingPrompt(run) {
  return `Modo Training horario autorizado para ${run.pref.agent} en ${run.pref.machine}, proyecto principal ${run.project.id}. Encargo ${run.id}. El backlog no aporta tres mejoras vigentes. Investiga el estado ACTUAL del proyecto; registra y cierra la investigación en Yokup antes de responder. Propón exactamente 3 mejoras NUEVAS, distintas y mutuamente excluyentes; no implementes ninguna ni repitas tareas cerradas. Cada propuesta lleva title (24-180 caracteres: acción, ruta concreta y métrica verificable), evidence (mínimo80 caracteres de observación concreta), source_url (HTTPS público de ${run.project.web || run.project.id}), observed_at (epoch milisegundos actual). Publica {run_id:"${run.id}",proposals:[{title,evidence,source_url,observed_at},...]} con POST autenticado https://api.yokup.com/fleet/agent/mode/complete. El servidor comprobará las fuentes y abrirá 5 opciones con Volver atrás y Custom. No afirmes ventana creada antes de respuesta ok. Si Carlos interviene, priorízalo. Solo esta oportunidad.`;
}

export function validateTrainingProposals(proposals, project, now = Date.now()) {
  if (!Array.isArray(proposals) || proposals.length!==3) throw Object.assign(new Error('three_fresh_proposals_required'),{status:400});
  let projectUrl;try { const web=text(project.web);if (!web) throw new Error();projectUrl=new URL(/^[a-z][a-z0-9+.-]*:/i.test(web)?web:'https://'+web); } catch { throw Object.assign(new Error('proposal_project_source_required'),{status:409}); }
  const titles=new Set();
  return proposals.map(row=>{
    const title=text(row.title),evidence=text(row.evidence),observed=Number(row.observed_at);
    let url;try { url=new URL(row.source_url); } catch { throw Object.assign(new Error('proposal_source_invalid'),{status:400}); }
    const key=onIdleProposalTitleKey(title);
    if (title.length<12 || title.length>180 || titles.has(key) || /[\u0000-\u001f]/.test(title) || evidence.length<80 || evidence.length>2000 || !observed || now-observed>15*60000 || observed>now+5000) throw Object.assign(new Error('three_fresh_proposals_required'),{status:400});
    if (!assessOnIdleProposal({title,evidence_at:observed},now).ok) throw Object.assign(new Error('proposal_too_generic'),{status:400});
    const repository=projectUrl.hostname==='github.com'?projectUrl.pathname.split('/').filter(Boolean).slice(0,2).join('/'):'';
    const privateHost=!url.hostname.includes('.') || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':') || /(?:\.local|\.internal|\.localhost)$/.test(url.hostname);
    if (url.href.length>2048 || privateHost || url.protocol!=='https:' || url.username || url.password || url.port || url.hostname.replace(/^www\./,'')!==projectUrl.hostname.replace(/^www\./,'') || repository && !url.pathname.startsWith('/'+repository+'/') && url.pathname!=='/'+repository) throw Object.assign(new Error('proposal_source_invalid'),{status:400});
    titles.add(key);return {title,evidence,source_url:url.href,observed_at:observed};
  });
}
