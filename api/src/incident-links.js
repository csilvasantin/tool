// Incidencias unificadas (FLT-101298 · MorfeoMacMini · 30-sep-2026): puente con la bandeja Yokup (yokup-rtc).
// Diseño completo en docs/incidencias-unificadas.md. En corto:
//  · Este worker (B) es la fuente de verdad del ciclo de CAMPO; yokup-rtc (A) es la bandeja única de todo.
//  · Toda incidencia que ve un comercio, o que nació en A, tiene fila en incident_links.
//  · syncIncidentLinks empuja a A SOLO lo que difiere del último estado acordado (anti-bucle, idempotente).
//  · applyRtcStatus recibe de A los cierres; con técnico asignado se rechaza: lo cierra él con evidencia.
//  · Transporte: service binding RTC, sin secretos. /internal/* solo acepta peticiones del binding.
// No importa de incident-desk.js ni de admira-xpacio-sync.js a propósito: incident-desk lo importa a él.
export const RTC_SYNC_URL = 'https://yokup-rtc.internal/internal/portal/sync';
export const INTERNAL_HOST = 'yokup-api.internal';
export const FOLLOW_URL = 'https://www.yokup.com/retailer/incidencia?id=';
const SOURCE_PREFIX = /^\[Origen: [a-z0-9][a-z0-9.-]{0,31}\] /, TICKET = /^[A-Za-z0-9][\w:-]{2,79}$/;
const BATCH = 25, ADOPT_WINDOW = 86400000, MAX_BACKOFF_MIN = 60;
const run = (env, sql, ...v) => env.DB.prepare(sql).bind(...v).run();
const first = (env, sql, ...v) => env.DB.prepare(sql).bind(...v).first();
const all = async (env, sql, ...v) => (await env.DB.prepare(sql).bind(...v).all()).results || [];
const clip = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const slugOf = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const timeline = (env, id, kind, detail, now) => run(env, 'INSERT INTO incident_timeline(id,incident_id,kind,detail,created_at) VALUES(?,?,?,?,?)', crypto.randomUUID(), id, kind, String(detail).slice(0, 500), now);

/** Solo un service binding llega con este host y sin las cabeceras que el borde pone a todo el tráfico público. */
export function viaBinding(request, host) {
 try { return new URL(request.url).hostname === host && !request.headers.get('cf-connecting-ip') && !request.headers.get('cf-ray'); } catch { return false; }
}

// Estado que viaja: open | assigned | resolved | rated (resuelta y ya valorada por el comercio).
const STATE_SQL = "CASE WHEN i.status='resolved' AND rr.incident_id IS NOT NULL THEN 'rated' ELSE i.status END";
const LINK_SELECT = `SELECT k.*,${STATE_SQL} AS state,i.title,i.status,i.channel,i.resolution,i.evidence_url,d.name AS device_name,d.skill,l.site_id,s.name AS site_name,x.admira_store_id AS xpacio_id,
 t.name AS technician_name,rd.description,rd.priority,rd.parent_incident_id,rr.stars,rr.satisfied,rr.followup_id
 FROM incident_links k JOIN installer_incidents i ON i.id=k.installer_incident_id JOIN installer_devices d ON d.id=i.device_id LEFT JOIN retailer_device_links l ON l.device_id=d.id
 LEFT JOIN retailer_sites s ON s.id=l.site_id LEFT JOIN admira_xpacio_sites x ON x.site_id=s.id LEFT JOIN installer_accounts t ON t.id=i.installer_id
 LEFT JOIN retailer_incident_details rd ON rd.incident_id=i.id LEFT JOIN retailer_ratings rr ON rr.incident_id=i.id`;

/** Lo que viaja a A. Nunca: correos, cuentas, direcciones, coordenadas, teléfonos, citas, importes, comentario de la valoración ni tokens. */
export function payloadFor(r) {
 // Establecimiento con el MISMO slug que las pantallas del censo: id del Xpacio o id de catálogo del sitio propio.
 const site = r.site_id ? {name: r.site_name, establishment: r.xpacio_id || 'yokup-' + r.site_id} : null;
 return {portal_incident_id: r.installer_incident_id, origin: r.origin, rtc_ticket_id: r.rtc_ticket_id || null, state: r.state,
  title: r.title, description: clip(String(r.description || '').replace(SOURCE_PREFIX, ''), 500), priority: r.priority === 'urgent' ? 'urgent' : 'normal', channel: r.channel || 'campo',
  device: {name: r.device_name, skill: r.skill}, site, technician_name: r.technician_name || null, resolution: clip(r.resolution, 500),
  evidence_url: /^https:\/\//.test(r.evidence_url || '') ? r.evidence_url.slice(0, 800) : null,
  rating: r.state === 'rated' ? {stars: r.stars, satisfied: !!r.satisfied} : null,
  followup_id: r.followup_id && r.followup_id !== r.installer_incident_id ? r.followup_id : null,
  parent_portal_incident_id: r.parent_incident_id || null, portal_url: site ? FOLLOW_URL + encodeURIComponent(r.installer_incident_id) : null};
}

