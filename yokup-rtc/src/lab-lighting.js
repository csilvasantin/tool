// One fixed Lab. Hue credentials stay on the local controller, never in the client/API.
const owners = new Set(['csilvasantin@gmail.com', 'csilva@admira.com']);
const operator = 'agentes@silicio.admiranext.com';
const origins = new Set(['https://www.admira.app', 'https://admira.app']);
const json = (data, status = 200) => Response.json(data, {status, headers:{'cache-control':'no-store'}});
export const LAB_LEVELS = Object.freeze({normal:100, incident:0, bugito:25, supervisor:75, admirito:50});
export const LAB_RGB = Object.freeze({normal:'white', incident:'yellow', bugito:'red', supervisor:'green', admirito:'white'});
export function labLightingDesired(selection, tickets) {
  const active = tickets.filter(t => !['resolved','cancelled'].includes(t.status));
  const opened = Math.max(0, ...active.map(t => Number(t.created_at) || 0));
  const closed = Math.max(0, ...tickets.filter(t => ['resolved','cancelled'].includes(t.status)).map(t => Number(t.resolved_at || t.updated_at) || 0));
  const at = Number(selection?.created_at) || 0;
  let state;
  // A new canonical incident/closure supersedes an earlier mascot invocation.
  if (Math.max(opened, closed) >= at && Math.max(opened, closed) > 0) state = active.length ? 'incident' : 'normal';
  else if (selection?.mascot && selection.mascot !== 'normal') state = selection.mascot;
  else state = active.length ? 'incident' : 'normal';
  return {site:'admiranext-lab-gran-de-gracia-primera', state, intensity:LAB_LEVELS[state], rgb:LAB_RGB[state], active_incidents:active.length,
    revision:[selection?.id || 0, opened, closed, active.map(t=>t.id).sort().join(',')].join(':')};
}
export async function handleLabLighting(req, env, deps) {
  const response=await handle(req,env,deps);
  const origin=req.headers.get('origin');
  if(origins.has(origin)) { response.headers.set('Access-Control-Allow-Origin',origin); response.headers.set('Access-Control-Allow-Credentials','true'); response.headers.set('Vary','Origin'); }
  return response;
}
async function handle(req, env, {requireAuth, ensureSchema}) {
  const origin = req.headers.get('origin');
  if (origin && !origins.has(origin)) return json({error:'origin_not_allowed'},403);
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
  const session = await requireAuth(env, req);
  if (!session?.email) return json({error:'unauthorized'},401);
  const owner = session.email.toLowerCase();
  if (!owners.has(owner) && !(owner === operator && !session.conversation_device)) return json({error:'lab_owner_required'},403);
  if (session.conversation_device && !['Admirito iOS','Admirito Android'].includes(session.conversation_device_label)) return json({error:'lab_device_scope_required'},403);
  await ensureSchema(env);
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS lab_lighting_selections (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL UNIQUE, owner TEXT NOT NULL, mascot TEXT NOT NULL, created_at INTEGER NOT NULL)').run();
  if (req.method === 'POST') {
    if (Number(req.headers.get('content-length')) > 1000) return json({error:'too_large'},413);
    const raw=await req.text(); if(raw.length>1000)return json({error:'too_large'},413);
    let body; try { body=JSON.parse(raw); } catch { return json({error:'bad_json'},400); }
    if (!body || !['normal','admirito','bugito','supervisor'].includes(body.mascot) || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.request_id || '')) return json({error:'invalid_selection'},400);
    const replay=await env.DB.prepare('SELECT mascot,owner FROM lab_lighting_selections WHERE request_id=?').bind(body.request_id).first();
    if (replay && (replay.owner!==owner || replay.mascot!==body.mascot)) return json({error:'request_conflict'},409);
    if (!replay) {
      const count=await env.DB.prepare('SELECT COUNT(*) n FROM lab_lighting_selections WHERE owner=? AND created_at>?').bind(owner,Date.now()-60000).first();
      if (count.n >= 30) return json({error:'selection_rate_limit'},429);
      await env.DB.prepare('INSERT OR IGNORE INTO lab_lighting_selections(request_id,owner,mascot,created_at) VALUES(?,?,?,?)').bind(body.request_id,owner,body.mascot,Date.now()).run();
    }
  } else if (req.method !== 'GET') return json({error:'method_not_allowed'},405);
  const selected=await env.DB.prepare('SELECT id,mascot,created_at FROM lab_lighting_selections ORDER BY id DESC LIMIT 1').first();
  // Fixed laboratory inventory only; other locations and fleet missions never affect the ceiling.
  const tickets=(await env.DB.prepare("SELECT id,status,created_at,updated_at,resolved_at FROM tickets WHERE screen LIKE 'supervisor:gran-de-gracia:%' OR screen LIKE 'supervisor:admirito-fold:%' OR screen='virtual-lab-admirito-fold'").all()).results || [];
  return json({...labLightingDesired(selected,tickets), queued:true, physical_verified:false});
}
