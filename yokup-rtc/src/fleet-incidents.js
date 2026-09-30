// INCIDENCIAS PARA EL MCP DE FLOTA (FLT-101298, Carlos 30-sep-2026).
//
// Hasta hoy los agentes solo podían ABRIR incidencias (POST /incident, público):
// leerlas, anotarlas o cerrarlas exigía la sesión Google del perímetro (/tickets,
// /ticket, /ticket/note, /ticket/status, /tickets/status están en PROTECTED). El MCP
// de https://yokup.com/mcp (worker yokup-site-gate) ya autentica a cada agente con su
// credencial ykm_ o la clave de flota y le da scopes; estas rutas son la mitad de
// yokup-rtc de ese carril.
//
// CONFIANZA gate → rtc: exactamente el mismo mecanismo que /fleet/progress con
// actividad explícita. El gate llama por el SERVICE BINDING `RTC` con
// `Authorization: Bearer <MCP_EXECUTOR_TOKEN>`, que en este worker es el secreto
// YOKUP_CLI_EXECUTOR_TOKEN (authorizeCliExecutor). No hay secreto nuevo.
// Además, como ese token también lo custodian los ejecutores CLI locales, estas rutas
// exigen que la petición NO haya cruzado el borde público de Cloudflare: toda petición
// que entra por api.yokup.com / rtc.yokup.com / workers.dev lleva `CF-Connecting-IP`
// (lo pone el borde, el cliente no puede quitarlo ni falsearlo) y una petición creada
// por el gate con `new Request(...)` y enviada por el binding no la lleva. Un navegador
// (cabecera Origin) tampoco entra. Resultado: aunque alguien tenga el token de
// ejecutor, desde Internet recibe 403 internal_only.
//
// ALCANCE: solo tickets del universo de CAMPO (FIELD_MISSION_SCOPE_SQL_T), el mismo que
// pinta /incidencias. Las misiones de flota (fleet, decision-batch, cli-declare o
// role=mission) quedan FUERA: su cierre exige pantallazo, aceptación y /fleet/informe,
// y este carril no puede servir de atajo para saltárselo.
//
// AUTORÍA Y AUDITORÍA: el autor de cada evento es «Persona · Máquina» de la credencial,
// lo pone el gate (el cliente MCP no puede elegirlo). Cada escritura deja además una
// fila en mcp_incident_audit (tabla propia, creada aquí de forma perezosa para no tocar
// el ensureSchema de index.js).
//
// La lógica reutiliza la del worker por inyección (deps): createIncident, addEvent,
// ensureSchema, json y embed vienen de src/index.js; el cambio de estado replica el de
// /ticket/status y /tickets/status (UPDATE + evento «Estado → x: nota»), que para
// tickets de campo no tiene más ramas (las de prueba/tanda/encargo son de misiones).
import { authorizeCliExecutor } from './cli-executor-contract.js';
import { FIELD_MISSION_SCOPE_SQL_T } from './mission-sources.js';

export const FLEET_INCIDENTS_PREFIX = '/internal/mcp/incidents';
export const INCIDENT_LIST_STATES = Object.freeze(['vivas', 'open', 'in_progress', 'resolved', 'cancelled', 'todas']);
export const INCIDENT_STATUSES = Object.freeze(['open', 'in_progress', 'resolved', 'cancelled']);
export const INCIDENT_BULK_STATUSES = Object.freeze(['resolved', 'cancelled']);
export const INCIDENT_KINDS = Object.freeze(['screen', 'service', 'machine', 'agent', 'network', 'content', 'external']);
export const INCIDENT_SEVERITIES = Object.freeze(['urgente', 'alta', 'normal', 'baja']);
export const INCIDENT_LIST_DEFAULT = 50;
export const INCIDENT_LIST_MAX = 200;
export const INCIDENT_BULK_MAX = 100;
export const INCIDENT_EVENTS_MAX = 200;
export const INCIDENT_SOURCE = 'mcp';
export const INCIDENT_URL = 'https://www.yokup.com/ticket?id=';
export const INCIDENT_AUDIT_TABLE_SQL = 'CREATE TABLE IF NOT EXISTS mcp_incident_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, actor TEXT NOT NULL, machine TEXT NOT NULL, action TEXT NOT NULL, ticket_ids TEXT NOT NULL, status TEXT, detail TEXT)';

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
const FIELDS = 't.id,t.subject,t.status,t.priority,t.role,t.source,t.project_id,t.project,t.loc,t.screen,t.assignee,t.created_at,t.updated_at,t.resolved_at';

