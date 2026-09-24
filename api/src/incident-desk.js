// Yokup Desk (FLT-100938 · FLT-100940 · MorfeoMacMini · 24-sep-2026): despacho dual, relojes,
// candado de «Resuelta», avisos push reales y base de conocimiento de cierres buenos.
//
//  · campo   (pantalla/IoT)          → instaladores con la especialidad dentro de su radio (40 km por
//                                       defecto). Sin aceptar en DESK_ACCEPT_MIN se abre otra ronda con el
//                                       radio ×1,5 y luego ×2; tras la tercera ronda, se escala.
//  · digital (web/agente/máquina)    → encargo a un DeepAgent por el bot-inbox de la flota.
//  · asignada sin avance en DESK_PROGRESS_MIN → se escala.
//  · «Resuelta» solo con evidencia viva (URL https que responde); al cerrar se pide la valoración
//    al comercio; ≥ 4★ y satisfecho alimenta la KB; insatisfecho reabre como revisión vinculada.
//
// El canal lo fija el clasificador de Oráculo al dar de alta (campo `channel`); sin él es 'campo'.
// Módulo autónomo a propósito: installer-portal.js lo importa y no al revés.

export const CHANNELS = ['campo', 'digital'];
export const ROUND_FACTORS = [1, 1.5, 2];
export const MAX_RADIUS_KM = 200;
const MIN = 60000;

export const channelOf = value => (value === 'digital' ? 'digital' : 'campo');
export function roundFactor(round) {
 const r = Math.min(ROUND_FACTORS.length, Math.max(1, Math.trunc(Number(round) || 1)));
 return ROUND_FACTORS[r - 1];
}
/** Radio con el que un instalador ve (y puede aceptar) una incidencia en su ronda actual. */
export const effectiveRadius = (radiusKm, round) => Math.min(MAX_RADIUS_KM, (Number(radiusKm) || 40) * roundFactor(round));
export function clocks(env = {}) {
 const n = (v, d) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : d; };
 return { acceptMs: n(env.DESK_ACCEPT_MIN, 15) * MIN, progressMs: n(env.DESK_PROGRESS_MIN, 240) * MIN };
}

const run = (env, sql, ...v) => env.DB.prepare(sql).bind(...v).run();
const first = (env, sql, ...v) => env.DB.prepare(sql).bind(...v).first();
const all = async (env, sql, ...v) => (await env.DB.prepare(sql).bind(...v).all()).results || [];
const httpFetch = env => env.FETCH || fetch;

export async function logTimeline(env, incidentId, kind, detail = '', now = Date.now()) {
 await run(env, 'INSERT INTO incident_timeline(id,incident_id,kind,detail,created_at) VALUES(?,?,?,?,?)',
  crypto.randomUUID(), incidentId, kind, String(detail).slice(0, 500), now);
}

// ── Relojes ────────────────────────────────────────────────────────────────────
/** Una pasada del Desk. La llama el cron de dos minutos; es idempotente. Devuelve lo que hizo. */
export async function sweepDesk(env, now = Date.now()) {
 const {acceptMs, progressMs} = clocks(env);
 const done = {delivered: 0, reassigned: 0, escalated: 0};
 // Digitales sin entregar: al DeepAgent.
 for (const inc of await all(env, `SELECT i.*,rd.description FROM installer_incidents i LEFT JOIN retailer_incident_details rd ON rd.incident_id=i.id
   WHERE i.status='open' AND i.channel='digital' AND i.delivered_at IS NULL`)) {
  if (await deliverDigital(env, inc, now)) done.delivered++;
  else if (now - inc.created_at > acceptMs && await escalate(env, inc, 'digital sin entregar al DeepAgent', now)) done.escalated++;
 }
 // Campo sin aceptar: otra ronda con más radio; tras la última, escalar.
 for (const inc of await all(env, "SELECT * FROM installer_incidents WHERE status='open' AND channel='campo'")) {
  if (now - (inc.round_started_at || inc.created_at) <= acceptMs) continue;
  if (inc.dispatch_round < ROUND_FACTORS.length) {
   const next = inc.dispatch_round + 1;
   const r = await run(env, "UPDATE installer_incidents SET dispatch_round=?,round_started_at=? WHERE id=? AND status='open' AND dispatch_round=?", next, now, inc.id, inc.dispatch_round);
   if (r.meta.changes) { done.reassigned++; await logTimeline(env, inc.id, 'reasignada', `nadie aceptó en ${Math.round(acceptMs / MIN)} min · ronda ${next} con radio ×${roundFactor(next)}`, now); }
  } else if (await escalate(env, inc, `sin aceptar tras ${ROUND_FACTORS.length} rondas`, now)) done.escalated++;
 }
 // Asignadas (instalador o DeepAgent) sin avance: escalar.
 for (const inc of await all(env, "SELECT * FROM installer_incidents WHERE status='assigned' AND escalated_at IS NULL")) {
  const last = Math.max(inc.last_progress_at || 0, inc.assigned_at || 0, inc.delivered_at || 0);
  if (last && now - last > progressMs && await escalate(env, inc, `sin avance en ${Math.round(progressMs / MIN)} min`, now)) done.escalated++;
 }
 return done;
}