/** Enlaza una incidencia con el ticket de A del que nació (external_id 'rtc:<ticket>'). Nunca roba un enlace ya hecho. */
export async function linkRtcTicket(env, incidentId, external, now = Date.now()) {
 const ticket = /^rtc:(.+)$/.exec(String(external || ''))?.[1];
 if (!ticket || !TICKET.test(ticket)) return false;
 try {
  const r = await run(env, `INSERT INTO incident_links(installer_incident_id,rtc_ticket_id,origin,created_at,updated_at) VALUES(?,?,'rtc',?,?)
   ON CONFLICT(installer_incident_id) DO UPDATE SET rtc_ticket_id=excluded.rtc_ticket_id,origin='rtc',updated_at=excluded.updated_at WHERE incident_links.rtc_ticket_id IS NULL`, incidentId, ticket, now, now);
  return !!r.meta.changes;
 } catch { return false; } // ese ticket ya está enlazado a otra incidencia (UNIQUE)
}

/** Equipo del comercio para una pantalla del censo {store_id: loc, device_id: pantalla}; null si ningún comercio la tiene. */
export async function retailerDeviceFor(env, admira, info = {}, now = Date.now()) {
 const store = clip(admira && admira.store_id, 160), screen = clip(admira && admira.device_id, 160);
 if (!store || !screen) return null;
 const linked = id => first(env, 'SELECT d.id,d.latitude,d.longitude FROM installer_devices d JOIN retailer_device_links l ON l.device_id=d.id WHERE d.id=?', id);
 // 1) circuito vinculado  2) superficie del Xpacio con el mismo slug
 const hit = await first(env, 'SELECT device_id FROM retailer_device_links WHERE admira_store_id=? AND admira_device_id=?', store, screen)
  || await first(env, 'SELECT device_id FROM admira_xpacio_devices WHERE admira_store_id=? AND surface_key=? AND removed_at IS NULL', store, slugOf(screen).slice(0, 60));
 if (hit) return linked(hit.device_id);
 // 3) el Xpacio existe pero no esa superficie: el player del censo pasa a ser equipo de ese establecimiento.
 const site = await first(env, 'SELECT x.site_id,x.circuit_id,s.latitude,s.longitude,s.address FROM admira_xpacio_sites x JOIN retailer_sites s ON s.id=x.site_id WHERE x.admira_store_id=? AND x.removed_at IS NULL', store);
 if (!site || !info.id) return null;
 await run(env, `INSERT INTO installer_devices(id,name,latitude,longitude,address,skill,last_seen,timeout_seconds,monitoring) VALUES(?,?,?,?,?,?,?,900,0)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,latitude=excluded.latitude,longitude=excluded.longitude,address=excluded.address`, info.id, info.name || screen, site.latitude, site.longitude, site.address, info.skill || 'player', now);
 await run(env, 'INSERT OR IGNORE INTO retailer_device_links(device_id,site_id,circuit_id,admira_store_id,admira_device_id,linked_at,created_at) VALUES(?,?,?,?,?,?,?)', info.id, site.site_id, site.circuit_id, store, screen, now, now);
 return linked(info.id);
}

/** Conciliación: adopta lo que ve un comercio (activas y resueltas de 24 h) y las altas del Desk que nacieron en A. */
export async function adoptIncidents(env, now = Date.now()) {
 // Las 'desk:%' se adoptan por su rastro de alta (origin 'rtc'); así nunca nacen dos tickets para una caída.
 await run(env, `INSERT OR IGNORE INTO incident_links(installer_incident_id,origin,created_at,updated_at)
  SELECT i.id,'portal',?,? FROM installer_incidents i JOIN retailer_device_links l ON l.device_id=i.device_id
  WHERE i.id NOT LIKE 'desk:%' AND (i.status!='resolved' OR i.resolved_at>=?) AND NOT EXISTS(SELECT 1 FROM incident_links k WHERE k.installer_incident_id=i.id) LIMIT 200`, now, now, now - ADOPT_WINDOW);
 const desk = await all(env, `SELECT t.incident_id,t.detail FROM incident_timeline t JOIN installer_incidents i ON i.id=t.incident_id WHERE t.kind='alta' AND t.detail LIKE 'automática · rtc:%'
  AND i.status!='resolved' AND NOT EXISTS(SELECT 1 FROM incident_links k WHERE k.installer_incident_id=i.id) LIMIT 200`);
 for (const r of desk) { const m = /^automática · (rtc:[\w:-]{3,80})/.exec(r.detail); if (m) await linkRtcTicket(env, r.incident_id, m[1], now); }
}