class IncidentError extends Error {
  constructor(status, code, message, extra = {}) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

function text(value, max, name, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) throw new IncidentError(400, 'invalid_' + name, name + ' requerido');
    return '';
  }
  if (typeof value !== 'string' || CONTROL.test(value) || value.length > max) throw new IncidentError(400, 'invalid_' + name, name + ' inválido (texto de hasta ' + max + ')');
  const clean = value.trim();
  if (required && !clean) throw new IncidentError(400, 'invalid_' + name, name + ' requerido');
  return clean;
}

function oneOf(value, list, name, fallback) {
  if (value == null || value === '') {
    if (fallback !== undefined) return fallback;
    throw new IncidentError(400, 'invalid_' + name, name + ' requerido: ' + list.join('|'));
  }
  if (!list.includes(value)) throw new IncidentError(400, 'invalid_' + name, name + ' debe ser ' + list.join('|'));
  return value;
}

function slug(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

// Autoría: el gate manda la identidad autenticada; aquí solo se sanea.
export function incidentAuthor(body) {
  const actor = text(body && body.actor, 80, 'actor', { required:true });
  const machine = text(body && body.machine, 80, 'machine', { required:true });
  return { actor, machine, author:(actor + ' · ' + machine).slice(0, 160) };
}

// Solo tráfico del binding: sin CF-Connecting-IP (borde público) ni Origin
// (navegador), y con el token de ejecutor que ya usa /fleet/progress.
export async function authorizeInternalMcp(env, req) {
  if (req.headers.get('cf-connecting-ip') || req.headers.get('origin')) {
    return { ok:false, status:403, code:'internal_only', error:'ruta interna: solo por el service binding del MCP' };
  }
  const auth = await authorizeCliExecutor(env, req);
  return auth.ok ? { ok:true } : { ok:false, status:auth.status, code:auth.code, error:auth.error };
}

export function serializeIncident(row) {
  return {
    id:row.id, subject:row.subject || '', status:row.status, priority:row.priority || null,
    kind:row.role || null, source:row.source || null,
    project_id:row.project_id || row.project || null, project:row.project || row.project_id || null,
    loc:row.loc || '', resource:row.screen || '', assignee:row.assignee || '',
    created_at:row.created_at ?? null, updated_at:row.updated_at ?? null, resolved_at:row.resolved_at ?? null,
    url:INCIDENT_URL + encodeURIComponent(row.id)
  };
}

export function incidentListQuery(params) {
  const get = (k) => (params && typeof params.get === 'function' ? params.get(k) : params && params[k]);
  const state = oneOf(get('state') || '', INCIDENT_LIST_STATES, 'state', 'vivas');
  const rawLimit = get('limit');
  let limit = INCIDENT_LIST_DEFAULT;
  if (rawLimit != null && rawLimit !== '') {
    limit = Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > INCIDENT_LIST_MAX) throw new IncidentError(400, 'invalid_limit', 'limit entre 1 y ' + INCIDENT_LIST_MAX);
  }
  const clauses = [FIELD_MISSION_SCOPE_SQL_T], binds = [];
  if (state === 'vivas') clauses.push("t.status IN ('open','in_progress')");
  else if (state !== 'todas') { clauses.push('t.status=?'); binds.push(state); }
  const projectId = text(get('project_id'), 120, 'project_id');
  if (projectId) { clauses.push("COALESCE(NULLIF(t.project_id,''),t.project,'')=?"); binds.push(projectId); }
  const source = text(get('source'), 24, 'source');
  if (source) { clauses.push('t.source=?'); binds.push(source); }
  const kind = text(get('kind'), 24, 'kind');
  // Las de pantalla del monitor DOOH (createTicket) guardan en role el rol del player,
  // no «screen»: se reconocen por su origen agent-iot.
  if (kind === 'screen') clauses.push("(t.role='screen' OR t.source='agent-iot')");
  else if (kind) { clauses.push('t.role=?'); binds.push(kind); }
  const q = text(get('q'), 120, 'q');
  if (q) {
    const like = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    clauses.push("(t.subject LIKE ? ESCAPE '\\' OR t.screen LIKE ? ESCAPE '\\' OR t.loc LIKE ? ESCAPE '\\' OR t.id LIKE ? ESCAPE '\\')");
    binds.push(like, like, like, like);
  }
  return { state, limit, where:'WHERE ' + clauses.join(' AND '), binds,
    filters:{ state, project_id:projectId || null, source:source || null, kind:kind || null, q:q || null } };
}