/** Escala una sola vez por incidencia: marca, deja rastro y avisa a operaciones si hay chat configurado. */
export async function escalate(env, inc, reason, now = Date.now()) {
 const r = await run(env, 'UPDATE installer_incidents SET escalated_at=? WHERE id=? AND escalated_at IS NULL', now, inc.id);
 if (!r.meta.changes) return false;
 await logTimeline(env, inc.id, 'escalada', reason, now);
 if (env.TELEGRAM_BOT_TOKEN && env.DESK_OPS_CHAT_ID) {
  const text = `⚠️ Yokup Desk · incidencia escalada\n${inc.title}\n${inc.id} · canal ${inc.channel || 'campo'}\nMotivo: ${reason}`;
  try { await httpFetch(env)(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({chat_id: env.DESK_OPS_CHAT_ID, text, disable_web_page_preview: true})}); } catch {}
 }
 return true;
}

/** Entrega una incidencia digital a un DeepAgent por el bot-inbox de la flota. true si quedó entregada. */
export async function deliverDigital(env, inc, now = Date.now()) {
 const persona = inc.deepagent || env.DEEPAGENT_PERSONA || 'Smith';
 if (!env.DEEPAGENT_PANEL_KEY) {
  if (!(await first(env, "SELECT 1 AS x FROM incident_timeline WHERE incident_id=? AND kind='sin_entrega'", inc.id)))
   await logTimeline(env, inc.id, 'sin_entrega', 'falta DEEPAGENT_PANEL_KEY en yokup-api: el encargo no puede salir', now);
  return false;
 }
 const text = [`[YOKUP DESK · incidencia digital] ${inc.id}`, inc.title, inc.description ? `Detalle: ${inc.description}` : '',
  'Resuélvela y ciérrala CON EVIDENCIA (URL https viva o captura publicada):',
  `curl -X POST https://data.yokup.com/api/desk/incidents/${inc.id}/resolve -H "Authorization: Bearer $(bash ~/Claude/admira-vault/vault-get.sh ADMIRA_TELEGRAM_PANEL_KEY)" -H "Content-Type: application/json" -d '{"resolution":"…","evidence_url":"https://…"}'`,
  `Avance: POST /api/desk/incidents/${inc.id}/progress {"note":"…"}. Sin avance en ${Math.round(clocks(env).progressMs / MIN)} min se escala.`].filter(Boolean).join('\n');
 let ok = false;
 try {
  const r = await httpFetch(env)((env.DEEPAGENT_INBOX_URL || 'https://bot.yokup.com') + '/api/bot-inbox', {method: 'POST',
   headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + env.DEEPAGENT_PANEL_KEY},
   body: JSON.stringify({target_persona: persona, target_machine: env.DEEPAGENT_MACHINE || 'macmini', text: text.slice(0, 3900), from: 'yokup-desk', project_id: env.DEEPAGENT_PROJECT || 'yokup'})});
  ok = r.ok;
 } catch {}
 if (!ok) return false;
 const agentId = await ensureDeepAgentAccount(env, persona, now);
 const u = await run(env, "UPDATE installer_incidents SET status='assigned',installer_id=?,deepagent=?,delivered_at=?,assigned_at=? WHERE id=? AND status='open' AND delivered_at IS NULL", agentId, persona, now, now, inc.id);
 if (u.meta.changes) await logTimeline(env, inc.id, 'asignada', `DeepAgent ${persona} (encargo en el bot-inbox)`, now);
 return !!u.meta.changes;
}