/** Empuja a A lo que cambió desde el último estado acordado. La llaman el cron y cada escritura con éxito. */
export async function syncIncidentLinks(env, now = Date.now()) {
 const out = {pushed: 0, failed: 0};
 if (!env.RTC) return {...out, skipped: 'rtc_binding_missing'};
 await adoptIncidents(env, now);
 const due = await all(env, LINK_SELECT + ` WHERE k.next_attempt_at<=? AND (k.rtc_ticket_id IS NULL OR k.last_synced_state IS NULL OR k.last_synced_state!=(${STATE_SQL})) ORDER BY k.updated_at LIMIT ?`, now, BATCH);
 for (const row of due) {
  let error = '';
  try {
   const res = await env.RTC.fetch(new Request(RTC_SYNC_URL, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payloadFor(row))}));
   const data = await res.json().catch(() => ({}));
   if (!res.ok || data.ok !== true || !TICKET.test(String(data.ticket_id || ''))) error = 'rtc_rejected_' + res.status + (data.error ? ':' + String(data.error).slice(0, 80) : '');
   else {
    await run(env, 'UPDATE incident_links SET rtc_ticket_id=?,last_synced_state=?,rtc_status=?,attempts=0,last_error=NULL,next_attempt_at=0,updated_at=? WHERE installer_incident_id=?', data.ticket_id, row.state, clip(data.status, 20), now, row.installer_incident_id);
    out.pushed++;
   }
  } catch (e) { error = String(e && e.message || e).includes('UNIQUE') ? 'rtc_ticket_taken' : 'rtc_unreachable'; }
  if (error) {
   // Espera exponencial 1, 2, 4… hasta 60 min; la reintenta el cron de 2 min.
   await run(env, 'UPDATE incident_links SET attempts=attempts+1,last_error=?,next_attempt_at=?,updated_at=? WHERE installer_incident_id=?', error, now + Math.min(MAX_BACKOFF_MIN, 2 ** Math.min(row.attempts, 6)) * 60000, now, row.installer_incident_id);
   out.failed++;
  }
 }
 return out;
}

/** Cierre o cancelación desde A. Solo cierra B si nadie la ha aceptado; si hay técnico, responde 'assigned' y A reabre. */
export async function applyRtcStatus(env, b, now = Date.now()) {
 const id = clip(b.portal_incident_id, 180), ticket = clip(b.rtc_ticket_id, 80), status = b.status;
 if (!id || !ticket || !['open', 'in_progress', 'resolved', 'cancelled'].includes(status)) throw Object.assign(new Error('portal_incident_id, rtc_ticket_id y status requeridos.'), {status: 400});
 if (!(await first(env, 'SELECT 1 AS x FROM incident_links WHERE installer_incident_id=? AND rtc_ticket_id=?', id, ticket))) throw Object.assign(new Error('Enlace no encontrado.'), {status: 404});
 let applied = false;
 if (status === 'resolved' || status === 'cancelled') {
  const note = clip(b.note, 300), resolution = (status === 'cancelled' ? 'Cancelada desde Yokup' : 'Cerrada desde Yokup') + ` (ticket ${ticket})` + (note ? ': ' + note : '.');
  const r = await run(env, "UPDATE installer_incidents SET status='resolved',resolution=?,resolved_at=? WHERE id=? AND status='open'", resolution, now, id);
  if (r.meta.changes) { applied = true; await timeline(env, id, 'cerrada_yokup', resolution + (clip(b.by, 60) ? ' · ' + clip(b.by, 60) : ''), now); }
 }
 const row = await first(env, LINK_SELECT + ' WHERE k.installer_incident_id=?', id);
 // El estado resultante queda ACORDADO: no se rebota a A, que lo recibe en esta misma respuesta.
 await run(env, 'UPDATE incident_links SET last_synced_state=?,rtc_status=?,updated_at=? WHERE installer_incident_id=?', row.state, status, now, id);
 return {ok: true, applied, ...payloadFor(row)};
}

export async function handleIncidentLinksInternal(request, env) {
 const reply = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
 if (!viaBinding(request, INTERNAL_HOST)) return reply({error: 'Ruta no encontrada.'}, 404);
 try {
  if (new URL(request.url).pathname !== '/internal/incident-links/rtc-status' || request.method !== 'POST') return reply({error: 'Ruta no encontrada.'}, 404);
  const raw = await request.text();
  if (raw.length > 16384) return reply({error: 'Petición demasiado grande.'}, 413);
  let b; try { b = JSON.parse(raw); } catch { b = null; }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return reply({error: 'JSON no válido.'}, 400);
  return reply(await applyRtcStatus(env, b));
 } catch (e) {
  if (!e.status) console.error('incident_links_internal_failed', e.message);
  return reply({ok: false, error: e.status ? e.message : 'No se pudo aplicar.'}, e.status || 500);
 }
}