async function incidentRow(env, id) {
  const row = await env.DB.prepare(`SELECT ${FIELDS},t.ai_triage FROM tickets t WHERE t.id=? AND ${FIELD_MISSION_SCOPE_SQL_T}`).bind(id).first();
  if (row) return row;
  const any = await env.DB.prepare('SELECT id FROM tickets WHERE id=?').bind(id).first();
  if (any) throw new IncidentError(409, 'not_an_incident', id + ' es una misión, no una incidencia: usa las herramientas de misiones');
  throw new IncidentError(404, 'not_found', 'incidencia ' + id + ' no encontrada');
}

const auditReady = new WeakSet();
async function audit(env, entry) {
  try {
    if (!auditReady.has(env.DB)) { await env.DB.prepare(INCIDENT_AUDIT_TABLE_SQL).run(); auditReady.add(env.DB); }
    await env.DB.prepare('INSERT INTO mcp_incident_audit(ts,actor,machine,action,ticket_ids,status,detail) VALUES(?,?,?,?,?,?,?)')
      .bind(Date.now(), entry.actor, entry.machine, entry.action, JSON.stringify(entry.ids), entry.status || null, String(entry.detail || '').slice(0, 2000)).run();
    return true;
  } catch { return false; }   // la escritura ya ocurrió y su evento con autor existe
}

async function setStatus(env, deps, id, status, author, eventText, now) {
  await env.DB.prepare('UPDATE tickets SET status=?, updated_at=?, resolved_at=? WHERE id=?').bind(status, now, status === 'resolved' ? now : null, id).run();
  await deps.addEvent(env, id, 'status', author, eventText);
  // Base de conocimiento de /kb-search: como /ticket/status, lo resuelto se indexa.
  if (status === 'resolved' && env.VECTORIZE && typeof deps.embed === 'function') {
    try {
      const t = await env.DB.prepare('SELECT subject,screen FROM tickets WHERE id=?').bind(id).first();
      const ev = await env.DB.prepare('SELECT text FROM events WHERE ticket_id=?').bind(id).all();
      const vec = await deps.embed(env, `${t.subject} (${t.screen}). ${(ev.results || []).map((e) => e.text).join(' ')}`);
      if (vec) await env.VECTORIZE.upsert([{ id, values:vec, metadata:{ id, subject:t.subject, screen:t.screen } }]);
    } catch {}
  }
}

async function readBody(req) {
  try { const b = await req.json(); if (b && typeof b === 'object' && !Array.isArray(b)) return b; } catch {}
  throw new IncidentError(400, 'bad_json', 'cuerpo JSON (objeto) requerido');
}