/** El DeepAgent es «técnico» de sistema: así el comercio lo valora y su reputación cuenta igual que la de un
 *  instalador. No puede iniciar sesión (hash imposible), no está disponible para campo y no recibe avisos de zona. */
export async function ensureDeepAgentAccount(env, persona, now = Date.now()) {
 const slug = String(persona).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'deepagent';
 const id = 'deepagent:' + slug;
 await run(env, `INSERT OR IGNORE INTO installer_accounts(id,email,name,password_hash,salt,country,city,latitude,longitude,skills,language,available,radius_km,notify_zone,demo,created_at)
  VALUES(?,?,?,'!','!','ES','Flota',0,0,'[]','es',0,1,0,0,?)`, id, `${slug}@deepagent.yokup.invalid`, `DeepAgent ${persona}`, now);
 return id;
}

// ── Candado de «Resuelta» ─────────────────────────────────────────────────────
/** La evidencia es una URL https que responde 2xx/3xx ahora mismo. Devuelve {ok, url} o {ok:false, error}. */
export async function checkEvidence(env, value) {
 let url;
 try { url = new URL(String(value || '').trim()); } catch { return {ok: false, error: 'Añade la URL de la captura o de la web ya funcionando.'}; }
 if (url.protocol !== 'https:' || url.username || url.password) return {ok: false, error: 'La evidencia tiene que ser una URL https.'};
 if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname) || url.hostname.endsWith('.local')) return {ok: false, error: 'La evidencia tiene que ser pública.'};
 const probe = async method => { try { const r = await httpFetch(env)(url.href, {method, redirect: 'follow', signal: AbortSignal.timeout(8000)}); return r.status; } catch { return 0; } };
 let status = await probe('HEAD');
 if (!(status >= 200 && status < 400)) status = await probe('GET');
 if (!(status >= 200 && status < 400)) return {ok: false, error: `La evidencia no responde (${status || 'sin respuesta'}). Publica la captura o comprueba la URL.`};
 return {ok: true, url: url.href};
}

/** Cierra con evidencia. `who` = {installerId} o {deepagent:true}. Lanza {status,message} si no puede. */
export async function resolveWithEvidence(env, id, who, body, now = Date.now()) {
 const resolution = typeof body.resolution === 'string' ? body.resolution.trim() : '';
 if (resolution.length < 20 || resolution.length > 2000) throw Object.assign(new Error('Describe la solución y cómo la probaste (20 a 2000 caracteres).'), {status: 400});
 // Primero la propiedad y luego la evidencia: no se sondea ninguna URL de quien no puede cerrar.
 const owned = who.installerId
  ? await first(env, "SELECT 1 AS x FROM installer_incidents WHERE id=? AND installer_id=? AND status='assigned'", id, who.installerId)
  : await first(env, "SELECT 1 AS x FROM installer_incidents WHERE id=? AND channel='digital' AND installer_id LIKE 'deepagent:%' AND status='assigned'", id);
 if (!owned) throw Object.assign(new Error('Solo se puede cerrar una incidencia asignada a quien la cierra.'), {status: 409});
 const ev = await checkEvidence(env, body.evidence_url);
 if (!ev.ok) throw Object.assign(new Error(ev.error), {status: 422});
 const r = who.installerId
  ? await run(env, "UPDATE installer_incidents SET status='resolved',resolution=?,resolved_at=?,evidence_url=?,rating_requested_at=? WHERE id=? AND installer_id=? AND status='assigned'", resolution, now, ev.url, now, id, who.installerId)
  : await run(env, "UPDATE installer_incidents SET status='resolved',resolution=?,resolved_at=?,evidence_url=?,rating_requested_at=? WHERE id=? AND channel='digital' AND installer_id LIKE 'deepagent:%' AND status='assigned'", resolution, now, ev.url, now, id);
 if (!r.meta.changes) throw Object.assign(new Error('Solo se puede cerrar una incidencia asignada a quien la cierra.'), {status: 409});
 await logTimeline(env, id, 'resuelta', `evidencia ${ev.url}`, now);
 await logTimeline(env, id, 'valoracion_pedida', 'el comercio ya puede valorar la intervención', now);
 return {ok: true, evidence_url: ev.url};
}