async function list(env, url) {
  const q = incidentListQuery(url.searchParams);
  const rows = (await env.DB.prepare(`SELECT ${FIELDS} FROM tickets t ${q.where} ORDER BY (t.status='open') DESC,(t.status='in_progress') DESC,t.created_at DESC LIMIT ?`)
    .bind(...q.binds, q.limit).all()).results || [];
  const total = await env.DB.prepare(`SELECT COUNT(*) n FROM tickets t ${q.where}`).bind(...q.binds).first();
  return { ok:true, incidents:rows.map(serializeIncident), returned:rows.length, total:Number(total && total.n) || 0, limit:q.limit, filters:q.filters };
}

async function get(env, url) {
  const id = text(url.searchParams.get('id'), 64, 'id', { required:true });
  const row = await incidentRow(env, id);
  const events = ((await env.DB.prepare('SELECT id,ts,kind,author,text FROM events WHERE ticket_id=? ORDER BY id DESC LIMIT ?').bind(id, INCIDENT_EVENTS_MAX).all()).results || []).reverse();
  return { ok:true, incident:{ ...serializeIncident(row), ai_triage:row.ai_triage || '' }, events, events_limit:INCIDENT_EVENTS_MAX };
}

async function open(env, deps, b) {
  const who = incidentAuthor(b);
  const subject = text(b.subject, 200, 'subject', { required:true });
  const detail = text(b.detail, 2000, 'detail');
  const kind = oneOf(b.kind, INCIDENT_KINDS, 'kind');
  const severity = oneOf(b.severity, INCIDENT_SEVERITIES, 'severity');
  const loc = text(b.loc, 80, 'loc');
  const projectId = text(b.project_id, 80, 'project_id');
  // Una incidencia ACTIVA por recurso (idx_active_screen). Sin recurso explícito, el
  // asunto hace de recurso: reportar dos veces lo mismo suma al mismo ticket.
  const resource = text(b.resource, 160, 'resource') || ('mcp:' + kind + ':' + (slug(subject) || 'incidencia'));
  const active = await env.DB.prepare(`SELECT t.id,(${FIELD_MISSION_SCOPE_SQL_T}) field FROM tickets t WHERE t.screen=? AND t.status NOT IN ('resolved','cancelled')`).bind(resource).first();
  if (active && !Number(active.field)) throw new IncidentError(409, 'resource_is_mission', 'el recurso pertenece a una misión activa (' + active.id + ')');
  const id = await deps.createIncident(env, {
    subject, detail:detail || subject, kind, severity, resource, loc, project_id:projectId,
    source:INCIDENT_SOURCE, by:who.author, agent:who.actor, machine:who.machine
  });
  if (!id) throw new IncidentError(500, 'incident_not_created', 'no se pudo crear la incidencia');
  const deduplicated = !!(active && active.id === id);
  if (deduplicated) {
    await deps.addEvent(env, id, 'log', who.author, 'Reportada de nuevo vía MCP: ' + (detail || subject));
    await env.DB.prepare('UPDATE tickets SET updated_at=? WHERE id=?').bind(Date.now(), id).run();
  }
  const audited = await audit(env, { ...who, action:deduplicated ? 'open_duplicate' : 'open', ids:[id], status:'open', detail:subject });
  return { ok:true, id, url:INCIDENT_URL + encodeURIComponent(id), resource, deduplicated, author:who.author, audited };
}

async function note(env, deps, b) {
  const who = incidentAuthor(b);
  const id = text(b.id, 64, 'id', { required:true });
  const body = text(b.text, 2000, 'text', { required:true });
  const row = await incidentRow(env, id);
  await deps.addEvent(env, id, 'note', who.author, body);
  // Igual que /ticket/note: anotar una abierta la pone en curso.
  await env.DB.prepare("UPDATE tickets SET updated_at=?, status=CASE WHEN status='open' THEN 'in_progress' ELSE status END WHERE id=?").bind(Date.now(), id).run();
  const audited = await audit(env, { ...who, action:'note', ids:[id], status:null, detail:body });
  return { ok:true, id, status:row.status === 'open' ? 'in_progress' : row.status, author:who.author, audited };
}

async function status(env, deps, b) {
  const who = incidentAuthor(b);
  const id = text(b.id, 64, 'id', { required:true });
  const next = oneOf(b.status, INCIDENT_STATUSES, 'status');
  const why = text(b.note, 1000, 'note');
  if ((next === 'resolved' || next === 'cancelled') && !why) throw new IncidentError(400, 'note_required', 'resolved y cancelled exigen note');
  const row = await incidentRow(env, id);
  await setStatus(env, deps, id, next, who.author, `Estado → ${next}${why ? ': ' + why : ''}`, Date.now());
  const audited = await audit(env, { ...who, action:'status', ids:[id], status:next, detail:why });
  return { ok:true, id, status:next, previous:row.status, author:who.author, audited };
}

async function bulk(env, deps, b) {
  const who = incidentAuthor(b);
  if (!Array.isArray(b.ids) || !b.ids.length) throw new IncidentError(400, 'invalid_ids', 'ids (array no vacío) requerido');
  const ids = [...new Set(b.ids.map((x) => text(x, 64, 'ids', { required:true })))];
  if (ids.length > INCIDENT_BULK_MAX) throw new IncidentError(400, 'too_many_ids', 'máximo ' + INCIDENT_BULK_MAX + ' ids');
  const next = oneOf(b.status, INCIDENT_BULK_STATUSES, 'status');
  const why = text(b.note, 1000, 'note', { required:true });
  // Todo o nada: si una sola no es incidencia (o no existe) no se toca ninguna.
  const missing = [], missions = [];
  for (const id of ids) {
    try { await incidentRow(env, id); } catch (e) { (e.code === 'not_an_incident' ? missions : missing).push(id); }
  }
  if (missing.length || missions.length) throw new IncidentError(409, 'invalid_batch', 'lote rechazado: ids inexistentes o que son misiones', { not_found:missing, not_incidents:missions });
  const now = Date.now();
  for (const id of ids) await setStatus(env, deps, id, next, who.author, `Estado → ${next} (cambio en bloque · MCP) · ${why}`, now);
  const audited = await audit(env, { ...who, action:'bulk_status', ids, status:next, detail:why });
  return { ok:true, updated:ids.length, ids, status:next, author:who.author, audited };
}

export async function handleFleetIncidents(req, env, url, deps) {
  const { json } = deps;
  const auth = await authorizeInternalMcp(env, req);
  if (!auth.ok) return json({ ok:false, code:auth.code, error:auth.error }, auth.status);
  try {
    if (typeof deps.ensureSchema === 'function') await deps.ensureSchema(env);
    const sub = url.pathname.slice(FLEET_INCIDENTS_PREFIX.length) || '/';
    if (req.method === 'GET' && (sub === '/' || sub === '/list')) return json(await list(env, url));
    if (req.method === 'GET' && sub === '/get') return json(await get(env, url));
    if (req.method === 'POST' && sub === '/open') return json(await open(env, deps, await readBody(req)));
    if (req.method === 'POST' && sub === '/note') return json(await note(env, deps, await readBody(req)));
    if (req.method === 'POST' && sub === '/status') return json(await status(env, deps, await readBody(req)));
    if (req.method === 'POST' && sub === '/bulk-status') return json(await bulk(env, deps, await readBody(req)));
    return json({ ok:false, code:'not_found', error:'ruta interna desconocida' }, 404);
  } catch (e) {
    if (e instanceof IncidentError) return json({ ok:false, code:e.code, error:e.message, ...e.extra }, e.status);
    return json({ ok:false, code:String(e && e.code || 'incident_error').slice(0, 60), error:String(e && e.message || e).slice(0, 200) }, Number(e && e.status) || 500);
  }
}