export async function recordProgress(env, id, whereSql, whereArgs, note, now = Date.now()) {
 const clean = typeof note === 'string' ? note.trim() : '';
 if (clean.length < 3 || clean.length > 500) throw Object.assign(new Error('Cuenta el avance en 3 a 500 caracteres.'), {status: 400});
 const r = await run(env, `UPDATE installer_incidents SET last_progress_at=? WHERE id=? AND status='assigned' AND ${whereSql}`, now, id, ...whereArgs);
 if (!r.meta.changes) throw Object.assign(new Error('Solo puedes dar avance de una incidencia asignada a ti.'), {status: 409});
 await logTimeline(env, id, 'avance', clean, now);
 return {ok: true};
}

/** Tras la valoración del comercio: los cierres buenos alimentan la KB; los malos dejan rastro de reapertura. */
export async function afterRating(env, incidentId, {stars, satisfied, followupId}, now = Date.now()) {
 if (satisfied && stars >= 4) {
  const inc = await first(env, 'SELECT i.*,d.skill FROM installer_incidents i JOIN installer_devices d ON d.id=i.device_id WHERE i.id=?', incidentId);
  if (inc && inc.evidence_url && inc.resolution) {
   await run(env, 'INSERT OR IGNORE INTO incident_kb(incident_id,channel,skill,title,resolution,evidence_url,stars,created_at) VALUES(?,?,?,?,?,?,?,?)',
    inc.id, inc.channel || 'campo', inc.skill || null, inc.title, inc.resolution, inc.evidence_url, stars, now);
   await logTimeline(env, incidentId, 'kb', `cierre valorado ${stars}★ añadido a la base de conocimiento`, now);
  }
 } else if (!satisfied) {
  await logTimeline(env, incidentId, 'reabierta', `el comercio no está satisfecho (${stars}★): revisión ${followupId || ''}`.trim(), now);
 }
}

export async function kbFor(env, skills, limit = 10) {
 const list = (Array.isArray(skills) ? skills : []).filter(s => typeof s === 'string').slice(0, 10);
 if (!list.length) return [];
 return all(env, `SELECT incident_id,channel,skill,title,resolution,evidence_url,stars,created_at FROM incident_kb WHERE skill IN (${list.map(() => '?').join(',')}) ORDER BY stars DESC,created_at DESC LIMIT ?`, ...list, limit);
}

// ── Web Push sin carga útil (VAPID, ES256) ──────────────────────────────────────
// El aviso no lleva datos: el service worker pregunta a /api/installer/push/peek qué hay nuevo.
// Así no hace falta cifrar el cuerpo y sirve con el portal cerrado. Mismo esquema que /incidencias.
const b64u = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64uText = s => b64u(new TextEncoder().encode(s));
export async function vapidAuthorization(env, endpoint, now = Date.now()) {
 const data = b64uText(JSON.stringify({typ: 'JWT', alg: 'ES256'})) + '.' + b64uText(JSON.stringify({aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 43200, sub: 'mailto:soporte@yokup.com'}));
 const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE), {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
 const sig = await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, key, new TextEncoder().encode(data));
 return `vapid t=${data}.${b64u(new Uint8Array(sig))}, k=${env.VAPID_PUBLIC}`;
}
export function validPushEndpoint(value) {
 try { const u = new URL(String(value || '')); return u.protocol === 'https:' && u.href.length <= 800 ? u.href : null; } catch { return null; }
}
/** Un push por aviso nuevo de instalador suscrito; si falla, se reintenta en el siguiente barrido. */
export async function sendPushAlerts(env) {
 if (!env.VAPID_PRIVATE || !env.VAPID_PUBLIC) return 0;
 const pending = await all(env, `SELECT n.id,n.installer_id FROM installer_notifications n JOIN installer_incidents i ON i.id=n.incident_id
  WHERE i.status='open' AND n.read_at IS NULL AND NOT EXISTS(SELECT 1 FROM installer_push_sent p WHERE p.notification_id=n.id)
  AND EXISTS(SELECT 1 FROM installer_push_subscriptions s WHERE s.installer_id=n.installer_id) LIMIT 200`);
 let sent = 0;
 for (const n of pending) {
  const claimed = await run(env, 'INSERT OR IGNORE INTO installer_push_sent(notification_id,sent_at) VALUES(?,?)', n.id, Date.now());
  if (!claimed.meta.changes) continue;
  let ok = false;
  for (const s of await all(env, 'SELECT endpoint FROM installer_push_subscriptions WHERE installer_id=?', n.installer_id)) {
   try {
    const r = await httpFetch(env)(s.endpoint, {method: 'POST', headers: {TTL: '3600', Urgency: 'high', Authorization: await vapidAuthorization(env, s.endpoint)}});
    if (r.status === 404 || r.status === 410) await run(env, 'DELETE FROM installer_push_subscriptions WHERE endpoint=?', s.endpoint);
    else if (r.ok) { ok = true; await run(env, 'UPDATE installer_push_subscriptions SET last_ok_at=? WHERE endpoint=?', Date.now(), s.endpoint); }
   } catch {}
  }
  if (ok) sent++; else await run(env, 'DELETE FROM installer_push_sent WHERE notification_id=?', n.id);
 }
 return sent;
}

// ── API de servicio del Desk (DeepAgents y clasificador) ─────────────────────────
// Bearer = DESK_SERVICE_KEY o la misma clave de agentes con la que el Desk entrega el encargo
// (DEEPAGENT_PANEL_KEY = ADMIRA_TELEGRAM_PANEL_KEY de la bóveda): no hay que repartir otro secreto.
function deskJson(body, status = 200) {
 return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
}
function sameSecret(a, b) {
 if (!a || !b || a.length !== b.length) return false;
 let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
 return d === 0;
}
export async function handleDesk(request, env) {
 try {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!(sameSecret(token, env.DESK_SERVICE_KEY || '') || sameSecret(token, env.DEEPAGENT_PANEL_KEY || ''))) return deskJson({error: 'No autorizado.'}, 401);
  const path = new URL(request.url).pathname.replace('/api/desk', ''), method = request.method;
  const body = async () => { const raw = await request.text(); if (raw.length > 16384) throw Object.assign(new Error('Petición demasiado grande.'), {status: 413}); try { const b = JSON.parse(raw || '{}'); if (b && typeof b === 'object' && !Array.isArray(b)) return b; } catch {} throw Object.assign(new Error('JSON no válido.'), {status: 400}); };
  if (path === '/sweep' && method === 'POST') return deskJson({ok: true, ...(await sweepDesk(env))});
  const m = /^\/incidents\/([\w:-]+)(?:\/(progress|resolve))?$/.exec(path);
  if (!m) return deskJson({error: 'Ruta no encontrada.'}, 404);
  const [, id, verb] = m;
  if (!verb && method === 'GET') {
   const inc = await first(env, 'SELECT i.id,i.title,i.status,i.channel,i.deepagent,i.dispatch_round,i.escalated_at,i.evidence_url,i.resolution,i.created_at,i.assigned_at,i.resolved_at,d.skill FROM installer_incidents i JOIN installer_devices d ON d.id=i.device_id WHERE i.id=?', id);
   if (!inc) return deskJson({error: 'Incidencia no encontrada.'}, 404);
   return deskJson({incident: inc, timeline: await all(env, 'SELECT kind,detail,created_at FROM incident_timeline WHERE incident_id=? ORDER BY created_at', id)});
  }
  if (verb === 'progress' && method === 'POST') return deskJson(await recordProgress(env, id, "channel='digital' AND installer_id LIKE 'deepagent:%'", [], (await body()).note));
  if (verb === 'resolve' && method === 'POST') return deskJson(await resolveWithEvidence(env, id, {deepagent: true}, await body()));
  return deskJson({error: 'Método no permitido.'}, 405);
 } catch (e) {
  if (!e.status) console.error('Desk request failed', e.message);
  return deskJson({error: e.status ? e.message : 'No se pudo completar la operación.'}, e.status || 500);
 }
}
