import { assignedWorkBlockers, legacyAcademyAvailability, pauseLegacyAcademy, pauseAutomaticRun } from './automatic-work-priority.js';
import { principalTargetKey, resolveAgentPrincipalProject } from './agent-principal-project.js';
import puppeteer from "@cloudflare/puppeteer";
import { handleAuthRequest, sessionTokenFromRequest, withCredentialCors } from "./auth-flow.js";
import { machineRefKey, machineRefSqlKey, memberRefMatches, resolveDecisionIdentity, resolveDecisionProject, selectDecisionProjectAssignment, projectSlug as decisionProjectSlug } from "./decision-project.js";
import { AGENT_IDENTITY_SPEC, agentFamilyKey, agentFamilySqlKey, baseAgentIdentity, canonicalMachineSuffix, groupingIdentityKey, identityKey, identitySqlKey, isKnownPersona, machineIdentitySqlKey, machineSuffix, parseAgentIdentity, reportAgentFamily, reportAgentIdentity, scopedAgentIdentity, sameAgentFamily } from "./agent-identity.js";
import { matchAgentDetailPresence, parseAgentDetailQuery, safeAgentDetailText } from "./agent-detail-contract.js";
import { buildReportsPageFilter, encodeReportsCursor, parseReportsPageOptions } from "./reports-pagination.js";
import { parseDecideOptions, ideaDeliberationText, buildDecideDecisionOptions } from "./ideas-decide.js";
import { AgentStopError, dispatchAgentStart, dispatchAgentStop, normalizeAgentStartTarget, normalizeAgentStopTarget, readAgentControlResult } from "./fleet-agent-stop.js";
import { dispatchCliTerminal, normalizeCliTerminalRequest, readCliTerminalResult, verifyCliTerminalTarget } from "./fleet-cli-terminal.js";
import { authorizeDesktopCaptureClear, clearDesktopCapture, dispatchDesktopCapture, dispatchDesktopVerifyClose, dispatchDesktopWrite, readDesktopResult } from "./fleet-desktop.js";
import { PtyRoom } from "./pty-room.js";
import { DISPLAY_REF_ENTITY_TYPES, epochMillis, formatDisplayRef, madridDayKey, madridDayStart, sortDisplayRefCandidates } from "./display-ref.js";
import { MISSION_NOVELTY_DECISION_INDEX_SQL, MISSION_NOVELTY_INDEX_SQL, MISSION_NOVELTY_INSERT_SQL, MISSION_NOVELTY_RECENT_SQL, MISSION_NOVELTY_TABLE_SQL, missionNoveltyContract, missionNoveltyEventKey } from "./mission-novelty.js";
import { PROJECT_NOVELTY_INDEX_SQL, PROJECT_NOVELTY_INSERT_SQL, PROJECT_NOVELTY_RECENT_SQL, PROJECT_NOVELTY_TABLE_SQL, projectNoveltyContract, projectNoveltyEventKey } from "./project-novelty.js";
import { resolveIdeaAuthor } from "./idea-author.js";
import { CARBON_BEAT_WINDOW_MS, CARBON_MEMBERS_INDEX_SQL, CARBON_MEMBERS_TABLE_SQL, carbonBeat, carbonRow, carbonSeedSql, normalizeCarbonMember, carbonId } from "./carbon-members.js";
import { CARBON_YARIGAI_SEED, CARBON_YARIGAI_TABLE_SQL, carbonActivity, normalizeCarbonYarigai } from "./carbon-activity.js";
import {
  CLI_CATALOGO,
  ackMatchesCommand,
  authorizeCliExecutor,
  canonicalCliAction,
  canonicalCliMachine,
  canonicalCliTarget,
  cliAckTransition,
  cliPermitido,
  cliTipo,
  desiredStateForAction,
  validateCliAckBody
} from "./cli-executor-contract.js";
import { missionProofOrigin, OWN_MEDIA_ORIGINS } from "./proof-origin.js";
import { SELLO_WORKER } from "./version-stamp.js";
import { validateCoachCompletion, validateCoachLaunch, coachLessonForSlot, coachLessonForDimension, COACH_AUDIENCES, COACH_HOUR } from "./academy-coach.js";
import { missionDayRange, missionVisibleCounts, missionVisibleDetails,
  onIdleEligibility, taskOperationalDetails, taskVisibleDetails } from "./mission-visible.js";
import { DAILY_MISSION_CLOSE_AUTHOR, DAILY_MISSION_CLOSE_EVENT_KIND, DAILY_MISSION_CLOSE_LEASE_MS, DAILY_MISSION_CLOSE_REASON, MISSION_UNCONCLUDED_AFTER_MS, dailyMissionCloseEventText, dailyMissionClosePlan } from "./daily-mission-close.js";
import { selectOnIdleProposals, onIdleProposalTitleKey } from "./onidle-proposals.js";
import { ONIDLE_BACK_OPTION, ONIDLE_CUSTOM_OPTION, isCanonicalOnIdleDecision,
  isCanonicalOnIdleOptions, selectCanonicalLiveOnIdleDecision } from "./onidle-decision-contract.js";
import { canonicalProjectAgentRef, canonicalProjectAgentRefs, YOKUP_MINI_MEMBER_BACKFILL_SQL } from "./project-member-identity.js";
import { PROJECT_BOTH_RESPONSIBLES_CAS_SQL, PROJECT_CARBON_CAS_SQL, PROJECT_METADATA_UPSERT_SQL, PROJECT_SILICON_CAS_SQL, projectCarbonResponsible, validateProjectResponsibleTypes } from "./project-responsibles.js";
import { PROJECT_CARBON_ASSIGNMENTS_TABLE_SQL, PROJECT_CARBON_ASSIGNMENT_UPSERT_IF_CURRENT_SQL, PROJECT_CARBON_ASSIGNMENT_UPSERT_SQL, projectCarbonKey } from "./project-carbon-assignments.js";
import { isProjectShotAllowed, normalizeProjectWeb } from "./project-web.js";
import { AGENT_SOURCE_SQL, AGENT_SOURCE_SQL_T, FIELD_SOURCE_SQL_T, MISSION_SCOPE_SQL,
  MISSION_SCOPE_SQL_T, FIELD_MISSION_SCOPE_SQL_T, FLEET_MISSIONS_SQL } from "./mission-sources.js";
import { normalizeProjectLaunch, projectLaunchTarget } from "./project-launch.js";
import { ensureHourlyModeSchema, evaluateModeOpportunity, hourlySlot, learningPrompt, trainingPrompt, listAgentModes, modeTargetKey, normalizeModeTarget, runHourlyModes, saveAgentMode, validateTrainingProposals } from "./fleet-hourly-modes.js";
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.js
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type,authorization"
};
var json = /* @__PURE__ */ __name((o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "content-type": "application/json" } }), "json");
var AUTH_CLIENT_ID = "861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com";
// Dominio propio: LaLiga bloquea workers.dev/r2.dev en horas de fútbol (FLT-1633); workers.dev sigue vivo como respaldo.
var WL_API = "https://whitelist.admira.store";
var WL_FALLBACK = ["csilva@admira.com", "csilvasantin@gmail.com", "mzavaleta@admira.com", "agonzalez@admira.com", "jsedano@admira.com"];
var PROTECTED = /* @__PURE__ */ new Set(["/copilot", "/tickets", "/tickets/status", "/tickets/delete", "/tasks/all", "/ticket", "/ticket/note", "/ticket/status", "/ticket/simulate", "/incidents", "/stats", "/agents", "/ai-triage", "/ai-summary", "/ai-suggest", "/kb-search", "/push/subscribe", "/fleet/nudge", "/fleet/onidle-request", "/fleet/agent/stop", "/fleet/agent/control", "/fleet/cli/terminal", "/fleet/desktop/write", "/fleet/desktop/capture", "/fleet/desktop/verify-close", "/fleet/desktop/capture/clear", "/fleet/pty/ticket", "/equipo/machine", "/equipo/silicon", "/strategy", "/config"]);
var _wl = { at: 0, set: null };
async function whitelist() {
  if (_wl.set && Date.now() - _wl.at < 3e5) return _wl.set;
  try {
    const r = await fetch(WL_API + "/list", { cf: { cacheTtl: 60 } });
    const d = await r.json();
    const s = new Set((d.emails || []).map((e) => String(e).toLowerCase().trim()));
    if (s.size) {
      _wl = { at: Date.now(), set: s };
      return s;
    }
  } catch (e) {
  }
  return new Set(WL_FALLBACK.map((e) => e.toLowerCase()));
}
__name(whitelist, "whitelist");
var b64u = /* @__PURE__ */ __name((buf) => {
  const u = new Uint8Array(buf);
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}, "b64u");
var b64uJson = /* @__PURE__ */ __name((o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "b64uJson");
async function hmac(env, data) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.YK_SESSION_SECRET || "yokup-dev-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
}
__name(hmac, "hmac");
async function makeSession(env, email, name = "") {
  // `name` procede del token Google ya verificado. Las sesiones antiguas sólo
  // traen email y siguen siendo compatibles mediante un alias local sin dominio.
  const p = b64uJson({ email, name:String(name || "").replace(/\s+/g, " ").trim().slice(0, 80), sid:crypto.randomUUID(), iat:Date.now(), exp: Date.now() + 12 * 3600 * 1e3 });
  return p + "." + b64u(await hmac(env, p));
}
__name(makeSession, "makeSession");
var authRevocationSchemaReady = null;
async function ensureAuthRevocationSchema(env) {
  if (!authRevocationSchemaReady) authRevocationSchemaReady = env.DB.prepare("CREATE TABLE IF NOT EXISTS auth_session_revocations (sid TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)").run()
    .catch((error) => { authRevocationSchemaReady = null; throw error; });
  return authRevocationSchemaReady;
}
async function readSession(env, token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [p, sig] = token.split(".");
  if (b64u(await hmac(env, p)) !== sig) return null;
  try {
    const body = JSON.parse(decodeURIComponent(escape(atob(p.replace(/-/g, "+").replace(/_/g, "/")))));
    if (!body.exp || Date.now() > body.exp) return null;
    if (body.sid && env.DB) {
      await ensureAuthRevocationSchema(env);
      if (await env.DB.prepare("SELECT sid FROM auth_session_revocations WHERE sid=? AND expires_at>?").bind(body.sid, Date.now()).first()) return null;
    }
    return body;
  } catch (e) {
    return null;
  }
}
__name(readSession, "readSession");
async function revokeSession(env, token) {
  const session = await readSession(env, token);
  if (!session || !session.sid || !env.DB) return;
  await ensureAuthRevocationSchema(env);
  await env.DB.prepare("INSERT OR REPLACE INTO auth_session_revocations(sid,expires_at) VALUES(?,?)").bind(session.sid, session.exp).run();
}
__name(revokeSession, "revokeSession");
async function makePtyTicket(env, email, target) {
  const payload = b64uJson({
    scope:"pty-view", email:String(email || "").toLowerCase().slice(0, 120),
    target, nonce:crypto.randomUUID(), exp:Date.now() + 60 * 1000
  });
  return payload + "." + b64u(await hmac(env, payload));
}
__name(makePtyTicket, "makePtyTicket");
function ptyRoomKey(target) {
  return [target.machine, target.persona, target.runtime, target.host, target.session_id, target.pid]
    .map((value) => String(value == null ? "" : value).trim().toLowerCase()).join("\u001f");
}
__name(ptyRoomKey, "ptyRoomKey");
function yokupViewerOrigin(request) {
  const origin = String(request.headers.get("origin") || "").toLowerCase();
  return origin === "https://yokup.com" || origin === "https://www.yokup.com";
}
__name(yokupViewerOrigin, "yokupViewerOrigin");
async function openPtyRoom(env, request, target, role) {
  if (!env.PTY || typeof env.PTY.get !== "function") return json({ ok:false, error:"pty-binding-unavailable" }, 503);
  const headers = new Headers();
  headers.set("Upgrade", "websocket");
  headers.set("x-pty-role", role);
  const stub = env.PTY.get(env.PTY.idFromName(ptyRoomKey(target)));
  return stub.fetch(new Request("https://pty-room.internal/connect", { headers }));
}
__name(openPtyRoom, "openPtyRoom");
async function requireAuth(env, req) {
  return readSession(env, sessionTokenFromRequest(req));
}
__name(requireAuth, "requireAuth");
var AI_MODELS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/meta/llama-3.2-3b-instruct"
];
async function aiRun(env, prompt, maxTokens = 200) {
  for (const model of AI_MODELS) {
    try {
      const r = await env.AI.run(model, { messages: [{ role: "user", content: prompt }], max_tokens: maxTokens });
      const text = r && (r.response || r.result && r.result.response) || "";
      if (text) return text.trim();
    } catch (e) {
    }
  }
  return "";
}
__name(aiRun, "aiRun");
var EMB_MODEL = "@cf/google/embeddinggemma-300m";
async function embed(env, text) {
  try {
    const r = await env.AI.run(EMB_MODEL, { text: [String(text).slice(0, 2e3)] });
    return r && r.data && r.data[0] || null;
  } catch (e) {
    return null;
  }
}
__name(embed, "embed");
var b64uStr = /* @__PURE__ */ __name((s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "b64uStr");
function b64uBytes(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64uBytes, "b64uBytes");
async function vapidJWT(env, aud) {
  const data = b64uStr(JSON.stringify({ typ: "JWT", alg: "ES256" })) + "." + b64uStr(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1e3) + 43200, sub: "mailto:soporte@yokup.com" }));
  const key = await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVATE), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(data));
  return data + "." + b64uBytes(new Uint8Array(sig));
}
__name(vapidJWT, "vapidJWT");
async function notifySubs(env) {
  if (!env.VAPID_PRIVATE) return;
  try {
    const { results } = await env.DB.prepare("SELECT endpoint FROM subs").all();
    for (const s of results || []) {
      try {
        const jwt = await vapidJWT(env, new URL(s.endpoint).origin);
        const r = await fetch(s.endpoint, { method: "POST", headers: { TTL: "3600", Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}` } });
        if (r.status === 404 || r.status === 410) await env.DB.prepare("DELETE FROM subs WHERE endpoint=?").bind(s.endpoint).run();
      } catch (e) {
      }
    }
  } catch (e) {
  }
}
__name(notifySubs, "notifySubs");
var ROSTER = [
  { name: "Javier M.", skills: "climatizaci\xF3n, LED", zone: "Madrid" },
  { name: "Laura R.", skills: "redes, players", zone: "Barcelona" },
  { name: "Dani K.", skills: "redes, sens\xF3rica", zone: "Valencia" },
  { name: "Sof\xEDa P.", skills: "retail, DOOH", zone: "Bilbao" },
  { name: "Construcciones Oria", skills: "obra, instalaci\xF3n", zone: "Barcelona" }
];
// ROSTER ya NO es la plantilla: es la SEMILLA con la que nace el censo de
// carbono la primera vez, para que el día del despliegue nada cambie de sitio.
// A partir de ahí la verdad está en la tabla `carbon_members` y se edita desde
// /equipo, no editando este fichero y volviendo a desplegar el worker.
//
// El orden importa: el reparto de incidencias es `hash(pantalla) % plantilla`, y
// sembrar por orden alfabético habría movido a cada técnico de pantalla sin que
// nadie lo pidiera. Por eso el alta lleva `created_at` incremental y la lectura
// ordena por ahí: la plantilla sembrada conserva EXACTAMENTE el orden del array.
// Fecha de nacimiento del censo, fija y anterior a cualquier alta real, para que
// la plantilla sembrada quede SIEMPRE por delante en el ORDER BY created_at y
// quien se dé de alta mañana no se cuele en medio del reparto.
var CARBON_ROSTER_SEED_SQL = carbonSeedSql(ROSTER, Date.parse("2026-08-15T00:00:00Z"));

// La plantilla ACTIVA, en el orden en que se dio de alta. Es lo que reparte
// incidencias y lo que sale por /agents. Si alguien vacía la tabla se cae a
// ROSTER en vez de dejar las incidencias sin asignar: quedarse sin plantilla no
// puede significar quedarse sin poder abrir un parte.
async function carbonRoster(env) {
  const rows = ((await env.DB.prepare(
    "SELECT id,name,role,zone,skills,contact,status,created_at,updated_at,last_beat_at,focus,focus_at " +
    "FROM carbon_members WHERE status='activo' ORDER BY created_at ASC, id ASC").all()).results) || [];
  return rows.length ? rows : ROSTER.map((t) => Object.assign({ id: "", status: "activo" }, t));
}
__name(carbonRoster, "carbonRoster");

function hash(s) {
  let h = 0;
  for (const c of String(s)) h = h * 31 + c.charCodeAt(0) >>> 0;
  return h;
}
__name(hash, "hash");
async function applySchema(env) {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, screen TEXT, subject TEXT, loc TEXT, role TEXT, status TEXT, priority TEXT, assignee TEXT, source TEXT, ai_triage TEXT, created_at INTEGER, updated_at INTEGER, resolved_at INTEGER)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT, ts INTEGER, kind TEXT, author TEXT, text TEXT)");
  await env.DB.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_active_screen ON tickets(screen) WHERE status NOT IN ('resolved','cancelled')");
  await env.DB.exec("DROP INDEX IF EXISTS idx_open_screen");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_ev_tkt ON events(ticket_id)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS subs (endpoint TEXT PRIMARY KEY, created_at INTEGER)");
  // NOTIFICACIONES DEL SISTEMA (FLT-1020, Carlos 24-jul-2026): «si algún equipo de
  // AdmiraNeXT tiene una notificación del sistema hay que avisar». Un diálogo modal
  // (permiso TCC, Gatekeeper, contraseña…) DETIENE a ese equipo y nadie se entera
  // hasta que alguien mira su pantalla. El vigilante de cada máquina publica aquí
  // lo que ve, con captura. `fingerprint` = máquina+dueño del diálogo: mientras el
  // mismo diálogo siga en pantalla se ACTUALIZA la fila, no se acumulan copias.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS notifs (id TEXT PRIMARY KEY, fingerprint TEXT, machine TEXT, owner TEXT, titulo TEXT, kind TEXT, image TEXT, status TEXT DEFAULT 'abierta', first_at INTEGER, last_at INTEGER, closed_at INTEGER, seen_count INTEGER DEFAULT 1)");
  await env.DB.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_fp ON notifs(fingerprint) WHERE status='abierta'");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_notif_st ON notifs(status, last_at)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS prefs (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)");
  // RELOJES DE DECISIÓN (Carlos, 2026-07-21): un equipo de silicio publica aquí
  // lo que tiene pendiente de decidir, con sus 3 opciones y una cuenta atrás.
  // Si Carlos no elige antes del deadline, el agente tira con la recomendada.
  // ESTRATEGIA (norte de cada equipo). Vivía SOLO en la rama feat-estrategia-fase2
  // y se desplegó desde ahí el 2026-07-23; al redesplegar el worker desde main el
  // 2026-08-05 se cayó de producción sin que nadie lo notara. Va a main para que
  // no dependa de qué rama toque desplegar (lo tumbé yo; ver /fleet/strategy).
  // CONFIG DE FLOTA: banderas operativas que TODOS los agentes leen al arrancar
  // (MODO_RAPIDO, etc.). No son secretos —MODO_RAPIDO está publicado en la
  // normativa— así que no pintan nada en la Cúpula: meterlos allí obligaba a
  // mover VAULT_ADMIN, una clave que protege secretos de verdad, para escribir
  // una bandera pública (Carlos, 2026-08-05). Lectura abierta, escritura tras
  // el perímetro: nadie tiene que manejar una credencial para cambiarlas.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS fleet_config (name TEXT PRIMARY KEY, value TEXT, updated_at INTEGER, updated_by TEXT)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS strategy (team TEXT PRIMARY KEY, text TEXT, updated_at INTEGER, updated_by TEXT)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, machine TEXT, agent TEXT, surface TEXT, question TEXT, options TEXT, recommended INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', chosen INTEGER, chosen_by TEXT, created_at INTEGER, deadline INTEGER, decided_at INTEGER)");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_dec_status ON decisions(status, deadline)");
  // Contexto que engloba la decisión. `project` es el nombre humano canónico;
  // `mission` y `url` permiten resolver decisiones antiguas sin inferir nunca
  // el proyecto desde la pregunta operativa.
  await env.DB.exec("ALTER TABLE decisions ADD COLUMN url TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE decisions ADD COLUMN mission TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE decisions ADD COLUMN project TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE decisions ADD COLUMN project_slug TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE decisions ADD COLUMN parent_decision TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE decisions ADD COLUMN batch_id TEXT").catch(() => {});
  // Referencias estructuradas opcionales, alineadas con `options`. Una opción
  // OnIdle puede apuntar a una misión canónica sin convertir su título en una
  // pseudo-clave frágil. Las filas históricas conservan NULL.
  await env.DB.exec("ALTER TABLE decisions ADD COLUMN option_targets TEXT").catch(() => {});
  // Reserva durable del publicador OnIDLE del servidor. La clave identidad+día+
  // ordinal hace que cron y piggyback reparen el mismo intento tras un timeout,
  // en vez de abrir dos ventanas. La decisión conserva el estado funcional; este
  // ledger sólo registra la publicación idempotente y nunca contiene secretos.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS onidle_ticks (identity_key TEXT NOT NULL, day TEXT NOT NULL, ordinal INTEGER NOT NULL, agent TEXT NOT NULL, machine TEXT NOT NULL, project_id TEXT NOT NULL, decision_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'reserved', reserved_at INTEGER NOT NULL, published_at INTEGER, PRIMARY KEY(identity_key,day,ordinal))");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_onidle_ticks_status ON onidle_ticks(status,reserved_at)");
  // Peticiones humanas de ventana inmediata. El navegador nunca crea decisiones:
  // deja una intención idempotente y el servidor la resuelve con el mismo
  // publicador OnIDLE que usa scheduled(), bajo lease y guardas operativas.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS onidle_requests (id TEXT PRIMARY KEY, requested_by TEXT NOT NULL, agent TEXT NOT NULL, machine TEXT NOT NULL, project_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'requested', decision_id TEXT, reason TEXT, deadline INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_onidle_requests_identity ON onidle_requests(agent,machine,project_id,created_at)");
  // Una decisión de misiones es una tanda, no cinco trabajos independientes.
  // Se persiste la cola, pero cada cierre deja la tanda en
  // `awaiting_continuation`: la siguiente misión sólo puede salir de una nueva
  // ventana enlazada de cinco minutos.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS mission_batches (id TEXT PRIMARY KEY, decision_id TEXT UNIQUE, agent TEXT, machine TEXT, status TEXT DEFAULT 'active', pause_reason TEXT, active_mission_id TEXT, created_at INTEGER, updated_at INTEGER)");
  await env.DB.exec("ALTER TABLE mission_batches ADD COLUMN project_id TEXT").catch(() => {});
  await env.DB.exec("CREATE TABLE IF NOT EXISTS mission_batch_items (batch_id TEXT, position INTEGER, option_index INTEGER, title TEXT, mission_id TEXT, status TEXT DEFAULT 'queued', created_at INTEGER, updated_at INTEGER, PRIMARY KEY (batch_id, position))");
  await env.DB.exec("ALTER TABLE mission_batch_items ADD COLUMN target_mission_id TEXT").catch(() => {});
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_batch_items_active ON mission_batch_items(batch_id, status, position)");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_batch_items_mission ON mission_batch_items(mission_id)");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_batch_items_target ON mission_batch_items(target_mission_id)").catch(() => {});
  await env.DB.exec("CREATE TABLE IF NOT EXISTS mission_tasks (mission_id TEXT, code TEXT, title TEXT, status TEXT DEFAULT 'pending', owner TEXT, report TEXT, updated_at INTEGER, PRIMARY KEY (mission_id, code))");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_mtasks_mission ON mission_tasks(mission_id)");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_mtasks_reports_page ON mission_tasks(updated_at DESC,mission_id DESC,code DESC) WHERE report IS NOT NULL AND TRIM(report)<>''");
  // NOVEDADES DE MISIÓN: el contador open/in_progress es estado mutable y puede
  // volver al mismo total entre dos sondeos. Este log append-only da al navegador
  // un cursor monotónico que no desaparece cuando la misión avanza o se cierra.
  await env.DB.exec(MISSION_NOVELTY_TABLE_SQL);
  await env.DB.exec(MISSION_NOVELTY_INDEX_SQL);
  await env.DB.exec(MISSION_NOVELTY_DECISION_INDEX_SQL);
  // Histórico compartido del Highscore. Una muestra por agente y minuto basta
  // para comparar la última hora sin depender del navegador que lo consulta.
  // Ordenes de encendido/apagado de los CLI de la flota. La orden la crea alguien
  // AUTENTICADO en el Highscore (perimetro Google) y el ejecutor se autentica con
  // YOKUP_CLI_EXECUTOR_TOKEN antes de recogerla o reportar estado.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS cli_commands (id TEXT PRIMARY KEY, machine TEXT NOT NULL, cli TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', requested_by TEXT, detail TEXT, created_at INTEGER NOT NULL, updated_at INTEGER)");
  await env.DB.exec("ALTER TABLE cli_commands ADD COLUMN result_detail TEXT").catch(() => {});
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_cli_commands_pend ON cli_commands(machine,status,created_at)");
  // Latido: cada ejecutor dice si SU cli esta vivo. Sin latido reciente no se afirma
  // que este apagado, se dice que no se sabe: son cosas distintas.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS cli_state (machine TEXT NOT NULL, cli TEXT NOT NULL, alive INTEGER, pid INTEGER, seen_at INTEGER NOT NULL, PRIMARY KEY(machine,cli))");
  await env.DB.exec("ALTER TABLE cli_state ADD COLUMN desired TEXT NOT NULL DEFAULT 'unknown'").catch(() => {});
  await env.DB.exec("ALTER TABLE cli_state ADD COLUMN desired_command_id TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE cli_state ADD COLUMN desired_at INTEGER").catch(() => {});
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_cli_commands_target_status ON cli_commands(machine,cli,status,created_at)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS highscore_snapshots (agent_key TEXT NOT NULL, agent TEXT NOT NULL, machine TEXT, sampled_at INTEGER NOT NULL, points INTEGER NOT NULL, PRIMARY KEY(agent_key,sampled_at))");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_highscore_snapshots_time ON highscore_snapshots(sampled_at)");
  // image: URL pública de la captura de prueba del informe (R2 /media/…). La tabla
  // ya existe en prod, así que la columna se añade idempotente (ignora "duplicate").
  await env.DB.exec("ALTER TABLE mission_tasks ADD COLUMN image TEXT").catch(() => {});
  // La imagen de una tarea puede ser un avance o la evidencia del cierre. Sin
  // este discriminante, una captura intermedia podía cerrar toda la misión.
  await env.DB.exec("ALTER TABLE mission_tasks ADD COLUMN image_kind TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE mission_tasks ADD COLUMN created_at INTEGER").catch(() => {});
  // Inicio operativo estable: repetir reportes/heartbeats no reinicia el reloj.
  await env.DB.exec("ALTER TABLE mission_tasks ADD COLUMN started_at INTEGER").catch(() => {});
  // Fin operativo estable: una tarea terminada conserva el instante de SU
  // transición a done. `updated_at` no sirve para esto porque también cambia al
  // añadir un informe, una evidencia o corregir el título después del cierre.
  await env.DB.exec("ALTER TABLE mission_tasks ADD COLUMN ended_at INTEGER").catch(() => {});
  // El responsable de una tarea es siempre el agente principal de la misión.
  // Sub*/Infra* describen únicamente quién la ejecutó y no reciben puntuación.
  await env.DB.exec("ALTER TABLE mission_tasks ADD COLUMN executor TEXT").catch(() => {});
  await env.DB.exec(
    "UPDATE mission_tasks SET executor=CASE WHEN COALESCE(TRIM(executor),'')='' AND COALESCE(TRIM(owner),'')<>'' " +
    "AND owner<>(SELECT assignee FROM tickets WHERE tickets.id=mission_tasks.mission_id) THEN owner ELSE executor END, " +
    "owner=(SELECT assignee FROM tickets WHERE tickets.id=mission_tasks.mission_id) " +
    "WHERE EXISTS(SELECT 1 FROM tickets WHERE tickets.id=mission_tasks.mission_id AND COALESCE(TRIM(assignee),'')<>'' " +
    "AND COALESCE(mission_tasks.owner,'')<>assignee)"
  ).catch(() => {});
  await env.DB.exec("UPDATE mission_tasks SET created_at=updated_at WHERE created_at IS NULL").catch(() => {});
  // Llave de lectura del service worker (ver /push/subscribe). Idempotente.
  await env.DB.exec("ALTER TABLE subs ADD COLUMN peek_key TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN proof_image TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN proof_kind TEXT").catch(() => {});
  await env.DB.exec("UPDATE tickets SET proof_kind='legacy-unverified' WHERE proof_image IS NOT NULL AND proof_image<>'' AND proof_kind IS NULL").catch(() => {});
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN note TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN agent_runtime TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN agent_host TEXT").catch(() => {});
  // CAPTURA EN VIVO del CLI mientras trabaja (Carlos, 2026-07-18: «no hay nada
  // peor que no tener feedback de cómo trabaja el equipo»). live_shot = última
  // captura del terminal (R2), live_at = cuándo se tomó → la tarjeta enseña que
  // el agente NO está parado, con halo si la captura es fresca.
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN live_shot TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN live_at INTEGER").catch(() => {});
  // `process` es una captura fresca tomada durante la ejecución.
  // `final-fallback` sólo existe como degradación explícita y visible.
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN live_kind TEXT").catch(() => {});
  // Procedencia auditable de la captura de proceso. Sólo hay dos contratos:
  // Desktop enseña la petición visible; CLI enseña comando y salida visibles.
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN live_surface TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN live_context TEXT").catch(() => {});
  // Inicio de ejecución, distinto de created_at (una misión puede esperar horas
  // antes de ser reclamada) y de updated_at/live_at (heartbeats renovables).
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN started_at INTEGER").catch(() => {});
  // PROYECTOS (Carlos, 2026-07-22: «en equipo tenemos que poder dar de alta
  // proyectos y asignárselos a ordenadores o agentes»). Antes el proyecto era
  // texto libre repetido en tres sitios —la lista fija de equipo.html, el
  // adivinador por palabras de yk-misiones.js y la columna `project` de
  // decisions—, así que /decisiones acababa enseñando «Proyecto sin identificar».
  // Aquí vive el censo REAL, con su alta, su baja y sus asignaciones.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT, blurb TEXT, web TEXT, status TEXT DEFAULT 'activo', color TEXT, importance INTEGER NOT NULL DEFAULT 0 CHECK (importance BETWEEN 0 AND 5), carbon_responsible TEXT NOT NULL DEFAULT '', created_at INTEGER, updated_at INTEGER, updated_by TEXT)");
  // Sólo las altas posteriores a este esquema escriben aquí. No se hace backfill:
  // el despliegue establece baseline y no anuncia como nuevos proyectos históricos.
  await env.DB.exec(PROJECT_NOVELTY_TABLE_SQL);
  await env.DB.exec(PROJECT_NOVELTY_INDEX_SQL);
  // Un proyecto toca VARIAS máquinas y VARIOS agentes. `kind` distingue los dos
  // planos que la sección Equipo ya separa (átomos/bits) y `ref` es el id que
  // usa admira-fleet (machines[].id / silicon[].id): NO se inventa censo nuevo.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS project_members (project_id TEXT, kind TEXT, ref TEXT, added_at INTEGER, PRIMARY KEY (project_id, kind, ref))");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_pmembers_ref ON project_members(kind, ref)");
  // Selección de superficie por proyecto y máquina. Es intención operativa
  // persistente; el estado vivo sigue viniendo del process_snapshot del watcher.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS project_launch_assignments (project_id TEXT NOT NULL, machine TEXT NOT NULL, platform TEXT NOT NULL, runtime TEXT NOT NULL, model TEXT DEFAULT '', selection TEXT NOT NULL, persona TEXT NOT NULL, session_id TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT DEFAULT '', PRIMARY KEY(project_id,machine))");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_project_launch_machine ON project_launch_assignments(machine,project_id)");
  // PROYECTO PRINCIPAL DIARIO por identidad operativa exacta. Es una declaración
  // temporal y auditable: NO convierte al agente en miembro, NO cambia owner y
  // NO reescribe ids del censo. La clave día+agente hace idempotente repetir
  // «hoy el proyecto principal de X es Y» y conserva los días anteriores.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS agent_project_declarations (day TEXT NOT NULL, agent_key TEXT NOT NULL, agent TEXT NOT NULL, project_id TEXT NOT NULL, declared_by TEXT, statement TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(day,agent_key))");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_apd_project_day ON agent_project_declarations(project_id,day)");
  // CENSO DE CARBONO. Hasta hoy las personas del equipo eran cinco nombres
  // escritos a mano en la constante ROSTER de este mismo fichero: sin alta, sin
  // baja, sin latido y sin forma de comprobar que existen. La tabla las saca del
  // código y las pone donde ya vive el silicio. Ver src/carbon-members.js.
  await env.DB.exec(CARBON_MEMBERS_TABLE_SQL);
  await env.DB.exec(CARBON_YARIGAI_TABLE_SQL);
  await env.DB.exec(CARBON_MEMBERS_INDEX_SQL);
  await env.DB.exec(CARBON_ROSTER_SEED_SQL);
  // RESPONSABLES DEL PROYECTO (FLT-1505). `owner` ya contiene al agente de
  // silicio; se conserva y se sigue exponiendo como `primary_responsible` para no
  // romper clientes históricos. Carbono vive en una columna independiente: un
  // nombre humano nunca debe mezclarse con el censo de agentes operativos.
  await env.DB.exec("ALTER TABLE projects ADD COLUMN owner TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE projects ADD COLUMN carbon_responsible TEXT NOT NULL DEFAULT ''").catch(() => {});
  await env.DB.exec(PROJECT_CARBON_ASSIGNMENTS_TABLE_SQL);
  await env.DB.exec(YOKUP_MINI_MEMBER_BACKFILL_SQL);
  // ORDEN de las fichas, el que Carlos deja al arrastrarlas. Va en la tabla y no
  // en el navegador a propósito: el orden es del proyecto, no del portátil desde
  // el que se miró. NULL = nunca se ha tocado → cae al orden de siempre.
  await env.DB.exec("ALTER TABLE projects ADD COLUMN sort_order INTEGER").catch(() => {});
  // IMPORTANCIA DEL PROYECTO (FLT-1504). Es un valor compartido del censo, no
  // una preferencia local del navegador: 0 = sin priorizar y 5 = importancia
  // maxima. El DEFAULT hace que todo el historico nazca de forma honesta en 0.
  await env.DB.exec("ALTER TABLE projects ADD COLUMN importance INTEGER NOT NULL DEFAULT 0 CHECK (importance BETWEEN 0 AND 5)").catch(() => {});
  // El proyecto de una MISIÓN. No se reutiliza `loc`: en las misiones de flota
  // `loc` es la MÁQUINA destino (fleetSync la escribe ahí), no el proyecto.
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN project TEXT").catch(() => {});
  // Identificador estructurado y canónico. `project` se mantiene como espejo
  // temporal para clientes antiguos; toda misión nueva escribe ambos en su INSERT.
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN project_id TEXT").catch(() => {});
  await env.DB.exec("UPDATE tickets SET project_id=project WHERE COALESCE(project_id,'')='' AND project IN (SELECT id FROM projects)").catch(() => {});
  // Proyecto HEREDADO de una declaración de otro día: la misión nace con proyecto,
  // pero nadie lo confirmó hoy y puede no ser el suyo. Aditivo y NULLABLE: todo lo
  // ya existente queda en NULL y se sigue viendo igual. La interfaz lo pinta con
  // asterisco y color de aviso (Carlos, 6-ago-2026: «podría darnos información falsa»).
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN project_inherited INTEGER").catch(() => {});
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN project_inherited_from TEXT").catch(() => {});
  // CIERRE DIARIO de no concluidas. Son campos estructurados para que la UI no
  // tenga que inferir la causa desde una nota o desde el texto de un evento.
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN closure_reason TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN closed_at INTEGER").catch(() => {});
  // Una fila por día terminado en Europe/Madrid. Además de bitácora actúa como
  // lease recuperable: `done` no vuelve a ejecutarse; `running` caducado/error
  // puede ser retomado por otro isolate sin duplicar cambios ni eventos.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS mission_daily_closures (day TEXT PRIMARY KEY, closed_at INTEGER NOT NULL, active_after INTEGER NOT NULL, status TEXT NOT NULL, lease_token TEXT, started_at INTEGER, finished_at INTEGER, cancelled_count INTEGER DEFAULT 0, error TEXT)");
  // MISIÓN MADRE → HIJAS (FLT-990 b1). Aditivo y NULLABLE: las misiones planas de
  // hoy quedan con parent_id NULL y se ven EXACTELY igual que antes. Solo cuelga
  // quien se enganche a una madre por /fleet/parent.
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN parent_id TEXT").catch(() => {});
  // Puntos del agente ANTES y DESPUES del encargo (Carlos, 8-ago-2026). El informe
  // decia QUE se hizo; con estos dos numeros dice CUANTO produjo. La regla 17 ya
  // pedia declarar puntos al cerrar, pero sin punto de partida no se sabe cuanto
  // aporto ESE trabajo: 680 puntos no dicen nada si no sabes que empezaste en 640.
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN points_start INTEGER").catch(() => {});
  await env.DB.exec("ALTER TABLE tickets ADD COLUMN points_end INTEGER").catch(() => {});
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_tickets_parent ON tickets(parent_id)").catch(() => {});
  // REPARTO DE IDS DE FLOTA A PRUEBA DE COLISIONES (FLT-990 a2). Mapea el rowid del
  // encargo del bot-inbox al mission_id que se le repartió, para que sea ESTABLE
  // entre syncs aunque el id natural FLT-<rowid> ya estuviera cogido por otra misión.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS fleet_ids (inbox_id INTEGER PRIMARY KEY, mission_id TEXT UNIQUE, created_at INTEGER)").catch(() => {});
  // Mando humano sobre procesos vivos. Se conserva tanto el intento como el
  // resultado del servicio interno para poder reconstruir quién pidió detener
  // qué sesión, sin mezclar estos mandos con los eventos de una misión concreta.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS fleet_agent_commands (id TEXT PRIMARY KEY, action TEXT, machine TEXT, persona TEXT, runtime TEXT, host TEXT, session_id TEXT, pid INTEGER, requested_by TEXT, status TEXT, upstream_command_id TEXT, detail TEXT, created_at INTEGER, updated_at INTEGER)").catch(() => {});
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_fleet_agent_commands_created ON fleet_agent_commands(created_at)").catch(() => {});
  // Referencia humana común a objetivos, ventanas, misiones y tareas. Los ids
  // técnicos continúan siendo las claves y enlaces; este registro sólo añade la
  // etiqueta visible estable y un contador compartido por día de Madrid.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS display_ref_counters (day TEXT PRIMARY KEY, next_value INTEGER NOT NULL)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS display_refs (entity_type TEXT NOT NULL, entity_key TEXT NOT NULL, day TEXT NOT NULL, seq INTEGER NOT NULL, entity_created_at INTEGER NOT NULL, display_ref TEXT NOT NULL, assigned_at INTEGER NOT NULL, PRIMARY KEY(entity_type,entity_key), UNIQUE(day,seq))");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_display_refs_day_seq ON display_refs(day,seq)");
}
__name(applySchema, "applySchema");
// FLT-1015 · El esquema no cambia entre dos requests del mismo isolate. La
// implementación anterior repetía todas las CREATE/ALTER/INDEX (más de treinta
// round-trips D1) en cada lectura dinámica. Las escrituras y el cron conservan
// el guard, pero comparten una sola promesa; si falla se libera para reintentar.
var schemaReady = null;
async function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = applySchema(env).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}
__name(ensureSchema, "ensureSchema");

// ── REFERENCIAS HUMANAS COMUNES ─────────────────────────────────────────────
// `display_ref` no sustituye ninguna PK. Se asigna una sola vez y se persiste;
// ordenar, filtrar o paginar sólo cambia qué filas viajan, nunca su número.
var displayRefSchemaReady = null;
async function ensureDisplayRefSchema(env) {
  if (!displayRefSchemaReady) displayRefSchemaReady = (async () => {
    await env.DB.exec("CREATE TABLE IF NOT EXISTS display_ref_counters (day TEXT PRIMARY KEY, next_value INTEGER NOT NULL)");
    await env.DB.exec("CREATE TABLE IF NOT EXISTS display_refs (entity_type TEXT NOT NULL, entity_key TEXT NOT NULL, day TEXT NOT NULL, seq INTEGER NOT NULL, entity_created_at INTEGER NOT NULL, display_ref TEXT NOT NULL, assigned_at INTEGER NOT NULL, PRIMARY KEY(entity_type,entity_key), UNIQUE(day,seq))");
    await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_display_refs_day_seq ON display_refs(day,seq)");
    await env.DB.exec("ALTER TABLE mission_tasks ADD COLUMN created_at INTEGER").catch(() => {});
    await env.DB.exec("UPDATE mission_tasks SET created_at=updated_at WHERE created_at IS NULL").catch(() => {});
  })().catch((error) => { displayRefSchemaReady = null; throw error; });
  return displayRefSchemaReady;
}
__name(ensureDisplayRefSchema, "ensureDisplayRefSchema");

function taskDisplayKey(row) {
  return String(row && row.mission_id || "") + ":" + String(row && row.code || "");
}
__name(taskDisplayKey, "taskDisplayKey");

async function ensureDisplayRefCounter(env, day) {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO display_ref_counters(day,next_value) SELECT ?,COALESCE(MAX(seq)+1,0) FROM display_refs WHERE day=?"
  ).bind(day, day).run();
  await env.DB.prepare(
    "UPDATE display_ref_counters SET next_value=MAX(next_value,(SELECT COALESCE(MAX(seq)+1,0) FROM display_refs WHERE day=?)) WHERE day=?"
  ).bind(day, day).run();
}
__name(ensureDisplayRefCounter, "ensureDisplayRefCounter");

function displayRefMapKey(entityType, entityKey) {
  return entityType + "\u001f" + entityKey;
}
__name(displayRefMapKey, "displayRefMapKey");

async function readEntityDisplayRefs(env, items) {
  const found = new Map();
  for (const entityType of DISPLAY_REF_ENTITY_TYPES) {
    const keys = items.filter((item) => item.entity_type === entityType).map((item) => item.entity_key);
    for (let i = 0; i < keys.length; i += 80) {
      const chunk = keys.slice(i, i + 80), placeholders = chunk.map(() => "?").join(",");
      const result = await env.DB.prepare(
        `SELECT entity_type,entity_key,display_ref FROM display_refs WHERE entity_type=? AND entity_key IN (${placeholders})`
      ).bind(entityType, ...chunk).all();
      for (const row of result.results || []) found.set(displayRefMapKey(row.entity_type, row.entity_key), row.display_ref);
    }
  }
  return found;
}
__name(readEntityDisplayRefs, "readEntityDisplayRefs");

async function ensureManyEntityDisplayRefs(env, rawItems) {
  await ensureDisplayRefSchema(env);
  const unique = new Map();
  for (const raw of rawItems || []) {
    const entityType = String(raw && raw.entity_type || "");
    const entityKey = String(raw && raw.entity_key || "").trim();
    if (!DISPLAY_REF_ENTITY_TYPES.includes(entityType)) throw new Error("display_ref entity_type inválido");
    if (!entityKey) throw new Error("display_ref entity_key requerido");
    const stamp = epochMillis(raw.entity_created_at);
    unique.set(displayRefMapKey(entityType, entityKey), { entity_type:entityType, entity_key:entityKey, entity_created_at:stamp, day:madridDayKey(stamp) });
  }
  const items = [...unique.values()];
  if (!items.length) return new Map();
  const refs = await readEntityDisplayRefs(env, items);
  const missing = items.filter((item) => !refs.has(displayRefMapKey(item.entity_type, item.entity_key)));
  const byDay = new Map();
  for (const item of missing) {
    if (!byDay.has(item.day)) byDay.set(item.day, []);
    byDay.get(item.day).push(item);
  }
  for (const [day, dayItems] of byDay) {
    await ensureDisplayRefCounter(env, day);
    // Reserva el bloque entero en una sola operación atómica. Dentro del bloque
    // se mantiene el orden determinista del backfill; las inserciones viajan en
    // batch para no convertir una página de 300 filas en 600 round-trips D1.
    const reserved = await env.DB.prepare(
      "UPDATE display_ref_counters SET next_value=next_value+? WHERE day=? RETURNING next_value-? AS start_seq"
    ).bind(dayItems.length, day, dayItems.length).first();
    const start = Number(reserved && reserved.start_seq);
    if (!Number.isInteger(start)) throw new Error("no se pudo reservar display_ref");
    const statements = dayItems.map((item, index) => {
      const sequence = start + index;
      return env.DB.prepare(
        "INSERT OR IGNORE INTO display_refs(entity_type,entity_key,day,seq,entity_created_at,display_ref,assigned_at) VALUES(?,?,?,?,?,?,?)"
      ).bind(item.entity_type, item.entity_key, day, sequence, item.entity_created_at, formatDisplayRef(sequence, item.entity_created_at), Date.now());
    });
    for (let i = 0; i < statements.length; i += 80) {
      const chunk = statements.slice(i, i + 80);
      if (typeof env.DB.batch === "function") await env.DB.batch(chunk);
      else for (const statement of chunk) await statement.run();
    }
  }
  return readEntityDisplayRefs(env, items);
}
__name(ensureManyEntityDisplayRefs, "ensureManyEntityDisplayRefs");

async function ensureEntityDisplayRef(env, entityType, entityKey, createdAt) {
  const refs = await ensureManyEntityDisplayRefs(env, [{ entity_type:entityType, entity_key:entityKey, entity_created_at:createdAt }]);
  const visible = refs.get(displayRefMapKey(entityType, String(entityKey || "").trim()));
  if (!visible) throw new Error("no se pudo persistir display_ref");
  return visible;
}
__name(ensureEntityDisplayRef, "ensureEntityDisplayRef");

var displayRefBackfilledDays = new Set();
async function backfillDisplayRefDays(env, requestedDays) {
  const pendingDays = [...new Set(requestedDays || [])].filter((day) => day && !displayRefBackfilledDays.has(day));
  if (!pendingDays.length) return;
  await ensureSchema(env);
  await ensureDisplayRefSchema(env);
  await ensureIdeasSchema(env);
  const union = await env.DB.prepare(
    `SELECT 'objective' entity_type,id entity_key,created_at entity_created_at FROM ideas
     UNION ALL SELECT 'window',id,created_at FROM decisions
     UNION ALL SELECT 'mission',id,created_at FROM tickets
     UNION ALL SELECT 'task',mission_id||':'||code,COALESCE(created_at,updated_at) FROM mission_tasks`
  ).all();
  const candidates = sortDisplayRefCandidates(union.results || [])
    .filter((row) => pendingDays.includes(madridDayKey(row.entity_created_at)));
  await ensureManyEntityDisplayRefs(env, candidates);
  for (const day of pendingDays) displayRefBackfilledDays.add(day);
}
__name(backfillDisplayRefDays, "backfillDisplayRefDays");

async function backfillTodayDisplayRefs(env, now = Date.now()) {
  return backfillDisplayRefDays(env, [madridDayKey(now)]);
}
__name(backfillTodayDisplayRefs, "backfillTodayDisplayRefs");

async function attachDisplayRefs(env, entityType, rows, keyOf, createdOf) {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  if (!list.length) return rows;
  const items = list.map((row) => ({ entity_type:entityType, entity_key:keyOf(row), entity_created_at:createdOf(row) }));
  // Antes de asignar UNA fila histórica se rellenan conjuntamente todos los
  // objetivos/ventanas/misiones/tareas de sus días. El orden de los endpoints o
  // de una página nunca decide quién recibe el número menor.
  await backfillDisplayRefDays(env, items.map((item) => madridDayKey(item.entity_created_at)));
  const refs = await ensureManyEntityDisplayRefs(env, items);
  for (let i = 0; i < list.length; i++) list[i].display_ref = refs.get(displayRefMapKey(entityType, String(items[i].entity_key || "").trim())) || "";
  return rows;
}
__name(attachDisplayRefs, "attachDisplayRefs");

// ── IDEAS / OBJETIVOS ─────────────────────────────────────────────────────────
// Las 8 sillas del Consejo AdmiraNeXT (== array CONSEJO de yokup-site/objetivos.html):
// CEO·CTO·COO·CFO (racional) / CCO·CDO·CXO·CSO (creativo). Una idea puede colgar de
// una silla (`seat`, opcional) para que su progreso se pinte en /objetivos.
const IDEA_SEATS = /* @__PURE__ */ new Set(["ceo", "cto", "coo", "cfo", "cco", "cdo", "cxo", "cso"]);
const IDEA_TYPES = /* @__PURE__ */ new Set(["producto", "flota", "ia", "diseño", "negocio", "proceso", "meta"]);
const IDEA_TYPE_CRITERIA = {
  producto: "define el problema de usuario, el cambio de producto y una señal medible de adopción",
  flota: "mejora coordinación, autonomía, trazabilidad o rendimiento de la flota de agentes",
  ia: "aplica IA con datos, evaluación y límites verificables; evita capacidades vagas",
  "diseño": "prioriza jerarquía visual, usabilidad, accesibilidad y coherencia estética",
  negocio: "explica valor, coste, retorno y una métrica económica comprobable",
  proceso: "reduce pasos, esperas o errores con un flujo operativo verificable",
  meta: "mejora cómo se eligen, miden o aprenden los propios objetivos"
};
function ideaTypeCriteria(tag) {
  const clean = String(tag || "").trim().toLowerCase();
  return IDEA_TYPE_CRITERIA[clean] || "formula un resultado concreto, medible y accionable";
}
__name(ideaTypeCriteria, "ideaTypeCriteria");
// Asegura la tabla `ideas` y su columna `seat` (migración ADITIVA e idempotente:
// las ideas viejas quedan con seat NULL y no se rompe nada). Se llama en cada ruta
// /ideas* porque estas rutas NO pasan por ensureSchema: el feed GET sigue siendo
// público y el POST aplica aquí su autenticación específica de persona/agente.
async function ensureIdeasSchema(env) {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS ideas (id TEXT PRIMARY KEY, title TEXT, body TEXT, author TEXT, tag TEXT, status TEXT, created_at INTEGER, updated_at INTEGER, mission_id TEXT)");
  await env.DB.exec("ALTER TABLE ideas ADD COLUMN seat TEXT").catch(() => {});
  // De qué vídeo nació la idea (Carlos, 7-ago-2026): «los informes que vengan de
  // ideas, el proceso tiene que ser la captura del vídeo de la idea, así queda
  // mucho mejor documentado y podemos comparar con lo que hemos hecho». Sin esto
  // el vínculo se perdía en cuanto el borrador se guardaba: la idea conservaba el
  // texto guionizado pero no de dónde salía, y el informe no tenía qué enseñar.
  // Migración ADITIVA e idempotente, como las de arriba.
  await env.DB.exec("ALTER TABLE ideas ADD COLUMN source_image TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE ideas ADD COLUMN source_url TEXT").catch(() => {});
  // Deliberación del Consejo (FLT-1005 «En estudio»): JSON {pros:[{seat,by,text}×3],
  // cons:[{seat,by,text}×3], at}. Migración ADITIVA e idempotente igual que `seat`.
  await env.DB.exec("ALTER TABLE ideas ADD COLUMN review TEXT").catch(() => {});
  // Kit de venta (FLT-1007): adjuntos de NotebookLM. JSON {audio:{url,at}?,
  // video:{url,at}?, pdf:{url,at}?}. Migración ADITIVA e idempotente igual que arriba.
  await env.DB.exec("ALTER TABLE ideas ADD COLUMN media TEXT").catch(() => {});
  // Proyecto del censo sobre el que gira la idea (FLT-1009): slug de `projects`
  // (p. ej. "pixeria", "admiranext"). Las ideas del Consejo sin tema explícito nacen
  // centradas en un proyecto AL AZAR del censo con web. Migración ADITIVA e idempotente.
  await env.DB.exec("ALTER TABLE ideas ADD COLUMN project TEXT").catch(() => {});
  // Vínculo idea → reloj de decisión (POST /ideas/decide): id de la decisión (DEC-…)
  // que se abrió al convertir la idea en misión. Traza el ciclo Idea→Decisión→Misión
  // sin abrir dos ventanas para la misma idea. Migración ADITIVA e idempotente.
  await env.DB.exec("ALTER TABLE ideas ADD COLUMN decision_id TEXT").catch(() => {});
  // Procedencia interna de la firma. `author_identity` conserva el sujeto firmado
  // para auditoría, pero nunca se incluye en el feed público de ideas.
  await env.DB.exec("ALTER TABLE ideas ADD COLUMN author_source TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE ideas ADD COLUMN author_identity TEXT").catch(() => {});
}
__name(ensureIdeasSchema, "ensureIdeasSchema");

// ── CONSEJO GENERADOR DE IDEAS DIARIAS (FLT-1005) ─────────────────────────────
// Cada día las 8 sillas aportan una idea/objetivo para mejorar AdmiraNeXT, UNA
// CADA 3 HORAS en rotación (8 huecos × 3h = ciclo 24h), firmada por el consejero
// de turno desde su punto fuerte. Y a demanda («✨ Idea nueva»), silla aleatoria.
// El orden y los alias son los del array CONSEJO de objetivos.html.
const COUNCIL_ORDER = ["ceo", "cto", "coo", "cfo", "cco", "cdo", "cxo", "cso"];
// `tag` es la etiqueta de pixeria con la que Carlos le da material a esa silla:
// un vídeo subido al Stock con #stevejobs pasa a ser conocimiento del CEO. Es
// EXPLÍCITO a propósito —solo el alias, no las etiquetas de su terreno—: quien
// decide qué lee cada consejero es quien etiqueta, no una heurística.
const COUNCIL = {
  ceo: { role: "CEO", alias: "Steve Jobs", tag: "stevejobs", side: "rac", fuerte: "la visi\xF3n de producto: no sumar funciones, sino decidir qu\xE9 se queda fuera para que lo que salga lleve nuestro nombre con orgullo" },
  cto: { role: "CTO", alias: "Steve Wozniak", tag: "stevewozniak", side: "rac", fuerte: "la tecnolog\xEDa como cimiento: que lo que se construya sea s\xF3lido, real y sostenible en el tiempo" },
  coo: { role: "COO", alias: "Tim Cook", tag: "timcook", side: "rac", fuerte: "la operaci\xF3n: que la m\xE1quina gire —cadena, flota de agentes, entregas y SLA—, que lo prometido se cumpla" },
  cfo: { role: "CFO", alias: "Warren Buffett", tag: "warrenbuffett", side: "rac", fuerte: "el negocio y el coste a largo plazo: qu\xE9 renta, qu\xE9 cuesta y qu\xE9 aguanta" },
  cco: { role: "CCO", alias: "Walt Disney", tag: "waltdisney", side: "cre", fuerte: "la creatividad y la marca: magia y experiencias que se recuerdan toda la vida" },
  cdo: { role: "CDO", alias: "Dieter Rams", tag: "dieterrams", side: "cre", fuerte: "el dise\xF1o: menos, pero mejor; quitar hasta que solo quede lo esencial, y hacerlo bello" },
  cxo: { role: "CXO", alias: "Howard Schultz", tag: "howardschultz", side: "cre", fuerte: "la experiencia y el espacio vivido: c\xF3mo se siente estar dentro del producto" },
  cso: { role: "CSO", alias: "George Lucas", tag: "georgelucas", side: "cre", fuerte: "el relato: la historia que explica la idea y la hace contagiosa dentro y fuera de la casa" }
};

// ── CONOCIMIENTO EXTRA DE CADA SILLA (pixeria) ──────────────────────────────
// Hasta ahora el «skill» de un consejero era UNA frase codificada aquí (`fuerte`)
// e igual para siempre: mejorarlo exigía un deploy. Esto lo abre — Carlos sube al
// Stock de pixeria un vídeo, un artículo o una imagen, lo etiqueta con el nombre
// del consejero, y esa pieza pasa a estar en su cabeza la próxima vez que opine.
//
// El índice del Stock es JSON público (no hay auth ni worker de por medio) y se
// cachea en el edge: un ciclo del Consejo son varias llamadas seguidas y no tiene
// sentido bajar 340 KB en cada una.
//
// DEGRADA EN SILENCIO. Si pixeria no responde, el consejero opina como siempre
// —con su punto fuerte— en vez de no opinar. El material suma; su ausencia no resta.
// Dominio propio: LaLiga bloquea workers.dev/r2.dev en horas de fútbol (FLT-1633); workers.dev sigue vivo como respaldo.
var STOCK_INDEX_URL = "https://stock.admira.store/stock/index.json";
var COUNCIL_KNOWLEDGE_PROMPT_MAX = 8;   // piezas que entran en el prompt, las más nuevas
// ── LO QUE DIO CARLOS vs LO QUE TRAJO LA FORMACIÓN ─────────────────────────
// admira.live manda al consejero a formarse: busca vídeos suyos en YouTube, los sube
// al Stock y los etiqueta con su alias Y con ESTA etiqueta. Es lo único que separa el
// material curado del que trajo un scraper, y separarlo no es cosmética:
//  · el prompt decía «MATERIAL QUE CARLOS TE HA DADO». Con sesenta vídeos que Carlos
//    no ha visto, esa frase es falsa y el consejero cita al scraper como si fuera él;
//  · la ventana son 8 piezas por fecha, así que UNA tanda automática vaciaba de su
//    cabeza todo lo curado. De ahí la cuota reservada de abajo.
var COUNCIL_FORMACION_TAG = "formacion";
// De cada 8 huecos, 5 son para lo que dio Carlos. Es un SUELO, no un techo para la
// formación: si Carlos solo dio 2 piezas, la formación ocupa los 6 restantes. Reservar
// un hueco que nadie llena sería tirar conocimiento a la basura.
var COUNCIL_KNOWLEDGE_DADO_SHARE = 5 / 8;
// ── CÁPSULAS: LO QUE EL CONSEJERO APRENDE, NO EL TÍTULO DEL VÍDEO ───────────
// Hasta aquí, al prompt de una silla le entraba el TÍTULO de la pieza. Un vídeo de
// cinco minutos de Dieter Rams aportaba la cadena «Dieter Rams: Less but Better» y
// nada más: eso es una bibliografía, no conocimiento. Se le podían subir sesenta
// vídeos y seguía sabiendo exactamente lo mismo.
//
// Una cápsula es una pieza de texto con lo que ese vídeo le
// enseña a ESA silla, etiquetada igual que el vídeo (alias + formación) y apuntando
// a él en `externalRef`. Dos consecuencias que no son obvias:
//  · la cápsula SUSTITUYE a su vídeo en la cabeza del consejero. Si entraran los dos,
//    leería el título y la cápsula, y el título ya no aporta nada. El vídeo se queda
//    como fuente y evidencia, no como conocimiento.
//  · contar PIEZAS deja de valer. Ocho títulos son ~400 caracteres; ocho cápsulas,
//    ~5.000. La ventana pasa a tener también presupuesto de texto.
var COUNCIL_CAPSULA_TYPE = "capsula";
var COUNCIL_CAPSULA_TYPES = new Set([COUNCIL_CAPSULA_TYPE, "guion"]); // compatibilidad histórica
var COUNCIL_CAPSULA_MAX = 900;             // caracteres de UNA cápsula en el prompt
var COUNCIL_KNOWLEDGE_PROMPT_CHARS = 3600; // presupuesto de la ventana entera
// Criterio de Carlos para la formación: vídeos de los más vistos y de 5 minutos como
// máximo. Hoy el índice del Stock NO trae ni duración ni vistas, así que yokup no
// puede comprobarlo. Se lee si aparece y se ENSEÑA lo que se pasa; no se excluye en
// silencio: descartar por un campo que casi siempre falta borraría material bueno.
var COUNCIL_VIDEO_MAX_SECS = 300;
async function stockIndex() {
  try {
    const r = await fetch(STOCK_INDEX_URL, { cf: { cacheTtl: 600, cacheEverything: true } });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d) ? d : (d && Array.isArray(d.items) ? d.items : []);
  } catch (e) { return []; }
}
__name(stockIndex, "stockIndex");
// El importador de Pixeria vive en el Mac Mini y sale al mundo por el Funnel de
// Tailscale. Es la MISMA base que usa pixer-eleven; se deja configurable por si
// el túnel cambia de nombre, para no tener que desplegar el worker por eso.
function tubeBase(env) {
  return String((env && env.ADMIRA_TUBE_BASE) || "https://macmini.tail48b61c.ts.net/admira").replace(/\/+$/, "");
}
__name(tubeBase, "tubeBase");
// La miniatura del vídeo, para que el informe pueda enseñar de dónde salió la idea.
// YouTube la sirve por id sin pedir nada; en el resto de hosts no hay una portada
// pública que se pueda derivar de la URL, y se devuelve vacío antes que inventarla.
function miniaturaDeVideo(u) {
  const m = String(u || "").match(/(?:youtube\.com\/.*[?&]v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? "https://img.youtube.com/vi/" + m[1] + "/hqdefault.jpg" : "";
}
__name(miniaturaDeVideo, "miniaturaDeVideo");
function normalizaEtiqueta(t) {
  // \p{M} = marcas combinantes. Se usa la propiedad Unicode en vez del rango
  // U+0300–U+036F escrito a mano: el fuente queda en ASCII puro y no hay forma
  // de romperlo al copiar o al reescribir el fichero.
  return String(t || "").normalize("NFD").replace(/\p{M}/gu, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "");
}
__name(normalizaEtiqueta, "normalizaEtiqueta");
// Dos piezas con el MISMO título son la misma pieza. YouTube devuelve la misma charla
// subida cinco veces, y sin esto una silla «sabía» ocho veces lo mismo: el prompt se
// llenaba de repeticiones y el recuento premiaba el volumen, que es justo lo que un
// alimentador automático produce a espuertas. Gana la más nueva.
function dedupePorTitulo(pieces) {
  const vistos = /* @__PURE__ */ new Set(), unicas = [];
  for (const p of pieces || []) {           // ya vienen de la más nueva a la más vieja
    const k = normalizaEtiqueta(p && p.title);
    if (k && vistos.has(k)) continue;
    if (k) vistos.add(k);
    unicas.push(p);
  }
  return unicas;
}
__name(dedupePorTitulo, "dedupePorTitulo");
// La ventana del prompt CON CUOTA. Primero se sirven los huecos reservados a lo que
// dio Carlos, la formación ocupa el resto, y si un lado no llena su cuota el otro la
// completa. Sin esto la ventana es una lotería por fecha y la primera tanda de
// admira.live borra de la cabeza del consejero todo lo que Carlos eligió a mano.
// Lo que pesa una pieza en el prompt. un título son 40 caracteres; una cápsula, 900.
// La ventana tiene que contar esto y no «piezas», o el presupuesto lo fija el azar
// de cuántas cápsulas hayan caído en los ocho huecos.
function pesoEnPrompt(p) {
  return (String(p && p.title || "").length + String(p && p.note || "").length + 4);
}
__name(pesoEnPrompt, "pesoEnPrompt");
// Toma de una lista ya ordenada (más nueva primero) mientras quepa en SUS huecos y
// en SU presupuesto. La primera pieza entra siempre aunque se pase: media idea es
// peor que una idea larga, y una cápsula cortada a la mitad no enseña nada.
function tomaHasta(lista, huecos, presupuesto) {
  const out = [];
  let gasto = 0;
  for (const p of lista) {
    if (out.length >= huecos) break;
    const peso = pesoEnPrompt(p);
    if (out.length && gasto + peso > presupuesto) break;
    out.push(p); gasto += peso;
  }
  return out;
}
__name(tomaHasta, "tomaHasta");
function ventanaReservada(pieces, limit, chars = COUNCIL_KNOWLEDGE_PROMPT_CHARS) {
  const todas = pieces || [];
  if (!(limit > 0)) return todas;
  const dadas = todas.filter((p) => p && p.origin !== "formado");
  const formadas = todas.filter((p) => p && p.origin === "formado");
  const suelo = Math.max(1, Math.ceil(limit * COUNCIL_KNOWLEDGE_DADO_SHARE));
  const presupuestoDado = Math.max(1, Math.ceil(chars * COUNCIL_KNOWLEDGE_DADO_SHARE));
  let mias = tomaHasta(dadas, suelo, presupuestoDado);
  let gastado = mias.reduce((n, p) => n + pesoEnPrompt(p), 0);
  const suyas = tomaHasta(formadas, Math.max(0, limit - mias.length), Math.max(0, chars - gastado));
  // Si un lado no llena su cuota —ni de huecos ni de texto— el otro la completa:
  // reservar un hueco que nadie ocupa sería tirar conocimiento a la basura.
  if (mias.length + suyas.length < limit) {
    gastado = suyas.reduce((n, p) => n + pesoEnPrompt(p), 0);
    mias = tomaHasta(dadas, limit - suyas.length, Math.max(0, chars - gastado));
  }
  return mias.concat(suyas)
    .sort((a, b) => String(b && b.at || "").localeCompare(String(a && a.at || "")));
}
__name(ventanaReservada, "ventanaReservada");
// Un vídeo con cápsula ya no entra en la cabeza del consejero: entraría su título al
// lado de la cápsula que lo explica, y el título no añade nada. El vídeo sigue en el
// Stock y en el recuento —es la fuente y la evidencia—, pero deja de ser lo que se
// lee. El enlace lo declara la cápsula en `externalRef`; si no lo trae, vale que se
// llamen igual, que es como los sube quien transcribe.
function sustituyePorCapsulas(piezas) {
  const cubiertas = /* @__PURE__ */ new Set();
  for (const p of piezas) {
    if (!p.capsula) continue;
    if (p.fuente) cubiertas.add(p.fuente);
    const porTitulo = normalizaEtiqueta(p.title);
    if (porTitulo) cubiertas.add(porTitulo);
  }
  if (!cubiertas.size) return piezas;
  return piezas.filter((p) => p.capsula ||
    !(cubiertas.has(normalizaEtiqueta(p.id)) || cubiertas.has(normalizaEtiqueta(p.title))));
}
__name(sustituyePorCapsulas, "sustituyePorCapsulas");
// Reparto del índice YA descargado. Existe aparte de seatKnowledge porque el snapshot
// del tick recorre las ocho sillas: con una llamada por silla eran ocho subpeticiones
// para leer el MISMO fichero.
function seatKnowledgeFrom(items, seat, limit = COUNCIL_KNOWLEDGE_PROMPT_MAX) {
  const c = COUNCIL[String(seat || "").toLowerCase()];
  const tag = c && c.tag ? normalizaEtiqueta(c.tag) : "";
  if (!tag) return [];
  const formacion = normalizaEtiqueta(COUNCIL_FORMACION_TAG);
  const mias = (items || []).filter((it) => Array.isArray(it && it.tags)
    && it.tags.some((t) => normalizaEtiqueta(t) === tag));
  mias.sort((a, b) => String(b && b.createdAt || "").localeCompare(String(a && a.createdAt || "")));
  const piezas = dedupePorTitulo(mias.map((it) => {
    // El comentario suele ser solo la propia etiqueta («#stevejobs»): eso no es
    // conocimiento, es el mecanismo. Se descarta para no ensuciar el prompt. En un
    // CÁPSULA, en cambio, el comentario ES el conocimiento y se conserva entero.
    const nota = String(it.comment || "").trim();
    const soloEtiqueta = normalizaEtiqueta(nota) === tag;
    const esCapsula = COUNCIL_CAPSULA_TYPES.has(String(it.type || "").toLowerCase());
    // El origen sale de la ETIQUETA, no de quién llamó: una pieza que subió Carlos y
    // otra que trajo admira.live se distinguen en el índice o no se distinguen en
    // ninguna parte. Sin `#formacion` una pieza es «dada», que es como estaba.
    const formado = it.tags.some((t) => normalizaEtiqueta(t) === formacion);
    const dur = Number(it.duration || it.duracion || 0) || 0;
    return { id: it.id || "", type: it.type || "", at: it.createdAt || "",
      title: String(it.title || "").trim().slice(0, 200),
      note: soloEtiqueta ? "" : nota.slice(0, esCapsula ? COUNCIL_CAPSULA_MAX : 300),
      origin: formado ? "formado" : "dado",
      capsula: esCapsula,
      // De qué pieza es esta cápsula. Sin esto no se puede sustituir al vídeo.
      fuente: normalizaEtiqueta(it.externalRef || ""),
      duracion: dur, vistas: Number(it.views || it.vistas || 0) || 0,
      largo: dur > COUNCIL_VIDEO_MAX_SECS,
      url: it.url || "" };
  }).filter((p) => p.title || p.note));
  return ventanaReservada(sustituyePorCapsulas(piezas), limit);
}
__name(seatKnowledgeFrom, "seatKnowledgeFrom");
// Piezas del Stock etiquetadas con el alias de la silla, de la más nueva a la más
// vieja. `limit` 0 = todas (lo usa el endpoint; el prompt se queda con 8).
async function seatKnowledge(seat, limit = COUNCIL_KNOWLEDGE_PROMPT_MAX) {
  return seatKnowledgeFrom(await stockIndex(), seat, limit);
}
__name(seatKnowledge, "seatKnowledge");
// El bloque que se cuela en el prompt de la silla. Vacío si no hay material. Marca
// cuáles trajo la formación: el consejero tiene que saber qué eligió Carlos para él
// y qué le llegó de un buscador, porque no pesan lo mismo.
function seatKnowledgeText(pieces) {
  const lista = (pieces || []).map((p) => "- " + [p.title, p.note].filter(Boolean).join(" \xB7 ")
    + (p.origin === "formado" ? " (formaci\xF3n)" : "")).join("\n");
  if (!lista) return "";
  return "\n\nTU MATERIAL, etiquetado con tu nombre en pixeria. Lo que lleva \xAB(formaci\xF3n)\xBB te lo trajo admira.live busc\xE1ndote; el resto te lo dio Carlos a mano, y ese pesa m\xE1s. Es tu conocimiento extra: apr\xE9ndetelo y \xFAsalo cuando venga a cuento; no lo cites por citar ni lo menciones si no aporta:\n" + lista;
}
__name(seatKnowledgeText, "seatKnowledgeText");
// Rotación SIN estado: silla de turno = Math.floor(horaUTC/3) sobre COUNCIL_ORDER.
// Determinista, sin persistencia. Hora 0-2→ceo, 3-5→cto … 21-23→cso.
function councilSeatForHour(h) {
  return COUNCIL_ORDER[Math.floor((((h % 24) + 24) % 24) / 3)] || "ceo";
}
__name(councilSeatForHour, "councilSeatForHour");

// ── CÁPSULA DE CONOCIMIENTO DE LA HORA (admira.academy) ─────────────────────
// Carlos (2026-08-08): «lanzar cada hora en punto una ventana de formación para que
// se active una cápsula de conocimiento en admira.academy».
//
// Una CÁPSULA es lo que una silla del Consejo puede aprender en esta hora: una pieza
// suya del Stock de pixeria —mejor si viene etiquetada #formacion— o, si esa silla
// aún no tiene material, la lección de la Academia que le toque. No se inventa
// contenido: se ELIGE de lo que ya existe y se pone delante.
//
// La hora manda y no hay estado que llevar: la silla sale de la propia hora, como en
// el tick del Consejo. Una hora = una cápsula, garantizado por la clave primaria; el
// reintento es gratis y no duplica. Si la Academia se consulta dos veces en la misma
// hora ve exactamente lo mismo, que es lo que hace que se pueda hablar de ella.
var ACADEMY_HORA_MS = 60 * 60 * 1000;
// LAS TRES TEMÁTICAS DEL COACH (Carlos, 2026-08-09): «una cada hora y vuelta a
// empezar, con lo que saldrán 24 ventanas de formación al día, 8 de cada tipología».
//
// La temática y la lección NO se deciden aquí: las da `coachLessonForSlot` de
// academy-coach.js, que es el Coach de la Academia y ya rota tecnología →
// creatividad → negocio por franja horaria, con su catálogo de cuatro lecciones por
// temática. Duplicar esa rueda habría sido garantizar que un día dejaran de decir lo
// mismo: la cápsula de la hora y la lección del Coach TIENEN que ser la misma cosa.
//
// Lo único que se añade aquí es a QUÉ SILLA le toca, que el Coach no reparte. Sale
// del ÁREA declarada de cada consejero en la Academia (academy-training-core.js), no
// de una opinión: CTO «Tecnología y arquitectura» y COO «Operaciones y entrega» son
// tecnología —cómo está hecho y cómo gira—; CEO «Visión, producto y dirección» y CFO
// «Finanzas y sostenibilidad» son negocio; y las cuatro creativas (marca, diseño,
// experiencia, relato) son creatividad. Si el reparto no convence, se cambia aquí.
var ACADEMY_TEMAS = [
  { id:"tecnologia",  nombre:"Tecnología",  seats:["cto", "coo"] },
  { id:"creatividad", nombre:"Creatividad", seats:["cco", "cdo", "cxo", "cso"] },
  { id:"negocio",     nombre:"Negocio",     seats:["ceo", "cfo"] }
];
// La franja del Coach es la MISMA hora que la de la cápsula (COACH_HOUR = 1 h), así
// que las dos hablan de la misma casilla del reloj sin conversiones por medio.
function academyTemaDeFranja(slotId) {
  const { dimension, lessonId } = coachLessonForSlot(slotId);
  const tema = ACADEMY_TEMAS.find((t) => t.id === dimension) || ACADEMY_TEMAS[0];
  return { tema, lessonId };
}
__name(academyTemaDeFranja, "academyTemaDeFranja");
// Cápsula de respaldo mientras Smith prepara la de verdad. El título sale del
// identificador de la lección del Coach, que es la ÚNICA lista de lecciones que
// existe en la casa.
//
// Aquí vivía un catálogo propio de cuatro lecciones (identity · ecosystem · mission ·
// closure) que NUNCA se aplicó: sus claves no eran las del Coach (contratos-claros,
// restriccion, valor-captura…), así que el `find` fallaba siempre y lo que se
// publicaba era el respaldo del `||`. Encima había un test que lo daba por vivo, que
// es lo peor de un catálogo muerto: parece cubierto. Fuera (Carlos, 9-ago-2026).
//
// Lo usan las dos puertas por las que nace una cápsula —el tick de la hora y el
// cambio de temática de la ventana—, para que cambiar de temática no cambie también
// el formato del título.
function academyCapsulaDeLeccion(tema, lessonId) {
  return { source:"academia/leccion", id:String(lessonId),
    title:"Lección de " + tema.nombre + ": " + String(lessonId).replace(/-/g, " "),
    note:"Smith está preparando la cápsula de " + tema.nombre + ".",
    url:"https://admira.academy/#formacion" };
}
__name(academyCapsulaDeLeccion, "academyCapsulaDeLeccion");
async function ensureAcademyCapsuleSchema(env) {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS academy_capsulas (hour_start INTEGER PRIMARY KEY, seat TEXT, source TEXT, capsule_id TEXT, title TEXT, note TEXT, url TEXT, at INTEGER)");
  // Aditivas: las capsulas de ayer no tenian tematica ni agente de turno.
  await env.DB.exec("ALTER TABLE academy_capsulas ADD COLUMN tema TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE academy_capsulas ADD COLUMN agent TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE academy_capsulas ADD COLUMN decision_id TEXT").catch(() => {});
  // Smith trabaja de forma asíncrona: Yokup abre la franja a su hora y la cápsula
  // queda pendiente hasta que el CLI entregue dos activos públicos verificables,
  // el vídeo fuente y la cápsula textual que extrae su aprendizaje.
  await env.DB.exec("ALTER TABLE academy_capsulas ADD COLUMN smith_status TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE academy_capsulas ADD COLUMN smith_agent TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE academy_capsulas ADD COLUMN smith_source_url TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE academy_capsulas ADD COLUMN smith_video_id TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE academy_capsulas ADD COLUMN smith_capsule_id TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE academy_capsulas ADD COLUMN smith_updated_at INTEGER").catch(() => {});
  // Telemetría operativa de Smith. No acredita la cápsula: únicamente explica
  // qué está haciendo el CLI mientras la verificación final sigue dependiendo
  // de los dos activos públicos de Pixeria.
  await env.DB.exec("ALTER TABLE academy_capsulas ADD COLUMN smith_stage TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE academy_capsulas ADD COLUMN smith_detail TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE academy_capsulas ADD COLUMN smith_progress INTEGER").catch(() => {});
  await env.DB.exec("ALTER TABLE academy_capsulas ADD COLUMN smith_started_at INTEGER").catch(() => {});
}
__name(ensureAcademyCapsuleSchema, "ensureAcademyCapsuleSchema");

async function ensureAcademyCoachSchema(env) {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS academy_coach_completions (event_id TEXT PRIMARY KEY, audience TEXT NOT NULL, counselor TEXT NOT NULL, slot_id INTEGER NOT NULL, dimension TEXT NOT NULL, lesson_id TEXT NOT NULL, application TEXT NOT NULL, completed_at INTEGER NOT NULL, UNIQUE(audience,counselor,slot_id))");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS academy_coach_launches (launch_id TEXT PRIMARY KEY, audience TEXT NOT NULL, counselor TEXT NOT NULL, target_slot_id INTEGER NOT NULL, dimension TEXT NOT NULL, lesson_id TEXT NOT NULL, launched_at INTEGER NOT NULL, UNIQUE(audience,counselor,target_slot_id))");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS academy_coach_sources (source_id TEXT PRIMARY KEY, audience TEXT NOT NULL, counselor TEXT NOT NULL, source_url TEXT NOT NULL, capsule_id TEXT NOT NULL, preview_id TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, image_url TEXT NOT NULL, imported_at INTEGER NOT NULL, UNIQUE(audience,counselor,source_url))");
}
__name(ensureAcademyCoachSchema, "ensureAcademyCoachSchema");

function academyCoachPublicRow(row) {
  return { eventId:row.event_id, audience:row.audience, counselor:row.counselor,
    slotId:Number(row.slot_id), dimension:row.dimension, lessonId:row.lesson_id,
    completedAt:new Date(Number(row.completed_at)).toISOString() };
}
__name(academyCoachPublicRow, "academyCoachPublicRow");

function academyCoachLaunchPublicRow(row) {
  return { launchId:row.launch_id, audience:row.audience, counselor:row.counselor,
    targetSlotId:Number(row.target_slot_id), dimension:row.dimension, lessonId:row.lesson_id,
    scheduledAt:new Date(Number(row.target_slot_id) * 60 * 60 * 1000).toISOString(),
    launchedAt:new Date(Number(row.launched_at)).toISOString() };
}
__name(academyCoachLaunchPublicRow, "academyCoachLaunchPublicRow");

function academyCoachSourcePublicRow(row) {
  return { sourceId:row.source_id, audience:row.audience, counselor:row.counselor,
    sourceUrl:row.source_url, capsuleAssetId:row.capsule_id, previewAssetId:row.preview_id,
    title:row.title, summary:row.summary, imageUrl:row.image_url,
    pixeriaUrl:"https://www.pixeria.com/stock.html?highlight=" + encodeURIComponent(row.capsule_id),
    importedAt:new Date(Number(row.imported_at)).toISOString() };
}
__name(academyCoachSourcePublicRow, "academyCoachSourcePublicRow");

function academyCapsuleRow(row) {
  if (!row) return null;
  const c = COUNCIL[String(row.seat)] || {};
  const tema = ACADEMY_TEMAS.find((t) => t.id === String(row.tema || "")) || null;
  const smithVerified = row.smith_status === "verified";
  return { hour_start:Number(row.hour_start) || 0, seat:row.seat, role:c.role || "", alias:c.alias || "", training_tag:c.tag || "",
    tema:row.tema || "", tema_nombre:tema ? tema.nombre : "",
    source:row.source || "", id:row.capsule_id || "", title:row.title || "", note:row.note || "",
    url:row.url || "", agent:row.agent || "", decision_id:row.decision_id || "", at:Number(row.at) || 0,
    smith:{ status:row.smith_status || "pending", agent:row.smith_agent || "Smith",
      stage:row.smith_stage || (smithVerified ? "verified" : "queued"), detail:row.smith_detail || (smithVerified ? "Cápsula verificada por Yokup y publicada en Pixeria." : "Esperando a que Smith recoja la ventana."),
      progress:row.smith_progress == null && smithVerified ? 100 : Number(row.smith_progress) || 0, started_at:Number(row.smith_started_at) || 0,
      source_url:row.smith_source_url || "", video_id:row.smith_video_id || "",
      capsule_id:row.smith_capsule_id || "", updated_at:Number(row.smith_updated_at) || 0 } };
}
__name(academyCapsuleRow, "academyCapsuleRow");

async function academyCapsuleHighscore(env) {
  await ensureAcademyCapsuleSchema(env);
  await ensureAcademyCoachSchema(env);
  const { results } = await env.DB.prepare(
    "SELECT c.hour_start,c.seat,c.tema,c.title,c.smith_capsule_id,c.smith_updated_at," +
    "(SELECT GROUP_CONCAT(DISTINCT l.audience) FROM academy_coach_launches l WHERE l.target_slot_id=c.hour_start/3600000) AS launch_audiences " +
    "FROM academy_capsulas c WHERE c.smith_status='verified' AND COALESCE(c.smith_capsule_id,'')!='' " +
    "AND COALESCE(c.smith_updated_at,0)>0 " +
    "ORDER BY c.smith_updated_at DESC LIMIT 500"
  ).all();
  const items = [];
  for (const row of results || []) {
    const launched = String(row.launch_audiences || "").split(",").filter((value) => COACH_AUDIENCES.has(value));
    // Las franjas creadas por el cron son formación canónica compartida: si no
    // hubo un lanzamiento manual con audiencia, cuentan para carbono y silicio.
    const audiences = launched.length ? [...new Set(launched)] : ["silicio", "carbono"];
    for (const audience of audiences) items.push({
      id:`capsula-${audience}-${row.smith_capsule_id}`,
      audience,
      counselor:String(row.seat || ""),
      dimension:String(row.tema || ""),
      title:String(row.title || "Cápsula de conocimiento"),
      completedAt:new Date(Number(row.smith_updated_at)).toISOString(),
      capsuleId:String(row.smith_capsule_id),
      url:"https://www.pixeria.com/stock.html?highlight=" + encodeURIComponent(row.smith_capsule_id)
    });
  }
  return items;
}
__name(academyCapsuleHighscore, "academyCapsuleHighscore");

var SMITH_PROGRESS_STAGES = Object.freeze({
  opening_terminal:5,
  asking_grok:15,
  searching_youtube:30,
  selecting_source:42,
  transcribing:55,
  synthesizing:68,
  importing_pixeria:82,
  publishing_capsule:92,
  verifying_yokup:97
});

async function updateSmithCapsuleProgress(env, body) {
  if (!legacyAcademyAvailability().allowed) return {ok:false,status:409,error:'consumer_unverified'};
  await ensureAcademyCapsuleSchema(env);
  const hourStart = Number(body && body.hourStart);
  const stage = String(body && body.stage || "").trim();
  const detail = String(body && body.detail || "").replace(/\s+/g, " ").trim().slice(0,240);
  if (!Number.isInteger(hourStart) || hourStart % ACADEMY_HORA_MS !== 0) return {ok:false,status:400,error:"Franja no válida"};
  if (stage !== "error" && !Object.prototype.hasOwnProperty.call(SMITH_PROGRESS_STAGES,stage)) return {ok:false,status:400,error:"Etapa de Smith no válida"};
  if (detail.length < 3) return {ok:false,status:400,error:"Detalle de progreso requerido"};
  const currentHour = Math.floor(Date.now() / ACADEMY_HORA_MS) * ACADEMY_HORA_MS;
  if (hourStart < currentHour - ACADEMY_HORA_MS || hourStart > currentHour + ACADEMY_HORA_MS) return {ok:false,status:409,error:"La franja no admite telemetría"};
  const row = await env.DB.prepare("SELECT * FROM academy_capsulas WHERE hour_start=?").bind(hourStart).first();
  if (!row) return {ok:false,status:404,error:"La cápsula no existe en Yokup"};
  if (row.smith_status === "verified") return {ok:true,reused:true,row};
  const now = Date.now();
  if (stage === "error") {
    await env.DB.prepare("UPDATE academy_capsulas SET smith_status='error',smith_stage='error',smith_detail=?,smith_updated_at=? WHERE hour_start=?")
      .bind(detail,now,hourStart).run();
  } else {
    const progress = SMITH_PROGRESS_STAGES[stage];
    const restarting = stage === "opening_terminal" && (row.smith_status !== "running" || now - Number(row.smith_updated_at || 0) > 15 * 60 * 1000);
    if (!restarting && Number(row.smith_progress || 0) > progress) return {ok:true,reused:true,row};
    await env.DB.prepare("UPDATE academy_capsulas SET smith_status='running',smith_agent='Smith · Grok',smith_stage=?,smith_detail=?,smith_progress=?,smith_started_at=CASE WHEN ? THEN ? ELSE COALESCE(smith_started_at,?) END,smith_updated_at=? WHERE hour_start=?")
      .bind(stage,detail,progress,restarting ? 1 : 0,now,now,now,hourStart).run();
  }
  return {ok:true,reused:false,row:await env.DB.prepare("SELECT * FROM academy_capsulas WHERE hour_start=?").bind(hourStart).first()};
}
__name(updateSmithCapsuleProgress, "updateSmithCapsuleProgress");

function youtubeVideoId(value) {
  const match = String(value || "").match(/(?:youtube\.com\/(?:watch\?.*?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  return match ? match[1] : "";
}
__name(youtubeVideoId, "youtubeVideoId");

function stockHasTags(item, required) {
  const tags = new Set((Array.isArray(item && item.tags) ? item.tags : []).map(normalizaEtiqueta));
  return required.every((tag) => tags.has(normalizaEtiqueta(tag)));
}
__name(stockHasTags, "stockHasTags");

async function stockIndexFresh() {
  try {
    const r = await fetch(STOCK_INDEX_URL + "?smith=" + Date.now(), { cf:{ cacheTtl:0, cacheEverything:false } });
    if (!r.ok) return [];
    const body = await r.json();
    return Array.isArray(body) ? body : (body && Array.isArray(body.items) ? body.items : []);
  } catch (e) { return []; }
}
__name(stockIndexFresh, "stockIndexFresh");

function academyCoachSourceUrl(value) {
  let url;
  try { url = new URL(String(value || "").trim()); } catch (e) { return ""; }
  if (url.protocol !== "https:" || url.username || url.password) return "";
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":")) return "";
  url.hash = "";
  const tracking = new Set(["ncid","mkt_tok","fbclid","gclid","dclid","msclkid","mc_cid","mc_eid"]);
  for (const key of [...url.searchParams.keys()]) if (key.toLowerCase().startsWith("utm_") || tracking.has(key.toLowerCase())) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href;
}
__name(academyCoachSourceUrl, "academyCoachSourceUrl");

async function academyCoachSourceId(audience, counselor, sourceUrl) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${audience}:${counselor}:${sourceUrl}`));
  return "coach-source-" + Array.from(new Uint8Array(digest)).slice(0, 12).map((n) => n.toString(16).padStart(2,"0")).join("");
}
__name(academyCoachSourceId, "academyCoachSourceId");

async function verifyAcademyCoachSource(env, body) {
  const audience = String(body && body.audience || "").toLowerCase();
  const counselor = String(body && body.counselor || "").toLowerCase();
  const sourceUrl = academyCoachSourceUrl(body && body.sourceUrl);
  const capsuleId = String(body && body.capsuleAssetId || "").trim();
  const previewId = String(body && body.previewAssetId || "").trim();
  if (!COACH_AUDIENCES.has(audience)) return {ok:false,status:400,error:"Audiencia no válida"};
  if (!COUNCIL[counselor]) return {ok:false,status:400,error:"Consejero no válido"};
  if (!sourceUrl) return {ok:false,status:400,error:"Fuente no válida"};
  if (!/^[A-Za-z0-9-]{4,120}$/.test(capsuleId) || !/^[A-Za-z0-9-]{4,120}$/.test(previewId)) return {ok:false,status:400,error:"Activos de Pixeria no válidos"};
  await ensureAcademyCoachSchema(env);
  const existing = await env.DB.prepare("SELECT * FROM academy_coach_sources WHERE audience=? AND counselor=? AND source_url=?")
    .bind(audience,counselor,sourceUrl).first();
  if (existing) {
    const same = existing.capsule_id === capsuleId && existing.preview_id === previewId;
    if (same) return {ok:true,reused:true,row:existing};
  }
  const items = await stockIndexFresh();
  const capsule = items.find((item) => String(item && item.id || "") === capsuleId);
  const preview = items.find((item) => String(item && item.id || "") === previewId);
  const required = [COUNCIL_FORMACION_TAG, COUNCIL[counselor].tag, "site"];
  const capsuleType = String(capsule && capsule.type || "").toLowerCase();
  if (!capsule || !["capsula","guion"].includes(capsuleType) || !stockHasTags(capsule, required)) return {ok:false,status:422,error:"La cápsula no está publicada con las etiquetas canónicas"};
  if (!preview || String(preview.type || "").toLowerCase() !== "image" || !stockHasTags(preview, required)) return {ok:false,status:422,error:"El previo no está publicado con las etiquetas canónicas"};
  if (academyCoachSourceUrl(capsule.prompt) !== sourceUrl || academyCoachSourceUrl(preview.prompt) !== sourceUrl) return {ok:false,status:422,error:"Los activos no corresponden a la fuente declarada"};
  if (String(capsule.externalRef || "") !== previewId) return {ok:false,status:422,error:"La cápsula no apunta a su previo"};
  const thumbnail = String(capsule.thumbnail || "");
  if (!thumbnail.startsWith("https://") || (!thumbnail.includes(previewId) && thumbnail !== String(preview.url || ""))) return {ok:false,status:422,error:"La cápsula no conserva su imagen de previo"};
  const summary = String(capsule.comment || "").replace(/\r/g, "").trim();
  if (summary.length < 700 || !summary.includes("PARA CARBONO") || !summary.includes("PARA SILICIO") || !summary.includes("APLICACIÓN")) return {ok:false,status:422,error:"La cápsula no contiene las dos interpretaciones requeridas"};
  const sourceId = await academyCoachSourceId(audience,counselor,sourceUrl);
  const importedAt = Date.now();
  const values=[capsuleId,previewId,String(capsule.title || "Cápsula de conocimiento").slice(0,300),summary.slice(0,2000),String(preview.url || thumbnail).slice(0,600),importedAt];
  if (existing) {
    await env.DB.prepare("UPDATE academy_coach_sources SET capsule_id=?,preview_id=?,title=?,summary=?,image_url=?,imported_at=? WHERE source_id=?")
      .bind(...values,existing.source_id).run();
  } else {
    await env.DB.prepare("INSERT INTO academy_coach_sources (source_id,audience,counselor,source_url,capsule_id,preview_id,title,summary,image_url,imported_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(sourceId,audience,counselor,sourceUrl,...values).run();
  }
  const row = await env.DB.prepare("SELECT * FROM academy_coach_sources WHERE audience=? AND counselor=? AND source_url=?")
    .bind(audience,counselor,sourceUrl).first();
  return {ok:true,reused:false,row};
}
__name(verifyAcademyCoachSource, "verifyAcademyCoachSource");

async function verifySmithCapsuleResult(env, body) {
  if (!legacyAcademyAvailability().allowed) return {ok:false,status:409,error:'consumer_unverified'};
  await ensureAcademyCapsuleSchema(env);
  const hourStart = Number(body && body.hourStart);
  const videoId = String(body && body.videoAssetId || "").trim();
  const capsuleId = String(body && body.capsuleAssetId || "").trim();
  const sourceUrl = String(body && body.sourceUrl || "").trim();
  if (!Number.isInteger(hourStart) || hourStart % ACADEMY_HORA_MS !== 0) return {ok:false,status:400,error:"Franja no válida"};
  if (!/^[A-Za-z0-9-]{4,120}$/.test(videoId) || !/^[A-Za-z0-9-]{4,120}$/.test(capsuleId)) return {ok:false,status:400,error:"Activos de Pixeria no válidos"};
  const sourceVideoId = youtubeVideoId(sourceUrl);
  if (!sourceVideoId) return {ok:false,status:400,error:"La fuente debe ser un vídeo de YouTube"};
  const row = await env.DB.prepare("SELECT * FROM academy_capsulas WHERE hour_start=?").bind(hourStart).first();
  if (!row) return {ok:false,status:404,error:"La cápsula no existe en Yokup"};
  const nowHour = Math.floor(Date.now() / ACADEMY_HORA_MS) * ACADEMY_HORA_MS;
  if (hourStart < nowHour - ACADEMY_HORA_MS || hourStart > nowHour + ACADEMY_HORA_MS) return {ok:false,status:409,error:"La franja ya no admite entregas de Smith"};
  if (row.smith_status === "verified") {
    const same = row.smith_video_id === videoId && row.smith_capsule_id === capsuleId;
    return same ? {ok:true,reused:true,row} : {ok:false,status:409,error:"La franja ya tiene una entrega verificada"};
  }
  const council = COUNCIL[String(row.seat || "").toLowerCase()] || {};
  if (!council.tag) return {ok:false,status:400,error:"La silla no tiene identidad formativa"};
  const items = await stockIndexFresh();
  const video = items.find((item) => String(item && item.id || "") === videoId);
  const capsule = items.find((item) => String(item && item.id || "") === capsuleId);
  const required = [COUNCIL_FORMACION_TAG, council.tag];
  if (!video || String(video.type || "").toLowerCase() !== "video" || !stockHasTags(video, required)) {
    return {ok:false,status:422,error:"El vídeo no está publicado en Pixeria con las etiquetas canónicas"};
  }
  const videoSourceId = youtubeVideoId(video.prompt || video.sourceUrl || "");
  if (!videoSourceId || videoSourceId !== sourceVideoId) return {ok:false,status:422,error:"El vídeo de Pixeria no corresponde a la fuente declarada"};
  const capsuleType = String(capsule && capsule.type || "").toLowerCase();
  if (!capsule || !["capsula","guion"].includes(capsuleType) || !stockHasTags(capsule, required)) {
    return {ok:false,status:422,error:"La cápsula textual no está publicada en Pixeria con las etiquetas canónicas"};
  }
  if (String(capsule.externalRef || "") !== videoId) return {ok:false,status:422,error:"La cápsula no apunta a su vídeo fuente"};
  const knowledge = String(capsule.comment || "").replace(/\s+/g, " ").trim();
  if (knowledge.length < 40) return {ok:false,status:422,error:"La cápsula no contiene conocimiento suficiente"};
  await env.DB.prepare(
    "UPDATE academy_capsulas SET source='pixeria/capsula',capsule_id=?,title=?,note=?,url=?,smith_status='verified',smith_agent='Smith',smith_stage='verified',smith_detail='Cápsula verificada por Yokup y publicada en Pixeria.',smith_progress=100,smith_source_url=?,smith_video_id=?,smith_capsule_id=?,smith_updated_at=? WHERE hour_start=?"
  ).bind(capsuleId,String(capsule.title || video.title || "Cápsula de conocimiento").slice(0,200),knowledge.slice(0,900),String(video.url || "").slice(0,300),sourceUrl.slice(0,300),videoId,capsuleId,Date.now(),hourStart).run();
  const verified = await env.DB.prepare("SELECT * FROM academy_capsulas WHERE hour_start=?").bind(hourStart).first();
  return {ok:true,reused:false,row:verified};
}
__name(verifySmithCapsuleResult, "verifySmithCapsuleResult");


// ── LA VENTANA DE FORMACIÓN (Carlos, 2026-08-09) ────────────────────────────
// «las ventanas de formación ocurren y PUNTÚAN en yokup.com». Una ventana puntúa por
// existir en `decisions` con agente válido y fecha de hoy: 8 puntos, sin mirar estado.
//
// El turno rota entre los agentes DECLARADOS de la Academia en el censo del proyecto,
// uno cada cuatro horas. Es la respuesta de Carlos a «¿a quién se le apuntan?»: no al
// responsable, que cobraría 192 puntos al día por un proceso automático, sino a quien
// le toca atender esa cápsula. Los puntos van con el trabajo, no con el cargo.
var ACADEMY_TURNOS = [
  { agent:"MorfeoMBA16",  machine:"MacBookAir16plata" },
  { agent:"TrinityMBA16", machine:"MacBookAir16plata" },
  { agent:"NeoMBP14",     machine:"MacBookProNegro14" },
  { agent:"TrinityMBP14", machine:"MacBookProNegro14" }
];
// Marcador de rama. Con `parent_decision` NO vacío la ventana queda fuera del cupo
// horario y fuera del censo de turnos, así que no le roba a nadie su hueco automático
// ni encoge la franja de los demás. Es la diferencia entre añadir formación y quitar
// trabajo a la flota.
var ACADEMY_DECISION_PARENT = "FORMACION";
var ACADEMY_DECISION_MIN = 2;

// Abre la ventana de la hora con LAS TRES TEMÁTICAS (Carlos, 2026-08-09): «lanzar
// como predefinida la que toca y dejarme escoger las otras dos». La rueda del Coach
// sigue mandando —es la ★ y es lo que se aplica si nadie contesta—, pero deja de ser
// un destino: si toca tecnología y Carlos quiere negocio, la cápsula de esa hora pasa
// a ser de negocio (lo aplica `aplicaEleccionFormacion`).
//
// El ORDEN de las opciones es SIEMPRE el mismo (tecnología · creatividad · negocio)
// aunque rote la recomendada. Si bailaran con la hora, el índice guardado en `chosen`
// no significaría nada al releer el histórico y la posición del botón tampoco.
//
// NUNCA materializa misiones. Antes lo garantizaba su FORMA (una sola opción no la
// tiene ni como ventana inicial ni como continuación); con tres opciones y
// `parent_decision` puesto la forma ya no basta, así que ahora lo garantiza el NOMBRE
// en `isMissionDecision`. Con 24 ventanas al día, materializar serían 24 misiones
// fantasma diarias.
async function abreVentanaFormacion(env, { hourStart, tema, seat, capsula }) {
  if (!legacyAcademyAvailability().allowed) return {ok:false,...legacyAcademyAvailability()};
  const turno = ACADEMY_TURNOS[Math.floor(hourStart / COACH_HOUR) % ACADEMY_TURNOS.length];
  const identidad = resolveDecisionIdentity(turno.agent, turno.machine);
  // Sin identidad canónica el Highscore descarta la fila en silencio y la ventana no
  // puntuaría a nadie: mejor no abrirla y que se vea el hueco.
  if (!identidad.ok) return { ok:false, error:identidad.error };
  const c = COUNCIL[seat] || {};
  const ahora = Date.now();
  const id = "DCL-form-" + hourStart.toString(36);
  const recomendada = Math.max(0, ACADEMY_TEMAS.findIndex((t) => t.id === tema.id));
  const pregunta = "Formación de la hora — toca " + tema.nombre + " (" + (c.role || seat) +
    " · " + (c.alias || "") + "): " + String((capsula && capsula.title) || "").slice(0, 140) +
    ". Puedes cambiar la temática de esta hora.";
  // Se lee bien en la frase que pinta la web al vencer: «se aplicó la recomendada: …».
  const opciones = ACADEMY_TEMAS.map((t) => "Atender la cápsula de " + t.nombre + " en admira.academy");
  // La ventana vive lo que vive su hora: pasada la hora, su cápsula ya no es «la de
  // ahora» y cambiarla no significa nada. Con los 2 minutos de antes, elegir era
  // teórico —24 ventanas al día y 2 minutos cada una para verlas—, así que dejar
  // escoger obligaba a darle a la elección un plazo que se pueda atender.
  const finDeHora = hourStart + ACADEMY_HORA_MS;
  const deadline = Math.max(finDeHora, ahora + ACADEMY_DECISION_MIN * 60 * 1000);
  await env.DB.prepare(
    "INSERT OR IGNORE INTO decisions (id,machine,agent,surface,question,options,recommended,status,created_at,deadline,url,mission,project,project_slug,parent_decision)" +
    " VALUES (?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,?)"
  ).bind(id, identidad.machine, identidad.agent, "academy", pregunta.slice(0, 400), JSON.stringify(opciones),
    recomendada, ahora, deadline, "https://admira.academy/#capsula",
    "formacion:" + tema.id, "admira-academy", "ADMIRA-ACADEMY", ACADEMY_DECISION_PARENT).run();
  return { ok:true, id, agent:identidad.agent, machine:identidad.machine, recomendada, opciones };
}
__name(abreVentanaFormacion, "abreVentanaFormacion");

// La hora que codifica el id de la ventana. El id ES el dato (`DCL-form-<hora en
// base 36>`), así que no hace falta una columna nueva ni fiarse de `created_at`:
// una ventana abierta con retraso sigue siendo la de SU hora.
function academyHourFromDecisionId(id) {
  const m = /^DCL-form-([0-9a-z]+)$/.exec(String(id || ""));
  if (!m) return null;
  const hora = parseInt(m[1], 36);
  return Number.isFinite(hora) && hora > 0 && hora % ACADEMY_HORA_MS === 0 ? hora : null;
}
__name(academyHourFromDecisionId, "academyHourFromDecisionId");

// ELEGIR TIENE QUE CAMBIAR ALGO. Sin esto la ventana preguntaría por cortesía: la
// Academia seguiría enseñando la temática de la rueda dijera Carlos lo que dijera.
// Al aplicar cambian las tres cosas que dependen de la temática —silla, lección y
// texto de la cápsula— y Smith vuelve a la cola para rehacerla.
//
// Idempotente: si la cápsula ya es de esa temática no toca nada, así que el barrido
// puede repasar la misma ventana en cada tick sin escribir de más.
//
// NO se toca una cápsula ya VERIFICADA: cuando Smith ha publicado vídeo y texto en
// Pixeria, cambiarle la temática debajo dejaría a la Academia enseñando una cosa y
// diciendo que es otra. En ese caso se devuelve el motivo, no un ok falso.
async function aplicaEleccionFormacion(env, decision) {
  if (!legacyAcademyAvailability().allowed) return {ok:false,code:'consumer_unverified',cambiada:false};
  if (!decision || decision.parent_decision !== ACADEMY_DECISION_PARENT) return null;
  const efectivo = decision.status === "decided" ? Number(decision.chosen)
    : decision.status === "expired" ? Number(decision.recommended) : null;
  if (!Number.isInteger(efectivo) || !ACADEMY_TEMAS[efectivo]) return null;
  const hourStart = academyHourFromDecisionId(decision.id);
  if (!hourStart) return { ok:false, code:"id_no_interpretable", id:decision.id };
  const tema = ACADEMY_TEMAS[efectivo];
  await ensureAcademyCapsuleSchema(env);
  const fila = await env.DB.prepare("SELECT * FROM academy_capsulas WHERE hour_start=?").bind(hourStart).first();
  if (!fila) return { ok:false, code:"sin_capsula", hour_start:hourStart };
  if (String(fila.tema || "") === tema.id) return { ok:true, cambiada:false, tema:tema.id };
  if (String(fila.smith_status || "") === "verified") {
    return { ok:false, cambiada:false, code:"capsula_verificada", tema:String(fila.tema || ""), pedida:tema.id };
  }
  const horas = Math.floor(hourStart / COACH_HOUR);
  const { lessonId } = coachLessonForDimension(horas, tema.id);
  const seat = tema.seats[Math.floor(horas / ACADEMY_TEMAS.length) % tema.seats.length];
  const nueva = academyCapsulaDeLeccion(tema, lessonId);
  // La nota sí es distinta de la del tick: aquí la temática NO es la que tocaba, y
  // quien lea la cápsula tiene que poder saber que se eligió a mano.
  const nota = "Temática elegida en la ventana de formación de esta hora: " + tema.nombre + ".";
  await env.DB.prepare(
    "UPDATE academy_capsulas SET tema=?,seat=?,source=?,capsule_id=?,title=?,note=?,url=?," +
    "smith_status='pending',smith_stage='queued',smith_detail=?,smith_progress=0," +
    "smith_source_url=NULL,smith_video_id=NULL,smith_capsule_id=NULL,smith_updated_at=? WHERE hour_start=?"
  ).bind(tema.id, seat, nueva.source, String(nueva.id).slice(0, 80), nueva.title.slice(0, 200), nota.slice(0, 400),
    nueva.url,
    ("Temática cambiada a " + tema.nombre + " en la ventana; Smith rehace la cápsula.").slice(0, 400),
    Date.now(), hourStart).run();
  // `mission` de la ventana era la temática que TOCABA; si se deja, el histórico de
  // decisiones dice una temática y la Academia enseña otra.
  await env.DB.prepare("UPDATE decisions SET mission=? WHERE id=?").bind("formacion:" + tema.id, decision.id).run();
  return { ok:true, cambiada:true, tema:tema.id, seat, lessonId };
}
__name(aplicaEleccionFormacion, "aplicaEleccionFormacion");

// Barrido propio, separado del de tandas de misiones: una ventana de formación no
// tiene tanda que arrancar, y colarla en aquella consulta la dejaba para siempre en
// su cupo de 100 candidatas (nunca crea `mission_batches`, así que nunca deja de
// cumplir la condición). Con 24 al día, en cuatro días habrían desplazado a las
// decisiones de verdad. Aquí se miran sólo las de las últimas horas: la cápsula de
// una hora pasada ya es historia y cambiarla no enseñaría nada a nadie.
var ACADEMY_ELECCION_VENTANA_MS = 6 * 60 * 60 * 1000;
async function aplicaEleccionesFormacion(env, ahora = Date.now()) {
  if (!legacyAcademyAvailability().allowed) { await ensureAcademyCapsuleSchema(env); return pauseLegacyAcademy(env.DB,ahora); }
  const { results } = await env.DB.prepare(
    "SELECT * FROM decisions WHERE parent_decision=? AND status IN ('decided','expired') AND created_at >= ? ORDER BY created_at DESC LIMIT 12"
  ).bind(ACADEMY_DECISION_PARENT, ahora - ACADEMY_ELECCION_VENTANA_MS).all();
  const fallos = [];
  for (const d of results || []) {
    try {
      const r = await aplicaEleccionFormacion(env, d);
      if (r && r.ok === false && r.code !== "capsula_verificada") fallos.push({ id:d.id, code:r.code });
    } catch (e) { fallos.push({ id:d.id, error:String((e && e.message) || e) }); }
  }
  // El latido de la rutina tiene que poder decir que esto falló: tragarse el error
  // dejaría la Academia enseñando una temática que Carlos no eligió, en silencio.
  if (fallos.length) throw new Error("ventanas de formación sin aplicar: " + JSON.stringify(fallos).slice(0, 300));
  return { revisadas:(results || []).length };
}
__name(aplicaEleccionesFormacion, "aplicaEleccionesFormacion");

async function runAcademyCapsuleTick(env, ahora = Date.now()) {
  await ensureAcademyCapsuleSchema(env);
  if (!legacyAcademyAvailability().allowed) {
    const availability=await pauseLegacyAcademy(env.DB);
    const row=await env.DB.prepare('SELECT * FROM academy_capsulas ORDER BY hour_start DESC LIMIT 1').first();
    return {ok:true,nueva:false,...availability,capsula:academyCapsuleRow(row)};
  }
  const hourStart = Math.floor(ahora / ACADEMY_HORA_MS) * ACADEMY_HORA_MS;
  const ya = await env.DB.prepare("SELECT * FROM academy_capsulas WHERE hour_start=?").bind(hourStart).first();
  if (ya) return { ok:true, nueva:false, capsula:academyCapsuleRow(ya) };
  // La HORA manda la temática y la temática manda la silla. 24 h / 3 temáticas = 8
  // ventanas de cada una al día, exactas, sin llevar cuentas. Dentro de la temática la
  // silla también rota, para que no le toque siempre al mismo de los suyos.
  const horas = Math.floor(hourStart / COACH_HOUR);
  const { tema, lessonId } = academyTemaDeFranja(horas);
  const seat = tema.seats[Math.floor(horas / ACADEMY_TEMAS.length) % tema.seats.length];
  // Toda franja se encarga a Smith. Yokup no finge que el vídeo ya existe: abre
  // con la lección canónica como respaldo y la sustituye únicamente después de
  // verificar en el índice público el vídeo y su cápsula textual enlazada.
  const elegida = academyCapsulaDeLeccion(tema, lessonId);
  await env.DB.prepare(
    "INSERT OR IGNORE INTO academy_capsulas (hour_start,seat,tema,source,capsule_id,title,note,url,at,smith_status,smith_agent,smith_stage,smith_detail,smith_progress) VALUES (?,?,?,?,?,?,?,?,?,'pending','Smith','queued','Esperando a que Smith recoja la ventana.',0)"
  ).bind(hourStart, seat, tema.id, elegida.source, String(elegida.id).slice(0, 80),
    String(elegida.title).slice(0, 200), String(elegida.note).slice(0, 400),
    String(elegida.url).slice(0, 300), Date.now()).run();
  await env.DB.prepare(
    "DELETE FROM academy_capsulas WHERE hour_start NOT IN (SELECT hour_start FROM academy_capsulas ORDER BY hour_start DESC LIMIT 200)"
  ).run();
  // La ventana se abre SOLO cuando la cápsula es nueva: una por hora, como la cápsula.
  // Si falla, la cápsula sigue en pie — la formación no se cae porque el marcador de
  // puntos tosa, y el fallo queda a la vista en el propio latido de la rutina.
  let ventana = null;
  try { ventana = await abreVentanaFormacion(env, { hourStart, tema, seat, capsula:elegida }); }
  catch (e) { ventana = { ok:false, error:String((e && e.message) || e) }; }
  if (ventana && ventana.ok) {
    await env.DB.prepare("UPDATE academy_capsulas SET agent=?, decision_id=? WHERE hour_start=?")
      .bind(ventana.agent, ventana.id, hourStart).run();
  }
  const fila = await env.DB.prepare("SELECT * FROM academy_capsulas WHERE hour_start=?").bind(hourStart).first();
  return { ok:true, nueva:true, ventana, capsula:academyCapsuleRow(fila) };
}
__name(runAcademyCapsuleTick, "runAcademyCapsuleTick");
// Runner de IA para el Consejo. OJO: Workers AI ya NO siempre devuelve `response`
// como string — cuando el modelo emite JSON, la plataforma lo entrega YA PARSEADO
// como objeto. El aiRun genérico hace text.trim() y peta con esos objetos (los
// salta en silencio); por eso el Consejo tiene el suyo, que acepta objeto O string.
async function aiRunRaw(env, prompt, maxTokens = 400) {
  for (const model of AI_MODELS) {
    try {
      const r = await env.AI.run(model, { messages: [{ role: "user", content: prompt }], max_tokens: maxTokens });
      const resp = r && (r.response !== void 0 ? r.response : r.result && r.result.response);
      if (resp && typeof resp === "object") return resp;
      if (typeof resp === "string" && resp.trim()) return resp.trim();
    } catch (e) {
    }
  }
  return null;
}
__name(aiRunRaw, "aiRunRaw");
// Extrae {titulo,cuerpo} de lo que devuelva el modelo: un objeto ya parseado, un
// objeto JSON embebido en texto, o —último recurso— «primera línea = título».
function parseIdeaJSON(raw) {
  let title = "", body = "";
  if (raw && typeof raw === "object") {
    title = String(raw.titulo || raw.title || raw.t || "").trim();
    body = String(raw.cuerpo || raw.body || raw.detalle || raw.description || "").trim();
    return { title: title.slice(0, 200), body: body.slice(0, 4000) };
  }
  const s = String(raw || "").trim();
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const o = JSON.parse(m[0]);
      title = String(o.titulo || o.title || o.t || "").trim();
      body = String(o.cuerpo || o.body || o.detalle || o.description || "").trim();
    } catch (e) {
    }
  }
  if (!title) {
    const lines = s.split("\n").map((x) => x.trim()).filter(Boolean);
    if (lines.length) {
      title = lines[0].replace(/^["'#*\-\s]+|["']+$/g, "").replace(/^(t[\xEDi]tulo|title)\s*[:：]\s*/i, "").trim();
      body = lines.slice(1).join(" ").replace(/^(cuerpo|body|detalle)\s*[:：]\s*/i, "").trim();
    }
  }
  return { title: title.slice(0, 200), body: body.slice(0, 4000) };
}
__name(parseIdeaJSON, "parseIdeaJSON");
// Genera UNA idea del Consejo para `seat` con Workers AI, la firma «ROL · alias»,
// tag «consejo», status «nueva», y la guarda en `ideas`. Devuelve la fila creada,
// o null si la IA no dio nada usable (el llamador decide; nunca insertamos basura).
// FLT-1017: con `persist=false` la idea NO se guarda ni se delibera — sale sólo como
// borrador para que /objetivos rellene el formulario. Quien la da de alta es el
// formulario (POST /ideas), tras el minuto de cortesía o a mano. Así una idea que
// nadie quiso no deja rastro en la base.
async function generateCouncilIdea(env, seat, topic, projectHint, persist = true, tagHint = "") {
  await ensureIdeasSchema(env);
  if (!IDEA_SEATS.has(seat)) seat = "ceo";
  const c = COUNCIL[seat];
  const tagClean = IDEA_TYPES.has(String(tagHint || "").trim().toLowerCase()) ? String(tagHint).trim().toLowerCase() : "";
  const outputTag = tagClean || "consejo";
  // FLT-1009: tema opcional (bajo demanda; el cron nunca lo pasa). Un string corto
  // que CENTRA la idea sin cambiar la voz del punto fuerte de la silla ni nada mas.
  const topicClean = String(topic || "").replace(/\s+/g, " ").trim().slice(0, 240);
  // FLT-1009: proyecto sobre el que gira la idea. Un `projectHint` VÁLIDO (slug del
  // censo) manda. Sin tema y sin hint, se elige un proyecto AL AZAR del censo que
  // tenga web, para que la idea hable de algo NUESTRO y enlazable. Con tema explícito
  // el tema manda: el proyecto solo se guarda si se pidió a mano (no se sortea).
  const idx = await projectIndex(env);
  let proj = null;
  const hint = String(projectHint || "").trim();
  if (hint) { const p = idx.get(hint); if (p) proj = p; }
  if (!proj && !topicClean) {
    const withWeb = (idx.rows || []).filter((p) => p && p.web && String(p.web).trim());
    if (withWeb.length) proj = withWeb[Math.floor(Math.random() * withWeb.length)];
  }
  const projSlug = proj ? proj.id : "";
  const focoProyecto = proj ? "\n\nPROYECTO OBLIGATORIO: \xAB" + proj.name + "\xBB (" + proj.web + "). El objetivo DEBE pertenecer a ESE proyecto; no lo sustituyas ni propongas otro." : "";
  const focoTipo = tagClean ? "\n\nTIPO OBLIGATORIO: \xAB" + tagClean + "\xBB. Para este tipo, " + ideaTypeCriteria(tagClean) + ". No lo reclasifiques como otro tipo." : "";
  let recent = [];
  try {
    recent = (await env.DB.prepare("SELECT title FROM ideas ORDER BY created_at DESC LIMIT 15").all()).results || [];
  } catch (e) {
  }
  const previos = recent.map((r) => "- " + r.title).join("\n") || "(ninguna todav\xEDa)";
  const focoTema = topicClean ? "\n\nCENTRA tu idea EXCLUSIVAMENTE en este tema: " + topicClean + "\nHabla de ese tema de verdad, en concreto; no lo cambies por otro. Manten tu voz de " + c.role + " (" + c.fuerte + "), pero la idea DEBE ser sobre ese tema." : "";
  // Su conocimiento extra: lo que Carlos le ha etiquetado en pixeria con su nombre.
  const saber = seatKnowledgeText(await seatKnowledge(seat));
  const prompt = `Eres ${c.role} del Consejo de AdmiraNeXT, con el esp\xEDritu de ${c.alias}. Tu punto fuerte es ${c.fuerte}.${saber}

AdmiraNeXT es un ecosistema de se\xF1alizaci\xF3n digital (DOOH) construido por agentes de IA: yokup.com (FSM de misiones y tareas del equipo), admira.live (cockpit de la flota de agentes de IA), pixeria (creatividad con IA), xpaceos (gemelo digital de la red de pantallas) y admira.tv (emisi\xF3n del canal).

Propón UNA idea u objetivo CONCRETO y accionable para MEJORAR AdmiraNeXT, mir\xE1ndolo desde tu punto fuerte (${c.role}).${focoTema}${focoProyecto}${focoTipo} Que sea DISTINTA de estas ideas ya propuestas:
${previos}

Responde SOLO con un objeto JSON v\xE1lido, sin texto alrededor ni markdown, con esta forma exacta:
{"titulo":"<frase corta, m\xE1x 90 caracteres>","cuerpo":"<2 o 3 frases: el porqu\xE9, el c\xF3mo y para qui\xE9n>"}
Todo en espa\xF1ol.`;
  const raw = await aiRunRaw(env, prompt, 400);
  const { title, body } = parseIdeaJSON(raw);
  if (!title) return null;
  const author = c.role + " \xB7 " + c.alias;
  const now = Date.now();
  const id = "IDEA-" + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  // Borrador (FLT-1017): ni INSERT ni deliberación. Sin `id`, para que nadie lo
  // confunda con una fila viva; el alta real la hará POST /ideas con estos textos.
  if (!persist) {
    return { id: "", title, body, author, tag: outputTag, status: "", created_at: now, updated_at: now, mission_id: "", seat, project: projSlug, project_id: projSlug, review: null, preview: true };
  }
  // FLT-1007: las ideas del Consejo NACEN «estudio» (a debatir de inmediato). Las
  // humanas (POST /ideas) siguen naciendo «nueva» — este automatismo es solo del Consejo.
  await env.DB.prepare("INSERT INTO ideas (id,title,body,author,tag,status,created_at,updated_at,mission_id,seat,project) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, title, body, author, outputTag, "estudio", now, now, "", seat, projSlug).run();
  // Deliberación INLINE al nacer (mismo best-effort que /ideas/status → estudio):
  // el estado ya quedó guardado arriba; si la IA falla, la idea queda en estudio sin
  // review y POST /ideas/review la regenera bajo demanda. Nunca tumba la creación.
  let review = null;
  try { review = await generateCouncilReview(env, { id, title, body, author, seat }); } catch (e) { review = null; }
  return { id, title, body, author, tag: outputTag, status: "estudio", created_at: now, updated_at: now, mission_id: "", seat, project: projSlug, project_id: projSlug, review };
}
__name(generateCouncilIdea, "generateCouncilIdea");

async function resolveGenerateSelections(env, body, random = Math.random) {
  const b = body && typeof body === "object" ? body : {};
  const rawSeat = String(b.seat || "").trim().toLowerCase();
  if (rawSeat && !IDEA_SEATS.has(rawSeat)) return { ok:false, status:400, code:"invalid_seat", error:"seat no pertenece al Consejo" };
  const seat = rawSeat || COUNCIL_ORDER[Math.floor(random() * COUNCIL_ORDER.length)];
  const rawTag = String(b.tag || "").trim().toLowerCase();
  if (rawTag && !IDEA_TYPES.has(rawTag)) return { ok:false, status:400, code:"invalid_tag", error:"tag no pertenece a los tipos de objetivo" };
  const rawProject = String(b.project_id || b.project || "").trim();
  let project = "";
  if (rawProject) {
    const selected = (await projectIndex(env)).get(rawProject);
    if (!selected) return { ok:false, status:400, code:"invalid_project_id", error:"project_id no pertenece al censo" };
    project = selected.id;
  }
  return { ok:true, seat, tag:rawTag, project };
}
__name(resolveGenerateSelections, "resolveGenerateSelections");

// ── DELIBERACIÓN DEL CONSEJO (FLT-1005) ──────────────────────────────────────
// Al pasar una idea a «estudio», el resto del Consejo la debate: 3 puntos A FAVOR
// y 3 EN CONTRA, cada uno firmado por un consejero DISTINTO (6 sillas distintas
// entre sí y distintas del seat/autor de la idea), opinando desde su punto fuerte.
// Firma «ROL · alias» (by) y color por lado (seat → rac/cre en el front).
// Devuelve {pros,cons,at} o null si la IA no dio 6 textos usables (no guardamos
// deliberaciones a medias: la idea queda en estudio sin review y se puede regenerar).
function pickCouncilSeats(authorSeat) {
  const avail = COUNCIL_ORDER.filter((s) => s !== authorSeat);
  return avail.slice(0, 6); // 6 distintas (quedan 7 al quitar la del autor)
}
__name(pickCouncilSeats, "pickCouncilSeats");
// Normaliza lo que devuelva el modelo (objeto ya parseado, JSON embebido en texto,
// array de strings o de {text}) a un array de textos limpios de longitud n.
function textsFromAI(arr, n) {
  const out = [];
  const src = Array.isArray(arr) ? arr : [];
  for (let i = 0; i < n; i++) {
    const it = src[i];
    let t = "";
    if (typeof it === "string") t = it;
    else if (it && typeof it === "object") t = String(it.text || it.punto || it.motivo || it.razon || it.t || "");
    out.push(t.trim().replace(/^["'\-•\s]+/, "").slice(0, 320));
  }
  return out;
}
__name(textsFromAI, "textsFromAI");
function parseReviewJSON(raw) {
  let o = null;
  if (raw && typeof raw === "object") o = raw;
  else {
    const m = String(raw || "").match(/\{[\s\S]*\}/);
    if (m) { try { o = JSON.parse(m[0]); } catch (e) {} }
  }
  if (!o) return { pros: [], cons: [] };
  const pros = o.pros || o.favor || o.aFavor || o.a_favor || [];
  const cons = o.cons || o.contra || o.enContra || o.en_contra || [];
  return { pros, cons };
}
__name(parseReviewJSON, "parseReviewJSON");
async function generateCouncilReview(env, idea) {
  await ensureIdeasSchema(env);
  const authorSeat = IDEA_SEATS.has(String(idea.seat || "").toLowerCase()) ? String(idea.seat).toLowerCase() : "";
  const seats = pickCouncilSeats(authorSeat);          // 6 sillas distintas
  const proSeats = seats.slice(0, 3), conSeats = seats.slice(3, 6);
  // Cada uno de los seis debate con SU conocimiento extra, no con uno común: si
  // Carlos le ha dado material a Steve Jobs, es Steve Jobs quien lo esgrime. Se
  // piden las seis a la vez (el índice del Stock está cacheado, así que es UNA
  // descarga) y se recorta a 4 piezas por silla: son seis prompts en uno.
  const saberes = new Map(await Promise.all(seats.map(async (s) => [s, await seatKnowledge(s, 4)])));
  const line = (s) => {
    const c = COUNCIL[s], piezas = saberes.get(s) || [];
    const extra = piezas.length
      // «que le dio Carlos» a secas dejó de ser cierto en cuanto admira.live empezó a
      // formar consejeros: aquí van mezcladas las suyas y las traídas, y cada una se
      // marca. Un consejero que no sabe de dónde viene una pieza no puede pesarla.
      ? ` — su material (lo marcado «formación» se lo trajo admira.live, el resto se lo dio Carlos): ${piezas.map((p) => (p.title || p.note) + (p.origin === "formado" ? " [formaci\xF3n]" : "")).filter(Boolean).join("; ")}`
      : "";
    return `${c.role} (${c.alias}) — su punto fuerte: ${c.fuerte}${extra}`;
  };
  const prompt = `Eres la secretaría del Consejo de AdmiraNeXT (ecosistema de señalización digital DOOH hecho por agentes de IA: yokup.com, admira.live, pixeria, xpaceos, admira.tv). El Consejo debate esta idea que acaba de pasar a ESTUDIO:

TÍTULO: ${idea.title}
DETALLE: ${idea.body || "(sin detalle)"}
${idea.author ? "PROPONE: " + idea.author : ""}

Tres consejeros la defienden (un punto A FAVOR cada uno) y tres la cuestionan (un punto EN CONTRA cada uno). Cada consejero opina EXCLUSIVAMENTE desde su punto fuerte:
A FAVOR:
1) ${line(proSeats[0])}
2) ${line(proSeats[1])}
3) ${line(proSeats[2])}
EN CONTRA:
4) ${line(conSeats[0])}
5) ${line(conSeats[1])}
6) ${line(conSeats[2])}

Responde SOLO con un objeto JSON válido, sin texto alrededor ni markdown, con esta forma EXACTA (respeta el orden 1..3 a favor, 4..6 en contra):
{"pros":["<punto a favor del consejero 1, 1 frase>","<del 2>","<del 3>"],"cons":["<punto en contra del consejero 4, 1 frase>","<del 5>","<del 6>"]}
Cada frase concreta y en español, sin nombrar al consejero ni su rol dentro del texto.`;
  const raw = await aiRunRaw(env, prompt, 700);
  const { pros: rp, cons: rc } = parseReviewJSON(raw);
  const proTx = textsFromAI(rp, 3), conTx = textsFromAI(rc, 3);
  if (proTx.some((t) => !t) || conTx.some((t) => !t)) return null; // nada a medias
  const sign = (s) => COUNCIL[s].role + " \xB7 " + COUNCIL[s].alias;
  const review = {
    pros: proSeats.map((s, i) => ({ seat: s, by: sign(s), text: proTx[i] })),
    cons: conSeats.map((s, i) => ({ seat: s, by: sign(s), text: conTx[i] })),
    at: Date.now()
  };
  await env.DB.prepare("UPDATE ideas SET review=?, updated_at=? WHERE id=?")
    .bind(JSON.stringify(review), Date.now(), idea.id).run();
  return review;
}
__name(generateCouncilReview, "generateCouncilReview");
// ── LA FORMACIÓN COMO EVENTO, NO SOLO COMO ESTADO ──────────────────────────
// Un contador dice cuánto sabe una silla HOY; no dice que ayer supiera menos. Y con
// admira.live formando consejeros en bucle, lo que hay que poder ver es justo lo
// segundo: CUÁNDO se ha formado uno y cuánto creció. Así que el tick guarda el
// recuento por silla y, cuando sube, deja el delta.
//
// Por SNAPSHOT, no por push: admira.live no tiene que llamar a yokup ni saber que
// existe, y el evento sale igual si la pieza la sube Carlos a mano desde pixeria.
// Dos tablas porque son dos preguntas distintas: `council_knowledge` es el estado
// (una fila por silla, se pisa) y `council_knowledge_log` es la historia (una fila
// por crecimiento, se conserva). Best-effort ABSOLUTO, como la bitácora: esto no
// puede tumbar el tick del Consejo.
async function ensureCouncilKnowledgeSchema(env) {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS council_knowledge (seat TEXT PRIMARY KEY, total INTEGER, dado INTEGER, formado INTEGER, at INTEGER)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS council_knowledge_log (id INTEGER PRIMARY KEY AUTOINCREMENT, seat TEXT, delta INTEGER, total INTEGER, dado INTEGER, formado INTEGER, at INTEGER)");
}
__name(ensureCouncilKnowledgeSchema, "ensureCouncilKnowledgeSchema");
// Compara el Stock con el último snapshot y devuelve las sillas que han crecido.
// UNA sola lectura del índice para las ocho: el reparto por silla es local.
async function recordCouncilKnowledge(env) {
  const nuevos = [];
  try {
    await ensureCouncilKnowledgeSchema(env);
    const items = await stockIndex();
    // Pixeria caída devuelve [] y TODAS las sillas caerían a cero: al volver, el
    // siguiente tick cantaría ocho «formaciones» que nunca ocurrieron. Un índice
    // vacío no es una noticia, es una ausencia — y la ausencia no resta ni suma.
    if (!items.length) return nuevos;
    const previo = /* @__PURE__ */ new Map();
    for (const r of ((await env.DB.prepare("SELECT seat,total FROM council_knowledge").all()).results || []))
      previo.set(String(r.seat), Number(r.total) || 0);
    const at = Date.now();
    for (const seat of COUNCIL_ORDER) {
      const piezas = seatKnowledgeFrom(items, seat, 0);          // 0 = todas
      const total = piezas.length;
      const formado = piezas.filter((p) => p.origin === "formado").length;
      const dado = total - formado;
      const antes = previo.has(seat) ? previo.get(seat) : null;
      await env.DB.prepare(
        "INSERT INTO council_knowledge (seat,total,dado,formado,at) VALUES (?,?,?,?,?)" +
        " ON CONFLICT(seat) DO UPDATE SET total=excluded.total, dado=excluded.dado, formado=excluded.formado, at=excluded.at"
      ).bind(seat, total, dado, formado, at).run();
      // La PRIMERA vez que se ve una silla no es formación, es el censo inicial. Sin
      // esta guarda, el día del despliegue saldrían ocho avisos de piezas nuevas que
      // llevaban semanas ahí. Y bajar tampoco es noticia: borrar no es aprender.
      if (antes === null || total <= antes) continue;
      const delta = total - antes;
      await env.DB.prepare("INSERT INTO council_knowledge_log (seat,delta,total,dado,formado,at) VALUES (?,?,?,?,?,?)")
        .bind(seat, delta, total, dado, formado, at).run();
      const c = COUNCIL[seat];
      nuevos.push({ seat, role: c.role, alias: c.alias, delta, total, dado, formado, at });
    }
    await env.DB.prepare(
      "DELETE FROM council_knowledge_log WHERE id NOT IN (SELECT id FROM council_knowledge_log ORDER BY id DESC LIMIT 100)"
    ).run();
  } catch (e) { /* la formación nunca tumba el tick */ }
  return nuevos;
}
__name(recordCouncilKnowledge, "recordCouncilKnowledge");
// Bitácora del cron del Consejo (auto-curación + observabilidad, FLT-1016): UNA fila
// por hueco de 3h (slot_start PRIMARY KEY, upsert por intento) con el resultado del
// último intento — para auditar franjas perdidas. Aditiva e idempotente; GET
// /council/ticks la expone. Antes el fallo del tick era MUDO: una franja perdida no
// dejaba rastro. Ahora sí.
async function ensureCouncilTicksSchema(env) {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS council_ticks (slot_start INTEGER PRIMARY KEY, seat TEXT, ok INTEGER, error TEXT, at INTEGER)");
}
__name(ensureCouncilTicksSchema, "ensureCouncilTicksSchema");
// Anota el resultado de un intento del tick (upsert por hueco). Conserva solo los ~50
// huecos más recientes. Best-effort ABSOLUTO: la bitácora NUNCA tumba el tick.
async function recordCouncilTick(env, { slotStart, seat, ok, error }) {
  try {
    await ensureCouncilTicksSchema(env);
    const err = ok ? "" : String(error || "").slice(0, 300);
    await env.DB.prepare(
      "INSERT INTO council_ticks (slot_start,seat,ok,error,at) VALUES (?,?,?,?,?)" +
      " ON CONFLICT(slot_start) DO UPDATE SET seat=excluded.seat, ok=excluded.ok, error=excluded.error, at=excluded.at"
    ).bind(slotStart, seat || "", ok ? 1 : 0, err, Date.now()).run();
    await env.DB.prepare(
      "DELETE FROM council_ticks WHERE slot_start NOT IN (SELECT slot_start FROM council_ticks ORDER BY slot_start DESC LIMIT 50)"
    ).run();
  } catch (e) { /* la bitácora nunca tumba el tick */ }
}
__name(recordCouncilTick, "recordCouncilTick");
// Tick del cron (FLT-1016 · AUTOCURACIÓN): corre en CADA tick del scheduled (*/2). La
// idempotencia por hueco (SELECT tag='consejo' AND created_at>=slotStart) garantiza
// UNA sola idea por hueco de 3h y hace GRATIS el reintento: un fallo a las HH:07 se
// recupera en el siguiente */2 (HH:08/HH:10…). Coste extra cuando la idea ya existe:
// un SELECT por tick — aceptable. Cada intento (éxito ok=1 o fallo ok=0 con su error)
// queda en council_ticks para poder auditar franjas perdidas.
async function runCouncilTick(env) {
  const slotMs = 3 * 60 * 60 * 1e3;
  const now = Date.now();
  const slotStart = Math.floor(now / slotMs) * slotMs;
  const seat = councilSeatForHour(new Date(now).getUTCHours());
  // El snapshot va ANTES y FUERA del try de la idea: la formación de una silla no
  // depende de que a esta hora toque generar objetivo, y el hueco de 3h ya tiene idea
  // el 99% de los ticks. Aquí es donde se entera yokup de que un consejero ha estudiado.
  for (const f of await recordCouncilKnowledge(env))
    console.log("[consejo] formaci\xF3n: " + f.role + " \xB7 " + f.alias + " +" + f.delta +
      " (total " + f.total + ", dado " + f.dado + ", formado " + f.formado + ")");
  try {
    await ensureIdeasSchema(env);
    const existing = await env.DB.prepare(
      "SELECT id FROM ideas WHERE tag='consejo' AND created_at >= ? LIMIT 1"
    ).bind(slotStart).first();
    if (existing) {
      // El hueco ya tiene idea: nada que generar. Deja rastro de que está cubierto.
      await recordCouncilTick(env, { slotStart, seat, ok: 1, error: "" });
      return null;
    }
    const idea = await generateCouncilIdea(env, seat);
    if (!idea) {
      const msg = "IA no dio idea usable (hueco " + new Date(slotStart).toISOString() + ", silla " + seat + ")";
      console.log("[consejo] cron: " + msg);
      await recordCouncilTick(env, { slotStart, seat, ok: 0, error: msg });
      return null;
    }
    await recordCouncilTick(env, { slotStart, seat, ok: 1, error: "" });
    return idea;
  } catch (e) {
    const msg = String(e && e.message || e);
    console.log("[consejo] cron error:", msg);
    await recordCouncilTick(env, { slotStart, seat, ok: 0, error: msg });
    return null;
  }
}
__name(runCouncilTick, "runCouncilTick");

// ── LATIDO DE LA RUTINA PROGRAMADA (FLT-1016 c · OBSERVABILIDAD + CERROJO) ─────
// La plataforma NO dispara scheduled() en esta cuenta (verificado FLT-1016: tail
// sin cron, council_ticks sólo se llenaba a demanda). El Consejo ya se autocuraba
// enganchado al fetch; ahora se generaliza a TODA la rutina del tick. worker_beats
// es aditiva e idempotente: UNA fila por rutina (routine PK, upsert) con el último
// resultado, más la fila-cerrojo '__scheduled' que sirve de throttle GLOBAL por D1.
// GET /worker/beats la expone para auditar que la rutina corre por latido HTTP.
async function ensureWorkerBeatsSchema(env) {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS worker_beats (routine TEXT PRIMARY KEY, ok INTEGER, error TEXT, at INTEGER)");
}
__name(ensureWorkerBeatsSchema, "ensureWorkerBeatsSchema");
// Anota el resultado de una rutina (upsert por nombre). Best-effort ABSOLUTO: la
// bitácora NUNCA tumba la rutina. Poda de seguridad a 100 filas (hoy son ~9).
async function recordBeat(env, routine, ok, error) {
  try {
    await ensureWorkerBeatsSchema(env);
    const err = ok ? "" : String((error && error.message) || error || "").slice(0, 300);
    await env.DB.prepare(
      "INSERT INTO worker_beats (routine,ok,error,at) VALUES (?,?,?,?)" +
      " ON CONFLICT(routine) DO UPDATE SET ok=excluded.ok, error=excluded.error, at=excluded.at"
    ).bind(routine, ok ? 1 : 0, err, Date.now()).run();
    await env.DB.prepare(
      "DELETE FROM worker_beats WHERE routine NOT IN (SELECT routine FROM worker_beats ORDER BY at DESC LIMIT 100)"
    ).run();
  } catch (e) { /* la bitácora nunca tumba la rutina */ }
}
__name(recordBeat, "recordBeat");
// Cerrojo temporal GLOBAL por D1 (compare-and-swap ATÓMICO): sólo UN isolate corre
// la rutina por ventana de minGapMs. Sin esto, dos isolates con tráfico simultáneo
// dispararían dos veces reconcile/fleetPlan/fleetReconcile/… y duplicarían
// incidencias, planes de IA y eventos (esas rutinas leen-y-luego-escriben). El
// upsert condicional (DO UPDATE … WHERE at <= now-gap) sólo escribe si venció la
// ventana; meta.changes>0 ⇒ este isolate ganó el turno. Es el MISMO D1 que serializa
// escrituras: la carrera se decide en el motor SQLite, no en JS. El mismo cerrojo lo
// piden el fetch y scheduled(): si el cron revive, no se solapan → cero duplicación.
async function tryAcquireBeatLease(env, name, minGapMs) {
  const now = Date.now();
  try {
    await ensureWorkerBeatsSchema(env);
    const res = await env.DB.prepare(
      "INSERT INTO worker_beats (routine,ok,error,at) VALUES (?,1,'',?)" +
      " ON CONFLICT(routine) DO UPDATE SET at=excluded.at WHERE worker_beats.at <= ?"
    ).bind(name, now, now - minGapMs).run();
    return Number((res && res.meta && res.meta.changes) || 0) > 0;
  } catch (e) { return false; }
}
__name(tryAcquireBeatLease, "tryAcquireBeatLease");
// Edad (ms) del último latido de una rutina, o Infinity si nunca corrió. Para que las
// rutinas caras (checkWebs/checkMachines: fetch externos) se autolimiten a su propio
// ritmo (~10 min) con independencia de cada cuánto llegue tráfico HTTP.
async function beatAge(env, routine) {
  try {
    await ensureWorkerBeatsSchema(env);
    const r = await env.DB.prepare("SELECT at FROM worker_beats WHERE routine=?").bind(routine).first();
    return (r && r.at) ? Date.now() - r.at : Infinity;
  } catch (e) { return Infinity; }
}
__name(beatAge, "beatAge");
// Cuerpo ÚNICO de la rutina programada. Lo llaman IGUAL el latido HTTP y el cron
// scheduled(): cero duplicación de código. Cada sub-rutina va en su try/catch con su
// latido en worker_beats; ninguna tumba a la siguiente ni a la respuesta HTTP (corre
// en ctx.waitUntil, en 2º plano). Todas son idempotentes o inofensivas en repetición;
// el cerrojo D1 evita además el solape entre isolates de las que leen-y-escriben.
async function agentPrincipalSnapshot(env,now=Date.now()) {
  const yesterdayStart=madridDayStart(madridDayStart(now)-1);
  const [projects,declarations,members,missions]=await Promise.all([
    env.DB.prepare('SELECT * FROM projects').all(),
    env.DB.prepare('SELECT day,agent_key,agent,project_id,created_at,updated_at FROM agent_project_declarations WHERE day<=?').bind(madridDayKey(now)).all(),
    env.DB.prepare('SELECT project_id,kind,ref FROM project_members').all(),
    env.DB.prepare("SELECT t.id,t.project_id,t.assignee,t.loc,t.role,t.source,t.status,t.started_at,t.resolved_at,t.live_at,t.live_kind,t.live_shot,material.material_at FROM tickets t LEFT JOIN (SELECT mission_id,MAX(CASE WHEN updated_at<4102444800 THEN updated_at*1000 ELSE updated_at END) material_at FROM mission_tasks WHERE TRIM(COALESCE(report,''))!='' AND status IN ('in_progress','doing','active','done','unconcluded') GROUP BY mission_id) material ON material.mission_id=t.id WHERE "+MISSION_SCOPE_SQL_T+" AND t.status IN ('in_progress','unconcluded','resolved') AND (CASE WHEN t.started_at<4102444800 THEN t.started_at*1000 ELSE t.started_at END>=? OR CASE WHEN t.resolved_at<4102444800 THEN t.resolved_at*1000 ELSE t.resolved_at END>=? OR (t.live_kind='process' AND t.live_shot IS NOT NULL AND CASE WHEN t.live_at<4102444800 THEN t.live_at*1000 ELSE t.live_at END>=?) OR material.material_at>=?)").bind(yesterdayStart,yesterdayStart,yesterdayStart,yesterdayStart).all()
  ]);
  return {projects:projects.results || [],declarations:declarations.results || [],members:members.results || [],missions:missions.results || [],now};
}
async function hourlyModeProject(env, target, requestedProjectId = "", now = Date.now()) {
  const snapshot=await agentPrincipalSnapshot(env,now);
  const resolved=resolveAgentPrincipalProject({...snapshot,target});
  if (resolved.project_issue) throw Object.assign(new Error(resolved.project_issue),{status:409});
  if (!resolved.project_available) throw Object.assign(new Error('project_required'),{status:409});
  if (requestedProjectId && requestedProjectId!==resolved.project_id) throw Object.assign(new Error('principal_project_changed'),{status:409});
  const project=selectDecisionProjectAssignment(snapshot.projects,snapshot.members,target.agent || target.persona,target.machine,resolved.project_id);
  if (!project) throw Object.assign(new Error('project_required'),{status:409});
  return {...project,...resolved};
}

async function assignedWorkSnapshot(env) {
  await ensureHourlyModeSchema(env);
  const [missions,tasks,paused]=await Promise.all([
    env.DB.prepare("SELECT id,assignee,loc,status FROM tickets WHERE "+AGENT_SOURCE_SQL+" AND status IN ('open','in_progress','unconcluded')").all(),
    env.DB.prepare("SELECT m.mission_id,m.code,m.status,m.owner,m.executor,t.assignee,t.loc,t.status parent_status FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id WHERE m.status IN ('open','pending','assigned','in_progress','doing','active','unconcluded') AND t.status NOT IN ('resolved','cancelled')").all(),
    env.DB.prepare("SELECT w.mission_id FROM fleet_hourly_work w JOIN fleet_agent_mode_runs r ON r.id=w.run_id WHERE r.status='paused'").all()
  ]);
  const pausedIds=new Set((paused.results||[]).map(row=>row.mission_id));
  return {missions:(missions.results||[]).filter(row=>!pausedIds.has(row.id)),tasks:(tasks.results||[]).filter(row=>!pausedIds.has(row.mission_id))};
}
async function hourlyModeActivity(env,target,project,now,ownRunId="") {
  const linked=ownRunId?await env.DB.prepare("SELECT w.mission_id FROM fleet_hourly_work w JOIN fleet_agent_mode_runs r ON r.id=w.run_id WHERE w.run_id=? AND r.identity_key=?").bind(ownRunId,modeTargetKey(target)).first():null;
  const snapshot=await assignedWorkSnapshot(env);
  const blocked=assignedWorkBlockers(target,{...snapshot,ownMissionId:linked?.mission_id || ''});
  if (blocked.length) return {busy:true,reason:'human_mission_assigned',blocked_by:blocked};
  const decisions=await env.DB.prepare("SELECT agent,machine FROM decisions WHERE status='pending' AND deadline>? AND COALESCE(parent_decision,'')!='FORMACION'").bind(now).all();
  if ((decisions.results||[]).some(row=>matchesOnIdleIdentity({assignee:row.agent,loc:row.machine},target))) return {busy:true,reason:'live_decision'};
  return {busy:false};
}
async function preemptAutomaticWork(env,now=Date.now()) {
  await ensureAcademyCapsuleSchema(env);
  await pauseLegacyAcademy(env.DB,now);
  const snapshot=await assignedWorkSnapshot(env);
  const runs=await env.DB.prepare("SELECT r.id,p.agent,p.machine,w.mission_id FROM fleet_agent_mode_runs r JOIN fleet_agent_modes p ON p.identity_key=r.identity_key LEFT JOIN fleet_hourly_work w ON w.run_id=r.id WHERE r.status IN ('reserved','starting','resuming','dispatched','awaiting_delivery','completing')").all();
  for (const run of runs.results||[]) {
    const blocked=assignedWorkBlockers(run,{...snapshot,ownMissionId:run.mission_id || ''});
    if (blocked.length) await pauseAutomaticRun(env.DB,run.id,blocked,now);
  }
  const decisions=await env.DB.prepare("SELECT d.id,d.agent,d.machine,d.status,w.mission_id FROM decisions d LEFT JOIN fleet_agent_mode_runs r ON r.decision_id=d.id LEFT JOIN fleet_hourly_work w ON w.run_id=r.id WHERE d.mission='Training horario' AND d.status='pending'").all();
  for (const decision of decisions.results||[]) {
    if (!assignedWorkBlockers(decision,{...snapshot,ownMissionId:decision.mission_id || ""}).length) continue;
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO automatic_work_pauses(kind,ref,previous_status,reason,paused_at) VALUES('hourly_decision',?,'pending','human_mission_assigned',?)").bind(decision.id,now),
      env.DB.prepare("UPDATE decisions SET status='paused' WHERE id=? AND status='pending'").bind(decision.id)
    ]);
  }
}
async function hourlyModeTelemetry(env) {
  if (!env.TELEGRAM) throw new Error('telemetry_unavailable');
  const response=await env.TELEGRAM.fetch(new Request('https://telegram/api/presence',{headers:{accept:'application/json'}}));
  if (!response.ok) throw new Error('telemetry_unavailable');
  const data=await response.json();
  if (!data.ok || !Array.isArray(data.presence)) throw new Error('telemetry_unavailable');
  return data;
}
async function hourlyModeInventory(env) {
  const principal=await agentPrincipalSnapshot(env);
  const saved=await listAgentModes(env),items=new Map(saved.map(row=>[row.identity_key,row]));
  let telemetry;try { telemetry=await hourlyModeTelemetry(env); } catch { telemetry={presence:[],control_machines:[]}; }
  for (const row of [...telemetry.presence,...(telemetry.control_machines || []).flatMap(machine=>(machine.slots || []).map(slot=>({...slot,machine:machine.machine})))]) {
    let target;
    try { target=normalizeModeTarget(row); }
    catch {
      const persona=String(row.agent || row.persona || '').trim(),machine=String(row.machine || '').trim();
      if (!principalTargetKey(persona,machine)) continue;
      target={agent:scopedAgentIdentity(persona,machine),persona:parseAgentIdentity(persona).persona || persona,machine,runtime:String(row.runtime || '').trim(),host:'unknown',metadata_only:true};
    }
    const key=modeTargetKey(target);
    if (!items.has(key)) items.set(key,{...target,identity_key:key,mode:'manual',status:'manual',reason:'manual',project_id:'',next_run:null,last_run:null});
  }
  for (const row of items.values()) {
    row.mode_project_id=row.mode==='manual'?'':row.project_id || '';
    row.mode_project_name=row.mode==='manual'?'':row.project_name || row.mode_project_id;
    Object.assign(row,resolveAgentPrincipalProject({...principal,target:row}));
    row.project_mismatch=!!row.mode_project_id && row.mode_project_id!==row.project_id;
    if (row.project_mismatch) { row.status='blocked';row.reason='principal_project_changed'; }
    const machine=(telemetry.control_machines || []).find(item=>memberRefMatches('machine',item.machine,row.machine));
    const capabilities=machine?.capabilities || [],now=Date.now()/1000,sampled=Number(machine?.updated || 0),fresh=sampled>0 && now-sampled<=30 && sampled<=now+5;
    const configured=(machine?.slots || []).some(slot=>modeTargetKey({...slot,machine:machine.machine})===row.identity_key);
    const observed=(telemetry.presence || []).some(item=>modeTargetKey(item)===row.identity_key && item.source==='process_snapshot' && (item.verified===true || item.verified===1) && Number(item.updated)>0 && now-Number(item.updated)<=30 && Number(item.updated)<=now+5);
    const supported=!row.metadata_only && ['app','cli'].includes(row.host) && fresh && (row.host==='cli'?configured:(configured || observed)) && capabilities.includes('hourly_modes') && capabilities.includes(row.host==='app'?'desktop_write':'hourly_cli_'+row.runtime.toLowerCase()) && (row.host==='app'?capabilities.includes('hourly_desktop_'+row.runtime.toLowerCase()):(machine.hourly_targets || []).some(target=>modeTargetKey({...target,machine:target.machine || machine.machine})===row.identity_key));
    row.available_modes=row.metadata_only?[]:supported?['manual','learning','training']:['manual'];
    const unavailable=(machine?.hourly_unavailable || []).some(item=>item.runtime===row.runtime && item.host===row.host && item.reason==='auth_verification_required');
    row.support_reason=supported?'':!fresh?'telemetry_unavailable':unavailable?'claude_cli_auth_verification_required':'consumer_unavailable';
  }
  return [...items.values()];
}
async function hourlyModeGuard(env,id,now=Date.now(),expectedTarget=null) {
  await ensureHourlyModeSchema(env);
  const run=await env.DB.prepare('SELECT * FROM fleet_agent_mode_runs WHERE id=?').bind(id).first();
  if (!run || !['reserved','starting','resuming','dispatched','awaiting_delivery','completing'].includes(run.status) || now-run.created_at>45*60000) return {allowed:false,reason:'run_inactive'};
  const pref=await env.DB.prepare('SELECT * FROM fleet_agent_modes WHERE identity_key=?').bind(run.identity_key).first();
  if (expectedTarget && (!pref || modeTargetKey(expectedTarget)!==pref.identity_key)) return {allowed:false,reason:'target_mismatch'};
  if (!pref || pref.mode!==run.mode || pref.mode==='manual' || pref.project_id!==run.project_id || pref.enabled_at>run.created_at) return {allowed:false,reason:'preference_changed'};
  const lease=await env.DB.prepare('SELECT run_id FROM fleet_hourly_family_leases WHERE run_id=? AND expires_at>?').bind(id,now).first();
  if (!lease) return {allowed:false,reason:'family_lease_expired'};
  const activity=await hourlyModeActivity(env,pref,{id:run.project_id},now,id);
  if (activity.busy) {
    if (activity.reason==='human_mission_assigned') await pauseAutomaticRun(env.DB,id,activity.blocked_by,now);
    return {allowed:false,reason:activity.reason,blocked_by:activity.blocked_by};
  }
  let project;try { project=await hourlyModeProject(env,pref,run.project_id,now); } catch { return {allowed:false,reason:'principal_project_changed'}; }
  return {allowed:true,reason:'ready',run_id:id,mode:run.mode,project_id:run.project_id,project_url:project?.web?new URL(/^https?:/.test(project.web)?project.web:'https://'+project.web).href:'',target:normalizeModeTarget(pref)};
}
async function executeHourlyMode(env,run) {
  const guard=await hourlyModeGuard(env,run.id,run.now);
  if (!guard.allowed) return {status:'skipped',reason:guard.reason};
  // Re-sample before a side effect; the first evaluation can be several awaits old.
  const state=evaluateModeOpportunity(run.pref,await hourlyModeTelemetry(env),await hourlyModeActivity(env,run.pref,run.project,Date.now()),Date.now());
  if (!state.eligible) return {status:'skipped',reason:state.reason};
  if (run.pref.host==='cli') {
    const dispatchGuard=await hourlyModeGuard(env,run.id);
    if (!dispatchGuard.allowed) return {status:'skipped',reason:dispatchGuard.reason};
    const projectUrl=new URL(/^https?:/.test(run.project.web || '')?run.project.web:'https://'+run.project.web).href;
    const response=await env.TELEGRAM.fetch(new Request('https://telegram/api/fleet/agent/hourly-run',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+env.ADMIRA_TELEGRAM_PANEL_KEY},body:JSON.stringify({...run.pref,run_id:run.id,project_id:run.project.id,project_url:projectUrl})}));
    const result=await response.json();if (!response.ok || !result.ok || !result.command_id) throw new Error(result.error || 'hourly_dispatch_failed');
    return {status:'dispatched',reason:'isolated_research_queued',command_id:result.command_id};
  }
  if (state.start) {
    const started=await dispatchAgentStart(env,normalizeAgentStartTarget(state.target));
    return {status:'starting',reason:'waiting_for_process',command_id:started.result.command_id};
  }
  if (run.pref.mode==='training') {
    const proposal=await canonicalOnIdleProposals(env,run.pref,run.project.id);
    if (!proposal.ok || proposal.proposals?.length!==3) {
      if (run.pref.host==='cli') return {status:'skipped',reason:'terminal_readiness_unavailable'};
      const dispatchGuard=await hourlyModeGuard(env,run.id);
      if (!dispatchGuard.allowed) return {status:'skipped',reason:dispatchGuard.reason};
      const dispatch=await dispatchDesktopWrite(env,{...state.target,text:trainingPrompt(run)});
      return {status:'dispatched',reason:'investigating_fresh_proposals',command_id:dispatch.result.command_id};
    }
    const finalGuard=await hourlyModeGuard(env,run.id);
    if (!finalGuard.allowed) return {status:'skipped',reason:finalGuard.reason};
    const finalState=evaluateModeOpportunity(run.pref,await hourlyModeTelemetry(env),await hourlyModeActivity(env,run.pref,run.project,Date.now()),Date.now());
    if (!finalState.eligible || finalState.start) return {status:'skipped',reason:finalState.reason};
    const decision=await openInitialMissionDecision(env,{agent:run.pref.agent,machine:run.pref.machine,project_id:run.project.id,
      surface:'highscore',mission:'Training horario',hourly_run_id:run.id,question:'Training · mejora horaria · '+run.pref.runtime+' '+run.pref.host.toUpperCase(),
      options:proposal.proposals.map(row=>row.title).concat([ONIDLE_BACK_OPTION,ONIDLE_CUSTOM_OPTION]),
      option_targets:proposal.proposals.map(row=>({target_mission_id:row.target_mission_id})).concat([null,null]),recommended:0,minutes:5,url:DECIDE_URL});
    if (!decision.ok) return {status:'skipped',reason:decision.code || decision.error || 'decision_unavailable'};
    return {status:'completed',reason:'decision_published',decision_id:decision.id,deliverable_url:onIdleDecisionUrl(decision.id)};
  }
  const {tema,lessonId}=academyTemaDeFranja(Math.floor(run.hour_start/COACH_HOUR));
  const prompt=learningPrompt(run,tema.nombre+' · '+lessonId),target={...state.target,text:prompt};
  const lastGuard=await hourlyModeGuard(env,run.id);
  if (!lastGuard.allowed) return {status:'skipped',reason:lastGuard.reason};
  const dispatched=run.pref.host==='app' ? await dispatchDesktopWrite(env,target) : await dispatchCliTerminal(env,{...target,action:'write',text:prompt+'\n'});
  return {status:'dispatched',reason:'awaiting_consumer',command_id:dispatched.result.command_id};
}
async function readHourlyModeCommand(env,row,pref) {
  const response=await env.TELEGRAM.fetch(new Request('https://telegram/api/fleet/agent/commands/'+encodeURIComponent(row.command_id),{headers:{accept:'application/json',authorization:'Bearer '+env.ADMIRA_TELEGRAM_PANEL_KEY}}));
  if (!response.ok) throw new Error('hourly_command_unavailable');
  const data=await response.json(),command=data.command || {},input=JSON.parse(command.input || '{}');
  if (command.action!=='hourly_run' || input.run_id!==row.id || modeTargetKey(command)!==pref.identity_key || !['queued','running','done','failed'].includes(command.status)) throw new Error('hourly_command_mismatch');
  return command;
}
async function resumeHourlyModes(env,now) {
  const rows=(await env.DB.prepare("SELECT * FROM fleet_agent_mode_runs WHERE status IN ('starting','dispatched') ORDER BY created_at LIMIT 40").all()).results || [];
  for (const row of rows) {
    if (!row.command_id) continue;
    const pref=await env.DB.prepare('SELECT * FROM fleet_agent_modes WHERE identity_key=?').bind(row.identity_key).first();
    if (!pref) continue;
    let result,claimedForResume=false;
    try {
      const command=row.status==='starting'?await readAgentControlResult(env,row.command_id):pref.host==='app'?await readDesktopResult(env,row.command_id,'write'):await readHourlyModeCommand(env,row,pref);
      if (command.status==='failed') result={status:'failed',reason:command.error || 'consumer_failed'};
      else if (['done','already_running'].includes(command.status)) {
        if (row.status==='dispatched') result={status:pref.host==='app' && command.delivered!==true?'failed':'awaiting_delivery',reason:pref.host==='app' && command.delivered!==true?'not_delivered':row.mode==='learning'?'capsule_pending':'proposals_pending'};
        else if (hourlySlot(now)!==row.hour_start) result={status:'skipped',reason:'hour_expired'};
        else {
          const project=await hourlyModeProject(env,pref,row.project_id,now);
          const guard=await hourlyModeGuard(env,row.id,now);
          if (!guard.allowed) result={status:'skipped',reason:guard.reason};
          else {
            const eligibility=evaluateModeOpportunity(pref,await hourlyModeTelemetry(env),await hourlyModeActivity(env,pref,project,now),now);
            // Acknowledged launch without a process never loops into another launch.
            if (!eligibility.eligible || eligibility.start) result={status:'failed',reason:'process_not_verified'};
            else {
              const claimed=await env.DB.prepare("UPDATE fleet_agent_mode_runs SET status='resuming',updated_at=? WHERE id=? AND status='starting'").bind(now,row.id).run();
              if (!claimed.meta?.changes) continue;
              claimedForResume=true;
              result=await executeHourlyMode(env,{id:row.id,pref,project,eligibility,hour_start:row.hour_start,now});
            }
          }
        }
      }
    } catch(error) { result={status:'failed',reason:String(error.code || error.message || 'consumer_status_failed').slice(0,120)}; }
    if (result) {
      const changed=await env.DB.prepare('UPDATE fleet_agent_mode_runs SET status=?,reason=?,command_id=COALESCE(?,command_id),decision_id=?,deliverable_url=?,updated_at=? WHERE id=? AND status=?')
        .bind(result.status,result.reason,result.command_id || null,result.decision_id || null,result.deliverable_url || null,now,row.id,claimedForResume?'resuming':row.status).run();
      if (!changed.meta?.changes) continue;
      await env.DB.prepare('UPDATE fleet_agent_modes SET status=?,reason=? WHERE identity_key=? AND mode=?')
        .bind(result.status,result.reason,row.identity_key,row.mode).run();
      if (['skipped','failed','completed'].includes(result.status)) await env.DB.prepare('DELETE FROM fleet_hourly_family_leases WHERE run_id=?').bind(row.id).run();
    }
  }
  const failed=(await env.DB.prepare("SELECT r.id,r.reason,r.identity_key FROM fleet_agent_mode_runs r JOIN fleet_hourly_work w ON w.run_id=r.id WHERE r.status='failed' LIMIT 40").all()).results || [];
  for (const row of failed) {
    const pref=await env.DB.prepare('SELECT * FROM fleet_agent_modes WHERE identity_key=?').bind(row.identity_key).first();
    if (pref) await hourlyModeWork(env,{stage:'fail',run_id:row.id,target:pref,reason:row.reason},now);
  }
}
function hourlyModeAdapters(env) {
  return {readTelemetry:()=>hourlyModeTelemetry(env),projectFor:(...args)=>hourlyModeProject(env,...args),activityFor:(...args)=>hourlyModeActivity(env,...args),execute:run=>executeHourlyMode(env,run),resume:now=>resumeHourlyModes(env,now)};
}
async function completeHourlyTraining(env,run,pref,body) {
  const now=Date.now(),project=await hourlyModeProject(env,pref,run.project_id,now);
  const proposals=validateTrainingProposals(body.proposals,project,now);
  const titleKeys=new Set(proposals.map(row=>onIdleProposalTitleKey(row.title)));
  const [tickets,decisions]=await Promise.all([
    env.DB.prepare("SELECT subject FROM tickets WHERE project_id=? AND lower(status) IN ('resolved','closed','cancelled')").bind(project.id).all(),
    env.DB.prepare('SELECT options FROM decisions WHERE project=? AND created_at>?').bind(project.id,now-7*86400000).all()
  ]);
  const used=(tickets.results||[]).map(row=>row.subject);
  for (const row of decisions.results||[]) { try { used.push(...JSON.parse(row.options)); } catch {} }
  if (used.some(title=>titleKeys.has(onIdleProposalTitleKey(title)))) return {ok:false,status:409,error:'proposal_already_used'};
  for (const proposal of proposals) {
    const response=await fetch(proposal.source_url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(10000)});
    if (!response.ok) return {ok:false,status:422,error:'proposal_source_unavailable'};
  }
  const guard=await hourlyModeGuard(env,run.id,now);
  if (!guard.allowed) return {ok:false,status:409,error:guard.reason};
  const eligibility=evaluateModeOpportunity(pref,await hourlyModeTelemetry(env),await hourlyModeActivity(env,pref,project,Date.now(),run.id),Date.now());
  if (!eligibility.eligible || eligibility.start) return {ok:false,status:409,error:eligibility.reason};
  const claim=await env.DB.prepare("UPDATE fleet_agent_mode_runs SET status='completing',updated_at=? WHERE id=? AND status IN ('dispatched','awaiting_delivery')").bind(now,run.id).run();
  if (!claim.meta?.changes) return {ok:false,status:409,error:'run_completion_in_progress'};
  try {
    const finalGuard=await hourlyModeGuard(env,run.id);
    if (!finalGuard.allowed) throw new Error(finalGuard.reason);
    const decision=await openInitialMissionDecision(env,{agent:pref.agent,machine:pref.machine,project_id:project.id,surface:'highscore',mission:'Training horario',
      question:'Training · tres mejoras investigadas · '+pref.runtime+' '+pref.host.toUpperCase(),options:proposals.map(row=>row.title).concat([ONIDLE_BACK_OPTION,ONIDLE_CUSTOM_OPTION]),option_targets:[null,null,null,null,null],recommended:0,minutes:5,url:DECIDE_URL});
    if (!decision.ok) throw new Error(decision.code || decision.error || 'decision_unavailable');
    const deliverable=onIdleDecisionUrl(decision.id);
    await env.DB.prepare("UPDATE fleet_agent_mode_runs SET status='completed',reason='decision_published',decision_id=?,deliverable_url=?,evidence_json=?,updated_at=? WHERE id=?")
      .bind(decision.id,deliverable,JSON.stringify(proposals),Date.now(),run.id).run();
    await env.DB.prepare("UPDATE fleet_agent_modes SET status='completed',reason='decision_published' WHERE identity_key=? AND mode='training'").bind(run.identity_key).run();
    await env.DB.prepare('DELETE FROM fleet_hourly_family_leases WHERE run_id=?').bind(run.id).run();
    return {ok:true,run_id:run.id,decision_id:decision.id,deliverable_url:deliverable};
  } catch(error) {
    await env.DB.prepare("UPDATE fleet_agent_mode_runs SET status='failed',reason=?,updated_at=? WHERE id=? AND status='completing'").bind(String(error.message).slice(0,120),Date.now(),run.id).run();
    return {ok:false,status:409,error:String(error.message).slice(0,120)};
  }
}
async function hourlyModeWork(env,body,now=Date.now()) {
  const id=String(body.run_id || ''),target=normalizeModeTarget(body.target || {});
  const run=await env.DB.prepare('SELECT * FROM fleet_agent_mode_runs WHERE id=?').bind(id).first();
  if (!run || run.identity_key!==modeTargetKey(target)) throw Object.assign(new Error('target_mismatch'),{status:409});
  const pref=await env.DB.prepare('SELECT * FROM fleet_agent_modes WHERE identity_key=?').bind(run.identity_key).first();
  const existing=await env.DB.prepare('SELECT * FROM fleet_hourly_work WHERE run_id=?').bind(id).first();
  if (body.stage==='fail') {
    if (!existing) throw Object.assign(new Error('work_required'),{status:409});
    const reason=String(body.reason || 'runner_failed').replace(/[^a-z0-9_:.-]/gi,'').slice(0,160);
    const closed=await env.DB.prepare('SELECT status FROM tickets WHERE id=?').bind(existing.mission_id).first();
    if (['resolved','unconcluded'].includes(closed?.status)) return {ok:true,work_id:existing.mission_id,status:closed.status};
    const report='Investigación interrumpida · '+reason+(run.deliverable_url?' · Entrega ya verificada: '+run.deliverable_url:' · Sin entrega verificada.');
    await env.DB.batch([
      env.DB.prepare("UPDATE mission_tasks SET status='unconcluded',report=?,updated_at=? WHERE mission_id=? AND code='a' AND status!='done'").bind(report,now,existing.mission_id),
      env.DB.prepare("UPDATE tickets SET status='unconcluded',updated_at=? WHERE id=? AND status NOT IN ('resolved','cancelled')").bind(now,existing.mission_id),
      env.DB.prepare("UPDATE fleet_agent_mode_runs SET status=CASE WHEN status='completed' THEN status ELSE 'failed' END,reason=?,updated_at=? WHERE id=?").bind(run.status==='completed'?'delivery_verified_work_pending':reason,now,id)
    ]);
    await env.DB.prepare('DELETE FROM fleet_hourly_family_leases WHERE run_id=?').bind(id).run();
    return {ok:true,work_id:existing.mission_id,status:'unconcluded'};
  }
  const guard=await hourlyModeGuard(env,id,now,target);
  if (!guard.allowed) throw Object.assign(new Error(guard.reason),{status:409});
  if (body.stage==='start') {
    if (existing) return {ok:true,work_id:existing.mission_id,owner:pref.agent,reused:true};
    const mid='HWR-'+id.replace(/^HMODE-/,'');
    const subject=(run.mode==='learning'?'Learning':'Training')+' · investigación horaria · '+run.project_id;
    const owner=scopedAgentIdentity(pref.agent,pref.machine,'sub');
    await env.DB.batch([
      env.DB.prepare('INSERT INTO fleet_hourly_work(run_id,mission_id,created_at) VALUES(?,?,?)').bind(id,mid,now),
      env.DB.prepare("INSERT INTO tickets(id,screen,subject,loc,role,status,priority,assignee,source,ai_triage,project,project_id,created_at,started_at,updated_at,live_at) VALUES(?,?,?,?,'standalone-task','in_progress','normal',?,'cli-declare','',?,?,?,?,?,?)")
        .bind(mid,'hourly:'+id,subject,pref.machine,pref.agent,run.project_id,run.project_id,now,now,now,now),
      env.DB.prepare("INSERT INTO mission_tasks(mission_id,code,title,status,owner,executor,report,created_at,started_at,updated_at) VALUES(?,'a',?,'in_progress',?,?,?, ?,?,?)")
        .bind(mid,'Investigar fuentes públicas y entregar '+run.mode,owner,owner,'Investigación aislada autorizada; todavía sin entregable. Run '+id,now,now,now)
    ]);
    await ensureEntityDisplayRef(env,'mission',mid,now);
    return {ok:true,work_id:mid,owner:pref.agent};
  }
  if (!existing) throw Object.assign(new Error('work_required'),{status:409});
  if (body.stage==='report') {
    // Only final structured output, no messages/tools/reasoning or local paths.
    const result=body.result;
    if (!result || typeof result!=='object' || JSON.stringify(result).length>14000) throw new Error('result_invalid');
    const project=await hourlyModeProject(env,pref,run.project_id,now);
    let output;
    if (run.mode==='training') output={proposals:validateTrainingProposals(result.proposals,project,now)};
    else {
      const title=String(result.title || '').trim(),comment=String(result.comment || '').trim(),source_url=String(result.source_url || '');
      if (title.length<8 || title.length>160 || comment.length<120 || comment.length>6000 || !source_url.startsWith('https://')) throw new Error('capsule_result_invalid');
      output={title,comment,source_url};
    }
    const transcript=JSON.stringify({run_id:id,agent:pref.agent,runtime:pref.runtime,project_id:run.project_id,request:run.mode+' · analizar únicamente las fuentes públicas suministradas; sin herramientas ni acceso a sesiones',command:'claude --print --tools [vacío] --strict-mcp-config --no-session-persistence',final_response:output},null,2);
    if (/Bearer\s+[A-Za-z0-9._-]{12,}|(?:sk-|ghp_|gho_)[A-Za-z0-9_-]{15,}|\/(?:Users|home)\//i.test(transcript)) throw new Error('transcript_sensitive');
    const write=await env.DB.prepare('UPDATE fleet_hourly_work SET transcript=? WHERE run_id=? AND transcript IS NULL').bind(transcript,id).run();
    if (!write.meta?.changes && existing.transcript!==transcript) throw Object.assign(new Error('transcript_immutable'),{status:409});
    await env.DB.prepare("UPDATE mission_tasks SET report=?,updated_at=? WHERE mission_id=? AND code='a' AND status='in_progress'").bind(('Respuesta final real del ejecutor · '+JSON.stringify(output)).slice(0,1800),now,existing.mission_id).run();
    await env.DB.prepare('UPDATE tickets SET live_at=?,updated_at=? WHERE id=? AND status=\'in_progress\'').bind(now,now,existing.mission_id).run();
    return {ok:true,work_id:existing.mission_id,transcript_url:'https://api.yokup.com/fleet/agent/mode/transcript?run_id='+encodeURIComponent(id)};
  }
  if (body.stage==='publish_claim') {
    if (!existing.transcript) throw new Error('transcript_required');
    const publishGuard=await hourlyModeGuard(env,id,Date.now(),target);
    if (!publishGuard.allowed) throw Object.assign(new Error(publishGuard.reason),{status:409});
    const claimed=await env.DB.prepare('UPDATE fleet_hourly_work SET publish_claim=1 WHERE run_id=? AND publish_claim=0').bind(id).run();
    if (!claimed.meta?.changes) throw Object.assign(new Error('publish_already_attempted'),{status:409});
    return {ok:true,work_id:existing.mission_id};
  }
  throw Object.assign(new Error('invalid_work_stage'),{status:400});
}

async function runScheduledRoutine(env, event) {
  const out = {};
  const step = async (name, fn) => {
    try { await fn(); await recordBeat(env, name, true, ""); out[name] = { ok: true }; }
    catch (e) { await recordBeat(env, name, false, e); out[name] = { ok: false, error: String((e && e.message) || e) }; }
  };
  try { await ensureSchema(env); } catch (e) { return out; }   // sin esquema no seguimos
  // Relojes de decisión vencidos → recomendada + materialización de su tanda.
  await step("expireDecisions", () => expireDecisionsAndStartBatches(env));
  // Incidencias DOOH: pantallas caídas/recuperadas.
  await step("reconcile", () => reconcile(env));
  // Monitor de webs y máquinas 24/7: caro (fetch externos) → ~cada 10 min por su
  // propia edad de latido, con independencia del ritmo del tráfico HTTP.
  if (await beatAge(env, "checkWebs") >= 9.5 * 60000) {
    await step("checkWebs", async () => {
      const webReport = await checkWebs(env);
      await checkMachines(env); // siempre: los fallos web ya están aislados
      if (!webReport.ok) {
        const failed = webReport.checks.filter((item) => !item.ok);
        throw new Error("monitor web parcial: " + failed.map((item) => item.url + " · " + item.error).join(" | "));
      }
    });
  }
  // Buzón de la flota → misiones/tareas (INSERT OR IGNORE: converge, no duplica).
  await step("fleetSync", () => fleetSync(env));
  // Árbol de tareas de las misiones nuevas, en tandas cortas (coste IA).
  await step("fleetPlan", () => fleetPlanPending(env, 3));
  // Avance del árbol → estado de la misión y del encargo del bot-inbox.
  await step("fleetReconcile", async () => {
    await fleetReconcileAll(env);
    // Los targets adoptados pueden cerrarse por cualquier carril canónico
    // (fleet, declare, incidencia o web). El mismo latido converge su tanda sin
    // exigir que cada ruta de cierre conozca el origen OnIdle.
    await reconcileBatchTargetMissions(env);
  });
  // Primer tick tras la medianoche de Madrid: no concluidas del día terminado
  // pasan a Eliminadas. Va después del sync/reconcile para observar cualquier
  // cierre o actividad externa recién llegada antes de decidir; el lease vive en D1.
  await step("dailyMissionClose", () => runDailyMissionClose(env));
  // OnIDLE nace únicamente aquí, bajo el mismo lease D1 de cron/piggyback. Los
  // clientes locales se limitan a observar; no publican ni reproducen avisos.
  await step("onIdle", () => runOnIdleTick(env));
  await step("agentHourlyModes", () => runHourlyModes(env, hourlyModeAdapters(env)));
  // Consejo generador (idempotente por hueco de 3h; su propia bitácora council_ticks).
  await step("council", () => runCouncilTick(env));
  // Cápsula de la hora para admira.academy (idempotente por hora; clave primaria).
  await step("academyCapsule", () => runAcademyCapsuleTick(env));
  return out;
}
__name(runScheduledRoutine, "runScheduledRoutine");
// Throttle por isolate del enganche HTTP de la rutina (ver fetch): último disparo (ms).
var scheduledPiggybackAt = 0;

// ── PROYECTOS ───────────────────────────────────────────────────────────────
// Slug estable a partir del nombre. «Admira Live» → «admira-live».
function projectSlug(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}
__name(projectSlug, "projectSlug");
// Índice de proyectos para resolver un valor suelto (id, nombre o dominio) al
// proyecto canónico. Una sola consulta; quien lo necesite varias veces lo pasa.
async function projectIndex(env) {
  // Tolerante a que la tabla aún no exista (hay rutas que leen tickets sin haber
  // pasado por ensureSchema): sin censo, el proyecto se devuelve tal cual.
  let rows = [];
  try { rows = (await env.DB.prepare("SELECT * FROM projects").all()).results || []; } catch (e) { rows = []; }
  const byKey = new Map();
  const key = (x) => String(x || "").trim().toLowerCase();
  for (const p of rows) {
    byKey.set(key(p.id), p);
    if (p.name) byKey.set(key(p.name), p);
    if (p.name) byKey.set(projectSlug(p.name), p);
    if (p.web) byKey.set(key(String(p.web).replace(/^https?:\/\//, "").replace(/\/.*$/, "")), p);
  }
  return { rows, get: (v) => byKey.get(key(v)) || byKey.get(projectSlug(v)) || null };
}
__name(projectIndex, "projectIndex");

// La declaración diaria exige apellido de equipo. «Neo» a secas sería ambiguo:
// cada máquina tiene su identidad y puede llevar un proyecto principal distinto.
function principalAgentIdentity(agent, machine = "") {
  const parsed = parseAgentIdentity(agent);
  const suffix = machineSuffix(machine) || parsed.suffix;
  // Segunda copia a mano del censo de personas —la primera es PERSONAS en
  // src/agent-identity.js y la tercera la regex de cleanMissionAttributions—, y hay
  // que tocar las tres a la vez. Hoy Link existía en la flota y no aquí: declarar
  // proyecto con ella devolvía exact_agent_required y ninguna pista de por qué.
  // Unificar las tres es el FLT-1490.
  // Única fuente: el diccionario PERSONAS de agent-identity.js (FLT-1490 cerrado por
  // FLT-1580: la copia a mano dejaba fuera a Seraph y a los consejeros de GrokBot).
  const known = isKnownPersona(parsed.persona);
  if (!known || !suffix) return null;
  const visible = canonicalProjectAgentRef(reportAgentIdentity(agent, machine || suffix));
  if (!visible || !parseAgentIdentity(visible).suffix) return null;
  return { agent: visible, agent_key: identityKey(visible) };
}
__name(principalAgentIdentity, "principalAgentIdentity");

async function exactActiveProject(env, projectId) {
  const id = String(projectId || "").trim().slice(0, 120);
  if (!id) return null;
  const row = await env.DB.prepare("SELECT id,name,status FROM projects WHERE id=?").bind(id).first();
  return row && String(row.status || "activo").toLowerCase() !== "archivado" ? row : null;
}
__name(exactActiveProject, "exactActiveProject");

// Resolución única para el nacimiento de misiones. Sólo admite relaciones
// estructuradas: id explícito, decisión/tanda/misión madre o declaración diaria.
// Un id explícito inválido falla cerrado; nunca se sustituye silenciosamente.
async function resolveCreationProject(env, context = {}) {
  const explicit = String(context.project_id || "").trim().slice(0, 120);
  if (explicit) {
    const project = await exactActiveProject(env, explicit);
    return project ? { ok:true, project_id:project.id, project:project.name || project.id } :
      { ok:false, status:400, code:"invalid_project_id", error:"project_id activo y exacto requerido" };
  }
  const candidates = [];
  const batchId = String(context.batch_id || "").trim().slice(0, 120);
  if (batchId) {
    const row = await env.DB.prepare("SELECT project_id,decision_id FROM mission_batches WHERE id=?").bind(batchId).first();
    if (row && row.project_id) candidates.push(row.project_id);
    if (row && row.decision_id) context = { ...context, decision_id:context.decision_id || row.decision_id };
  }
  const decisionId = String(context.decision_id || "").trim().slice(0, 120);
  if (decisionId) {
    const row = await env.DB.prepare("SELECT project,parent_decision FROM decisions WHERE id=?").bind(decisionId).first();
    if (row && row.project) candidates.push(row.project);
    if (row && row.parent_decision) {
      const parent = await env.DB.prepare("SELECT project FROM decisions WHERE id=?").bind(row.parent_decision).first();
      if (parent && parent.project) candidates.push(parent.project);
    }
  }
  const parentId = String(context.parent_id || "").trim().slice(0, 120);
  if (parentId) {
    const row = await env.DB.prepare("SELECT project_id,project FROM tickets WHERE id=?").bind(parentId).first();
    if (row) candidates.push(row.project_id || row.project);
  }
  for (const candidate of candidates) {
    const project = await exactActiveProject(env, candidate);
    if (project) return { ok:true, project_id:project.id, project:project.name || project.id };
  }
  const identity = principalAgentIdentity(context.agent, context.machine);
  if (identity) {
    const today = madridDayKey(Date.now());
    const declaration = await env.DB.prepare(
      "SELECT d.project_id FROM agent_project_declarations d JOIN projects p ON p.id=d.project_id WHERE d.day=? AND d.agent_key=? AND COALESCE(p.status,'activo')!='archivado'"
    ).bind(today, identity.agent_key).first();
    if (declaration) {
      const project = await exactActiveProject(env, declaration.project_id);
      if (project) return { ok:true, project_id:project.id, project:project.name || project.id };
    }
    // HERENCIA DE LA ÚLTIMA DECLARACIÓN (Carlos, 6-ago-2026). La declaración
    // caducaba a medianoche y no la renovaba nadie: en toda la flota existía UNA
    // sola, así que /fleet/sync rechazaba en silencio todo encargo que entrara
    // por Telegram — 41 acumulados (ids 1123-1197) que nadie echó de menos.
    // Se hereda la última declaración EXPLÍCITA del propio agente, no se adivina
    // por pertenencia a proyectos ni leyendo el texto: sigue siendo algo que él
    // declaró, sólo que otro día. Es lo que el mensaje de error ya prometía al
    // decir «heredado».
    // Va MARCADA (inherited) porque puede mentir: el agente pudo cambiar de
    // proyecto desde entonces. La interfaz la pinta con asterisco y en color de
    // aviso para que se vea que ese proyecto no lo confirmó nadie hoy.
    const inherited = await env.DB.prepare(
      "SELECT d.project_id,d.day FROM agent_project_declarations d JOIN projects p ON p.id=d.project_id " +
      "WHERE d.agent_key=? AND d.day<? AND COALESCE(p.status,'activo')!='archivado' ORDER BY d.day DESC LIMIT 1"
    ).bind(identity.agent_key, today).first();
    if (inherited) {
      const project = await exactActiveProject(env, inherited.project_id);
      if (project) return { ok:true, project_id:project.id, project:project.name || project.id,
        inherited:true, inherited_from:String(inherited.day || "") };
    }
  }
  // DEFAULT DE LA FLOTA (Carlos, 13-ago-2026): si no hay proyecto concreto,
  // Galaxia Admira. Así yokup.com nunca deja un hueco ni adivina el censo.
  const fallback = await exactActiveProject(env, "galaxia-admira");
  if (fallback) {
    return { ok:true, project_id:fallback.id, project:fallback.name || fallback.id, defaulted:true };
  }
  return { ok:false, status:400, code:"project_required",
    error:"No se puede crear una misión sin project_id explícito, heredado, declarado o el default Galaxia Admira" };
}
__name(resolveCreationProject, "resolveCreationProject");

async function listPrincipalProjectDeclarations(env, day = madridDayKey(Date.now())) {
  await ensureSchema(env);
  const rows = (await env.DB.prepare(
    "SELECT d.day,d.agent_key,d.agent,d.project_id,d.declared_by,d.statement,d.created_at,d.updated_at," +
    "p.name project_name,p.web project_web,p.status project_status " +
    "FROM agent_project_declarations d LEFT JOIN projects p ON p.id=d.project_id " +
    "WHERE d.day=? ORDER BY d.agent COLLATE NOCASE"
  ).bind(day).all()).results || [];
  return rows.map((r) => ({
    day: r.day, agent_key: r.agent_key, agent: canonicalProjectAgentRef(r.agent), project_id: r.project_id,
    project_name: r.project_name || r.project_id, project_web: r.project_web || "",
    project_status: r.project_status || "", declared_by: r.declared_by || "",
    statement: r.statement || "", created_at: Number(r.created_at) || 0,
    updated_at: Number(r.updated_at) || 0
  }));
}
__name(listPrincipalProjectDeclarations, "listPrincipalProjectDeclarations");

async function declarePrincipalProject(env, body) {
  await ensureSchema(env);
  const identity = principalAgentIdentity(body && body.agent, body && body.machine);
  if (!identity) return { ok: false, error: "identidad operativa exacta requerida", code: "exact_agent_required", status: 400 };
  const idx = await projectIndex(env), project = idx.get(body && body.project);
  if (!project || String(project.status || "activo").toLowerCase() === "archivado") {
    return { ok: false, error: "project activo requerido", code: "exact_project_required", status: 404 };
  }
  const day = madridDayKey(Date.now()), now = Date.now();
  const previous = await env.DB.prepare("SELECT * FROM agent_project_declarations WHERE day=? AND agent_key=?")
    .bind(day, identity.agent_key).first();
  if (previous && previous.project_id === project.id) {
    return { ok: true, unchanged: true, declaration: (await listPrincipalProjectDeclarations(env, day))
      .find((row) => row.agent_key === identity.agent_key) };
  }
  const declaredBy = String(body && (body.declared_by || body.by) || "Carlos").trim().slice(0, 80) || "Carlos";
  const statement = String(body && body.statement || "").trim().slice(0, 280);
  await env.DB.prepare(
    "INSERT INTO agent_project_declarations(day,agent_key,agent,project_id,declared_by,statement,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) " +
    "ON CONFLICT(day,agent_key) DO UPDATE SET agent=excluded.agent,project_id=excluded.project_id,declared_by=excluded.declared_by,statement=excluded.statement,updated_at=excluded.updated_at"
  ).bind(day, identity.agent_key, identity.agent, project.id, declaredBy, statement,
    previous ? previous.created_at : now, now).run();
  return { ok: true, created: !previous, changed: !!previous,
    declaration: (await listPrincipalProjectDeclarations(env, day)).find((row) => row.agent_key === identity.agent_key) };
}
__name(declarePrincipalProject, "declarePrincipalProject");
// Lista completa con sus asignaciones (2 consultas, sin N+1) y cuántas misiones
// vivas cuelgan de cada uno.
async function listProjects(env) {
  await ensureSchema(env);
  // El orden manual manda; lo que nadie ha colocado todavía (sort_order NULL) cae
  // detrás, con el orden de siempre: activos primero y por nombre.
  const { results } = await env.DB.prepare(
    "SELECT * FROM projects ORDER BY (sort_order IS NULL), sort_order, (status='activo') DESC, name COLLATE NOCASE"
  ).all();
  const rows = results || [];
  if (!rows.length) return [];
  const mem = (await env.DB.prepare("SELECT project_id, kind, ref FROM project_members").all()).results || [];
  const carbonAssignments = (await env.DB.prepare("SELECT project_id,carbon_key,first_assigned_at FROM project_carbon_assignments").all()).results || [];
  const carbonFirstByProject = new Map(carbonAssignments.map((row) => [String(row.project_id) + "|" + String(row.carbon_key), Number(row.first_assigned_at) || 0]));
  let launchRows=[];
  try {
    launchRows=(await env.DB.prepare("SELECT project_id,machine,platform,runtime,model,selection,persona,session_id,updated_at,updated_by FROM project_launch_assignments").all()).results || [];
  } catch (error) {
    // Compatibilidad durante el despliegue: el listado sigue vivo si una réplica
    // todavía no ha creado la tabla; ensureSchema la materializa en la siguiente.
  }
  const declarations = await listPrincipalProjectDeclarations(env);
  // VIVA = EN CURSO (Carlos, FLT-985 c1). Hasta aquí `missions` sumaba también las
  // `open` —encargadas y sin empezar— y una ficha con varias misiones en la cola
  // decía que todas estaban vivas sin que nadie trabajara en ninguna. Se separan: lo
  // que cuenta como viva es `in_progress`, y lo `open` viaja aparte para poder
  // decirlo sin mentir en vez de esconderlo.
  const mis = (await env.DB.prepare("SELECT project, status, COUNT(*) c FROM tickets WHERE project IS NOT NULL AND project!='' AND status IN ('in_progress','open') GROUP BY project, status").all()).results || [];
  const misBy = {}, pendBy = {};
  for (const m of mis) {
    const k = String(m.project).toLowerCase();
    if (m.status === "in_progress") misBy[k] = m.c; else pendBy[k] = m.c;
  }
  return rows.map((p) => {
    const canonicalOwner = canonicalProjectAgentRef(p.owner || "");
    const siliconResponsible = canonicalOwner;
    const carbonResponsible = String(p.carbon_responsible || "").trim().slice(0, 80);
    return {
      id: p.id, name: p.name || p.id, blurb: p.blurb || "", web: p.web || "",
      status: p.status || "activo", color: p.color || "",
      owner: canonicalOwner,
      primary_responsible: canonicalOwner || "NeoMacMini",
      silicon_responsible: siliconResponsible,
      carbon_responsible: carbonResponsible,
      carbon_first_assigned_at: carbonResponsible
        ? carbonFirstByProject.get(String(p.id) + "|" + projectCarbonKey(carbonResponsible)) || null
        : null,
      sort_order: p.sort_order == null ? null : Number(p.sort_order),
      importance: Number.isInteger(Number(p.importance))
        ? Math.max(0, Math.min(5, Number(p.importance))) : 0,
      machines: mem.filter((m) => m.project_id === p.id && m.kind === "machine").map((m) => m.ref),
      agents: canonicalProjectAgentRefs(mem.filter((m) => m.project_id === p.id && m.kind === "agent")
        .map((m) => m.ref)),
      launches: launchRows.filter((row) => row.project_id === p.id).map((row) => ({
        machine:row.machine, platform:row.platform, runtime:row.runtime, model:row.model || "",
        selection:row.selection, persona:row.persona, session_id:row.session_id,
        updated_at:Number(row.updated_at || 0), updated_by:row.updated_by || ""
      })),
      daily_primary_agents: declarations.filter((d) => d.project_id === p.id).map((d) => ({
        day: d.day, agent: d.agent, agent_key: d.agent_key, declared_by: d.declared_by,
        statement: d.statement, updated_at: d.updated_at
      })),
      missions: misBy[String(p.id).toLowerCase()] || 0,               // vivas = en curso
      missions_pending: pendBy[String(p.id).toLowerCase()] || 0,      // encargadas y sin empezar
      created_at: p.created_at, updated_at: p.updated_at, updated_by: p.updated_by || ""
    };
  });
}
__name(listProjects, "listProjects");
// Alta o edición. Devuelve la fila guardada. `machines`/`agents`, si vienen,
// REEMPLAZAN la asignación entera (es lo que manda el formulario de Equipo).
async function upsertProject(env, b) {
  await ensureSchema(env);
  const name = String((b && b.name) || "").trim().slice(0, 80);
  let id = projectSlug((b && b.id) || name);
  if (!id) return { ok: false, error: "name (o id) requerido", status: 400 };
  const now = Date.now();
  const prev = await env.DB.prepare("SELECT * FROM projects WHERE id=?").bind(id).first();
  if (!prev && !name) return { ok: false, error: "name requerido para dar de alta", status: 400 };
  const val = (k, max, def) => {
    if (b && b[k] !== undefined && b[k] !== null) return String(b[k]).trim().slice(0, max);
    return prev ? (prev[k] || "") : (def || "");
  };
  const status = ["activo", "pausado", "archivado"].includes(String((b && b.status) || "").toLowerCase())
    ? String(b.status).toLowerCase() : (prev ? (prev.status || "activo") : "activo");
  const requestedWeb = b && b.web !== undefined && b.web !== null
    ? normalizeProjectWeb(b.web)
    : { ok: true, value: prev ? String(prev.web || "") : "" };
  if (!requestedWeb.ok) return { ok: false, error: requestedWeb.error, field: "web", status: 400 };
  const requestedSiliconResponsible = canonicalProjectAgentRef(b && b.silicon_responsible !== undefined
    ? String(b.silicon_responsible).trim().slice(0, 80)
    : b && b.primary_responsible !== undefined
      ? String(b.primary_responsible).trim().slice(0, 80)
      : val("owner", 80));
  const primaryResponsible = prev ? canonicalProjectAgentRef(prev.owner || "") : requestedSiliconResponsible;
  const carbonResponsible = prev
    ? projectCarbonResponsible(prev.carbon_responsible)
    : projectCarbonResponsible(val("carbon_responsible", 80));
  if (/\p{Cc}/u.test(carbonResponsible)) {
    return { ok: false, error: "carbon_responsible contiene caracteres de control", status: 400 };
  }
  const requestedMembers = new Map();
  for (const kind of ["machine", "agent"]) {
    const field = kind === "machine" ? "machines" : "agents";
    if (!b || !Array.isArray(b[field])) continue;
    requestedMembers.set(kind, [...new Set(b[field].map((item) => {
      const ref = String(item || "").trim().slice(0, 80);
      return kind === "agent" ? canonicalProjectAgentRef(ref) : ref;
    }).filter(Boolean))].slice(0, 60).sort());
  }
  const previousMembers = prev && requestedMembers.size
    ? (await env.DB.prepare("SELECT kind,ref FROM project_members WHERE project_id=? AND kind IN ('machine','agent')").bind(id).all()).results || []
    : [];
  const membershipChanged = [...requestedMembers].some(([kind, refs]) => {
    const current = previousMembers.filter((item) => item.kind === kind).map((item) => kind === "agent" ? canonicalProjectAgentRef(item.ref) : String(item.ref)).sort();
    return JSON.stringify(current) !== JSON.stringify(refs);
  });
  const metadataChanged = !prev || ["name", "blurb", "web", "status", "color"].some((key) => {
    const previousValue = key === "status" ? String(prev[key] || "activo") : String(prev[key] || "");
    const nextValue = key === "name" ? (name || prev.name || id)
      : key === "blurb" ? val("blurb", 240)
      : key === "web" ? requestedWeb.value
      : key === "status" ? status : val("color", 24);
    return previousValue !== nextValue;
  });
  const versionChanged = metadataChanged || membershipChanged;
  const row = {
    id, name: name || (prev && prev.name) || id,
    blurb: val("blurb", 240), web: requestedWeb.value,
    status, color: val("color", 24), owner: primaryResponsible,
    carbon_responsible: carbonResponsible,
    created_at: prev ? prev.created_at : now, updated_at: versionChanged ? now : prev.updated_at,
    updated_by: versionChanged ? String((b && b.by) || "").slice(0, 60) : String(prev.updated_by || "")
  };
  const saveProject = env.DB.prepare(PROJECT_METADATA_UPSERT_SQL)
    .bind(row.id, row.name, row.blurb, row.web, row.status, row.color, row.owner, row.carbon_responsible, row.created_at, row.updated_at, row.updated_by);
  if (!prev) {
    // D1 ejecuta el batch como transacción: el proyecto y su cursor aparecen
    // juntos. event_key UNIQUE hace inocuo repetir la misma alta tras un timeout.
    const initialStatements = [
      saveProject,
      env.DB.prepare(PROJECT_NOVELTY_INSERT_SQL).bind(projectNoveltyEventKey(row.id), row.id)
    ];
    if (row.carbon_responsible) {
      initialStatements.push(env.DB.prepare(PROJECT_CARBON_ASSIGNMENT_UPSERT_SQL)
        .bind(row.id, projectCarbonKey(row.carbon_responsible), row.carbon_responsible, now, now));
    }
    await env.DB.batch(initialStatements);
  } else {
    // Editar metadatos, responsable o estado no es una nueva alta.
    await saveProject.run();
  }
  for (const kind of ["machine", "agent"]) {
    if (!requestedMembers.has(kind)) continue;
    const refs = requestedMembers.get(kind);
    const current = previousMembers.filter((item) => item.kind === kind).map((item) => kind === "agent" ? canonicalProjectAgentRef(item.ref) : String(item.ref)).sort();
    if (prev && JSON.stringify(current) === JSON.stringify(refs)) continue;
    await env.DB.prepare("DELETE FROM project_members WHERE project_id=? AND kind=?").bind(id, kind).run();
    for (const ref of refs) {
      await env.DB.prepare("INSERT OR IGNORE INTO project_members (project_id,kind,ref,added_at) VALUES (?,?,?,?)")
        .bind(id, kind, ref, now).run();
    }
  }
  return { ok: true, created: !prev, project: (await listProjects(env)).find((p) => p.id === id) || row };
}
__name(upsertProject, "upsertProject");
// Resuelve el proyecto de una decisión/misión a su NOMBRE canónico. Si el valor
// guardado no está en el censo se devuelve tal cual (no se inventa nada): es un
// proyecto viejo escrito a mano, y mentir sobre él sería peor que enseñarlo.
function resolveProject(idx, raw) {
  const v = String(raw || "").trim();
  if (!v) return { id: "", name: "" };
  const p = idx.get(v);
  return p ? { id: p.id, name: p.name || p.id } : { id: "", name: v };
}
__name(resolveProject, "resolveProject");

// Fuente canónica de un reloj: intersección en D1 del MISMO proyecto activo
// para el agente y la máquina. Cero o más de uno son ambiguos y fallan cerrado.
async function exactDecisionProjectAssignment(env, agent, machine, requestedProjectId = "") {
  const idx = await projectIndex(env);
  const members = (await env.DB.prepare("SELECT project_id,kind,ref FROM project_members").all()).results || [];
  return selectDecisionProjectAssignment(idx.rows, members, agent, machine, requestedProjectId);
}
__name(exactDecisionProjectAssignment, "exactDecisionProjectAssignment");

// /declare es público y por eso una referencia estructurada no puede actuar como
// una credencial prestada. Antes de heredar proyecto de una misión/decisión,
// prueba que esa raíz pertenece a la misma familia de agente EN la misma máquina.
// Un id inexistente también falla cerrado: jamás cae silenciosamente a la
// declaración diaria cuando el cliente afirmó traer un contexto concreto.
async function validateDeclareCreationContext(env, body, identity) {
  const owns = (agent, machine) => sameAgentFamily(agent || "", identity.agent) &&
    memberRefMatches("machine", machine || "", identity.machine);
  const parentId = String(body && body.parent_id || "").trim().slice(0, 120);
  const missionId = String(body && body.mission_id || "").trim().slice(0, 120);
  const projectIds = [];
  if (parentId) {
    if (missionId && parentId === missionId) return { ok:false, status:400, code:"invalid_parent_context", error:"una misión no puede ser su propio parent_id" };
    const parent = await env.DB.prepare("SELECT id,assignee,loc,project_id,project FROM tickets WHERE id=?").bind(parentId).first();
    if (!parent) return { ok:false, status:400, code:"invalid_parent_context", error:"parent_id no existe" };
    if (!owns(parent.assignee, parent.loc)) return { ok:false, status:403, code:"foreign_parent_context", error:"parent_id pertenece a otro agente o máquina" };
    if (parent.project_id || parent.project) projectIds.push(String(parent.project_id || parent.project));
  }
  const batchId = String(body && body.batch_id || "").trim().slice(0, 120);
  let decisionId = String(body && body.decision_id || "").trim().slice(0, 120);
  if (batchId) {
    const batch = await env.DB.prepare("SELECT id,decision_id,agent,machine,project_id FROM mission_batches WHERE id=?").bind(batchId).first();
    if (!batch) return { ok:false, status:400, code:"invalid_decision_context", error:"batch_id no existe" };
    if (!owns(batch.agent, batch.machine)) return { ok:false, status:403, code:"foreign_decision_context", error:"batch_id pertenece a otro agente o máquina" };
    if (decisionId && batch.decision_id && decisionId !== String(batch.decision_id)) {
      return { ok:false, status:400, code:"invalid_decision_context", error:"decision_id no corresponde al batch_id" };
    }
    if (batch.project_id) projectIds.push(String(batch.project_id));
    decisionId = decisionId || String(batch.decision_id || "").trim().slice(0, 120);
  }
  if (decisionId) {
    const decision = await env.DB.prepare("SELECT id,agent,machine,project,parent_decision FROM decisions WHERE id=?").bind(decisionId).first();
    if (!decision) return { ok:false, status:400, code:"invalid_decision_context", error:"decision_id no existe" };
    if (!owns(decision.agent, decision.machine)) return { ok:false, status:403, code:"foreign_decision_context", error:"decision_id pertenece a otro agente o máquina" };
    if (decision.project) projectIds.push(String(decision.project));
    if (decision.parent_decision) {
      const root = await env.DB.prepare("SELECT id,agent,machine,project FROM decisions WHERE id=?").bind(decision.parent_decision).first();
      if (!root || !owns(root.agent, root.machine)) return { ok:false, status:403, code:"foreign_decision_context", error:"la decisión raíz pertenece a otro agente o máquina" };
      if (root.project) projectIds.push(String(root.project));
    }
  }
  return { ok:true, parent_id:parentId || null, project_ids:[...new Set(projectIds.filter(Boolean))] };
}
__name(validateDeclareCreationContext, "validateDeclareCreationContext");

// Cuando el equipo está desatendido, OnIdle usa su guard operativo propio:
// trabajo fresco/decisión viva y un máximo de 8 ventanas por día de Madrid.
// El reloj móvil horario se conserva sólo para decisiones ordinarias.
// `user_override:true` sólo lo usa el coordinador cuando Carlos lo pide de forma
// explícita (como en la ventana manual); queda visible en la respuesta del API.
// EL RELOJ DE UNA VENTANA ES CORTO A PROPÓSITO (Carlos, 2026-08-05): una vez
// lanzada hay que decidir rápido, y el tope alto invitaba a estirarlo. Antes
// el máximo era 60 minutos —tanto como la cadencia entre ventanas, que no
// tiene nada que ver— y bastaba pasar minutes:20 para dejar la flota esperando.
// Por defecto 5, techo 10. El alta OnIdle siguiente puede ser inmediata tras
// cerrar el trabajo; HOURLY_WINDOW_MS no interviene en ese ciclo.
var DECISION_MIN_DEFAULT = 5, DECISION_MIN_MAX = 10;
// A MANO SE PUEDE MÁS QUE EN AUTOMÁTICO (Carlos, 2026-08-05): el agente solo
// puede abrir 1 ventana por hora por su cuenta, pero cuando la lanza una
// PERSONA desde la pantalla caben 6 —una cada 10 minutos—. La diferencia no es
// de confianza en el agente sino de quién está mirando: si hay alguien delante,
// la cadencia la marca esa persona. Por eso `manual` exige sesión del
// perímetro: sin humano identificado no hay cupo ampliado.
var MANUAL_PER_HOUR = 6;

// ── TURNOS: LAS VENTANAS SE REPARTEN LA HORA ────────────────────────────────
// Carlos, 2026-08-07: «si hay 4 agentes que se dispare uno cada 15 minutos, si
// hay 6 uno cada 10». Con el reloj móvil a secas cada agente abría cuando le
// tocaba a él, y la flota se apelotonaba: el 07-08 seis ventanas cayeron entre
// las 10:45 y las 10:59 y luego cincuenta minutos de silencio.
//
// Cada agente recibe una FRANJA de HOURLY_WINDOW_MS/N dentro del ciclo, por
// orden canónico de su nombre. Con 4 agentes son 15 min; con 6, 10. La franja
// NO sustituye al cupo: hay que cumplir las dos cosas, seguir con su hora
// pasada Y estar en su turno.
//
// El reparto SÓLO gobierna las ventanas AUTOMÁTICAS. Cuando la lanza una
// persona, manda la persona: bloquear a quien está delante de la pantalla
// porque «no es su turno» sería convertir una ayuda en un estorbo.
async function ventanaTurno(env, agent, now) {
  // El censo de turnos son los agentes que han abierto ventana en las últimas
  // 24 h, más el que pregunta —que si no, uno nuevo no tendría franja nunca.
  const filas = ((await env.DB.prepare(
    "SELECT DISTINCT agent FROM decisions WHERE (parent_decision IS NULL OR parent_decision='') AND created_at > ?"
  ).bind(now - 24 * 3600000).all()).results) || [];
  // Sólo identidades reales: un marcador de posición («—», vacío) inflaba el
  // censo y descuadraba el reparto de todos.
  // Un nombre de agente EMPIEZA POR LETRA. Con eso caen los comodines («—»,
  // «-», «?», vacío) sin inventar un mínimo de longitud que dejaría fuera a una
  // identidad corta legítima.
  const real = (v) => /^[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(String(v || "").trim());
  const censo = [...new Set(filas.map((r) => String(r.agent || "").trim()).filter(real)
    .concat(real(agent) ? [String(agent).trim()] : []))]
    .sort((a, b) => a.localeCompare(b, "es"));
  const n = Math.max(1, censo.length);
  const paso = Math.max(60000, Math.floor(HOURLY_WINDOW_MS / n));
  const idx = Math.max(0, censo.indexOf(agent));
  const offset = idx * paso;
  const dentro = now % HOURLY_WINDOW_MS;
  const enTurno = dentro >= offset && dentro < offset + paso;
  // Próximo instante en que le toca: si su franja de este ciclo ya pasó, la del
  // siguiente.
  const inicioCiclo = now - dentro;
  const proximo = dentro < offset ? inicioCiclo + offset
    : (enTurno ? now : inicioCiclo + HOURLY_WINDOW_MS + offset);
  return { censo, n, paso, idx, offset, enTurno, proximo };
}
__name(ventanaTurno, "ventanaTurno");
var HOURLY_WINDOW_MS = 60 * 60 * 1000;   // cadencia ENTRE ventanas, no duración de una
function madridHourKey(ms) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23"
  }).formatToParts(ms);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}`;
}
__name(madridHourKey, "madridHourKey");
__name(ensureSchema, "ensureSchema");

// La PRUEBA en un solo formato, decidida en un solo sitio (FLT-988 b2). Antes cada
// endpoint aplicaba su propio /^https?:\/\//: /fleet/informe devolvía 400 y
// /fleet/task-status TIRABA la imagen en silencio (ok:true con image:null), de ahí
// que el pantallazo hubiera que escribirlo aparte en D1. Ahora hay una función:
// devuelve {value} si vale, {error} con el motivo si no. Se aceptan URL http(s) y
// data:image/… en base64 (una captura pegada tal cual).
function normalizeProofImage(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return { value: null, error: "vacía" };
  if (/^https?:\/\/\S+$/i.test(s)) {
    if (s.length > 500) return { value: null, error: "la URL pasa de 500 caracteres; acórtala" };
    return { value: s, error: null };
  }
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(s)) {
    // Sin recorte mudo: una captura embebida cortada a 500 caracteres sería una
    // imagen rota que dice ser una prueba. O entra entera, o se rechaza con motivo.
    if (s.length > 2e5) return { value: null, error: "la captura embebida pesa " + Math.round(s.length / 1024) + " KB y el máximo son 195 KB: súbela y manda su URL http(s)" };
    return { value: s, error: null };
  }
  if (/^\//.test(s) || /^[a-z]:\\/i.test(s) || /^file:/i.test(s)) {
    return { value: null, error: "es una ruta local («" + s.slice(0, 80) + "»), y una ruta del disco de un agente no la puede ver nadie más: sube la captura y manda su URL http(s), o pega un data:image/…;base64" };
  }
  return { value: null, error: "no es una URL http(s) ni un data:image/…;base64 («" + s.slice(0, 80) + "»)" };
}
__name(normalizeProofImage, "normalizeProofImage");

function embeddedImageMatchesMime(value) {
  const match = /^data:image\/(png|jpe?g|gif|webp|avif);base64,([a-z0-9+/=\s]+)$/i.exec(value);
  if (!match) return false;
  let bytes;
  try {
    const binary = atob(match[2].replace(/\s/g, ""));
    bytes = Uint8Array.from(binary.slice(0, 32), (char) => char.charCodeAt(0));
  } catch (e) { return false; }
  const mime = match[1].toLowerCase();
  if (mime === "png") return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v);
  if (mime === "jpg" || mime === "jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "gif") return bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)).startsWith("GIF8");
  if (mime === "webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (mime === "avif") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" && /^(avif|avis)$/.test(String.fromCharCode(...bytes.slice(8, 12)));
  return false;
}
__name(embeddedImageMatchesMime, "embeddedImageMatchesMime");

function imageBytesMatchMime(contentType, buffer) {
  const mime = String(contentType || "").split(";")[0].trim().toLowerCase().replace(/^image\//, "");
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
  if (mime === "png") return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v);
  if (mime === "jpg" || mime === "jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "gif") return bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)).startsWith("GIF8");
  if (mime === "webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (mime === "avif") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" && /^(avif|avis)$/.test(String.fromCharCode(...bytes.slice(8, 12)));
  return false;
}
__name(imageBytesMatchMime, "imageBytesMatchMime");

function unsafeEvidenceHost(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".local")) return true;
  if (/^(127\.|0\.|10\.|169\.254\.|192\.168\.|::1$|fc|fd|fe80)/.test(h)) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  return !!(m && Number(m[1]) === 172 && Number(m[2]) >= 16 && Number(m[2]) <= 31);
}
__name(unsafeEvidenceHost, "unsafeEvidenceHost");

async function validateProofImage(env, raw, origin) {
  const norm = normalizeProofImage(raw);
  if (!norm.value) return norm;
  if (norm.value.startsWith("data:")) {
    return embeddedImageMatchesMime(norm.value) ? norm : { value: null, error: "el data:image no contiene la firma binaria declarada" };
  }
  let parsed;
  try { parsed = new URL(norm.value); } catch (e) { return { value: null, error: "URL de imagen inválida" }; }
  // EL WORKER RESPONDE EN VARIOS NOMBRES Y NO SE RECONOCIA A SI MISMO (2026-09-02).
  // La captura se sube a api.yokup.com (es lo que usa mission-evidence.sh) pero el
  // cierre se pide por yokup-rtc.*.workers.dev (lo que usa bot-inbox-paso.sh), asi que
  // `own` salia false y el worker intentaba VERIFICAR SU PROPIA URL con un fetch a si
  // mismo: la subpeticion revienta y el agente recibe «no se pudo verificar el contenido
  // de la URL de prueba» con una imagen que responde 200 y es correcta. Cierre bloqueado
  // sin que nada este mal. Ya habia un missionProofOrigin que conocia los dos nombres,
  // pero solo lo usaba UN sitio: los cuatro endpoints vivos pasaban url.origin a pelo.
  // Se decide aqui, en la validacion, para que no dependa de que cada llamada acierte.
  let own = OWN_MEDIA_ORIGINS.has(parsed.origin);
  if (!own) { try { own = parsed.origin === new URL(origin).origin; } catch (e) {} }
  if (own && /^\/media\/fleet\//.test(parsed.pathname)) {
    if (!env.MEDIA) return { value: null, error: "no se puede comprobar el objeto: bucket MEDIA no disponible" };
    const key = decodeURIComponent(parsed.pathname.replace(/^\/media\//, ""));
    const object = await env.MEDIA.head(key);
    const type = object && object.httpMetadata && object.httpMetadata.contentType || object && object.customMetadata && object.customMetadata.ct || "";
    return object && /^image\//i.test(type) ? norm : { value: null, error: "la URL de media propia no existe o no es una imagen" };
  }
  if (unsafeEvidenceHost(parsed.hostname)) return { value: null, error: "host local o privado no permitido como prueba" };
  try {
    const response = await fetch(parsed.toString(), { method: "GET", redirect: "error", headers: { Range: "bytes=0-31" } });
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !/^image\//i.test(type)) return { value: null, error: "la URL no responde con content-type image/*" };
    const bytes = await response.arrayBuffer();
    if (!imageBytesMatchMime(type, bytes)) return { value: null, error: "los bytes de la URL no corresponden a su content-type de imagen" };
    return norm;
  } catch (e) {
    return { value: null, error: "no se pudo verificar el contenido de la URL de prueba" };
  }
}
__name(validateProofImage, "validateProofImage");

// FLT-1007 c — La tubería de /fleet/media solo tragaba image/* («solo imágenes»), así
// que el Kit de venta del Consejo (audio de la charla, vídeo y briefing en PDF) se
// quedaba fuera. Aquí, en UN único sitio testeable, se decide qué content-type entra y
// con qué extensión coherente se guarda el objeto R2. Se admite imagen, audio de m4a
// (audio/mp4 y audio/x-m4a, con el alias audio/m4a por si acaso), vídeo mp4 y PDF; el
// resto se rechaza con motivo (no en silencio). Devuelve {ok, ext} o {ok:false, error}.
var FLEET_MEDIA_MAX = 80 * 1024 * 1024;
function fleetMediaKind(ct) {
  const t = String(ct == null ? "" : ct).split(";")[0].trim().toLowerCase();
  if (!t) return { ok: false, error: "sin content-type: mándalo en la cabecera (image/*, audio/mp4|x-m4a, video/mp4 o application/pdf)" };
  if (/^image\//.test(t)) {
    const ext = (t.split("/")[1] || "png").replace(/[^a-z0-9]/g, "") || "png";
    return { ok: true, ext, ct: t };
  }
  if (t === "audio/mp4" || t === "audio/x-m4a" || t === "audio/m4a") return { ok: true, ext: "m4a", ct: t };
  if (t === "video/mp4") return { ok: true, ext: "mp4", ct: t };
  if (t === "application/pdf") return { ok: true, ext: "pdf", ct: t };
  return { ok: false, error: "content-type no admitido («" + t + "»): solo image/*, audio/mp4|x-m4a, video/mp4 o application/pdf" };
}
__name(fleetMediaKind, "fleetMediaKind");

// Las referencias numéricas históricas siguen entrando como FLT-<n>, pero los ids
// alfanuméricos de tandas (MIS-DEC-...) son opacos: cambiarles el case rompe la
// clave primaria y hace que una misión existente parezca ausente.
function normalizeMissionReference(raw) {
  const value = String(raw == null ? "" : raw).trim();
  if (/^#?\d+$/.test(value)) return "FLT-" + value.replace(/^#/, "");
  const fleet = /^flt-(\d+)$/i.exec(value);
  return fleet ? "FLT-" + fleet[1] : value;
}
__name(normalizeMissionReference, "normalizeMissionReference");

function validateMissionActor(ticket, rawActor) {
  const actor = String(rawActor || "").trim().slice(0, 80);
  const expected = String(ticket && ticket.assignee || "").trim();
  if (!actor) return { ok: false, actor, expected, error: "owner requerido para atribuir la evidencia" };
  if (!expected) return { ok: false, actor, expected, error: "la misión no tiene assignee validable" };
  if (expected && !sameAgentFamily(actor, expected)) {
    return { ok: false, actor, expected, error: "owner no pertenece a la persona asignada a la misión" };
  }
  const actorId = parseAgentIdentity(actor), expectedId = parseAgentIdentity(expected);
  const expectedSuffix = expectedId.suffix || machineSuffix(ticket && ticket.loc);
  if (expectedSuffix && actorId.suffix !== expectedSuffix) {
    return { ok: false, actor, expected, error: "owner no pertenece al equipo físico asignado a la misión" };
  }
  return { ok: true, actor, expected };
}
__name(validateMissionActor, "validateMissionActor");

// La hora procede del capturador, no de la recepción HTTP. Sólo una captura
// reciente puede presentarse como proceso vivo; se toleran 30 s de desfase futuro.
function normalizeLiveCaptureTime(raw, now = Date.now()) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return { value: null, error: "captured_at requerido (epoch ms)" };
  if (value > now + 3e4) return { value: null, error: "captured_at está en el futuro" };
  if (value < now - 2 * 60 * 1e3) return { value: null, error: "captured_at tiene más de 2 minutos" };
  return { value: Math.trunc(value), error: null };
}
__name(normalizeLiveCaptureTime, "normalizeLiveCaptureTime");

// Las procedencias canónicas de una captura de PROCESO. Cada superficie admite un
// único contexto: la pareja es el contrato, no dos campos sueltos.
//
// `agent/session_transcript` (Carlos, 2026-08-07) existe porque exigir Desktop al
// frente era una carrera contra las manos del dueño de la máquina: entre dos
// intentos seguidos el frente fue Telegram y luego Chrome, y el cierre se cayó dos
// veces sin que nadie hiciera nada mal. Y dejaba fuera a todo agente que trabaja
// sin GUI —cron, remoto, subagente— o simplemente mientras el ordenador se usa,
// que en una flota es el caso normal, no la excepción.
//
// El pane de tmux nunca fue la prueba: es el papel donde se imprime. Lo que
// acredita es el TEXTO —petición, comando y salida— y la identidad del runtime que
// lo firma. Exigir además foco de ventana no compra nada contra un agente
// deshonesto (quien puede falsear el transcript puede falsear igual el contenido
// del pane que él mismo controla) y lo cuesta todo a los honestos.
var PROCESS_CAPTURE_PAIRS = { desktop: "request", cli: "command_output", agent: "session_transcript" };
var PROCESS_CONTEXT_ERRORS = {
  desktop: "Desktop exige capture_context=request: la petición debe ser visible",
  cli: "CLI exige capture_context=command_output: comando y salida deben ser visibles",
  agent: "Agent exige capture_context=session_transcript: la petición, el comando y su salida deben leerse en la captura"
};
function validateProcessCaptureProvenance(kind, rawSurface, rawContext) {
  if (kind !== "process") return { ok:true, surface:null, context:null };
  const surface = String(rawSurface || "").trim().toLowerCase();
  const context = String(rawContext || "").trim().toLowerCase();
  const missing = [];
  if (!surface) missing.push("capture_surface");
  if (!context) missing.push("capture_context");
  if (missing.length) return { ok:false, code:"process_provenance_missing", field:missing[0], missing,
    error:"evidence_kind=process exige capture_surface y capture_context" };
  const expected = PROCESS_CAPTURE_PAIRS[surface];
  if (!expected) return { ok:false, code:"process_surface_invalid", field:"capture_surface",
    error:"capture_surface debe ser desktop, cli o agent; web/result_page no son proceso" };
  if (context !== expected) return { ok:false, code:"process_context_invalid", field:"capture_context",
    error:PROCESS_CONTEXT_ERRORS[surface] };
  return { ok:true, surface, context };
}
__name(validateProcessCaptureProvenance, "validateProcessCaptureProvenance");

function validateMissionProcessEvidence(ticket, now = Date.now()) {
  if (!ticket || ticket.live_kind !== "process" || !String(ticket.live_shot || "").trim()) {
    return { ok:false, code:"process_evidence_missing", field:"process_evidence",
      error:"no se puede cerrar: falta una captura de proceso real; final-fallback no sustituye el proceso" };
  }
  const provenance = validateProcessCaptureProvenance("process", ticket.live_surface, ticket.live_context);
  if (!provenance.ok) return { ...provenance, code:"process_evidence_invalid", field:"process_evidence",
    error:"no se puede cerrar: la captura de proceso guardada no tiene procedencia canónica (desktop/request, cli/command_output o agent/session_transcript)" };
  const capturedAt = Number(ticket.live_at), rawCreated = Number(ticket.created_at);
  const createdAt = rawCreated > 0 && rawCreated < 4102444800 ? rawCreated * 1000 : rawCreated;
  if (!Number.isFinite(capturedAt) || capturedAt <= 0 || !Number.isFinite(createdAt) || createdAt <= 0 ||
      capturedAt < createdAt || capturedAt > now + 3e4) {
    return { ok:false, code:"process_evidence_outside_mission", field:"process_evidence",
      error:"no se puede cerrar: la captura de proceso debe pertenecer al intervalo real de la misión" };
  }
  return { ok:true, captured_at:capturedAt, surface:provenance.surface, context:provenance.context };
}
__name(validateMissionProcessEvidence, "validateMissionProcessEvidence");

// Los agentes conocen el número del encargo del bot-inbox (#1036), no siempre el
// id interno de Yokup. Si FLT-1036 ya estaba ocupado, fleetMissionId conserva el
// reparto real en fleet_ids (p. ej. #1036 → FLT-1045). Toda entrada pública de la
// flota debe consultar ese reparto antes de caer al FLT-<n> histórico.
async function resolveFleetMissionReference(env, raw) {
  const value = String(raw == null ? "" : raw).trim();
  const numeric = /^#?(\d+)$/.exec(value);
  if (numeric) {
    const n = Number(numeric[1]);
    const mapped = await env.DB.prepare("SELECT mission_id FROM fleet_ids WHERE inbox_id=?")
      .bind(n).first();
    if (mapped && mapped.mission_id) return mapped.mission_id;
    // EL RESPALDO A FLT-<n> NO PUEDE PISAR LA MISION DE OTRO ENCARGO (2026-09-02).
    // El respaldo asume que el encargo N nacio como FLT-N, y eso solo vale mientras
    // las numeraciones no se separen. Ya se separaron: FLT-1515 nacio del encargo
    // #1487, y el encargo #1515 —una consulta de status-web— no tiene mision ninguna.
    // Asi que al informar del #1515 el informe se fue contra FLT-1515, que es de otro
    // agente. Hoy solo lo freno un owner_mismatch; si esa mision hubiera sido del
    // mismo agente, el informe se habria escrito en la mision equivocada sin que
    // saltara nada. Cuando SABEMOS que FLT-<n> nacio de otro encargo, no se adivina.
    const ajena = await env.DB.prepare("SELECT inbox_id FROM fleet_ids WHERE mission_id=?")
      .bind("FLT-" + n).first();
    if (ajena && Number(ajena.inbox_id) !== n) return "";
  }
  return normalizeMissionReference(value);
}
__name(resolveFleetMissionReference, "resolveFleetMissionReference");

async function hasMissionProof(env, mid) {
  const row = await env.DB.prepare(
    "SELECT proof_image,proof_kind FROM tickets WHERE id=?"
  ).bind(mid).first();
  if (row && row.proof_image && row.proof_kind === "final") {
    return !!(await validateProofImage(env, row.proof_image, missionProofOrigin(row.proof_image))).value;
  }
  const task = await env.DB.prepare(
    "SELECT image FROM mission_tasks WHERE mission_id=? AND image_kind='final' AND image IS NOT NULL AND image<>'' ORDER BY updated_at DESC LIMIT 1"
  ).bind(mid).first();
  return !!(task && task.image);
}
__name(hasMissionProof, "hasMissionProof");

async function hasCanonicalFleetClosure(env, mid) {
  if (!(await hasMissionProof(env, mid))) return false;
  const tasks = await listMissionTasks(env, mid);
  return tasks.some((task) => task.code === "z1" && task.status === "done" && String(task.report || "").trim()) &&
    tasks.every((task) => task.status === "done" && String(task.report || "").trim());
}
__name(hasCanonicalFleetClosure, "hasCanonicalFleetClosure");

// EL ÚNICO PUNTO DONDE LA PRUEBA ASCIENDE (FLT-989 a3/b1). Da igual por dónde se
// cierre la misión —agente (/fleet/task-status), web (chips de /misiones) o cron
// (fleetReconcile*/fleetSync)—: si la ficha aún no tiene proof_image y hay captura
// de RESPALDO en algún paso (mission_tasks.image, el mismo criterio que acepta
// hasMissionProof: la más reciente), se sube a tickets.proof_image. Así una misión
// cerrada por respaldo NO sale finalizada con el logotipo de relleno (nacían las
// huérfanas FLT-826/830). Idempotente: si ya hay prueba no la pisa, y hay un único
// criterio de qué imagen asciende. Devuelve la imagen vigente (o null).
async function ascendMissionProof(env, mid) {
  const t = await env.DB.prepare("SELECT proof_image FROM tickets WHERE id=?").bind(mid).first();
  if (t && t.proof_image) return t.proof_image;   // ya tiene prueba propia → no se toca
  const task = await env.DB.prepare(
    "SELECT image FROM mission_tasks WHERE mission_id=? AND image_kind='final' AND image IS NOT NULL AND image<>'' ORDER BY updated_at DESC LIMIT 1"
  ).bind(mid).first();
  if (!(task && task.image)) return null;         // no hay respaldo que subir
  await env.DB.prepare(
    "UPDATE tickets SET proof_image=?,proof_kind='final',updated_at=? WHERE id=? AND (proof_image IS NULL OR proof_image='' OR proof_kind!='final')"
  ).bind(task.image, Date.now(), mid).run();
  return task.image;
}
__name(ascendMissionProof, "ascendMissionProof");

// ---- TANDAS DE MISIONES DESDE RELOJES DE DECISIÓN -------------------------
// La decisión inicial ofrece tres misiones + «Volver atrás» + «Custom».
// Las continuaciones sólo reordenan sus 1..2 elementos aún queued. Nunca se
// materializan pendientes como tickets ni se recuperan elementos completados.
function isBackOption(option) {
  return /volver\s+atr[aá]s|no\s+iniciar/i.test(String(option || ""));
}
__name(isBackOption, "isBackOption");
function isCustomOption(option) {
  return /custom|personalizad|escribe\s+la\s+mejora/i.test(String(option || ""));
}
__name(isCustomOption, "isCustomOption");
function isInitialMissionDecision(options) {
  return Array.isArray(options) && options.length === 5 && isBackOption(options[3]) && isCustomOption(options[4]);
}
__name(isInitialMissionDecision, "isInitialMissionDecision");
function isContinuationMissionDecision(options, decision) {
  // parent_decision es el discriminante persistente. La decisión inicial recibe
  // batch_id al resolverse, pero nunca debe convertirse por ello en continuación.
  return !!(decision && decision.parent_decision) &&
    Array.isArray(options) && options.length >= 2 && options.length <= 3 && isBackOption(options[options.length - 1]);
}
__name(isContinuationMissionDecision, "isContinuationMissionDecision");
function isMissionDecision(options, decision) {
  // Una ventana de formación NUNCA materializa misiones, y desde el 9-ago-2026 no
  // basta con que su forma no encaje: al pasar de una opción a tres —las tres
  // temáticas—, `isContinuationMissionDecision` sólo la descarta porque ninguna
  // temática se llama «volver atrás». Eso es un accidente del texto, no una
  // garantía: bastaría una opción redactada distinto para convertir 24 ventanas
  // diarias en 24 misiones fantasma. Se garantiza por NOMBRE.
  if (decision && decision.parent_decision === ACADEMY_DECISION_PARENT) return false;
  return isInitialMissionDecision(options) || isContinuationMissionDecision(options, decision);
}
__name(isMissionDecision, "isMissionDecision");
function batchIdForDecision(decisionId) {
  return "BATCH-" + String(decisionId || "").replace(/[^A-Za-z0-9_-]/g, "-");
}
__name(batchIdForDecision, "batchIdForDecision");
function missionIdForBatchItem(batchId, position) {
  return "MIS-" + String(batchId || "").replace(/^BATCH-/, "").slice(0, 42) + "-" + String(position + 1).padStart(2, "0");
}
__name(missionIdForBatchItem, "missionIdForBatchItem");
function orderedMissionOptions(options, chosen) {
  const initial = isInitialMissionDecision(options);
  if (initial) {
    if (chosen === 4) {
      return [{ position: 0, option_index: 4, title: String(options[4] || "").replace(/^\s*✍️\s*custom\s*[:·-]?\s*/i, "").slice(0, 200) }];
    }
    if (!(chosen >= 0 && chosen <= 2)) return [];
    return [{ position: 0, option_index: chosen, title: String(options[chosen] || "").slice(0, 200) }];
  }
  const count = options.length - 1;
  if (!(chosen >= 0 && chosen < count)) return [];
  const out = [];
  for (let position = 0; position < count; position++) {
    const optionIndex = (chosen + position) % count;
    out.push({ position, option_index: optionIndex, title: String(options[optionIndex] || "").slice(0, 200) });
  }
  return out;
}
__name(orderedMissionOptions, "orderedMissionOptions");
function normalizeDecisionOptionTargets(raw, options, continuation = false) {
  if (raw == null || raw === "") return { ok:true, targets:Array((options || []).length).fill(null) };
  let source = raw;
  if (typeof source === "string") {
    try { source = JSON.parse(source); } catch (e) {
      return { ok:false, code:"invalid_option_targets", error:"option_targets debe ser JSON estructurado" };
    }
  }
  if (!Array.isArray(source) || source.length !== (options || []).length) {
    return { ok:false, code:"invalid_option_targets", error:"option_targets debe alinearse exactamente con options" };
  }
  const targets = [], seen = new Set();
  for (let index = 0; index < source.length; index++) {
    const entry = source[index];
    if (entry == null || entry === "") { targets.push(null); continue; }
    if (continuation || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok:false, code:"invalid_option_targets", error:"cada referencia inicial debe ser null o {target_mission_id}" };
    }
    const keys = Object.keys(entry);
    const id = String(entry.target_mission_id || "").trim();
    if (keys.length !== 1 || keys[0] !== "target_mission_id" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(id)) {
      return { ok:false, code:"invalid_option_target", error:"target_mission_id exacto requerido" };
    }
    // Las opciones 4/5 son controles, nunca trabajo enlazable.
    if (index > 2 || seen.has(id)) {
      return { ok:false, code:"ambiguous_option_target", error:"cada mejora debe referenciar como máximo una misión canónica distinta" };
    }
    seen.add(id); targets.push({ target_mission_id:id });
  }
  return { ok:true, targets };
}
__name(normalizeDecisionOptionTargets, "normalizeDecisionOptionTargets");
async function validateDecisionOptionTargets(env, targets, projectId, batchId = "") {
  for (const targetRef of (targets || []).filter(Boolean)) {
    const targetId = targetRef.target_mission_id;
    const target = await env.DB.prepare(
      "SELECT id,status,project,project_id,assignee,loc,source FROM tickets WHERE id=?"
    ).bind(targetId).first();
    if (!target) return { ok:false, status:400, code:"invalid_option_target", error:"target_mission_id no existe: " + targetId };
    if (target.status === "cancelled" || target.status === "resolved") {
      return { ok:false, status:409, code:"option_target_closed", error:"la misión referenciada ya está cerrada: " + targetId };
    }
    if (String(target.project_id || target.project || "") !== String(projectId || "")) {
      return { ok:false, status:400, code:"option_target_project_mismatch", error:"la misión referenciada pertenece a otro proyecto" };
    }
    const linked = await env.DB.prepare(
      "SELECT batch_id FROM mission_batch_items WHERE (target_mission_id=? OR mission_id=?) AND status='active' AND batch_id!=? LIMIT 1"
    ).bind(targetId, targetId, batchId || "").first();
    if (linked) return { ok:false, status:409, code:"option_target_already_active", error:"la misión referenciada ya está activa en otra tanda" };
  }
  return { ok:true };
}
__name(validateDecisionOptionTargets, "validateDecisionOptionTargets");
function continuationMissionOrder(options, chosen, queuedItems) {
  if (!Array.isArray(queuedItems) || !isContinuationMissionDecision(options, { parent_decision: "linked" })) return [];
  const byTitle = new Map();
  for (const item of queuedItems) {
    const key = String(item && item.title || "").trim().toLocaleLowerCase("es");
    if (!key || byTitle.has(key)) return [];
    byTitle.set(key, item);
  }
  const ordered = [];
  for (const option of orderedMissionOptions(options, chosen)) {
    const key = String(option.title || "").trim().toLocaleLowerCase("es");
    const item = byTitle.get(key);
    if (!item || ordered.includes(item)) return [];
    ordered.push(item);
  }
  return ordered.length === queuedItems.length ? ordered : [];
}
__name(continuationMissionOrder, "continuationMissionOrder");
function remainingBatchItems(items) {
  return (items || []).filter((item) => item.status === "queued" && item.ticket_status !== "resolved" && item.ticket_status !== "cancelled");
}
__name(remainingBatchItems, "remainingBatchItems");
async function reconcileQueuedBatchItems(env, batchId) {
  const rows = await env.DB.prepare(
    "SELECT i.*,t.status AS ticket_status FROM mission_batch_items i LEFT JOIN tickets t ON t.id=i.mission_id WHERE i.batch_id=? AND i.status='queued' ORDER BY i.position"
  ).bind(batchId).all();
  const stale = (rows.results || []).filter((item) => item.ticket_status === "resolved" || item.ticket_status === "cancelled");
  if (stale.length) {
    await env.DB.batch(stale.map((item) => env.DB.prepare(
      "UPDATE mission_batch_items SET status=?,updated_at=? WHERE batch_id=? AND position=? AND status='queued'"
    ).bind(item.ticket_status === "cancelled" ? "cancelled" : "completed", Date.now(), batchId, item.position)));
  }
  return remainingBatchItems(rows.results || []);
}
__name(reconcileQueuedBatchItems, "reconcileQueuedBatchItems");
function batchMissionPlan(title, agent, machine) {
  const short = String(title || "Misión").slice(0, 70);
  const owner = reportAgentIdentity(agent, machine) || agent || "Agente";
  return [
    { code: "a", title: "Implementar: " + short, owner, executor:scopedAgentIdentity(owner, machine, "sub") },
    { code: "b", title: "Verificar y entregar evidencia: " + short, owner, executor:scopedAgentIdentity(owner, machine, "sub") },
    { code: "c", title: "Documentar informe factual autorizado", owner, executor:scopedAgentIdentity(owner, machine, "infra") }
  ];
}
__name(batchMissionPlan, "batchMissionPlan");
async function missionBatchSnapshot(env, batchId) {
  await reconcileQueuedBatchItems(env, batchId);
  const batch = await env.DB.prepare("SELECT * FROM mission_batches WHERE id=?").bind(batchId).first();
  if (!batch) return null;
  const { results } = await env.DB.prepare(
    "SELECT batch_id,position,option_index,title,mission_id,target_mission_id,status,created_at,updated_at FROM mission_batch_items WHERE batch_id=? ORDER BY position"
  ).bind(batchId).all();
  return { ...batch, items: results || [] };
}
__name(missionBatchSnapshot, "missionBatchSnapshot");
// HISTÓRICO DE DECISIONES EN BLOQUE (FLT-1015). /decisions puede enseñar 40
// relojes de misión por página. Resolver cada carrusel con
// missionBatchSnapshot() hacía 3 consultas D1 por ficha (JOIN de reconciliación
// + batch + items): 38 fichas reales = 114 round-trips y 3–6 s de espera.
// Esta variante conserva la reconciliación, pero agrupa toda la página en tres
// lecturas y un único batch de escrituras sólo cuando encuentra filas obsoletas.
async function missionBatchSnapshots(env, batchIds) {
  const ids = [...new Set((batchIds || []).map((id) => String(id || "")).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;
  const joined = await selectIn(env, ids, (ph) =>
    `SELECT i.batch_id,i.position,i.status,t.status AS ticket_status
     FROM mission_batch_items i LEFT JOIN tickets t ON t.id=i.mission_id
     WHERE i.batch_id IN (${ph}) AND i.status='queued'`
  );
  const stale = joined.filter((item) => item.ticket_status === "resolved" || item.ticket_status === "cancelled");
  if (stale.length) {
    const now = Date.now();
    await env.DB.batch(stale.map((item) => env.DB.prepare(
      "UPDATE mission_batch_items SET status=?,updated_at=? WHERE batch_id=? AND position=? AND status='queued'"
    ).bind(item.ticket_status === "cancelled" ? "cancelled" : "completed", now, item.batch_id, item.position)));
  }
  const batches = await selectIn(env, ids, (ph) =>
    `SELECT * FROM mission_batches WHERE id IN (${ph})`
  );
  const items = await selectIn(env, ids, (ph) =>
    `SELECT batch_id,position,option_index,title,mission_id,target_mission_id,status,created_at,updated_at
     FROM mission_batch_items WHERE batch_id IN (${ph}) ORDER BY batch_id,position`
  );
  const byBatch = new Map();
  for (const item of items) {
    if (!byBatch.has(item.batch_id)) byBatch.set(item.batch_id, []);
    byBatch.get(item.batch_id).push(item);
  }
  for (const batch of batches) out.set(batch.id, { ...batch, items: byBatch.get(batch.id) || [] });
  return out;
}
__name(missionBatchSnapshots, "missionBatchSnapshots");
async function batchClosureAccepted(env, missionId) {
  const row = await env.DB.prepare(
    "SELECT 1 AS accepted FROM events WHERE ticket_id=? AND kind='accept' LIMIT 1"
  ).bind(missionId).first();
  return !!row;
}
__name(batchClosureAccepted, "batchClosureAccepted");
async function pauseMissionBatch(env, batchId, reason) {
  const now = Date.now();
  await env.DB.prepare("UPDATE mission_batches SET status='paused', pause_reason=?, updated_at=? WHERE id=? AND status='active'")
    .bind(String(reason || "Pausada por decisión del Agente").slice(0, 300), now, batchId).run();
  return missionBatchSnapshot(env, batchId);
}
__name(pauseMissionBatch, "pauseMissionBatch");
async function batchForMission(env, missionId) {
  const row = await env.DB.prepare("SELECT batch_id FROM mission_batch_items WHERE mission_id=? LIMIT 1").bind(missionId).first();
  return row ? row.batch_id : null;
}
__name(batchForMission, "batchForMission");
async function completeBatchMissionAndAwaitContinuation(env, batchId, missionId) {
  const item = await env.DB.prepare(
    "SELECT * FROM mission_batch_items WHERE batch_id=? AND mission_id=? LIMIT 1"
  ).bind(batchId, missionId).first();
  if (!item || item.status === "completed") return missionBatchSnapshot(env, batchId);
  if (item.status !== "active") return missionBatchSnapshot(env, batchId);
  const ticket = await env.DB.prepare("SELECT status FROM tickets WHERE id=?").bind(missionId).first();
  if (!ticket || ticket.status !== "resolved" || !(await batchClosureAccepted(env, missionId))) {
    return missionBatchSnapshot(env, batchId);
  }
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE mission_batch_items SET status='completed',updated_at=? WHERE batch_id=? AND mission_id=? AND status='active'"
    ).bind(now, batchId, missionId),
    env.DB.prepare(
      "UPDATE mission_batches SET active_mission_id=NULL,updated_at=? WHERE id=? AND active_mission_id=?"
    ).bind(now, batchId, missionId)
  ]);
  const remaining = await reconcileQueuedBatchItems(env, batchId);
  if (!remaining.length) {
    await env.DB.prepare(
      "UPDATE mission_batches SET status='completed',pause_reason=NULL,active_mission_id=NULL,updated_at=? WHERE id=?"
    ).bind(Date.now(), batchId).run();
  } else {
    await env.DB.prepare(
      "UPDATE mission_batches SET status='awaiting_continuation',pause_reason=?,active_mission_id=NULL,updated_at=? WHERE id=?"
    ).bind("Esperando una nueva decisión de 5 minutos con las misiones restantes.", Date.now(), batchId).run();
  }
  return missionBatchSnapshot(env, batchId);
}
__name(completeBatchMissionAndAwaitContinuation, "completeBatchMissionAndAwaitContinuation");
async function reconcileBatchTargetMission(env, targetMissionId) {
  const targetId = String(targetMissionId || "").trim().slice(0, 120);
  if (!targetId) return { ok:false, code:"target_mission_required", applied:false };
  const links = (await env.DB.prepare(
    "SELECT i.*,b.decision_id,b.project_id,b.status AS batch_status,b.active_mission_id " +
    "FROM mission_batch_items i JOIN mission_batches b ON b.id=i.batch_id " +
    "WHERE i.target_mission_id=? AND i.status='active'"
  ).bind(targetId).all()).results || [];
  if (!links.length) return { ok:true, target_mission_id:targetId, applied:false, linked:false };
  if (links.length !== 1) {
    for (const link of links) await pauseMissionBatch(env, link.batch_id, "Referencia canónica ambigua: enlazada a más de una tanda activa.");
    return { ok:false, code:"target_mission_ambiguous", target_mission_id:targetId, applied:false };
  }
  const link = links[0];
  if (link.active_mission_id !== targetId || link.mission_id !== targetId) {
    await pauseMissionBatch(env, link.batch_id, "Referencia canónica incoherente con active_mission_id.");
    return { ok:false, code:"target_mission_inconsistent", target_mission_id:targetId, applied:false };
  }
  const target = await env.DB.prepare("SELECT id,status,project,project_id FROM tickets WHERE id=?").bind(targetId).first();
  if (!target || String(target.project_id || target.project || "") !== String(link.project_id || "")) {
    await pauseMissionBatch(env, link.batch_id, "La misión canónica falta o cambió de proyecto.");
    return { ok:false, code:"invalid_target_mission", target_mission_id:targetId, applied:false };
  }
  if (target.status === "cancelled") {
    await pauseMissionBatch(env, link.batch_id, "La misión canónica adoptada fue cancelada.");
    return { ok:false, code:"target_mission_cancelled", target_mission_id:targetId, applied:false };
  }
  if (target.status !== "resolved") {
    return { ok:true, target_mission_id:targetId, batch_id:link.batch_id, applied:false, linked:true, status:target.status };
  }
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE mission_batch_items SET status='completed',updated_at=? WHERE batch_id=? AND target_mission_id=? AND mission_id=? AND status='active'"
    ).bind(now, link.batch_id, targetId, targetId),
    env.DB.prepare(
      "UPDATE mission_batches SET active_mission_id=NULL,updated_at=? WHERE id=? AND active_mission_id=?"
    ).bind(now, link.batch_id, targetId)
  ]);
  const remaining = await reconcileQueuedBatchItems(env, link.batch_id);
  if (!remaining.length) {
    await env.DB.prepare(
      "UPDATE mission_batches SET status='completed',pause_reason=NULL,active_mission_id=NULL,updated_at=? WHERE id=?"
    ).bind(Date.now(), link.batch_id).run();
  } else {
    await env.DB.prepare(
      "UPDATE mission_batches SET status='awaiting_continuation',pause_reason=?,active_mission_id=NULL,updated_at=? WHERE id=?"
    ).bind("La misión canónica terminó; esperando una nueva decisión con el trabajo restante.", Date.now(), link.batch_id).run();
  }
  return { ok:true, target_mission_id:targetId, batch_id:link.batch_id, applied:true, linked:true,
    batch:await missionBatchSnapshot(env, link.batch_id) };
}
__name(reconcileBatchTargetMission, "reconcileBatchTargetMission");
async function reconcileBatchTargetMissions(env) {
  const rows = (await env.DB.prepare(
    "SELECT DISTINCT target_mission_id FROM mission_batch_items WHERE status='active' AND target_mission_id IS NOT NULL AND target_mission_id!=''"
  ).all()).results || [];
  const results = [];
  for (const row of rows) results.push(await reconcileBatchTargetMission(env, row.target_mission_id));
  return { ok:results.every((row) => row.ok), checked:results.length, results };
}
__name(reconcileBatchTargetMissions, "reconcileBatchTargetMissions");
async function adoptBatchTargetMission(env, body) {
  const batchId = String(body && body.batch_id || "").trim().slice(0, 120);
  const decisionId = String(body && body.decision_id || "").trim().slice(0, 120);
  const containerId = String(body && body.container_mission_id || "").trim().slice(0, 120);
  const targetId = String(body && body.target_mission_id || "").trim().slice(0, 120);
  const owner = String(body && (body.owner || body.by) || "").trim().slice(0, 80);
  if (!batchId || !decisionId || !containerId || !targetId || !owner || containerId === targetId) {
    return { ok:false, status:400, code:"exact_reconciliation_context_required",
      error:"decision_id, batch_id, container_mission_id, target_mission_id y owner exactos requeridos" };
  }
  const batch = await env.DB.prepare("SELECT * FROM mission_batches WHERE id=?").bind(batchId).first();
  if (!batch || batch.decision_id !== decisionId) {
    return { ok:false, status:400, code:"invalid_decision_context", error:"decision_id no corresponde al batch_id" };
  }
  const target = await env.DB.prepare(
    "SELECT id,status,project,project_id,assignee,loc FROM tickets WHERE id=?"
  ).bind(targetId).first();
  if (!target || target.status === "cancelled") {
    return { ok:false, status:409, code:"invalid_target_mission", error:"target_mission_id no es adoptable" };
  }
  if (String(target.project_id || target.project || "") !== String(batch.project_id || "")) {
    return { ok:false, status:400, code:"option_target_project_mismatch", error:"target_mission_id pertenece a otro proyecto" };
  }
  const targetAssignee = String(target.assignee || "").trim();
  const targetMachine = String(target.loc || "").trim();
  // El owner humano de carbono puede existir sin constituir una asignación
  // operativa. La máquina es el dato que materializa el claim agent+machine.
  const targetUnassigned = !targetMachine;
  const targetOwnedByBatch = !!targetAssignee && !!targetMachine &&
    sameAgentFamily(targetAssignee, batch.agent || "") &&
    memberRefMatches("machine", targetMachine, batch.machine || "");
  if (!targetUnassigned && !targetOwnedByBatch) {
    return { ok:false, status:409, code:"target_mission_owner_mismatch",
      error:"target_mission_id ya pertenece a otro agente o máquina" };
  }
  const container = await env.DB.prepare(
    "SELECT id,status,source,screen,assignee,loc,project,project_id,closure_reason FROM tickets WHERE id=?"
  ).bind(containerId).first();
  if (!container) return { ok:false, status:404, code:"invalid_container_mission", error:"container_mission_id no existe" };
  const actor = validateMissionActor(container, owner);
  if (!actor.ok) return { ok:false, status:403, code:"owner_mismatch", error:actor.error || "owner no autorizado" };
  if (container.source !== "decision-batch" || container.screen !== "decision-batch:" + decisionId ||
      String(container.project_id || container.project || "") !== String(batch.project_id || "")) {
    return { ok:false, status:409, code:"invalid_container_mission", error:"el contenedor no pertenece canónicamente a esa decisión" };
  }
  let item = await env.DB.prepare(
    "SELECT * FROM mission_batch_items WHERE batch_id=? AND (mission_id=? OR target_mission_id=?) LIMIT 1"
  ).bind(batchId, containerId, targetId).first();
  if (item && item.target_mission_id === targetId && item.mission_id === targetId) {
    if (container.status !== "cancelled" || container.closure_reason !== "equivalent_mission") {
      return { ok:false, status:409, code:"invalid_reconciliation_history",
        error:"el contenedor no conserva la sustitución canónica exacta" };
    }
    const reconciled = await reconcileBatchTargetMission(env, targetId);
    return { ok:reconciled.ok, adopted:false, idempotent:true, container_mission_id:containerId,
      target_mission_id:targetId, batch_id:batchId, reconciliation:reconciled };
  }
  if (!item || item.status !== "active" || item.mission_id !== containerId || batch.status !== "active" || batch.active_mission_id !== containerId) {
    return { ok:false, status:409, code:"container_not_active", error:"el contenedor no es la misión activa exacta de la tanda" };
  }
  if (container.status === "resolved" || container.status === "cancelled") {
    return { ok:false, status:409, code:"container_closed", error:"el contenedor ya está cerrado y no puede sustituirse" };
  }
  const linked = await env.DB.prepare(
    "SELECT batch_id FROM mission_batch_items WHERE (target_mission_id=? OR mission_id=?) AND status='active' AND batch_id!=? LIMIT 1"
  ).bind(targetId, targetId, batchId).first();
  if (linked) return { ok:false, status:409, code:"target_mission_ambiguous", error:"target_mission_id ya está activa en otra tanda" };
  const now = Date.now();
  const audit = "Sustituida por misión canónica " + targetId + " mediante referencia estructurada; sin crédito duplicado.";
  const targetLog = "Adoptada por tanda " + decisionId + " como trabajo canónico equivalente a " + containerId + ".";
  const writes = await env.DB.batch([
    env.DB.prepare(
      "UPDATE tickets SET assignee=?,loc=?,updated_at=? WHERE id=? " +
      "AND COALESCE(assignee,'')=? AND COALESCE(loc,'')=?"
    ).bind(batch.agent || "", batch.machine || "", now, targetId, targetAssignee, targetMachine),
    env.DB.prepare(
      "UPDATE tickets SET status='cancelled',closure_reason='equivalent_mission',closed_at=?,resolved_at=NULL,note=?,updated_at=? " +
      "WHERE id=? AND source='decision-batch' AND status NOT IN ('resolved','cancelled')"
    ).bind(now, audit, now, containerId),
    env.DB.prepare(
      "UPDATE mission_batch_items SET mission_id=?,target_mission_id=?,status='active',updated_at=? " +
      "WHERE batch_id=? AND mission_id=? AND status='active' AND EXISTS " +
      "(SELECT 1 FROM tickets WHERE id=? AND status='cancelled' AND closure_reason='equivalent_mission') " +
      "AND EXISTS (SELECT 1 FROM tickets WHERE id=? AND assignee=? AND loc=?)"
    ).bind(targetId, targetId, now, batchId, containerId, containerId, targetId, batch.agent || "", batch.machine || ""),
    env.DB.prepare(
      "UPDATE mission_batches SET active_mission_id=?,updated_at=? WHERE id=? AND status='active' AND active_mission_id=? " +
      "AND EXISTS (SELECT 1 FROM mission_batch_items WHERE batch_id=? AND mission_id=? AND target_mission_id=? AND status='active')"
    ).bind(targetId, now, batchId, containerId, batchId, targetId, targetId)
  ]);
  const applied = writes && writes.slice(0,4).every((row) => Number(row && row.meta && row.meta.changes || 0) === 1);
  if (!applied) return { ok:false, status:409, code:"reconciliation_race", error:"el contexto cambió durante la adopción; no se enlazó" };
  await env.DB.batch([
    env.DB.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)")
      .bind(containerId, now, "status", actor.actor, audit),
    env.DB.prepare(
      "INSERT INTO events(ticket_id,ts,kind,author,text) SELECT ?,?,'log',?,? WHERE NOT EXISTS " +
      "(SELECT 1 FROM events WHERE ticket_id=? AND kind='log' AND text=?)"
    ).bind(targetId, now, actor.actor, targetLog, targetId, targetLog),
    env.DB.prepare(MISSION_NOVELTY_INSERT_SQL)
      .bind(missionNoveltyEventKey(targetId), decisionId, batchId, targetId)
  ]);
  const reconciled = await reconcileBatchTargetMission(env, targetId);
  return { ok:reconciled.ok, adopted:true, idempotent:false, container_mission_id:containerId,
    target_mission_id:targetId, batch_id:batchId, reconciliation:reconciled };
}
__name(adoptBatchTargetMission, "adoptBatchTargetMission");
async function requeuePristineBatchMission(env, missionId) {
  const row = await env.DB.prepare(
    "SELECT i.batch_id,i.position,i.status AS item_status,b.status AS batch_status,b.active_mission_id," +
    "t.id AS ticket_id,t.status AS ticket_status,t.source,t.proof_image,t.live_shot,t.live_at,t.resolved_at " +
    "FROM mission_batch_items i JOIN mission_batches b ON b.id=i.batch_id " +
    "LEFT JOIN tickets t ON t.id=i.mission_id WHERE i.mission_id=? LIMIT 1"
  ).bind(missionId).first();
  if (!row) return { ok: false, status: 404, error: "La misión no pertenece a una tanda." };
  if (row.item_status === "queued" && !row.ticket_id && row.batch_status === "awaiting_continuation") {
    return { ok: true, requeued: false, already_queued: true, batch: await missionBatchSnapshot(env, row.batch_id) };
  }
  if (row.item_status !== "active" || row.batch_status !== "active" || row.active_mission_id !== missionId) {
    return { ok: false, status: 409, error: "La misión ya no es la activa de una tanda." };
  }
  if (row.ticket_status !== "in_progress" || row.source !== "decision-batch") {
    return { ok: false, status: 409, error: "La misión activa ya no conserva el estado inicial reencolable." };
  }
  if (row.proof_image || row.live_shot || row.live_at || row.resolved_at) {
    return { ok: false, status: 409, error: "La misión tiene progreso o prueba y no puede reencolarse." };
  }
  const pendingDecision = await env.DB.prepare(
    "SELECT id FROM decisions WHERE batch_id=? AND status='pending' LIMIT 1"
  ).bind(row.batch_id).first();
  if (pendingDecision) {
    return { ok: false, status: 409, error: "Ya existe una decisión de continuación pendiente." };
  }
  const taskAudit = await env.DB.prepare(
    "SELECT COUNT(*) AS total,SUM(CASE WHEN status!='pending' OR COALESCE(TRIM(report),'')<>'' OR COALESCE(TRIM(image),'')<>'' THEN 1 ELSE 0 END) AS dirty " +
    "FROM mission_tasks WHERE mission_id=?"
  ).bind(missionId).first();
  if (Number(taskAudit && taskAudit.dirty || 0) > 0) {
    return { ok: false, status: 409, error: "La misión tiene tareas iniciadas, completadas o informadas." };
  }
  const eventAudit = await env.DB.prepare(
    "SELECT COUNT(*) AS dirty FROM events WHERE ticket_id=? AND NOT(kind='log' AND text LIKE 'Misión activada desde la cola %')"
  ).bind(missionId).first();
  if (Number(eventAudit && eventAudit.dirty || 0) > 0) {
    return { ok: false, status: 409, error: "La misión tiene actividad real registrada." };
  }
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM events WHERE ticket_id=? AND kind='log' AND text LIKE 'Misión activada desde la cola %'").bind(missionId),
    env.DB.prepare("DELETE FROM mission_tasks WHERE mission_id=?").bind(missionId),
    env.DB.prepare("DELETE FROM tickets WHERE id=? AND status='in_progress' AND source='decision-batch'").bind(missionId),
    env.DB.prepare(
      "UPDATE mission_batch_items SET status='queued',updated_at=? WHERE batch_id=? AND mission_id=? AND status='active'"
    ).bind(now, row.batch_id, missionId),
    env.DB.prepare(
      "UPDATE mission_batches SET status='awaiting_continuation',pause_reason=?,active_mission_id=NULL,updated_at=? " +
      "WHERE id=? AND status='active' AND active_mission_id=?"
    ).bind("Reencolada sin trabajo real; esperando una nueva decisión de 5 minutos.", now, row.batch_id, missionId)
  ]);
  return { ok: true, requeued: true, already_queued: false, batch: await missionBatchSnapshot(env, row.batch_id) };
}
__name(requeuePristineBatchMission, "requeuePristineBatchMission");
async function acceptBatchInformeClosure(env, ticket, missionId, owner, report) {
  if (!ticket || ticket.source !== "decision-batch") return null;
  const agent = String(ticket.assignee || owner || "Agente").trim();
  if (!(await batchClosureAccepted(env, missionId))) {
    await addEvent(env, missionId, "accept", agent, "Cierre aceptado por el Agente mediante informe con prueba. " + String(report || "").slice(0, 180));
  }
  const batchId = await batchForMission(env, missionId);
  return batchId ? completeBatchMissionAndAwaitContinuation(env, batchId, missionId) : null;
}
__name(acceptBatchInformeClosure, "acceptBatchInformeClosure");

async function notifyFleetInformeClosure(env, ticket, missionId, owner, report, image, runtime, host) {
  const numId = await fleetEncargoId(env, missionId, ticket && ticket.screen);
  const required = !!(ticket && ticket.source === "fleet" && /^\d+$/.test(String(numId || "")));
  if (!required) return { required: false, updated: true, inbox_id: numId || null };
  if (!env.TELEGRAM) return { required: true, updated: false, inbox_id: numId };
  try {
    const persona = String(ticket.assignee || owner || "");
    const resultResponse = await env.TELEGRAM.fetch(new Request("https://telegram/api/bot-inbox/" + numId + "/result", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ persona, machine: ticket.loc || "", report, image, runtime, host, mission_id: missionId, mission_created_at: ticket.created_at })
    }));
    const statusResponse = await env.TELEGRAM.fetch(new Request("https://bot.yokup.com/api/bot-inbox/bulk-status", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [Number(numId)], status: "done", by: persona, note: "auto: informe con proof en yokup" })
    }));
    return { required: true, updated: resultResponse.ok && statusResponse.ok, inbox_id: numId };
  } catch (e) { return { required: true, updated: false, inbox_id: numId }; }
}
__name(notifyFleetInformeClosure, "notifyFleetInformeClosure");

const FLEET_ADMIN_CANCEL_NOTE = "Cancelación administrativa · NO EJECUTADO";
async function notifyFleetAdministrativeCancellation(env, ticket, missionId, owner, note) {
  const numId = await fleetEncargoId(env, missionId, ticket && ticket.screen);
  const required = !!(ticket && ticket.source === "fleet" && /^\d+$/.test(String(numId || "")));
  if (!required) return { required:false, updated:true, inbox_id:numId || null };
  if (!env.TELEGRAM) return { required:true, updated:false, inbox_id:numId };
  try {
    const response = await env.TELEGRAM.fetch(new Request(
      "https://bot.yokup.com/api/bot-inbox/bulk-status", {
        method:"POST", headers:{ "content-type":"application/json" },
        // bulk-status no admite `cancelled`: `done` representa aquí un cierre
        // administrativo. La semántica vive en note, el campo que el worker real
        // persiste en telegram_inbox; metadata se omite porque ese contrato la ignora.
        body:JSON.stringify({ ids:[Number(numId)], status:"done", by:owner,
          note:FLEET_ADMIN_CANCEL_NOTE + (note ? " · Motivo: " + String(note).slice(0, 220) : "") })
      }
    ));
    let payload = null;
    try { payload = await response.clone().json(); } catch (e) {}
    const confirmed = !!(response.ok && payload && payload.ok === true && payload.updated === 1);
    return { required:true, updated:confirmed, inbox_id:numId };
  } catch (e) {
    return { required:true, updated:false, inbox_id:numId };
  }
}
__name(notifyFleetAdministrativeCancellation, "notifyFleetAdministrativeCancellation");
// UNA PROPUESTA YA MATERIALIZADA NO SE VUELVE A DAR DE ALTA (Carlos, 1-sep-2026).
// El dedup por título de OnIdle (`onIdleProposalTitleKey`, onidle-proposals.js)
// protegía sólo la SELECCIÓN de propuestas. La MATERIALIZACIÓN no pasaba por él:
// una ventana cuyo option_targets viene a null fabrica siempre un contenedor
// nuevo, así que una lista de opciones que no cambia da de alta un gemelo por
// ronda. Entre el 27-ago y el 1-sep-2026 eso produjo 81 MIS-DEC con el MISMO
// asunto («Completar el sitemap: declara 7 rutas…»), todos de MorfeoMini ·
// AdmiraNeXT, el 80% del marcador de ese agente.
// Se busca por el MISMO criterio que el dedup para que las dos puertas —elegir
// y materializar— coincidan, y se devuelve la viva para ADOPTARLA por la vía de
// `target_mission_id`, que ya sabe validar proyecto, propiedad y enlaces.
async function findLiveTwinMission(env, projectId, title, excludeMissionId) {
  const key = onIdleProposalTitleKey(title);
  if (!key || !projectId) return null;
  const { results } = await env.DB.prepare(
    "SELECT id,subject FROM tickets WHERE COALESCE(NULLIF(project_id,''),project)=? " +
    "AND status IN ('open','in_progress','unconcluded') AND id<>? ORDER BY created_at ASC LIMIT 300"
  ).bind(String(projectId), String(excludeMissionId || "")).all();
  const twin = (results || []).find((row) => onIdleProposalTitleKey(row.subject) === key);
  return twin ? String(twin.id) : null;
}
__name(findLiveTwinMission, "findLiveTwinMission");
async function activateNextMissionBatchItem(env, batchId, triggerDecisionId) {
  const batch = await env.DB.prepare("SELECT * FROM mission_batches WHERE id=?").bind(batchId).first();
  if (!batch || batch.status !== "active") return missionBatchSnapshot(env, batchId);
  const active = await env.DB.prepare(
    "SELECT * FROM mission_batch_items WHERE batch_id=? AND status='active' ORDER BY position LIMIT 1"
  ).bind(batchId).first();
  if (active) {
    const ticket = active.mission_id && await env.DB.prepare("SELECT status FROM tickets WHERE id=?").bind(active.mission_id).first();
    if (ticket && ticket.status === "cancelled") return pauseMissionBatch(env, batchId, "La misión activa fue cancelada expresamente.");
    if (!ticket || ticket.status !== "resolved" || !(await batchClosureAccepted(env, active.mission_id))) {
      return missionBatchSnapshot(env, batchId); // sin evidencia aceptada, no se avanza
    }
    const now = Date.now();
    await env.DB.prepare("UPDATE mission_batch_items SET status='completed', updated_at=? WHERE batch_id=? AND position=?")
      .bind(now, batchId, active.position).run();
    await env.DB.prepare("UPDATE mission_batches SET active_mission_id=NULL, updated_at=? WHERE id=?")
      .bind(now, batchId).run();
  }
  const remaining = await reconcileQueuedBatchItems(env, batchId);
  let next = remaining[0] || null;
  if (!next) {
    await env.DB.prepare("UPDATE mission_batches SET status='completed', active_mission_id=NULL, updated_at=? WHERE id=?")
      .bind(Date.now(), batchId).run();
    return missionBatchSnapshot(env, batchId);
  }
  const missionId = next.mission_id || missionIdForBatchItem(batchId, next.position);
  const now = Date.now();
  const noveltyDecisionId = String(triggerDecisionId || batch.decision_id || "");
  const projectContext = await resolveCreationProject(env, {
    project_id:batch.project_id, decision_id:batch.decision_id,
    agent:batch.agent, machine:batch.machine
  });
  if (!projectContext.ok) return projectContext;
  const logText = "Misión activada desde la cola " + batch.decision_id + ". Requiere evidencia y aceptación del Agente antes de avanzar.";
  // Sin referencia explícita, antes de crear contenedor se comprueba que el
  // título no sea ya una misión VIVA del proyecto. Si lo es, se adopta esa en
  // vez de duplicarla; la rama de abajo decide si es adoptable o si la tanda
  // debe pausarse diciendo por qué. Nunca nacen dos misiones con el mismo asunto.
  if (!next.target_mission_id) {
    const twin = await findLiveTwinMission(env, projectContext.project_id, next.title, missionId);
    if (twin) next = { ...next, target_mission_id:twin };
  }
  if (next.target_mission_id) {
    const targetId = String(next.target_mission_id);
    const target = await env.DB.prepare(
      "SELECT id,status,project,project_id,assignee,loc FROM tickets WHERE id=?"
    ).bind(targetId).first();
    const invalid = !target || target.status === "cancelled" ||
      String(target.project_id || target.project || "") !== String(projectContext.project_id || "");
    if (invalid) {
      const paused = await pauseMissionBatch(env, batchId, "Referencia canónica inválida o ambigua; requiere revisión explícita.");
      return { ok:false, status:409, code:"invalid_target_mission", error:"target_mission_id ya no es adoptable", batch:paused };
    }
    const targetAssignee = String(target.assignee || "").trim();
    const targetMachine = String(target.loc || "").trim();
    // Un assignee de negocio sin máquina sigue siendo backlog sin claim
    // operativo; la adopción lo convierte de forma atómica en agent+machine.
    const targetUnassigned = !targetMachine;
    const targetOwnedByBatch = !!targetAssignee && !!targetMachine &&
      sameAgentFamily(targetAssignee, batch.agent || "") &&
      memberRefMatches("machine", targetMachine, batch.machine || "");
    if (!targetUnassigned && !targetOwnedByBatch) {
      const paused = await pauseMissionBatch(env, batchId, "La misión canónica ya pertenece a otro agente o máquina.");
      return { ok:false, status:409, code:"target_mission_owner_mismatch",
        error:"target_mission_id no puede adoptarse con este ownership", batch:paused };
    }
    const linked = await env.DB.prepare(
      "SELECT batch_id FROM mission_batch_items WHERE (target_mission_id=? OR mission_id=?) AND status='active' AND batch_id!=? LIMIT 1"
    ).bind(targetId, targetId, batchId).first();
    if (linked) {
      const paused = await pauseMissionBatch(env, batchId, "La misión canónica ya está activa en otra tanda.");
      return { ok:false, status:409, code:"target_mission_ambiguous", error:"target_mission_id ya está enlazada", batch:paused };
    }
    const resolved = target.status === "resolved";
    const targetLog = "Tanda " + batch.decision_id + " enlazada por target_mission_id; no se crea contenedor duplicado.";
    const adopted = await env.DB.batch([
      env.DB.prepare(
        "UPDATE tickets SET assignee=?,loc=?,updated_at=? WHERE id=? " +
        "AND COALESCE(assignee,'')=? AND COALESCE(loc,'')=?"
      ).bind(batch.agent || "", batch.machine || "", now, targetId, targetAssignee, targetMachine),
      env.DB.prepare(
        "UPDATE mission_batch_items SET mission_id=?,target_mission_id=?,status=?,updated_at=? WHERE batch_id=? AND position=? AND status='queued' " +
        "AND EXISTS (SELECT 1 FROM tickets WHERE id=? AND status!='cancelled' AND COALESCE(project_id,project,'')=? AND assignee=? AND loc=?)"
      ).bind(targetId, targetId, resolved ? "completed" : "active", now, batchId, next.position, targetId, projectContext.project_id, batch.agent || "", batch.machine || ""),
      env.DB.prepare(
        "UPDATE mission_batches SET status=?,pause_reason=NULL,active_mission_id=?,updated_at=? WHERE id=? AND status='active' " +
        "AND EXISTS (SELECT 1 FROM mission_batch_items WHERE batch_id=? AND mission_id=? AND target_mission_id=?)"
      ).bind(resolved ? "completed" : "active", resolved ? null : targetId, now, batchId, batchId, targetId, targetId)
    ]);
    const linkedNow = adopted && adopted.slice(0,3).every((row) => Number(row && row.meta && row.meta.changes || 0) === 1);
    if (!linkedNow) {
      const paused = await pauseMissionBatch(env, batchId, "La misión canónica cambió durante la adopción; requiere revisión.");
      return { ok:false, status:409, code:"target_mission_race", error:"target_mission_id cambió durante la adopción", batch:paused };
    }
    await env.DB.batch([
      env.DB.prepare(MISSION_NOVELTY_INSERT_SQL)
        .bind(missionNoveltyEventKey(targetId), noveltyDecisionId, batchId, targetId),
      env.DB.prepare(
        "INSERT INTO events(ticket_id,ts,kind,author,text) SELECT ?,?,'log','Agente',? " +
        "WHERE NOT EXISTS (SELECT 1 FROM events WHERE ticket_id=? AND kind='log' AND text=?)"
      ).bind(targetId, now, targetLog, targetId, targetLog)
    ]);
    return missionBatchSnapshot(env, batchId);
  }
  const atomic = [
    env.DB.prepare(
      "INSERT OR IGNORE INTO tickets(id,screen,subject,loc,role,status,priority,assignee,source,ai_triage,project,project_id,project_inherited,project_inherited_from,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(missionId, "decision-batch:" + batch.decision_id, next.title, batch.machine || "", "mission", "in_progress", "normal", batch.agent || "", "decision-batch", "", projectContext.project_id, projectContext.project_id, projectContext.inherited ? 1 : 0, projectContext.inherited_from || null, now, now)
  ];
  for (const task of batchMissionPlan(next.title, batch.agent, batch.machine)) {
    atomic.push(env.DB.prepare(
      "INSERT OR IGNORE INTO mission_tasks(mission_id,code,title,status,owner,executor,report,created_at,updated_at) VALUES(?,?,?,'pending',?,?,NULL,?,?)"
    ).bind(missionId, task.code, task.title, task.owner, task.executor, now, now));
  }
  atomic.push(
    env.DB.prepare("UPDATE mission_batch_items SET mission_id=?, status='active', updated_at=? WHERE batch_id=? AND position=? AND status='queued'")
      .bind(missionId, now, batchId, next.position),
    env.DB.prepare("UPDATE mission_batches SET active_mission_id=?, updated_at=? WHERE id=? AND status='active'")
      .bind(missionId, now, batchId),
    // En un reintento el ticket puede existir ya; el SELECT toma su created_at
    // original y UNIQUE(event_key) impide fabricar una segunda novedad/cursor.
    env.DB.prepare(MISSION_NOVELTY_INSERT_SQL)
      .bind(missionNoveltyEventKey(missionId), noveltyDecisionId, batchId, missionId),
    env.DB.prepare(
      "INSERT INTO events(ticket_id,ts,kind,author,text) SELECT ?,?,'log','Agente',? " +
      "WHERE NOT EXISTS (SELECT 1 FROM events WHERE ticket_id=? AND kind='log' AND text=?)"
    ).bind(missionId, now, logText, missionId, logText)
  );
  // D1 batch es transaccional: ticket, plan, estado de tanda y cursor de novedad
  // aparecen juntos o no aparece ninguno. Así cubre manual, timeout y continuación.
  await env.DB.batch(atomic);
  return missionBatchSnapshot(env, batchId);
}
__name(activateNextMissionBatchItem, "activateNextMissionBatchItem");
async function ensureMissionBatchFromDecision(env, decision) {
  let options = [];
  try { options = JSON.parse(decision && decision.options || "[]"); } catch (e) {}
  if (!decision || !isMissionDecision(options, decision)) return null;
  if (decision.mission==='Training horario' && decision.status==='expired') {
    const blocked=assignedWorkBlockers(decision,await assignedWorkSnapshot(env));
    if (blocked.length) {
      await env.DB.prepare("UPDATE decisions SET status='paused' WHERE id=? AND status='expired'").bind(decision.id).run();
      return {ok:false,status:409,error:'human_mission_assigned'};
    }
  }
  const effective = decision.status === "decided" ? Number(decision.chosen) : decision.status === "expired" ? Number(decision.recommended) : null;
  if (!Number.isInteger(effective)) return null;
  // «Volver atrás» es siempre la cuarta opción de la ventana inicial.
  if ((isInitialMissionDecision(options) && effective === 3) ||
      (isContinuationMissionDecision(options, decision) && effective === options.length - 1)) return null;
  const continuation = isContinuationMissionDecision(options, decision);
  const targetContract = normalizeDecisionOptionTargets(decision.option_targets, options, continuation);
  if (!targetContract.ok) return { ...targetContract, status:400 };
  const batchId = continuation ? String(decision.batch_id || "") : batchIdForDecision(decision.id);
  const now = Date.now();
  const projectContext = await resolveCreationProject(env, {
    project_id:decision.project, decision_id:decision.id, batch_id:batchId,
    agent:decision.agent, machine:decision.machine
  });
  if (!projectContext.ok) return projectContext;
  const validTargets = await validateDecisionOptionTargets(env, targetContract.targets, projectContext.project_id, batchId);
  // Una referencia pudo cerrarse entre publicar y elegir; esa carrera es válida
  // y la resuelve activateNextMissionBatchItem. Sólo fallan aquí referencias
  // inexistentes, cruzadas o enlazadas a otra tanda.
  if (!validTargets.ok && validTargets.code !== "option_target_closed") return validTargets;
  if (continuation) {
    const batch = batchId && await env.DB.prepare("SELECT id,status,active_mission_id FROM mission_batches WHERE id=?").bind(batchId).first();
    if (!batch) return missionBatchSnapshot(env, batchId);
    if (batch.status === "active" && !batch.active_mission_id) {
      const emitted = await env.DB.prepare("SELECT mission_id FROM mission_novelty_events WHERE decision_id=? LIMIT 1").bind(decision.id).first();
      if (!emitted) return activateNextMissionBatchItem(env, batchId, decision.id);
    }
    if (batch.status !== "awaiting_continuation") return missionBatchSnapshot(env, batchId);
    const queued = await reconcileQueuedBatchItems(env, batchId);
    const ordered = continuationMissionOrder(options, effective, queued);
    if (!ordered.length) return missionBatchSnapshot(env, batchId);
    const positions = queued.map((item) => item.position).sort((a, b) => a - b);
    const statements = [];
    for (let i = 0; i < ordered.length; i++) {
      statements.push(env.DB.prepare("UPDATE mission_batch_items SET position=? WHERE batch_id=? AND position=?")
        .bind(-1000 - i, batchId, ordered[i].position));
    }
    for (let i = 0; i < ordered.length; i++) {
      statements.push(env.DB.prepare("UPDATE mission_batch_items SET position=?, updated_at=? WHERE batch_id=? AND position=?")
        .bind(positions[i], now, batchId, -1000 - i));
    }
    statements.push(env.DB.prepare(
      "UPDATE mission_batches SET status='active',pause_reason=NULL,updated_at=? WHERE id=? AND status='awaiting_continuation'"
    ).bind(now, batchId));
    await env.DB.batch(statements);
    return activateNextMissionBatchItem(env, batchId, decision.id);
  }
  await env.DB.prepare(
    "INSERT OR IGNORE INTO mission_batches(id,decision_id,agent,machine,project_id,status,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?)"
  ).bind(batchId, decision.id, decision.agent || "", decision.machine || "", projectContext.project_id, now, now).run();
  await env.DB.prepare("UPDATE decisions SET batch_id=? WHERE id=? AND (batch_id IS NULL OR batch_id='')").bind(batchId, decision.id).run();
  const existing = await env.DB.prepare("SELECT 1 AS x FROM mission_batch_items WHERE batch_id=? LIMIT 1").bind(batchId).first();
  if (!existing) {
    for (const item of orderedMissionOptions(options, effective)) {
      const targetMissionId = targetContract.targets[item.option_index] &&
        targetContract.targets[item.option_index].target_mission_id || null;
      await env.DB.prepare(
        "INSERT INTO mission_batch_items(batch_id,position,option_index,title,target_mission_id,status,created_at,updated_at) VALUES(?,?,?,?,?, 'queued',?,?)"
      ).bind(batchId, item.position, item.option_index, item.title, targetMissionId, now, now).run();
    }
  }
  return activateNextMissionBatchItem(env, batchId, decision.id);
}
__name(ensureMissionBatchFromDecision, "ensureMissionBatchFromDecision");
async function expireDecisionsAndStartBatches(env) {
  await preemptAutomaticWork(env);
  await expireDecisions(env);
  // Antes de las tandas: una ventana de formación que acaba de vencer tiene que
  // aplicar su recomendada a la cápsula de su hora, igual que si la hubieran elegido.
  await aplicaEleccionesFormacion(env);
  return startDecisionBatches(env);
}
__name(expireDecisionsAndStartBatches, "expireDecisionsAndStartBatches");
async function expireDecisions(env) {
  const now = Date.now();
  await env.DB.prepare("UPDATE decisions SET status='expired' WHERE status='pending' AND deadline < ?").bind(now).run();
}
__name(expireDecisions, "expireDecisions");
async function startDecisionBatches(env) {
  // Sólo decisiones que todavía no han actualizado su tanda. Antes se
  // recorrían las 100 últimas en CADA GET, aunque 98 ya estuvieran procesadas.
  // Para una continuación, updated_at posterior al cierre/vencimiento certifica
  // que el orden restante ya se aplicó; para una raíz basta decision_id.
  const { results } = await env.DB.prepare(
    `SELECT d.* FROM decisions d
     LEFT JOIN mission_batches own ON own.decision_id=d.id
     LEFT JOIN mission_batches shared ON shared.id=d.batch_id
     LEFT JOIN mission_novelty_events novelty ON novelty.decision_id=d.id
     WHERE d.status IN ('decided','expired') AND COALESCE(d.parent_decision,'') <> 'FORMACION' AND (
       ((d.parent_decision IS NULL OR d.parent_decision='') AND
        (own.id IS NULL OR (own.status='active' AND own.active_mission_id IS NULL AND novelty.cursor IS NULL)))
       OR
       (d.parent_decision IS NOT NULL AND d.parent_decision<>'' AND
        (shared.id IS NULL OR COALESCE(shared.updated_at,0) < COALESCE(d.decided_at,d.deadline,0)
         OR (shared.status='active' AND shared.active_mission_id IS NULL AND novelty.cursor IS NULL)))
     )
     ORDER BY d.created_at DESC LIMIT 100`
  ).all();
  for (const decision of results || []) await ensureMissionBatchFromDecision(env, decision);
}
__name(startDecisionBatches, "startDecisionBatches");

// ── IDEAS → DECISIÓN (POST /ideas/decide) ────────────────────────────────────
// Al convertir una idea/objetivo en misión NO se crea ya un FLT a mano: se abre un
// reloj de decisión de 3 minutos con las 3 MEJORES opciones para EJECUTARLA. Si
// nadie elige en la ventana, la maquinaria de siempre tira con la recomendada (la
// 1ª, la más adecuada) y materializa su misión. El reloj corre bajo el agente de
// ideas (NeoMini · Mac Mini) y su proyecto de respaldo censado y asignado.
var DECIDE_AGENT = "NeoMini";
var DECIDE_MACHINE = "admira-macmini";
var DECIDE_FALLBACK_PROJECT = "yokup-ideas-objetivos";  // «Yokup · ideas-objetivos»
var DECIDE_URL = "https://www.yokup.com/decisiones";
// Genera con Workers AI las 3 mejores opciones CONCRETAS para ejecutar la idea,
// ordenadas de más a menos adecuada (la 1ª es la recomendada). Alimenta el prompt
// con el título, el detalle, el proyecto y la deliberación del Consejo. Devuelve un
// array de 3 strings, o null si la IA no dio 3 usables (con un reintento). Nunca
// inventa relleno: sin 3 opciones reales, el handler responde 502 y se reintenta.
async function generateDecideOptions(env, idea, projName) {
  const delib = ideaDeliberationText(idea.review);
  // El material de la silla que PROPUSO el objetivo: es su idea, y las 3 formas
  // de ejecutarla deberían oler a ella. Sin silla, no hay material que traer.
  const saber = seatKnowledgeText(await seatKnowledge(idea.seat, 4));
  const prompt = `Eres el jefe de operaciones de AdmiraNeXT (ecosistema de se\xF1alizaci\xF3n digital DOOH hecho por agentes de IA: yokup.com, admira.live, pixeria, xpaceos, admira.tv). Hay que EJECUTAR esta idea/objetivo:

T\xCDTULO: ${idea.title}
DETALLE: ${idea.body || "(sin detalle)"}${projName ? "\nPROYECTO: " + projName : ""}${delib ? "\nDELIBERACI\xD3N DEL CONSEJO:\n" + delib : ""}${saber}

Propon las 3 MEJORES maneras CONCRETAS y accionables de EJECUTAR esta idea, ordenadas de M\xC1S a MENOS adecuada (la 1\xAA es la recomendada). Cada opci\xF3n: una acci\xF3n clara en 1 frase (m\xE1x 140 caracteres), distinta de las otras, sin numerar ni repetir el t\xEDtulo.
Responde SOLO con un objeto JSON v\xE1lido, sin texto alrededor ni markdown, con esta forma EXACTA:
{"opciones":["<la m\xE1s adecuada>","<2\xAA>","<3\xAA>"]}
Todo en espa\xF1ol.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await aiRunRaw(env, prompt, 700);
    const opts = parseDecideOptions(raw, 3);
    if (opts.length >= 3) return opts.slice(0, 3);
  }
  return null;
}
__name(generateDecideOptions, "generateDecideOptions");
async function generateProjectImprovementOptions(env, project, identity) {
  const prompt = `Eres el jefe de producto de AdmiraNeXT. Debes proponer trabajo autónomo para mejorar un proyecto real del ecosistema.

PROYECTO: ${project.name || project.id}
WEB: ${project.web || "(sin web)"}
CONTEXTO: ${project.blurb || "(sin descripción)"}
AGENTE EJECUTOR: ${identity.agent} · ${identity.machine}

Propón las 3 MEJORES mejoras CONCRETAS, distintas y accionables que ese agente pueda ejecutar en este proyecto. Cada opción debe ser una misión clara de una frase, máximo 140 caracteres. Ordénalas de MÁS a MENOS adecuada; la primera es la recomendada. No inventes accesos, resultados ni problemas no observados.
Responde SOLO con JSON válido, sin markdown: {"opciones":["<mejora 1>","<mejora 2>","<mejora 3>"]}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await aiRunRaw(env, prompt, 700);
    const options = parseDecideOptions(raw, 3);
    if (options.length >= 3) return options.slice(0, 3);
  }
  return null;
}
__name(generateProjectImprovementOptions, "generateProjectImprovementOptions");
// Abre un reloj INICIAL: 3 misiones + «Volver atrás» + «Custom».
// MISMOS guardas del handler POST /decisions: identidad canónica (agent+machine),
// intersección de proyecto asignado en projects+project_members y el candado de UN
// reloj vivo por agente. No cubre continuaciones (eso vive en POST /decisions): sólo
// la tanda inicial, que es justo lo que /ideas/decide necesita. Devuelve {ok:true,
// id, deadline, project…} o {ok:false, status, error, code?} para que el handler
// traduzca a HTTP igual que el alta normal.
async function openInitialMissionDecision(env, input) {
  await ensureSchema(env);
  const rawOpts = Array.isArray(input.options) ? input.options : [];
  const opts = rawOpts.slice(0, 5).map((o) => String(o).slice(0, 200));
  const q = String(input.question || "").trim().slice(0, 400);
  if (!q || rawOpts.length !== opts.length || !isInitialMissionDecision(opts)) {
    return { ok: false, status: 400, error: "Se requieren 3 mejoras, «Volver atrás» como cuarta opción y «Custom» como quinta" };
  }
  const identity = resolveDecisionIdentity(input.agent, input.machine);
  if (!identity.ok) return { ok: false, status: 400, code: "exact_identity_required", error: identity.error };
  const requestedProjectId = String(input.project_id || "").trim().slice(0, 120);
  const assignment = await exactDecisionProjectAssignment(env, identity.agent, identity.machine, requestedProjectId);
  const projectContext = resolveDecisionProject({ ...input, agent: identity.agent, machine: identity.machine }, assignment, null);
  if (!projectContext.ok) return { ok: false, status: 400, code: "exact_project_required", error: projectContext.error };
  const targetContract = normalizeDecisionOptionTargets(input.option_targets, opts, false);
  if (!targetContract.ok) return { ...targetContract, status:400 };
  const validTargets = await validateDecisionOptionTargets(env, targetContract.targets, projectContext.project_id);
  if (!validTargets.ok) return validTargets;
  const mins = Math.min(DECISION_MIN_MAX, Math.max(1, +input.minutes || DECISION_MIN_DEFAULT));
  const now = Date.now();
  const agent = projectContext.agent, machine = projectContext.machine;
  const live = await env.DB.prepare(
    "SELECT id,deadline FROM decisions WHERE replace(lower(agent),'macmini','mini')=replace(lower(?),'macmini','mini') AND status='pending' AND deadline > ? ORDER BY created_at DESC LIMIT 1"
  ).bind(agent, now).first();
  if (live && input.user_override !== true) {
    return { ok: false, status: 409, error: "live_decision", existing: live.id, deadline: live.deadline,
             secondsLeft: Math.max(0, Math.round((live.deadline - now) / 1000)) };
  }
// VENTANA MÓVIL DE 60 MINUTOS (Carlos, 2026-08-05). Antes el límite era «una
// por HORA NATURAL de Madrid», y tenía un filo feo: abrir a las 11:55 dejaba
// abrir otra a las 12:00, cinco minutos después, mientras que abrir a las 11:05
// obligaba a esperar 55. Ahora el reloj se pone a CERO en cada ventana y corre
// 60 minutos enteros, que es lo que la línea del Highscore pinta bajo cada
// agente. madridHourKey se conserva: lo usa el resto del día natural.
  // `manual` = la lanza una persona desde la pantalla, no el ciclo autónomo:
  // caben MANUAL_PER_HOUR en la misma hora en vez de una.
  // UNA VENTANA ACTIVA POR AGENTE, NO UNA CADA 60 MINUTOS (Carlos, 3-sep-2026:
  // «el limite es por agente no por hora»). El tope YA era por agente, pero contaba
  // las ventanas CREADAS en los ultimos 60 minutos, y eso tenia una consecuencia que
  // se vio hoy: la ventana automatica de las 06:13 —caducada y con opciones medidas
  // el 7 de agosto, 540 horas antes— seguia ocupando el hueco, asi que la propuesta
  // que pidio Carlos no podia abrirse; y en cuanto el hueco se libero, el ciclo
  // automatico lo volvio a coger con las MISMAS opciones rancias. Una ventana que ya
  // no admite respuesta no puede reservar el sitio de la que si.
  // Ahora solo cuentan las ventanas VIVAS: pendientes y dentro de su plazo.
  const previas = ((await env.DB.prepare(
    "SELECT id,created_at,deadline FROM decisions WHERE replace(lower(agent),'macmini','mini')=replace(lower(?),'macmini','mini') AND (parent_decision IS NULL OR parent_decision='') AND status='pending' AND deadline > ? ORDER BY created_at DESC"
  ).bind(agent, now).all()).results) || [];
  const tope = input.manual === true ? MANUAL_PER_HOUR : 1;
  if (previas.length >= tope && input.user_override !== true) {
    const previous = previas[previas.length - 1];
    // El hueco se libera cuando la ventana viva CADUCA, no 60 minutos despues de
    // haberse creado: quien espera necesita saber la hora buena.
    return { ok: false, status: 409, error: "hourly_limit", manual: input.manual === true,
             limite: tope, usadas: previas.length, existing: previas[0].id,
             nextAt: Number(previous.deadline) || (Number(previous.created_at) + HOURLY_WINDOW_MS) };
  }
  const id = "DEC-" + now.toString(36) + Math.random().toString(36).slice(2, 6);
  await backfillTodayDisplayRefs(env, now);
  if (input.mission==='Training horario') {
    if (!input.hourly_run_id) return {ok:false,status:409,error:'hourly_run_required'};
    const finalGuard=await hourlyModeGuard(env,input.hourly_run_id);
    if (!finalGuard.allowed) return {ok:false,status:409,error:finalGuard.reason};
    if (principalTargetKey(finalGuard.target?.agent,finalGuard.target?.machine)!==principalTargetKey(identity.agent,identity.machine)) return {ok:false,status:409,error:'target_mismatch'};
  }
  await env.DB.prepare("INSERT INTO decisions (id,machine,agent,surface,question,options,recommended,status,created_at,deadline,url,mission,project,project_slug,parent_decision,batch_id,option_targets) VALUES (?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,?,?)")
    .bind(id, machine, agent, String(input.surface || "").slice(0, 20), q, JSON.stringify(opts),
          Math.max(0, Math.min(2, +input.recommended || 0)), now, now + mins * 60000,
          String(input.url || "").slice(0, 300), String(input.mission || "").slice(0, 120),
          projectContext.project_id, projectContext.project_slug, "", "", JSON.stringify(targetContract.targets)).run();
  const display_ref = await ensureEntityDisplayRef(env, "window", id, now);
  return { ok: true, id, deadline: now + mins * 60000, project: projectContext.project,
           project_id: projectContext.project_id, project_slug: projectContext.project_slug, display_ref };
}
__name(openInitialMissionDecision, "openInitialMissionDecision");

const ONIDLE_DAILY_LIMIT = 8;
const ONIDLE_MISSION_MARKER = "OnIdle horario";

function matchesOnIdleIdentity(row, identity) {
  return !!(row && identity && sameAgentFamily(row.assignee, identity.agent) &&
    memberRefMatches("machine", row.loc, identity.machine));
}
__name(matchesOnIdleIdentity, "matchesOnIdleIdentity");

// ¿HA TRABAJADO ESTE AGENTE EN LA ULTIMA HORA? (Carlos, 3-sep-2026: «es una a la hora
// por defecto y si hemos hecho trabajar al agente esa hora no se ejecuta la ventana de
// decision».) La ventana horaria existe por el mandamiento 10 —«si NO tienes trabajo,
// tira millas»—, asi que a un agente ocupado no hay nada que preguntarle: preguntarselo
// es interrumpirle para que elija entre tres cosas que ya no va a hacer.
//
// Hacia falta porque el guarda de OnIdle solo mira las decisiones marcadas «OnIdle
// horario» con surface «highscore», y la ventana automatica de la hora nace como
// «Ventana automatica»: se saltaba el guarda entero. Hoy me han saltado quince mientras
// trabajaba, y una de ellas ocupo el hueco de la propuesta que Carlos habia pedido.
//
// Trabajar es ACTIVIDAD, no tener algo abierto: una mision olvidada desde el martes no
// convierte en ocupado a quien lleva la mañana parado.
// LAS VENTANAS DE DECISION SON TRABAJO, Y SE VEN AGRUPADAS (Carlos, 3-sep-2026:
// «agrupa las ventanas de decision y que aparezcan»). Puntuaban desde siempre —8 puntos
// cada una— pero no constaban como trabajo en yokup: en /misiones no habia ni rastro de
// una labor que un agente hace cada hora. Una fila por ventana habria metido unas 56 al
// dia entre toda la flota y habria enterrado el tablero, asi que se agrupan: UNA mision
// por agente y jornada, que va contando las suyas.
// LA VENTANA TAMBIEN VA A TELEGRAM (Carlos, 3-sep-2026: «que no solo aparezcan en
// yokup.com sino tambien que se me envien a Telegram»). Una ventana que solo vive en una
// pantalla que nadie mira no es una pregunta: es un monologo. Con el tope de 10 minutos,
// si Carlos no esta delante de /decisiones cuando salta, caduca sin que la vea — hoy le
// paso con la que me pidio expresamente.
//
// Se manda por el binding TELEGRAM que este worker ya tiene, reusando /api/bot-say en vez
// de abrir una puerta nueva: menos superficie. Si Telegram falla, la ventana NO se cae;
// avisar es un extra, no una condicion.
async function avisarVentanaPorTelegram(env, { agent, machine, question, options, recommended, deadline, display_ref, projectId }) {
  try {
    const key = env.ADMIRA_TELEGRAM_PANEL_KEY || "";
    if (!key || !env.TELEGRAM) return { enviado: false, motivo: "sin binding o sin clave" };
    const lista = (Array.isArray(options) ? options : []).map((op, i) =>
      (i === Number(recommended || 0) ? "★ " : "  ") + (i + 1) + ") " + String(op || "").slice(0, 220)
    ).join("\n");
    const minutos = Math.max(1, Math.round((Number(deadline) - Date.now()) / 60000));
    const texto = "🗳 VENTANA DE DECISION · " + (display_ref || "") + "\n"
      + agent + (machine ? " · " + machine : "") + (projectId ? " · " + projectId : "") + "\n\n"
      + String(question || "").slice(0, 400) + "\n\n" + lista
      + "\n\nCaduca en " + minutos + " min. Responde aqui con el numero, o en https://yokup.com/decisiones"
      + "\nSi no contestas, el agente ejecuta la ★ (mandamiento 10).";
    const r = await env.TELEGRAM.fetch(new Request("https://telegram/api/bot-say", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + key },
      body: JSON.stringify({ persona: "Admirito", text: texto }),
    }));
    return { enviado: r.ok, status: r.status };
  } catch (e) { return { enviado: false, motivo: String(e && e.message || e).slice(0, 80) }; }
}
__name(avisarVentanaPorTelegram, "avisarVentanaPorTelegram");

async function anotarVentanaComoTrabajo(env, agent, machine, projectId, pregunta, now) {
  try {
    const dia = madridDayKey(now);
    const range = missionDayRange(dia);
    if (!range) return null;
    const previa = await env.DB.prepare(
      "SELECT id,subject FROM tickets WHERE source='decision-window' AND assignee=? AND created_at>=? AND created_at<? LIMIT 1"
    ).bind(agent, range.start, range.end).first();
    if (previa) {
      const n = (Number((/·\s(\d+)\sventanas?/.exec(String(previa.subject || "")) || [])[1]) || 1) + 1;
      await env.DB.prepare("UPDATE tickets SET subject=?, updated_at=? WHERE id=?")
        .bind("Ventanas de decision del " + dia + " · " + n + " ventanas · ultima: " + String(pregunta || "").slice(0, 90), now, previa.id).run();
      return previa.id;
    }
    const id = await nextFreeFleetId(env);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO tickets(id,screen,subject,loc,project,project_id,role,status,priority,assignee,source,ai_triage,created_at,started_at,updated_at) " +
      "VALUES(?,?,?,?,?,?,'standalone-task','in_progress','normal',?,'decision-window','',?,?,?)"
    ).bind(id, agent + "\u00b7" + machine + " ventanas", 
           "Ventanas de decision del " + dia + " · 1 ventana · ultima: " + String(pregunta || "").slice(0, 90),
           machine, projectId, projectId, agent, now, now, now).run();
    await ensureEntityDisplayRef(env, "mission", id, now).catch(() => {});
    return id;
  } catch (e) { return null; }   // anotar el trabajo no puede tumbar la ventana
}
__name(anotarVentanaComoTrabajo, "anotarVentanaComoTrabajo");

async function agenteTrabajoLaUltimaHora(env, identity, now = Date.now()) {
  const desde = now - 60 * 60 * 1000;
  const [mis, tar] = await Promise.all([
    env.DB.prepare(
      "SELECT id,assignee,loc,created_at,started_at,updated_at,source FROM tickets WHERE " + AGENT_SOURCE_SQL +
      " AND (created_at>=? OR started_at>=? OR updated_at>=? OR resolved_at>=?)"
    ).bind(desde, desde, desde, desde).all(),
    env.DB.prepare(
      "SELECT m.mission_id,t.assignee,t.loc FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id " +
      "WHERE (m.started_at>=? OR m.updated_at>=?) AND " + AGENT_SOURCE_SQL_T
    ).bind(desde, desde).all(),
  ]);
  const mias = (mis.results || []).filter((row) => matchesOnIdleIdentity(row, identity));
  const suyas = (tar.results || []).filter((row) => matchesOnIdleIdentity(row, identity));
  return { trabajo: mias.length + suyas.length, desde };
}
__name(agenteTrabajoLaUltimaHora, "agenteTrabajoLaUltimaHora");

async function operationalOnIdleState(env, identity, requestedProjectId = "", now = Date.now()) {
  const [missionResult, taskResult, decisionResult] = await Promise.all([
    env.DB.prepare("SELECT id,status,assignee,loc,created_at,started_at,updated_at,live_at,source FROM tickets WHERE " +
      AGENT_SOURCE_SQL + " AND status IN ('open','in_progress','unconcluded')").all(),
    env.DB.prepare("SELECT m.mission_id,m.code,m.status,m.owner,m.executor,m.started_at,m.created_at,m.updated_at,t.assignee,t.loc " +
      "FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id WHERE m.status IN ('in_progress','doing','active','unconcluded') " +
      "AND " + AGENT_SOURCE_SQL_T + " AND t.status NOT IN ('resolved','cancelled')").all(),
    // Sólo una ventana OnIDLE canónica del mismo scope bloquea. Academy, una
    // decisión de otro proyecto/familia o una fila legacy incompleta no puede
    // secuestrar el botón ni presentarse como `existing`.
    requestedProjectId ? env.DB.prepare(
      "SELECT id,agent,machine,project,mission,surface,options,status,deadline,created_at FROM decisions " +
      "WHERE status='pending' AND mission=? AND surface='highscore' AND project=? ORDER BY created_at DESC,id DESC"
    ).bind(ONIDLE_MISSION_MARKER, requestedProjectId).all() : Promise.resolve({ results:[] })
  ]);
  // Una misión/tarea sólo bloquea a su familia en su equipo físico. El proyecto
  // compartido y la presencia de otro agente no prueban propiedad operativa;
  // aliases históricos de persona/máquina sí convergen mediante los resolvers.
  const missions = (missionResult.results || []).filter((row) => matchesOnIdleIdentity(row, identity));
  const tasks = (taskResult.results || []).filter((row) => matchesOnIdleIdentity({...row,assignee:row.executor || row.owner || row.assignee,loc:parseAgentIdentity(row.executor || row.owner).suffix ? canonicalMachineSuffix(parseAgentIdentity(row.executor || row.owner).suffix) : row.loc}, identity));
  const live = selectCanonicalLiveOnIdleDecision(decisionResult.results || [], {
    agent:identity.agent, machine:identity.machine, project_id:requestedProjectId
  }, ONIDLE_MISSION_MARKER) ? 1 : 0;
  const range = missionDayRange(madridDayKey(now));
  const usedRows = range ? (await env.DB.prepare(
    "SELECT agent,machine FROM decisions WHERE (parent_decision IS NULL OR parent_decision='') " +
    "AND mission=? AND created_at>=? AND created_at<?"
  ).bind(ONIDLE_MISSION_MARKER, range.start, range.end).all()).results || [] : [];
  // El cupo de ocho también es global. Contar sólo la identidad candidata permitía
  // ocho ventanas por agente y multiplicaba el límite diario de la plataforma.
  const windowsToday = usedRows.length;
  const eligibility = onIdleEligibility({ missions, tasks, live_decisions:live,
    windows_today:windowsToday, now, daily_limit:ONIDLE_DAILY_LIMIT, block_pending_missions:true });
  if (eligibility.can_open && (missions.length || tasks.length)) { eligibility.can_open=false; eligibility.reason="human_mission_assigned"; }
  return { ...eligibility, agent:identity.agent, machine:identity.machine,
    evaluated_at:now, operational_limit_ms:MISSION_UNCONCLUDED_AFTER_MS,
    state_semantics:"operational-hour-v1" };
}
__name(operationalOnIdleState, "operationalOnIdleState");

// Cuanto tiempo veta un titulo ya ofrecido: una semana. Ni una ventana (se repetiria
// la de hace un rato) ni para siempre (el backlog se agota y el generador enmudece).
var ONIDLE_TITULO_GASTADO_MS = 7 * 24 * 60 * 60 * 1000;

async function canonicalOnIdleProposals(env, identity, requestedProjectId) {
  if (!requestedProjectId) return { ok:false, status:400, code:"exact_project_required",
    error:"project_id exacto requerido para obtener propuestas" };
  const assignment = await exactDecisionProjectAssignment(env, identity.agent, identity.machine, requestedProjectId);
  if (!assignment) return { ok:false, status:400, code:"exact_project_required",
    error:"project_id no pertenece a la asignación canónica de agent+machine" };
  const projectId = String(assignment.id);
  const projectName = String(assignment.name);
  const [backlogResult, decisionResult, activeBatchResult, activeTaskResult] = await Promise.all([
    env.DB.prepare(
      "SELECT id,subject,status,priority,assignee,loc,project,project_id,created_at,updated_at FROM tickets " +
      "WHERE (project_id=? OR (COALESCE(project_id,'')='' AND lower(project)=lower(?))) " +
      "AND lower(COALESCE(status,'')) NOT IN ('resolved','cancelled','closed') " +
      "ORDER BY CASE lower(COALESCE(priority,'')) WHEN 'critical' THEN 0 WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END," +
      "COALESCE(created_at,updated_at) ASC,id ASC LIMIT 300"
    ).bind(projectId, projectName).all(),
    // UN TITULO NO SE GASTA PARA SIEMPRE (2026-09-03). Esta consulta no tenia limite de
    // tiempo: cada opcion ofrecida en cualquier ventana pasada quedaba vetada de por vida.
    // yokup abrio 22 ventanas OnIdle entre el 7 y el 12 de agosto —hasta 66 titulos
    // quemados— y desde entonces el generador devuelve CERO propuestas con doce tickets
    // abiertos delante. Por eso los agentes caian al fichero de opciones a mano, que lleva
    // sin tocarse desde el 7 de agosto: las ventanas automaticas salian con opciones de
    // hace 540 horas, o no salian. Una mejora que Carlos no eligio hace un mes sigue
    // pendiente hoy y merece volver a ofrecerse; lo que no queremos es repetirla en la
    // ventana siguiente, y para eso basta una semana.
    env.DB.prepare(
      "SELECT agent,machine,project,options,option_targets FROM decisions WHERE mission=? " +
      "AND (parent_decision IS NULL OR parent_decision='') AND (project=? OR lower(project)=lower(?)) " +
      "AND created_at >= ? ORDER BY created_at DESC"
    ).bind(ONIDLE_MISSION_MARKER, projectId, projectName, Date.now() - ONIDLE_TITULO_GASTADO_MS).all(),
    env.DB.prepare(
      "SELECT active_mission_id,agent,machine,project_id FROM mission_batches " +
      "WHERE status='active' AND active_mission_id IS NOT NULL AND active_mission_id!=''"
    ).all(),
    env.DB.prepare(
      "SELECT DISTINCT m.mission_id FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id " +
      "WHERE lower(COALESCE(m.status,'')) IN ('in_progress','doing','active','unconcluded') " +
      "AND lower(COALESCE(t.status,'')) NOT IN ('resolved','cancelled','closed') " +
      "AND (t.project_id=? OR (COALESCE(t.project_id,'')='' AND lower(t.project)=lower(?)))"
    ).bind(projectId, projectName).all()
  ]);
  const usedTargetIds = [], usedTitles = [];
  for (const row of decisionResult.results || []) {
    let options = [], targets = [];
    try { options = JSON.parse(row.options || "[]"); } catch (e) {}
    try { targets = JSON.parse(row.option_targets || "[]"); } catch (e) {}
    for (const title of options.slice(0, 3)) usedTitles.push(title);
    for (const target of targets.slice(0, 3)) {
      if (target && target.target_mission_id) usedTargetIds.push(target.target_mission_id);
    }
  }
  const activeMissionIds = (activeBatchResult.results || [])
    .filter((row) => String(row.project_id || "") === projectId)
    .map((row) => row.active_mission_id)
    .concat((activeTaskResult.results || []).map((row) => row.mission_id));
  const now = Date.now();
  const backlogCandidates = (backlogResult.results || []).map((row) => ({
    title:row.subject, target_mission_id:row.id, status:row.status,
    priority:row.priority, created_at:row.created_at,
    updated_at:row.updated_at, evidence_at:row.updated_at || row.created_at
  }));
  return { ...selectOnIdleProposals(backlogCandidates, {
    used_target_ids:usedTargetIds, used_titles:usedTitles,
    active_mission_ids:activeMissionIds, now
  }), project_id:projectId, agent:identity.agent, machine:identity.machine };
}
__name(canonicalOnIdleProposals, "canonicalOnIdleProposals");

function onIdleTickDecisionId(identity, day, ordinal) {
  return "DEC-ONIDLE-" + String(day || "").replace(/[^0-9]/g, "") + "-" +
    identityKey(identity.agent).slice(0, 24) + "-" + identityKey(identity.machine).slice(0, 24) + "-" + ordinal;
}
__name(onIdleTickDecisionId, "onIdleTickDecisionId");

// Construye pares exactos desde el censo, no un agente o una máquina sueltos.
// Un agente con apellido sólo casa con la máquina que reproduce esa identidad;
// los pares ambiguos fallan cerrados en exactDecisionProjectAssignment.
async function scheduledOnIdleAssignments(env) {
  const projects = await listProjects(env), out = [], seen = new Set();
  for (const project of projects.filter((row) => String(row.status || "activo").toLowerCase() === "activo")) {
    for (const agentRef of project.agents || []) {
      for (const machine of project.machines || []) {
        const identity = resolveDecisionIdentity(agentRef, machine);
        if (!identity.ok || reportAgentIdentity(identity.agent, identity.machine) !== canonicalProjectAgentRef(agentRef)) continue;
        const assignment = await exactDecisionProjectAssignment(env, identity.agent, identity.machine, project.id);
        if (!assignment || String(assignment.id) !== String(project.id)) continue;
        const key = identityKey(identity.agent) + "@" + identityKey(identity.machine);
        if (seen.has(key)) continue;
        seen.add(key); out.push({ identity, project:assignment, identity_key:key });
      }
    }
  }
  // listProjects no promete orden; un orden canónico evita que dos isolates elijan
  // familias distintas para el mismo ordinal global tras una respuesta reordenada.
  return out.sort((a, b) => a.identity_key.localeCompare(b.identity_key));
}
__name(scheduledOnIdleAssignments, "scheduledOnIdleAssignments");

async function publishScheduledOnIdle(env, candidate, now = Date.now()) {
  const { identity, project, identity_key:identityKeyValue } = candidate;
  const familyKey = agentFamilyKey(identity.agent), physicalMachineKey = machineRefKey(identity.machine);
  const decisionFamilySql = agentFamilySqlKey("agent"), decisionMachineSql = machineRefSqlKey("machine");
  const ticketFamilySql = agentFamilySqlKey("t.assignee"), ticketMachineSql = machineRefSqlKey("t.loc");
  const state = await operationalOnIdleState(env, identity, project.id, now);
  if (!state.can_open) return { ok:true, published:false, reason:state.reason };
  const proposalResult = await canonicalOnIdleProposals(env, identity, project.id);
  if (!proposalResult.ok || !Array.isArray(proposalResult.proposals) || proposalResult.proposals.length !== 3) {
    return { ok:true, published:false, reason:proposalResult.code || "proposals_unavailable" };
  }
  const day = madridDayKey(now), ordinal = state.quota.used + 1;
  if (ordinal < 1 || ordinal > ONIDLE_DAILY_LIMIT) return { ok:true, published:false, reason:"daily_limit" };
  const decisionId = onIdleTickDecisionId(identity, day, ordinal);
  const options = proposalResult.proposals.map((row) => String(row.title || "").slice(0, 200))
    .concat([ONIDLE_BACK_OPTION, ONIDLE_CUSTOM_OPTION]);
  if (!isCanonicalOnIdleOptions(options)) return { ok:true, published:false, reason:"invalid_canonical_options" };
  const targets = proposalResult.proposals.map((row) => ({ target_mission_id:String(row.target_mission_id) }))
    .concat([null, null]);
  const deadline = now + 5 * 60000;
  const reserve = env.DB.prepare(
    "INSERT OR IGNORE INTO onidle_ticks (identity_key,day,ordinal,agent,machine,project_id,decision_id,status,reserved_at) VALUES (?,?,?,?,?,?,?,'reserved',?)"
  ).bind(identityKeyValue, day, ordinal, identity.agent, identity.machine, project.id, decisionId, now);
  // El INSERT de la decisión vuelve a comprobar que no apareció otra pregunta
  // entre el guard y el batch. D1 ejecuta batch de forma atómica; si un timeout
  // deja una reserva antigua, el mismo id la repara en el siguiente tick.
  const decision = env.DB.prepare(
    "INSERT OR IGNORE INTO decisions (id,machine,agent,surface,question,options,recommended,status,created_at,deadline,url,mission,project,project_slug,parent_decision,batch_id,option_targets) " +
    "SELECT ?,?,?,? ,?,?,0,'pending',?,?,?,?,?,?, '', '',? WHERE NOT EXISTS (" +
    "SELECT 1 FROM decisions WHERE status='pending' AND mission=? AND surface='highscore' AND project=? " +
    "AND " + decisionFamilySql + "=? AND " + decisionMachineSql + "=? " +
    "AND json_valid(options) AND json_array_length(options)=5 " +
    "AND TRIM(json_extract(options,'$[0]'))<>'' AND TRIM(json_extract(options,'$[1]'))<>'' " +
    "AND TRIM(json_extract(options,'$[2]'))<>'' " +
    "AND lower(TRIM(json_extract(options,'$[0]')))<>lower(TRIM(json_extract(options,'$[1]'))) " +
    "AND lower(TRIM(json_extract(options,'$[0]')))<>lower(TRIM(json_extract(options,'$[2]'))) " +
    "AND lower(TRIM(json_extract(options,'$[1]')))<>lower(TRIM(json_extract(options,'$[2]'))) " +
    "AND json_extract(options,'$[3]')=? AND json_extract(options,'$[4]')=?) AND NOT EXISTS (" +
    "SELECT 1 FROM tickets t WHERE " + AGENT_SOURCE_SQL_T + " AND t.status IN ('open','in_progress','unconcluded') " +
    "AND " + ticketFamilySql + "=? AND " + ticketMachineSql + "=?) AND NOT EXISTS (" +
    "SELECT 1 FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id " +
    "WHERE m.status IN ('in_progress','doing','active','unconcluded') AND " + AGENT_SOURCE_SQL_T +
    " AND t.status NOT IN ('resolved','cancelled') " +
    "AND " + ticketFamilySql + "=? AND " + ticketMachineSql + "=?)"
  ).bind(decisionId, identity.machine, identity.agent, "highscore", "Ventana OnIDLE " + ordinal + "/" + ONIDLE_DAILY_LIMIT,
    JSON.stringify(options), now, deadline, DECIDE_URL, ONIDLE_MISSION_MARKER, project.id,
    String(project.slug || decisionProjectSlug(project.name || project.id)).toUpperCase(), JSON.stringify(targets),
    ONIDLE_MISSION_MARKER, project.id, familyKey, physicalMachineKey, ONIDLE_BACK_OPTION, ONIDLE_CUSTOM_OPTION,
    familyKey, physicalMachineKey, familyKey, physicalMachineKey);
  const mark = env.DB.prepare(
    "UPDATE onidle_ticks SET status='published',published_at=? WHERE identity_key=? AND day=? AND ordinal=? " +
    "AND EXISTS(SELECT 1 FROM decisions WHERE id=? AND status='pending')"
  ).bind(now, identityKeyValue, day, ordinal, decisionId);
  if (typeof env.DB.batch === "function") await env.DB.batch([reserve, decision, mark]);
  else { await reserve.run(); await decision.run(); await mark.run(); }
  const publishedRow = await env.DB.prepare(
    "SELECT id,agent,machine,project,mission,surface,options,status,deadline FROM decisions WHERE id=? AND status='pending'"
  ).bind(decisionId).first();
  const published = isCanonicalOnIdleDecision(publishedRow, {
    agent:identity.agent, machine:identity.machine, project_id:project.id
  }, ONIDLE_MISSION_MARKER);
  if (published) await ensureEntityDisplayRef(env, "window", decisionId, now);
  const concurrent = published ? null : await operationalOnIdleState(env, identity, project.id, now);
  return { ok:true, published, decision_id:published ? decisionId : null,
    reason:published ? "published" : concurrent && !concurrent.can_open ? concurrent.reason : "concurrent_block",
    ordinal, agent:identity.agent, machine:identity.machine, project_id:project.id };
}
__name(publishScheduledOnIdle, "publishScheduledOnIdle");

async function runOnIdleTick(env, now = Date.now()) {
  const results = [];
  for (const candidate of await scheduledOnIdleAssignments(env)) {
    results.push(await publishScheduledOnIdle(env, candidate, now));
  }
  return { ok:true, evaluated_at:now, results,
    published:results.filter((row) => row.published).length, publisher:"server-scheduled-v1" };
}
__name(runOnIdleTick, "runOnIdleTick");

function onIdleDecisionUrl(decisionId) {
  return DECIDE_URL + (decisionId ? "?decision_id=" + encodeURIComponent(decisionId) : "");
}
__name(onIdleDecisionUrl, "onIdleDecisionUrl");

async function liveOnIdleDecision(env, identity, requestedProjectId) {
  const result = await env.DB.prepare(
    "SELECT id,agent,machine,project,mission,surface,options,status,deadline,created_at FROM decisions " +
    "WHERE status='pending' AND mission=? AND surface='highscore' AND project=? ORDER BY created_at DESC,id DESC"
  ).bind(ONIDLE_MISSION_MARKER, requestedProjectId).all();
  return selectCanonicalLiveOnIdleDecision(result.results || [], {
    agent:identity.agent, machine:identity.machine, project_id:requestedProjectId
  }, ONIDLE_MISSION_MARKER);
}
__name(liveOnIdleDecision, "liveOnIdleDecision");

async function requestedOnIdleAssignment(env, requestedAgent, requestedProjectId) {
  const project = (await listProjects(env)).find((row) => String(row.id) === String(requestedProjectId) &&
    String(row.status || "activo").toLowerCase() === "activo");
  if (!project) return null;
  const candidates = [];
  for (const agentRef of project.agents || []) {
    if (!memberRefMatches("agent", agentRef, requestedAgent)) continue;
    for (const machine of project.machines || []) {
      // La máquina deriva el apellido; agentRef sólo autoriza la familia exacta.
      // Así el alias histórico OraculoMacMini converge a OraculoMini sin aceptar
      // que NeoMBP14 se convierta en NeoMini por compartir persona.
      const identity = resolveDecisionIdentity(parseAgentIdentity(agentRef).persona, machine);
      if (!identity.ok || identityKey(identity.agent) !== identityKey(requestedAgent)) continue;
      const assignment = await exactDecisionProjectAssignment(env, identity.agent, identity.machine, project.id);
      if (!assignment || String(assignment.id) !== String(project.id)) continue;
      candidates.push({ identity, project:assignment,
        identity_key:identityKey(identity.agent) + "@" + identityKey(identity.machine) });
    }
  }
  return candidates.length === 1 ? candidates[0] : null;
}
__name(requestedOnIdleAssignment, "requestedOnIdleAssignment");

function onIdleRequestResponse(row, replayed = false) {
  const status = String(row && row.status || "processing");
  const decisionId = String(row && row.decision_id || "");
  return { ok:status === "created" || status === "existing", status,
    request_id:String(row && row.id || ""), agent:String(row && row.agent || ""),
    machine:String(row && row.machine || ""), project_id:String(row && row.project_id || ""),
    decision_id:decisionId || null, deadline:Number(row && row.deadline) || null,
    reason:String(row && row.reason || ""), url:decisionId ? onIdleDecisionUrl(decisionId) : null,
    replayed:!!replayed, publisher:"server-scheduled-v1" };
}
__name(onIdleRequestResponse, "onIdleRequestResponse");

async function finishOnIdleRequest(env, requestId, status, detail = {}, now = Date.now()) {
  await env.DB.prepare(
    "UPDATE onidle_requests SET status=?,decision_id=?,reason=?,deadline=?,updated_at=? WHERE id=?"
  ).bind(status, detail.decision_id || null, detail.reason || status,
    Number(detail.deadline) || null, now, requestId).run();
  return env.DB.prepare("SELECT * FROM onidle_requests WHERE id=?").bind(requestId).first();
}
__name(finishOnIdleRequest, "finishOnIdleRequest");

// El botón de HighscoreDetail sólo deja esta solicitud autenticada. Resolverla
// sigue siendo trabajo del scheduler servidor: mismo censo, guard global, cupo,
// propuestas y publicador; el lease evita que dos isolates ejecuten el mismo
// intento a la vez y onidle_ticks mantiene idempotente la decisión resultante.
async function requestImmediateOnIdle(env, input, session, now = Date.now()) {
  const requestId = String(input && input.request_id || "").trim();
  const requestedAgent = canonicalProjectAgentRef(input && input.agent);
  const requestedProjectId = String(input && input.project_id || "").trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) return { status:400,
    body:{ ok:false, status:"invalid", code:"request_id_required", error:"request_id idempotente requerido" } };
  if (!requestedAgent || !requestedProjectId || requestedProjectId.length > 120) return { status:400,
    body:{ ok:false, status:"invalid", code:"exact_scope_required", error:"agent y project_id exactos requeridos" } };

  const previous = await env.DB.prepare("SELECT * FROM onidle_requests WHERE id=?").bind(requestId).first();
  if (previous) {
    if (String(previous.requested_by) !== String(session.email) ||
        identityKey(previous.agent) !== identityKey(requestedAgent) ||
        String(previous.project_id) !== requestedProjectId) {
      return { status:409, body:{ ok:false, status:"conflict", code:"request_id_conflict",
        error:"request_id ya pertenece a otra solicitud" } };
    }
    if (previous.status === "created" || previous.status === "existing") {
      const priorDecision = previous.decision_id && await env.DB.prepare(
        "SELECT id,agent,machine,project,mission,surface,options,status,deadline FROM decisions WHERE id=?"
      ).bind(previous.decision_id).first();
      if (!isCanonicalOnIdleDecision(priorDecision, {
        agent:previous.agent, machine:previous.machine, project_id:previous.project_id
      }, ONIDLE_MISSION_MARKER)) {
        // Repara ledgers creados por el bug histórico que enlazó decisiones
        // Academy/ajenas. El mismo request_id puede continuar, nunca migrar scope.
        await env.DB.prepare(
          "UPDATE onidle_requests SET status='requested',decision_id=NULL,reason='invalid_existing_repaired',deadline=NULL,updated_at=? WHERE id=?"
        ).bind(now, requestId).run();
        previous.status = "requested";
      }
    }
    if (previous.status !== "requested" && previous.status !== "processing") {
      return { status:previous.status === "blocked" ? 409 : 200,
        body:onIdleRequestResponse(previous, true) };
    }
  }

  const candidate = await requestedOnIdleAssignment(env, requestedAgent, requestedProjectId);
  if (!candidate) return { status:409, body:{ ok:false, status:"blocked",
    code:"exact_assignment_required", reason:"exact_assignment_required",
    error:"No existe una asignación única de agente, equipo y proyecto" } };
  const identity = candidate.identity;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO onidle_requests (id,requested_by,agent,machine,project_id,status,created_at,updated_at) VALUES (?,?,?,?,?,'requested',?,?)"
  ).bind(requestId, session.email, identity.agent, identity.machine, requestedProjectId, now, now).run();

  let live = await liveOnIdleDecision(env, identity, requestedProjectId);
  if (live) {
    const row = await finishOnIdleRequest(env, requestId, "existing", {
      decision_id:live.id, deadline:live.deadline, reason:"live_decision"
    }, now);
    return { status:200, body:onIdleRequestResponse(row) };
  }
  let operational = await operationalOnIdleState(env, identity, requestedProjectId, now);
  if (!operational.can_open) {
    const row = await finishOnIdleRequest(env, requestId, "blocked", { reason:operational.reason }, now);
    return { status:409, body:{ ...onIdleRequestResponse(row), blockers:operational.blockers,
      quota:operational.quota } };
  }

  const leaseName = "onidle-request:" + candidate.identity_key + "@" + identityKey(requestedProjectId);
  if (!(await tryAcquireBeatLease(env, leaseName, 5000))) {
    live = await liveOnIdleDecision(env, identity, requestedProjectId);
    if (live) {
      const row = await finishOnIdleRequest(env, requestId, "existing", {
        decision_id:live.id, deadline:live.deadline, reason:"live_decision"
      }, now);
      return { status:200, body:onIdleRequestResponse(row) };
    }
    await env.DB.prepare("UPDATE onidle_requests SET status='processing',reason='lease_busy',updated_at=? WHERE id=?")
      .bind(now, requestId).run();
    const row = await env.DB.prepare("SELECT * FROM onidle_requests WHERE id=?").bind(requestId).first();
    return { status:202, body:onIdleRequestResponse(row) };
  }

  // Segunda lectura dentro del lease: el estado pudo cambiar entre el clic y el
  // turno de D1. Nunca se publica basándose en el guard anterior.
  live = await liveOnIdleDecision(env, identity, requestedProjectId);
  if (live) {
    const row = await finishOnIdleRequest(env, requestId, "existing", {
      decision_id:live.id, deadline:live.deadline, reason:"live_decision"
    }, now);
    return { status:200, body:onIdleRequestResponse(row) };
  }
  operational = await operationalOnIdleState(env, identity, requestedProjectId, now);
  if (!operational.can_open) {
    const row = await finishOnIdleRequest(env, requestId, "blocked", { reason:operational.reason }, now);
    return { status:409, body:{ ...onIdleRequestResponse(row), blockers:operational.blockers,
      quota:operational.quota } };
  }
  const published = await publishScheduledOnIdle(env, candidate, now);
  if (published.published) {
    const decision = await env.DB.prepare("SELECT deadline FROM decisions WHERE id=?").bind(published.decision_id).first();
    const row = await finishOnIdleRequest(env, requestId, "created", {
      decision_id:published.decision_id, deadline:decision && decision.deadline, reason:"published"
    }, now);
    return { status:201, body:onIdleRequestResponse(row) };
  }
  live = await liveOnIdleDecision(env, identity, requestedProjectId);
  if (live) {
    const row = await finishOnIdleRequest(env, requestId, "existing", {
      decision_id:live.id, deadline:live.deadline, reason:"live_decision"
    }, now);
    return { status:200, body:onIdleRequestResponse(row) };
  }
  const row = await finishOnIdleRequest(env, requestId, "blocked", {
    reason:published.reason || "scheduler_rejected"
  }, now);
  return { status:409, body:onIdleRequestResponse(row) };
}
__name(requestImmediateOnIdle, "requestImmediateOnIdle");

async function pauseTimedOutOnIdleBatches(env, identity, now = Date.now()) {
  const cutoff = now - MISSION_UNCONCLUDED_AFTER_MS;
  // El UPDATE condicional hace el guard idempotente: una repetición no cambia
  // updated_at ni duplica candidatos. Ticket, tareas y pruebas permanecen intactos.
  const rows = (await env.DB.prepare(
    "SELECT DISTINCT b.id,b.agent,b.machine FROM mission_batches b " +
    "JOIN mission_batch_items i ON i.batch_id=b.id JOIN tickets t ON t.id=i.mission_id " +
    "WHERE b.status='active' AND i.status='active' AND t.status='in_progress' " +
    "AND (CASE WHEN COALESCE(t.started_at,t.created_at)<4102444800 THEN COALESCE(t.started_at,t.created_at)*1000 ELSE COALESCE(t.started_at,t.created_at) END)<=?"
  ).bind(cutoff).all()).results || [];
  let paused = 0;
  for (const row of rows) {
    if (!sameAgentFamily(row.agent, identity.agent) ||
        !memberRefMatches("machine", row.machine || identity.machine, identity.machine)) continue;
    const result = await env.DB.prepare(
      "UPDATE mission_batches SET status='paused',pause_reason=?,updated_at=? WHERE id=? AND status='active'"
    ).bind("Límite operativo de 60 minutos: deja paso a OnIdle sin alterar trabajo ni evidencia.", now, row.id).run();
    paused += Number(result && result.meta && result.meta.changes || 0);
  }
  return paused;
}
__name(pauseTimedOutOnIdleBatches, "pauseTimedOutOnIdleBatches");
// Sincroniza una idea con su reloj de decisión (si lo tiene). Cuando la decisión se
// resolvió (elegida o vencida→recomendada) y su tanda materializó la misión, la idea
// pasa a «mision» con el mission_id de la misión activa del batch. READ-MOSTLY: sólo
// escribe cuando hay una misión materializada; «Volver atrás» (o cancelada) no
// convierte. La materialización en sí la hace el ciclo de /decisions (cron o GET).
async function syncIdeaFromDecision(env, idea) {
  const out = { status: idea.status, mission_id: idea.mission_id || "" };
  if (!idea.decision_id || idea.status === "mision" || out.mission_id) return out;
  const d = await env.DB.prepare("SELECT id,status,chosen,recommended,options,batch_id FROM decisions WHERE id=?").bind(idea.decision_id).first();
  if (!d || d.status === "pending") return out;       // sin decisión, o ventana aún abierta
  let options = []; try { options = JSON.parse(d.options || "[]"); } catch (e) {}
  const effective = d.status === "decided" ? Number(d.chosen) : d.status === "expired" ? Number(d.recommended) : null;
  // «Volver atrás» (o cancelada) → la idea NO se convierte en misión.
  if (!Number.isInteger(effective) || effective === options.length - 1 || d.status === "cancelled") return out;
  const batchId = d.batch_id || batchIdForDecision(d.id);
  const batch = await env.DB.prepare("SELECT active_mission_id FROM mission_batches WHERE id=?").bind(batchId).first();
  let mid = batch && batch.active_mission_id ? batch.active_mission_id : "";
  if (!mid) {
    const it = await env.DB.prepare(
      "SELECT mission_id FROM mission_batch_items WHERE batch_id=? AND mission_id IS NOT NULL AND mission_id!='' ORDER BY position LIMIT 1"
    ).bind(batchId).first();
    mid = it && it.mission_id ? it.mission_id : "";
  }
  if (!mid) return out;                                 // la tanda aún no materializó ninguna misión
  await env.DB.prepare("UPDATE ideas SET status='mision', mission_id=?, updated_at=? WHERE id=? AND status!='mision'")
    .bind(mid, Date.now(), idea.id).run();
  out.status = "mision"; out.mission_id = mid;
  return out;
}
__name(syncIdeaFromDecision, "syncIdeaFromDecision");

// ---- MODELO MISIONES · TAREAS ----------------------------------------------
// Una MISIÓN es el ticket/incidencia. Sus TAREAS son los pasos para concluirla.
// JORNADA COMPLETA (Carlos, 2026-07-21): 8 pasos (a..h), cada uno con hasta 3
// subtareas (a1..a3 … h1..h3) → máx 24. Así una sola misión asignada a un
// ordenador da trabajo para todo el día al agente que la ejecuta. Los planes
// antiguos de 3 pasos (a/b/c) siguen siendo válidos: a-h los incluye.
var TASK_CODE = /^[a-h]([1-3])?$/;
// EVIDENCIA DE TRABAJO DECLARADO (POST /declare). La ruta es pública para que
// los agentes cierren tareas desde el CLI, así que lo que impide que sea un
// grifo de marcador es esto: hay que enseñar algo comprobable. Vale un commit,
// el sello de un despliegue o una URL viva; basta con uno, pero alguno tiene
// que haber. Devuelve null si no hay nada que enseñar.
function declaredEvidence(raw) {
  const e = raw && typeof raw === "object" ? raw : {};
  const commit = String(e.commit || "").trim().slice(0, 64);
  const release = String(e.release || "").trim().slice(0, 64);
  const url = String(e.url || "").trim().slice(0, 300);
  const okCommit = /^[0-9a-f]{7,40}$/i.test(commit);
  // mismo formato que exige la norma 07: v.DD.MM.AAAA.rN.HH:MM
  const okRelease = /^v\.\d{2}\.\d{2}\.\d{4}\.r\d+\.\d{2}:\d{2}$/.test(release);
  const okUrl = /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:[/?#]|$)/i.test(url);
  if (!okCommit && !okRelease && !okUrl) return null;
  return {
    commit: okCommit ? commit : "",
    release: okRelease ? release : "",
    url: okUrl ? url : "",
    text: [okCommit ? "commit " + commit : "", okRelease ? "sello " + release : "", okUrl ? url : ""]
      .filter(Boolean).join(" · ")
  };
}

// POST /declare puede completar el lote D1 y perder únicamente la respuesta
// (timeout del cliente, cambio de host api↔rtc, corte de red). Un reintento no
// debe convertirse en otra misión ni en otros 40+15 puntos. La huella incluye
// sólo datos ya validados y el día operativo de Madrid: la misma declaración es
// idempotente durante la jornada, pero mañana puede volver a declararse.
// `idempotency_key` permite repetir deliberadamente un texto idéntico usando
// una clave nueva, y a la vez da a clientes nuevos una llave explícita estable.
async function declareMissionId(input) {
  const canonical = JSON.stringify({
    v:1,
    day:input.day,
    agent:input.agent,
    machine:input.machine,
    project_id:input.project_id,
    parent_id:input.parent_id || "",
    decision_id:input.decision_id || "",
    batch_id:input.batch_id || "",
    subject:input.subject,
    tasks:input.tasks.map((task) => ({
      code:task.code,
      title:task.title,
      status:task.status,
      report:task.report || "",
      evidence:task.evidence ? task.evidence.text : ""
    })),
    resolve:input.resolve === true,
    evidence:input.evidence ? input.evidence.text : "",
    idempotency_key:input.idempotency_key || ""
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return "DCL-" + hex.slice(0, 24);
}
__name(declareMissionId, "declareMissionId");

function sameIdempotentDeclaration(existing, identity, projectId, subject) {
  return !!existing && existing.source === "cli-declare" &&
    sameAgentFamily(existing.assignee || "", identity.agent) &&
    memberRefMatches("machine", existing.loc || identity.machine, identity.machine) &&
    String(existing.project_id || existing.project || "") === projectId &&
    String(existing.subject || "") === subject;
}
__name(sameIdempotentDeclaration, "sameIdempotentDeclaration");

// EL CUARTO ESTADO: «no aplicaba» (Carlos, 1-sep-2026).
//
// Por qué existe. El cierre exige que TODOS los pasos estén `done`
// (fleetReconcileMission), y sólo había tres estados. Cuando el planificador
// inventa pasos que el encargo nunca necesitó —FLT-1487 nació con «Conectar con
// Neo / Descargar configuración / Crear cuenta en Link / Subir configuración /
// Asignar permisos» para lo que era un cambio de identidad, no una migración de
// servidor— el agente sólo podía elegir entre dejar la misión abierta para
// siempre o marcar como HECHO trabajo que nadie hizo. Las dos mienten: una en el
// estado y la otra en el recuento. Era el cuarto caso de cinco.
//
// `no_aplica` deja cerrar con verdad: CONCLUYE el árbol pero NO cuenta como
// hecho y NO puntúa (el marcador cruza m.status='done', y este no lo es). Exige
// motivo escrito, porque un paso descartado sin explicación es indistinguible de
// uno abandonado. Y convierte «el planificador envenena cinco misiones» en un
// número que se puede mirar cada mañana.
var TASK_STATUS = ["pending", "in_progress", "done", "no_aplica"];
// CONCLUIDO ≠ HECHO. Un paso concluido no vuelve a bloquear el cierre; sólo el
// hecho suma. Toda comparación de cierre pasa por aquí para que no se separen.
var TASK_NO_APLICA = "no_aplica";
function tareaConcluida(t) {
  const st = String((t && t.status) || t || "");
  return st === "done" || st === TASK_NO_APLICA;
}
__name(tareaConcluida, "tareaConcluida");
function validTaskCode(c) {
  return typeof c === "string" && TASK_CODE.test(c);
}
__name(validTaskCode, "validTaskCode");
// Capa de ejecución sugerida. Nunca es el responsable ni el propietario de
// puntos: owner/assignee pertenecen siempre al agente principal.
function ownerFor(code, title) {
  if (/^[a-h]$/.test(code)) return "subagente";
  if (/verif|comprueb|report|valida|confirm|document|registr|informe|notific|cierr|cerra/i.test(title || "")) return "infraagente";
  return "subagente";
}
__name(ownerFor, "ownerFor");
function scopedMissionOwner(raw, fallbackRole, assignee, machine) {
  const value = String(raw || "").trim();
  const generic = /^infra(?:agente)?$/i.test(value) ? "infra"
    : /^sub(?:agente)?$/i.test(value) ? "sub" : "";
  const missionBase = baseAgentIdentity(assignee);
  if (!missionBase) return value;
  const parsed = parseAgentIdentity(value);
  if (generic || !value || sameAgentFamily(value, assignee)) {
    return scopedAgentIdentity(assignee, machine, generic || parsed.role || fallbackRole || "sub");
  }
  return value;
}
__name(scopedMissionOwner, "scopedMissionOwner");
async function listMissionTasks(env, mid) {
  const { results } = await env.DB.prepare(
    "SELECT mission_id, code, title, status, owner, executor, report, image, image_kind, created_at, started_at, ended_at, updated_at FROM mission_tasks WHERE mission_id=? ORDER BY code"
  ).bind(mid).all();
  const rows = results || [];
  await attachDisplayRefs(env, "task", rows, taskDisplayKey, (row) => row.created_at || row.updated_at);
  return rows;
}
__name(listMissionTasks, "listMissionTasks");
// TODAS las tareas de TODAS las misiones en UNA query (JOIN con tickets), para
// que /tareas e /informes no hagan N+1 (un /mission/<id>/tasks por misión, cada
// 15 s). Cada fila trae adjuntos los datos de su misión (subject/screen/loc/…)
// para agrupar/filtrar en cliente sin más peticiones. `scope` filtra igual que
// listTickets/stats. Sin LIMIT: recoge todas (evita el corte de 100 de /tickets).
// ── QUÉ ES «TRABAJO DE AGENTE» ──────────────────────────────────────────────
// Entra por DOS puertas, no por una: la bandeja de encargos (source='fleet') y
// las ventanas de decisión, que materializan la opción elegida —o la recomendada,
// si nadie contesta a tiempo— como misión con source='decision-batch'
// (activateNextMissionBatchItem). Filtrar solo por 'fleet' dejaba fuera la mitad
// del trabajo y tenía DOS caras feas: los MacBookAir de color, que tiran casi
// siempre de ventana de decisión, salían con 0 misiones y 0 tareas en el
// Highscore aunque llevaran horas trabajando; y sus misiones se colaban en la
// bandeja de CAMPO, cuyo ámbito es «todo lo que no es fleet». Lo cazó Carlos
// mirando el marcador: «todos los que corren en un MacBookAir tienen 0 en
// misiones y 0 en tareas». (2026-08-04.)
// TERCERA PUERTA (2026-08-05): source='cli-declare', el trabajo que un agente
// declara desde el CLI con POST /declare. Mismo fallo de clase que el de arriba
// —una puerta nueva que el marcador no mira deja el trabajo a cero— y esta vez
// lo cacé al declarar mi propia jornada: cinco misiones registradas y el
// agregado seguía diciendo una. Que puntúe es precisamente el motivo de la
// ruta; lo que impide que sea un grifo es la evidencia obligatoria, no la
// exclusión del marcador.
// La lista y sus variantes SQL viven en mission-sources.js para que una puerta
// nueva no desaparezca de una ruta mientras sigue contando en otra.

async function acquireDailyMissionClose(env, plan, now) {
  const token = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID() : "daily-" + now + "-" + Math.random().toString(36).slice(2);
  const result = await env.DB.prepare(
    "INSERT INTO mission_daily_closures(day,closed_at,active_after,status,lease_token,started_at,finished_at,cancelled_count,error) " +
    "VALUES(?,?,?,'running',?,?,NULL,0,'') " +
    "ON CONFLICT(day) DO UPDATE SET closed_at=excluded.closed_at,active_after=excluded.active_after,status='running'," +
    "lease_token=excluded.lease_token,started_at=excluded.started_at,finished_at=NULL,error='' " +
    "WHERE mission_daily_closures.status!='done' AND (mission_daily_closures.status!='running' OR mission_daily_closures.started_at<=?)"
  ).bind(plan.day, plan.closedAt, plan.activeAfter, token, now, now - DAILY_MISSION_CLOSE_LEASE_MS).run();
  return { acquired:Number(result && result.meta && result.meta.changes || 0) > 0, token };
}
__name(acquireDailyMissionClose, "acquireDailyMissionClose");

// Cierra el último día COMPLETO de Madrid. El INSERT de eventos, el UPDATE de
// tickets y el sello `done` viajan en un único DB.batch transaccional. Si el
// isolate muere antes, el lease caduca y otro reintenta; si muere durante, D1
// revierte el lote. La condición y el NOT EXISTS hacen inocua cualquier repetición.
async function runDailyMissionClose(env, now = Date.now()) {
  const plan = { ...dailyMissionClosePlan(now), activeAfter:now - MISSION_UNCONCLUDED_AFTER_MS };
  const lease = await acquireDailyMissionClose(env, plan, now);
  if (!lease.acquired) {
    const current = await env.DB.prepare(
      "SELECT day,closed_at,active_after,status,started_at,finished_at,cancelled_count,error FROM mission_daily_closures WHERE day=?"
    ).bind(plan.day).first();
    return { ok:current && current.status === "done", skipped:true, ...(current || { day:plan.day, status:"running" }) };
  }
  const text = dailyMissionCloseEventText(plan.day);
  // Misma definición factual en INSERT y UPDATE: nació antes del cierre de día
  // y no registra actividad en los últimos 60 min. `updated_at`/`live_at`, tareas
  // y eventos protegen una misión antigua que de verdad siga trabajando hoy.
  const eligible = `${MISSION_SCOPE_SQL_T} AND t.status NOT IN ('resolved','cancelled') AND t.created_at IS NOT NULL AND t.created_at>0 ` +
    "AND (CASE WHEN t.created_at<4102444800 THEN t.created_at*1000 ELSE t.created_at END)<? " +
    "AND (CASE WHEN t.created_at<4102444800 THEN t.created_at*1000 ELSE t.created_at END)<? " +
    "AND (t.updated_at IS NULL OR (CASE WHEN t.updated_at<4102444800 THEN t.updated_at*1000 ELSE t.updated_at END)<?) " +
    "AND (t.live_at IS NULL OR (CASE WHEN t.live_at<4102444800 THEN t.live_at*1000 ELSE t.live_at END)<?) " +
    "AND NOT EXISTS(SELECT 1 FROM mission_tasks mt WHERE mt.mission_id=t.id AND (CASE WHEN mt.updated_at<4102444800 THEN mt.updated_at*1000 ELSE mt.updated_at END)>=?) " +
    "AND NOT EXISTS(SELECT 1 FROM events ae WHERE ae.ticket_id=t.id AND (CASE WHEN ae.ts<4102444800 THEN ae.ts*1000 ELSE ae.ts END)>=? " +
    "AND NOT (ae.kind=? AND ae.author=? AND ae.text=?))";
  const eligibilityBinds = [plan.closedAt, plan.activeAfter, plan.activeAfter, plan.activeAfter,
    plan.activeAfter, plan.activeAfter, DAILY_MISSION_CLOSE_EVENT_KIND, DAILY_MISSION_CLOSE_AUTHOR, text];
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO events(ticket_id,ts,kind,author,text) " +
        `SELECT t.id,?,?,?,? FROM tickets t WHERE ${eligible} ` +
        "AND NOT EXISTS(SELECT 1 FROM events e WHERE e.ticket_id=t.id AND e.kind=? AND e.author=? AND e.text=?)"
      ).bind(now, DAILY_MISSION_CLOSE_EVENT_KIND, DAILY_MISSION_CLOSE_AUTHOR, text, ...eligibilityBinds,
        DAILY_MISSION_CLOSE_EVENT_KIND, DAILY_MISSION_CLOSE_AUTHOR, text),
      env.DB.prepare(
        `UPDATE tickets AS t SET status='cancelled',closure_reason=?,closed_at=?,updated_at=?,resolved_at=NULL WHERE ${eligible}`
      ).bind(DAILY_MISSION_CLOSE_REASON, plan.closedAt, now, ...eligibilityBinds),
      env.DB.prepare(
        "UPDATE mission_daily_closures SET status='done',finished_at=?,cancelled_count=(" +
        "SELECT COUNT(*) FROM tickets WHERE closure_reason=? AND closed_at=?),error='' WHERE day=? AND lease_token=?"
      ).bind(now, DAILY_MISSION_CLOSE_REASON, plan.closedAt, plan.day, lease.token)
    ]);
    const result = await env.DB.prepare(
      "SELECT day,closed_at,active_after,status,started_at,finished_at,cancelled_count,error FROM mission_daily_closures WHERE day=?"
    ).bind(plan.day).first();
    return { ok:true, skipped:false, ...result };
  } catch (error) {
    await env.DB.prepare(
      "UPDATE mission_daily_closures SET status='error',finished_at=?,error=? WHERE day=? AND lease_token=?"
    ).bind(Date.now(), String(error && error.message || error).slice(0, 300), plan.day, lease.token).run().catch(() => {});
    throw error;
  }
}
__name(runDailyMissionClose, "runDailyMissionClose");

function parseAllTasksFilters(params) {
  const projectId = String(params.get("project_id") || "").trim();
  const mission = String(params.get("mission") || "").trim();
  const parseTime = (name) => {
    const raw = String(params.get(name) || "").trim();
    if (!raw) return null;
    if (!/^\d{10,13}$/.test(raw)) return NaN;
    const value = Number(raw);
    return Number.isSafeInteger(value) ? value : NaN;
  };
  const createdFrom = parseTime("created_from");
  const createdTo = parseTime("created_to");
  if (projectId.length > 160) return { ok:false, error:"project_id demasiado largo" };
  if (mission.length > 100) return { ok:false, error:"mission demasiado larga" };
  if (Number.isNaN(createdFrom) || Number.isNaN(createdTo)) return { ok:false, error:"created_from/created_to deben ser epoch ms" };
  if (createdFrom != null && createdTo != null && createdFrom >= createdTo) return { ok:false, error:"rango de creación inválido" };
  return { ok:true, projectId, mission, createdFrom, createdTo };
}
__name(parseAllTasksFilters, "parseAllTasksFilters");

async function listAllMissionTasks(env, scope, filters = {}) {
  const clauses = [], binds = [];
  if (scope === "fleet") clauses.push(AGENT_SOURCE_SQL_T);
  else if (scope !== "todas") clauses.push(FIELD_SOURCE_SQL_T);
  if (filters.projectId) {
    clauses.push("COALESCE(NULLIF(t.project_id,''),t.project)=?");
    binds.push(filters.projectId);
  }
  if (filters.mission) { clauses.push("m.mission_id=?"); binds.push(filters.mission); }
  if (filters.createdFrom != null) { clauses.push("t.created_at>=?"); binds.push(filters.createdFrom); }
  if (filters.createdTo != null) { clauses.push("t.created_at<?"); binds.push(filters.createdTo); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const prepared = env.DB.prepare(
    // ADITIVO (Carlos, 2026-07-23 · /informes): además del sello de creación
    // conservamos inicio de trabajo factual, FIN (t.resolved_at →
    // mission_resolved) y PRUEBA de cierre (t.proof_image →
    // mission_proof) para que la columna Captura tenga un fallback real cuando la
    // tarea no dejó imagen propia. No rompe a /tareas: sólo añade campos.
    `SELECT m.mission_id, m.code, m.title, m.status, m.owner, m.executor, m.report, m.image, m.image_kind, m.created_at, m.started_at, m.updated_at,
            t.subject, t.screen, t.loc, COALESCE(NULLIF(t.project_id,''),t.project) AS project, t.source, t.role, t.assignee, t.live_shot, t.live_at, t.live_kind,
            t.live_surface AS process_surface, t.live_context AS process_context,
            CASE WHEN t.live_kind='process' THEN t.live_shot ELSE NULL END AS process_image,
            CASE WHEN t.live_kind='process' THEN t.live_at ELSE NULL END AS process_captured_at,
            -- De qué vídeo nació la idea (Carlos, 7-ago-2026). LEFT JOIN a propósito:
            -- una misión que no viene de una idea sigue exactamente igual, con NULL,
            -- y la columna Proceso conserva su comportamiento de siempre.
            i.source_image AS idea_image, i.source_url AS idea_url, i.id AS idea_id,
            t.id AS parent_ticket_id, t.status AS mission_status, t.created_at AS mission_created,
            ${HIGHSCORE_WORK_STARTED_SQL} AS mission_started,
            t.resolved_at AS mission_resolved, t.proof_image AS mission_proof,
            t.points_start AS points_start, t.points_end AS points_end
       FROM mission_tasks m LEFT JOIN tickets t ON t.id = m.mission_id
       LEFT JOIN ideas i ON i.mission_id = t.id AND COALESCE(i.source_image,'') <> ''
       ${where}
       ORDER BY m.mission_id, m.code`
  );
  const { results } = await (binds.length ? prepared.bind(...binds) : prepared).all();
  const now = Date.now();
  const rows = (results || []).map((task) => {
    const operational = taskOperationalDetails(task, now);
    // Alias conservado porque `visible_state` sigue siendo el contrato temporal
    // común; `operational` sólo añade el ciclo del padre.
    const visible = operational;
    const missionStarted = highscoreActiveWorkMillis(task.mission_started);
    const missionResolved = highscoreActiveWorkMillis(task.mission_resolved);
    const timingValid = missionStarted > 0 && (!missionResolved || missionResolved >= missionStarted);
    return { ...task, visible_state:visible.state,
      mission_started:timingValid ? missionStarted : null,
      mission_generated_at:now, mission_timing_basis:timingValid ? (missionResolved ? "start_to_end" : "start_to_generated_at") : "missing_or_invalid_start",
      active_since:visible.active_since,
      visible_state_at:visible.transition_at, visible_state_reason:visible.reason,
      operational_state:operational.operational_state, parent_lifecycle:operational.parent_lifecycle,
      agent_identity: reportAgentIdentity(task.assignee, task.loc),
      ...legacyReportIdentityFields(task) };
  });
  await attachDisplayRefs(env, "task", rows, taskDisplayKey, (row) => row.created_at || row.updated_at);
  const missions = [...new Map(rows.map((row) => [row.mission_id, {
    id:row.mission_id,
    created_at:row.mission_created,
  }])).values()];
  await attachDisplayRefs(env, "mission", missions, (row) => row.id, (row) => row.created_at);
  const missionRefs = new Map(missions.map((mission) => [mission.id, mission.display_ref]));
  for (const row of rows) row.mission_display_ref = missionRefs.get(row.mission_id) || "";
  return rows;
}
__name(listAllMissionTasks, "listAllMissionTasks");

function legacyReportIdentityFields(task) {
  const identity = reportAgentFamily(task.executor || task.owner, task.loc);
  return { executor:identity.executor, executor_role:identity.role,
    family_key:identity.family_key, family_name:identity.family_name };
}
__name(legacyReportIdentityFields, "legacyReportIdentityFields");

function enrichReportTaskIdentity(task) {
  const identity = reportAgentFamily(task.executor || task.owner, task.loc);
  return { ...task, agent_identity: reportAgentIdentity(task.assignee || task.owner, task.loc), ...identity };
}
__name(enrichReportTaskIdentity, "enrichReportTaskIdentity");

function reportScopeClause(scope) {
  return scope === "fleet" ? AGENT_SOURCE_SQL_T
    : scope === "todas" ? "1=1" : FIELD_SOURCE_SQL_T;
}
__name(reportScopeClause, "reportScopeClause");

async function attachReportDisplayRefs(env, rows) {
  await attachDisplayRefs(env, "task", rows, taskDisplayKey, (row) => row.created_at || row.updated_at);
  const missions = [...new Map(rows.map((row) => [row.mission_id, { id:row.mission_id, created_at:row.mission_created }])).values()];
  await attachDisplayRefs(env, "mission", missions, (row) => row.id, (row) => row.created_at);
  const missionRefs = new Map(missions.map((mission) => [mission.id, mission.display_ref]));
  for (const row of rows) row.mission_display_ref = missionRefs.get(row.mission_id) || "";
}
__name(attachReportDisplayRefs, "attachReportDisplayRefs");

async function listMissionReportsPage(env, scope, options) {
  const filter = buildReportsPageFilter(options, reportScopeClause(scope));
  const generatedAt = Date.now();
  const sql = `SELECT m.mission_id,m.code,m.title,m.status,m.owner,m.executor,m.report,m.image,m.image_kind,m.created_at,m.started_at,m.ended_at,m.updated_at,
      t.subject,t.screen,t.loc,COALESCE(NULLIF(t.project_id,''),t.project) AS project,t.project_id,
      t.source,t.role AS mission_role,t.assignee,
      t.live_surface AS process_surface,t.live_context AS process_context,
      CASE WHEN t.live_kind='process' THEN t.live_shot ELSE NULL END AS process_image,
      CASE WHEN t.live_kind='process' THEN t.live_at ELSE NULL END AS process_captured_at,
      i.source_image AS idea_image, i.source_url AS idea_url, i.id AS idea_id,
      t.status AS mission_status,t.created_at AS mission_created,${HIGHSCORE_WORK_STARTED_SQL} AS mission_started,
      t.resolved_at AS mission_resolved,t.proof_image AS mission_proof,
      t.points_start AS points_start,t.points_end AS points_end
    FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id
    LEFT JOIN ideas i ON i.mission_id = t.id AND COALESCE(i.source_image,'') <> ''
    WHERE ${filter.page_sql}
    ORDER BY COALESCE(m.updated_at,0) DESC,m.mission_id DESC,m.code DESC LIMIT ?`;
  const result = await env.DB.prepare(sql).bind(...filter.page_binds, options.limit + 1).all();
  const fetched = result.results || [], hasMore = fetched.length > options.limit;
  const rows = fetched.slice(0, options.limit).map((raw) => {
    const row = enrichReportTaskIdentity(raw);
    const started = highscoreActiveWorkMillis(row.mission_started);
    const resolved = highscoreActiveWorkMillis(row.mission_resolved);
    const valid = started > 0 && (!resolved || resolved >= started);
    return { ...row, mission_started:valid ? started : null, mission_generated_at:generatedAt,
      mission_timing_basis:valid ? (resolved ? "start_to_end" : "start_to_generated_at") : "missing_or_invalid_start" };
  });
  await attachReportDisplayRefs(env, rows);
  let total = null, missionsReported = null;
  if (options.include_total) {
    const counted = await env.DB.prepare(
      `SELECT COUNT(*) AS total,COUNT(DISTINCT m.mission_id) AS missions_reported
         FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id WHERE ${filter.count_sql}`
    ).bind(...filter.count_binds).first();
    total = Number(counted && counted.total) || 0;
    missionsReported = Number(counted && counted.missions_reported) || 0;
  }
  return {
    tasks:rows,
    next_cursor:hasMore && rows.length ? encodeReportsCursor(rows[rows.length - 1]) : null,
    has_more:hasMore,
    total,
    summary:options.include_total ? { reports:total, missions_reported:missionsReported } : null,
    scope:{ project_id:options.project || null, updated_from:options.updated_from,
      updated_to:options.updated_to, timezone:"Europe/Madrid" },
    generated_at:generatedAt
  };
}
__name(listMissionReportsPage, "listMissionReportsPage");
// Guarda el plan completo (reemplaza el anterior). Valida codes y tope de 3
// subtareas por paso sobre 8 pasos (a..h) → máx 24 subtareas: la jornada
// completa de un agente (Carlos, 2026-07-21). Devuelve el plan resultante.
async function saveMissionPlan(env, mid, tasks) {
  const clean = [];
  const seen = /* @__PURE__ */ new Set();
  const subCount = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, h: 0 };
  const now = Date.now();
  const mission = await env.DB.prepare("SELECT assignee,loc FROM tickets WHERE id=?").bind(mid).first();
  for (const t of tasks || []) {
    const code = String((t && t.code) || "").trim().toLowerCase();
    if (!validTaskCode(code) || seen.has(code)) continue;
    if (code.length === 2) {
      const step = code[0];
      if (subCount[step] >= 3) continue;
      subCount[step]++;
    }
    seen.add(code);
    const title = String((t && t.title) || "").slice(0, 120);
    const status = TASK_STATUS.includes(t && t.status) ? t.status : "pending";
    const suggested = t && (t.executor || t.owner) ? String(t.executor || t.owner).slice(0, 40) : ownerFor(code, title);
    const executor = mission
      ? scopedMissionOwner(suggested, /^infra/i.test(suggested) ? "infra" : "sub", mission.assignee, mission.loc)
      : suggested;
    const owner = mission ? reportAgentIdentity(mission.assignee, mission.loc) : suggested;
    const report = t && t.report != null ? String(t.report).slice(0, 2e3) : null;
    clean.push({ mission_id: mid, code, title, status, owner, executor, report, created_at: now, updated_at: now });
  }
  await env.DB.prepare("DELETE FROM mission_tasks WHERE mission_id=?").bind(mid).run();
  for (const r of clean) {
    await env.DB.prepare(
      "INSERT INTO mission_tasks(mission_id,code,title,status,owner,executor,report,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)"
    ).bind(r.mission_id, r.code, r.title, r.status, r.owner, r.executor, r.report, r.created_at, r.updated_at).run();
  }
  return listMissionTasks(env, mid);
}
__name(saveMissionPlan, "saveMissionPlan");

// ── EL AGENTE PONE SUS PROPIAS SUBTAREAS (Carlos, 2026-08-09) ────────────────
// Un agente podía MARCAR una subtarea (/fleet/task-status) pero no CREARLA:
// /mission/<id>/tasks vive tras la verja Google y /declare admite como mucho las
// tres tareas a·b·c. Así que el árbol que venía de fábrica era el único que
// había, y repartir el trabajo entre subagentes —el motivo de que existan los
// tercios— quedaba fuera del alcance de quien trabaja: un solo agente tenía que
// hacerlo todo dentro de su propia ventana de contexto y se la comía entera.
//
// La escritura es ADITIVA a propósito. saveMissionPlan borra el plan entero
// antes de reescribirlo, y eso en manos de quien sólo quiere añadir «a1» es
// perder el trabajo ya informado de sus compañeros. Aquí no se borra nunca: se
// insertan los códigos que faltan y se retitula ÚNICAMENTE lo que sigue virgen
// (pendiente, sin informe y sin captura).
// Dos familias de plan de carton, no una. Al esqueleto de fabrica se suma la
// ceremonia que escupia el planificador cuando leia la nota de reparto de ids en
// vez del encargo: «Revision del encargo y asignacion de recursos / Desarrollo
// del software / Verificacion y reporte». Ocho misiones vivas seguian con ella el
// 10-ago y quedaban FUERA del barrido por no encajar en el patron anterior.
var SKELETON_TITLE_RE = /^(?:implementar|probar y aportar evidencia)\s*:|^documentar y reportar el resultado$|^revisi[oó]n del encargo\b|^desarrollo (?:y configuraci[oó]n del software|del software)\b|^verificaci[oó]n y reporte\b|^revisar ids$|^asignar (?:un )?(?:nuevo )?id$/i;

// Un plan es ESQUELETO cuando es exactamente el que siembra ensureFleetMainTasks
// y nadie ha dejado trabajo dentro: las tres tareas de fábrica, sin subtareas,
// sin informe y sin prueba. Sólo eso puede sustituirse sin preguntarle a nadie.
//
// `in_progress` NO descalifica (Morfeo, 2026-08-09): el auto-pickup marca «a» en
// curso a los pocos segundos del alta, así que exigir `pending` dejaba la ventana
// en nada y ninguna misión llegaba a planificarse — el mismo no-op de antes, sólo
// que más difícil de ver. Reclamar una tarea no es haberla trabajado; lo que sí
// es trabajo —informe, captura o un `done`— se respeta y bloquea la sustitución.
function isVirginSkeleton(tasks) {
  const rows = tasks || [];
  if (rows.length !== 3) return false;
  return rows.every((t) => /^[abc]$/.test(String(t.code || "")) && t.status !== "done" &&
    !String(t.report || "").trim() && !String(t.image || "").trim() &&
    SKELETON_TITLE_RE.test(String(t.title || "").trim()));
}
__name(isVirginSkeleton, "isVirginSkeleton");

async function bindPresenceWork(env, persona, machine, workRef, selector) {
  const unbound = reason => ({bound:false, reason});
  if (!env.TELEGRAM) return unbound("service_unavailable");
  if (!persona || !machine || !workRef) return unbound("invalid_binding");
  const exact = {};
  if (selector != null) {
    if (!selector || typeof selector !== "object" || Array.isArray(selector)) return unbound("invalid_session_selector");
    const runtime = String(selector.runtime || "").trim();
    const host = String(selector.host || "").trim().toLowerCase();
    const sessionId = String(selector.session_id || "").trim();
    if (!runtime || runtime.length > 80 || !["app","cli"].includes(host) || !sessionId || sessionId.length > 160 ||
        /[\u0000-\u001f]/.test(runtime + sessionId)) return unbound("invalid_session_selector");
    Object.assign(exact, {runtime,host,session_id:sessionId});
  }
  try {
    const response = await env.TELEGRAM.fetch(new Request("https://telegram/api/presence/work-bind", {
      method:"POST", headers:{"content-type":"application/json"},
      body:JSON.stringify({persona, machine, work_ref:workRef, ...exact})
    }));
    const body = await response.json();
    if (response.ok && body?.ok === true && body.bound === true) return {bound:true,reason:"bound"};
    const reason = ["ambiguous_session","session_not_found","invalid_session_selector","invalid_binding"].includes(body?.error)
      ? body.error : "binding_unavailable";
    return unbound(reason);
  } catch { return unbound("binding_unavailable"); }
}
__name(bindPresenceWork, "bindPresenceWork");

// Funde tasks en el plan vigente sin destruir nada. Devuelve qué entró, qué se
// retituló y qué se ignoró CON EL MOTIVO: un merge que calla lo que descartó es
// indistinguible de uno que no hizo nada.
async function mergeMissionPlan(env, mid, tasks, ticket) {
  const now = Date.now();
  const byCode = new Map((await listMissionTasks(env, mid)).map((t) => [t.code, t]));
  const subCount = { a: 0, b: 0, c: 0 };
  for (const code of byCode.keys()) if (code.length === 2 && subCount[code[0]] != null) subCount[code[0]]++;
  const added = [], retitled = [], ignored = [];
  const seen = /* @__PURE__ */ new Set();
  // Por código: así una tarea madre que venga en la misma tanda ya existe
  // cuando le toca el turno a su subtarea ("a" ordena antes que "a1").
  const entrada = (tasks || []).slice().sort((x, y) =>
    String((x && x.code) || "").localeCompare(String((y && y.code) || "")));
  for (const t of entrada) {
    const code = String((t && t.code) || "").trim().toLowerCase();
    // SOLO TERCIOS: a·b·c y sus tres subtareas. Los pasos d..h siguen en el
    // esquema por historia, pero ensanchar el plan es justo lo que la regla
    // prohíbe, y este carril es nuevo: no nace ya con la puerta de atrás.
    if (!/^[abc][1-3]?$/.test(code) || seen.has(code)) {
      ignored.push({ code, why: "código no válido (a·b·c o a1..c3) o repetido" });
      continue;
    }
    seen.add(code);
    const title = String((t && t.title) || "").trim().slice(0, 120);
    if (!title) { ignored.push({ code, why: "sin título" }); continue; }
    const cur = byCode.get(code);
    if (cur) {
      // Se retitula lo que está pendiente, y también lo que sólo está reclamado
      // (in_progress) si su título SIGUE siendo el de fábrica: eso es el
      // auto-pickup, no trabajo de nadie. Un informe, una captura o un `done`
      // cierran la puerta en los dos casos.
      const limpio = !String(cur.report || "").trim() && !String(cur.image || "").trim();
      const deFabrica = SKELETON_TITLE_RE.test(String(cur.title || "").trim());
      const virgen = limpio && (cur.status === "pending" || (cur.status === "in_progress" && deFabrica));
      if (!virgen) { ignored.push({ code, why: "tiene avance, informe o prueba: no se pisa" }); continue; }
      if (String(cur.title || "") === title) { ignored.push({ code, why: "ya decía eso" }); continue; }
      await env.DB.prepare("UPDATE mission_tasks SET title=?, updated_at=? WHERE mission_id=? AND code=?")
        .bind(title, now, mid, code).run();
      byCode.set(code, { ...cur, title });
      retitled.push(code);
      continue;
    }
    if (code.length === 2) {
      const step = code[0];
      if (!byCode.has(step)) { ignored.push({ code, why: "su tarea madre «" + step + "» no existe" }); continue; }
      if (subCount[step] >= 3) { ignored.push({ code, why: "«" + step + "» ya tiene sus 3 subtareas" }); continue; }
      subCount[step]++;
    }
    const suggested = t && (t.executor || t.owner) ? String(t.executor || t.owner).slice(0, 40) : ownerFor(code, title);
    const executor = ticket
      ? scopedMissionOwner(suggested, /^infra/i.test(suggested) ? "infra" : "sub", ticket.assignee, ticket.loc)
      : suggested;
    const owner = ticket ? reportAgentIdentity(ticket.assignee, ticket.loc) : suggested;
    await env.DB.prepare(
      "INSERT INTO mission_tasks(mission_id,code,title,status,owner,executor,report,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)"
    ).bind(mid, code, title, "pending", owner, executor, null, now, now).run();
    byCode.set(code, { code, title, status: "pending", owner, executor });
    added.push(code);
  }
  return { tasks: await listMissionTasks(env, mid), added, retitled, ignored };
}
__name(mergeMissionPlan, "mergeMissionPlan");

async function setTaskStatus(env, mid, code, status, report, owner, image, imageKind, workSession) {
  const cur = await env.DB.prepare("SELECT * FROM mission_tasks WHERE mission_id=? AND code=?").bind(mid, code).first();
  if (!cur) return null;
  const st = TASK_STATUS.includes(status) ? status : cur.status;
  const rp = report != null ? String(report).slice(0, 2e3) : cur.report;
  // Una tarea hecha sin parte deja al equipo sin saber qué ocurrió y además
  // desaparece de /informes. El rechazo sucede antes de cualquier escritura.
  // Vale igual para el descarte: `no_aplica` sin motivo es indistinguible de un
  // abandono. La ruta HTTP ya lo exige, pero setTaskStatus es el escritor COMÚN
  // y no puede fiarse de que todos sus llamantes hayan validado antes.
  if ((st === "done" || st === TASK_NO_APLICA) && !String(rp || "").trim()) {
    const descarte = st === TASK_NO_APLICA;
    return { error: descarte ? "motivo_required" : "report_required",
      code: descarte ? "motivo_required" : "report_required",
      message: descarte
        ? "no se puede descartar un paso sin motivo: di por qué no aplicaba a esta misión"
        : "no se puede terminar una tarea sin informe", applied:false };
  }
  const mission = await env.DB.prepare("SELECT assignee,loc FROM tickets WHERE id=?").bind(mid).first();
  const ow = mission ? reportAgentIdentity(mission.assignee, mission.loc) : cur.owner;
  const ex = owner != null && mission
    ? scopedMissionOwner(String(owner).slice(0, 40), parseAgentIdentity(owner).role, mission.assignee, mission.loc)
    : cur.executor;
  // Captura PROPIA del paso: cada paso deja constancia con su enlace/miniatura. (954)
  const im = image != null && normalizeProofImage(image).value ? normalizeProofImage(image).value : cur.image;
  const ik = image != null ? (imageKind === "final" ? "final" : "task") : cur.image_kind;
  const now = Date.now();
  // `started_at` sólo nace en la primera transición a in_progress. Un reporte o
  // heartbeat repetido actualiza updated_at, pero no compra otros 60 minutos.
  // Volver explícitamente a pending inicia un ciclo nuevo y limpia el sello.
  await env.DB.prepare("UPDATE mission_tasks SET status=?, report=?, owner=?, executor=?, image=?, image_kind=?, " +
    "started_at=CASE WHEN ?='in_progress' THEN COALESCE(started_at,?) WHEN ?='pending' AND status!='pending' THEN NULL ELSE started_at END, " +
    "ended_at=CASE WHEN ? IN ('done','no_aplica') AND status NOT IN ('done','no_aplica') THEN COALESCE(ended_at,?) WHEN ? IN ('pending','in_progress') AND status IN ('done','no_aplica') THEN NULL ELSE ended_at END, " +
    "updated_at=? WHERE mission_id=? AND code=?")
    .bind(st, rp, ow, ex, im, ik, st, now, st, st, now, st, now, mid, code).run();
  const row = await env.DB.prepare("SELECT * FROM mission_tasks WHERE mission_id=? AND code=?").bind(mid, code).first();
  if (row && ["in_progress","doing","active"].includes(String(row.status || "")) && mission)
    row.work_binding = await bindPresenceWork(env, row.executor || row.owner, mission.loc, `${mid}:${code}`, workSession);
  if (row) await attachDisplayRefs(env, "task", row, taskDisplayKey, (item) => item.created_at || item.updated_at);
  return row;
}
__name(setTaskStatus, "setTaskStatus");
function parsePlanJson(raw) {
  if (!raw) return null;
  const s = String(raw);
  const i = s.indexOf("[");
  const j = s.lastIndexOf("]");
  if (i >= 0 && j > i) {
    try {
      const arr = JSON.parse(s.slice(i, j + 1));
      if (Array.isArray(arr) && arr.length) return arr;
    } catch (e) {
    }
  }
  // Tolerante: los LLM a veces emiten JSON con un fallo al final. Recupera los
  // objetos {...} de nivel superior bien formados por balance de llaves.
  const objs = [];
  let depth = 0, from = -1;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === "{") {
      if (depth === 0) from = k;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && from >= 0) {
        try {
          objs.push(JSON.parse(s.slice(from, k + 1)));
        } catch (e) {
        }
        from = -1;
      }
    }
  }
  return objs.length ? objs : null;
}
__name(parsePlanJson, "parsePlanJson");
// Aplana pasos (del LLM o del plan por defecto) a filas de tareas. Mapea los 3
// primeros pasos a los códigos a/b/c POR POSICIÓN (el "code" del LLM no es fiable)
// y sus subtareas a a1..a3/b1..b3/c1..c3. Titles recortados a 60 caracteres.
// Pasos/subtareas de pura CEREMONIA (no son trabajo, son proceso): «Recibir
// encargo», «Leer instrucciones», «Verificar prioridad», «Asignar subagente»…
// Se filtran para que el plan se ajuste al encargo y no infle 24 pasos de nada.
// (Carlos, 21/22-jul-2026)
var CEREMONY_RE = /recibir\s+(el\s+)?encargo|leer\s+(las\s+|el\s+)?instrucci|verificar\s+(la\s+)?prioridad|asignar\s+(el\s+)?subagente|acceder\s+al?\s+(sistema|encargo|panel)|reclamar\s+(el\s+)?encargo|ponerse\s+con\s+la\s+misi/i;
function stepTitle(step) {
  return String((step && (step.title || step.titulo || step.step || step.name || step.paso || step.descripcion || step.description)) || "");
}
// EL ENCARGO SUELE TRAER SU PROPIO PLAN, Y HASTA HOY SE TIRABA (2026-09-01).
// alta-mision.sh le pide al agente, por escrito, que describa «su plan a·b·c», y
// muchos encargos de Carlos vienen ya enumerados. Aun así el plan salía SIEMPRE de
// una llamada a la IA, que reescribía por su cuenta lo que ya estaba dicho. Pasó el
// 1-sep con la FLT-1503: el encargo decía literalmente «b) Diagnosticar por qué un
// mensaje no llega: leer el worker admira-telegram y los scripts del vault» y el
// planificador escribió «Crear nuevo bot con funcionalidades mejoradas». Nadie pidió
// un bot nuevo.
//
// Lo que está escrito se OBEDECE. Sólo se acepta como plan explícito si trae al menos
// dos marcas correlativas desde la primera (a· y b·, o 1. y 2.): con una sola no hay
// forma de distinguir un plan de una frase que empieza por «a)».
function extraerPlanExplicito(texto) {
  const t = String(texto || "");
  // a) a. a· / 1) 1. 1· — al principio de línea o tras un punto y espacio.
  const marcas = [...t.matchAll(/(?:^|[\s(])([a-hA-H1-8])[).·:]\s+/g)];
  if (marcas.length < 2) return null;
  const orden = "abcdefgh";
  const pasos = [];
  for (let i = 0; i < marcas.length; i++) {
    const letra = String(marcas[i][1]).toLowerCase();
    const idx = /[1-8]/.test(letra) ? Number(letra) - 1 : orden.indexOf(letra);
    if (idx !== pasos.length) continue;                 // correlativo o no vale
    const desde = marcas[i].index + marcas[i][0].length;
    const hasta = i + 1 < marcas.length ? marcas[i + 1].index : t.length;
    const cuerpo = t.slice(desde, hasta).trim().replace(/\s+/g, " ");
    if (cuerpo.length < 8) continue;
    pasos.push({ title: cuerpo, subtasks: [] });
  }
  return pasos.length >= 2 ? pasos.slice(0, 3) : null;
}
__name(extraerPlanExplicito, "extraerPlanExplicito");

// UNA SUBTAREA TIENE QUE APOYARSE EN EL ENCARGO (2026-09-01).
// El prompt ya pide no inventar, pero pedírselo a un modelo no es comprobarlo: si
// devuelve igualmente tres subtareas por paso, sin esto entran tal cual. Aquí se
// exige que la subtarea comparta al menos UNA palabra de contenido con el texto del
// encargo. No es semántica, es un suelo: «Recompilar software» o «Actualizar base de
// datos» en un encargo sobre identificadores no comparten nada y se caen.
//
// El sesgo es DELIBERADO y asimétrico: perder una subtarea buena cuesta poco -son
// opcionales y el agente puede añadirla con /fleet/plan-tasks-, mientras que colar
// una inventada bloquea el cierre de la misión durante semanas. Ante la duda, fuera.
// Los pasos a/b/c NO pasan por este filtro: salen del asunto y son estructurales.
var PALABRAS_VACIAS = new Set(["para","por","con","los","las","del","que","una","uno","este","esta","esto",
  "sus","sobre","desde","hasta","donde","como","cuando","todo","toda","todos","todas","cada","mas","muy",
  "hacer","haber","tener","poder","estar","segun","entre","tras","ante","bajo","sino","pero","aunque"]);
function palabrasDeContenido(texto) {
  return new Set(String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !PALABRAS_VACIAS.has(w)));
}
__name(palabrasDeContenido, "palabrasDeContenido");
// El PASO C es «verificar y reportar» por doctrina, no por el encargo: sus subtareas
// (verificar en real, publicar a la URL pública, avisar al grupo) son estructurales y
// NO tienen por qué aparecer en el texto. Filtrarlas era el falso positivo más caro
// del primer intento: se llevaba por delante justo las tres que siempre hay que hacer.
var CIERRE_DOCTRINAL_RE = /verific|comprob|report|informe|public|notific|avis|captur|evidenc|prueba|marcar/i;
// «identificacion» y «identificador» son la misma palabra a estos efectos. Sin esto,
// una subtarea legítima se caía por una letra de diferencia. Diez caracteres de raíz
// común es prudente: no empareja «config» con «configuracion» por accidente.
function mismaRaiz(a, b) {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  if (n < 6) return false;
  let i = 0; while (i < n && a[i] === b[i]) i++;
  return i >= 6 && i >= Math.min(a.length, b.length) - 4;
}
__name(mismaRaiz, "mismaRaiz");
function subtareaRespaldada(subtarea, encargoPalabras, esCierre) {
  if (esCierre && CIERRE_DOCTRINAL_RE.test(String(subtarea || ""))) return true;
  const suyas = palabrasDeContenido(subtarea);
  for (const w of suyas) for (const e of encargoPalabras) if (mismaRaiz(w, e)) return true;
  return false;
}
__name(subtareaRespaldada, "subtareaRespaldada");

function flattenSteps(steps, relleno, encargo) {
  const letters = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const tasks = [];
  const clean = (steps || []).filter((s) => { const t = stepTitle(s); return t && !CEREMONY_RE.test(t); });
  // Sin encargo (llamadas antiguas) no se filtra: mejor no tocar que romper.
  const vocabulario = encargo ? palabrasDeContenido(encargo) : null;
  // LA REGLA DE LOS TERCIOS NECESITA SUELO, NO SOLO TECHO (MorfeoMacMini, 11-08-2026).
  // Aquí había un slice(0,3) y nada más: cortaba lo que sobraba pero no completaba lo
  // que faltaba. El prompt pide «EXACTAMENTE 3 pasos» cuatro veces, sólo que pedirle
  // algo a una IA no es lo mismo que comprobar que lo ha hecho: si devuelve dos, se
  // guardan dos. Pasó el 11-ago con FLT-1381, que nació con la `a` y la `b` y sin `c`
  // —y la `c` es siempre «verificar y reportar»—, así que el alta anunciaba tres pasos,
  // el tercero no existía en ninguna parte y sólo se supo al intentar cerrarlo y recibir
  // un 404. Lo que no consta, nadie lo echa de menos: por eso se rellena en vez de
  // avisar. Un paso de molde que el agente reescribe es mucho mejor que un hueco.
  // El relleno va DESPUÉS del filtro de ceremonia, o volvería a quedarse corto.
  // Se rellena POR POSICIÓN, no por orden de lista: el hueco que queda casi siempre es
  // la `c`, y la `c` es siempre «verificar y reportar» — meterle ahí el «preparar» del
  // molde daría un plan de tres pasos que empieza dos veces y no termina nunca.
  const base = clean.slice(0, 3);
  // SOLO SE RELLENA LA `c`, Y SOLO CON LA VERIFICACIÓN (2026-09-01). Antes se
  // completaba hasta 3 con el molde de fábrica —«Preparar: alcance y punto de
  // partida», «Ejecutar el encargo»— y eso es trabajo INVENTADO metido en el árbol,
  // que luego el cierre exige dar por hecho. La `c` es la excepción legítima: todo
  // encargo termina verificando y reportando, lo diga o no, porque lo manda la
  // doctrina y no el planificador. El hueco de FLT-1381 (nacer sin `c` y descubrirlo
  // con un 404 al cerrar) se tapa igual, sin fabricar las otras dos.
  const molde = Array.isArray(relleno) ? relleno : [];
  const cierre = molde[molde.length - 1];
  if (base.length && base.length < 3 && cierre && !base.some((b) => /verific/i.test(stepTitle(b)))) {
    base.push({ title: stepTitle(cierre), subtasks: [] });
  }
  base.forEach((step, si) => {   // REGLA DE LOS TERCIOS: 3 pasos a/b/c (963)
    const code = letters[si];
    const title = String((step && (step.title || step.titulo || step.step || step.name || step.paso || step.descripcion || step.description)) || "").slice(0, 60) || "Paso " + code.toUpperCase();
    tasks.push({ code, title });
    const subsRaw = step && (step.subtasks || step.subtareas || step.tasks || step.tareas || step.pasos || step.items || step.steps);
    const subs = (Array.isArray(subsRaw) ? subsRaw : [])
      .map((s) => typeof s === "string" ? s : (s && (s.title || s.text || s.name)) || "")
      .filter((st) => st && !CEREMONY_RE.test(st))   // fuera la ceremonia también en subtareas
      .filter((st) => !vocabulario || subtareaRespaldada(st, vocabulario, code === "c"));
    // CERO SUBTAREAS ES UNA RESPUESTA VÁLIDA. El plan no se ensancha para llegar a
    // nueve: si el encargo no dice CÓMO, no hay subtareas que sacar, y el chip ya
    // sabe decir «plan incompleto» (borde discontinuo + ◌) en vez de disimularlo con
    // relleno. Las 5 subtareas descartadas de FLT-1487 y las 3 de FLT-1503 salieron
    // exactamente de este hueco: nueve casillas obligatorias que había que llenar.
    subs.slice(0, 3).forEach((st, i) => {
      tasks.push({ code: code + (i + 1), title: String(st).slice(0, 60) });
    });
  });
  return tasks;
}
__name(flattenSteps, "flattenSteps");
function defaultPlan() {
  return [
    { code: "a", title: "Diagn\xF3stico remoto de la incidencia", subtasks: ["Revisar proof-of-play y logs del player", "Verificar conectividad de red", "Confirmar alcance del fallo"] },
    { code: "b", title: "Intervenci\xF3n correctiva", subtasks: ["Reiniciar player y servicios de emisi\xF3n", "Restablecer la reproducci\xF3n de contenido"] },
    { code: "c", title: "Verificaci\xF3n y cierre", subtasks: ["Confirmar emisi\xF3n estable (proof-of-play)", "Reportar la resoluci\xF3n y cerrar el ticket"] }
  ];
}
__name(defaultPlan, "defaultPlan");
// Plan de respaldo para una misión de FLOTA (encargo a un agente), cuando la IA
// no devuelve un JSON usable.
function defaultFleetPlan() {
  return [
    { code: "a", title: "Preparar: alcance y punto de partida", subtasks: ["Localizar el proyecto y los ficheros implicados", "Reproducir el estado actual", "Definir el resultado esperado"] },
    { code: "b", title: "Ejecutar el encargo", subtasks: ["Hacer el cambio en la m\xE1quina que corresponde", "Desplegar a la URL p\xFAblica", "Ajustar hasta que quede como se pide"] },
    { code: "c", title: "Verificar y reportar", subtasks: ["Verificar en real, con captura por el camino del usuario", "Reportar a Carlos y al grupo", "Marcar el encargo hecho"] }
  ];
}
__name(defaultFleetPlan, "defaultFleetPlan");

// Propone el plan 3×(≤3) con Workers AI a partir del ticket (misión) y lo guarda.
// OJO: hay DOS mundos y no se planifican igual. Una misión de CAMPO es una avería
// de una pantalla DOOH; una de FLOTA es un encargo de Carlos a un agente de
// software. Con el prompt de campo, la IA planificaba los encargos como si fueran
// pantallas rotas («verificar si la pantalla Morfeo está encendida»).
function relleno0(isFleet) { return isFleet ? defaultFleetPlan() : defaultPlan(); }
__name(relleno0, "relleno0");
async function proposePlan(env, mid) {
  const t = await env.DB.prepare("SELECT * FROM tickets WHERE id=?").bind(mid).first();
  const subject = t ? t.subject : "Incidencia";
  const screen = t ? t.screen || "" : "";
  const loc = t ? t.loc || "" : "";
  const triage = t ? t.ai_triage || "" : "";
  const isFleet = !!t && t.source === "fleet";
  let prompt;
  // `full` (el texto integro del encargo) se declara AQUI, no dentro del if: lo
  // necesitan tanto el prompt como el extractor de plan explicito y el filtro de
  // respaldo, que viven despues del bloque. Declararlo dentro lo dejaba fuera de
  // alcance y proposePlan reventaba con ReferenceError -- que el catch de
  // fleetPlanPending se traga en silencio, dejando el esqueleto de fabrica. Cazado
  // en produccion con FLT-1510: el alta cantaba "planificada" y el arbol era el molde.
  let full = "";
  let candidatos = [];
  if (isFleet) {
    // El texto íntegro del encargo es el primer evento de la misión (fleetSync).
    // EL ENCARGO NO ES SIEMPRE EL PRIMER EVENTO (Morfeo, 2026-08-10). Esto cogia
    // la fila mas antigua a ciegas, y cuando yokup ha tenido que reasignar el id
    // inserta ANTES su propia nota — «Reparto de ids: FLT-1330 ya pertenecia a
    // otra mision…». La IA acababa planificando la contabilidad interna en vez
    // del trabajo, y salian planes como «Revisar ids / Asignar id / Notificar
    // cambio» (FLT-1099, FLT-1100, FLT-1371). El 10-ago hubo que rescatar TRES
    // misiones a mano. Se descartan los eventos que escribe el propio yokup y se
    // toma el primero que de verdad trae el encargo; si no hay ninguno, se cae al
    // comportamiento de antes en vez de quedarse sin texto.
    const { results: evs } = await env.DB.prepare(
      "SELECT author, text FROM events WHERE ticket_id=? ORDER BY id ASC LIMIT 8"
    ).bind(mid).all();
    const esContable = (e) => {
      const autor = String(e && e.author || "").trim().toLowerCase();
      const txt = String(e && e.text || "");
      if (autor === "yokup") return true;                       // lo escribe el sistema, no Carlos
      return /^\s*reparto de ids\b|^\s*estado\s*→|^\s*misi[oó]n declarada/i.test(txt);
    };
    const util = (evs || []).find((e) => !esContable(e) && String(e.text || "").trim().length > 40);
    // EL TEXTO MAS LARGO GANA, y se guardan todos los candidatos. El subject se
    // almacena RECORTADO a ~118 caracteres con puntos suspensivos, asi que planificar
    // sobre el es planificar sobre media frase: el plan a·b·c del encargo queda
    // cortado en la «a)» y el extractor no ve ningun plan. Pasó con FLT-1512, cuyo
    // encargo traia su a·b·c escrito y aun asi acabó inventado por la IA.
    candidatos = [util && util.text, (evs || [])[0] && evs[0].text, subject]
      .map((x) => String(x || "").trim()).filter(Boolean);
    full = candidatos.reduce((a, b) => (b.length > a.length ? b : a), "");
    // EL PROMPT SE CONTRADECÍA A SÍ MISMO (2026-09-01). Pedía «usa SOLO los pasos que
    // el encargo REALMENTE necesite» y, en la misma frase, «EXACTAMENTE 3 pasos con
    // EXACTAMENTE 3 subtareas» — repetido cuatro veces. Gana lo que se repite: doce
    // casillas obligatorias para todo encargo, del tamaño que sea. Un cambio de
    // identidad tiene tres pasos reales; las otras nueve casillas hay que llenarlas
    // con algo, y ese algo se lo inventa el modelo. Así nacieron los cinco pasos de
    // migración de servidor de FLT-1487 y el «Crear nuevo bot» de FLT-1503.
    // Ahora: las subtareas son OPCIONALES y sólo salen de lo que el encargo dice.
    prompt = `Eres el agente principal de AdmiraNeXT, un equipo de agentes de IA que desarrolla software (webs, workers de Cloudflare, players de se\xF1alizaci\xF3n). Carlos, el arquitecto, ha hecho este ENCARGO al agente "${t.assignee || "un agente"}"${loc ? ' que corre en el ordenador "' + loc + '"' : ""}.

ENCARGO:
${String(full).slice(0, 900)}

Descomp\xF3n el encargo en un plan de 3 pasos: a, b y c. El paso c es SIEMPRE verificar y reportar.

REGLA QUE MANDA SOBRE TODAS LAS DEM\xC1S: no inventes trabajo. Cada paso y cada subtarea tiene que poder se\xF1alarse en el TEXTO del encargo de arriba. Si el encargo no dice C\xD3MO hacer algo, ese paso va SIN subtareas: cero es una respuesta correcta y esperada, y es MUCHO mejor que rellenar.

Nunca deduzcas el procedimiento habitual de una tarea que suena parecida. Ejemplo real de lo que NO hay que hacer: un encargo que dec\xEDa «cambiar la identidad can\xF3nica de un agente de Neo a Link» se plane\xF3 como «Conectar con Neo / Descargar configuraci\xF3n / Crear cuenta en Link / Subir configuraci\xF3n / Asignar permisos», el manual de cualquier migraci\xF3n de servidor. No hab\xEDa ning\xFAn servidor: eran cinco pasos de trabajo que nadie hizo ni ten\xEDa que hacer, y bloquearon el cierre de la misi\xF3n durante semanas.

Cada paso lleva de 0 a 3 subtareas, s\xF3lo las que el encargo respalde. No rellenes con ceremonia (recibir encargo, leer instrucciones, verificar prioridad, asignar subagente) ni con procedimiento gen\xE9rico (recompilar, refrescar cach\xE9, actualizar base de datos) si el encargo no lo menciona. Esto es trabajo de software: no inventes aver\xEDas de hardware ni pantallas. En espa\xF1ol, cada title de m\xE1ximo 60 caracteres.

Responde SOLO con un array JSON v\xE1lido, sin texto adicional, con esta forma:
[{"code":"a","title":"<paso a: el trabajo real que dice el encargo>","subtasks":["<s\xF3lo si el encargo dice c\xF3mo>"]},{"code":"b","title":"<paso b>","subtasks":[]},{"code":"c","title":"<verificar y reportar>","subtasks":[]}]
(3 objetos a/b/c. Las subtareas, de 0 a 3 cada uno: vac\xEDo si el encargo no las respalda.)`;
  } else {
    prompt = `Eres el agente principal del helpdesk Yokup (mantenimiento de pantallas DOOH de admira.tv). Descomp\xF3n la RESOLUCI\xD3N de esta incidencia en un PLAN AJUSTADO A SU TAMA\xD1O: SOLO los pasos que de verdad haga falta (EXACTAMENTE 3 pasos a/b/c, cada uno con EXACTAMENTE 3 subtareas (REGLA DE LOS TERCIOS de la casa: la misi\xF3n es SIEMPRE 3 tareas x 3 subtareas, para todos los agentes por igual; lo que no quepa va al TEXTO del paso o baja a microtarea, NO se ensancha el plan)), con c\xF3digos correlativos desde "a" (a, b, c…). Una incidencia sencilla son 1-3 pasos, NO ocho: no rellenes con ceremonia. Cada paso lleva EXACTAMENTE 3 subtareas concretas (verificaci\xF3n o ejecuci\xF3n). El array tendr\xE1 TANTOS objetos como pasos reales. Pasos concretos y accionables para resolver la aver\xEDa, en espa\xF1ol, cada title de m\xE1ximo 60 caracteres.

INCIDENCIA: ${subject}${screen ? " — pantalla " + screen : ""}${loc ? " (" + loc + ")" : ""}.
${triage ? "TRIAJE IA:\n" + triage : ""}

Responde SOLO con un array JSON v\xE1lido, sin texto adicional, con esta forma exacta:
[{"code":"a","title":"<paso a: concreto, dice el trabajo real>","subtasks":["<sub a1>","<sub a2>","<sub a3>"]},{"code":"b","title":"<paso b: concreto>","subtasks":["<sub b1>","<sub b2>","<sub b3>"]},{"code":"c","title":"<paso c: verificar y reportar>","subtasks":["<sub c1>","<sub c2>","<sub c3>"]}]
(EXACTAMENTE 3 objetos a/b/c, cada uno con EXACTAMENTE 3 subtareas: 3x3. Nunca 8.)`;
  }
  // 8 pasos × 3 subtareas no caben en 500 tokens: el JSON se cortaba y el
  // parser sólo rescataba los 3 primeros pasos (Carlos, 2026-07-21).
  // LO QUE EL ENCARGO YA DICE NO SE LE PREGUNTA A LA IA. Si Carlos (o el agente que
  // dio de alta) escribió su plan a·b·c, ese ES el plan: obedecerlo cuesta cero
  // llamadas y no puede inventar nada. La IA queda para los encargos que llegan en
  // prosa, que son los que de verdad hay que descomponer.
  // Se prueba en TODOS los candidatos, no solo en el elegido: basta con que UNO
  // conserve el a·b·c entero para que no haya que preguntarle nada a la IA.
  let explicito = null;
  if (isFleet) for (const c of candidatos) { explicito = extraerPlanExplicito(c); if (explicito) break; }
  if (explicito) {
    const propios = flattenSteps(explicito, relleno0(isFleet), full);
    if (propios.length) return saveMissionPlan(env, mid, propios);
  }
  const raw = await aiRun(env, prompt, 1800);
  // El plan de fábrica ya no es sólo el paracaídas de «la IA no devolvió nada»:
  // también tapa los huecos cuando devuelve un plan corto. Ver flattenSteps.
  const relleno = relleno0(isFleet);
  let tasks = flattenSteps(parsePlanJson(raw), relleno, isFleet ? full : "");
  if (!tasks.length) tasks = flattenSteps(relleno, relleno);
  return saveMissionPlan(env, mid, tasks);
}
__name(proposePlan, "proposePlan");
async function missionRoute(req, env, url) {
  await ensureSchema(env);
  const seg = url.pathname.split("/").filter(Boolean);
  const mid = decodeURIComponent(seg[1] || "");
  const sub = seg[2] || "";
  if (!mid) return json({ error: "mission id requerido" }, 400);
  if (sub === "tasks" && req.method === "GET") {
    return json({ tasks: await listMissionTasks(env, mid) });
  }
  if (sub === "tasks" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const arr = Array.isArray(b) ? b : b && b.tasks || [];
    return json({ tasks: await saveMissionPlan(env, mid, arr) });
  }
  if (sub === "task" && seg[3] && seg[4] === "status" && req.method === "POST") {
    const code = decodeURIComponent(seg[3]).toLowerCase();
    if (!validTaskCode(code)) return json({ error: "code inv\xE1lido" }, 400);
    const b = await req.json().catch(() => ({}));
    const row = await setTaskStatus(env, mid, code, b.status, b.report, b.owner, undefined, undefined, b.work_session);
    if (!row) return json({ error: "not-found" }, 404);
    if (row.error) return json({ ok:false, code:row.code, error:row.message,
      mission:mid, task_code:code, applied:false }, 409);
    // El árbol manda: si con esta tarea la misión arranca o queda concluida, el
    // encargo del bot-inbox se entera (solo en las transiciones reales).
    const fleet = await fleetReconcileMission(env, mid);
    return json({ ok: true, task: row, fleet });
  }
  if (sub === "plan" && req.method === "POST") {
    return json({ tasks: await proposePlan(env, mid) });
  }
  return json({ error: "not-found" }, 404);
}
__name(missionRoute, "missionRoute");
async function addEvent(env, ticketId, kind, author, text) {
  await env.DB.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)").bind(ticketId, Date.now(), kind, author, text).run();
}
__name(addEvent, "addEvent");
// La cronología es texto legible, no un almacén de imágenes: una captura pegada
// (data:image/…;base64) puede pesar ~195 KB y addEvent NO recorta, así que se
// duplicaría entera en events.text además de en proof_image/mission_tasks.image
// (FLT-988 fleco). En el evento va una ETIQUETA corta; la imagen sigue completa
// donde toca. Una URL http(s) sí se muestra entera: es corta y útil de pinchar.
function proofLabel(img) {
  const s = String(img == null ? "" : img);
  const m = /^data:image\/([a-z0-9+.-]+);base64,/i.exec(s);
  if (m) return "captura " + m[1] + " embebida (" + Math.round(s.length / 1024) + " KB)";
  return s;
}
__name(proofLabel, "proofLabel");
// UN PADRE NO PUEDE CONTRADECIR A SUS HIJAS (FLT-1373, 10-08-2026). Al cerrar una
// misión sólo se marcaban en bloque las tareas de un standalone, así que una misión
// normal podía quedar «resolved» con su tarea «a» en pending aunque a1, a2 y a3
// estuvieran hechas — y ahí se quedaba para siempre: /fleet/task-status rechaza
// tocar una misión cerrada y la convergencia exacta sólo existe para standalone.
// Esto NO da por hecho ningún trabajo: un padre converge sólo si TIENE subtareas y
// TODAS están done. Una hoja sin terminar se queda como está y se sigue viendo.
function convergeParentTasksStmt(env, mid, now) {
  return env.DB.prepare(
    "UPDATE mission_tasks SET status='done'," +
    "report=COALESCE(NULLIF(TRIM(report),''),(SELECT GROUP_CONCAT(h.code||': '||TRIM(h.report),' · ') FROM mission_tasks h WHERE h.mission_id=mission_tasks.mission_id AND h.code LIKE mission_tasks.code||'_'))," +
    "ended_at=COALESCE(ended_at,?),updated_at=? WHERE mission_id=? AND length(code)=1 AND status!='done'" +
    " AND EXISTS(SELECT 1 FROM mission_tasks h WHERE h.mission_id=mission_tasks.mission_id AND h.code LIKE mission_tasks.code||'_')" +
    " AND NOT EXISTS(SELECT 1 FROM mission_tasks h WHERE h.mission_id=mission_tasks.mission_id AND h.code LIKE mission_tasks.code||'_' AND (h.status!='done' AND h.status!='no_aplica' OR h.report IS NULL OR TRIM(h.report)=''))"
  ).bind(now, now, mid);
}
__name(convergeParentTasksStmt, "convergeParentTasksStmt");
async function lastEventKind(env, ticketId) {
  const r = await env.DB.prepare("SELECT kind FROM events WHERE ticket_id=? ORDER BY id DESC LIMIT 1").bind(ticketId).first();
  return r ? r.kind : null;
}
__name(lastEventKind, "lastEventKind");
async function createTicket(env, s) {
  const existing = await env.DB.prepare("SELECT id FROM tickets WHERE screen=? AND status NOT IN ('resolved','cancelled')").bind(s.screen).first();
  if (existing) return existing.id;
  const now = Date.now();
  const id = ("INC-" + now.toString(36).slice(-5) + Math.floor(Math.random() * 36).toString(36)).toUpperCase();
  const plantilla = await carbonRoster(env);
  const tech = plantilla[hash(s.screen) % plantilla.length];
  const loc = s.loc || "";
  const triage = await aiRun(env, `Eres el copiloto de soporte de Yokup (mantenimiento de pantallas DOOH). Incidencia: la pantalla "${s.screen}"${loc ? " en " + loc : ""} lleva ${s.age || 300} segundos sin se\xF1al de emisi\xF3n (proof-of-play ca\xEDdo). Responde SOLO en espa\xF1ol, \xFAtil y concreto (m\xE1x 55 palabras), EXACTAMENTE en 3 l\xEDneas:
\u{1F50D} Causa probable: ...
\u{1F6E0}\uFE0F Acci\xF3n inmediata: ...
\u{1F477} T\xE9cnico: s\xED/no \u2014 motivo`, 170);
  await backfillTodayDisplayRefs(env, now);
  await env.DB.prepare("INSERT OR IGNORE INTO tickets(id,screen,subject,loc,role,status,priority,assignee,source,ai_triage,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, s.screen, "Pantalla sin se\xF1al de emisi\xF3n", loc, s.role || "", "open", "urgente", tech.name, s.source || "agent-iot", triage, now, now).run();
  await ensureEntityDisplayRef(env, "mission", id, now);
  await addEvent(env, id, "log", "Agente IoT", "Incidencia detectada autom\xE1ticamente: pantalla sin se\xF1al de emisi\xF3n (proof-of-play ca\xEDdo).");
  await addEvent(env, id, "assign", "IA", `Auto-asignado a ${tech.name} (${tech.zone} \xB7 ${tech.skills}) por skills y zona.`);
  if (triage) await addEvent(env, id, "ai", "Copiloto IA", triage);
  await notifySubs(env);
  return id;
}
__name(createTicket, "createTicket");
// Incidencia GENÉRICA (Carlos, 2026-07-17: «todas las incidencias pasan por yokup»).
// Reutiliza la tabla tickets; source distingue el origen (monitor/presence/agent/
// external) y kind el tipo. 1 incidencia ACTIVA por recurso (índice idx_active_screen);
// el `resource` va prefijado por tipo (svc:/maq:/agt:) para no chocar con pantallas DOOH.
async function createIncident(env, inc) {
  await ensureSchema(env);
  const resource = String((inc && (inc.resource || inc.screen)) || "").slice(0, 160);
  if (!resource) return null;
  const existing = await env.DB.prepare("SELECT id FROM tickets WHERE screen=? AND status NOT IN ('resolved','cancelled')").bind(resource).first();
  if (existing) return existing.id;   // ya hay una abierta para este recurso
  const projectContext = await resolveCreationProject(env, {
    project_id:inc && inc.project_id, decision_id:inc && inc.decision_id,
    batch_id:inc && inc.batch_id, parent_id:inc && inc.parent_id,
    agent:inc && (inc.agent || inc.assignee), machine:inc && inc.machine
  });
  if (!projectContext.ok) {
    const error = new Error(projectContext.error);
    error.status = projectContext.status; error.code = projectContext.code;
    throw error;
  }
  const now = Date.now();
  const kind = String((inc && inc.kind) || "external").toLowerCase();
  const pref = { service: "SVC", svc: "SVC", machine: "MAQ", maquina: "MAQ", agent: "AGT", agente: "AGT" }[kind] || "INC";
  const id = (pref + "-" + now.toString(36).slice(-5) + Math.floor(Math.random() * 36).toString(36)).toUpperCase();
  const subject = String((inc && inc.subject) || "Incidencia").slice(0, 200);
  const loc = String((inc && inc.loc) || "").slice(0, 80);
  const prio = ["urgente", "alta", "normal", "baja"].includes(inc && inc.severity) ? inc.severity : "alta";
  const source = String((inc && inc.source) || "external").slice(0, 24);
  const plantilla = await carbonRoster(env);
  const assignee = (String((inc && inc.assignee) || "").slice(0, 60)) || (plantilla[hash(resource) % plantilla.length].name);
  await backfillTodayDisplayRefs(env, now);
  await env.DB.prepare("INSERT OR IGNORE INTO tickets(id,screen,subject,loc,role,status,priority,assignee,source,ai_triage,project,project_id,project_inherited,project_inherited_from,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, resource, subject, loc, kind, "open", prio, assignee, source, "", projectContext.project_id, projectContext.project_id, projectContext.inherited ? 1 : 0, projectContext.inherited_from || null, now, now).run();
  await ensureEntityDisplayRef(env, "mission", id, now);
  await addEvent(env, id, "log", (inc && inc.by) || "Monitor", (inc && inc.detail) || subject);
  await notifySubs(env);
  return id;
}
__name(createIncident, "createIncident");
// Marca la incidencia ABIERTA de un recurso como recuperada (misma semántica que el
// reconcile DOOH: evento 'recover', pendiente de verificación y cierre).
async function resolveIncident(env, resource, by, note) {
  await ensureSchema(env);
  const open = await env.DB.prepare("SELECT id FROM tickets WHERE screen=? AND status NOT IN ('resolved','cancelled')").bind(String(resource || "")).first();
  if (!open) return null;
  if (await lastEventKind(env, open.id) !== "recover") {
    await env.DB.prepare("UPDATE tickets SET updated_at=? WHERE id=?").bind(Date.now(), open.id).run();
    await addEvent(env, open.id, "recover", by || "Monitor", note || "Recurso recuperado. Pendiente de verificaci\xF3n y cierre.");
  }
  return open.id;
}
__name(resolveIncident, "resolveIncident");
// Monitor de SERVICIOS/webs de la flota (Carlos, 2026-07-17): el cron comprueba
// cada web; 5xx o sin respuesta = incidencia; al recuperar, la cierra.
var FLEET_WEBS = [
  { url:"https://www.pixeria.com", project_id:"pixeria" },
  { url:"https://www.xpaceos.com", project_id:"xpaceos" },
  { url:"https://www.clearchannel.tv", project_id:"clearchannel-tv" },
  { url:"https://www.admira.live", project_id:"admira-live" },
  { url:"https://www.admira.tv", project_id:"admira-tv" },
  { url:"https://admiranext.com", project_id:"admiranext" },
  { url:"https://www.yokup.com", project_id:"yokup" },
  { url:"https://ainimation.studio", project_id:"ainimation-studio" }
];
async function checkWebs(env) {
  const checks = [];
  for (const monitored of FLEET_WEBS) {
    const web = monitored.url;
    let down = false, code = 0;
    try {
      const r = await fetch(web, { method: "GET", redirect: "manual", cf: { cacheTtl: 0 }, signal: AbortSignal.timeout(12e3) });
      code = r.status;
      down = code >= 500 || code === 0;   // 5xx o inalcanzable = caída (3xx/4xx = vivo)
    } catch (e) { down = true; }
    const resource = "svc:" + web;
    const dom = web.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
    if (down) {
      try {
        const incident = await createIncident(env, {
          resource, kind: "service", source: "monitor", severity: "urgente", project_id:monitored.project_id,
          subject: "Servicio caído: " + dom + (code ? " (HTTP " + code + ")" : " (sin respuesta)"),
          detail: "El monitor detectó que " + web + " no responde" + (code ? " (HTTP " + code + ")" : "") + ".",
          by: "Monitor de servicios"
        });
        checks.push({ url:web, project_id:monitored.project_id, ok:true, down:true, incident });
      } catch (error) {
        // Un id retirado del censo o un fallo de UNA incidencia se informa, pero
        // nunca impide comprobar el resto de servicios ni después las máquinas.
        checks.push({ url:web, project_id:monitored.project_id, ok:false, down:true,
          error:String(error && error.message || error).slice(0,300) });
      }
    } else {
      try {
        const resolved = await resolveIncident(env, resource, "Monitor de servicios", dom + " responde de nuevo (HTTP " + code + ").");
        checks.push({ url:web, project_id:monitored.project_id, ok:true, down:false, resolved });
      } catch (error) {
        checks.push({ url:web, project_id:monitored.project_id, ok:false, down:false,
          error:String(error && error.message || error).slice(0,300) });
      }
    }
  }
  return { ok:checks.every((item) => item.ok), checks };
}
__name(checkWebs, "checkWebs");

// Máquinas de la flota que DEBEN estar 24/7. Sólo se vigilan las que laten
// presencia de forma fiable (canónico: minúsculas sin símbolos). Los players
// Linux (dgx-spark, lenovo-thinkstation) NO laten presencia estable y viven tras
// Tailscale (inalcanzables desde el Worker) → NO se incluyen aquí para no generar
// falsos positivos permanentes; se añadirán cuando tengan heartbeat propio.
// Ampliar la lista es la única palanca para vigilar más equipos. Carlos 2026-07-17.
var CRITICAL_MACHINES = [
  { canon: "macmini", name: "Mac Mini", project_id:"admiranext" }
];
// Umbral de caída: si el latido más fresco de la máquina supera estos minutos, se
// considera offline. La presencia late ~cada 3 min; 20 min = varios latidos perdidos.
var MACHINE_OFFLINE_MIN = 20;
// Dominio propio del bot-inbox (FLT-1633): va por el service binding TELEGRAM, el host solo nombra la ruta.
var PRESENCE_URL = "https://bot.yokup.com/api/presence";

function canonMachine(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
__name(canonMachine, "canonMachine");

async function checkMachines(env) {
  if (!env.TELEGRAM) return;
  let rows = [];
  try {
    const r = await env.TELEGRAM.fetch(new Request(PRESENCE_URL, { headers: { accept: "application/json" } }));
    const d = await r.json();
    rows = Array.isArray(d) ? d : (d.rows || d.presence || []);
  } catch (e) { return; }   // sin presencia no inventamos incidencias
  // Latido más fresco por máquina (canónico).
  const fresh = {};
  for (const row of rows) {
    const c = canonMachine(row && row.machine);
    if (!c) continue;
    let u = (row && (row.updated || row.updated_at || row.ts)) || 0;
    if (u && u < 4102444800) u *= 1000;   // s → ms
    if (!fresh[c] || u > fresh[c]) fresh[c] = u;
  }
  const now = Date.now();
  for (const m of CRITICAL_MACHINES) {
    const last = fresh[m.canon] || 0;
    const ageMin = last ? (now - last) / 60000 : Infinity;
    const resource = "maq:" + m.canon;
    if (ageMin > MACHINE_OFFLINE_MIN) {
      const hace = last ? "hace " + Math.round(ageMin) + " min" : "sin latido registrado";
      await createIncident(env, {
        resource, kind: "machine", source: "monitor", severity: "urgente", project_id:m.project_id,
        subject: "Máquina offline: " + m.name + " (" + hace + ")",
        detail: m.name + " es un equipo 24/7 y ha dejado de latir presencia (" + hace + "). Revisa que esté encendido, con red y con sus agentes arrancados.",
        by: "Monitor de flota"
      });
    } else {
      await resolveIncident(env, resource, "Monitor de flota", m.name + " vuelve a latir (hace " + Math.round(ageMin) + " min).");
    }
  }
}
__name(checkMachines, "checkMachines");

async function reconcile(env) {
  let screens = [];
  try {
    const r = await fetch("https://api.admira.store/signage/screens", { cf: { cacheTtl: 5 } });
    const d = await r.json();
    screens = d.screens || [];
  } catch (e) {
  }
  const now = Date.now();
  for (const s of screens) {
    const open = await env.DB.prepare("SELECT id FROM tickets WHERE screen=? AND status NOT IN ('resolved','cancelled')").bind(s.screen).first();
    if (!s.online) {
      if (!open) await createTicket(env, { screen: s.screen, loc: s.locName || s.loc || "", role: s.role, age: s.age_seconds });
    } else if (open) {
      if (await lastEventKind(env, open.id) !== "recover") {
        await env.DB.prepare("UPDATE tickets SET updated_at=? WHERE id=?").bind(now, open.id).run();
        await addEvent(env, open.id, "recover", "Agente IoT", "La pantalla ha recuperado la se\xF1al de emisi\xF3n. Pendiente de verificaci\xF3n y cierre.");
      }
    }
  }
  return screens;
}
__name(reconcile, "reconcile");
// scope: 'campo' (incidencias DOOH, por defecto) | 'fleet' (misiones de los agentes)
// | 'todas'. Sin esta separación las misiones de flota inundaban la bandeja de
// incidencias de Clear Channel, que comparte tabla.
// PAGINACIÓN (Carlos, 2026-07-17): las misiones de flota RESUELTAS se acumulan (con el
// arreglo de misiones rápidas nacen aún más) y el viejo LIMIT 100 fijo cortaba las más
// antiguas en «Todas»/«Finalizadas». Ahora el defecto sube a 300 (las activas siempre
// caben, van ordenadas primero) y se acepta ?limit (cap 1000) y ?offset para paginar.
function pageLimit(v) { const n = parseInt(v, 10); return n > 0 ? Math.min(1000, n) : 300; }
function pageOffset(v) { const n = parseInt(v, 10); return n > 0 ? n : 0; }
function ticketUniverseWhere(scope, filters = {}) {
  const clauses = [], binds = [];
  if (scope === "fleet") clauses.push(MISSION_SCOPE_SQL_T);
  else if (scope !== "todas") clauses.push(FIELD_MISSION_SCOPE_SQL_T);
  if (filters.day) {
    const range = missionDayRange(filters.day);
    if (!range) return { ok:false, error:"day debe ser YYYY-MM-DD válido" };
    clauses.push("(CASE WHEN t.created_at<4102444800 THEN t.created_at*1000 ELSE t.created_at END)>=? AND (CASE WHEN t.created_at<4102444800 THEN t.created_at*1000 ELSE t.created_at END)<?");
    binds.push(range.start, range.end);
  }
  const projectId = String(filters.project_id || "").trim().slice(0, 120);
  if (projectId) { clauses.push("COALESCE(NULLIF(t.project_id,''),t.project,'')=?"); binds.push(projectId); }
  // FLT-1015 · SOLO LO VIVO. El tablero pinta por defecto las misiones activas,
  // pero se traía el HISTORIAL ENTERO para descartarlo en el navegador: 1.132
  // filas para enseñar 63, cada 12 s, y con ~24 consultas de actividad por página
  // de mil ids. `state=vivas` recorta en SQL lo que el filtro ya iba a tirar.
  // Los contadores NO se recortan: se completan aparte (ver countsFuera).
  // Foto del universo ANTES del recorte de estado: es lo que hay que contar para
  // que los KPIs de «Finalizada» y «Eliminada» digan la verdad aunque no se
  // bajen esas filas.
  const sinEstado = clauses.slice(), bindsSinEstado = binds.slice();
  const soloVivas = String(filters.state || "") === "vivas";
  // El recorte tiene UNA excepción, y no es cosmética: el tablero «Activas»
  // conserva a propósito las misiones de agente cerradas hace menos de 3 h
  // (Carlos, 17-jul-2026) — las de la desktop app se cierran en segundos y sin
  // esto se asignan y no se llegan a ver nunca. Si el SQL las tirara, el filtro
  // por defecto perdería justo el trabajo que más corre.
  if (soloVivas) clauses.push(
    "(t.status NOT IN ('resolved','cancelled') OR (t.status='resolved' AND " + MISSION_SCOPE_SQL_T + " AND " +
    "(CASE WHEN COALESCE(t.resolved_at,t.updated_at)<4102444800 THEN COALESCE(t.resolved_at,t.updated_at)*1000 " +
    "ELSE COALESCE(t.resolved_at,t.updated_at) END) >= ?))");
  if (soloVivas) binds.push(Date.now() - 3 * 3600 * 1000);
  return { ok:true, sql:clauses.length ? "WHERE " + clauses.join(" AND ") : "", binds,
    day:filters.day || null, project_id:projectId || null, soloVivas,
    // El mismo universo SIN el recorte de estado, para poder contar lo cerrado
    // sin traérselo. Sin esto, pedir solo lo vivo dejaría los KPIs de
    // «Finalizada» y «Eliminada» a cero, que es peor que tardar.
    sqlSinEstado: sinEstado.length ? "WHERE " + sinEstado.join(" AND ") : "", bindsSinEstado };
}
async function listTickets(env, scope, limit, offset, filters = {}) {
  const universe = ticketUniverseWhere(scope, filters);
  if (!universe.ok) return universe;
  const take = pageLimit(limit), skip = pageOffset(offset);
  const { results } = await env.DB.prepare(
    `SELECT t.*, f.inbox_id FROM tickets t LEFT JOIN fleet_ids f ON f.mission_id=t.id
     ${universe.sql} ORDER BY (t.status='open') DESC, (t.status='in_progress') DESC, t.created_at DESC LIMIT ? OFFSET ?`
  ).bind(...universe.binds, take, skip).all();
  const rows = results || [];
  const counted = await env.DB.prepare(`SELECT COUNT(*) total FROM tickets t ${universe.sql}`).bind(...universe.binds).first();
  const total = Number(counted && counted.total) || 0;
  const activity = new Map();
  if (rows.length) {
    const taskActivity = await selectIn(env, rows.map((row) => row.id), (ph) =>
      `SELECT mission_id,MAX(updated_at) activity_at,
       MIN(CASE WHEN status IN ('in_progress','done','resolved') THEN COALESCE(started_at,updated_at,created_at) END) active_since
       FROM mission_tasks WHERE mission_id IN (${ph}) GROUP BY mission_id`
    );
    const eventActivity = await selectIn(env, rows.map((row) => row.id), (ph) =>
      `SELECT ticket_id mission_id,MAX(ts) activity_at FROM events WHERE ticket_id IN (${ph}) GROUP BY ticket_id`
    );
    for (const item of [...taskActivity, ...eventActivity]) {
      const current = activity.get(item.mission_id) || { activity_at:0, active_since:0 };
      current.activity_at = Math.max(Number(current.activity_at) || 0, Number(item.activity_at) || 0);
      const candidate = Number(item.active_since) || 0;
      if (candidate && (!current.active_since || candidate < current.active_since)) current.active_since = candidate;
      activity.set(item.mission_id, current);
    }
  }
  const now = Date.now();
  for (const row of rows) {
    const visible = missionVisibleDetails(row, now, activity.get(row.id) || false);
    row.visible_state = visible.state;
    row.active_since = visible.active_since;
    row.visible_state_at = visible.transition_at;
    row.visible_state_reason = visible.reason;
  }
  await attachImgCount(env, rows);
  // Nombre humano del proyecto junto al id, para que la lista no tenga que
  // cruzar /projects sólo para pintar un rótulo.
  const pidx = await projectIndex(env);
  for (const r of rows) r.project_name = resolveProject(pidx, r.project || "").name;
  await attachDisplayRefs(env, "mission", rows, (row) => row.id, (row) => row.created_at);
  // Los KPIs del tablero cuentan TODO el universo, se traiga o no. Cuando se pide
  // solo lo vivo, lo cerrado se cuenta con UNA agregada barata en vez de bajarse
  // mil filas para sumarlas en el navegador.
  const visible_counts = missionVisibleCounts(rows);
  if (universe.soloVivas) {
    const cerradas = await env.DB.prepare(
      `SELECT SUM(CASE WHEN t.status='resolved' THEN 1 ELSE 0 END) resolved,
              SUM(CASE WHEN t.status='cancelled' THEN 1 ELSE 0 END) cancelled,
              COUNT(*) total FROM tickets t ${universe.sqlSinEstado}`
    ).bind(...universe.bindsSinEstado).first();
    visible_counts.resolved = Number(cerradas && cerradas.resolved) || 0;
    visible_counts.cancelled = Number(cerradas && cerradas.cancelled) || 0;
    visible_counts.total = Number(cerradas && cerradas.total) || visible_counts.total;
  }
  return { ok:true, rows, visible_counts, universe:{
    scope, day:universe.day, project_id:universe.project_id, limit:take, offset:skip,
    returned:rows.length, total, has_more:skip + rows.length < total,
    state:universe.soloVivas ? "vivas" : "todas",
    state_semantics:"visible-v1", source_semantics:"mission-role-or-agent-source-v1"
  }};
}

// Nº de IMÁGENES adjuntas de cada misión, para que la tarjeta de la bandeja
// avise (📎 3) sin abrir el ticket. Las fotos viajan como URLs /media/ dentro
// del TEXTO de los eventos, así que se cuentan ahí — con UNA sola consulta
// agregada sobre los ids de la página (nada de N+1).
// Los eventos kind='proof' quedan FUERA: el pantallazo de cierre ya tiene su
// propia miniatura en la tarjeta, y contarlo sacaba un 📎 en toda misión
// terminada — señal duplicada, no información nueva.
// D1 admite como MUCHO 100 parámetros por consulta. Cualquier `IN (?,?,…)`
// construido sobre una lista de ids revienta el worker (error 1101) en cuanto
// la lista crece — y crece sola, con cada misión nueva. Pasó de verdad: al
// llegar a 101 misiones de flota, /fleet/missions empezó a dar 500 y tumbó el
// visor de admira.live/status. Este helper trocea en lotes y junta.
const D1_MAX_VARS = 90;   // margen sobre el límite real de 100
async function selectIn(env, ids, sqlFor) {
  const out = [];
  for (let i = 0; i < ids.length; i += D1_MAX_VARS) {
    const lote = ids.slice(i, i + D1_MAX_VARS);
    const ph = lote.map(() => "?").join(",");
    const { results } = await env.DB.prepare(sqlFor(ph)).bind(...lote).all();
    for (const r of results || []) out.push(r);
  }
  return out;
}
__name(selectIn, "selectIn");

async function attachImgCount(env, rows) {
  if (!rows.length) return;
  try {
    const ids = rows.map((r) => r.id);
    const results = await selectIn(env, ids, (ph) =>
      `SELECT ticket_id, GROUP_CONCAT(text, ' ') t FROM events WHERE ticket_id IN (${ph}) AND text LIKE '%/media/%' AND (kind IS NULL OR kind != 'proof') GROUP BY ticket_id`
    );
    const map = {};
    for (const r of results || []) map[r.ticket_id] = ((r.t || "").match(/\/media\//g) || []).length;
    for (const r of rows) r.img_count = map[r.id] || 0;
  } catch (e) {
    // contador cosmético: si falla, la bandeja sigue funcionando sin el 📎
  }
}
__name(attachImgCount, "attachImgCount");
__name(listTickets, "listTickets");

// ---- MISIONES DE FLOTA (agentes AdmiraNeXT) --------------------------------
// Doctrina (Carlos, 14-07-2026): yokup.com es el GESTOR ÚNICO del trabajo. Los
// encargos del bot-inbox de la flota (worker admira-telegram) se ingieren aquí
// como MISIONES source='fleet' con su mismo árbol de tareas abc/123, y
// admira.live/status deja de inventarse la misión: pasa a ser el VISOR que las
// lee de /fleet/missions.
// Se pide por el service binding FLEET_SVC (ver wrangler.toml): un fetch normal a
// este host hace loopback contra el propio yokup-rtc (mismo subdominio
// workers.dev) y devuelve su 404. Hace falta un host real porque el worker de
// destino enruta por hostname: con "https://admira-fleet/" a secas también da 404.
// Dominio propio fleet.yokup.com (FLT-1633): LaLiga bloquea workers.dev en horas de fútbol.
var FLEET_API = "https://fleet.yokup.com";
// Contrato público operativo: elimina chat/message/note. Durante el despliegue
// gradual puede omitir target_machine (caso real #1112); resolveFleetAssignment
// lo reconstruye sólo si el censo proyecto+agente+máquina da una pareja única.
// El endpoint privado exige Authorization y no se usa desde este binding.
// POR EL HOSTNAME INTERNO Y CON full=1 (2026-09-01). Iba por la URL pública, y la
// vista pública recorta el texto a 140 caracteres: el planificador NUNCA ha visto un
// encargo entero y lo que faltaba se lo inventaba. Medido: encargo de 247 caracteres
// que llegaba a la misión con 140. Por el service binding, el worker de telegram
// reconoce al llamante interno (hostname `telegram`) y sirve el texto íntegro; el
// saneado de secretos, comandos e IPs se le sigue aplicando igual.
var FLEET_INBOX = "https://telegram/api/public/inbox?limit=200&full=1";
// Estado del encargo → estado de la misión. 'ack' es acuse de recibo, no avance.
var FLEET_ST = { pending: "open", ack: "open", in_progress: "in_progress", done: "resolved", cancelled: "cancelled" };
// La captura pasa a ser contrato de cierre desde este despliegue. Las misiones
// históricas terminadas antes no se reabren: no existe forma honesta de fabricar
// hoy un pantallazo retroactivo de aquel trabajo.
var PROOF_REQUIRED_AFTER = 1784313450000; // 2026-07-17T18:37:30Z

// El inbox conserva íntegro el encargo y sus eventos; el asunto visible sólo
// necesita describir el trabajo. Se retiran exclusivamente cláusulas editoriales
// bien delimitadas: una fecha canónica para «Encargo de Carlos» o una identidad
// operativa reconocible para «Responsable». El texto posterior se conserva.
function cleanMissionAttributions(value) {
  let subject = String(value || "");
  const boundary = "(^|[.!?]\\s+)";
  const date = "(?:\\d{1,2}[-/](?:\\d{1,2}|ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[-/]\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\s+de\\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\\s+de\\s+\\d{4})";
  const agent = "(?:(?:Sub|Infra)?(?:Oraculo|Oráculo|Niobe|Morfeo|Neo|Link|Trinity|Cypher|Smith|Agente\\s+Smith|Persefone|Seraph|Wozniak|Jobs|Disney|Lucas)[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*(?:\\s+en\\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 -]+)?)";
  const sube = (_m, sep, ch) => sep + (ch ? ch.toUpperCase() : "");
  subject = subject.replace(new RegExp(boundary + "Encargo\\s+de\\s+Carlos\\s+el\\s+" + date + "\\s*(?::|\\.)\\s*(.?)", "gi"), sube);
  subject = subject.replace(new RegExp(boundary + "Responsable\\s*:?[ \\t]+" + agent + "\\s*\\.\\s*(.?)", "gi"), sube);
  // «Carlos, 7-ago-2026: …» y sus variantes (Carlos: 7-ago-2026 ·  |  (Carlos, 7-ago-2026)).
  // El título de una misión no tiene que decir quién la pidió ni cuándo: eso ya lo
  // dicen el autor y el sello de la ficha, y en 120 caracteres esa coletilla se come
  // el sitio de lo único que importa —qué hay que hacer—. Al quitarla, además, entra
  // más texto útil antes del corte.
  // Al quitar la coletilla, la frase que venía detrás se queda empezando en
  // minúscula («…de la idea. asi queda mejor»). Se sube su inicial: se borra un
  // metadato, no se estropea la redacción. Sólo aquí, donde sabemos que hemos
  // cortado; recapitalizar todo el texto convertiría «yokup.com» en «Yokup.com».
  subject = subject.replace(new RegExp(boundary + "\\(?\\s*Carlos\\s*[,:]?\\s*" + date + "\\s*\\)?\\s*[:·.\\-–—]?\\s*(.?)", "gi"), sube);
  subject = subject.replace(new RegExp(boundary + "Carlos\\s*[,:]\\s*(.?)", "gi"), sube);
  // Un paréntesis que sólo lleva una fecha —«(medido 7-ago)», «(2026-08-07)»— es
  // metadato, no enunciado. Con texto dentro se respeta: puede estar diciendo algo.
  subject = subject.replace(new RegExp("\\s*\\((?:[^()]{0,12}\\s)?" + date + "\\)", "gi"), "");
  return subject.replace(/\s+([.,;:])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
}
__name(cleanMissionAttributions, "cleanMissionAttributions");
function fleetSubject(text) {
  // El asunto sale de la PRIMERA LINEA, y en un encargo de agente esa linea es el
  // preambulo de bot-say.sh: sin quitarlo, la mision se titula «Soy Morfeo y estoy
  // corriendo en el ordenador MacMini.» y no dice nada de lo que hay que hacer.
  const limpio = quitarPreambuloDeAgente(String(text || ""));
  const line = cleanMissionAttributions(limpio.replace(/^\s*\[TAREA SUELTA\]\s*/i, "").split("\n")[0]);
  if (!line) return "Encargo de la flota";
  return line.length > 120 ? line.slice(0, 117) + "…" : line;
}
__name(fleetSubject, "fleetSubject");
function fleetStandaloneTask(text) {
  return /^\s*\[TAREA SUELTA\]\s*/i.test(String(text || ""));
}
__name(fleetStandaloneTask, "fleetStandaloneTask");
// Prioridad derivada del marcador [PRIORIDAD X] del texto del encargo (el mismo
// que la tarjeta saca del título y pinta como etiqueta). Sincroniza la etiqueta
// con el campo real (el punto de color). Carlos, 2026-07-18.
function fleetPriority(text) {
  const m = /\[\s*prioridad\s+(absoluta|urgente|alta|normal|media|baja)\s*\]/i.exec(String(text || ""));
  if (!m) return "normal";
  const p = m[1].toLowerCase();
  return p === "absoluta" ? "urgente" : p === "media" ? "normal" : p;
}
__name(fleetPriority, "fleetPriority");
// OJO: `screen` tiene un índice ÚNICO entre las activas (idx_active_screen),
// así que NO puede ser la máquina a secas — dos encargos abiertos del mismo
// ordenador chocarían al insertar. Se firma con el id del encargo: único y
// legible en la bandeja. La máquina va en `loc` y la persona en `assignee`.
function fleetAssignment(it) {
  const machine = String(it && it.target_machine || "").trim();
  const raw = String(it && it.target_persona || "").trim();
  return { assignee: raw ? scopedAgentIdentity(raw, machine) : "", loc: machine, complete: !!(raw && machine) };
}
__name(fleetAssignment, "fleetAssignment");
async function resolveFleetAssignment(env, it) {
  const direct = fleetAssignment(it);
  if (direct.complete) return direct;
  const project = String(it && it.project_id || "").trim(), raw = String(it && it.target_persona || "").trim();
  if (!project || !raw) return direct;
  const { results } = await env.DB.prepare("SELECT kind,ref FROM project_members WHERE project_id=? AND kind IN ('agent','machine')")
    .bind(project).all();
  const rows = results || [], agents = rows.filter((r) => r.kind === "agent").map((r) => String(r.ref || ""));
  const machines = rows.filter((r) => r.kind === "machine").map((r) => String(r.ref || ""));
  const key = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const matches = machines.filter((machine) => {
    const scoped = scopedAgentIdentity(raw, machine), report = reportAgentIdentity(raw, machine);
    return agents.some((agent) => sameAgentFamily(agent, raw) && (key(agent) === key(scoped) || key(agent) === key(report)));
  });
  return matches.length === 1 ? fleetAssignment({ ...it, target_machine: matches[0] }) : direct;
}
__name(resolveFleetAssignment, "resolveFleetAssignment");
function fleetScreen(it, assignment) {
  const a = assignment || fleetAssignment(it);
  return `${a.assignee || "?"}\xB7${a.loc || "?"} #${it.id}`;
}
__name(fleetScreen, "fleetScreen");

// «Soy <Agente> y estoy corriendo en el ordenador <Equipo>.» — lo antepone bot-say.sh a
// todo lo que publica un agente. Es firma, no contenido: se quita antes de juzgar nada.
function quitarPreambuloDeAgente(texto) {
  return String(texto || "")
    .replace(/^\s*soy\s+.{2,60}?(?:corriendo en|en el ordenador)[^.\n]*[.\n]\s*/i, "")
    .trim();
}
__name(quitarPreambuloDeAgente, "quitarPreambuloDeAgente");

// ¿Es un encargo DE VERDAD o charla de Telegram que se coló en el inbox?
// Una MISIÓN exige destinatario; y aun con destinatario se descarta el ruido
// típico del grupo: saludos de identidad («Soy X y estoy corriendo en…»),
// acuses/relés («ACK…», «Relé en verde…», «Busco contexto…») y despliegues
// anunciados por bot-say («DEPLOY …»). Pedido por Carlos (2026-07-15): los
// mensajes de Telegram que no son misiones NO se elevan a misión ni a tarea.
function fleetEsMision(it) {
  // Los compositores de conversación pueden usar el mismo buzón sin convertir
  // cada prompt en misión. Esta marca estructurada manda sobre texto/destino.
  if (it && it.materialize_mission === false) return false;
  // Destinatario = persona O máquina («solo máquina: quien esté allí» del alta
  // de yokup.com/misiones). Sin ninguno de los dos, es charla.
  if (!it.target_persona && !it.target_machine) return false;
  // EL PREAMBULO SE QUITA, NO DESCARTA LA PETICION (2026-09-02). bot-say.sh antepone
  // «Soy <Agente> y estoy corriendo en el ordenador <Equipo>.» a TODO lo que publica un
  // agente, asi que esta regla —pensada para ignorar los saludos de presencia— clasificaba
  // como charla CUALQUIER peticion de un agente a otro: ninguna llegaba a yokup. Carlos lo
  // pidio al reves: que se vean como misiones delegadas. Comprobado en vivo con el encargo
  // #1517, una peticion real a Neo que no materializo nada. Tercera aparicion del mismo
  // fallo el mismo dia: ya estaba en el router de Telegram (esCharla) y en el vigilante de
  // bandeja. Un saludo a secas se queda vacio al quitarle el preambulo y se descarta igual.
  const t = quitarPreambuloDeAgente(String(it.text || "").trim());
  if (!t) return false;
  if (/^(ack\b|✓|✅|rel[eé] en verde|busco contexto|deploy\b|desplegado\b|recibido\b)/i.test(t)) return false;
  // Auto-anuncios de PRESENCIA de un agente (no son encargos): un bot que avisa de
  // que está disponible («… en <máquina> operativo · llamadme», «vuelvo a conectar»,
  // «sigo vivo», «a la orden»). Se distinguen del encargo por estos marcadores, que
  // no aparecen en una orden de trabajo. Pedido por Carlos (2026-07-15).
  if (/\b(llamadme|avisadme si (me )?necesit\w*|a la orden|vuelvo a (conectar|estar)|reconectad\w*|sigo (vivo|aqu[ií]|operativ\w*|online)|estoy (de vuelta|online|operativ\w*|aqu[ií] y listo))\b/i.test(t)) return false;
  if (/\ben\s+\S+\s+(ya\s+)?operativ[oa]\b/i.test(t)) return false;   // «X en <máquina> operativo»
  return true;
}
__name(fleetEsMision, "fleetEsMision");

// El bot-inbox ha mandado ts unas veces en segundos y otras ya en milisegundos;
// multiplicar a ciegas por 1000 metió created_at en MICROsegundos y el MTTR
// salió negativo de miles de millones de minutos. Normaliza cualquier época a ms.
function epochMs(v, fallback) {
  let n = Number(v);
  if (!n || !isFinite(n)) return fallback;
  while (n > 1e14) n = n / 1e3;
  return Math.round(n > 1e11 ? n : n * 1e3);
}
__name(epochMs, "epochMs");

// ── REPARTO DE IDS DE FLOTA A PRUEBA DE COLISIONES (FLT-990 a) ───────────────
// El número de una misión de flota (FLT-<n>) era, sin más, el rowid del encargo en
// el bot-inbox de admira-telegram. Ese contador vive en OTRA base y se desincroniza
// del espacio REAL de misiones: si una misión nace en yokup con un FLT-<n> por otra
// vía (alta directa en D1, reloj de Oráculo), cuando el rowid del inbox alcanza ese
// mismo <n> el sync PISABA la misión ajena — le pasó a FLT-973 y FLT-974 de Oráculo,
// que amanecieron reasignadas a Neo. Ahora el id natural sigue siendo FLT-<rowid>
// mientras esté LIBRE (las 167 misiones existentes ya valen su rowid y se adoptan
// tal cual, sin duplicar); si ya está cogido por OTRA misión, el encargo recibe el
// SIGUIENTE id realmente libre (MAX real de tickets + 1) y la ajena NO se toca.
async function nextFreeFleetId(env, atLeast) {
  const a = await env.DB.prepare("SELECT MAX(CAST(SUBSTR(id,5) AS INTEGER)) mx FROM tickets WHERE id GLOB 'FLT-[0-9]*'").first();
  const b = await env.DB.prepare("SELECT MAX(inbox_id) mx FROM fleet_ids").first();
  let n = Math.max(Number(a && a.mx) || 0, Number(b && b.mx) || 0, Number(atLeast) || 0) + 1;
  for (let i = 0; i < 1e4; i++) {
    const taken = await env.DB.prepare("SELECT 1 x FROM tickets WHERE id=? UNION SELECT 1 x FROM fleet_ids WHERE mission_id=?").bind("FLT-" + n, "FLT-" + n).first();
    if (!taken) return "FLT-" + n;
    n++;
  }
  return "FLT-" + n;
}
__name(nextFreeFleetId, "nextFreeFleetId");

// ¿El ticket FLT-<rowid> que YA existe es el MISMO encargo que este item del inbox,
// o es una misión AJENA con la que colisiona el número? El asunto guardado en las
// misiones históricas venía a veces SIN truncar (139 chars) y otras con el recorte
// de fleetSubject (…), así que una igualdad estricta daba falsos negativos y
// duplicaba. Regla robusta al truncado: son el MISMO encargo si, quitado el «…»,
// el asunto más corto es PREFIJO del más largo (dos misiones distintas divergen
// pronto aunque compartan un «MISIÓN PRIORITARIA:» de cabecera).
function fleetSameEncargo(storedSubject, text) {
  const norm = (s) => String(s || "").replace(/…+$/, "").trim();
  const a = norm(storedSubject), b = norm(fleetSubject(text));
  if (a.length < 12 || b.length < 12) return a === b;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return long.startsWith(short);
}
__name(fleetSameEncargo, "fleetSameEncargo");

// mission_id ESTABLE y sin colisiones para un encargo del inbox. Idempotente:
// una vez repartido queda persistido en fleet_ids y se reusa en cada sync.
async function fleetMissionId(env, it) {
  const rowid = Number(it.id);
  if (!Number.isFinite(rowid)) throw new Error("El encargo no tiene un inbox_id numérico confirmable");
  const mapped = await env.DB.prepare("SELECT mission_id FROM fleet_ids WHERE inbox_id=?").bind(rowid).first();
  if (mapped && mapped.mission_id) {
    const mappedTicket = await env.DB.prepare("SELECT subject,screen,source FROM tickets WHERE id=?").bind(mapped.mission_id).first();
    // El mapa también puede ser histórico/corrupto. Sólo autoriza una escritura
    // sobre un ticket existente si el asunto o la referencia #inbox prueban que
    // es el mismo encargo; una mera coincidencia numérica nunca basta.
    if (!mappedTicket || mappedTicket.source === "fleet" &&
        (fleetSameEncargo(mappedTicket.subject, it.text) || inboxIdFromScreen(mappedTicket.screen) === String(rowid))) {
      return mapped.mission_id;
    }
  }
  const candidate = "FLT-" + rowid;
  const prev = await env.DB.prepare("SELECT subject,screen,source FROM tickets WHERE id=?").bind(candidate).first();
  let missionId, collided = false;
  if (!prev) {
    missionId = candidate;                              // libre → id natural = rowid
  } else if (prev.source === "fleet" && (fleetSameEncargo(prev.subject, it.text) || inboxIdFromScreen(prev.screen) === String(rowid))) {
    missionId = candidate;                              // el MISMO encargo ya sincronizado → adoptar (no duplica)
  } else {
    missionId = await nextFreeFleetId(env, rowid);      // COLISIÓN con misión ajena → no pisar, siguiente libre
    collided = true;
  }
  // Reservar no basta: dos sync concurrentes pueden observar el mismo hueco y
  // competir por UNIQUE(mission_id). INSERT OR IGNORE hace perder a uno sin error;
  // ese proceso jamás debe devolver su candidato provisional si no quedó mapeado.
  // Reintenta con otro hueco hasta leer SU fila confirmada. Un mapa corrupto ya
  // existente se corrige con UPDATE OR IGNORE por la misma razón.
  const repairing = !!(mapped && mapped.mission_id);
  for (let attempt = 0; attempt < 1e4; attempt++) {
    if (repairing) {
      await env.DB.prepare("UPDATE OR IGNORE fleet_ids SET mission_id=?,created_at=? WHERE inbox_id=?")
        .bind(missionId, Date.now(), rowid).run();
    } else {
      await env.DB.prepare("INSERT OR IGNORE INTO fleet_ids(inbox_id,mission_id,created_at) VALUES(?,?,?)")
        .bind(rowid, missionId, Date.now()).run();
    }
    const confirmed = await env.DB.prepare("SELECT mission_id FROM fleet_ids WHERE inbox_id=?").bind(rowid).first();
    // Si otro proceso reservó antes el mismo inbox, su mapping persistido es la
    // respuesta idempotente. Al reparar una fila inválida exigimos, en cambio,
    // que la actualización haya quedado exactamente confirmada.
    if (confirmed && confirmed.mission_id && (!repairing || confirmed.mission_id === missionId)) {
      const finalId = confirmed.mission_id;
      if (collided && finalId !== candidate) {
        await addEvent(env, finalId, "log", "yokup", `Reparto de ids: ${candidate} ya pertenecía a otra misión; este encargo (#${rowid}) recibió ${finalId} para no pisarla.`).catch(() => {});
      }
      return finalId;
    }
    missionId = await nextFreeFleetId(env, Math.max(rowid, Number(String(missionId).replace(/^FLT-/, "")) || 0));
    collided = true;
  }
  throw new Error(`No se pudo confirmar un mission_id único para el encargo #${rowid}`);
}
__name(fleetMissionId, "fleetMissionId");

// Contexto de compatibilidad sólo-lectura: un encargo antiguo puede no llevar
// project_id, pero su ticket ya censado sí. Se hereda únicamente si la
// procedencia prueba que es EL MISMO encargo; una colisión FLT nunca presta su
// proyecto a un alta nueva.
async function existingFleetMissionContext(env, it) {
  const rowid = Number(it && it.id);
  if (!Number.isFinite(rowid)) return "";
  const mapped = await env.DB.prepare("SELECT mission_id FROM fleet_ids WHERE inbox_id=?").bind(rowid).first();
  const ids = [...new Set([mapped && mapped.mission_id, "FLT-" + rowid].filter(Boolean))];
  for (const id of ids) {
    const ticket = await env.DB.prepare("SELECT id,subject,screen,source FROM tickets WHERE id=?").bind(id).first();
    if (ticket && ticket.source === "fleet" &&
        (fleetSameEncargo(ticket.subject, it.text) || inboxIdFromScreen(ticket.screen) === String(rowid))) return id;
  }
  return "";
}
__name(existingFleetMissionContext, "existingFleetMissionContext");

function fleetMainTasks(subject, assignment) {
  const short = String(subject || "Encargo de la flota").slice(0, 70);
  const owner = reportAgentIdentity(assignment.assignee || "Agente", assignment.loc) || assignment.assignee || "Agente";
  return [
    { code: "a", title: "Implementar: " + short, owner, executor:scopedAgentIdentity(owner, assignment.loc, "sub") },
    { code: "b", title: "Probar y aportar evidencia: " + short, owner, executor:scopedAgentIdentity(owner, assignment.loc, "sub") },
    { code: "c", title: "Documentar y reportar el resultado", owner, executor:scopedAgentIdentity(owner, assignment.loc, "infra") }
  ];
}
__name(fleetMainTasks, "fleetMainTasks");
async function ensureFleetMainTasks(env, missionId, subject, assignment, reassignPending) {
  const current = await listMissionTasks(env, missionId);
  const main = fleetMainTasks(subject, assignment), byCode = new Map(current.map((t) => [t.code, t]));
  const now = Date.now();
  for (const task of main) {
    if (!byCode.has(task.code)) {
      await env.DB.prepare("INSERT OR IGNORE INTO mission_tasks(mission_id,code,title,status,owner,executor,report,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
        .bind(missionId, task.code, task.title, "pending", task.owner, task.executor, null, now, now).run();
    }
  }
  if (!reassignPending) return;
  const targetBase = String(baseAgentIdentity(assignment.assignee) || "").toLowerCase();
  for (const task of current) {
    const raw = String(task.owner || "");
    if (raw && !/^(?:sub|infra)?(?:agente\s+)?(?:oraculo|oráculo|neo|morfeo|trinity|smith|cypher)/i.test(raw) && !/^(?:sub|infra)(?:agente)?$/i.test(raw)) continue;
    // Extras vacíos de otra familia son el plan corrupto de la asignación
    // anterior (caso Trinity en FLT-1140). Se eliminan sólo de ESTA misión;
    // una fila iniciada, informada o de la familia correcta se preserva.
    const ownerBase = String(baseAgentIdentity(raw) || "").toLowerCase();
    if (!/^[abc]$/.test(task.code) && task.status === "pending" && ownerBase && ownerBase !== targetBase && !String(task.report || "").trim() && !task.image) {
      await env.DB.prepare("DELETE FROM mission_tasks WHERE mission_id=? AND code=? AND status='pending' AND COALESCE(TRIM(report),'')='' AND COALESCE(TRIM(image),'')='' ")
        .bind(missionId, task.code).run();
      continue;
    }
    // Las tres principales tienen reparto canónico fijo; al reparar se conserva
    // status/report/image y se corrige únicamente la identidad visible.
    if (/^[abc]$/.test(task.code)) {
      const owner = reportAgentIdentity(assignment.assignee, assignment.loc);
      const executor = scopedAgentIdentity(assignment.assignee, assignment.loc, task.code === "c" ? "infra" : "sub");
      if (owner && owner !== raw) await env.DB.prepare("UPDATE mission_tasks SET owner=?,executor=COALESCE(NULLIF(executor,''),?),updated_at=? WHERE mission_id=? AND code=?")
        .bind(owner, executor, now, missionId, task.code).run();
    }
  }
}
__name(ensureFleetMainTasks, "ensureFleetMainTasks");

// Una tarea suelta conserva el contrato relacional existente (toda tarea tiene
// mission_id), pero no inventa un plan A/B/C. La misión-contenedor lleva una sola
// fila `a`, visible y operable desde /tareas como el encargo que pidió Carlos.
async function ensureFleetStandaloneTask(env, missionId, subject, assignment, reassignPending) {
  const current = await listMissionTasks(env, missionId);
  const owner = reportAgentIdentity(assignment.assignee || "Agente", assignment.loc) || assignment.assignee || "Agente";
  const executor = scopedAgentIdentity(owner, assignment.loc, "sub");
  const now = Date.now();
  const task = current.find((row) => row.code === "a");
  if (!task) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO mission_tasks(mission_id,code,title,status,owner,executor,report,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)"
    ).bind(missionId, "a", String(subject || "Tarea suelta").slice(0, 120), "pending", owner, executor, null, now, now).run();
  } else if (reassignPending && task.status === "pending" && owner && task.owner !== owner) {
    await env.DB.prepare("UPDATE mission_tasks SET owner=?,executor=COALESCE(NULLIF(executor,''),?),updated_at=? WHERE mission_id=? AND code='a'")
      .bind(owner, executor, now, missionId).run();
  }
  // Repara únicamente el plan ceremonial que pudiera haber creado una versión
  // anterior. Nunca borra trabajo iniciado, informes ni pruebas.
  await env.DB.prepare(
    "DELETE FROM mission_tasks WHERE mission_id=? AND code!='a' AND status='pending' " +
    "AND COALESCE(TRIM(report),'')='' AND COALESCE(TRIM(image),'')=''"
  ).bind(missionId).run();
}
__name(ensureFleetStandaloneTask, "ensureFleetStandaloneTask");

async function reconcileFleetTicket(env, id, prev, it, assignment, status, now, standalone) {
  const asig = assignment.complete ? assignment.assignee : prev.assignee;
  const loc = assignment.complete ? assignment.loc : (prev.loc || "");
  const subject = fleetSubject(it.text);
  const project = prev.project_id || prev.project || "";
  const role = standalone ? "standalone-task" : String(it.from_name || prev.role || "").slice(0, 80);
  const assignmentChanged = assignment.complete && (prev.assignee !== asig || (prev.loc || "") !== loc);
  const changed = prev.status !== status || (status === "in_progress" && !(Number(prev.started_at) > 0)) ||
    prev.assignee !== asig || (prev.loc || "") !== loc ||
    prev.subject !== subject || prev.source !== "fleet" || (prev.project || "") !== project || (prev.role || "") !== role;
  if (!changed) {
    if (standalone) await ensureFleetStandaloneTask(env, id, subject, assignment, false);
    return { changed: false, assignmentChanged: false, assignee: asig, loc, project, role, subject };
  }
  // El feed puede pasar de pending a active antes del siguiente sync. Esa
  // transición ES el claim factual del encargo y debe sellar started_at: si sólo
  // cambiamos status, active-work ve la misión pero no tiene reloj/progreso y la
  // elimina del corredor. COALESCE conserva cualquier inicio más preciso escrito
  // por nudge/task-status.
  await env.DB.prepare("UPDATE tickets SET status=?,assignee=?,loc=?,screen=?,subject=?,source='fleet',project=?,project_id=?,role=?,started_at=CASE WHEN ?='in_progress' THEN COALESCE(started_at,?) ELSE started_at END,updated_at=?,resolved_at=? WHERE id=?")
    .bind(status, asig, loc, fleetScreen(it, { assignee: asig, loc }), subject, project, project, role,
      status, now, now, status === "resolved" ? (prev.resolved_at || now) : null, id).run();
  if (assignmentChanged) await addEvent(env, id, "assign", "flota", "Reasignado a " + asig + " en " + loc + ".");
  if (standalone) await ensureFleetStandaloneTask(env, id, subject, assignment, assignmentChanged);
  else if (assignmentChanged) await ensureFleetMainTasks(env, id, subject, assignment, true);
  return { changed: true, assignmentChanged, assignee: asig, loc, project, role, subject };
}
__name(reconcileFleetTicket, "reconcileFleetTicket");

// ── PRESUPUESTO DEL SYNC ────────────────────────────────────────────────────
// fleetSync recorre SIEMPRE el buzón entero y por cada entrada encadena hasta ~33
// consultas a D1 EN SERIE. Con el buzón en 80 entradas la llamada tarda ~152 s medidos.
//
// OJO, esto NO es una caída, y el primer diagnóstico se equivocó: los http 000 que se
// veían eran el TIMEOUT DEL CLIENTE, no el worker muriéndose. Con 600 s de espera
// responde 200 en 151,8 s — y esa medición es del camino barato (seen:80, created:0,
// updated:0); con trabajo real es peor. El endpoint nunca estuvo muerto: es que ningún
// cliente aguanta dos minutos y medio (alta-mision.sh usaba 15-25 s), así que en la
// práctica nadie conseguía materializar una misión. Tampoco está probado que se pase
// del límite de 1.000 subpeticiones de un Worker: si lo excediera lanzaría error, no
// un 200. Lo medido es el coste, no el tope.
//
// Y empeora solo: el buzón crece y nada lo vacía — 50 de las 80 entradas son de julio.
//
// Arreglo: presupuesto por llamada. Se atiende lo nuevo con PRIORIDAD y el resto se repasa
// en una ventana rotatoria, de modo que nada queda sin mirar aunque ninguna llamada lo mire
// todo. Quien quiera drenar el buzón llama varias veces: la respuesta dice `more:true`.
var FLEET_SYNC_LOTE = 25;                   // 25 × ~33 consultas ≈ 825 < 1.000
var FLEET_SYNC_CURSOR = "fleet_sync_cursor";
var FLEET_SYNC_VISTO  = "fleet_sync_visto";  // id de encargo más alto ya atendido

async function prefLeer(env, key, porDefecto) {
  try {
    const r = await env.DB.prepare("SELECT value FROM prefs WHERE key=?").bind(key).first();
    const n = r && r.value != null ? parseInt(r.value, 10) : NaN;
    return Number.isFinite(n) ? n : porDefecto;
  } catch (e) { return porDefecto; }
}
async function prefEscribir(env, key, valor) {
  try {
    await env.DB.prepare(
      "INSERT INTO prefs (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
    ).bind(key, String(valor), Date.now()).run();
  } catch (e) {}
}

// Reparte el buzón entre lo que se atiende AHORA y lo que espera al siguiente sync.
// Pura a propósito: sin D1 dentro, para poder probarla sin base de datos.
function fleetSyncLote(items, cursor, visto, lote) {
  const nuevos = [], resto = [];
  for (const it of items) {
    if (!it || !it.id) continue;
    (Number(it.id) > Number(visto) ? nuevos : resto).push(it);
  }
  // Lo nuevo tiene PRIORIDAD, no barra libre. La primera versión los atendía todos sin
  // tope y su propio test la tumbó: con la marca de agua a 0 (primer sync tras desplegar)
  // TODO el buzón cuenta como nuevo y se reproducía el fallo intacto.
  nuevos.sort(function (a, b) { return Number(a.id) - Number(b.id); });
  const elegidos = nuevos.slice(0, lote);
  const hueco = Math.max(0, lote - elegidos.length);
  let inicio = 0;
  if (resto.length) inicio = ((cursor % resto.length) + resto.length) % resto.length;
  const delResto = Math.min(hueco, resto.length);
  for (let k = 0; k < delResto; k++) elegidos.push(resto[(inicio + k) % resto.length]);
  const avance = resto.length ? (inicio + delResto) % resto.length : 0;
  // La marca de agua NO salta a los nuevos que no cupieron: si avanzara, dejarían de ser
  // nuevos sin haberse procesado y caerían a la ventana lenta.
  const nuevosAtendidos = Math.min(nuevos.length, lote);
  const vistoNuevo = nuevosAtendidos ? Number(nuevos[nuevosAtendidos - 1].id) : Number(visto) || 0;
  return {
    elegidos: elegidos,
    cursor: avance,
    visto: Math.max(Number(visto) || 0, vistoNuevo),
    pendientes: (nuevos.length - nuevosAtendidos) + (resto.length - delResto),
  };
}

async function fleetSync(env) {
  let items = [];
  try {
    if (!env.TELEGRAM) return { ok: false, error: "no-telegram-binding", created: 0, updated: 0 };
    const r = await env.TELEGRAM.fetch(new Request(FLEET_INBOX, { headers: { accept: "application/json" } }));
    if (!r.ok) return { ok: false, error: "inbox-http-" + r.status, created: 0, updated: 0 };
    const d = await r.json();
    items = d.items || [];
  } catch (e) {
    return { ok: false, error: "inbox-unreachable: " + (e && e.message || e), created: 0, updated: 0 };
  }
  const now = Date.now();
  let created = 0, updated = 0;
  const rejected = [];
  // presupuesto por llamada: lo nuevo primero, el resto en ventana rotatoria (ver arriba)
  const totalBuzon = items.length;
  const cursorPrev = await prefLeer(env, FLEET_SYNC_CURSOR, 0);
  const vistoPrev  = await prefLeer(env, FLEET_SYNC_VISTO, 0);
  const lote = fleetSyncLote(items, cursorPrev, vistoPrev, FLEET_SYNC_LOTE);
  items = lote.elegidos;
  for (const it of items) {
    if (!it || !it.id) continue;
    if (!fleetEsMision(it)) continue;   // charla de Telegram: ni misión ni tarea
    const assignment = await resolveFleetAssignment(env, it);
    const standalone = fleetStandaloneTask(it.text);
    const existingContext = await existingFleetMissionContext(env, it);
    // EL GUARD ES DE NACIMIENTO, NO DE ACTUALIZACIÓN (6-ago-2026).
    // resolveCreationProject se aplicaba a TODOS los encargos, también a los que ya
    // tenían su misión creada. Efecto medido en producción: 39 encargos de la flota
    // se apuntaban como rechazados en cada sync y sus misiones —FLT-1166, FLT-1171,
    // FLT-1178…— llevaban días CONGELADAS en «in_progress» aunque el encargo estaba
    // cerrado, porque la actualización de estado moría en el guard. No era trabajo
    // perdido: era el tablero mintiendo sobre lo que seguía en curso.
    // Se mira si ya existe misión SIN reservar mission_id nuevo (reservarlo antes de
    // validar el proyecto es justo lo que prohíbe el contrato): se consulta el id ya
    // repartido y, con él, si el ticket existe de verdad.
    const repartido = await env.DB.prepare("SELECT mission_id FROM fleet_ids WHERE inbox_id=?").bind(it.id).first();
    const yaEsMision = repartido && repartido.mission_id
      ? await env.DB.prepare("SELECT id FROM tickets WHERE id=?").bind(repartido.mission_id).first()
      : null;
    // Lápida: cerrado hace más de 6 h y nunca llegó a ser misión. Más abajo ya se
    // descarta (anti-resurrección), pero allí es TARDE: pasaba antes por el guard y
    // se apuntaba como rechazado en cada sync, eternamente. Aquí no cuesta nada, que
    // la consulta de arriba ya dice si existe.
    if (!yaEsMision && (FLEET_ST[it.status] || "open") === "resolved" &&
        (now - epochMs(it.done_at, epochMs(it.ts, now))) > 6 * 3600 * 1e3) continue;
    // Sólo se resuelve proyecto para lo que va a NACER. Lo que ya existe se
    // actualiza con el proyecto que ya tenga: exigírselo lo dejaba inmóvil.
    const projectContext = yaEsMision
      ? { ok:false, existing:true }
      : await resolveCreationProject(env, {
          project_id:it.project_id, decision_id:it.decision_id, batch_id:it.batch_id,
          parent_id:it.parent_id || it.parent_mission_id || existingContext,
          agent:assignment.assignee, machine:assignment.loc
        });
    if (!projectContext.ok && !projectContext.existing) {
      rejected.push({ inbox_id:it.id, code:projectContext.code, error:projectContext.error });
      continue;
    }
    const id = await fleetMissionId(env, it);   // sólo reserva id tras validar proyecto
    let st = FLEET_ST[it.status] || "open";
    const ts = epochMs(it.ts, now);
    const prev = await env.DB.prepare("SELECT id,subject,project,project_id,source,role,status,assignee,loc,proof_image,started_at,resolved_at FROM tickets WHERE id=?").bind(id).first();
    // Un DONE del agente no basta: desde la fecha de obligatoriedad el espejo sólo
    // acepta un cierre canónico completo (prueba + z1 + parte en cada tarea). El bot
    // puede haber terminado, pero Yokup permanece EN CURSO hasta /fleet/informe.
    const canonicalCloseRequired = st === "resolved" && epochMs(it.done_at, now) >= PROOF_REQUIRED_AFTER;
    if (canonicalCloseRequired && !(prev && await hasCanonicalFleetClosure(env, id))) {
      st = "in_progress";
    }
    if (!prev) {
      // Red de seguridad del salto anterior: si el encargo parecía tener misión pero
      // el ticket no aparece, esto vuelve a ser un NACIMIENTO y sigue exigiendo
      // proyecto. Ninguna misión nace sin él por haber esquivado el guard.
      if (!projectContext.ok) {
        rejected.push({ inbox_id:it.id, code:"project_required",
          error:"No se puede crear una misión sin project_id explícito, heredado, declarado o el default Galaxia Admira" });
        continue;
      }
      // Una CANCELADA sin ticket no genera lápida: cancelar es reconocer que algo no
      // se hará, no crear una misión nueva para enterrarla. (Carlos, 2026-07-21)
      if (st === "cancelled") continue;
      // ANTI-RESURRECCIÓN, pero SIN perder misiones rápidas (Carlos, 2026-07-17):
      // un encargo cerrado hace MUCHO que nunca fue ticket es una lápida (limpieza
      // manual revivida por la ventana de done de 7 días del public/inbox — p.ej. las
      // máquinas fantasma Luna) → no nace. PERO una misión REAL que se completa rápido
      // (la desktop app cierra en segundos, ANTES de que el cron de 2 min la pille
      // activa) llega ya 'resolved' y SÍ debe nacer, o nunca aparecería en /misiones.
      // Umbral: solo saltamos las cerradas hace más de 6 h.
      if (st === "resolved" && (now - epochMs(it.done_at, ts)) > 6 * 3600 * 1e3) continue;
      await env.DB.prepare(
        // Las dos columnas de herencia van AL FINAL a propósito: el test de contrato
        // cruzado fija el prefijo (…,project,project_id,role,…) como prueba de que el
        // proyecto se escribe explícito y no se adivina del texto. Ese contrato sigue
        // valiendo, así que se respeta su orden en vez de relajar el test.
        // `points_start` va AL FINAL, detrás de la herencia, para no tocar el prefijo
        // que fija el test de contrato. Se sella AQUI, al nacer la misión, y no en el
        // primer latido: cuando una misión pasa a «en curso» ya suma sus 40 puntos, así
        // que sellar después recogía un total que YA los incluía y la resta con
        // points_end daba 0 — /informes decía «0 pts» de encargos que habían producido
        // 40 (Carlos lo vio en la sábana, 2026-08-08). El await se resuelve antes de
        // que exista la fila, así que el número es el de ANTES de este encargo.
        "INSERT OR IGNORE INTO tickets(id,screen,subject,loc,project,project_id,role,status,priority,assignee,source,ai_triage,created_at,started_at,updated_at,resolved_at,project_inherited,project_inherited_from,points_start) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
      ).bind(
        id, fleetScreen(it, assignment), fleetSubject(it.text), assignment.loc, projectContext.project_id, projectContext.project_id, it.from_name || "",
        st, fleetPriority(it.text), assignment.assignee, "fleet", "", ts,
        st === "in_progress" ? ts : null, now,
        st === "resolved" ? epochMs(it.done_at, now) : null,
        projectContext.inherited ? 1 : 0, projectContext.inherited_from || null,
        await puntosDeAgenteAhora(env, assignment.assignee, assignment.loc)
      ).run();
      // El texto íntegro del encargo queda como primer evento de la misión.
      await addEvent(env, id, "log", it.from_name || "Carlos", String(it.text || ""));
      await addEvent(env, id, "assign", it.from_name || "Carlos", "Asignado a " + assignment.assignee + " en " + assignment.loc + ".");
      if (standalone) await ensureFleetStandaloneTask(env, id, fleetSubject(it.text), assignment, false);
      else await ensureFleetMainTasks(env, id, fleetSubject(it.text), assignment, false);
      if (standalone) {
        await env.DB.prepare("UPDATE tickets SET role='standalone-task' WHERE id=?").bind(id).run();
      }
      created++;
    } else {
      // ANTI-RESURRECCIÓN de CANCELADAS: si la misión ya está cancelada en yokup, el
      // encargo del inbox NO la revive (aunque siga 'pending' en su ventana). Solo un
      // cancelled explícito la mantiene cancelada. (Carlos, 2026-07-21)
      if (prev.status === "cancelled" && st !== "cancelled") continue;
      // ANTI-RESURRECCIÓN de RESUELTAS: un inbox rezagado no puede degradar una
      // misión que Yokup ya cerró con prueba. El siguiente cierre sincronizará el
      // bot-inbox, pero mientras tanto la verdad terminal y su fecha se conservan.
      if (prev.status === "resolved" && st !== "cancelled" &&
          await hasMissionProof(env, id)) st = "resolved";
      // Telegram puede conservar unos segundos el PENDING anterior a una captura.
      // Ese eco retrasado no invalida progreso ya confirmado por YOKUP.
      if (prev.status === "in_progress" && st === "open") st = "in_progress";
      // Propaga identidad/proyecto sólo tras validar la procedencia en
      // fleetMissionId. El helper es el mismo que cubre la regresión #1112.
      const reconciled = await reconcileFleetTicket(env, id, prev, it, assignment, st, now, standalone);
      if (reconciled.changed) {
        // Al FINALIZAR una misión, su árbol a/b/c no puede quedarse en «pending»
        // para siempre (pasó con FLT-804: misión resuelta con informe y proof, y
        // las 9 subtareas colgadas como pendientes). El cierre con informe ES la
        // ejecución del plan: las subtareas aún pendientes se marcan hechas por
        // cierre, con owner explícito para no fingir que alguien las trabajó
        // una a una. Carlos, 2026-07-18.
        if (st === "resolved" && prev.status !== "resolved") {
          await env.DB.prepare(
            "UPDATE mission_tasks SET status='done', owner=COALESCE(NULLIF(owner,''),'auto-cierre'), ended_at=COALESCE(ended_at,?), updated_at=? WHERE mission_id=? AND status='pending'"
          ).bind(now, now, id).run();
          // Si finaliza apoyándose en la captura de un paso, asciende por el punto único (FLT-989 b1).
          await ascendMissionProof(env, id);
        }
        updated++;
      }
    }
  }
  // el cursor avanza aunque haya rechazos: si una entrada rota bloqueara la ventana,
  // el buzón dejaría de repasarse entero y volveríamos al problema de siempre.
  await prefEscribir(env, FLEET_SYNC_CURSOR, lote.cursor);
  await prefEscribir(env, FLEET_SYNC_VISTO, lote.visto);
  return { ok:true, partial:rejected.length > 0, seen:items.length,
           inbox:totalBuzon, pending:lote.pendientes, more:lote.pendientes > 0,
           created, updated, rejected };
}
__name(fleetSync, "fleetSync");

// ---- VUELTA: yokup → bot-inbox ---------------------------------------------
// El estado viajaba en un solo sentido (encargo → misión). Ahora, cuando el árbol
// de tareas avanza en yokup, el ENCARGO del bot-inbox se entera: así el agente ve
// en su buzón lo que Carlos ha marcado aquí.
//
// OJO: /api/bot-inbox/:id/status publica un mensaje en el grupo de Telegram cada
// vez que se llama. Por eso NO se propaga cada clic en una subtarea: solo las
// transiciones REALES del encargo (pendiente → en curso → hecho), comparando
// antes contra el estado que ya tenía. Si no cambia nada, no se escribe ni se
// avisa.
// ⚡ NUDGE inmediato al CLI del agente (Carlos, 2026-07-15: «mundo en real time,
// sin retrasos gratuitos»): encola un cmd `prompt` en admira-navegadores
// (deviceId local-<máquina>, misma convención que el executor y que el Directo
// de admira.live/status); el executor de esa máquina lo inyecta en su sesión
// viva (~5s de poll) — tmux «claude» o app Claude. PROTEGIDO por la sesión del
// perímetro; el Bearer del worker de navegadores va en el secreto NAV_CMD_TOKEN.
async function fleetNudge(env, b) {
  const machine = String(b.machine || "").trim();
  const text = String(b.text || "").trim().slice(0, 1500);
  const persona = String(b.persona || "").trim().slice(0, 40);
  const priority = b.priority === true;
  const runtime = String(b.runtime || "").trim().slice(0, 20);
  const host = /^(app|cli)$/.test(String(b.host || "").trim()) ? String(b.host).trim() : "";
  const missionId = /^FLT-\d+$/.test(String(b.missionId || "").trim())
    ? String(b.missionId).trim()
    : "";
  if (!machine || !text) return { ok: false, error: "machine y text requeridos" };
  if (!env.NAV_CMD_TOKEN) return { ok: false, error: "sin secreto NAV_CMD_TOKEN" };
  if (!env.NAVEGADORES) return { ok: false, error: "sin binding NAVEGADORES" };
  const deviceId = "local-" + machine.toLowerCase().replace(/[^a-z0-9]/g, "");
  // admira-navegadores conserva `url` en su cola, pero descarta campos nuevos.
  // Lo usamos como sobre de control interno: el texto que ve el LLM queda limpio.
  const control = priority
    ? "agent-focus://foreground?runtime=" + encodeURIComponent(runtime) + "&host=" + encodeURIComponent(host)
    : "";
  const r = await env.NAVEGADORES.fetch(new Request("https://navegadores.yokup.com/api/cmd", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + env.NAV_CMD_TOKEN },
    body: JSON.stringify({ deviceId, action: "prompt", url: control, text, persona })
  }));
  const d = await r.json().catch(() => ({}));
  const ok = !!(r.ok && d.ok);
  if (ok && missionId && (runtime || host)) {
    await env.DB.prepare(
      "UPDATE tickets SET agent_runtime=?,agent_host=?,updated_at=? WHERE id=?"
    ).bind(runtime, host, Date.now(), missionId).run();
  }
  let started = false;
  let statusPushed = false;
  // La cola del executor es el primer hecho fiable de que el agente ya recibió
  // el trabajo. No esperamos al cron: así incluso una misión que termina en menos
  // de dos minutos pasa por EN CURSO antes de llegar a FINALIZADA.
  if (ok && missionId) {
    const ticket = await env.DB.prepare(
      "SELECT id,source,status,assignee,loc FROM tickets WHERE id=?"
    ).bind(missionId).first();
    if (ticket && ticket.source === "fleet" && ticket.status === "open") {
      const updated = await env.DB.prepare(
        "UPDATE tickets SET status='in_progress',started_at=COALESCE(started_at,?),updated_at=? WHERE id=? AND status='open'"
      ).bind(Date.now(), Date.now(), missionId).run();
      started = Number(updated.meta?.changes || 0) > 0;
      if (started) {
        statusPushed = await fleetPushStatus(env, ticket, "in_progress");
        await addEvent(env, missionId, "log", "yokup",
          `Misión entregada al CLI de ${persona || "su agente"} en ${machine}; pasa a EN CURSO${statusPushed ? "" : " (sincronización del bot-inbox pendiente)"}.`);
      }
    }
  }
  return { ok, id: d.id || null, deviceId, started, statusPushed, foreground: priority, error: d.error || null };
}
__name(fleetNudge, "fleetNudge");

function fleetInboxId(mid) {
  const m = /^FLT-(\d+)$/.exec(String(mid || ""));
  return m ? m[1] : null;
}
__name(fleetInboxId, "fleetInboxId");
// El nº de encargo del bot-inbox va EMBEBIDO en el `screen` del ticket como «#<n>»
// (fleetScreen: «persona·máquina #<inbox_id>»). Ese es el dato REAL: desde el reparto
// anticolisión (FLT-990 a2) el id FLT-<n> puede diferir del encargo —FLT-1005 nació
// del encargo #991— y pelar «FLT-» apuntaba a un encargo que no existía. (FLT-990 c)
function inboxIdFromScreen(screen) {
  const m = /#(\d+)\b/.exec(String(screen || ""));
  return m ? m[1] : null;
}
__name(inboxIdFromScreen, "inboxIdFromScreen");
// Nº de encargo REAL de una misión de flota, del dato más fiable al menos fiable:
//   1) fleet_ids (mapa canónico inbox_id↔mission_id que dejó el propio reparto),
//   2) el «#<n>» embebido en el `screen` del ticket,
//   3) último recurso: pelar «FLT-» del id (roto tras el reparto, pero mejor que nada).
async function fleetEncargoId(env, mid, screen) {
  try {
    const row = await env.DB.prepare("SELECT inbox_id FROM fleet_ids WHERE mission_id=?").bind(mid).first();
    if (row && row.inbox_id != null && /^\d+$/.test(String(row.inbox_id))) return String(row.inbox_id);
  } catch (e) {}
  return inboxIdFromScreen(screen) || fleetInboxId(mid);
}
__name(fleetEncargoId, "fleetEncargoId");

async function fleetPushStatus(env, ticket, status) {
  // Dato REAL del encargo (fleet_ids → screen → pelar FLT). Antes pelaba «FLT-» a
  // secas y, tras el reparto anticolisión, empujaba el estado a OTRO encargo. (FLT-990 c)
  const id = await fleetEncargoId(env, ticket.id, ticket.screen);
  if (!id || !env.TELEGRAM) return false;
  try {
    const r = await env.TELEGRAM.fetch(new Request(
      `https://bot.yokup.com/api/bot-inbox/${id}/status`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          mission_id: ticket.id,
          mission_created_at: ticket.created_at || null,
          persona: ticket.assignee || "",
          machine: ticket.loc || "",
          verification: "Estado marcado en yokup.com/misiones (plan de tareas abc/123)."
        })
      }
    ));
    return r.ok;
  } catch (e) {
    return false;
  }
}
__name(fleetPushStatus, "fleetPushStatus");

// Deriva el estado de la MISIÓN a partir de su árbol y, si ha cambiado de verdad,
// lo baja al encargo del bot-inbox. Idempotente.
async function fleetReconcileMission(env, mid) {
  const t = await env.DB.prepare("SELECT id,source,status,assignee,loc,screen,role FROM tickets WHERE id=?").bind(mid).first();
  if (!t || t.source !== "fleet") return null;
  // Una CANCELADA no la revive el reconciliador por árbol (sus subtareas quedan
  // 'pending' y recalcularían 'open'). Cancelar es definitivo salvo reabrir manual.
  if (t.status === "cancelled") return { mission: mid, status: "cancelled" };
  const tasks = await listMissionTasks(env, mid);
  if (!tasks.length) return null;
  // CONCLUIDO, no «todo done»: un paso `no_aplica` con su motivo ya no bloquea.
  // Pero se exige AL MENOS UNA hecha de verdad: una misión cuyos pasos fueran
  // todos «no aplicaba» no es una misión terminada, es una misión que nunca
  // debió existir — y esa se cancela, no se resuelve.
  const allDone = tasks.every(tareaConcluida) && tasks.some((x) => x.status === "done");
  const noAplican = tasks.filter((x) => x.status === TASK_NO_APLICA).length;
  const hasInforme = tasks.some((x) => x.code === "z1" && x.status === "done" && String(x.report || "").trim());
  const reportsComplete = tasks.every((x) => x.status !== "done" || String(x.report || "").trim());
  const started = tasks.some((x) => x.status !== "pending");
  const proof = allDone ? await hasMissionProof(env, mid) : false;
  const derived = allDone && proof && hasInforme && reportsComplete ? "resolved" : started || allDone ? "in_progress" : "open";
  // El árbol se crea con todas las subtareas pendientes. Una captura de progreso
  // pone la misión en curso antes de que alguien toque ese árbol; por tanto, el
  // reconciliador solo puede PROMOVER el estado, nunca borrar ese progreso real.
  const next = t.status === "in_progress" && derived === "open" ? "in_progress" : derived;
  // ÁRBOL COMPLETO PERO SIN PRUEBA: antes esto era una degradación MUDA — la misión
  // se quedaba «en curso» y nadie sabía por qué (FLT-982/983/984 hubo que rematarlas
  // a mano en D1). Ahora lo dice, en su propia cronología y en la respuesta del API.
  if (allDone && !proof && t.status !== "resolved") {
    const txt = "⏸ El árbol está al 100% pero la misión NO puede finalizar: falta el pantallazo. Manda la captura con la última tarea (`image` en /fleet/task-status) o cierra con /fleet/informe.";
    const last = await env.DB.prepare("SELECT text FROM events WHERE ticket_id=? ORDER BY id DESC LIMIT 1").bind(mid).first();
    if (!last || last.text !== txt) await addEvent(env, mid, "log", "yokup", txt);
    // Si además no había cambio de estado que escribir, se responde aquí con el motivo.
    if (next === t.status) return { mission: mid, status: t.status, blocked: "sin-prueba", reason: txt };
  }
  if (allDone && proof && !reportsComplete && t.status !== "resolved") {
    const txt = "⏸ El árbol está hecho, pero contiene tareas sin informe. Ninguna tarea puede cerrarse sin dejar su parte.";
    const last = await env.DB.prepare("SELECT text FROM events WHERE ticket_id=? ORDER BY id DESC LIMIT 1").bind(mid).first();
    if (!last || last.text !== txt) await addEvent(env, mid, "log", "yokup", txt);
    if (next === t.status) return { mission:mid, status:t.status, blocked:"tareas-sin-informe", reason:txt };
  }
  if (allDone && proof && reportsComplete && !hasInforme && t.status !== "resolved") {
    const txt = "⏸ El trabajo está hecho y probado, pero espera el informe canónico z1 de /fleet/informe.";
    const last = await env.DB.prepare("SELECT text FROM events WHERE ticket_id=? ORDER BY id DESC LIMIT 1").bind(mid).first();
    if (!last || last.text !== txt) await addEvent(env, mid, "log", "yokup", txt);
    if (next === t.status) return { mission:mid, status:t.status, blocked:"sin-informe", reason:txt };
  }
  // No DEGRADAR una misión FINALIZADA a mano: el reconciliador por árbol solo PROMUEVE
  // (open→in_progress→resolved). El árbol se auto-genera y nadie marca sus subtareas
  // (queda 0/N), así que sin esta guarda reabría cada 2 min el FINALIZAR humano. Reabrir
  // es acción manual (botón REABRIR → /ticket/status), nunca del cron.
  if (t.status === "resolved" && next !== "resolved") return null;
  if (next === t.status) return null;            // sin cambio → ni escribe ni avisa al grupo
  const now = Date.now();
  await env.DB.prepare("UPDATE tickets SET status=?, updated_at=?, resolved_at=? WHERE id=?")
    .bind(next, now, next === "resolved" ? now : null, mid).run();
  // Si esta misión FINALIZA por respaldo (árbol al 100% + captura en algún paso),
  // la prueba asciende por el punto único para que no salga con el logotipo (FLT-989 b1).
  if (next === "resolved") await ascendMissionProof(env, mid);
  const inboxStatus = next === "resolved" ? "done" : next === "in_progress" ? "in_progress" : "pending";
  const pushed = await fleetPushStatus(env, t, inboxStatus);
  const descartes = noAplican ? ` · ${noAplican} paso(s) NO APLICABAN (no cuentan como hechos)` : "";
  await addEvent(env, mid, next === "resolved" ? "recover" : "log", "yokup",
    `La misión pasa a ${next} por su árbol de tareas. Encargo #${fleetInboxId(mid)} → ${inboxStatus.toUpperCase()}${pushed ? "" : " (no se pudo avisar al bot-inbox)"}.${descartes}`);
  // Los descartes VIAJAN en la respuesta y en la cronología: un cierre que no
  // dice cuántos pasos no aplicaban vuelve a contar 12/12 y a esconder el
  // problema del planificador, que es justo lo que este estado viene a destapar.
  return { mission: mid, status: next, inbox: inboxStatus, pushed, no_aplican: noAplican,
    blocked: allDone && !proof ? "sin-prueba" : null };
}
__name(fleetReconcileMission, "fleetReconcileMission");

// Barrido: deriva el estado de TODAS las misiones de flota con plan y baja al
// bot-inbox las que hayan cambiado. Va en el cron para que la vuelta no dependa de
// que el cambio haya pasado por el endpoint (un chip marcado, un UPDATE, otro
// cliente). Una sola consulta agregada — no una por misión.
async function fleetReconcileAll(env) {
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.status, t.assignee, t.loc, t.screen,
            COUNT(m.code) AS total,
            SUM(CASE WHEN m.status='done' THEN 1 ELSE 0 END) AS done,
            SUM(CASE WHEN m.code='z1' AND m.status='done' AND m.report IS NOT NULL AND TRIM(m.report)!='' THEN 1 ELSE 0 END) AS informes,
            SUM(CASE WHEN m.status='done' AND (m.report IS NULL OR TRIM(m.report)='') THEN 1 ELSE 0 END) AS done_sin_informe,
            SUM(CASE WHEN m.status<>'pending' THEN 1 ELSE 0 END) AS started
       FROM tickets t JOIN mission_tasks m ON m.mission_id = t.id
      WHERE t.source='fleet'
      GROUP BY t.id`
  ).all();
  const now = Date.now();
  const changed = [];
  for (const r of results || []) {
    if (!r.total) continue;
    if (r.status === "cancelled") continue;   // el barrido no revive una cancelada
    const allDone = r.done === r.total;
    const proof = allDone ? await hasMissionProof(env, r.id) : false;
    const derived = allDone && proof && Number(r.informes) > 0 && Number(r.done_sin_informe) === 0
      ? "resolved" : r.started > 0 || allDone ? "in_progress" : "open";
    // Mismo criterio monotónico que en el reconciliado individual: un árbol 0/N
    // no invalida una captura o un progreso que ya dejó la misión EN CURSO.
    const next = r.status === "in_progress" && derived === "open" ? "in_progress" : derived;
    // No reabrir un FINALIZAR humano desde el árbol auto-generado (ver fleetReconcileMission):
    // el barrido solo promueve, nunca degrada un resolved. Reabrir = botón REABRIR manual.
    if (r.status === "resolved" && next !== "resolved") continue;
    if (next === r.status) continue;
    await env.DB.prepare("UPDATE tickets SET status=?, updated_at=?, resolved_at=? WHERE id=?")
      .bind(next, now, next === "resolved" ? now : null, r.id).run();
    // Cierre por respaldo en el barrido: la prueba asciende por el punto único (FLT-989 b1).
    if (next === "resolved") await ascendMissionProof(env, r.id);
    const inboxStatus = next === "resolved" ? "done" : next === "in_progress" ? "in_progress" : "pending";
    const pushed = await fleetPushStatus(env, r, inboxStatus);
    await addEvent(env, r.id, "status", "yokup",
      `La misión pasa a ${next} por su árbol de tareas (${r.done}/${r.total}). Encargo #${fleetInboxId(r.id)} → ${inboxStatus.toUpperCase()}${pushed ? "" : " (no se pudo avisar al bot-inbox)"}.`);
    changed.push({ id: r.id, status: next, inbox: inboxStatus, pushed });
  }
  return { ok: true, changed, count: changed.length };
}
__name(fleetReconcileAll, "fleetReconcileAll");

// Planifica en bloque las misiones de flota VIVAS que aún no tienen árbol de
// tareas. Idempotente: solo toca las que están sin plan, así que repetir la
// llamada no regenera nada ni duplica coste de IA. Se limita por tanda porque
// cada plan es una llamada a Workers AI.
//
// PERO NINGUNA MISIÓN DE FLOTA LLEGA AQUÍ SIN PLAN (Carlos, 2026-08-09):
// /fleet/sync le clava a toda misión recién nacida el esqueleto de fábrica
// («Implementar…/Probar…/Documentar…»), así que el `NOT EXISTS` de abajo nunca
// se cumple y esta planificación llevaba tiempo siendo un no-op silencioso —
// 106 de las 120 misiones vivas seguían con el plan genérico. Por eso hay dos
// entradas nuevas, ambas explícitas para no regenerar nada a espaldas de nadie:
//   · opts.mission  → planifica ESA misión (la que se acaba de dar de alta)
//   · opts.skeleton → incluye en la tanda las que sólo tienen el esqueleto INTACTO
// Un esqueleto tocado (avance, informe o prueba) jamás entra: eso ya es trabajo.
//
// VIVA = open o in_progress, NUNCA `!= resolved` (Carlos, 2026-08-10 · encargo
// #1334 a). `!= resolved` metía en la tanda a las CANCELADAS, que son la inmensa
// mayoría de lo no resuelto: el 10-ago el contador decía 62 esqueletos y las
// misiones vivas de toda la flota eran DOS, las dos ya con plan real. Barrer
// «hasta que no queden esqueletos» gastaba 62 llamadas de IA en reescribirle el
// plan a misiones muertas —cazado en vivo replanificando FLT-1252, una cancelada
// que decía «ping»— y el número del tablero no hablaba de trabajo vivo.
// Además /fleet/plan-tasks YA se niega a tocar una misión cancelada («su árbol no
// se reescribe»): dos puertas al mismo árbol no pueden tener reglas distintas.
const VIVA_SQL = "t.status IN ('open','in_progress')";
async function fleetPlanPending(env, limit, opts = {}) {
  const n = Math.max(1, Math.min(+limit || 5, 20));
  let results;
  const one = String((opts && opts.mission) || "").trim();
  if (one) {
    const mid = await resolveFleetMissionReference(env, one);
    const row = mid ? await env.DB.prepare(
      "SELECT id FROM tickets t WHERE t.id=? AND t.source='fleet' AND " + VIVA_SQL
    ).bind(mid).first() : null;
    // Sin plan, o con el esqueleto virgen. Con trabajo dentro, no se toca.
    const cur = row ? await listMissionTasks(env, mid) : [];
    results = row && (!cur.length || isVirginSkeleton(cur)) ? [{ id: mid }] : [];
  } else {
    ({ results } = await env.DB.prepare(
      `SELECT t.id FROM tickets t
        WHERE t.source='fleet' AND ${VIVA_SQL}
          AND NOT EXISTS (SELECT 1 FROM mission_tasks m WHERE m.mission_id = t.id)
        ORDER BY t.created_at DESC LIMIT ?`
    ).bind(n).all());
    if (opts && opts.skeleton) {
      // Candidatas por SQL (3 filas, todas intactas) y criba fina en JS con el
      // mismo isVirginSkeleton que usa el carril de una sola misión.
      const { results: cand } = await env.DB.prepare(
        `SELECT t.id FROM tickets t
          WHERE t.source='fleet' AND ${VIVA_SQL}
            AND (SELECT COUNT(*) FROM mission_tasks m WHERE m.mission_id=t.id) = 3
            AND NOT EXISTS (SELECT 1 FROM mission_tasks m WHERE m.mission_id=t.id
              AND (m.status='done' OR COALESCE(TRIM(m.report),'')<>'' OR COALESCE(TRIM(m.image),'')<>''))
          ORDER BY t.created_at DESC LIMIT ?`
      ).bind(n).all();
      for (const row of cand || []) {
        if ((results || []).length >= n) break;
        if (isVirginSkeleton(await listMissionTasks(env, row.id))) results.push(row);
      }
    }
  }
  const ids = (results || []).map((r) => r.id);
  const planned = [];
  for (const id of ids) {
    try {
      const tasks = await proposePlan(env, id);
      if (tasks && tasks.length) planned.push(id);
    } catch (e) {
    }
  }
  // Pendientes que quedan tras esta tanda. `pending` son las que no tienen plan
  // ninguno; `skeleton` las que sólo tienen el esqueleto de fábrica intacto —
  // el número que hacía falta ver y que antes no salía por ningún lado, porque
  // esas misiones no contaban como pendientes aunque no tuvieran plan real.
  const left = (await env.DB.prepare(
    `SELECT COUNT(*) c FROM tickets t WHERE t.source='fleet' AND ${VIVA_SQL}
       AND NOT EXISTS (SELECT 1 FROM mission_tasks m WHERE m.mission_id = t.id)`
  ).first())?.c || 0;
  const esqueleto = (await env.DB.prepare(
    `SELECT COUNT(*) c FROM tickets t WHERE t.source='fleet' AND ${VIVA_SQL}
       AND (SELECT COUNT(*) FROM mission_tasks m WHERE m.mission_id=t.id) = 3
       AND NOT EXISTS (SELECT 1 FROM mission_tasks m WHERE m.mission_id=t.id
         AND (m.status='done' OR COALESCE(TRIM(m.report),'')<>'' OR COALESCE(TRIM(m.image),'')<>''))`
  ).first())?.c || 0;
  return { ok: true, planned, count: planned.length, pending: left, skeleton: esqueleto };
}
__name(fleetPlanPending, "fleetPlanPending");

// PROGRESO EN TERCIOS (FLT-982 b1). El contador crudo `COUNT(*)` de mission_tasks
// mezclaba peras y manzanas: pasos a..h, subtareas a1..h3 y la fila z1 de CIERRE
// que genera el propio worker — de ahí los «1/13» y «0/32» que nadie podía
// comparar. Mismo criterio que el front (yokup-site/yk-misiones.js, función
// `tercios`), copiado a propósito para que worker y navegador no diverjan:
//   · tareas a·b·c        → sobre 3 (denominador FIJO)
//   · subtareas a1..c3    → sobre 9 (denominador FIJO)
//   · z1/z2 (cierre)      → NO cuenta, ni suma ni resta
//   · pasos d..h y sus subtareas → aparte, en extra/extraDone
// Denominadores fijos (Carlos, 22-jul-2026): un plan con 2 tareas no es un plan
// de 2, es un plan de 3 INCOMPLETO — y eso se dice (incompleto/topN/subN), no se
// disimula bajando el denominador. Excepción explícita: role=standalone-task es
// una tarea suelta real y se mide 0/1 o 1/1, sin fingir subtareas. Nunca se inventan filas.
function tercios(tasks, standalone) {
  const top = [], sub = [];
  let extra = 0, extraDone = 0;
  for (const t of tasks || []) {
    const c = String((t && t.code) || "").trim().toLowerCase();
    if (/^[a-c]$/.test(c)) top.push(t);
    else if (/^[a-c][1-3]$/.test(c)) sub.push(t);
    else if (c && !/^z\d*$/.test(c)) { extra++; if (t.status === "done") extraDone++; }
  }
  // Sin plan NO hay chip: igual que el front, una misión sin ninguna fila útil
  // devuelve null en vez de un «0/3» que aparentaría un plan que no existe.
  if (!top.length && !sub.length && !extra) return null;
  const hecho = (a) => a.filter((t) => t.status === "done").length;
  // «No aplicaba» va en su PROPIA cuenta. Sumarlo a `done` sería exactamente la
  // mentira que el estado viene a evitar: el texto diría la verdad y el número no.
  const nada = (a) => a.filter((t) => t.status === TASK_NO_APLICA).length;
  if (standalone) {
    return {
      done: hecho(top), total: Math.max(1, top.length),
      na: nada(top), sna: 0,
      sdone: 0, stotal: 0,
      topN: top.length, subN: 0,
      incompleto: false, standalone: true,
      extra, extraDone
    };
  }
  return {
    done: hecho(top), total: 3,
    na: nada(top), sna: nada(sub),
    sdone: hecho(sub), stotal: 9,
    topN: top.length, subN: sub.length,
    incompleto: top.length < 3 || sub.length < 9,
    extra, extraDone
  };
}
__name(tercios, "tercios");

// Lectura PÚBLICA para admira.live/status. Su SELECT es una allowlist mínima:
// nunca serializa notas, el texto de los informes, capturas live, runtime/host,
// triage ni eventos. La excepción deliberada es `proof_image`: es la prueba
// canónica de un cierre y el tablero tiene que poder enseñarla sin cruzar
// el perímetro. El árbol embebido conserva sólo metadatos de planificación y
// el booleano has_report.
async function fleetMissions(env) {
  const { results } = await env.DB.prepare(FLEET_MISSIONS_SQL).all();
  const rows = results || [];
  if (!rows.length) return [];
  await attachDisplayRefs(env, "mission", rows, (row) => row.id, (row) => row.created_at);
  // Troceado obligatorio: con LIMIT 120 y el tope de 100 variables de D1, esta
  // consulta reventaba en cuanto había más de 100 misiones de flota.
  // `has_report` en vez del texto del parte: quien pinta necesita saber SI existe
  // informe (para señalar el que falta), no arrastrar 120 partes por la red.
  const tks = await selectIn(env, rows.map((r) => r.id), (ph) =>
    `SELECT mission_id,code,title,status,owner,created_at,updated_at,
            CASE WHEN report IS NOT NULL AND TRIM(report)!='' THEN 1 ELSE 0 END has_report
     FROM mission_tasks WHERE mission_id IN (${ph}) ORDER BY code`
  );
  await attachDisplayRefs(env, "task", tks, taskDisplayKey, (row) => row.created_at || row.updated_at);
  const byMission = {};
  for (const t of tks || []) (byMission[t.mission_id] = byMission[t.mission_id] || []).push(t);
  // `project` viaja como ID del censo; quien pinta (status, /misiones) quiere el
  // nombre humano y no tiene por qué conocer la tabla.
  const pidx = await projectIndex(env);
  return rows.map((r) => {
    const tasks = byMission[r.id] || [];
    return Object.assign({}, r, {
      machine: r.loc,
      project_name: resolveProject(pidx, r.project || "").name,
      // Proyecto heredado de otro día: nadie lo ha confirmado hoy y puede no ser
      // el suyo, así que viaja marcado para que la interfaz lo pinte con
      // asterisco y en color de aviso en vez de darlo por bueno.
      project_inherited: r.project_inherited ? 1 : 0,
      project_inherited_from: r.project_inherited_from || "",
      persona: r.assignee,
      source: r.source,
      tasks,
      // Una misión terminada SIN parte es deuda visible (Carlos, 24-jul-2026).
      has_report: tasks.some((t) => t.has_report),
      progress: tercios(tasks, r.role === "standalone-task")
    });
  });
}
__name(fleetMissions, "fleetMissions");

// ── FICHA PÚBLICA DE UN AGENTE ─────────────────────────────────────────────
// Una tarjeta del pulso describe una ENCARNACIÓN, no sólo una persona. El
// contrato conserva agent+machine+runtime+surface (y session_id si el pulso lo
// tiene), pero el histórico se atribuye a la identidad operativa exacta
// persona+capa+máquina. Así Oraculo App y Oraculo CLI no comparten presencia,
// mientras que ambos pueden explicar el mismo histórico canónico de trabajo.
function agentDetailRoleSql(expression, role) {
  const key = identitySqlKey(expression);
  if (role === "sub") return `${key} LIKE 'sub%'`;
  if (role === "infra") return `${key} LIKE 'infra%'`;
  return `${key} NOT LIKE 'sub%' AND ${key} NOT LIKE 'infra%'`;
}
__name(agentDetailRoleSql, "agentDetailRoleSql");

function agentDetailActivitySql(query, activeOnly = false) {
  const personaKey = identityKey(query.parsed.persona);
  const parts = [], binds = [];
  if (query.parsed.role === "main") {
    parts.push(
      `SELECT t.id||':mission' id,'mission' kind,t.id mission_id,NULL task_code,` +
      `t.subject title,t.subject mission_title,NULL task_title,t.status state,` +
      `t.project,t.project_id,t.created_at,t.started_at,t.resolved_at ended_at,t.updated_at,` +
      `COALESCE(t.resolved_at,t.started_at,t.updated_at,t.created_at) activity_at,` +
      `(SELECT display_ref FROM display_refs WHERE entity_type='mission' AND entity_key=t.id) mission_display_ref,` +
      `(SELECT display_ref FROM display_refs WHERE entity_type='mission' AND entity_key=t.id) display_ref ` +
      `FROM tickets t WHERE ${MISSION_SCOPE_SQL_T} ` +
      `AND ${agentFamilySqlKey("t.assignee") }=? AND ${machineIdentitySqlKey("t.loc") }=? ` +
      `AND ${agentDetailRoleSql("t.assignee", "main")} ` +
      (activeOnly ? "AND t.status='in_progress' " : "")
    );
    binds.push(personaKey, query.machine_key);
  }
  const executor = "COALESCE(NULLIF(TRIM(m.executor),''),'')";
  parts.push(
    `SELECT t.id||':'||m.code id,'task' kind,t.id mission_id,m.code task_code,` +
    `m.title title,t.subject mission_title,m.title task_title,m.status state,` +
    `t.project,t.project_id,m.created_at,m.started_at,m.ended_at,m.updated_at,` +
    `COALESCE(m.ended_at,m.started_at,m.updated_at,m.created_at) activity_at,` +
    `(SELECT display_ref FROM display_refs WHERE entity_type='mission' AND entity_key=t.id) mission_display_ref,` +
    `(SELECT display_ref FROM display_refs WHERE entity_type='task' AND entity_key=t.id||':'||m.code) display_ref ` +
    `FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id WHERE ${MISSION_SCOPE_SQL_T} ` +
    `AND ${agentFamilySqlKey(executor)}=? AND ${machineIdentitySqlKey("t.loc") }=? ` +
    `AND ${agentDetailRoleSql(executor, query.parsed.role)} ` +
    `AND (m.status!='pending' OR m.started_at IS NOT NULL OR m.ended_at IS NOT NULL) ` +
    (activeOnly ? "AND m.status IN ('in_progress','doing','active') AND t.status='in_progress' " : "")
  );
  binds.push(personaKey, query.machine_key);
  return { sql:parts.join(" UNION ALL "), binds };
}
__name(agentDetailActivitySql, "agentDetailActivitySql");

async function agentDetailPresence(env, query, now) {
  if (!env.TELEGRAM) return { available:false, matched:false, fresh:false, ambiguous:false, live_at:null };
  try {
    const response = await env.TELEGRAM.fetch(new Request(PRESENCE_URL, { headers:{ accept:"application/json" } }));
    if (!response.ok) return { available:false, matched:false, fresh:false, ambiguous:false, live_at:null };
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : (payload.presence || payload.rows || []);
    return { available:true, ...matchAgentDetailPresence(rows, query, now) };
  } catch {
    return { available:false, matched:false, fresh:false, ambiguous:false, live_at:null };
  }
}
__name(agentDetailPresence, "agentDetailPresence");

function agentDetailPublicItem(row, pidx) {
  const project = resolveProject(pidx, row.project_id || row.project || "");
  const missionId = String(row.mission_id || "").slice(0, 120);
  const taskCode = String(row.task_code || "").slice(0, 40);
  return {
    id:String(row.id || "").slice(0, 180),
    kind:row.kind === "task" ? "task" : "mission",
    title:safeAgentDetailText(row.title, row.kind === "task" ? "Tarea" : "Misión"),
    state:String(row.state || "unknown").slice(0, 30),
    mission_id:missionId,
    mission_display_ref:String(row.mission_display_ref || "").slice(0, 40) || null,
    task_code:taskCode || null,
    display_ref:String(row.display_ref || "").slice(0, 40) || null,
    project_id:String(project.id || row.project_id || "").slice(0, 120) || null,
    project_name:safeAgentDetailText(project.name) || null,
    started_at:highscoreActiveWorkMillis(row.started_at) || null,
    ended_at:highscoreActiveWorkMillis(row.ended_at) || null,
    activity_at:highscoreActiveWorkMillis(row.activity_at) || null,
    detail_url:"/tareas?mission=" + encodeURIComponent(missionId) + (taskCode ? "#" + encodeURIComponent(taskCode) : "")
  };
}
__name(agentDetailPublicItem, "agentDetailPublicItem");

async function agentDetail(env, query, now = Date.now()) {
  const [presence, pidx] = await Promise.all([agentDetailPresence(env, query, now), projectIndex(env)]);
  const historySource = agentDetailActivitySql(query, false);
  const activeSource = agentDetailActivitySql(query, true);
  const [page, counted, active] = await Promise.all([
    env.DB.prepare(`SELECT * FROM (${historySource.sql}) activity ` +
      `ORDER BY activity_at DESC,CASE kind WHEN 'task' THEN 0 ELSE 1 END,id DESC LIMIT ? OFFSET ?`)
      .bind(...historySource.binds, query.limit, query.offset).all(),
    env.DB.prepare(`SELECT COUNT(*) total FROM (${historySource.sql}) activity`)
      .bind(...historySource.binds).first(),
    env.DB.prepare(`SELECT * FROM (${activeSource.sql}) activity ` +
      `ORDER BY CASE kind WHEN 'task' THEN 0 ELSE 1 END,activity_at DESC,id DESC LIMIT 1`)
      .bind(...activeSource.binds).first()
  ]);
  const rows = (page && page.results) || [];
  const total = Number(counted && counted.total) || 0;
  let current = null;
  if (active) {
    const item = agentDetailPublicItem(active, pidx);
    current = { ...item,
      state:presence.available ? (presence.fresh ? "running" : "assigned_stale") : "unknown",
      mission_title:safeAgentDetailText(active.mission_title) || null,
      task_title:safeAgentDetailText(active.task_title) || null,
      live_at:presence.live_at,
      work_progress_at:item.activity_at,
      reachable:presence.fresh };
  } else if (presence.fresh) {
    // `focus` es telemetría libre de proceso. Aunque el helper la pueda redactar
    // para diagnóstico interno, esta ruta pública no la serializa: sin vínculo a
    // una misión/tarea la descripción verificable es únicamente que está ocioso.
    current = { id:null, kind:"presence", title:"Conectado sin misión o tarea activa",
      state:"idle", mission_id:null, mission_display_ref:null, task_code:null, display_ref:null,
      mission_title:null, task_title:null, project_id:null, project_name:null,
      started_at:null, ended_at:null, activity_at:presence.live_at, detail_url:null,
      live_at:presence.live_at, work_progress_at:null, reachable:true };
  }
  return { ok:true, contract:"agent-detail-v1", generated_at:now,
    identity:{ agent:query.family.executor, family:query.family.family_name,
      family_key:query.family.family_key, role:query.parsed.role, machine:query.machine,
      machine_key:query.machine_key, runtime:query.runtime, surface:query.surface,
      surface_key:query.surface_key },
    presence:{ available:presence.available, matched:presence.matched, fresh:presence.fresh,
      ambiguous:presence.ambiguous, live_at:presence.live_at },
    current,
    history:{ items:rows.map((row) => agentDetailPublicItem(row, pidx)), limit:query.limit,
      offset:query.offset, total, has_more:query.offset + rows.length < total } };
}
__name(agentDetail, "agentDetail");

// ── HIGHSCORE DIARIO ────────────────────────────────────────────────────────
// El marcador (/highscore) pedía esta ruta desde el 2 de agosto y NADIE la había
// escrito: la petición caía en el catch-all, el worker devolvía su portada en
// texto plano con 200, el r.json() del front reventaba y seguroYokup() se tragaba
// el error en silencio. Como Objetivos, Ventanas y Misiones —recuentos Y puntos—
// salen SOLO de aquí, las tres columnas valían 0 para TODOS los agentes, siempre;
// lo único que puntuaba eran las Tareas, que vienen de /tasks/all. Lo cantó Carlos
// al ver que ningún MacBookAir marcaba nada llevando horas trabajando, y de hecho
// las 6 ventanas de decisión abiertas ese día eran justo de los Air. (FLT-1165,
// NeoMBACrema, 2026-08-04.)
//
// Los pesos son los que la propia página ya explicaba en su leyenda; viajan en el
// payload (`weights`) para que marcador y backend no puedan discrepar nunca.
var HIGHSCORE_WEIGHTS = { objective: 20, window: 10, mission: 40 };
var HIGHSCORE_TASK_WEIGHTS = { task: 15, active_bonus: 10 };
var HIGHSCORE_RECENT_MS = 15 * 60 * 1e3;
var HIGHSCORE_TREND_MS = 60 * 60 * 1e3;
var HIGHSCORE_TREND_TOLERANCE_MS = 15 * 60 * 1e3;
// Compatibilidad histórica estricta: sólo cuentan eventos INTERNOS de Yokup
// (`author=yokup`) cuya frase coincide con una plantilla de transición emitida
// por este worker. Mensajes de Agora/public inbox, presencia y logs libres no
// son prueba de inicio aunque contengan palabras como «en curso».
var HIGHSCORE_INTERNAL_YOKUP_TRANSITION_SQL = "lower(COALESCE(e.author,''))='yokup' AND ((e.kind='status' AND (lower(trim(e.text)) IN ('estado → in_progress','estado → in_progress · primer avance de tarea') OR (instr(lower(e.text),'la misión pasa a in_progress por su árbol de tareas (')=1 AND (substr(lower(e.text),-length('→ in_progress.'))='→ in_progress.' OR substr(lower(e.text),-length('→ in_progress (no se pudo avisar al bot-inbox).'))='→ in_progress (no se pudo avisar al bot-inbox).')))) OR (e.kind='log' AND (((instr(lower(e.text),'misión entregada al cli de ')=1 AND instr(lower(e.text),' en ')>0) AND (substr(lower(e.text),-length('; pasa a en curso.'))='; pasa a en curso.' OR substr(lower(e.text),-length('; pasa a en curso (sincronización del bot-inbox pendiente).'))='; pasa a en curso (sincronización del bot-inbox pendiente).')) OR (instr(lower(e.text),'la misión pasa a in_progress por su árbol de tareas. encargo #')=1 AND (substr(lower(e.text),-length('→ in_progress.'))='→ in_progress.' OR substr(lower(e.text),-length('→ in_progress (no se pudo avisar al bot-inbox).'))='→ in_progress (no se pudo avisar al bot-inbox).')))))";
// Instante puntuable de una misión: creación ya EN CURSO para las tandas, una
// transición interna histórica válida, o el primer estado canónico de una tarea.
// Sin una de esas pruebas no se adivina a partir de una edición/cierre posterior.
// Una misión DECLARADA nace ya en curso y con su evidencia, igual que una
// materializada desde una ventana: su created_at ES el hecho puntuable. Sin
// esto, scored_at salía NULL —no hay evento de «pasa a en curso» que buscar—
// y las cinco misiones que declaré seguían contando como una (2026-08-05).
var HIGHSCORE_MISSION_STARTED_SQL = "CASE WHEN t.source IN ('decision-batch','cli-declare') THEN t.created_at ELSE COALESCE((SELECT MIN(e.ts) FROM events e WHERE e.ticket_id=t.id AND " + HIGHSCORE_INTERNAL_YOKUP_TRANSITION_SQL + "),(SELECT MIN(mt.updated_at) FROM mission_tasks mt WHERE mt.mission_id=t.id AND mt.status IN ('in_progress','done')),CASE WHEN EXISTS(SELECT 1 FROM mission_tasks mt2 WHERE mt2.mission_id=t.id) THEN t.created_at END) END";
// Inicio de TRABAJO (más estricto que el sello de puntuación histórica): un plan
// pendiente no basta. Hace falta started_at, una misión nacida ya en curso, una
// transición interna de Yokup o la primera tarea realmente iniciada/hecha.
var HIGHSCORE_WORK_STARTED_SQL = "COALESCE(t.started_at,CASE WHEN t.source='fleet' AND t.status='resolved' AND COALESCE(TRIM(t.proof_image),'')<>'' THEN (SELECT MIN(e.ts) FROM events e WHERE e.ticket_id=t.id AND e.kind='assign') END,(SELECT MIN(e.ts) FROM events e WHERE e.ticket_id=t.id AND " + HIGHSCORE_INTERNAL_YOKUP_TRANSITION_SQL + "),(SELECT MIN(mt.started_at) FROM mission_tasks mt WHERE mt.mission_id=t.id AND mt.started_at IS NOT NULL AND mt.status IN ('in_progress','doing','active','done','resolved','completed')),CASE WHEN t.source='cli-declare' THEN t.created_at END,CASE WHEN t.status='resolved' AND COALESCE(TRIM(t.proof_image),'')<>'' THEN " + HIGHSCORE_MISSION_STARTED_SQL + " END)";
// Avance MATERIAL de una misión. `tickets.updated_at`, `live_at` y
// `mission_tasks.updated_at` quedan fuera: los tres también cambian por report,
// owner, imagen o heartbeat. Cada started_at de tarea sí es un hecho material;
// hasta que exista un sello de fin propio de tarea, un cierre no se infiere de
// una edición posterior.
var HIGHSCORE_MISSION_PROGRESS_SQL = "MAX(COALESCE((SELECT MAX(mt.started_at) FROM mission_tasks mt WHERE mt.mission_id=t.id AND mt.started_at IS NOT NULL AND mt.status IN ('in_progress','doing','active','done','resolved','completed')),0),COALESCE(" + HIGHSCORE_WORK_STARTED_SQL + ",0))";
// Revisión de carrera: a diferencia del reloj/estado histórico, no puede
// depender de `mission_tasks.updated_at`, porque `setTaskStatus` también lo
// mueve al editar report, owner o evidencia sin que exista avance material.
// La revisión de la misión usa su inicio factual. Cada tarea iniciada ya cambia
// además `kind|work_ref|started_at`; no necesitamos inferir una transición desde
// `updated_at`. Así un informe, retítulo, evidencia o heartbeat nunca regala
// otras tres vueltas monocromas, tampoco después de cerrar una tarea.
var HIGHSCORE_RACE_PROGRESS_SQL = HIGHSCORE_WORK_STARTED_SQL;
var HIGHSCORE_ASSIGNMENT_EVENT_SQL = "(SELECT MAX(e.ts) FROM events e WHERE e.ticket_id=t.id AND e.kind='assign')";
// Quinta copia a mano del censo, y la que decide si un objetivo puntúa: sin estar
// aquí, una idea firmada por Link no le sumaría nada. Las otras cuatro son PERSONAS
// en agent-identity.js, la lista de principalAgentIdentity, la regex de
// cleanMissionAttributions y los nombres escritos a mano en admira.live/control.
var HIGHSCORE_PERSONAS = ["neo", "link", "morfeo", "trinity", "oraculo", "smith", "whiterabbit", "cypher", "niobe"];

/** Quién firma un objetivo. Los autores llegan como los escribe cada sitio:
 *  «Oráculo», «Neo16 (Claude)», «Carlos · Oraculo» o un asiento del Consejo
 *  («CEO · Steve Jobs»). Solo puntúan agentes de la flota — si no, el marcador
 *  se inventaría una fila por cada asiento y por Carlos. El apellido de equipo lo
 *  normaliza el front (yk-agent-identity), aquí se respeta el nombre tal cual. */
function highscoreAgent(author) {
  const bruto = String(author || "").split("·").pop().replace(/\([^)]*\)/g, "").trim();
  if (!bruto) return "";
  const clave = bruto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  return HIGHSCORE_PERSONAS.some((p) => clave.startsWith(p)) ? bruto : "";
}
__name(highscoreAgent, "highscoreAgent");

// Traza factual del marcador. El agregado `scores` sigue siendo la fuente de
// puntos; esta capa explica de dónde sale la progresión visual sin inferir
// relaciones por títulos, fechas cercanas o nombres parecidos. Sólo enlaza por
// ideas.decision_id / ideas.mission_id, decisions.mission y las FK reales de las
// tandas y tareas. Lo que no tenga una de esas llaves sale en `unlinked`.
async function highscoreTraceability(env, inicio, fin, ahora) {
  const rows = async (sql) => ((await env.DB.prepare(sql).bind(inicio, fin).all()).results || []);
  const isToday = (at) => Number(at) >= inicio && Number(at) < fin;
  const isNew = (at) => Number(at) >= ahora - HIGHSCORE_RECENT_MS && Number(at) <= ahora + 6e4;
  const ideas = await rows(
    "SELECT id,title,author,project,decision_id,mission_id,created_at,updated_at FROM ideas WHERE created_at>=? AND created_at<?"
  );
  const decisions = await rows(
    "SELECT id,agent,machine,question,project,mission,parent_decision,batch_id,created_at,decided_at FROM decisions WHERE created_at>=? AND created_at<?"
  );
  const missions = await rows(
    `SELECT * FROM (SELECT t.id,t.subject,t.assignee,t.loc,t.project,t.created_at,t.updated_at,t.status,${HIGHSCORE_MISSION_STARTED_SQL} scored_at ` +
    `FROM tickets t WHERE ${AGENT_SOURCE_SQL_T}) WHERE status IN ('in_progress','resolved') AND scored_at>=? AND scored_at<?`
  );
  const tasks = ((await env.DB.prepare(
    "SELECT m.mission_id,m.code,m.title,m.status,m.owner,m.created_at,m.updated_at,t.status mission_status " +
    "FROM mission_tasks m LEFT JOIN tickets t ON t.id=m.mission_id " +
    "WHERE ((COALESCE(m.created_at,m.updated_at)>=? AND COALESCE(m.created_at,m.updated_at)<?) " +
    "OR (m.updated_at>=? AND m.updated_at<?)) " +
    "AND COALESCE(t.status,'')!='cancelled'"
  ).bind(inicio, fin, inicio, fin).all()).results || []);
  // Esta consulta no usa fechas: son exclusivamente llaves de unión. Las etapas
  // que no pertenecen al día no se publican, pero la llave permite distinguir
  // `sin relación` de `relación real fuera de la ventana diaria`.
  const batchRows = ((await env.DB.prepare(
    "SELECT b.id batch_id,b.decision_id,i.mission_id FROM mission_batches b " +
    "JOIN mission_batch_items i ON i.batch_id=b.id WHERE i.mission_id IS NOT NULL AND i.mission_id!=''"
  ).all()).results || []);

  const decisionById = new Map(decisions.map((d) => [String(d.id), d]));
  const missionById = new Map(missions.map((m) => [String(m.id), m]));
  const batchByDecision = new Map(), missionBatch = new Map();
  for (const b of batchRows) {
    batchByDecision.set(String(b.decision_id), String(b.batch_id));
    if (!missionBatch.has(String(b.mission_id))) missionBatch.set(String(b.mission_id), new Set());
    missionBatch.get(String(b.mission_id)).add(String(b.batch_id));
  }
  const batchKey = (d) => String(d.batch_id || batchByDecision.get(String(d.id)) || "decision:" + d.id);
  const windowsByBatch = new Map();
  for (const d of decisions) {
    const key = batchKey(d);
    if (!windowsByBatch.has(key)) windowsByBatch.set(key, []);
    windowsByBatch.get(key).push(d);
  }
  for (const list of windowsByBatch.values()) list.sort((a, b) => Number(a.created_at) - Number(b.created_at));

  const taskRowsByMission = new Map();
  for (const t of tasks) {
    const mid = String(t.mission_id || "");
    if (!taskRowsByMission.has(mid)) taskRowsByMission.set(mid, []);
    taskRowsByMission.get(mid).push(t);
  }
  // La puntuación de tareas agrupa A/A1..A3 como una sola familia, exactamente
  // igual que el consumidor actual. Conservamos todas las filas reales y
  // marcamos cuál es la representante que suma (`scoring`).
  const taskStages = (mid) => {
    const source = taskRowsByMission.get(String(mid)) || [], representatives = new Map();
    for (const t of source) {
      const match = String(t.code || "").toLowerCase().match(/^([a-c])(?:[1-3])?$/);
      if (!match || !isToday(t.updated_at) || !["doing", "in_progress", "done"].includes(String(t.status || ""))) continue;
      const prev = representatives.get(match[1]);
      if (!prev || Number(t.updated_at) >= Number(prev.updated_at)) representatives.set(match[1], t);
    }
    return source.map((t) => {
      const match = String(t.code || "").toLowerCase().match(/^([a-c])(?:[1-3])?$/);
      const scoring = !!(match && representatives.get(match[1]) === t);
      const points = scoring ? HIGHSCORE_TASK_WEIGHTS.task + (["doing", "in_progress"].includes(String(t.status || "")) ? HIGHSCORE_TASK_WEIGHTS.active_bonus : 0) : 0;
      const created = Number(t.created_at || t.updated_at) || 0;
      return { id: String(t.mission_id) + ":" + String(t.code), mission_id: String(t.mission_id), code: String(t.code),
        title: t.title || "", status: t.status || "", at: created, activity_at: Number(t.updated_at) || created,
        is_new: isNew(created), agent: t.owner || "", points, scoring };
    }).sort((a, b) => a.at - b.at || a.code.localeCompare(b.code));
  };
  const windowStage = (d) => ({ id: String(d.id), title: d.question || "", at: Number(d.created_at) || 0,
    is_new: isNew(d.created_at), agent: d.agent || "", machine: d.machine || "", project: d.project || "",
    points: isToday(d.created_at) ? HIGHSCORE_WEIGHTS.window : 0 });
  const missionStage = (m) => ({ id: String(m.id), title: m.subject || "", at: Number(m.created_at) || 0,
    activity_at: Number(m.scored_at) || 0, timestamp_basis: "first_in_progress_event",
    is_new: isNew(m.created_at), agent: m.assignee || "", machine: m.loc || "", project: m.project || "",
    points: isToday(m.scored_at) ? HIGHSCORE_WEIGHTS.mission : 0 });
  const objectiveStage = (o) => ({ type: "objective", id: String(o.id), title: o.title || "", at: Number(o.created_at) || 0,
    is_new: isNew(o.created_at), agent: highscoreAgent(o.author), machine: "", project: o.project || "",
    points: highscoreAgent(o.author) && isToday(o.created_at) ? HIGHSCORE_WEIGHTS.objective : 0 });

  const linksForMission = (mid) => {
    const batches = missionBatch.get(String(mid)) || new Set(), windows = [];
    for (const d of decisions) {
      if (String(d.mission || "") === String(mid) || batches.has(batchKey(d))) windows.push(d);
    }
    return windows.sort((a, b) => Number(a.created_at) - Number(b.created_at));
  };
  const ideasFor = (mid, windows) => ideas.filter((o) => String(o.mission_id || "") === String(mid) ||
    (o.decision_id && windows.some((d) => String(d.id) === String(o.decision_id) || batchKey(d) === batchByDecision.get(String(o.decision_id)))));
  const chains = [], linkedObjectives = new Set(), linkedWindows = new Set(), linkedMissions = new Set();
  const addChain = (origin, windows, mission) => {
    // Si el origen ya es una ventana, `windows` contiene sólo continuaciones:
    // no repetimos el mismo hito dos veces en la línea.
    const visibleWindows = origin.type === "window" ? windows.filter((d) => String(d.id) !== String(origin.id)) : windows;
    const w = visibleWindows.map(windowStage), ms = mission ? missionStage(mission) : null, ts = mission ? taskStages(mission.id) : [];
    const points = { objective: origin.type === "objective" ? origin.points : 0,
      windows: (origin.type === "window" ? origin.points : 0) + w.reduce((n, x) => n + x.points, 0), mission: ms ? ms.points : 0,
      tasks: ts.reduce((n, x) => n + x.points, 0) };
    points.total = points.objective + points.windows + points.mission + points.tasks;
    const stamps = [origin.at, ...w.map((x) => x.at), ms && ms.activity_at, ...ts.map((x) => x.activity_at)].filter(Boolean);
    const agent = ms && ms.agent || (w.length && w[w.length - 1].agent) || origin.agent || "";
    const machine = ms && ms.machine || (w.length && w[w.length - 1].machine) || origin.machine || "";
    const project = ms && ms.project || (w.length && w[w.length - 1].project) || origin.project || "";
    chains.push({ id: origin.type + ":" + origin.id + (ms ? "→mission:" + ms.id : ""), agent, machine, project,
      origin, windows: w, mission: ms, tasks: ts, points,
      latest_at: stamps.length ? Math.max(...stamps) : 0,
      is_new: origin.is_new || w.some((x) => x.is_new) || !!(ms && ms.is_new) || ts.some((x) => x.is_new) });
  };

  for (const m of missions) {
    const windows = linksForMission(m.id), roots = ideasFor(m.id, windows);
    if (roots.length) {
      for (const o of roots) { linkedObjectives.add(String(o.id)); windows.forEach((d) => linkedWindows.add(String(d.id))); addChain(objectiveStage(o), windows, m); }
      linkedMissions.add(String(m.id));
    } else if (windows.length) {
      const first = windows[0], origin = { ...windowStage(first), type: "window" };
      windows.forEach((d) => linkedWindows.add(String(d.id))); linkedMissions.add(String(m.id)); addChain(origin, windows, m);
    } else {
      // Una FLT directa ya tiene una relación factual: ticket → mission_tasks.
      // No inventa objetivo ni ventana, pero tampoco deja sus tareas huérfanas.
      linkedMissions.add(String(m.id)); addChain({ ...missionStage(m), type: "mission" }, [], m);
    }
  }
  for (const o of ideas) if (!linkedObjectives.has(String(o.id))) {
    const d = decisionById.get(String(o.decision_id || "")), windows = d ? (windowsByBatch.get(batchKey(d)) || [d]) : [];
    windows.forEach((x) => linkedWindows.add(String(x.id))); addChain(objectiveStage(o), windows, null);
  }
  for (const d of decisions) if (!linkedWindows.has(String(d.id))) addChain({ ...windowStage(d), type: "window" }, [d], null);
  chains.sort((a, b) => b.latest_at - a.latest_at || a.id.localeCompare(b.id));

  const unlinked = [];
  for (const m of missions) if (!linkedMissions.has(String(m.id))) unlinked.push({ type: "mission", id: String(m.id),
    reason: "no_explicit_objective_or_window_link", agent: m.assignee || "", machine: m.loc || "", project: m.project || "",
    at: Number(m.scored_at) || Number(m.created_at) || 0, is_new: isNew(m.created_at), points: HIGHSCORE_WEIGHTS.mission });
  for (const t of tasks) if (!missionById.has(String(t.mission_id || ""))) unlinked.push({ type: "task",
    id: String(t.mission_id) + ":" + String(t.code), mission_id: String(t.mission_id || ""),
    reason: String(t.mission_status || "") === "open" && String(t.status || "") === "pending"
      ? "mission_not_started" : "mission_outside_daily_trace",
    agent: t.owner || "", at: Number(t.updated_at || t.created_at) || 0,
    is_new: isNew(t.created_at || t.updated_at), points: 0 });
  unlinked.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  return { version: 1, recent_after: ahora - HIGHSCORE_RECENT_MS, chains, unlinked,
    coverage: { objectives: ideas.length, windows: decisions.length, missions: missions.length, tasks: tasks.length,
      linked_missions: linkedMissions.size, unlinked: unlinked.length } };
}
__name(highscoreTraceability, "highscoreTraceability");

// Recuento factual para UN intervalo. Es la misma fuente canónica del diario,
// pero conserva juntas las cinco magnitudes que el Highscore pinta hora/día.
// Las tareas se reducen a una representante por familia A/B/C y misión: una
// subtarea más reciente sustituye a su principal, nunca suma dos veces.
// UN SOLO CRITERIO PARA AGRUPAR AGENTES EN EL MARCADOR (2026-09-01).
// Había TRES sitios normalizando por su cuenta el nombre visible en crudo
// —highscorePeriodMetrics, highscoreCurrentTotals y el mapa `old` de
// highscoreHourlyContract— y bastaba con que uno no canonicalizara el apellido
// para que el agente reapareciera partido: `Mini` y `MacMini` son la MISMA
// máquina (normativa 02) y salían como dos filas repartiéndose los puntos.
// Medido el 1-sep: MorfeoMacMini 1172 + MorfeoMini 528, con el ranking
// ordenando por las mitades. Arreglar uno solo no servía de nada porque
// highscoreHourlyContract UNE las claves de los tres, y la fila fantasma volvía
// a entrar por la fuente que quedara sin arreglar.
//
// `agent_key` (lo que sale al front) se sigue derivando del NOMBRE VISIBLE: no
// se toca el contrato de fuera, sólo la clave interna con la que se agrupa.
function highscoreVisibleKey(agent) {
  return String(agent || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "");
}
__name(highscoreVisibleKey, "highscoreVisibleKey");
// La fila puntuable es persona + rol + equipo físico. Los alias del MISMO
// equipo se reúnen; equipos diferentes nunca comparten puntos ni snapshot.
// `agent` mantiene la persona visible y `machine` lleva el equipo canónico.
function highscoreAgentName(agent) {
  const parsed = parseAgentIdentity(agent);
  const persona = String(parsed.persona || "").trim();
  if (!persona) return String(agent || "").trim();
  return scopedAgentIdentity(persona, "", parsed.role) || persona;
}
__name(highscoreAgentName, "highscoreAgentName");

function highscoreGroupKey(agent, machine) {
  const parsed = parseAgentIdentity(agent);
  const persona = identityKey(parsed.persona) || highscoreVisibleKey(agent);
  if (!persona) return highscoreVisibleKey(agent);
  const suffix=canonicalMachineSuffix(parsed.suffix || machineSuffix(machine) || "");
  return `${parsed.role}|${persona}|${identityKey(suffix || machine)}`;
}
__name(highscoreGroupKey, "highscoreGroupKey");

async function highscorePeriodMetrics(env, inicio, fin) {
  const totals = new Map();
  const rowFor = (agent, machine) => {
    const visible = reportAgentIdentity(agent, machine) || String(agent || "").trim();
    if (!highscoreVisibleKey(visible)) return null;
    const key = highscoreGroupKey(visible, machine);
    const nombre = highscoreAgentName(visible);
    if (!totals.has(key)) totals.set(key, { agent_key:key, agent:nombre, machine:canonicalMachineSuffix(parseAgentIdentity(visible).suffix || machineSuffix(machine)) || String(machine || ""),
      objectives:0, windows:0, missions:0, tasks:0, points:0 });
    return totals.get(key);
  };
  const rows = async (sql) => ((await env.DB.prepare(sql).bind(inicio, fin).all()).results || []);

  for (const item of await rows(
    "SELECT author,COUNT(*) c FROM ideas WHERE created_at>=? AND created_at<? GROUP BY author"
  )) {
    const row = rowFor(highscoreAgent(item.author), ""), count = Number(item.c) || 0;
    if (row) { row.objectives += count; row.points += count * HIGHSCORE_WEIGHTS.objective; }
  }
  for (const item of await rows(
    "SELECT agent,machine,COUNT(*) c FROM decisions WHERE created_at>=? AND created_at<? GROUP BY agent,machine"
  )) {
    const row = rowFor(item.agent, item.machine), count = Number(item.c) || 0;
    if (row) { row.windows += count; row.points += count * HIGHSCORE_WEIGHTS.window; }
  }
  for (const item of await rows(
    `SELECT assignee,loc,COUNT(*) c FROM (SELECT t.assignee,t.loc,t.status,${HIGHSCORE_MISSION_STARTED_SQL} scored_at, ` +
    `EXISTS(SELECT 1 FROM mission_tasks mt3 WHERE mt3.mission_id=t.id) con_plan FROM tickets t WHERE ${AGENT_SOURCE_SQL_T}) ` +
    `WHERE (status IN ('in_progress','resolved') OR (status='open' AND con_plan=1)) ` +
    "AND scored_at>=? AND scored_at<? GROUP BY assignee,loc"
  )) {
    const row = rowFor(item.assignee, item.loc), count = Number(item.c) || 0;
    if (row) { row.missions += count; row.points += count * HIGHSCORE_WEIGHTS.mission; }
  }

  const taskRows = ((await env.DB.prepare(
    `SELECT m.mission_id,m.code,m.status,m.owner,m.updated_at,t.assignee,t.loc ` +
    `FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id WHERE ${AGENT_SOURCE_SQL_T} ` +
    "AND COALESCE(t.status,'')!='cancelled' " +
    "AND m.updated_at>=? AND m.updated_at<? AND m.status IN ('in_progress','done')"
  ).bind(inicio, fin).all()).results || []);
  const representatives = new Map();
  for (const task of taskRows) {
    const match = String(task.code || "").toLowerCase().match(/^([a-c])(?:[1-3])?$/);
    if (!match) continue;
    const family = String(task.mission_id || "") + "|" + match[1], previous = representatives.get(family);
    if (!previous || Number(task.updated_at) >= Number(previous.updated_at)) representatives.set(family, task);
  }
  for (const task of representatives.values()) {
    const row = rowFor(task.assignee, task.loc);
    if (!row) continue;
    row.tasks += 1;
    row.points += HIGHSCORE_TASK_WEIGHTS.task +
      (["doing", "in_progress"].includes(String(task.status || "")) ? HIGHSCORE_TASK_WEIGHTS.active_bonus : 0);
  }
  return totals;
}
__name(highscorePeriodMetrics, "highscorePeriodMetrics");

function highscoreNaturalPeriods(ahora) {
  const today = madridDayKey(ahora), [year, month, date] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, date, 12)).getUTCDay();
  const monday = new Date(Date.UTC(year, month - 1, date - ((weekday + 6) % 7), 12));
  const key = (value) => value.toISOString().slice(0, 10);
  const weekKey = key(monday), monthKey = `${year}-${String(month).padStart(2, "0")}-01`;
  const week = missionDayRange(weekKey), currentMonth = missionDayRange(monthKey), currentDay = missionDayRange(today);
  if (!week || !currentMonth || !currentDay) throw new Error("No se pudieron calcular los periodos naturales de Madrid");
  return { today, week_key:weekKey, week_start:week.start, month_key:monthKey,
    month_start:currentMonth.start, day_end:currentDay.end };
}
__name(highscoreNaturalPeriods, "highscoreNaturalPeriods");

var HIGHSCORE_HISTORY_PERIODS = ["today", "yesterday", "week", "month", "year"];

function highscoreHistoryRange(period, ahora = Date.now()) {
  const selected = String(period || "month").trim().toLowerCase();
  if (!HIGHSCORE_HISTORY_PERIODS.includes(selected)) return null;
  const natural = highscoreNaturalPeriods(ahora), today = missionDayRange(natural.today);
  if (!today) return null;
  const yesterdayKey = madridDayKey(today.start - 1), yearKey = `${natural.today.slice(0, 4)}-01-01`;
  const startKey = selected === "today" ? natural.today : selected === "yesterday" ? yesterdayKey
    : selected === "week" ? natural.week_key : selected === "month" ? natural.month_key : yearKey;
  const startRange = missionDayRange(startKey);
  const end = selected === "yesterday" ? today.start : Math.min(today.end, Number(ahora) + 1);
  const endDay = selected === "yesterday" ? yesterdayKey : natural.today;
  if (!startRange || startRange.start >= end) return null;
  return { period:selected, start:startRange.start, end, start_day:startKey, end_day:endDay };
}
__name(highscoreHistoryRange, "highscoreHistoryRange");

function highscoreHistoryDayKeys(startDay, endDay) {
  const first = missionDayRange(startDay), last = missionDayRange(endDay);
  if (!first || !last || first.start > last.start) return [];
  const days = [];
  for (let cursor = first.start; cursor <= last.start && days.length < 370; ) {
    days.push(madridDayKey(cursor + 12 * 60 * 60 * 1000));
    const current = missionDayRange(days[days.length - 1]);
    if (!current || current.end <= cursor) break;
    cursor = current.end;
  }
  return days;
}
__name(highscoreHistoryDayKeys, "highscoreHistoryDayKeys");

// Eje compartido de la comparación. Las horas avanzan por instante absoluto:
// así un día de cambio horario tiene honestamente 23 o 25 intervalos. Semana y
// mes usan días naturales de Madrid, y el año meses, manteniendo el payload en
// como máximo 25/31/12 puntos respectivamente.
function highscoreComparisonAxis(range) {
  if (!range) return null;
  const labels = [];
  if (["today", "yesterday"].includes(range.period)) {
    for (let at = range.start; at < range.end && labels.length < 25; at += 60 * 60 * 1000) {
      const hour = madridHourKey(at);
      labels.push({ key:`${hour}@${at}`, label:`${hour.slice(11)}:00`, at });
    }
    return { granularity:"hour", labels };
  }
  if (["week", "month"].includes(range.period)) {
    for (const day of highscoreHistoryDayKeys(range.start_day, range.end_day)) {
      const natural = missionDayRange(day);
      if (natural && natural.start < range.end) labels.push({ key:day, label:day.slice(5), at:natural.start });
    }
    return { granularity:"day", labels };
  }
  if (range.period === "year") {
    const first = String(range.start_day || "").slice(0, 7), last = String(range.end_day || "").slice(0, 7);
    let [year, month] = first.split("-").map(Number);
    while (year && month && labels.length < 12) {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      if (key > last) break;
      const natural = missionDayRange(`${key}-01`);
      if (natural && natural.start < range.end) labels.push({ key, label:key, at:natural.start });
      month += 1;
      if (month > 12) { year += 1; month = 1; }
    }
    return { granularity:"month", labels };
  }
  return null;
}
__name(highscoreComparisonAxis, "highscoreComparisonAxis");

// `MacMini` fue el apellido derivado de la máquina antes de que la identidad
// operativa del mismo equipo pasara a `Mini`. Dentro del histórico ambos son la
// misma familia física: se canonicalizan antes de filtrar, deduplicar y sumar,
// para que OraculoMini no aparezca dos veces ni pierda los puntos antiguos.
function highscoreCanonicalHistoryFamily(agent, machine) {
  const family = reportAgentFamily(agent, machine);
  if (!family || !family.family_key || family.family_key.startsWith("external:")) return family;
  const parsed = parseAgentIdentity(family.family_name);
  // NiobeMacMini es una familia nueva y visible, no un alias de OraculoMini.
  // Sólo se conserva el colapso legado MacMini→Mini de las personas históricas;
  // los puntos anteriores de Oraculo nunca se reasignan automáticamente a Niobe.
  if (parsed.suffix !== "MacMini" || parsed.persona === "Niobe") return family;
  return { ...family,
    family_key:`${identityKey(parsed.persona)}@mini`,
    family_name:`${parsed.persona}Mini`
  };
}
__name(highscoreCanonicalHistoryFamily, "highscoreCanonicalHistoryFamily");

// Detalle histórico exacto de UNA familia dentro de UN proyecto canónico. Los
// cinco periodos salen de medianoches Europe/Madrid (no de restar 24 h), y las
// métricas, la serie y la cronología nacen de la misma lista de hechos. Así no
// puede haber puntos en el total que no aparezcan en el día o en el timeline.
async function highscoreProjectHistory(env, requestedAgent, projectId, period = "today", ahora = Date.now()) {
  const parsed = parseAgentIdentity(requestedAgent), suffix = parsed.suffix;
  if (parsed.role !== "main" || !suffix || !String(parsed.persona || "").trim()) {
    return { ok:false, code:"exact_agent_required", error:"agent debe ser una identidad principal con apellido de equipo" };
  }
  const wanted = highscoreCanonicalHistoryFamily(requestedAgent, "");
  if (!wanted || !wanted.family_key || wanted.family_key.startsWith("external:")) {
    return { ok:false, code:"exact_agent_required", error:"agent no pertenece a una familia canónica" };
  }
  const exactProjectId = String(projectId || "").trim().slice(0, 120);
  if (!exactProjectId) return { ok:false, code:"project_id_required", error:"project_id exacto requerido" };
  const project = await env.DB.prepare("SELECT id,name FROM projects WHERE id=?").bind(exactProjectId).first();
  if (!project || String(project.id) !== exactProjectId) {
    return { ok:false, code:"invalid_project_id", error:"project_id no pertenece al censo" };
  }
  const range = highscoreHistoryRange(period, ahora);
  if (!range) return { ok:false, code:"invalid_period", error:"period debe ser today, yesterday, week, month o year" };
  const rows = async (sql, ...binds) => ((await env.DB.prepare(sql).bind(...binds).all()).results || []);
  const [ideas, decisions, missions, tasks, latestMissions, projects] = await Promise.all([
    rows("SELECT id,title,author,author_identity,project,created_at FROM ideas " +
      "WHERE project=? AND created_at>=? AND created_at<?", exactProjectId, range.start, range.end),
    rows("SELECT id,question,status,agent,machine,project,created_at FROM decisions " +
      "WHERE project=? AND created_at>=? AND created_at<?", exactProjectId, range.start, range.end),
    rows(`SELECT * FROM (SELECT t.id,t.subject,t.assignee,t.loc,t.status,t.project,t.project_id,` +
      `${HIGHSCORE_MISSION_STARTED_SQL} scored_at, ` +
      `EXISTS(SELECT 1 FROM mission_tasks mt3 WHERE mt3.mission_id=t.id) con_plan FROM tickets t ` +
      `WHERE ${AGENT_SOURCE_SQL_T}) WHERE COALESCE(NULLIF(project_id,''),project)=? ` +
      `AND (status IN ('in_progress','resolved') OR (status='open' AND con_plan=1)) ` +
      `AND scored_at>=? AND scored_at<?`, exactProjectId, range.start, range.end),
    rows(`SELECT m.mission_id,m.code,m.title,m.status,m.owner,m.executor,m.updated_at,` +
      `t.assignee,t.loc,t.project,t.project_id FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id ` +
      `WHERE ${AGENT_SOURCE_SQL_T} AND COALESCE(NULLIF(t.project_id,''),t.project)=? ` +
      `AND COALESCE(t.status,'')!='cancelled' ` +
      `AND m.updated_at>=? AND m.updated_at<? AND m.status IN ('in_progress','done')`,
      exactProjectId, range.start, range.end),
    rows(`SELECT t.id,t.subject,t.assignee,t.loc,t.status,t.project,t.project_id,t.resolved_at,` +
      `${HIGHSCORE_WORK_STARTED_SQL} work_started_at,${HIGHSCORE_MISSION_PROGRESS_SQL} work_progress_at,` +
      `(SELECT COALESCE(NULLIF(mt.executor,''),NULLIF(mt.owner,'')) FROM mission_tasks mt ` +
      `WHERE mt.mission_id=t.id ORDER BY COALESCE(mt.updated_at,0) DESC LIMIT 1) executor ` +
      `FROM tickets t WHERE ${MISSION_SCOPE_SQL_T} AND t.status IN ('in_progress','resolved') ` +
      `ORDER BY COALESCE(t.resolved_at,${HIGHSCORE_MISSION_PROGRESS_SQL}) DESC`),
    rows("SELECT id,name FROM projects")
  ]);
  const familyMatches = (agent, machine) => {
    const family = highscoreCanonicalHistoryFamily(agent, machine);
    return !!family && family.family_key === wanted.family_key;
  };
  const timeline = [];
  const push = (type, row, at, points, extra = {}) => {
    const stamp = Number(at) || 0;
    if (stamp < range.start || stamp >= range.end) return;
    timeline.push({ type, id:String(row.id || ""), title:String(row.title || "").trim().slice(0, 300),
      at:stamp, day:madridDayKey(stamp), project_id:exactProjectId, points, ...extra });
  };
  for (const idea of ideas) {
    // Misma atribución que /highscore/daily: la firma pública es el hecho que
    // puntúa. author_identity es procedencia interna y no puede sumar por una
    // firma genérica que el marcador diario mantendría separada.
    const identity = String(highscoreAgent(idea.author) || "").trim();
    if (identity && familyMatches(identity, "")) push("objective", idea, idea.created_at, HIGHSCORE_WEIGHTS.objective,
      { agent:wanted.family_name, status:"created", scoring:true });
  }
  for (const decision of decisions) if (familyMatches(decision.agent, decision.machine))
    push("window", { ...decision, title:decision.question }, decision.created_at, HIGHSCORE_WEIGHTS.window,
      { agent:wanted.family_name, status:String(decision.status || ""), scoring:true });
  for (const mission of missions) if (familyMatches(mission.assignee, mission.loc))
    push("mission", { ...mission, title:mission.subject }, mission.scored_at, HIGHSCORE_WEIGHTS.mission,
      { agent:wanted.family_name, status:String(mission.status || ""), scoring:true });

  const ownTasks = tasks.filter((task) => familyMatches(task.assignee, task.loc));
  const representatives = new Map();
  for (const task of ownTasks) {
    const match = String(task.code || "").toLowerCase().match(/^([a-c])(?:[1-3])?$/);
    if (!match) continue;
    const key = `${String(task.mission_id || "")}|${match[1]}`, previous = representatives.get(key);
    if (!previous || Number(task.updated_at) >= Number(previous.updated_at)) representatives.set(key, task);
  }
  // Ranking del mismo proyecto y del mismo rango. No se deriva del daily
  // global: hacerlo mezclaría Pixeria con el cierre factual de admira-tv que
  // motivó este contrato. Todas las filas nacen de las mismas cuatro fuentes y
  // pesos que la cronología anterior.
  const rankingTotals = new Map(), rankingEvents = [];
  const rankingFamily = (agent, machine) => {
    const family = highscoreCanonicalHistoryFamily(agent, machine), identity = family && parseAgentIdentity(family.family_name);
    return family && family.family_key && !family.family_key.startsWith("external:") &&
      identity && identity.role === "main" && identity.suffix ? family : null;
  };
  const rankingAdd = (agent, machine, points, at) => {
    const family = rankingFamily(agent, machine);
    const stamp = Number(at) || 0, score = Number(points) || 0;
    if (!family || score <= 0 || stamp < range.start || stamp >= range.end) return;
    const current = rankingTotals.get(family.family_key) || { agent:family.family_name, points:0 };
    current.points += score;
    rankingTotals.set(family.family_key, current);
    rankingEvents.push({ family_key:family.family_key, at:stamp, points:score });
  };
  for (const idea of ideas) rankingAdd(highscoreAgent(idea.author), "", HIGHSCORE_WEIGHTS.objective, idea.created_at);
  for (const decision of decisions) rankingAdd(decision.agent, decision.machine, HIGHSCORE_WEIGHTS.window, decision.created_at);
  for (const mission of missions) rankingAdd(mission.assignee, mission.loc, HIGHSCORE_WEIGHTS.mission, mission.scored_at);
  const rankingTasks = new Map();
  for (const task of tasks) {
    const match = String(task.code || "").toLowerCase().match(/^([a-c])(?:[1-3])?$/), family = rankingFamily(task.assignee, task.loc);
    if (!match || !family) continue;
    const key = `${family.family_key}|${String(task.mission_id || "")}|${match[1]}`, previous = rankingTasks.get(key);
    if (!previous || Number(task.updated_at) >= Number(previous.task.updated_at)) rankingTasks.set(key, { family, task });
  }
  for (const { family, task } of rankingTasks.values()) rankingAdd(family.family_name, task.loc,
    HIGHSCORE_TASK_WEIGHTS.task +
      (["doing", "in_progress"].includes(String(task.status || "")) ? HIGHSCORE_TASK_WEIGHTS.active_bonus : 0),
    task.updated_at);
  // `ordered` es el universo factual completo del scope, no un podio, y la
  // fuente única para cualquier comparativa: el consumidor puede obtener el
  // máximo de ordered[0].points y derivar cada ratio sin duplicar puntos ni
  // identidades en otro payload. Un agente
  // sin puntos no se añade para hacer navegable una pantalla vacía: en ese caso
  // current_index/previous/next son null. La navegación es lineal: el primero
  // no tiene previous y el último puntuado no tiene next.
  const ordered = [...rankingTotals.entries()].filter(([, row]) => Number(row.points) > 0)
    .sort((a, b) => b[1].points - a[1].points ||
    a[1].agent.localeCompare(b[1].agent, "es")).map(([familyKey, row], index) => ({
      agent:row.agent, points:row.points, position:index + 1, family_key:familyKey
    }));
  const currentIndex = ordered.findIndex((row) => row.family_key === wanted.family_key);
  const publicRow = (row) => row ? { agent:row.agent, points:row.points, position:row.position } : null;
  const previous = currentIndex > 0 ? publicRow(ordered[currentIndex - 1]) : null;
  const next = currentIndex >= 0 && currentIndex < ordered.length - 1
    ? publicRow(ordered[currentIndex + 1]) : null;
  const ranking = { project_id:exactProjectId, period:range.period,
    ordered:ordered.map(publicRow), current_index:currentIndex >= 0 ? currentIndex : null,
    previous, next };
  const axis = highscoreComparisonAxis(range), axisLabels = axis ? axis.labels : [];
  const comparisonSeries = ordered.map((row, seriesIndex) => {
    const intervals = Array(axisLabels.length).fill(0);
    for (const event of rankingEvents) {
      if (event.family_key !== row.family_key) continue;
      let bucket = -1;
      for (let index = 0; index < axisLabels.length && axisLabels[index].at <= event.at; index += 1) bucket = index;
      if (bucket >= 0) intervals[bucket] += event.points;
    }
    let accumulated = 0;
    return { agent:row.agent, position:row.position, points:row.points,
      current:seriesIndex === currentIndex, values:intervals.map((points) => accumulated += points) };
  });
  // Contrato del marcador: labels[i] aporta el inicio factual del bucket y
  // series[s].values[i] el acumulado de esa familia hasta ese bucket. De ahí se
  // derivan exactamente delta (resta del acumulado anterior), cuota y distancia
  // al máximo del mismo índice. El bucket puede agregar varios hechos: por eso
  // esta serie no publica id/tipo/título ni permite atribuir el delta a una
  // misión concreta; esa explicación pertenece exclusivamente al timeline.
  const comparisonEvolution = { project_id:exactProjectId, period:range.period, timezone:"Europe/Madrid",
    mode:"cumulative", granularity:axis ? axis.granularity : null,
    labels:axisLabels.map(({ key, label, at }) => ({ key, label, at })), series:comparisonSeries };

  // El detalle conserva su timeline puro, pero explica honestamente si el
  // trabajo más reciente de la familia pertenece a otro proyecto y ofrece el
  // enlace exacto. La separación evita que un carril global parezca un evento
  // ausente del proyecto que estaba seleccionado en la pantalla.
  const projectsByKey = new Map();
  for (const row of projects) {
    projectsByKey.set(String(row.id || "").trim().toLowerCase(), row);
    projectsByKey.set(String(row.name || "").trim().toLowerCase(), row);
  }
  // EN QUÉ PROYECTOS HA TRABAJADO ESTE AGENTE EN ESTE PERIODO (14-ago-2026, Carlos).
  // El detalle se abre SIEMPRE contra un proyecto, y hasta aquí la esquina del gráfico
  // solo sabía repetir cuál era. Pero un agente reparte el día entre varios, y para
  // leer su registro de misiones hay que poder saltar de uno a otro sin volver al
  // Highscore y adivinar dónde estuvo. Este recorrido ya existía para `latest_work`,
  // así que el dato sale gratis: lo único que faltaba era ACOTARLO al periodo —
  // latestMissions no lleva filtro de fechas, trae el histórico entero— y agruparlo.
  const worked = new Map();
  const notaProyecto = (projectRow, factualAt) => {
    const key = String(projectRow.id);
    const acc = worked.get(key) ||
      { project_id:key, project_name:String(projectRow.name || key), missions:0, last_at:0 };
    acc.missions += 1;
    if (factualAt > acc.last_at) acc.last_at = factualAt;
    worked.set(key, acc);
  };
  let latestWork = null;
  for (const row of latestMissions) {
    if (!familyMatches(row.assignee, row.loc)) continue;
    const projectRow = projectsByKey.get(String(row.project_id || row.project || "").trim().toLowerCase());
    if (!projectRow || !projectRow.id) continue;
    const startedAt = Number(row.work_started_at) || 0, finishedAt = Number(row.resolved_at) || 0;
    const factualAt = finishedAt || Number(row.work_progress_at) || startedAt;
    if (factualAt >= range.start && factualAt < range.end) notaProyecto(projectRow, factualAt);
    if (!factualAt || latestWork && factualAt <= latestWork.at) continue;
    latestWork = { agent:wanted.family_name,
      executor:reportAgentIdentity(row.executor || row.assignee, row.loc),
      reference:String(row.id || ""), title:String(row.subject || "").trim().slice(0, 300),
      project_id:String(projectRow.id), project_name:String(projectRow.name || projectRow.id),
      status:finishedAt ? "finalized" : "running", at:factualAt,
      started_at:startedAt || null, finished_at:finishedAt || null,
      duration_ms:startedAt && (finishedAt || ahora) >= startedAt ? (finishedAt || ahora) - startedAt : null,
      detail_url:"/highscoreDetail?agent=" + encodeURIComponent(wanted.family_name) +
        "&project_id=" + encodeURIComponent(String(projectRow.id)) + "&period=today&type=all" };
  }
  for (const task of ownTasks) {
    const match = String(task.code || "").toLowerCase().match(/^([a-c])(?:[1-3])?$/);
    if (!match) continue;
    const scoring = representatives.get(`${String(task.mission_id || "")}|${match[1]}`) === task;
    const points = scoring ? HIGHSCORE_TASK_WEIGHTS.task +
      (["doing", "in_progress"].includes(String(task.status || "")) ? HIGHSCORE_TASK_WEIGHTS.active_bonus : 0) : 0;
    const executor = reportAgentIdentity(task.executor || task.owner || task.assignee, task.loc);
    push("task", { ...task, id:`${String(task.mission_id)}:${String(task.code)}` }, task.updated_at, points,
      { agent:wanted.family_name, executor, status:String(task.status || ""), mission_id:String(task.mission_id || ""),
        code:String(task.code || ""), scoring });
  }
  const typeRank = { objective:0, window:1, mission:2, task:3 };
  timeline.sort((a, b) => b.at - a.at || (typeRank[a.type] ?? 9) - (typeRank[b.type] ?? 9) || a.id.localeCompare(b.id));
  const blank = () => ({ objectives:0, windows:0, missions:0, tasks:0, points:0 });
  const metrics = blank(), byDay = new Map(highscoreHistoryDayKeys(range.start_day, range.end_day).map((day) => [day, { day, ...blank() }]));
  for (const item of timeline) {
    const bucket = byDay.get(item.day);
    if (!bucket) continue;
    const field = item.type === "objective" ? "objectives" : item.type === "window" ? "windows"
      : item.type === "mission" ? "missions" : item.scoring ? "tasks" : "";
    if (field) { metrics[field] += 1; bucket[field] += 1; }
    metrics.points += item.points; bucket.points += item.points;
  }
  const generatedAt = Number(ahora);
  return { ok:true, agent:wanted.family_name, project_id:exactProjectId, project_name:String(project.name || exactProjectId),
    timezone:"Europe/Madrid", period:range.period,
    range:{ start:range.start, end:range.end, start_day:range.start_day, end_day:range.end_day,
      from:range.start_day, to:range.end_day },
    generated_at:generatedAt, sampled_at:generatedAt, metrics, ranking,
    // El proyecto abierto va SIEMPRE en la lista aunque no tenga misiones en el
    // periodo: es el que está en pantalla y el selector no puede quedarse sin la
    // opción que representa lo que se está mirando. Orden: más misiones primero y,
    // a igualdad, lo más reciente — que es como se busca «dónde estuve hoy».
    projects_worked:(() => {
      if (!worked.has(exactProjectId)) {
        worked.set(exactProjectId, { project_id:exactProjectId,
          project_name:String(project.name || exactProjectId), missions:0, last_at:0 });
      }
      return [...worked.values()].sort((a, b) => b.missions - a.missions || b.last_at - a.last_at ||
        a.project_id.localeCompare(b.project_id));
    })(),
    comparison_evolution:comparisonEvolution, latest_work:latestWork,
    evolution:{ start:range.start_day, end:range.end_day, days:[...byDay.values()] }, timeline };
}
__name(highscoreProjectHistory, "highscoreProjectHistory");

// Histórico factual del agente. No usa `highscore_snapshots`: esa tabla conserva
// sólo 48 h para la flecha horaria. Aquí se recorren los mismos cuatro hechos del
// marcador diario y se agrupan por el día REAL de Madrid. Las tareas conservan el
// contrato A/A1..A3, B/B1..B3 y C/C1..C3: una única representante —la más reciente—
// por misión, familia y día. Así semana/mes son la suma de días canónicos, no una
// extrapolación del total actual ni una serie reconstruida en el navegador.
// El recuento diario, con un filtro de pertenencia inyectado. Existe para que el
// histórico de UN agente y el de TODA la flota salgan del mismo sitio: si cada
// uno sumara por su cuenta acabarían diciendo cosas distintas del mismo día, y
// entonces la curva que se mira para decidir no vale para decidir nada.
async function highscoreDailyRows(env, pertenece, ahora) {
  const periods = highscoreNaturalPeriods(ahora), fin = Math.min(periods.day_end, ahora + 1);
  const rows = async (sql, ...binds) => ((await env.DB.prepare(sql).bind(...binds).all()).results || []);
  const [ideas, decisions, missions, tasks] = await Promise.all([
    rows("SELECT author,created_at FROM ideas WHERE created_at>0 AND created_at<?", fin),
    rows("SELECT agent,machine,created_at FROM decisions WHERE created_at>0 AND created_at<?", fin),
    rows(`SELECT * FROM (SELECT t.id,t.assignee,t.loc,t.status,t.closure_reason,${HIGHSCORE_MISSION_STARTED_SQL} scored_at, ` +
      `EXISTS(SELECT 1 FROM mission_tasks mt3 WHERE mt3.mission_id=t.id) con_plan FROM tickets t WHERE ${AGENT_SOURCE_SQL_T}) ` +
      `WHERE (status IN ('in_progress','resolved') OR (status='open' AND con_plan=1)) AND scored_at>0 AND scored_at<?`, fin),
    rows(`SELECT m.mission_id,m.code,m.status,m.owner,m.updated_at,t.assignee,t.loc ` +
      `FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id WHERE ${AGENT_SOURCE_SQL_T} ` +
      "AND COALESCE(t.status,'')!='cancelled' " +
      "AND m.updated_at>0 AND m.updated_at<? AND m.status IN ('in_progress','done')", fin)
  ]);
  const daily = new Map(), hours = new Map();
  // Same retained facts, separate civil-hour buckets. Absolute epoch keys keep
  // the two Madrid 02:00 hours at the autumn DST transition distinct.
  const addHour = (at, points, agent, machine) => {
    const stamp = Number(at) || 0;
    if (stamp <= 0 || stamp > ahora) return;
    const start = Math.floor(stamp / 3600000) * 3600000;
    const family = highscoreCanonicalHistoryFamily(agent, machine || "");
    const name = family && family.family_name || String(agent || "").trim();
    if (!name) return;
    const key = start + "|" + name;
    if (!hours.has(key)) hours.set(key, { agent:name, start, end:start + 3600000, points:0 });
    hours.get(key).points += points;
  };
  const familyMatches = pertenece;
  const bucket = (at) => {
    const stamp = Number(at) || 0;
    if (stamp <= 0 || stamp > ahora) return null;
    const day = madridDayKey(stamp);
    if (!daily.has(day)) daily.set(day, { day, objectives:0, windows:0, missions:0, tasks:0, points:0, por_agente:{} });
    return daily.get(day);
  };
  // QUIÉN puntuó cada día, además de cuánto. Se acumula aquí y no en una
  // segunda pasada porque es el único punto del código que ya sabe, a la vez,
  // el día, los puntos y de quién son: recalcularlo aparte abriría la puerta a
  // que el desglose no sumara el total.
  const add = (at, kind, points, agent, machine, hourly = true) => {
    if (hourly) addHour(at, points, agent, machine);
    const row = bucket(at); if (!row) return;
    row[kind] += 1; row.points += points;
    const familia = highscoreCanonicalHistoryFamily(agent, machine || "");
    const nombre = (familia && familia.family_name) || String(agent || "").trim();
    if (!nombre) return;
    const total = row.por_agente[nombre] || { objectives:0, windows:0, missions:0, tasks:0, points:0 };
    total[kind] += 1; total.points += points;
    row.por_agente[nombre] = total;
  };
  for (const idea of ideas) {
    const agent = highscoreAgent(idea.author);
    // Un objetivo sin apellido físico no se adjudica a ciegas a uno de los
    // equipos de la misma persona. Se conserva la identidad exacta o no suma.
    if (agent && familyMatches(agent, "")) add(idea.created_at, "objectives", HIGHSCORE_WEIGHTS.objective, agent, "");
  }
  for (const decision of decisions) if (familyMatches(decision.agent, decision.machine))
    add(decision.created_at, "windows", HIGHSCORE_WEIGHTS.window, decision.agent, decision.machine);
  for (const mission of missions) if (familyMatches(mission.assignee, mission.loc))
    add(mission.scored_at, "missions", HIGHSCORE_WEIGHTS.mission, mission.assignee, mission.loc);

  const representatives = new Map(), hourRepresentatives = new Map();
  for (const task of tasks) {
    const match = String(task.code || "").toLowerCase().match(/^([a-c])(?:[1-3])?$/);
    if (!match) continue;
    if (!familyMatches(task.assignee, task.loc)) continue;
    const stamp = Number(task.updated_at) || 0;
    if (stamp <= 0 || stamp > ahora) continue;
    const key = madridDayKey(stamp) + "|" + String(task.mission_id || "") + "|" + match[1];
    const hourKey = Math.floor(stamp / 3600000) + "|" + String(task.mission_id || "") + "|" + match[1];
    const previousHour = hourRepresentatives.get(hourKey);
    if (!previousHour || stamp >= Number(previousHour.updated_at)) hourRepresentatives.set(hourKey, task);
    const previous = representatives.get(key);
    if (!previous || stamp >= Number(previous.updated_at)) representatives.set(key, task);
  }
  for (const task of representatives.values()) add(task.updated_at, "tasks", HIGHSCORE_TASK_WEIGHTS.task +
    (["doing", "in_progress"].includes(String(task.status || "")) ? HIGHSCORE_TASK_WEIGHTS.active_bonus : 0),
    task.assignee, task.loc, false);
  for (const task of hourRepresentatives.values()) addHour(task.updated_at, HIGHSCORE_TASK_WEIGHTS.task +
    (["doing", "in_progress"].includes(String(task.status || "")) ? HIGHSCORE_TASK_WEIGHTS.active_bonus : 0),
    task.assignee, task.loc);

  const allDays = [...daily.values()].sort((a, b) => a.day.localeCompare(b.day));
  const currentHour = Math.floor(ahora / 3600000) * 3600000;
  const bestHours = new Map();
  for (const row of hours.values()) {
    if (row.end > currentHour) continue;
    const previous = bestHours.get(row.agent);
    if (!previous || row.points > previous.points || (row.points === previous.points && row.start < previous.start)) bestHours.set(row.agent, row);
  }
  return { periods, allDays, hourRecords:{ timezone:"Europe/Madrid", current_start:currentHour,
    coverage:{ start_at:hours.size ? [...hours.values()].reduce((first, row) => Math.min(first, row.start), Infinity) : null,
      end_at:currentHour, source:"retained_facts" },
    records:[...bestHours.values()].sort((a,b) => b.points - a.points || a.start - b.start || a.agent.localeCompare(b.agent)) } };
}
__name(highscoreDailyRows, "highscoreDailyRows");

// La forma pública del histórico, común a un agente y a la flota entera.
function highscoreHistoryPayload(periods, allDays, extra) {
  const sum = (rows) => rows.reduce((total, row) => ({
    objectives:total.objectives + row.objectives, windows:total.windows + row.windows,
    missions:total.missions + row.missions, tasks:total.tasks + row.tasks, points:total.points + row.points
  }), { objectives:0, windows:0, missions:0, tasks:0, points:0 });
  const weekRows = allDays.filter((row) => row.day >= periods.week_key && row.day <= periods.today);
  const monthRows = allDays.filter((row) => row.day >= periods.month_key && row.day <= periods.today);
  const evolutionStart = new Date(Date.UTC(...periods.today.split("-").map(Number).map((n, i) => i === 1 ? n - 1 : n), 12));
  evolutionStart.setUTCDate(evolutionStart.getUTCDate() - 29);
  const evolutionKey = evolutionStart.toISOString().slice(0, 10), byDay = new Map(allDays.map((row) => [row.day, row]));
  const evolution = [];
  for (let cursor = new Date(evolutionStart); cursor.toISOString().slice(0, 10) <= periods.today; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.toISOString().slice(0, 10), row = byDay.get(day);
    evolution.push(row ? { ...row } : { day, objectives:0, windows:0, missions:0, tasks:0, points:0 });
  }
  const sampledAt = Date.now();
  return Object.assign({ ok:true, timezone:"Europe/Madrid", sampled_at:sampledAt, generated_at:sampledAt,
    periods:{ week:{ start:periods.week_key, end:periods.today, ...sum(weekRows) },
      month:{ start:periods.month_key, end:periods.today, ...sum(monthRows) },
      total:{ start:allDays.length ? allDays[0].day : null, end:periods.today, ...sum(allDays) } },
    evolution:{ start:evolutionKey, end:periods.today, days:evolution } }, extra || {});
}
__name(highscoreHistoryPayload, "highscoreHistoryPayload");

// EL HISTÓRICO DE TODA LA FLOTA. Misma agregación que el de un agente, sin
// filtro de familia. Existe para responder a una pregunta que hasta ahora no
// tenía respuesta en ninguna pantalla: ¿el equipo rinde más cada día?
//
// Dos honestidades que el payload lleva encima, porque sin ellas la curva
// engaña sola:
//  · `first_day` es el primer día con actividad REAL. Los días anteriores a que
//    esto existiera salen a cero como cualquier otro, y una gráfica que empieza
//    en cero y sube dibuja un progreso que nadie hizo: es el propio sistema
//    naciendo. Quien pinte la curva tiene que poder sombrear esa zona.
//  · `trend` compara los últimos 7 días con los 7 anteriores y dice cuántos días
//    de cada tramo tienen dato. Un «+300%» calculado sobre dos días sueltos no
//    es una tendencia, es ruido con signo.
//
// Un apunte de recuento: una tarea se cuenta UNA vez aunque la toquen dos
// agentes (la deduplicación es por día+misión+letra). Por eso el total global
// puede ser menor que la suma de los históricos individuales — mide el trabajo
// hecho, no la suma de atribuciones.
async function highscoreFleetHistory(env, ahora = Date.now()) {
  const { periods, allDays, hourRecords } = await highscoreDailyRows(env, () => true, ahora);
  const payload = highscoreHistoryPayload(periods, allDays, { scope: "global", agent: null });
  const dias = payload.evolution.days;
  const tramo = (desde, hasta) => {
    const filas = dias.slice(desde, hasta);
    const puntos = filas.reduce((t, r) => t + (Number(r.points) || 0), 0);
    const conDato = filas.filter((r) => (Number(r.points) || 0) > 0).length;
    return { dias: filas.length, con_dato: conDato, points: puntos,
      media: filas.length ? Math.round((puntos / filas.length) * 10) / 10 : 0 };
  };
  const reciente = tramo(dias.length - 7, dias.length);
  const previo = tramo(dias.length - 14, dias.length - 7);
  // Sin base con la que comparar no se inventa un porcentaje: se dice que no lo hay.
  const comparable = previo.con_dato >= 3 && reciente.con_dato >= 3 && previo.points > 0;
  payload.first_day = allDays.length ? allDays[0].day : null;
  // TODOS los días con actividad, no solo los 30 del carrusel. Agrupar por
  // semanas o por meses sobre una ventana de 30 días daría cuatro barras y dos
  // barras: un eje de meses que solo puede enseñar dos meses no es un eje de
  // meses, es un adorno. Son pocas filas (una por día vivido) y viajan enteras
  // para que el front pueda reagrupar sin volver a preguntar.
  payload.all_days = allDays;
  payload.hour_records = hourRecords;
  // El desglose viaja como LISTA ORDENADA, no como objeto: quien lo pinta no
  // debería tener que ordenar para saber quién fue primero, y un objeto no
  // garantiza orden. Van todos los agentes del día, no solo tres: agrupando por
  // semanas o meses hay que volver a sumar, y quedarse con los tres de cada día
  // daría un podio semanal falso — el cuarto de todos los días puede ser el
  // primero de la semana.
  const ordena = (fila) => {
    fila.top = Object.keys(fila.por_agente || {})
      .map((agent) => {
        const raw = fila.por_agente[agent], metrics = typeof raw === "number"
          ? { objectives:0, windows:0, missions:0, tasks:0, points:raw }
          : raw || {};
        return { agent, objectives:Number(metrics.objectives) || 0, windows:Number(metrics.windows) || 0,
          missions:Number(metrics.missions) || 0, tasks:Number(metrics.tasks) || 0,
          points:Number(metrics.points) || 0 };
      })
      .sort((a, b) => b.points - a.points || a.agent.localeCompare(b.agent, "es"));
    delete fila.por_agente;
    return fila;
  };
  payload.all_days.forEach(ordena);
  payload.evolution.days.forEach(ordena);
  payload.trend = { reciente, previo, comparable,
    variacion_pct: comparable ? Math.round(((reciente.points - previo.points) / previo.points) * 1000) / 10 : null,
    direccion: !comparable ? "sin-base"
      : reciente.points > previo.points ? "sube" : reciente.points < previo.points ? "baja" : "igual" };
  return payload;
}
__name(highscoreFleetHistory, "highscoreFleetHistory");

// La jornada no se deduce de `updated_at`: ese campo también cambia por
// sincronizaciones e informes tardíos. El primer turno sale del inicio factual
// del trabajo y el último del cierre factual (`resolved_at`). Si queda alguna
// misión abierta, se declara; nunca se convierte su último latido en una salida.
function highscoreFleetWorkday(rows) {
  const missions = Array.isArray(rows) ? rows : [];
  const stamp = (value) => {
    const at = highscoreActiveWorkMillis(value);
    return Number.isFinite(at) && at > 0 ? at : 0;
  };
  // Un premio de la jornada solo puede recaer en alguien de la FLOTA. Sin identidad
  // reconocida reportAgentFamily marca el family_key con "external:", y el galardón
  // acababa en un nombre vacío: Early Bird para nadie.
  const deLaFlota = (row) => {
    const family = reportAgentFamily(row && row.assignee, (row && row.loc) || "");
    return !!(family && family.family_key && !family.family_key.startsWith("external:"));
  };
  const withAgent = (row, at) => {
    if (!row || !at) return null;
    const family = reportAgentFamily(row.assignee, row.loc || "");
    return { at,
      agent:(family && family.family_name) || String(row.assignee || "").trim(),
      mission_id:String(row.id || ""), display_ref:row.display_ref || null };
  };
  const starts = missions.map((row) => ({ row, at:stamp(row.work_started_at || row.scored_at) }))
    .filter((item) => item.at && deLaFlota(item.row)).sort((a, b) => a.at - b.at || String(a.row.id || "").localeCompare(String(b.row.id || "")));
  // Un cierre ANTERIOR a su propio inicio es un reloj imposible, no una jornada larga:
  // coronaba Night Owl a la misión con la hora peor guardada.
  const finishes = missions.map((row) => ({ row, at:stamp(row.finished_at), start:stamp(row.work_started_at || row.scored_at) }))
    .filter((item) => item.at && deLaFlota(item.row) && (!item.start || item.at >= item.start))
    .sort((a, b) => b.at - a.at || String(a.row.id || "").localeCompare(String(b.row.id || "")));
  // Cerrada sin reloj válido NO significa que siga abierta: contando solo por la falta de
  // finished_at, una misión resuelta sin hora dejaba la jornada en "open" para siempre.
  const ongoing = missions.filter((row) => !stamp(row.finished_at) &&
    !["resolved", "cancelled"].includes(String((row && row.status) || "").toLowerCase())).length;
  return { first_started_at:starts[0] ? starts[0].at : null,
    last_finished_at:finishes[0] ? finishes[0].at : null,
    early_bird:starts[0] ? withAgent(starts[0].row, starts[0].at) : null,
    night_owl:finishes[0] ? withAgent(finishes[0].row, finishes[0].at) : null,
    ongoing_missions:ongoing, state:ongoing ? "open" : finishes.length ? "closed" : "unknown" };
}
__name(highscoreFleetWorkday, "highscoreFleetWorkday");

// LAS MISIONES DE UN PERIODO, con su autor. Es el detalle que hay debajo de una
// barra seleccionada: la barra dice CUÁNTO, esto dice QUÉ y DE QUIÉN.
//
// Usa exactamente el mismo `scored_at` que puntúa la barra (HIGHSCORE_MISSION_
// STARTED_SQL) y el mismo filtro de alcance. Si listara por `created_at` o por
// `resolved_at` —que es lo cómodo— la lista y la barra hablarían de conjuntos
// distintos, y el detalle contradiría al total que dice explicar.
//
// El rango va en días de Madrid, no en UTC: un cierre de las 00:30 pertenece al
// día que la persona vivió, no al anterior.
async function highscoreFleetMissions(env, desdeDia, hastaDia) {
  const desde = missionDayRange(desdeDia), hasta = missionDayRange(hastaDia || desdeDia);
  if (!desde || !hasta || hasta.end < desde.start) {
    return { ok: false, error: "rango inválido: se esperan días AAAA-MM-DD" };
  }
  const { results } = await env.DB.prepare(
    `SELECT * FROM (SELECT t.id,t.subject,t.assignee,t.loc,t.status,t.project,t.project_id,t.created_at,` +
    `${HIGHSCORE_MISSION_STARTED_SQL} scored_at,` +
    `${HIGHSCORE_WORK_STARTED_SQL} work_started_at,t.resolved_at finished_at,` +
    `EXISTS(SELECT 1 FROM mission_tasks mt3 WHERE mt3.mission_id=t.id) con_plan ` +
    `FROM tickets t WHERE ${AGENT_SOURCE_SQL_T}) ` +
    `WHERE (status IN ('in_progress','resolved') OR (status='open' AND con_plan=1)) ` +
    `AND scored_at>=? AND scored_at<? ORDER BY scored_at ASC`
  ).bind(desde.start, hasta.end).all();
  const filas = results || [];
  await attachDisplayRefs(env, "mission", filas, (row) => row.id, (row) => row.created_at);
  return { ok: true, desde: desde.day, hasta: hasta.day, total: filas.length,
    workday: highscoreFleetWorkday(filas),
    missions: filas.map((r) => {
      const familia = reportAgentFamily(r.assignee, r.loc || "");
      return { id: r.id, display_ref: r.display_ref || null, subject: r.subject || "",
        agent: (familia && familia.family_name) || String(r.assignee || "").trim(),
        machine: r.loc || "", status: r.status, project_id: r.project_id || r.project || "",
        at: Number(r.scored_at) || 0,
        started_at: highscoreActiveWorkMillis(r.work_started_at || r.scored_at) || null,
        finished_at: highscoreActiveWorkMillis(r.finished_at) || null,
        points: HIGHSCORE_WEIGHTS.mission };
    }) };
}
__name(highscoreFleetMissions, "highscoreFleetMissions");

var HIGHSCORE_MISSION_DETAIL_PERIODS = ["hour", "day", "week", "month"];

// El desplegable de PUNTOS comparte los cuatro periodos del ranking. Hora empieza
// en el :00 del tramo absoluto (los offsets de Madrid son horas enteras, igual
// que en highscoreHourlyContract); día, semana y mes empiezan en su medianoche
// natural de Madrid. El fin es siempre el instante observado: una misión futura
// o un reloj adelantado no puede colarse en el detalle.
function highscoreMissionPeriodRange(period, ahora = Date.now()) {
  const selected = String(period || "day").trim().toLowerCase();
  if (!HIGHSCORE_MISSION_DETAIL_PERIODS.includes(selected)) return null;
  const end = highscoreActiveWorkMillis(ahora);
  if (!end) return null;
  const natural = highscoreNaturalPeriods(end), today = missionDayRange(natural.today);
  const start = selected === "hour" ? Math.floor(end / (60 * 60 * 1000)) * 60 * 60 * 1000
    : selected === "day" ? today && today.start
    : selected === "week" ? natural.week_start : natural.month_start;
  if (!start || start > end) return null;
  return { period:selected, start, end:end + 1,
    start_day:madridDayKey(start), end_day:madridDayKey(end) };
}
__name(highscoreMissionPeriodRange, "highscoreMissionPeriodRange");

// mission_tasks.report es texto operativo libre y /highscore/history es público.
// El resumen sólo conserva prosa corta: elimina bloques/comandos, URLs, correos,
// IPs y pares con nombres típicos de credenciales. El informe íntegro se consulta
// en la ficha autenticada de la misión, nunca se replica en este payload.
function highscorePublicTaskSummary(value) {
  let text = String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\r\n]*`/g, " ")
    .replace(/https?:\/\/\S+/gi, "[enlace]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[correo]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(/\b(?:sk-[A-Z0-9_-]{12,}|gh[opusr]_[A-Z0-9_]{12,}|eyJ[A-Z0-9_-]{12,}\.[A-Z0-9_-]{8,}\.[A-Z0-9_-]{8,})\b/gi, "[credencial]")
    .replace(/\b[A-Z0-9_-]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|PRIVATE[_-]?KEY)[A-Z0-9_-]*\b\s*[:=]?\s*[^\s,;]+/gi, "[credencial]")
    .replace(/\b(?:authorization|bearer|password|passwd|secret|token|api[ _-]?key|private[ _-]?key)\b\s*[:=]?\s*[^\s,;]+/gi, "[credencial]")
    .replace(/(?:\/Users\/|\/home\/|~\/)[^\s,;]+/g, "[ruta]")
    .replace(/[\r\n\t#>*_]+/g, " ")
    .replace(/\s+/g, " ").trim();
  if (text.length > 180) text = text.slice(0, 177).replace(/\s+\S*$/, "") + "…";
  return text;
}
__name(highscorePublicTaskSummary, "highscorePublicTaskSummary");

// Contrato público del explorador de PUNTOS. Filtra en JS por persona base para
// reunir aliases y máquinas (Lucas + LucasGrokBot) sin aproximaciones SQL que
// puedan mezclar homónimos. La consulta usa el mismo scored_at y el mismo filtro
// de alcance que el histórico global, de modo que el total y su explicación
// hablan del mismo trabajo.
async function highscoreAgentMissions(env, requestedAgent, period, ahora = Date.now()) {
  const rawAgent = String(requestedAgent || "").trim();
  const parsed = parseAgentIdentity(rawAgent), canonicalAgent = String(parsed.persona || rawAgent).trim();
  const wantedKey = identityKey(baseAgentIdentity(rawAgent));
  const range = highscoreMissionPeriodRange(period, ahora);
  if (!wantedKey) return { ok:false, code:"agent_required", error:"agent requerido" };
  if (!isKnownPersona(canonicalAgent)) return { ok:false, code:"unknown_agent", error:"agent no pertenece a una familia canónica" };
  const rolelessKey = identityKey(rawAgent).replace(/^(?:infra|sub)/, "").replace(/^agente/, "");
  const spec = AGENT_IDENTITY_SPEC.personas.find((item) => item.name === canonicalAgent);
  const exactBaseAlias = !!spec && [spec.name, ...(spec.aliases || [])].some((value) => identityKey(value).replace(/^agente/, "") === rolelessKey);
  if (!parsed.suffix && !exactBaseAlias) return { ok:false, code:"unknown_agent", error:"agent no pertenece a una familia canónica" };
  if (!range) return { ok:false, code:"invalid_period", error:"period debe ser hour|day|week|month" };

  const { results } = await env.DB.prepare(
    `SELECT * FROM (SELECT t.id,t.subject,t.assignee,t.loc,t.status,t.project,t.project_id,t.created_at,` +
    `${HIGHSCORE_MISSION_STARTED_SQL} scored_at,` +
    `${HIGHSCORE_WORK_STARTED_SQL} work_started_at,t.resolved_at finished_at,` +
    `EXISTS(SELECT 1 FROM mission_tasks mt3 WHERE mt3.mission_id=t.id) con_plan ` +
    `FROM tickets t WHERE ${AGENT_SOURCE_SQL_T}) ` +
    `WHERE (status IN ('in_progress','resolved') OR (status='open' AND con_plan=1)) ` +
    `AND scored_at>=? AND scored_at<? ORDER BY scored_at DESC,id ASC`
  ).bind(range.start, range.end).all();
  const missions = (results || []).filter((row) =>
    identityKey(baseAgentIdentity(row.assignee)) === wantedKey);
  await attachDisplayRefs(env, "mission", missions, (row) => row.id, (row) => row.created_at);

  const ids = [...new Set(missions.map((row) => String(row.id || "")).filter(Boolean))];
  const taskRows = ids.length ? await selectIn(env, ids, (ph) =>
    `SELECT mission_id,code,title,status,report,created_at,started_at,ended_at,updated_at ` +
    `FROM mission_tasks WHERE mission_id IN (${ph}) ORDER BY mission_id ASC,code ASC`) : [];
  const projectIds = [...new Set(missions.map((row) => String(row.project_id || row.project || "").trim()).filter(Boolean))];
  const projectRows = projectIds.length ? await selectIn(env, projectIds, (ph) =>
    `SELECT id,name FROM projects WHERE id IN (${ph})`) : [];
  const projects = new Map((projectRows || []).map((row) => [String(row.id || ""), String(row.name || "").trim()]));
  const tasksByMission = new Map();
  const activeTask = new Set(["doing", "in_progress", "active"]);
  const taskRepresentatives = new Map();
  for (const task of taskRows || []) {
    const key = String(task.mission_id || "") + "|" + String(task.code || "").toLowerCase();
    const previous = taskRepresentatives.get(key), stamp = highscoreActiveWorkMillis(task.updated_at);
    const previousStamp = highscoreActiveWorkMillis(previous && previous.updated_at);
    // D1 impone mission_id+code como PK, pero la defensa mantiene estable el
    // contrato ante fixtures/importaciones: gana el hecho más reciente y, si
    // empatan, una firma pública determinista, nunca el orden del feed.
    const signature = JSON.stringify([task.status,task.title,task.report,task.started_at,task.ended_at]);
    const previousSignature = previous ? JSON.stringify([previous.status,previous.title,previous.report,previous.started_at,previous.ended_at]) : "";
    if (!previous || stamp > previousStamp || (stamp === previousStamp && signature.localeCompare(previousSignature) > 0)) {
      taskRepresentatives.set(key, task);
    }
  }
  const stableTasks = [...taskRepresentatives.values()].sort((a, b) =>
    String(a.mission_id || "").localeCompare(String(b.mission_id || "")) ||
    String(a.code || "").localeCompare(String(b.code || "")));
  for (const task of stableTasks) {
    const id = String(task.mission_id || "");
    if (!ids.includes(id)) continue;
    const status = String(task.status || "pending"), startedAt = highscoreActiveWorkMillis(task.started_at);
    const finishedAt = highscoreActiveWorkMillis(task.ended_at);
    const ongoing = activeTask.has(status.toLowerCase()) && !finishedAt;
    const effectiveEnd = finishedAt || (ongoing ? range.end - 1 : 0);
    const duration = startedAt && effectiveEnd >= startedAt ? effectiveEnd - startedAt : null;
    const item = { code:String(task.code || ""), title:String(task.title || ""), status,
      summary:highscorePublicTaskSummary(task.report),
      started_at:startedAt || null, finished_at:finishedAt || null,
      duration_ms:duration, ongoing };
    if (!tasksByMission.has(id)) tasksByMission.set(id, []);
    tasksByMission.get(id).push(item);
  }

  const activeMission = new Set(["open", "in_progress", "doing", "active"]), byId = new Map();
  for (const row of missions) {
    const id = String(row.id || "");
    if (!id) continue;
    const status = String(row.status || "open"), startedAt = highscoreActiveWorkMillis(row.work_started_at || row.scored_at);
    const finishedAt = highscoreActiveWorkMillis(row.finished_at);
    const ongoing = activeMission.has(status.toLowerCase()) && !finishedAt;
    const effectiveEnd = finishedAt || (ongoing ? range.end - 1 : 0);
    const duration = startedAt && effectiveEnd >= startedAt ? effectiveEnd - startedAt : null;
    const machine = String(row.loc || "").trim(), projectId = String(row.project_id || row.project || "").trim();
    const item = { id, display_ref:row.display_ref || null,
      subject:String(row.subject || ""), title:String(row.subject || ""), agent:canonicalAgent,
      machine, machines:machine ? [machine] : [], status, project_id:projectId,
      project_name:projects.get(projectId) || String(row.project || projectId || ""),
      at:highscoreActiveWorkMillis(row.scored_at) || null,
      started_at:startedAt || null, finished_at:finishedAt || null,
      duration_ms:duration, ongoing, points:HIGHSCORE_WEIGHTS.mission,
      tasks:tasksByMission.get(id) || [], task_count:(tasksByMission.get(id) || []).length,
      report_url:"/ticket?id=" + encodeURIComponent(id) };
    const previous = byId.get(id);
    if (!previous) byId.set(id, item);
    else {
      const machines = [...new Set(previous.machines.concat(item.machines))].sort((a, b) => a.localeCompare(b));
      const signature = JSON.stringify([item.at,item.status,item.subject,item.project_id,item.project_name,item.machine]);
      const previousSignature = JSON.stringify([previous.at,previous.status,previous.subject,previous.project_id,previous.project_name,previous.machine]);
      const winner = Number(item.at || 0) > Number(previous.at || 0) ||
        (Number(item.at || 0) === Number(previous.at || 0) && signature.localeCompare(previousSignature) > 0) ? item : previous;
      winner.machines = machines;
      if (!winner.machine && machines.length) winner.machine = machines[0];
      if (!winner.tasks.length && (winner === item ? previous.tasks : item.tasks).length) {
        winner.tasks = winner === item ? previous.tasks : item.tasks;
        winner.task_count = winner.tasks.length;
      }
      byId.set(id, winner);
    }
  }
  const list = [...byId.values()].sort((a, b) => Number(b.at || b.started_at || 0) - Number(a.at || a.started_at || 0) || a.id.localeCompare(b.id));
  return { ok:true, scope:"agent-missions", agent:canonicalAgent, period:range.period,
    timezone:"Europe/Madrid", generated_at:range.end - 1,
    range:{ start_at:range.start, end_at:range.end - 1, start_day:range.start_day, end_day:range.end_day,
      from:range.start_day, to:range.end_day },
    total:list.length, missions:list };
}
__name(highscoreAgentMissions, "highscoreAgentMissions");

async function highscoreHistory(env, requestedAgent, ahora = Date.now()) {
  const parsed = parseAgentIdentity(requestedAgent), suffix = parsed.suffix;
  if (parsed.role !== "main" || !suffix || !String(parsed.persona || "").trim()) {
    return { ok:false, error:"agent debe ser una identidad principal con apellido de equipo" };
  }
  const wanted = highscoreCanonicalHistoryFamily(requestedAgent, "");
  if (!wanted || !wanted.family_key || wanted.family_key.startsWith("external:")) {
    return { ok:false, error:"agent no pertenece a una familia canónica" };
  }
  const { periods, allDays } = await highscoreDailyRows(env, (agent, machine) => {
    const family = highscoreCanonicalHistoryFamily(agent, machine);
    return !!family && family.family_key === wanted.family_key;
  }, ahora);
  // El desglose por agente sólo tiene sentido en el global. Aquí sería una sola
  // entrada repitiendo el nombre que ya está en la raíz, así que no se publica:
  // un campo que no aporta y que hay que mantener es deuda.
  const payload = highscoreHistoryPayload(periods, allDays, { agent:wanted.family_name });
  allDays.forEach((fila) => { delete fila.por_agente; });
  payload.evolution.days.forEach((fila) => { delete fila.por_agente; });
  return payload;
}
__name(highscoreHistory, "highscoreHistory");

var HIGHSCORE_ACTIVE_WORK_MS = 20 * 60 * 1000;
var HIGHSCORE_LANE_WORK_MS = 60 * 60 * 1000;
var HIGHSCORE_RECENT_WORK_MS = 24 * 60 * 60 * 1000;
var HIGHSCORE_PROCESS_FRESH_MS = 30 * 1000;
var HIGHSCORE_CLOCK_SKEW_MS = 5 * 1000;

function highscoreActiveWorkMillis(value) {
  let at = Number(value) || 0;
  if (at > 0 && at < 4_102_444_800) at *= 1000;
  return Number.isFinite(at) ? at : 0;
}
__name(highscoreActiveWorkMillis, "highscoreActiveWorkMillis");

function highscoreActiveWorkFamily(raw, machine) {
  const parsed = parseAgentIdentity(raw);
  return parsed.suffix === "Mini"
    ? reportAgentFamily(baseAgentIdentity(raw), "MacMini")
    : reportAgentFamily(raw, machine);
}
__name(highscoreActiveWorkFamily, "highscoreActiveWorkFamily");

function highscoreElapsedTiming(item, kind, ahora) {
  const start = highscoreActiveWorkMillis(item && (item.work_started_at || item.started_at ||
    (kind === "objective" ? item.created_at : 0)));
  const progress = highscoreActiveWorkMillis(item && (item.work_progress_at || item.updated_at));
  const ended = highscoreActiveWorkMillis(item && (item.ended_at || item.resolved_at));
  const end = ended || ahora;
  if (!start || start > end || start > ahora + HIGHSCORE_CLOCK_SKEW_MS ||
      end > ahora + HIGHSCORE_CLOCK_SKEW_MS || progress > ahora + HIGHSCORE_CLOCK_SKEW_MS) return null;
  return { work_started_at:start, work_progress_at:progress || 0, ended_at:ended || null,
    elapsed_ms:end - start,
    timing_basis:ended ? "start_to_end" : "start_to_generated_at" };
}
__name(highscoreElapsedTiming, "highscoreElapsedTiming");

function highscoreAssignmentTiming(item, kind, ahora) {
  const candidates = kind === "objective"
    ? [[item && item.created_at, "objective_created"]]
    : [[item && item.assignment_event_at, "assignment_event"],
      [item && item.started_at, kind === "task" ? "task_started" : "mission_started"],
      [item && item.assignment_born_at, "born_assigned"]];
  for (const [raw, basis] of candidates) {
    const at = highscoreActiveWorkMillis(raw);
    if (at > 0 && at <= ahora + HIGHSCORE_CLOCK_SKEW_MS) return { assignment_at:at, assignment_basis:basis };
  }
  return null;
}
__name(highscoreAssignmentTiming, "highscoreAssignmentTiming");

async function highscoreVerifiedPresence(env, ahora) {
  if (!env.TELEGRAM) return { available:false, by_family:new Map(), sessions:new Map(), observations:[] };
  try {
    const [response, sessionResponse] = await Promise.all([
      env.TELEGRAM.fetch(new Request(PRESENCE_URL, { headers:{ accept:"application/json" } })),
      env.TELEGRAM.fetch(new Request("https://telegram/api/presence/work-sessions", { headers:{ accept:"application/json" } }))
    ]);
    if (!response.ok) return { available:false, by_family:new Map(), sessions:new Map(), observations:[] };
    const payload = await response.json(), rows = Array.isArray(payload) ? payload : (payload.presence || payload.rows || []);
    const byFamily = new Map(), observedSurfaces = new Map();
    for (const row of rows) {
      const at = highscoreActiveWorkMillis(row && row.updated);
      const pid = Number(row && row.pid);
      if (!row || row.verified !== 1 || row.source !== "process_snapshot" || row.online === 0 || row.online === false ||
          ["closed","unknown"].includes(String(row.process_state || "").toLowerCase()) ||
          !Number.isSafeInteger(pid) || pid <= 1 || !["app", "cli"].includes(String(row.host || "").toLowerCase()) ||
          at < ahora - HIGHSCORE_PROCESS_FRESH_MS || at > ahora + HIGHSCORE_CLOCK_SKEW_MS) continue;
      const family = highscoreActiveWorkFamily(row.persona, row.machine);
      const physicalFamily = highscoreActiveWorkFamily(baseAgentIdentity(row.persona), row.machine);
      if (!family || !physicalFamily || family.family_key !== physicalFamily.family_key ||
          family.family_key.startsWith("external:") || !parseAgentIdentity(family.family_name).suffix) continue;
      if (!byFamily.has(family.family_key) || at > byFamily.get(family.family_key)) byFamily.set(family.family_key, at);
      // Reachability is an observation, never evidence of a running task.
      // Keep only public identity metadata; no PID, focus, prompt or work text.
      const host = String(row.host).toLowerCase(), runtime = String(row.runtime || "").trim().slice(0,80);
      const key = `${family.family_key}|${host}|${runtime.toLowerCase()}`;
      if (!observedSurfaces.has(key) || observedSurfaces.get(key).observed_at < at) observedSurfaces.set(key, {
        agent:family.family_name, family_key:family.family_key,
        machine:canonicalMachineSuffix(parseAgentIdentity(family.family_name).suffix), host, runtime,
        process_state:"open", activity_state:"unverified", reason:"no_linked_work", observed_at:at
      });
    }
    const sessions = new Map();
    if (sessionResponse.ok) {
      const sessionPayload = await sessionResponse.json();
      for (const row of Array.isArray(sessionPayload.sessions) ? sessionPayload.sessions : []) {
        const family = highscoreActiveWorkFamily(row && row.persona, row && row.machine);
        const ref = String(row && row.work_ref || "");
        const started = highscoreActiveWorkMillis(row && row.started_at);
        const ended = highscoreActiveWorkMillis(row && row.ended_at);
        const state = ["open", "closed", "unknown"].includes(String(row && row.state)) ? String(row.state) : "unknown";
        if (!family || !ref || !started || started > ahora + HIGHSCORE_CLOCK_SKEW_MS ||
            ended > ahora + HIGHSCORE_CLOCK_SKEW_MS || ended && ended < started) continue;
        const key = `${family.family_key}|${ref}`, list = sessions.get(key) || [];
        list.push({ started_at:started, ended_at:ended || null, state,
          basis:String(row.basis || "process_birth").slice(0,40),
          surface:["app","cli"].includes(String(row.surface)) ? String(row.surface) : "" });
        sessions.set(key, list);
      }
    }
    return { available:true, by_family:byFamily, sessions, observations:[...observedSurfaces.values()] };
  } catch {
    return { available:false, by_family:new Map(), sessions:new Map(), observations:[] };
  }
}
__name(highscoreVerifiedPresence, "highscoreVerifiedPresence");

function highscoreLinkedSession(rows) {
  const sessions = Array.isArray(rows) ? rows : [];
  if (sessions.length === 1) return sessions[0];
  const open = sessions.filter((row) => row && row.state === "open");
  const unknown = sessions.filter((row) => row && row.state === "unknown");
  // Un rollover factual deja historia cerrada detrás de una única encarnación
  // viva. Esa historia no vuelve ambiguo el reloj actual. Dos vivas, o una viva
  // más otra silenciosa, sí son concurrencia no demostrable y fallan cerrado.
  if (open.length === 1 && unknown.length === 0) return open[0];
  return null;
}
__name(highscoreLinkedSession, "highscoreLinkedSession");

// Dos relojes, dos hechos distintos. El intervalo de trabajo mide la misión;
// sólo una encarnación exacta vinculada por work_ref mide cuánto lleva operando
// la sesión del agente. Cero, varias o una sesión unknown fallan cerrado: copiar
// elapsed_ms en el extremo derecho produjo dos relojes idénticos y afirmaba una
// telemetría de proceso que el servidor realmente no tenía.
function highscoreDedicatedTiming(linked, timing, ahora) {
  if (!timing || !Number.isFinite(Number(timing.elapsed_ms))) return null;
  const workEnd = Number(timing.ended_at) || Number(ahora) || 0;
  if (linked) {
    const start = Number(linked.started_at) || 0;
    let end = linked.state === "closed" ? Number(linked.ended_at) || 0
      : linked.state === "open" ? Number(ahora) || 0 : 0;
    let basis = String(linked.basis || "exact_session").slice(0, 40);
    if (Number(timing.ended_at) > 0 && linked.state === "open") {
      end = workEnd;
      basis = "exact_session_capped_at_work_end";
    } else if (Number(timing.ended_at) > 0 && end > workEnd) {
      end = workEnd;
      basis = "exact_session_capped_at_work_end";
    }
    if (start > 0 && end >= start) return { session_dedicated_ms:end - start,
      session_state:Number(timing.ended_at) > 0 ? "closed" : linked.state,
      dedicated_basis:basis, session_surface:linked.surface || "" };
  }
  return null;
}
__name(highscoreDedicatedTiming, "highscoreDedicatedTiming");

// Estado único para tabla y carrera. Un assignment canónico siempre conserva su
// calle; sólo es `running` si el progreso MATERIAL es de hace <=20 minutos.
// Presence únicamente añade reachability y nunca cambia el estado del trabajo.
async function highscoreActiveWork(env, ahora = Date.now()) {
  const [missions, tasks, decisions, objectives, presence, pidx] = await Promise.all([
    env.DB.prepare(`SELECT id,subject,assignee,loc,status,project,project_id,created_at,started_at,resolved_at,EXISTS(SELECT 1 FROM fleet_hourly_work hw WHERE hw.mission_id=t.id) automatic_work,` +
      `${HIGHSCORE_ASSIGNMENT_EVENT_SQL} assignment_event_at,` +
      `CASE WHEN source IN ('decision-batch','cli-declare') AND COALESCE(TRIM(assignee),'')<>'' AND COALESCE(TRIM(loc),'')<>'' THEN created_at END assignment_born_at,` +
      `${HIGHSCORE_WORK_STARTED_SQL} work_started_at,` +
      `${HIGHSCORE_MISSION_PROGRESS_SQL} work_progress_at,` +
      `${HIGHSCORE_RACE_PROGRESS_SQL} race_progress_at FROM tickets t ` +
      `WHERE ${MISSION_SCOPE_SQL_T} AND status='in_progress' AND NOT EXISTS(SELECT 1 FROM fleet_hourly_work hw JOIN fleet_agent_mode_runs hr ON hr.id=hw.run_id WHERE hw.mission_id=t.id AND hr.status='paused')`).all().then((r) => r.results || []),
    env.DB.prepare(`SELECT m.mission_id,m.code,m.title,m.status,m.owner,m.executor,m.started_at,m.created_at,m.updated_at,EXISTS(SELECT 1 FROM fleet_hourly_work hw WHERE hw.mission_id=t.id) automatic_work,` +
      `m.started_at work_started_at,m.started_at work_progress_at,m.started_at race_progress_at,NULL assignment_event_at,` +
      `CASE WHEN COALESCE(TRIM(m.executor),'')<>'' THEN m.created_at END assignment_born_at,t.assignee,t.loc,t.project,t.project_id,t.resolved_at ` +
      `FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id WHERE ${MISSION_SCOPE_SQL_T} ` +
      `AND m.status IN ('in_progress','doing','active') ` +
      `AND t.status='in_progress' AND NOT EXISTS(SELECT 1 FROM fleet_hourly_work hw JOIN fleet_agent_mode_runs hr ON hr.id=hw.run_id WHERE hw.mission_id=t.id AND hr.status='paused') ` +
      `AND COALESCE(t.status,'')!='cancelled'`).all().then((r) => r.results || []),
    // Una ventana pendiente es trabajo real: el agente ya la ha abierto y está
    // esperando la decisión de Carlos. Hasta ahora puntuaba en /highscore/daily
    // (+8), pero no entraba en este censo y por eso el corredor enseñaba un
    // trabajo viejo mientras el agente estaba esperando. Se representa como
    // tarea viva desde created_at hasta deadline; al decidir o vencer desaparece
    // y la misión materializada ocupa su lugar sin duplicar puntos.
    env.DB.prepare(`SELECT id,question title,agent,machine,status,parent_decision,mission,project project_id,created_at,deadline,` +
      `created_at started_at,created_at work_started_at,created_at work_progress_at,` +
      `created_at race_progress_at,created_at assignment_born_at,NULL assignment_event_at ` +
      `FROM decisions WHERE status='pending' AND deadline>? AND COALESCE(parent_decision,'')!='FORMACION'`).bind(ahora).all().then((r) => r.results || []),
    env.DB.prepare("SELECT id,title,status,author,author_identity,project,updated_at,created_at FROM ideas WHERE status='estudio'").all()
      .then((r) => r.results || []),
    highscoreVerifiedPresence(env, ahora),
    projectIndex(env)
  ]);
  const byFamily = new Map(), priority = { objective:1, mission:2, task:3 };
  const visibleTitle = (raw, fallback) => {
    let value = String(raw || "").trim()
      .replace(/^\s*\[[^\]]+\]\s*/, "").replace(/^\s*[#>*-]+\s*/, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[`*_~]+/g, "");
    value = value.split(/\r?\n|\s+(?:→|⇒|\|)\s+/).map((part) => part.trim()).filter(Boolean)[0] || value;
    const phrase = value.match(/^.*?[.!?](?=\s+[A-ZÁÉÍÓÚÑ])/);
    return String(phrase ? phrase[0] : value || fallback).trim().slice(0, 200);
  };
  const add = (raw, machine, kind, item, title, familyRaw = raw, forcedState = "", workRef = "") => {
    const family = highscoreActiveWorkFamily(familyRaw, machine);
    if (!family || family.family_key.startsWith("external:") || !parseAgentIdentity(family.family_name).suffix) return;
    const executor = reportAgentIdentity(raw, machine);
    // La carrera y su reloj comparten una única marca material. Nunca se usa
    // updated_at/live_at del ticket, que también cambian por presencia/captura.
    const timing = highscoreElapsedTiming(item, kind, ahora);
    const assignment = highscoreAssignmentTiming(item, kind, ahora);
    const at = highscoreActiveWorkMillis(item.work_progress_at || (kind === "objective" ? item.updated_at : 0));
    const cutoff = ahora - HIGHSCORE_ACTIVE_WORK_MS;
    const recent = at > 0 && at >= cutoff && at <= ahora + HIGHSCORE_CLOCK_SKEW_MS;
    const state = forcedState || (recent && !["open","pending","assigned","unconcluded"].includes(item.status) ? "running" : "assigned_stale");
    const presenceAt = presence.by_family.get(family.family_key) || 0;
    const laneRecent = at > 0 && at >= ahora - HIGHSCORE_LANE_WORK_MS && at <= ahora + HIGHSCORE_CLOCK_SKEW_MS;
    const linkedSessions = presence.sessions && presence.sessions.get(`${family.family_key}|${workRef}`) || [];
    // Una sesión sólo acredita ESTE trabajo si conserva la referencia exacta.
    // La presencia genérica de la familia sirve para reachability, pero no puede
    // resucitar una asignación vieja: eso hizo correr a NeoMBP14 con una DCL del
    // día anterior mientras sus misiones puntuadas de hoy quedaban ocultas.
    const linked = highscoreLinkedSession(linkedSessions);
    const linkedOpen = !!(linked && linked.state === "open");
    // Una asignación abierta no ocupa indefinidamente la carrera. Para entrar
    // necesita un hecho material de la última hora o el proceso exacto verificado;
    // este último acredita la calle, pero nunca el movimiento (20 min).
    if (!forcedState && !laneRecent && !linkedOpen) return;
    const raceProgressAt = highscoreActiveWorkMillis(item.race_progress_at ||
      (kind === "objective" ? item.created_at : 0));
    const raceRevision = "r1:" + hash([family.family_key, kind, workRef,
      assignment && assignment.assignment_at || 0, raceProgressAt || 0].join("|")).toString(36);
    // Un último trabajo necesita comienzo y fin factuales. En particular,
    // mission_tasks.updated_at no puede hacer de fin: un informe tardío lo
    // movería y descongelaría la duración. Mientras una tarea no tenga ended_at
    // canónico se omite del fallback histórico en vez de inventarlo.
    if (forcedState === "last_work" && (!timing || !Number(timing.ended_at))) return;
    const candidate = { family_key:family.family_key, agent:family.family_name, executor, kind,
      machine:canonicalMachineSuffix(parseAgentIdentity(family.family_name).suffix || machineSuffix(machine)) || machine || "",
      reference:String(workRef || "").slice(0,120),
      title:visibleTitle(title, kind === "task" ? "Tarea activa" : kind === "mission" ? "Misión activa" : "Objetivo en curso"),
      state, active_at:at, work_progress_at:at, reachable:!!presenceAt,
      race_revision:raceRevision };
    const scopedProject = resolveProject(pidx, item.project_id || item.project || "");
    if (scopedProject.id) {
      candidate.project_id = scopedProject.id;
      candidate.project_name = scopedProject.name;
      const explicitDetailUrl = String(item && item.detail_url || "").trim();
      candidate.detail_url = explicitDetailUrl.startsWith("/") ? explicitDetailUrl.slice(0, 300)
        : "/highscoreDetail?agent=" + encodeURIComponent(family.family_name) +
          "&project_id=" + encodeURIComponent(scopedProject.id) + "&period=today&type=all";
    }
    // Exactamente una encarnación vinculada: cero o varias son ambiguas y por
    // contrato no se suman ni se elige una de forma heurística.
    if (timing) Object.assign(candidate, timing);
    const dedicated = highscoreDedicatedTiming(linked, timing, ahora);
    if (dedicated) Object.assign(candidate, dedicated);
    if (assignment) Object.assign(candidate, assignment);
    if (presenceAt) candidate.presence_at = presenceAt;
    if (linked && ["app","cli"].includes(linked.surface)) candidate.host=linked.surface;
    candidate.assignment_priority=item.automatic_work || item.parent_decision || item.mission==='Training horario' ? 0 : 1;
    const previous = byFamily.get(family.family_key);
    if (forcedState === "last_work") {
      // Un trabajo cerrado sólo rellena una calle libre. Nunca sustituye una
      // misión/tarea abierta de la misma familia, aunque su resolved_at sea más
      // nuevo que el progreso material del trabajo que sigue en curso.
      if (previous && previous.state !== "last_work") return;
      const candidateEnd = highscoreActiveWorkMillis(candidate.ended_at);
      const previousEnd = highscoreActiveWorkMillis(previous && previous.ended_at);
      if (!previous || candidateEnd > previousEnd) byFamily.set(family.family_key, candidate);
      return;
    }
    const stateRank = state === "running" ? 2 : state === "assigned_stale" ? 1 : 0;
    const previousRank = previous && (previous.state === "running" ? 2 : previous.state === "assigned_stale" ? 1 : 0);
    if (previous && previous.assignment_priority > candidate.assignment_priority) return;
    if (!previous || candidate.assignment_priority > previous.assignment_priority || stateRank > previousRank ||
        (stateRank === previousRank && priority[kind] > priority[previous.kind]) ||
        (stateRank === previousRank && priority[kind] === priority[previous.kind] && at > previous.active_at))
      byFamily.set(family.family_key, candidate);
  };
  for (const mission of missions) add(mission.assignee, mission.loc, "mission", mission, mission.subject || "Misión activa",
    mission.assignee, "", String(mission.id || ""));
  for (const task of tasks) {
    const executor = scopedMissionOwner(task.executor || task.owner, "sub", task.assignee, task.loc);
    add(executor, parseAgentIdentity(executor).suffix ? "" : task.loc, "task", task, task.title || task.code || "Tarea activa", executor, "",
      `${String(task.mission_id || "")}:${String(task.code || "")}`);
  }
  for (const decision of decisions) {
    decision.detail_url = "/decisiones?project_id=" + encodeURIComponent(String(decision.project_id || ""));
    add(decision.agent, decision.machine, "task", decision,
      decision.title || "Esperando una decisión", decision.agent, "running", String(decision.id || ""));
  }
  for (const objective of objectives) {
    const executor = String(objective.author_identity || highscoreAgent(objective.author) || "").trim();
    add(executor, "", "objective", objective, objective.title || "Objetivo en curso", executor, "",
      `objective:${String(objective.id || "")}`);
  }
  let participants = [...byFamily.values()].sort((a, b) =>
    (a.state === "running" ? 0 : 1) - (b.state === "running" ? 0 : 1) ||
    b.active_at - a.active_at || a.agent.localeCompare(b.agent, "es"));
  const runningCount = participants.filter((row) => row.state === "running").length;
  // El veto por asignación no añade corredores: las calles siguen requiriendo
  // evidencia material o una sesión exacta; historia rellena hasta tres.
  if (!runningCount || participants.length < 3) {
    const [recentMissions, recentTasks] = await Promise.all([
      env.DB.prepare(
        `SELECT id,subject,assignee,loc,project,project_id,'mission' kind,resolved_at ended_at,started_at,created_at,` +
          `${HIGHSCORE_ASSIGNMENT_EVENT_SQL} assignment_event_at,` +
          `CASE WHEN source IN ('decision-batch','cli-declare') AND COALESCE(TRIM(assignee),'')<>'' AND COALESCE(TRIM(loc),'')<>'' THEN created_at END assignment_born_at,` +
          `${HIGHSCORE_WORK_STARTED_SQL} work_started_at,${HIGHSCORE_MISSION_PROGRESS_SQL} work_progress_at ` +
          `FROM tickets t WHERE ${MISSION_SCOPE_SQL_T} AND status='resolved' AND resolved_at IS NOT NULL ` +
          `AND resolved_at>=? AND resolved_at<=? ORDER BY resolved_at DESC`
      ).bind(ahora - HIGHSCORE_RECENT_WORK_MS, ahora + HIGHSCORE_CLOCK_SKEW_MS).all().then((r) => r.results || []),
      env.DB.prepare(
        `SELECT m.mission_id,m.code,m.title,m.owner,m.executor,m.started_at,m.created_at,m.ended_at,` +
          `m.started_at work_started_at,m.started_at work_progress_at,NULL assignment_event_at,` +
          `t.assignee,t.loc,t.project,t.project_id,'task' kind FROM mission_tasks m ` +
          `JOIN tickets t ON t.id=m.mission_id WHERE ${MISSION_SCOPE_SQL_T} AND m.status='done' ` +
          `AND t.status!='cancelled' AND m.code!='z1' AND m.ended_at IS NOT NULL AND m.ended_at>=? AND m.ended_at<=? ` +
          `ORDER BY m.ended_at DESC,length(m.code),m.code`
      ).bind(ahora - HIGHSCORE_RECENT_WORK_MS, ahora + HIGHSCORE_CLOCK_SKEW_MS).all().then((r) => r.results || [])
    ]);
    if (!runningCount) byFamily.clear();
    // Se recorren todos los cierres factuales de las últimas 24 h y se deduplican
    // después por familia. Misiones y tareas comparten la misma comparación por
    // ended_at; un retoque posterior en report/updated_at no mueve el carril.
    // Un LIMIT previo por filas dejaba fuera a Neo/Trinity cuando otra persona
    // había cerrado muchas tareas más recientes.
    for (const row of recentMissions.concat(recentTasks).sort((a,b) =>
      highscoreActiveWorkMillis(b.ended_at) - highscoreActiveWorkMillis(a.ended_at))) {
      if (row.kind === "task") {
        const executor = scopedMissionOwner(row.executor || row.owner, "sub", row.assignee, row.loc);
        add(executor, row.loc, row.kind, row, row.title || row.code || "Última tarea", row.assignee, "last_work",
          `${String(row.mission_id || "")}:${String(row.code || "")}`);
      } else {
        add(row.assignee, row.loc, row.kind, row, row.subject || "Último trabajo", row.assignee, "last_work",
          String(row.id || ""));
      }
    }
    participants = [...byFamily.values()].sort((a,b) =>
      (a.state === "running" ? 0 : a.state === "assigned_stale" ? 1 : 2) -
        (b.state === "running" ? 0 : b.state === "assigned_stale" ? 1 : 2) ||
      (a.state === "last_work" && b.state === "last_work"
        ? highscoreActiveWorkMillis(b.ended_at) - highscoreActiveWorkMillis(a.ended_at)
        : b.active_at - a.active_at)).slice(0,3);
  }
  // An open application with no current material work stays visible without
  // becoming a competitor. Old finished work cannot hide this observability gap.
  const linkedFamilies = new Set(participants.filter(row => row.state !== "last_work").map(row => row.family_key));
  const observations = (presence.observations || []).filter(row => !linkedFamilies.has(row.family_key))
    .sort((a,b) => a.agent.localeCompare(b.agent) || a.host.localeCompare(b.host) || a.runtime.localeCompare(b.runtime));
  return { ok:true, generated_at:ahora, timezone:"Europe/Madrid", presence_available:presence.available,
    mode:runningCount ? "active" : "recent", running_count:runningCount, count:participants.length, participants, observations };
}
__name(highscoreActiveWork, "highscoreActiveWork");

function highscoreMetricPair(hour, day, field) {
  return { hour:Number(hour && hour[field]) || 0, day:Number(day && day[field]) || 0 };
}
__name(highscoreMetricPair, "highscoreMetricPair");

async function highscoreHourlyContract(env, legacy, ahora, dayStart, dayEnd) {
  // Los offsets de Europe/Madrid son horas enteras: el inicio UTC de la hora
  // absoluta coincide con el :00 local, también en el salto de verano/invierno.
  const hourStart = Math.floor(ahora / HIGHSCORE_TREND_MS) * HIGHSCORE_TREND_MS;
  const hourEnd = hourStart + HIGHSCORE_TREND_MS;
  const [hourTotals, dayTotals] = await Promise.all([
    highscorePeriodMetrics(env, hourStart, hourEnd),
    highscorePeriodMetrics(env, dayStart, dayEnd)
  ]);
  // Por la MISMA clave canónica que las otras dos fuentes: si aquí se indexara por
  // `agent_key` (que es el nombre visible), la unión de abajo volvería a meter la
  // fila fantasma del apellido retirado aunque las otras dos ya la hubieran fundido.
  const old = new Map((legacy && legacy.scores || []).map((row) =>
    [highscoreGroupKey(row.agent, row.machine), row]));
  const keys = new Set([...old.keys(), ...hourTotals.keys(), ...dayTotals.keys()]);
  const scores = [...keys].filter(Boolean).sort().map((key) => {
    const hour = hourTotals.get(key), day = dayTotals.get(key), previous = old.get(key) || {};
    const agent = previous.agent || day && day.agent || hour && hour.agent || "";
    const machine = previous.machine || day && day.machine || hour && hour.machine || "";
    const dayPoints = Number(day && day.points) || 0;
    return { ...previous, agent_key:key, agent, machine,
      current:previous.current == null ? dayPoints : previous.current,
      reference:previous.reference == null ? dayPoints : previous.reference,
      reference_at:previous.reference_at == null ? null : previous.reference_at,
      trend:previous.trend || "same", reliable:previous.reliable === true,
      metrics:{
        objectives:highscoreMetricPair(hour, day, "objectives"),
        windows:highscoreMetricPair(hour, day, "windows"),
        missions:highscoreMetricPair(hour, day, "missions"),
        tasks:highscoreMetricPair(hour, day, "tasks"),
        points:highscoreMetricPair(hour, day, "points")
      }
    };
  });
  return { ...legacy,
    period:{ timezone:"Europe/Madrid", hour_key:madridHourKey(ahora), hour_start:hourStart, hour_end:hourEnd,
      day_key:madridDayKey(ahora), day_start:dayStart, day_end:dayEnd },
    scores
  };
}
__name(highscoreHourlyContract, "highscoreHourlyContract");

// Total factual que ve el marcador, incluidas las tres familias A/B/C de cada
// misión. Se calcula en el servidor antes de tomar la muestra: ningún navegador
// puede inventar puntos ni una tendencia para el resto de usuarios.
async function highscoreCurrentTotals(env, scores, inicio, fin) {
  const totals = new Map();
  const keyOf = highscoreVisibleKey;
  // SE AGRUPA POR IDENTIDAD CANÓNICA, NO POR EL LITERAL DEL NOMBRE (2026-09-01).
  // highscoreDaily ya agrupa bien —con groupingIdentityKey, que canonicaliza el
  // apellido: `Mini` y `MacMini` son la MISMA máquina y la normativa 02 zanjó que
  // se escribe MacMini—. Pero aquí se volvía a agrupar por el nombre visible en
  // crudo, así que el mismo agente reaparecía partido en dos filas y el marcador
  // repartía sus puntos entre ambas.
  // Medido el 1-sep en /highscore/daily: MorfeoMacMini 1172 + MorfeoMini 528 (su
  // total real era 1748), LinkMacMini 128 + LinkMini 48, OraculoMacMini 430 +
  // OraculoMini 90. Tres agentes con dos filas cada uno, en el MISMO Mac Mini, y
  // el ranking que mira Carlos ordenaba con las mitades.
  // Las muestras usan clave física compuesta; no se reasignan históricos ambiguos.
  const add = (agent, machine, points) => {
    const visible = reportAgentIdentity(agent, machine) || String(agent || "").trim();
    if (!keyOf(visible)) return;
    const key = highscoreGroupKey(visible, machine);
    const nombre = highscoreAgentName(visible);
    if (!totals.has(key)) totals.set(key, { agent_key:key, agent:nombre, machine:canonicalMachineSuffix(parseAgentIdentity(visible).suffix || machineSuffix(machine)) || String(machine || ""), points: 0 });
    const fila = totals.get(key);
    // La identidad fija el equipo; nunca se traslada un total a otra máquina.
    fila.points += Number(points) || 0;
  };
  for (const row of scores || []) add(row.agent, row.machine,
    (Number(row.objective_points) || 0) + (Number(row.window_points) || 0) + (Number(row.mission_points) || 0));

  const taskRows = ((await env.DB.prepare(
    `SELECT m.mission_id,m.code,m.status,m.owner,m.updated_at,t.assignee,t.loc ` +
    `FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id WHERE ${AGENT_SOURCE_SQL_T} ` +
    "AND COALESCE(t.status,'')!='cancelled' " +
    "AND m.updated_at>=? AND m.updated_at<? AND m.status IN ('in_progress','done')"
  ).bind(inicio, fin).all()).results || []);
  const representatives = new Map();
  for (const task of taskRows) {
    const match = String(task.code || "").toLowerCase().match(/^([a-c])(?:[1-3])?$/);
    if (!match) continue;
    const family = String(task.mission_id || "") + "|" + match[1], previous = representatives.get(family);
    if (!previous || Number(task.updated_at) >= Number(previous.updated_at)) representatives.set(family, task);
  }
  for (const task of representatives.values()) {
    const points = HIGHSCORE_TASK_WEIGHTS.task +
      (["doing", "in_progress"].includes(String(task.status || "")) ? HIGHSCORE_TASK_WEIGHTS.active_bonus : 0);
    add(task.assignee, task.loc, points);
  }
  return [...totals.values()].sort((a, b) => a.agent_key.localeCompare(b.agent_key));
}
__name(highscoreCurrentTotals, "highscoreCurrentTotals");

async function highscoreHourlyTrend(env, current, ahora) {
  const cutoff = ahora - HIGHSCORE_TREND_MS, oldest = cutoff - HIGHSCORE_TREND_TOLERANCE_MS;
  const rows = ((await env.DB.prepare(
    "SELECT h.agent_key,h.points,h.sampled_at FROM highscore_snapshots h JOIN (" +
    "SELECT agent_key,MAX(sampled_at) sampled_at FROM highscore_snapshots WHERE sampled_at>=? AND sampled_at<=? GROUP BY agent_key" +
    ") r ON r.agent_key=h.agent_key AND r.sampled_at=h.sampled_at"
  ).bind(oldest, cutoff).all()).results || []);
  const references = new Map(rows.map((row) => [String(row.agent_key), row]));
  const sampledAt = Math.floor(ahora / 6e4) * 6e4;
  for (const row of current) {
    await env.DB.prepare(
      "INSERT INTO highscore_snapshots(agent_key,agent,machine,sampled_at,points) VALUES(?,?,?,?,?) " +
      "ON CONFLICT(agent_key,sampled_at) DO UPDATE SET agent=excluded.agent,machine=excluded.machine,points=excluded.points"
    ).bind(row.agent_key, row.agent, row.machine || "", sampledAt, row.points).run();
  }
  // El marcador sólo necesita 48 horas; conservar más no mejora una ventana de
  // 60 minutos y haría crecer D1 sin límite.
  await env.DB.prepare("DELETE FROM highscore_snapshots WHERE sampled_at<?").bind(ahora - 48 * 60 * 60 * 1e3).run();
  return {
    window_ms: HIGHSCORE_TREND_MS,
    sampled_at: sampledAt,
    scores: current.map((row) => {
      const reference = references.get(row.agent_key), reliable = !!reference;
      const referencePoints = reliable ? Number(reference.points) || 0 : row.points;
      return { agent: row.agent, machine: row.machine, current: row.points, reference: referencePoints,
        reference_at: reliable ? Number(reference.sampled_at) : null,
        trend: row.points > referencePoints ? "up" : "same", reliable };
    })
  };
}
__name(highscoreHourlyTrend, "highscoreHourlyTrend");

// Puntos que lleva HOY un agente, del mismo calculo que pinta yokup.com/highscore.
// Se lee de la fuente viva y no se cachea: un total de hace una hora convertiria la
// diferencia en ruido. Si el Highscore no responde se devuelve null y quien llame
// declara "no confirmado" — nunca un 0, que se leeria como "no produjo nada".
// El sello de puntos de una mision (points_start / points_end). Dos fallos vividos
// aqui, los dos silenciosos, que dejaron 120 de 120 misiones con NULL y la sabana
// de /informes diciendo "0 pts · 0 total" en todas las filas (Carlos, 2026-08-08):
//
//  1. Se llamaba a `agentIdentityKey`, que NO existe en este fichero: el import
//     trae `identityKey`. Cada llamada lanzaba ReferenceError, el catch lo tragaba
//     y devolvia null. Un catch que devuelve null convierte un fallo de programa
//     en un dato ausente, que es como estuvo meses sin que nadie lo viera.
//  2. Sumaba `task_points` y `points` de las filas de `scores`, campos que esas
//     filas NO tienen: aunque la clave hubiera casado, se perdian los puntos de
//     tarea (15 + 10 del bonus). El total bueno es el mismo que publica el
//     Highscore como `hourly.scores[].current` — de ahi sale, y no de una suma
//     paralela que puede divergir.
async function puntosDeAgenteAhora(env, agente, machine = "") {
  const nombre = String(agente || "").trim();
  if (!nombre) return null;
  try {
    const daily = await highscoreDaily(env);
    const totales = ((daily && daily.hourly && daily.hourly.scores) || []);
    const parsed=parseAgentIdentity(nombre);
    if (!parsed.suffix && !machineSuffix(machine)) return null;
    const buscado=highscoreGroupKey(nombre,machine);
    const fila=totales.find(f=>highscoreGroupKey(f.agent,f.machine)===buscado);
    // Un agente que aun no ha puntuado hoy tiene 0 de verdad: es un dato. El null
    // se reserva para "no se pudo saber", y la interfaz ya NO lo pinta como 0.
    return fila ? (Number(fila.current) || 0) : 0;
  } catch (e) {
    // El cierre de una mision no puede caerse porque el Highscore tosa, pero
    // tampoco puede volver a fallar en silencio: queda en el log del worker.
    console.error("puntosDeAgenteAhora(" + nombre + "):", e && e.message ? e.message : e);
    return null;
  }
}
__name(puntosDeAgenteAhora, "puntosDeAgenteAhora");

// El catálogo cerrado y la autenticación del ejecutor viven en
// cli-executor-contract.js para que worker, cliente y pruebas compartan contrato.

// ENVIAR MISION a un CLI (Carlos, 2026-08-08): escribir en su sesion de terminal
// como si estuvieramos delante, para que se ponga a trabajar sin ir a la maquina.
//
// Esto NO afloja la regla de "ningun comando libre": lo que viaja es el ENCARGO
// para un agente que interpreta lenguaje natural, no una linea para una shell. Por
// eso hay tres cercos, y los tres importan:
//   · Solo a `kind` cli/app. A la SESION de terminal (kind session) NO se le manda
//     texto NUNCA: al otro lado hay una shell y cualquier frase seria un comando.
//     Ese era el agujero, y esta cerrado aqui, no en el ejecutor.
//   · El texto se limpia de caracteres de control y se aplana a UNA linea. Un \n
//     dentro del texto es un Intro extra en la terminal: dos ordenes en vez de una.
//   · El ejecutor comprueba ADEMAS, ya en la maquina, que el CLI este vivo y que su
//     panel no sea una shell pelada. Cinturon y tirantes, en las dos puntas.
var CLI_MISION_MAX = 600;
function cliMisionTexto(raw) {
  // \p{C} = todos los caracteres de control y formato, tambien los invisibles que
  // no son ASCII (bidi, zero-width): un texto que se lee de una forma y se ejecuta
  // de otra no entra en una terminal.
  const limpio = String(raw == null ? "" : raw).replace(/[\p{C}]+/gu, " ").replace(/\s+/g, " ").trim();
  if (!limpio) return { ok:false, error:"la misión no puede ir vacía" };
  if (limpio.length > CLI_MISION_MAX) {
    return { ok:false, error:"la misión no puede pasar de " + CLI_MISION_MAX + " caracteres (llegaron " + limpio.length + ")" };
  }
  return { ok:true, value:limpio };
}
__name(cliMisionTexto, "cliMisionTexto");

// Nombre vigente de una fila del marcador. Si no se reconoce la persona se
// devuelve lo que llegó: un agente sin censo debe seguir viéndose, no borrarse.
function canonicalHighscoreAgent(agent, machine) {
  const parsed = parseAgentIdentity(agent);
  const suffix = canonicalMachineSuffix(parsed.suffix || machineSuffix(machine) || "");
  if (!suffix || parsed.legacy && !parsed.suffix) return String(agent || "").trim();
  return scopedAgentIdentity(parsed.persona + suffix, machine, parsed.role);
}
__name(canonicalHighscoreAgent, "canonicalHighscoreAgent");

async function highscoreDaily(env) {
  const ahora = Date.now(), inicio = madridDayStart(ahora), fin = madridDayStart(inicio + 36 * 60 * 60 * 1e3);
  // La comparación usa el MISMO total completo que publica `scores`: objetivos,
  // ventanas, misiones y tareas. El comienzo se calcula como día de Madrid, no
  // restando 24 h, para respetar los cambios de horario.
  const ayerInicio = madridDayStart(inicio - 1);
  const acc = /* @__PURE__ */ new Map();
  const fila = (agent, machine) => {
    const a = String(agent || "").trim();
    if (!a) return null;
    const m = String(machine || "").trim();
    // La MISMA maquina llega escrita de tres formas segun quien escriba: las
    // misiones ponen loc='macmini', las ventanas machine='admira-macmini' y el
    // censo 'MacMini'. Agrupar por el literal partia a un agente en dos filas
    // —MorfeoMacMini salio duplicado, 9 misiones en una y 2 en otra— asi que se
    // agrupa por el APELLIDO canonico, que es lo que ya sabe machineSuffix.
    // Y el AGENTE llegaba escrito de dos formas por la misma razón: la ruta de
    // decisiones persistía `MorfeoMini` y la de misiones `MorfeoMacMini`. La
    // máquina ya se agrupaba por apellido canónico, pero el agente se agrupaba
    // por el literal, así que la mitad del arreglo no servía de nada: Morfeo
    // salía con 528 puntos en una fila y 120 en otra. Se agrupa por identidad
    // canónica —persona + capa + apellido— y se muestra la forma vigente, para
    // que la fila no herede el nombre retirado del primer registro que llegó.
    // La identidad física coincide con los agregados horario e histórico.
    const k = highscoreGroupKey(a, m);
    if (!acc.has(k)) acc.set(k, {
      agent:highscoreAgentName(a), machine:canonicalMachineSuffix(parseAgentIdentity(a).suffix || machineSuffix(m)) || m,
      objectives: 0, objective_points: 0, windows: 0, window_points: 0, missions: 0, mission_points: 0
    });
    const fila_ = acc.get(k);
    // El bucket conserva su equipo canónico aunque la fuente use otro alias.
    return fila_;
  };
  const filas = async (sql) => ((await env.DB.prepare(sql).bind(inicio, fin).all()).results || []);

  // Una firma sin equipo permanece sin equipo; no se presta al más reciente.
  for (const r of await filas(
    "SELECT author, COUNT(*) c FROM ideas WHERE created_at>=? AND created_at<? GROUP BY author"
  )) {
    const f = fila(highscoreAgent(r.author), "");
    if (f) { f.objectives += Number(r.c) || 0; f.objective_points += (Number(r.c) || 0) * HIGHSCORE_WEIGHTS.objective; }
  }
  // VENTANAS: acumulado del día, no simultáneas. Una ventana cuenta cuando se ABRE.
  for (const r of await filas(
    "SELECT agent, machine, COUNT(*) c FROM decisions WHERE created_at>=? AND created_at<? GROUP BY agent, machine"
  )) {
    const f = fila(r.agent, r.machine);
    if (f) { f.windows += Number(r.c) || 0; f.window_points += (Number(r.c) || 0) * HIGHSCORE_WEIGHTS.window; }
  }
  // MISIONES ejecutadas hoy. Una fila por misión, así que los reintentos no
  // duplican. Puntúa el primer hecho persistido de entrada en curso, no
  // `updated_at`: editar o cerrar mañana no vuelve a otorgar los 40 puntos.
  // Cuentan las DOS puertas (ver AGENT_SOURCE_SQL): filtrar solo por 'fleet'
  // dejaba a cero a quien trabaja por ventana de decisión.
  for (const r of await filas(
    `SELECT assignee,loc,COUNT(*) c FROM (SELECT t.assignee,t.loc,t.status,${HIGHSCORE_MISSION_STARTED_SQL} scored_at, ` +
    `EXISTS(SELECT 1 FROM mission_tasks mt3 WHERE mt3.mission_id=t.id) con_plan ` +
    `FROM tickets t WHERE ${AGENT_SOURCE_SQL_T}) ` +
    // 'open' CON PLAN tambien cuenta: NeoMBP16 hizo 11 misiones en un dia,
    // todas con su plan a-b-c, y no aparecia en el marcador porque nadie
    // habia cambiado un estado. El marcador media el tramite, no el trabajo.
    `WHERE (status IN ('in_progress','resolved') OR (status='open' AND con_plan=1)) ` +
    "AND scored_at>=? AND scored_at<? GROUP BY assignee,loc"
  )) {
    const f = fila(r.assignee, r.loc);
    if (f) { f.missions += Number(r.c) || 0; f.mission_points += (Number(r.c) || 0) * HIGHSCORE_WEIGHTS.mission; }
  }
  const [traceability, ayerMetricas] = await Promise.all([
    highscoreTraceability(env, inicio, fin, ahora),
    highscorePeriodMetrics(env, ayerInicio, inicio)
  ]);
  const scores = [...acc.values()];
  const current = await highscoreCurrentTotals(env, scores, inicio, fin);
  const legacyHourly = await highscoreHourlyTrend(env, current, ahora);
  const hourly = await highscoreHourlyContract(env, legacyHourly, ahora, inicio, fin);
  // `scores` era hasta aquí un acumulador legacy de sólo tres fuentes. Una tarea
  // hecha hoy dentro de una misión iniciada ayer sumaba en `hourly.scores`, pero
  // no podía crear la fila principal del agente: el navegador recibía puntos
  // positivos y, a la vez, una lista que omitía a quien los había conseguido.
  // La métrica diaria ya es la fuente autoritativa de las cuatro fuentes; se
  // proyecta al contrato público y se conserva cualquier metadato legacy.
  const legacyByAgent = new Map(scores.map((score) => [highscoreGroupKey(score.agent, score.machine), score]));
  const completeScores = (hourly.scores || []).map((hourlyScore) => {
    const metrics = hourlyScore.metrics || {}, day = (name) => Math.max(0, Number(metrics[name] && metrics[name].day) || 0);
    const points = day("points"), objectives = day("objectives"), windows = day("windows"),
      missions = day("missions"), tasks = day("tasks");
    const previous = legacyByAgent.get(highscoreGroupKey(hourlyScore.agent, hourlyScore.machine)) || {};
    const taskPoints = Math.max(0, points - objectives * HIGHSCORE_WEIGHTS.objective -
      windows * HIGHSCORE_WEIGHTS.window - missions * HIGHSCORE_WEIGHTS.mission);
    const yesterday = ayerMetricas.get(highscoreGroupKey(hourlyScore.agent, hourlyScore.machine));
    const yesterdayPoints = Number(yesterday && yesterday.points) || 0;
    return { ...previous, agent:hourlyScore.agent || previous.agent || "",
      machine:hourlyScore.machine || previous.machine || "", objectives,
      objective_points:objectives * HIGHSCORE_WEIGHTS.objective, windows,
      window_points:windows * HIGHSCORE_WEIGHTS.window, missions,
      mission_points:missions * HIGHSCORE_WEIGHTS.mission, tasks, task_points:taskPoints, points,
      yesterday_points:yesterdayPoints,
      day_comparison:points > yesterdayPoints ? "sube" : points < yesterdayPoints ? "baja" : "igual" };
  }).filter((score) => score.points > 0);
  return { ok: true, day: madridDayKey(ahora), weights: HIGHSCORE_WEIGHTS, scores:completeScores, traceability, hourly };
}
__name(highscoreDaily, "highscoreDaily");

// Cuelga una misión HIJA de una MADRE (FLT-990 b2 → DOS niveles, FLT-990 c). El
// modelo es madre → misión → submisión y NADA más: profundidad máxima 2. Se permite
// colgar bajo una hija SOLO si esa hija no es a su vez nieta (su madre debe ser
// raíz); el 3er nivel se rechaza con mensaje claro. Aditivo y reversible.
async function fleetSetParent(env, b) {
  const child = String(b && b.child || "").trim();
  const parent = b && (b.parent == null || b.parent === "") ? null : String(b.parent || "").trim();
  if (!/^FLT-\d+$/.test(child)) return { ok: false, error: "child debe ser FLT-<n>" };
  const cRow = await env.DB.prepare("SELECT id FROM tickets WHERE id=?").bind(child).first();
  if (!cRow) return { ok: false, error: "child no existe: " + child };
  if (parent === null) {
    await env.DB.prepare("UPDATE tickets SET parent_id=NULL, updated_at=? WHERE id=?").bind(Date.now(), child).run();
    await addEvent(env, child, "log", "flota", "Misión desenganchada de su madre (vuelve a plana).").catch(() => {});
    return { ok: true, child, parent: null };
  }
  if (!/^FLT-\d+$/.test(parent)) return { ok: false, error: "parent debe ser FLT-<n> o null" };
  if (parent === child) return { ok: false, error: "una misión no puede ser su propia madre" };
  const pRow = await env.DB.prepare("SELECT id,parent_id FROM tickets WHERE id=?").bind(parent).first();
  if (!pRow) return { ok: false, error: "parent no existe: " + parent };
  // PROFUNDIDAD MÁXIMA 2. Si el parent ya es hija (tiene madre), se admite —el child
  // sería submisión (nivel 2)— salvo que esa madre cuelgue a su vez de otra: entonces
  // el parent ya es nieto y colgarle algo abriría un 3er nivel. Rechazo explícito.
  if (pRow.parent_id) {
    const gRow = await env.DB.prepare("SELECT parent_id FROM tickets WHERE id=?").bind(pRow.parent_id).first();
    if (gRow && gRow.parent_id) return { ok: false, error: "profundidad máxima 2 (madre → misión → submisión): " + parent + " ya es una submisión, no puede tener las suyas" };
  }
  const hasKids = await env.DB.prepare("SELECT 1 x FROM tickets WHERE parent_id=?").bind(child).first();
  // El child ya es madre: colgarlo empuja a SUS hijas un nivel más abajo. Solo cabe
  // si aterriza como nivel 1 (bajo una madre raíz); bajo una hija crearía el 3er nivel.
  if (hasKids && pRow.parent_id) return { ok: false, error: child + " ya es madre; colgarlo de " + parent + " (que ya es hija) empujaría a sus hijas a un 3er nivel" };
  await env.DB.prepare("UPDATE tickets SET parent_id=?, updated_at=? WHERE id=?").bind(parent, Date.now(), child).run();
  const rotulo = pRow.parent_id ? "misión " + parent + " (como submisión)" : "misión madre " + parent;
  await addEvent(env, child, "log", "flota", "Colgada de la " + rotulo + ".").catch(() => {});
  return { ok: true, child, parent };
}
__name(fleetSetParent, "fleetSetParent");
async function stats(env, scope, filters = {}) {
  // Exactamente el mismo universo (fuente/día/proyecto) que listTickets.
  const universe = ticketUniverseWhere(scope, filters);
  if (!universe.ok) return universe;
  const withStatus = (condition) => universe.sql ? universe.sql + " AND " + condition : "WHERE " + condition;
  const open = (await env.DB.prepare(`SELECT COUNT(*) c FROM tickets t ${withStatus("t.status='open'")}`).bind(...universe.binds).first())?.c || 0;
  const prog = (await env.DB.prepare(`SELECT COUNT(*) c FROM tickets t ${withStatus("t.status='in_progress'")}`).bind(...universe.binds).first())?.c || 0;
  const res = (await env.DB.prepare(`SELECT COUNT(*) c FROM tickets t ${withStatus("t.status='resolved'")}`).bind(...universe.binds).first())?.c || 0;
  // Solo deltas cuerdos: ni negativos ni >1 año (un timestamp corrupto no debe reventar el KPI).
  const mttrRow = await env.DB.prepare(`SELECT AVG(t.resolved_at-t.created_at) m FROM tickets t ${withStatus("t.status='resolved' AND t.resolved_at IS NOT NULL AND t.resolved_at >= t.created_at AND t.resolved_at - t.created_at < 31536000000")}`).bind(...universe.binds).first();
  const mttr = mttrRow && mttrRow.m ? Math.round(mttrRow.m / 6e4) : null;
  return { open, in_progress: prog, resolved: res, mttr };
}
__name(stats, "stats");
// Sólo un diálogo de sistema confirmado hace <=90 s puede afirmar que bloquea
// una máquina AHORA. Hasta 5 min queda «sin confirmar» y después pasa a stale.
// Los demás kinds son backlog informativo aunque estén abiertos. Nada se cierra
// ni se borra automáticamente: esta clasificación sólo hace honesta la lectura.
const SYSTEM_NOTIFICATION_LIVE_MS = 90 * 1000;
const SYSTEM_NOTIFICATION_UNCONFIRMED_MS = 5 * 60 * 1000;
function notificationContract(row, now = Date.now()) {
  const raw = Number(row && row.last_at) || 0;
  const lastAt = raw > 0 && raw < 4102444800 ? raw * 1000 : raw;
  const validLastAt = lastAt > 0 && lastAt <= now;
  const open = row && row.status === "abierta";
  // Sólo el kind explícito `sistema` puede bloquear. Un kind ausente o nuevo
  // falla cerrado como backlog; no se convierte en diálogo por defecto.
  const system = String(row && row.kind || "").trim().toLowerCase() === "sistema";
  const age = validLastAt ? now - lastAt : null;
  let activityState = "closed";
  if (open && !system) activityState = "backlog";
  else if (open && (!validLastAt || age > SYSTEM_NOTIFICATION_UNCONFIRMED_MS)) activityState = "stale";
  else if (open && age > SYSTEM_NOTIFICATION_LIVE_MS) activityState = "unconfirmed";
  else if (open) activityState = "live";
  return Object.assign({}, row, {
    last_at_ms: validLastAt ? lastAt : null,
    age_ms: age,
    activity_state: activityState,
    fresh: activityState === "live",
    stale: activityState === "stale",
    blocks_machine: activityState === "live",
    requiere_atencion: activityState === "live"
  });
}
__name(notificationContract, "notificationContract");
function notificationSummary(rows, now = Date.now()) {
  const summary = { total_open:0, live:0, unconfirmed:0, stale:0, backlog:0, affected_machines:0 };
  const affected = new Set();
  for (const raw of rows || []) {
    const row = notificationContract(raw, now);
    if (raw.status !== "abierta") continue;
    summary.total_open++;
    if (Object.prototype.hasOwnProperty.call(summary, row.activity_state)) summary[row.activity_state]++;
    if (row.blocks_machine && String(raw.machine || "").trim()) affected.add(String(raw.machine).trim().toLowerCase());
  }
  summary.affected_machines = affected.size;
  return summary;
}
__name(notificationSummary, "notificationSummary");
// CONTADORES DEL MENÚ SUPERIOR (Carlos, 2026-07-23): un solo agregado para que
// la barra (yk-frame.js) rotule «MISIONES 2/50» = 2 en curso / 50 esperando.
// Semántica UNIFORME por sección: curso = «en ello ahora» (in_progress/estudio);
// pend = «esperando» (open/pending/nueva). Lo FINALIZADO no se cuenta (no es un
// pendiente ni un en-curso). Cada sección lee de la MISMA fuente que su página:
//   · objetivos   → ideas            curso=estudio        pend=nueva
//   · misiones    → tickets fleet    curso=in_progress    pend=open
//   · tareas      → mission_tasks    curso=in_progress    pend=pending   (scope=todas, como /tareas)
//   · incidencias → tickets !fleet   curso=in_progress    pend=open      (scope=campo, como /incidencias)
//   · informes    → mission_tasks con report, de misiones fleet (como /informes?scope=fleet)
//                                    curso=in_progress    pend=pending
async function menuCounters(env) {
  const zero = () => ({ curso: 0, pend: 0 });
  const out = { objetivos: zero(), misiones: zero(), tareas: zero(), incidencias: zero(), informes: zero() };
  // Tickets: misiones (fleet) e incidencias (campo) de una sola pasada.
  const cutoff = Date.now() - MISSION_UNCONCLUDED_AFTER_MS;
  const tk = (await env.DB.prepare(
    "SELECT CASE WHEN role='mission' OR source IN ('fleet','decision-batch','cli-declare') THEN 'f' ELSE 'c' END sc, t.status, " +
    "CASE WHEN (t.status='in_progress' AND (CASE WHEN COALESCE(t.started_at,t.created_at)<4102444800 THEN COALESCE(t.started_at,t.created_at)*1000 ELSE COALESCE(t.started_at,t.created_at) END)<=?) " +
    "OR EXISTS(SELECT 1 FROM mission_tasks ma WHERE ma.mission_id=t.id AND ma.status IN ('in_progress','done','resolved') " +
    "AND (CASE WHEN COALESCE(ma.started_at,ma.updated_at,ma.created_at)<4102444800 THEN COALESCE(ma.started_at,ma.updated_at,ma.created_at)*1000 ELSE COALESCE(ma.started_at,ma.updated_at,ma.created_at) END)<=?) THEN 'unconcluded' " +
    "WHEN t.status='in_progress' OR EXISTS (SELECT 1 FROM mission_tasks m WHERE m.mission_id=t.id AND m.status IN ('in_progress','done','resolved')) THEN 'in_progress' " +
    "WHEN COALESCE(t.assignee,t.loc,'')<>'' THEN 'pending' ELSE 'unassigned' END visible_state, COUNT(*) n " +
    "FROM tickets t WHERE t.status NOT IN ('resolved','cancelled') GROUP BY sc,t.status,visible_state"
  ).bind(cutoff,cutoff).all()).results || [];
  out.misiones = { curso:0, pend:0, no_concluidas:0, sin_asignar:0,
    universe:"all_backlog", state_semantics:"visible-v1" };
  for (const r of tk) {
    const dst = r.sc === "f" ? out.misiones : out.incidencias;
    if (r.sc === "c") { if (r.status === "in_progress") dst.curso += r.n; else if (r.status === "open") dst.pend += r.n; }
    else if (r.visible_state === "in_progress") dst.curso += r.n;
    else if (r.visible_state === "pending") dst.pend += r.n;
    else if (r.sc === "f" && r.visible_state === "unconcluded") dst.no_concluidas += r.n;
    else if (r.sc === "f" && r.visible_state === "unassigned") dst.sin_asignar += r.n;
  }
  // Cursor de creación independiente del estado actual. Una misión puede nacer,
  // reclamarse y hasta cerrarse entre dos GET: el total vuelve a ser idéntico,
  // pero este evento append-only sigue avanzando y conserva el delta factual.
  const novelty = (await env.DB.prepare(MISSION_NOVELTY_RECENT_SQL).all()).results || [];
  Object.assign(out.misiones, missionNoveltyContract(novelty));
  // Objetivos = ideas.
  const id = (await env.DB.prepare(
    "SELECT status, COUNT(*) n FROM ideas WHERE status IN ('nueva','estudio') GROUP BY status"
  ).all()).results || [];
  for (const r of id) { if (r.status === "estudio") out.objetivos.curso = r.n; else if (r.status === "nueva") out.objetivos.pend = r.n; }
  // Tareas: sólo son accionables si su misión padre sigue open/in_progress.
  // Las hijas no terminales bajo un padre terminal, desconocido o ausente son
  // deuda archivada: se conservan sin mutar su status, pero no inflan Pendientes.
  const ta = (await env.DB.prepare(
    "SELECT CASE " +
    "WHEN m.status IN ('done','resolved','completed') THEN 'done' " +
    "WHEN m.status='cancelled' THEN 'cancelled' " +
    "WHEN t.id IS NULL THEN 'orphaned' " +
    "WHEN COALESCE(t.status,'') NOT IN ('open','in_progress','resolved','cancelled') THEN 'invalid_parent' " +
    "WHEN t.status IN ('resolved','cancelled') AND m.status NOT IN ('done','resolved','completed','cancelled') THEN 'archived_incomplete' " +
    "WHEN m.status IN ('in_progress','doing','active','unconcluded') AND t.status IN ('open','in_progress') AND " +
    "(CASE WHEN COALESCE(m.started_at,m.updated_at,m.created_at)<4102444800 THEN COALESCE(m.started_at,m.updated_at,m.created_at)*1000 ELSE COALESCE(m.started_at,m.updated_at,m.created_at) END)<=? THEN 'unconcluded' " +
    "WHEN m.status IN ('in_progress','doing','active','unconcluded') AND t.status IN ('open','in_progress') THEN 'in_progress' " +
    "WHEN m.status='pending' AND t.status IN ('open','in_progress') THEN 'pending' ELSE 'invalid_parent' END visible_state, COUNT(*) n " +
    "FROM mission_tasks m LEFT JOIN tickets t ON t.id=m.mission_id GROUP BY visible_state"
  ).bind(cutoff).all()).results || [];
  out.tareas.no_concluidas = 0;
  out.tareas.archivadas_incompletas = 0;
  out.tareas.huerfanas = 0;
  out.tareas.padre_invalido = 0;
  out.tareas.total_historico = 0;
  out.tareas.universe = "all_history";
  out.tareas.state_semantics = "parent-aware-v1";
  for (const r of ta) { if (r.visible_state === "in_progress") out.tareas.curso = r.n;
    else if (r.visible_state === "pending") out.tareas.pend = r.n;
    else if (r.visible_state === "unconcluded") out.tareas.no_concluidas = r.n;
    else if (r.visible_state === "archived_incomplete") out.tareas.archivadas_incompletas = r.n;
    else if (r.visible_state === "orphaned") out.tareas.huerfanas = r.n;
    else if (r.visible_state === "invalid_parent") out.tareas.padre_invalido = r.n;
    out.tareas.total_historico += r.n; }
  // INFORMES no tienen estado: o están escritos o no están (Carlos, 24-jul-2026).
  // Antes se contaban «en curso/pendientes» las tareas CON parte que seguían abiertas
  // — doblemente falso: le inventaba un ciclo de vida al informe e ignoraba justo los
  // partes ya escritos (los de tareas cerradas), que son casi todos. De ahí el «1/18».
  // El número honesto es la COBERTURA: de las misiones de flota ya terminadas, cuántas
  // tienen su parte. Toda misión finalizada lo debe, así que total−hechos es la deuda.
  const inf = await env.DB.prepare(
    "SELECT COUNT(*) total, SUM(CASE WHEN EXISTS (" +
    "  SELECT 1 FROM mission_tasks z WHERE z.mission_id=t.id AND z.code='z1' AND z.status='done' AND z.report IS NOT NULL AND TRIM(z.report)!=''" +
    ") AND NOT EXISTS (" +
    "  SELECT 1 FROM mission_tasks m WHERE m.mission_id=t.id AND m.status='done' AND (m.report IS NULL OR TRIM(m.report)='')" +
    ") AND NOT EXISTS (" +
    "  SELECT 1 FROM mission_tasks p WHERE p.mission_id=t.id AND p.status NOT IN ('done','resolved','completed','cancelled')" +
    ") THEN 1 ELSE 0 END) hechos FROM tickets t WHERE t.source='fleet' AND t.status='resolved'"
  ).first();
  out.informes = { hechos: (inf && inf.hechos) | 0, total: (inf && inf.total) | 0 };
  // NOTIFICACIONES: `abiertas` conserva el campo consumido por el menú, pero ahora
  // sólo equivale a bloqueos live. El resto se expone sin activar el rojo urgente.
  const notifNow = Date.now();
  const notifRows = ((await env.DB.prepare(
    "SELECT status,kind,last_at,machine FROM notifs WHERE status='abierta'"
  ).all()).results) || [];
  const notifSummary = notificationSummary(notifRows, notifNow);
  out.notificaciones = Object.assign({ abiertas: notifSummary.live, generated_at: notifNow,
    thresholds_ms: { live: SYSTEM_NOTIFICATION_LIVE_MS, unconfirmed: SYSTEM_NOTIFICATION_UNCONFIRMED_MS } }, notifSummary);
  // DECISIONES: relojes VIVOS = pending con deadline futuro (honesto: deadline>now,
  // no me fío del barrido de expiración que sólo corre en GET /decisions). El menú
  // pinta la cuenta atrás hacia el más próximo; sin ninguna viva, DECISIONES limpia.
  const now = Date.now();
  const dec = await env.DB.prepare(
    "SELECT COUNT(*) n, MIN(deadline) nearest FROM decisions WHERE status='pending' AND deadline > ?"
  ).bind(now).first();
  // Ventanas del DÍA y de la ÚLTIMA HORA (Carlos, 2026-08-05): saber cuántas van
  // hoy y cuántas en la hora dice si la flota está preguntando mucho o poco, que
  // «relojes vivos: 0» por sí solo no cuenta. Sólo RAÍCES: las continuaciones
  // enlazadas al mismo lote no son ventanas nuevas, igual que para el cupo.
  const raiz = "(parent_decision IS NULL OR parent_decision='')";
  const diaMs = madridDayStart(now);
  const tot = await env.DB.prepare(
    "SELECT SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) dia," +
    "       SUM(CASE WHEN created_at >  ? THEN 1 ELSE 0 END) hora" +
    " FROM decisions WHERE " + raiz + " AND created_at >= ?"
  ).bind(diaMs, now - HOURLY_WINDOW_MS, Math.min(diaMs, now - HOURLY_WINDOW_MS)).first();
  out.decisiones = { vivas: (dec && dec.n) | 0, deadline: (dec && dec.n) ? dec.nearest : null,
    dia: (tot && tot.dia) | 0, hora: (tot && tot.hora) | 0 };
  return out;
}
__name(menuCounters, "menuCounters");
var worker_app = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const authResponse = await handleAuthRequest(req, env, { clientId:AUTH_CLIENT_ID, whitelist, makeSession, readSession, revokeSession });
    if (authResponse) return authResponse;
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    // ── AUTOCURACIÓN DE LA RUTINA PROGRAMADA, INDEPENDIENTE DEL CRON (FLT-1016 c) ─
    // DIAGNÓSTICO (23/24-jul-2026): el cron scheduled() de este worker NO se invoca
    // en esta cuenta —schedule "*/2 * * * *" registrado y confirmado por API, pero
    // wrangler tail no ve NINGUNA ejecución de cron en varias franjas y council_ticks
    // quedaba vacío—. Antes sólo el Consejo se autocuraba aquí; ahora enganchamos
    // TODA la rutina del tick (reconcile, fleetSync, fleetPlan, fleetReconcile,
    // monitores y Consejo): en 2º plano (ctx.waitUntil, sin latencia), con throttle
    // por isolate (>=120s, la cadencia del viejo */2 con margen) + cerrojo GLOBAL por
    // D1 (un isolate por ventana → sin dobles incidencias/planes). Si el cron revive,
    // scheduled() usa el MISMO cuerpo y cerrojo → cero duplicación. Best-effort: nunca
    // afecta a la respuesta.
    try {
      const _now = Date.now();
      if (ctx && typeof ctx.waitUntil === "function" && _now - scheduledPiggybackAt > 120000) {
        scheduledPiggybackAt = _now;
        ctx.waitUntil((async () => {
          if (await tryAcquireBeatLease(env, "__scheduled", 120000)) await runScheduledRoutine(env, null);
        })().catch(() => {}));
      }
    } catch (e) {}
    // ── MEDIA (imágenes de misiones) ──────────────────────────────────────────
    // GET /media/<key> → PÚBLICO: sirve la imagen de R2 (el LLM la ve por URL).
    if (url.pathname.startsWith("/media/") && req.method === "GET") {
      if (!env.MEDIA) return json({ error: "sin bucket MEDIA" }, 500);
      const key = decodeURIComponent(url.pathname.slice("/media/".length));
      const obj = await env.MEDIA.get(key);
      if (!obj) return json({ error: "not found" }, 404);
      const h = new Headers(CORS);
      // FLT-1007 c: se sirve el content-type REAL guardado. Los objetos viejos de fleet/
      // se subieron sin metadata y hoy son TODO imágenes (las pruebas), así que su caída
      // es image/png —no octet-stream— para que las capturas existentes sigan pintándose.
      h.set("content-type", obj.httpMetadata?.contentType || "image/png");
      h.set("cache-control", "public, max-age=31536000, immutable");
      return new Response(obj.body, { headers: h });
    }
    // POST /media → PROTEGIDO (sesión del perímetro): sube una imagen a R2 y
    // devuelve su URL pública. Body = bytes de la imagen; content-type = el suyo.
    if (url.pathname === "/media" && req.method === "POST") {
      const sess = await requireAuth(env, req);
      if (!sess) return json({ error: "unauthorized" }, 401);
      if (!env.MEDIA) return json({ error: "sin bucket MEDIA" }, 500);
      const ct = req.headers.get("content-type") || "application/octet-stream";
      if (!/^image\//i.test(ct)) return json({ error: "solo imágenes" }, 415);
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) return json({ error: "vacío" }, 400);
      if (buf.byteLength > 12 * 1024 * 1024) return json({ error: "máx 12MB" }, 413);
      const ext = (ct.split("/")[1] || "png").split(";")[0].replace(/[^a-z0-9]/gi, "") || "png";
      const rand = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
      const key = `m/${rand}.${ext}`;
      await env.MEDIA.put(key, buf, { httpMetadata: { contentType: ct } });
      const publicUrl = `${url.origin}/media/${key}`;
      return json({ ok: true, url: publicUrl, key });
    }
    // GET /shot?url=<web del proyecto> → PÚBLICO: miniatura de la web (referencia
    // visual de la misión). Captura vía mShots y la CACHEA en R2 (sin token ni
    // puppeteer). Anti-SSRF: solo dominios de la flota. (Carlos, 2026-07-16)
    if (url.pathname === "/shot" && req.method === "GET") {
      if (!env.MEDIA) return json({ error: "sin bucket MEDIA" }, 500);
      const target = url.searchParams.get("url") || "";
      if (!isProjectShotAllowed(target)) return json({ error: "dominio no permitido" }, 400);
      const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(target));
      const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
      const key = "shot/" + hash + ".png";
      const FRESH = 12 * 3600 * 1000;   // 12h de caché por web
      const cached = await env.MEDIA.get(key);
      if (cached) {
        const age = Date.now() - parseInt((cached.customMetadata && cached.customMetadata.ts) || "0", 10);
        if (age < FRESH) {
          const h = new Headers(CORS); h.set("content-type", "image/png"); h.set("cache-control", "public, max-age=3600");
          return new Response(cached.body, { headers: h });
        }
      }
      let buf = null, ct = "image/png";
      // 1) Captura PROPIA con Browser Rendering (SIN marca de agua): 960×600 de la
      //    parte superior de la web. Si no está disponible o falla, cae a thum.io.
      try {
        const browser = await puppeteer.launch(env.BROWSER);
        try {
          const page = await browser.newPage();
          await page.setViewport({ width: 960, height: 600, deviceScaleFactor: 1 });
          // networkidle0 NO sirve para nuestras propias webs: tienen sondeos y
          // widgets (el avatar 3D) que mantienen la red viva, así que nunca
          // llegaba a reposo, saltaba el timeout y caía al respaldo externo.
          // Se espera al DOM y se dan 2,5 s para que pinte.
          await page.goto(target, { waitUntil: "domcontentloaded", timeout: 2e4 });
          await new Promise((r) => setTimeout(r, 2500));
          buf = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 960, height: 600 } });
          ct = "image/png";
        } finally { await browser.close(); }
      } catch (e) { buf = null; }
      // 2) Fallback: thum.io (con marca de agua) si Browser Rendering no dio imagen.
      if (!buf || buf.byteLength < 3500) {
        try {
          const r = await fetch("https://image.thum.io/get/width/480/crop/300/" + target, { cf: { cacheTtl: 0 } });
          buf = await r.arrayBuffer();
          ct = r.headers.get("content-type") || "image/png";
        } catch (e) { /* sin captura */ }
      }
      // Solo cachear si es una imagen real (no un HTML de error ~pequeño).
      // Y NUNCA un GIF: thum.io devuelve un GIF animado de «cargando» cuando aún
      // no tiene la captura, pesa >3500 bytes y colaba como buena — quedaba
      // cacheada 12 h y servida con content-type PNG. Las capturas de verdad
      // (Browser Rendering o thum.io) son PNG o JPEG.
      const real = buf && buf.byteLength > 3500 && /^image\/(png|jpe?g)/i.test(ct);
      if (real) await env.MEDIA.put(key, buf, { httpMetadata: { contentType: ct }, customMetadata: { ts: String(Date.now()), ct: ct } });
      else if (cached) { const h = new Headers(CORS); h.set("content-type", (cached.customMetadata && cached.customMetadata.ct) || "image/png"); h.set("cache-control", "public, max-age=600"); return new Response(cached.body, { headers: h }); }
      const h = new Headers(CORS); h.set("content-type", real ? ct : "image/png"); h.set("cache-control", real ? "public, max-age=3600" : "no-store");
      return new Response(real ? buf : new ArrayBuffer(0), { headers: h, status: real ? 200 : 502 });
    }
    // Misiones de FLOTA: lectura pública (la consume admira.live/status, que no
    // pasa el gate Google) y sync idempotente. Van ANTES del perímetro.
    // Latido de PROGRESO del CLI: marca la misión en curso y guarda la última
    // captura del terminal. Público como /fleet/informe (lo llama el capturador
    // común). Body: {mission,owner,image,captured_at,evidence_kind,
    // capture_surface,capture_context}. Un heartbeat
    // sin imagen puede activar la misión, pero NO refresca la antigüedad de una
    // captura anterior.
    if (url.pathname === "/fleet/progress" && req.method === "POST") {
      try {
        await ensureSchema(env);
        const b = await req.json();
        const mid = await resolveFleetMissionReference(env, b.mission || b.id);
        if (!mid) return json({ ok: false, error: "mission requerida" }, 400);
        const t = await env.DB.prepare("SELECT id,assignee,loc,screen,created_at,status FROM tickets WHERE id=?").bind(mid).first();
        if (!t) return json({ ok: false, error: "la misión " + mid + " no existe", applied: false }, 404);
        const actor = validateMissionActor(t, b.owner || b.by || b.agent);
        if (!actor.ok) return json({ ok: false, code: "owner_mismatch", error: actor.error, expected_assignee: actor.expected, received_owner: actor.actor, applied: false }, 403);
        if (t.status === "resolved" || t.status === "cancelled") {
          return json({ ok: false, code: "mission_closed", error: "la misión ya está cerrada", applied: false }, 409);
        }
        const rawImage = String(b.image || "").trim();
        let img = null, capturedAt = null, liveKind = null, captureSurface = null, captureContext = null;
        if (rawImage) {
          liveKind = String(b.evidence_kind || "").trim();
          if (liveKind !== "process" && liveKind !== "final-fallback") {
            return json({ ok: false, field: "evidence_kind", error: "evidence_kind debe ser process o final-fallback", applied: false }, 400);
          }
          const provenance = validateProcessCaptureProvenance(liveKind, b.capture_surface, b.capture_context);
          if (!provenance.ok) return json({ ok:false, code:provenance.code, field:provenance.field,
            missing:provenance.missing || [], error:provenance.error, applied:false }, 400);
          captureSurface = provenance.surface; captureContext = provenance.context;
          if (liveKind === "final-fallback" && b.degraded !== true) {
            return json({ ok: false, field: "degraded", error: "una captura final sólo puede reutilizarse como proceso con degraded:true", applied: false }, 400);
          }
          const norm = await validateProofImage(env, rawImage, url.origin);
          if (!norm.value) return json({ ok: false, field: "image", error: "image no válida: " + norm.error, applied: false }, 400);
          img = norm.value;
          const capture = normalizeLiveCaptureTime(b.captured_at);
          if (!capture.value) return json({ ok: false, field: "captured_at", error: capture.error, applied: false }, 400);
          capturedAt = capture.value;
        }
        const now = Date.now();
        const workBinding = await bindPresenceWork(env, actor.actor || t.assignee, t.loc, mid, b.work_session);
        if (img) {
          await env.DB.prepare(
            "UPDATE tickets SET status=CASE WHEN status='open' THEN 'in_progress' ELSE status END,started_at=CASE WHEN status='open' THEN COALESCE(started_at,?) ELSE started_at END,live_shot=?,live_at=?,live_kind=?,live_surface=?,live_context=?,points_start=COALESCE(points_start,?),updated_at=? WHERE id=? AND status NOT IN ('resolved','cancelled')"
          ).bind(capturedAt, img, capturedAt, liveKind, captureSurface, captureContext, await puntosDeAgenteAhora(env, t.assignee || actor.actor, t.loc), now, mid).run();
        // Red de seguridad del sello de SALIDA: las misiones nacen ya con
        // points_start (fleetSync), pero las creadas por otras vias o antes de ese
        // cambio llegan aqui sin el. Va con COALESCE en las DOS ramas, con captura
        // y sin ella: cuando solo estaba en la rama con imagen, el sello se ponia
        // en la prueba de proceso — cuando la mision YA habia sumado sus 40 puntos,
        // asi que la resta con points_end daba 0 y /informes decia que el encargo
        // no habia producido nada.
        } else {
          await env.DB.prepare(
            "UPDATE tickets SET status=CASE WHEN status='open' THEN 'in_progress' ELSE status END,started_at=CASE WHEN status='open' THEN COALESCE(started_at,?) ELSE started_at END,points_start=COALESCE(points_start,?),updated_at=? WHERE id=? AND status NOT IN ('resolved','cancelled')"
          ).bind(now, await puntosDeAgenteAhora(env, t.assignee || actor.actor, t.loc), now, mid).run();
        }
        // Telegram es un espejo completo de la misión: el usuario ve el avance y
        // la captura sin tener que abrir YOKUP.
        if (env.TELEGRAM) {
          const iid = t && await fleetEncargoId(env, mid, t.screen);
          if (/^\d+$/.test(String(iid || ""))) {
            try { await env.TELEGRAM.fetch(new Request("https://telegram/api/bot-inbox/"+iid+"/progress", {
              method:"POST", headers:{"content-type":"application/json"},
              body:JSON.stringify({mission_id:mid,mission_created_at:t.created_at,persona:t.assignee,machine:t.loc,detail:b.detail||(img ? (liveKind === "final-fallback" ? "Captura final reutilizada como progreso (DEGRADADO)" : "Captura de proceso recibida en YOKUP") : "Latido de ejecución recibido; sin nueva captura"),image:img,percent:b.percent,evidence_kind:liveKind,captured_at:capturedAt,capture_surface:captureSurface,capture_context:captureContext,degraded:liveKind === "final-fallback"})
            })); } catch(e) {}
          }
        }
        return json({ ok: true, mission: mid, work_binding:workBinding, evidence_updated: !!img, evidence_kind: liveKind, captured_at: capturedAt,
          capture_surface:captureSurface, capture_context:captureContext, degraded: liveKind === "final-fallback" });
      } catch (e) {
        return json({ ok: false, error: String(e) }, 500);
      }
    }
    // ESTRATEGIA (norte) — LECTURA PÚBLICA: los agentes la leen desde el CLI,
    // igual que publican decisiones, sin login de navegador.
    // CONFIG DE FLOTA — LECTURA PÚBLICA. Un agente la consulta al arrancar
    // desde el CLI, sin sesión y sin secreto: `curl .../fleet/config`.
    // TURNOS DE VENTANA — LECTURA PÚBLICA. La usa el detalle del Highscore para
    // decir cuánto falta hasta la próxima ventana del agente seleccionado.
    if (url.pathname === "/fleet/turnos") {
      await ensureSchema(env);
      const now = Date.now();
      const quien = String(url.searchParams.get("agent") || "").trim();
      // Un solo censo para todos: pedirlo por agente daba N+1 consultas y, si el
      // que preguntaba no era real, un reparto distinto en la cabecera que en
      // las filas.
      const base = await ventanaTurno(env, quien, now);
      const salida = [];
      for (let i = 0; i < base.censo.length; i += 1) {
        const a = base.censo[i];
        const offset = i * base.paso;
        const dentro = now % HOURLY_WINDOW_MS;
        const inicioCiclo = now - dentro;
        const enFranja = dentro >= offset && dentro < offset + base.paso;
        const proximoTurno = dentro < offset ? inicioCiclo + offset
          : (enFranja ? now : inicioCiclo + HOURLY_WINDOW_MS + offset);
        const ultima = await env.DB.prepare(
          "SELECT created_at FROM decisions WHERE replace(lower(agent),'macmini','mini')=replace(lower(?),'macmini','mini') AND (parent_decision IS NULL OR parent_decision='') ORDER BY created_at DESC LIMIT 1"
        ).bind(a).first();
        const desdeUltima = ultima ? Number(ultima.created_at) + HOURLY_WINDOW_MS : 0;
        // Manda la más tardía de las dos condiciones: cumplir su hora Y su turno.
        const proxima = Math.max(proximoTurno, desdeUltima);
        salida.push({ agent: a, turno: i + 1, offsetMin: Math.round(offset / 60000),
          enTurno: enFranja && now >= desdeUltima, ultima: ultima ? Number(ultima.created_at) : 0,
          proxima, faltanMs: Math.max(0, proxima - now) });
      }
      salida.sort((x, y) => x.proxima - y.proxima);
      return json({ ok: true, now, agentes: base.n, pasoMin: Math.round(base.paso / 60000), turnos: salida });
    }
    if (url.pathname === "/fleet/config") {
      await ensureSchema(env);
      const rows = ((await env.DB.prepare("SELECT name, value, updated_at, updated_by FROM fleet_config").all()).results) || [];
      const config = {};
      for (const r of rows) config[r.name] = { value: r.value || "", updated_at: r.updated_at || 0, updated_by: r.updated_by || "" };
      return json({ ok: true, config });
    }
    if (url.pathname === "/fleet/strategy") {
      await ensureSchema(env);
      const rows = ((await env.DB.prepare("SELECT team, text, updated_at, updated_by FROM strategy").all()).results) || [];
      const by = {};
      for (const r of rows) by[r.team] = { text: r.text || "", updated_at: r.updated_at || 0, updated_by: r.updated_by || "" };
      const blank = { text: "", updated_at: 0, updated_by: "" };
      return json({ ok: true, strategy: { atomos: by.atomos || blank, bits: by.bits || blank } });
    }
    // ── CARBONO ─────────────────────────────────────────────────────────────
    // Va por el carril /fleet/* (abierto) por la misma razón que el resto: quien
    // late es quien trabaja, y obligarle a cruzar el perímetro con la sesión de
    // Google de Carlos sería pedirle que se haga pasar por él. Editar la ficha
    // de otra persona sí es gestión, pero el carril ya distingue lo uno de lo
    // otro para el silicio y no se inventa aquí un perímetro distinto.
    // «En qué está» cada responsable de carbono, leído del MCP de Yarigai
    // (src/carbon-activity.js). Sin YARIGAI_MCP_TOKEN responde honesto: sin datos.
    if (url.pathname === "/carbon/activity" && req.method === "GET") {
      try {
        const projects = (await listProjects(env)).filter((p) => String(p.status || "activo").toLowerCase() !== "archivado");
        const byId = new Map();
        for (const p of projects) {
          const name = String(p.carbon_responsible || "").trim(); const id = carbonId(name);
          if (id && !byId.has(id)) byId.set(id, { carbon_id: id, name, email: "" });
        }
        let maps = (await env.DB.prepare("SELECT carbon_id,name,email FROM carbon_yarigai").all()).results || [];
        // La semilla (Carlos = csilva@admira.com) se planta aquí, al primer uso, y no en
        // ensureSchema: allí correría en cada petición y ensuciaría cualquier auditoría
        // de escrituras (los tests de atomicidad la veían como una escritura fantasma).
        if (!maps.length) {
          for (const seed of CARBON_YARIGAI_SEED) await env.DB.prepare("INSERT OR IGNORE INTO carbon_yarigai (carbon_id,name,email,updated_at,updated_by) VALUES (?,?,?,?,?)").bind(seed.carbon_id, seed.name, seed.email, Date.now(), "seed").run();
          maps = (await env.DB.prepare("SELECT carbon_id,name,email FROM carbon_yarigai").all()).results || [];
        }
        for (const m of maps) { const row = byId.get(m.carbon_id); if (row) row.email = m.email; }
        const out = await carbonActivity({ people: [...byId.values()], token: String(env.YARIGAI_MCP_TOKEN || "") });
        return json({ ...out, mapping_endpoint: "/carbon/yarigai" });
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/carbon/yarigai" && req.method === "GET") {
      const rows = (await env.DB.prepare("SELECT carbon_id,name,email,updated_at,updated_by FROM carbon_yarigai ORDER BY name").all()).results || [];
      return json({ ok: true, rows });
    }
    // Alta del puente nombre→email. Un secreto de flota, no una sesión: lo da de alta
    // quien opera el censo, no cualquiera con el panel abierto.
    if (url.pathname === "/carbon/yarigai" && req.method === "POST") {
      const auth = String(req.headers.get("x-fleet-token") || req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
      if (!env.FLEET_TOKEN || auth !== env.FLEET_TOKEN) return json({ ok: false, error: "fleet token requerido", code: "fleet_token_required" }, 401);
      const b = await req.json().catch(() => ({}));
      const n = normalizeCarbonYarigai(b, carbonId, Date.now());
      if (!n.ok) return json(n, 400);
      await env.DB.prepare("INSERT INTO carbon_yarigai (carbon_id,name,email,updated_at,updated_by) VALUES (?,?,?,?,?) ON CONFLICT(carbon_id) DO UPDATE SET name=excluded.name,email=excluded.email,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(n.row.carbon_id, n.row.name, n.row.email, n.row.updated_at, n.row.updated_by).run();
      return json({ ok: true, row: n.row });
    }
    if (url.pathname === "/fleet/carbon" && req.method === "GET") {
      await ensureSchema(env);
      const ahora = Date.now();
      const rows = ((await env.DB.prepare(
        "SELECT id,name,role,zone,skills,contact,status,created_at,updated_at,last_beat_at,focus,focus_at " +
        "FROM carbon_members ORDER BY created_at ASC, id ASC").all()).results) || [];
      const members = rows.map((r) => carbonRow(r, ahora));
      const cuenta = { total: members.length, en_turno: 0, ausente: 0, "sin-latido": 0, baja: 0 };
      for (const m of members) cuenta[m.estado] = (cuenta[m.estado] || 0) + 1;
      return json({ ok: true, now: ahora, window_ms: CARBON_BEAT_WINDOW_MS, cuenta, members });
    }
    if (url.pathname === "/fleet/carbon" && req.method === "POST") {
      await ensureSchema(env);
      const body = await req.json().catch(() => ({}));
      // NO hay borrado duro: los partes ya cerrados apuntan a esta persona por
      // nombre y borrarla dejaría un histórico firmado por un fantasma. Quien se
      // va se pone de baja, sale de la plantilla que reparte y sigue explicando
      // quién hizo lo que hizo.
      if (body && body.delete === true) {
        return json({ ok: false, code: "carbon_no_hard_delete",
          error: "una persona no se borra: se da de baja con status:\"baja\", para no dejar el histórico sin autor" }, 400);
      }
      const ahora = Date.now();
      const normalizado = normalizeCarbonMember(body, ahora);
      if (!normalizado.ok) return json({ ok: false, code: normalizado.code, error: normalizado.error }, 400);
      const m = normalizado.member;
      await env.DB.prepare(
        "INSERT INTO carbon_members(id,name,role,zone,skills,contact,status,created_at,updated_at,created_by) " +
        "VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET " +
        "name=excluded.name, role=excluded.role, zone=excluded.zone, skills=excluded.skills, " +
        "contact=excluded.contact, status=excluded.status, updated_at=excluded.updated_at"
      ).bind(m.id, m.name, m.role, m.zone, m.skills, m.contact, m.status, ahora, ahora, m.created_by).run();
      const fila = await env.DB.prepare("SELECT * FROM carbon_members WHERE id=?").bind(m.id).first();
      return json({ ok: true, member: carbonRow(fila, ahora) });
    }
    if (url.pathname === "/fleet/carbon/beat" && req.method === "POST") {
      await ensureSchema(env);
      const parsed = carbonBeat(await req.json().catch(() => ({})));
      if (!parsed.ok) return json({ ok: false, code: parsed.code, error: parsed.error }, 400);
      // Un latido de alguien que no está en el censo NO da de alta a nadie: se
      // dice que no existe. Dejar que un latido cree personas convertiría un
      // dedazo en plantilla y el censo dejaría de poder creerse.
      const existe = await env.DB.prepare("SELECT id FROM carbon_members WHERE id=?").bind(parsed.id).first();
      if (!existe) return json({ ok: false, code: "carbon_unknown",
        error: "esa persona no está en el censo: dala de alta antes de latir" }, 404);
      const ahora = Date.now();
      // focus null = «no toques el foco»: quien pulsa «sigo aquí» sin escribir
      // nada no puede borrar el «en el tótem de Gràcia» que dejó antes.
      await env.DB.prepare(
        "UPDATE carbon_members SET last_beat_at=?, focus=COALESCE(?,focus), " +
        "focus_at=CASE WHEN ? IS NULL THEN focus_at ELSE ? END WHERE id=?"
      ).bind(ahora, parsed.focus, parsed.focus, ahora, parsed.id).run();
      const fila = await env.DB.prepare("SELECT * FROM carbon_members WHERE id=?").bind(parsed.id).first();
      return json({ ok: true, member: carbonRow(fila, ahora) });
    }
    // El equipo COMPLETO en una sola lectura, silicio y carbono con la misma
    // forma. Existe para que ninguna pantalla tenga que cruzar dos censos por su
    // cuenta y acabe contando distinto que la de al lado.
    if (url.pathname === "/fleet/equipo" && req.method === "GET") {
      await ensureSchema(env);
      const ahora = Date.now();
      const rows = ((await env.DB.prepare(
        "SELECT id,name,role,zone,skills,contact,status,created_at,updated_at,last_beat_at,focus,focus_at " +
        "FROM carbon_members ORDER BY created_at ASC, id ASC").all()).results) || [];
      const carbono = rows.map((r) => carbonRow(r, ahora));
      // El censo de silicio vive en admira-fleet y es su fuente única. Si no
      // contesta se dice que no contesta (`silicio_disponible:false`) en vez de
      // devolver una lista vacía, que se leería como «no hay agentes».
      let silicio = [], silicioOk = false;
      try {
        const r = await env.FLEET_SVC.fetch(new Request(FLEET_API + "/silicon", {
          headers: { authorization: "Bearer " + env.FLEET_TOKEN,
                     "user-agent": "Mozilla/5.0 (compatible; yokup-rtc)" }
        }));
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          silicio = (d.silicon || []).map((s) => ({ kind: "silicio", id: String(s.id || ""),
            name: String(s.name || s.id || ""), role: String(s.capa || s.role || ""),
            machine: String(s.machine || ""), status: String(s.status || "activo") }));
          silicioOk = true;
        }
      } catch (e) {}
      return json({ ok: true, now: ahora, window_ms: CARBON_BEAT_WINDOW_MS,
        silicio_disponible: silicioOk, silicio, carbono,
        totales: { silicio: silicio.length, carbono: carbono.length,
          carbono_en_turno: carbono.filter((c) => c.estado === "en-turno").length } });
    }
    if (url.pathname === "/fleet/agent-detail" && req.method === "GET") {
      await ensureSchema(env);
      const query = parseAgentDetailQuery(url.searchParams);
      if (!query.ok) return json({ ok:false, code:query.code, error:query.error }, 400);
      const response = json(await agentDetail(env, query));
      response.headers.set("cache-control", "no-store");
      return response;
    }
    if (url.pathname === "/fleet/missions") {
      await ensureSchema(env);
      return json({ missions: await fleetMissions(env) });
    }
    if (url.pathname === "/highscore/daily") {
      await ensureSchema(env);
      await ensureIdeasSchema(env);
      return json(await highscoreDaily(env));
    }
    if (url.pathname === "/highscore/history" && req.method === "GET") {
      await ensureSchema(env);
      await ensureIdeasSchema(env);
      const agent = String(url.searchParams.get("agent") || "").trim();
      // scope=global responde por TODA la flota y no lleva agente. Va por el
      // mismo endpoint a propósito: es el mismo dato con otro alcance, y tener
      // dos rutas para la misma pregunta acaba en dos recuentos distintos.
      if (String(url.searchParams.get("scope") || "").toLowerCase() === "global") {
        if (String(url.searchParams.get("detail") || "").toLowerCase() === "missions") {
          const detail = await highscoreAgentMissions(env, agent, url.searchParams.get("period") || "day");
          const response = json(detail, detail.ok ? 200 : 400);
          response.headers.set("cache-control", "no-store");
          return response;
        }
        // Con `desde` se pide el DETALLE de un periodo en vez del agregado: es
        // el mismo alcance mirado de cerca, así que comparte ruta y filtro.
        const desde = String(url.searchParams.get("desde") || "").trim();
        if (desde) {
          const detalle = await highscoreFleetMissions(env, desde, String(url.searchParams.get("hasta") || "").trim());
          return json(detalle, detalle.ok ? 200 : 400);
        }
        return json(await highscoreFleetHistory(env));
      }
      if (!agent) return json({ ok:false, error:"agent requerido" }, 400);
      const projectId = String(url.searchParams.get("project_id") || "").trim();
      const history = projectId
        ? await highscoreProjectHistory(env, agent, projectId, url.searchParams.get("period") || "today")
        : await highscoreHistory(env, agent);
      return json(history, history.ok ? 200 : 400);
    }
    if (url.pathname === "/highscore/active-work" && req.method === "GET") {
      await ensureSchema(env);
      await ensureIdeasSchema(env);
      await preemptAutomaticWork(env);
      const response = json(await highscoreActiveWork(env));
      response.headers.set("cache-control", "no-store");
      return response;
    }
    // ── NOTIFICACIONES DEL SISTEMA DE LA FLOTA (FLT-1020) ────────────────────
    // Sin perímetro, como el resto de /fleet/*: quien publica es un vigilante que
    // corre en cada máquina, sin navegador ni login. POST = «esto sigue en pantalla»
    // (idempotente por fingerprint: refresca la fila viva en vez de duplicarla).
    if (url.pathname === "/fleet/notificacion" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      const machine = String(b.machine || "").trim().slice(0, 60);
      const owner = String(b.owner || "").trim().slice(0, 80);
      if (!machine || !owner) return json({ ok: false, error: "machine y owner requeridos" }, 400);
      const titulo = String(b.titulo || b.title || "").trim().slice(0, 300);
      const kind = String(b.kind || "sistema").trim().slice(0, 40);
      const image = String(b.image || "").trim().slice(0, 400) || null;
      // CIERRE: el vigilante avisa de que el diálogo ya no está. Se cierra la fila
      // viva de esa huella; no se borra, para que quede el rastro de cuánto duró.
      const fp = machine.toLowerCase() + "|" + owner.toLowerCase();
      const now = Date.now();
      if (b.cerrada === true || b.resuelta === true) {
        const r = await env.DB.prepare(
          "UPDATE notifs SET status='cerrada', closed_at=?, last_at=? WHERE fingerprint=? AND status='abierta'"
        ).bind(now, now, fp).run();
        return json({ ok: true, cerradas: (r.meta && r.meta.changes) | 0 });
      }
      const viva = await env.DB.prepare("SELECT id FROM notifs WHERE fingerprint=? AND status='abierta'").bind(fp).first();
      if (viva) {
        // Ya avisada: se refresca (y se queda la PRIMERA captura, que es la del
        // momento en que apareció; sustituirla sólo si antes no había ninguna).
        await env.DB.prepare(
          "UPDATE notifs SET last_at=?, seen_count=seen_count+1, titulo=COALESCE(NULLIF(?,''),titulo), image=COALESCE(image,?) WHERE id=?"
        ).bind(now, titulo, image, viva.id).run();
        return json({ ok: true, id: viva.id, nueva: false });
      }
      const id = "NOTIF-" + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
      await env.DB.prepare(
        "INSERT INTO notifs (id,fingerprint,machine,owner,titulo,kind,image,status,first_at,last_at,seen_count) VALUES (?,?,?,?,?,?,?,'abierta',?,?,1)"
      ).bind(id, fp, machine, owner, titulo, kind, image, now, now).run();
      return json({ ok: true, id, nueva: true });
    }
    // Lectura para la sección /notificaciones. Abiertas primero, más recientes arriba.
    if (url.pathname === "/fleet/notificaciones" && req.method === "GET") {
      await ensureSchema(env);
      const todas = url.searchParams.get("todas") === "1";
      const now = Date.now();
      const { results } = await env.DB.prepare(
        "SELECT * FROM notifs" + (todas ? "" : " WHERE status='abierta'") +
        " ORDER BY (status='abierta') DESC, last_at DESC LIMIT 200"
      ).all();
      const rows = (results || []).map((row) => notificationContract(row, now));
      const openRows = ((await env.DB.prepare(
        "SELECT status,kind,last_at,machine FROM notifs WHERE status='abierta'"
      ).all()).results) || [];
      const summary = notificationSummary(openRows, now);
      return json({ ok: true, now, generated_at: now,
        thresholds_ms: { live: SYSTEM_NOTIFICATION_LIVE_MS, unconfirmed: SYSTEM_NOTIFICATION_UNCONFIRMED_MS },
        summary, abiertas: summary.total_open, requieren_atencion: summary.live,
        pendientes_historicos: summary.unconfirmed + summary.stale + summary.backlog,
        notificaciones: rows });
    }
    // Cierre a mano desde la propia sección (ya lo he atendido / no era nada).
    if (url.pathname === "/fleet/notificacion/cerrar" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      const id = String(b.id || "").trim().slice(0, 40);
      if (!id) return json({ ok: false, error: "id requerido" }, 400);
      const now = Date.now();
      const r = await env.DB.prepare("UPDATE notifs SET status='cerrada', closed_at=?, last_at=? WHERE id=? AND status='abierta'").bind(now, now, id).run();
      return json({ ok: true, cerradas: (r.meta && r.meta.changes) | 0 });
    }
    // DEUDA DE INFORMES: el cierre estricto exige z1, parte en cada tarea hecha y
    // árbol terminal. Se exponen las tres anomalías sin inventar backfills.
    // Consulta propia y NO la lista de /fleet/missions, que va capada a 120 y saca
    // primero las abiertas: la deuda vieja —justo la que hay que perseguir— caía
    // fuera de esa ventana. Sin tope de fecha: una deuda vieja sigue siendo deuda.
    if (url.pathname === "/fleet/informes-deuda") {
      await ensureSchema(env);
      const { results:missions } = await env.DB.prepare(
        "SELECT t.id, t.subject, t.assignee, t.loc, t.updated_at FROM tickets t " +
        "WHERE t.source='fleet' AND t.status='resolved' AND NOT EXISTS (" +
        "  SELECT 1 FROM mission_tasks m WHERE m.mission_id=t.id AND m.code='z1' AND m.status='done' AND m.report IS NOT NULL AND TRIM(m.report)!=''" +
        ") ORDER BY t.updated_at DESC"
      ).all();
      const { results:tasksWithoutReport } = await env.DB.prepare(
        "SELECT t.id,t.subject,t.assignee,t.loc,t.updated_at,m.code,m.title FROM tickets t JOIN mission_tasks m ON m.mission_id=t.id " +
        "WHERE t.source='fleet' AND m.status='done' AND (m.report IS NULL OR TRIM(m.report)='') ORDER BY m.updated_at DESC"
      ).all();
      const { results:openTrees } = await env.DB.prepare(
        "SELECT DISTINCT t.id,t.subject,t.assignee,t.loc,t.updated_at FROM tickets t JOIN mission_tasks m ON m.mission_id=t.id " +
        "WHERE t.source='fleet' AND t.status='resolved' AND m.status NOT IN ('done','resolved','completed','cancelled') ORDER BY t.updated_at DESC"
      ).all();
      const debts = [
        ...(missions || []).map((row) => ({ ...row, debt_kind:"missing_z1" })),
        ...(tasksWithoutReport || []).map((row) => ({ ...row, debt_kind:"task_without_report" })),
        ...(openTrees || []).map((row) => ({ ...row, debt_kind:"resolved_open_tree" }))
      ];
      return json({ ok:true, missions:missions || [], done_tasks_without_report:tasksWithoutReport || [],
        resolved_with_open_tasks:openTrees || [], debts,
        summary:{ missing_z1:(missions || []).length,
          done_tasks_without_report:(tasksWithoutReport || []).length,
          resolved_with_open_tasks:(openTrees || []).length, total:debts.length } });
    }
    if (url.pathname === "/fleet/sync" && req.method === "POST") {
      await ensureSchema(env);
      return json(await fleetSync(env));
    }
    // VÍA PARA AGENTES (sin gate Google): sube la CAPTURA DE PRUEBA a R2 y devuelve su
    // URL pública, para adjuntarla luego al informe (/fleet/informe con {image}). Espejo
    // de POST /media pero sin perímetro, como el resto de /fleet/* (los agentes no lo cruzan).
    // Body = bytes de la imagen; content-type = el suyo. Carlos, 2026-07-17.
    if (url.pathname === "/fleet/media" && req.method === "POST") {
      if (!env.MEDIA) return json({ ok: false, error: "sin bucket MEDIA" }, 500);
      const ct = req.headers.get("content-type") || "application/octet-stream";
      // FLT-1007 c: ya no solo image/*; el Kit de venta trae audio, vídeo y PDF.
      const kind = fleetMediaKind(ct);
      if (!kind.ok) return json({ ok: false, error: kind.error }, 415);
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) return json({ ok: false, error: "vacío" }, 400);
      if (buf.byteLength > FLEET_MEDIA_MAX) return json({ ok: false, error: "máx 80MB" }, 413);
      if (/^image\//i.test(kind.ct) && !imageBytesMatchMime(kind.ct, buf)) {
        return json({ ok: false, code: "image_content_mismatch", error: "los bytes no corresponden al Content-Type " + kind.ct }, 400);
      }
      const rand = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, "0")).join("");
      const key = `fleet/${rand}.${kind.ext}`;
      // Se guarda el content-type REAL como metadata del objeto: GET /media/<key> lo
      // devuelve tal cual, así el navegador reproduce el audio/vídeo y abre el PDF.
      await env.MEDIA.put(key, buf, { httpMetadata: { contentType: kind.ct } });
      return json({ ok: true, url: `${url.origin}/media/${key}`, key, contentType: kind.ct });
    }
    // MANTENIMIENTO (sin gate, como el resto de /fleet/*): purga un objeto de R2 para
    // limpiar restos de prueba. Se acepta la URL pública, «/media/<key>», «media/<key>»
    // o el key pelado; y —salvaguarda del radio de daño en una operación irreversible—
    // solo se permite dentro de fleet/ (las pruebas/kit), nunca m/ (subidas de usuario)
    // ni shot/ (caché de miniaturas). Honesto: informa si el objeto existía o no.
    if (url.pathname === "/fleet/media/delete" && req.method === "POST") {
      if (!env.MEDIA) return json({ ok: false, error: "sin bucket MEDIA" }, 500);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      let key = String(b.path || b.key || "").trim();
      if (!key) return json({ ok: false, error: "path requerido" }, 400);
      try { if (/^https?:\/\//i.test(key)) key = new URL(key).pathname; } catch (e) {}
      key = key.replace(/^\/+/, "").replace(/^media\//, "");
      if (!/^fleet\//.test(key)) return json({ ok: false, error: "solo se purga dentro de fleet/<hash> (m/ y shot/ quedan fuera)" }, 400);
      const existed = await env.MEDIA.head(key);
      await env.MEDIA.delete(key);
      return json({ ok: true, key, existed: !!existed });
    }
    // Reparación quirúrgica para una misión que el contrato antiguo activó de
    // forma automática. Sólo desmonta el cascarón sintético si sigue intacto:
    // sin tareas iniciadas, eventos reales, progreso, informe ni prueba. La
    // segunda llamada es un no-op y nunca reencola trabajo ya ejecutado.
    if (url.pathname === "/fleet/batch/requeue-pristine" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      const mid = await resolveFleetMissionReference(env, b.mission || b.id);
      if (!mid) return json({ ok: false, error: "mission requerida" }, 400);
      const result = await requeuePristineBatchMission(env, mid);
      if (!result.ok) return json(result, result.status || 409);
      return json(result);
    }
    // Enlace tardío y explícito cuando el trabajo real nació después del
    // contenedor sintético. No compara títulos: exige las cuatro llaves de la
    // cadena DEC→BATCH→contenedor→misión canónica y la firma del dueño.
    if (url.pathname === "/fleet/batch/adopt" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok:false, error:"bad json" }, 400); }
      const result = await adoptBatchTargetMission(env, b);
      return json(result, result.ok ? 200 : (result.status || 409));
    }
    // VÍA PARA AGENTES (sin gate Google): deja el INFORME del InfraAgente en yokup, para
    // que aparezca en /informes. Cierra la doctrina «toda tarea acaba en un informe».
    // Se guarda como una mission_task 'done' (code z1) con el report. Acepta FLT-<id> o el
    // número de encargo pelado. Carlos, 2026-07-15 (los agentes no cruzan el perímetro).
    if (url.pathname === "/fleet/informe" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      const mid = await resolveFleetMissionReference(env, b.mission || b.id);
      const report = String(b.report || "").slice(0, 2000).trim();
      const owner = String(b.owner || b.by || "").trim().slice(0, 80);
      const runtime = String(b.runtime || "").trim().slice(0, 20);
      const host = /^(app|cli)$/.test(String(b.host || "").trim()) ? String(b.host).trim() : "";
      // Captura de prueba OBLIGATORIA: una misión de flota no puede finalizar
      // sin el pantallazo real del trabajo realizado.
      const rawImage = String(b.image || "").trim();
      const missing = [];
      if (!mid) missing.push("mission");
      if (!report) missing.push("report");
      if (!owner) missing.push("owner");
      if (!rawImage) missing.push("final_image");
      // «faltan mission» no le dice nada a un agente que acaba de pasar el numero de SU
      // encargo: el numero era bueno, lo que no hay es mision detras. Se le dice eso y
      // como seguir, en vez de dejarle mirando una lista de campos.
      if (!mid && /^#?\d+$/.test(String(b.mission || b.id || "").trim())) {
        return json({ ok: false, code: "encargo_sin_mision", applied: false,
          error: "el encargo #" + String(b.mission || b.id).replace("#", "") + " no tiene mision en yokup: no hay donde escribir el informe",
          hint: "dale de alta con alta-mision.sh si merece mision propia, o cierralo con bot-inbox-ack.sh <id> done y la nota" }, 409);
      }
      if (missing.length) return json({ ok: false, code: "closure_evidence_missing", error: "no se puede cerrar: faltan " + missing.join(", "), missing, applied: false }, 400);
      const t = await env.DB.prepare("SELECT id,assignee,loc,status,source,screen,created_at,proof_image,proof_kind,live_shot,live_at,live_kind,live_surface,live_context,role FROM tickets WHERE id=?").bind(mid).first();
      if (!t) return json({ ok: false, error: "la misión " + mid + " no existe" }, 404);
      // La identidad se valida ANTES de auto-claim, informe, prueba o evento.
      // Una firma cruzada se rechaza completa: no deja ningún rastro falso.
      const actor = validateMissionActor(t, owner);
      if (!actor.ok) return json({ ok: false, code: "owner_mismatch", error: actor.error, expected_assignee: actor.expected, received_owner: actor.actor, applied: false }, 403);
      const principalOwner = reportAgentIdentity(t.assignee, t.loc) || t.assignee;
      const executorOwner = actor.actor !== principalOwner ? actor.actor : null;
      if (t.status === "cancelled") return json({ ok: false, code: "mission_closed", error: "la misión está cancelada", status: t.status, applied: false }, 409);
      // z1 es el cierre de la misión, no un atajo que dé por ejecutado el plan.
      // En una misión normal todas las tareas previas deben estar hechas Y tener
      // informe. La tarea standalone es la excepción estructural: misión y tarea
      // son la misma unidad y comparten honestamente el texto de este informe.
      if (t.status !== "resolved" && t.role !== "standalone-task") {
        // Lectura cruda: listMissionTasks adjunta display_refs y puede escribirlos;
        // un preflight rechazado debe conservar applied:false sin ninguna mutación.
        const closureTasks = ((await env.DB.prepare(
          "SELECT code,status,report FROM mission_tasks WHERE mission_id=? AND code!='z1' ORDER BY code"
        ).bind(mid).all()).results || []);
        const canConverge = (task) => {
          if (String(task.code || "").length !== 1) return false;
          const children = closureTasks.filter((child) => String(child.code || "").startsWith(task.code) && String(child.code || "").length === 2);
          return children.length > 0 && children.every((child) => tareaConcluida(child) && String(child.report || "").trim());
        };
        // CONCLUIDA CON TEXTO, no «done» a secas: un paso descartado trae su motivo
        // y no puede bloquear el cierre — si no, el cuarto estado dejaría marcar el
        // descarte pero seguiría sin dejar cerrar, que es donde estábamos.
        // El texto se sigue exigiendo SIEMPRE, sea informe o motivo.
        const incomplete = closureTasks.filter((task) =>
          !(tareaConcluida(task) && String(task.report || "").trim()) && !canConverge(task));
        if (!closureTasks.length || incomplete.length) {
          return json({ ok:false, code:"mission_tasks_incomplete",
            error:"no se puede cerrar: todas las tareas deben estar hechas (o descartadas con motivo)",
            missing:incomplete.map((task) => ({ code:task.code, status:task.status,
              report:!!String(task.report || "").trim() })), applied:false },409);
        }
      }
      if (t.status !== "resolved") {
        const processEvidence = validateMissionProcessEvidence(t);
        if (!processEvidence.ok) return json({ ok:false, code:processEvidence.code, field:processEvidence.field,
          error:processEvidence.error, applied:false }, 400);
      }
      // Reintento seguro: si D1 cerró pero falló el espejo/batch, sólo se permite
      // completar el MISMO cierre, sin reescribir informe ni prueba.
      // El total del cierre se lee UNA sola vez y ANTES de la transaccion: dentro del
      // batch no se puede consultar, y leerlo dos veces daria dos cifras distintas para
      // el mismo cierre. points_start se rellena aqui tambien por si la mision se cerro
      // sin haber pasado por /fleet/progress: mejor un "antes" igual al "despues"
      // -diferencia 0, honesta- que un hueco que el informe no sabria explicar.
      if (t.status === "resolved") {
        const previous = await env.DB.prepare("SELECT owner,report,image,image_kind FROM mission_tasks WHERE mission_id=? AND code='z1'").bind(mid).first();
        const repairStandalone = t.role === "standalone-task" && !previous &&
          t.proof_kind === "final" && t.proof_image === rawImage;
        if (repairStandalone) {
          const inbox = await notifyFleetInformeClosure(env, t, mid, owner, report, rawImage, runtime, host);
          if (!inbox.updated) return json({ ok:false, code:"closure_partial", mission:mid, resolved:false,
            local_resolved:true, proof_saved:true, inbox_updated:false, sync_required:true, proof_image:rawImage }, 502);
          const now = Date.now();
          await env.DB.batch([
            env.DB.prepare("INSERT INTO mission_tasks(mission_id,code,title,status,owner,executor,report,image,image_kind,created_at,ended_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(mission_id,code) DO UPDATE SET report=excluded.report,status='done',owner=excluded.owner,executor=COALESCE(excluded.executor,mission_tasks.executor),image=excluded.image,image_kind='final',ended_at=COALESCE(mission_tasks.ended_at,excluded.ended_at),updated_at=excluded.updated_at")
              .bind(mid,"z1","Informe del agente","done",principalOwner,executorOwner,report,rawImage,"final",now,now,now),
            env.DB.prepare("UPDATE mission_tasks SET status='done',report=COALESCE(NULLIF(TRIM(report),''),?),ended_at=COALESCE(ended_at,?),updated_at=? WHERE mission_id=? AND code!='z1' AND status!='done' AND status!='no_aplica'").bind(report,now,now,mid),
            env.DB.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)").bind(mid,now,"log",owner,"📝 Informe standalone recuperado: "+report.slice(0,240))
          ]);
          let batch, targetBatch;
          try {
            batch = await acceptBatchInformeClosure(env,t,mid,owner,report);
            targetBatch = await reconcileBatchTargetMission(env,mid);
            if (!targetBatch.ok) throw new Error(targetBatch.code || "target_batch_reconcile_failed");
          }
          catch (e) { return json({ok:false,code:"closure_partial",mission:mid,resolved:false,local_resolved:true,proof_saved:true,inbox_updated:true,batch_updated:false,sync_required:true,proof_image:rawImage},502); }
          return json({ok:true,mission:mid,resolved:true,resumed:true,repaired_standalone:true,inbox_updated:true,proof_image:rawImage,batch,target_batch:targetBatch});
        }
        // El árbol A/B/C puede resolver el ticket al marcar su último paso con
        // prueba, antes de que Infra publique el informe z1. Ese orden es válido:
        // no reabre el ticket ni cambia un cierre, sólo completa las piezas que el
        // auto-reconcile no puede inventar. La excepción exige: misión de flota,
        // ausencia total de z1 y la MISMA prueba final ya sellada en el ticket o
        // en una tarea. Un cierre con z1 nunca entra aquí y continúa inmutable.
        const finalTask = !previous ? await env.DB.prepare(
          "SELECT image FROM mission_tasks WHERE mission_id=? AND image_kind='final' AND image IS NOT NULL AND image<>'' ORDER BY updated_at DESC LIMIT 1"
        ).bind(mid).first() : null;
        const sealedProof = t.proof_kind === "final" && t.proof_image ? t.proof_image : finalTask && finalTask.image;
        const repairAutoResolved = t.source === "fleet" && !previous && sealedProof === rawImage;
        if (repairAutoResolved) {
          const normImage = await validateProofImage(env, rawImage, url.origin);
          if (!normImage.value || normImage.value !== sealedProof) {
            return json({ ok:false, code:"closure_evidence_invalid", field:"image",
              error:"la prueba no coincide con la evidencia final validada del árbol", applied:false },400);
          }
          const inbox = await notifyFleetInformeClosure(env, t, mid, owner, report, sealedProof, runtime, host);
          if (!inbox.updated) return json({ok:false,code:"closure_partial",mission:mid,resolved:false,
            local_resolved:true,proof_saved:!!t.proof_image,inbox_updated:false,sync_required:true,proof_image:t.proof_image || null},502);
          const now = Date.now(), puntosCierre = await puntosDeAgenteAhora(env, t.assignee || actor.actor, t.loc);
          await env.DB.batch([
            env.DB.prepare("INSERT INTO mission_tasks(mission_id,code,title,status,owner,executor,report,image,image_kind,created_at,ended_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
              .bind(mid,"z1","Informe del agente","done",principalOwner,executorOwner,report,sealedProof,"final",now,now,now),
            env.DB.prepare("UPDATE tickets SET proof_image=?,proof_kind='final',agent_runtime=COALESCE(NULLIF(?,''),agent_runtime),agent_host=COALESCE(NULLIF(?,''),agent_host),points_end=COALESCE(points_end,?),points_start=COALESCE(points_start,?),updated_at=? WHERE id=? AND status='resolved'")
              .bind(sealedProof,runtime,host,puntosCierre,puntosCierre,now,mid),
            convergeParentTasksStmt(env,mid,now),
            env.DB.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)").bind(mid,now,"log",owner,"📝 Informe tras cierre automático: "+report.slice(0,240)),
            env.DB.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)").bind(mid,now,"proof",owner,"📸 Pantallazo final: "+proofLabel(sealedProof))
          ]);
          let batch, targetBatch;
          try {
            batch = await acceptBatchInformeClosure(env,t,mid,owner,report);
            targetBatch = await reconcileBatchTargetMission(env,mid);
            if (!targetBatch.ok) throw new Error(targetBatch.code || "target_batch_reconcile_failed");
          } catch (e) { return json({ok:false,code:"closure_partial",mission:mid,resolved:false,
            local_resolved:true,proof_saved:true,inbox_updated:true,batch_updated:false,sync_required:true,proof_image:sealedProof},502); }
          return json({ok:true,mission:mid,resolved:true,resumed:true,repaired_auto_resolved:true,
            inbox_updated:true,proof_image:sealedProof,batch,target_batch:targetBatch});
        }
        const sameClosure = t.proof_kind === "final" && t.proof_image === rawImage && previous &&
          previous.owner === principalOwner && previous.report === report && previous.image === rawImage && previous.image_kind === "final";
        if (!sameClosure) return json({ ok: false, code: "mission_closed", error: "la misión ya está cerrada y sólo admite reintentar exactamente el mismo cierre", status: t.status, applied: false }, 409);
        // El reintento existe justo para completar un cierre a medias: si quedó un
        // padre contradiciendo a sus hijas, aquí es donde se repara.
        await convergeParentTasksStmt(env, mid, Date.now()).run();
        const inbox = await notifyFleetInformeClosure(env, t, mid, owner, report, rawImage, runtime, host);
        if (!inbox.updated) return json({ ok: false, code: "closure_partial", mission: mid, resolved: false, local_resolved: true, proof_saved: true, inbox_updated: false, sync_required: true, proof_image: rawImage }, 502);
        let batch, targetBatch;
        try {
          batch = await acceptBatchInformeClosure(env, t, mid, owner, report);
          targetBatch = await reconcileBatchTargetMission(env, mid);
          if (!targetBatch.ok) throw new Error(targetBatch.code || "target_batch_reconcile_failed");
        }
        catch (e) { return json({ ok: false, code: "closure_partial", mission: mid, resolved: false, local_resolved: true, proof_saved: true, inbox_updated: inbox.updated, batch_updated: false, sync_required: true, proof_image: rawImage }, 502); }
        return json({ ok: true, mission: mid, resolved: true, resumed: true, inbox_updated: inbox.updated, proof_image: rawImage, batch, target_batch:targetBatch });
      }
      // Sólo después de autorizar al actor se toca una URL remota. Una cadena con
      // aspecto de imagen no vale: R2 se verifica por objeto y las externas por CT.
      const normImage = await validateProofImage(env, rawImage, url.origin);
      if (!normImage.value) {
        return json({ ok: false, field: "image", code: "closure_evidence_invalid", error: "image no válida: " + normImage.error, missing: ["final_image"], applied: false }, 400);
      }
      const image = normImage.value;
      const now = Date.now();
      // El espejo se confirma ANTES de la transacción D1. Si falla, no existe
      // auto-claim, informe, proof ni resolved parcial que bloquee el reintento.
      const inbox = await notifyFleetInformeClosure(env, t, mid, owner, report, image, runtime, host);
      if (!inbox.updated) return json({ ok: false, code: "closure_partial", mission: mid, resolved: false, local_resolved: false, proof_saved: false, inbox_updated: false, sync_required: true, proof_image: null }, 502);
      const puntosCierre = await puntosDeAgenteAhora(env, t.assignee || actor.actor, t.loc);
      const writes = await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO mission_tasks(mission_id,code,title,status,owner,executor,report,image,image_kind,created_at,ended_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) " +
          "ON CONFLICT(mission_id,code) DO UPDATE SET report=excluded.report,status='done',owner=excluded.owner,executor=COALESCE(excluded.executor,mission_tasks.executor),image=excluded.image,image_kind='final',ended_at=COALESCE(mission_tasks.ended_at,excluded.ended_at),updated_at=excluded.updated_at"
        ).bind(mid, "z1", "Informe del agente", "done", principalOwner, executorOwner, report, image, "final", now, now, now),
        env.DB.prepare(
          "UPDATE tickets SET status='resolved',resolved_at=COALESCE(resolved_at,?),proof_image=?,proof_kind='final',agent_runtime=COALESCE(NULLIF(?,''),agent_runtime),agent_host=COALESCE(NULLIF(?,''),agent_host),points_end=?,points_start=COALESCE(points_start,?),updated_at=? WHERE id=? AND status NOT IN ('resolved','cancelled')"
        ).bind(now, image, runtime, host, puntosCierre, puntosCierre, now, mid),
        env.DB.prepare("UPDATE mission_tasks SET status='done',report=COALESCE(NULLIF(TRIM(report),''),?),ended_at=COALESCE(ended_at,?),updated_at=? WHERE mission_id=? AND code!='z1' AND status!='done' AND status!='no_aplica' AND EXISTS(SELECT 1 FROM tickets WHERE id=? AND role='standalone-task')").bind(report,now,now,mid,mid),
        convergeParentTasksStmt(env, mid, now),
        env.DB.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)").bind(mid, now, "log", owner, "📝 Informe: " + report.slice(0, 240)),
        env.DB.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)").bind(mid, now, "proof", owner, "📸 Pantallazo final: " + proofLabel(image))
      ]);
      const localResolved = !!(writes && writes[1] && writes[1].meta && Number(writes[1].meta.changes) > 0);
      if (!localResolved) return json({ ok: false, code: "closure_partial", mission: mid, resolved: false, local_resolved: false, proof_saved: false, inbox_updated: inbox.updated, sync_required: true, proof_image: null }, 502);
      let batch, targetBatch;
      try {
        batch = await acceptBatchInformeClosure(env, t, mid, owner, report);
        targetBatch = await reconcileBatchTargetMission(env, mid);
        if (!targetBatch.ok) throw new Error(targetBatch.code || "target_batch_reconcile_failed");
      }
      catch (e) { return json({ ok: false, code: "closure_partial", mission: mid, resolved: false, local_resolved: true, proof_saved: true, inbox_updated: inbox.updated, batch_updated: false, sync_required: true, proof_image: image }, 502); }
      return json({ ok: true, mission: mid, resolved: true, cross_signed: false, inbox_updated: inbox.updated, proof_image: image, batch, target_batch:targetBatch });
    }
    // CANCELAR una misión: reconocer que NO se hará. No exige pantallazo (no se finge
    // trabajo, se retira). Marca el ticket cancelled + nota, y cancela el encargo del
    // bot-inbox para que no se re-inyecte ni resucite. (Carlos, 2026-07-21)
    if (url.pathname === "/fleet/cancel" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      const mid = await resolveFleetMissionReference(env, b.mission || b.id);
      const note = String(b.note || b.reason || "").slice(0, 300).trim();
      const by = String(b.by || "yokup").slice(0, 40);
      if (!mid) return json({ ok: false, error: "mission requerida" }, 400);
      const t = await env.DB.prepare("SELECT id,status,screen,source FROM tickets WHERE id=?").bind(mid).first();
      if (!t) return json({ ok: false, error: "la misión " + mid + " no existe" }, 404);
      const now = Date.now();
      const inbox = await notifyFleetAdministrativeCancellation(env, t, mid, by, note);
      if (!inbox.updated) return json({ ok:false, code:"cancel_reconciliation_failed", mission:mid,
        cancelled:false, local_cancelled:false, inbox_updated:false, sync_required:true }, 502);
      await env.DB.prepare("UPDATE tickets SET status='cancelled', note=?, updated_at=?, resolved_at=NULL WHERE id=?").bind(note || null, now, mid).run();
      await addEvent(env, mid, "log", by, "🗑 Eliminada" + (note ? ": " + note : "") + ".");
      return json({ ok: true, mission: mid, cancelled: true, local_cancelled:true,
        inbox_updated:inbox.updated, inbox_resolution:"administrative_cancel" });
    }
    // AVANCE POR PASOS visible: el agente marca su propia subtarea (a/b/c…) conforme
    // trabaja, para que el árbol se pinte SOLO y se vea la evolución. Igual que
    // /mission/<id>/task/<code>/status pero PÚBLICO (vía /fleet/*), porque los agentes
    // no cruzan la verja Google. El árbol recalcula si la misión arranca/concluye. (951)
    if (url.pathname === "/fleet/task-status" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      const mid = await resolveFleetMissionReference(env, b.mission || b.id);
      const code = String(b.code || "").toLowerCase().trim();
      if (!mid || !validTaskCode(code)) return json({ ok: false, error: "mission y code válidos requeridos" }, 400);
      const tk = await env.DB.prepare("SELECT id,source,proof_image,status,assignee,loc,created_at,live_shot,live_at,live_kind,live_surface,live_context,role,proof_kind FROM tickets WHERE id=?").bind(mid).first();
      if (!tk) return json({ ok: false, error: "la misión " + mid + " no existe" }, 404);
      // Igual que informe y progreso: primero identidad, después cualquier write.
      const actor = validateMissionActor(tk, b.owner || b.by);
      if (!actor.ok) return json({ ok: false, code: "owner_mismatch", error: actor.error, expected_assignee: actor.expected, received_owner: actor.actor, mission: mid, task_code: code, applied: false }, 403);
      if (tk.status === "resolved") {
        // Un standalone puede cerrar canónicamente en cualquiera de los dos órdenes:
        // informe→A o A→informe. El informe resuelve el ticket y deja A en done,
        // pero el cliente todavía debe poder converger su reporte/prueba sin reabrir
        // ni sobrescribir una misión terminal. La excepción es deliberadamente
        // estrecha: sólo A, done y la MISMA prueba final ya sellada en el ticket.
        const requestedReport = b.report == null ? "" : String(b.report);
        const requestedImage = normalizeProofImage(b.image).value;
        const cur = code === "a"
          ? await env.DB.prepare("SELECT * FROM mission_tasks WHERE mission_id=? AND code=?").bind(mid, code).first()
          : null;
        const principalOwner = reportAgentIdentity(tk.assignee, tk.loc) || tk.assignee;
        const compatible = tk.role === "standalone-task" && code === "a" && b.status === "done" &&
          requestedReport.length > 0 && requestedReport.length <= 2e3 && requestedReport.trim().length > 0 &&
          tk.proof_kind === "final" && !!tk.proof_image && requestedImage === tk.proof_image && !!cur &&
          (cur.status === "in_progress" || cur.status === "done") &&
          (!cur.owner || cur.owner === principalOwner || sameAgentFamily(cur.owner, tk.assignee)) &&
          (!cur.report || cur.report === requestedReport) &&
          (!cur.image || cur.image === requestedImage) &&
          (!cur.image_kind || cur.image_kind === "final");
        if (!compatible) return json({ ok: false, code: "mission_closed", error: "la misión ya está cerrada y sólo admite la convergencia exacta de A con su prueba final", status: tk.status, mission: mid, task_code: code, applied: false }, 409);
        const exact = cur.status === "done" && cur.owner === principalOwner &&
          cur.report === requestedReport && cur.image === requestedImage && cur.image_kind === "final";
        const row = exact ? cur : await setTaskStatus(env, mid, code, "done", requestedReport, actor.actor, requestedImage, "final");
        if (!row) return json({ ok: false, error: "no se pudo converger la tarea «a» de " + mid }, 500);
        return json({ ok: true, task: row, proof: requestedImage, fleet: null, converged: true, resolved: true, applied: !exact });
      }
      if (tk.status === "cancelled") return json({ ok: false, code: "mission_closed", error: "la misión ya está cerrada y sus tareas/pruebas no se sobrescriben", status: tk.status, mission: mid, task_code: code, applied: false }, 409);
      // Preflight estricto antes de validar imágenes, auto-reclamar el ticket o
      // sembrar planes. Reutilizar el informe ya guardado es válido; terminar sin
      // texto no lo es y debe dejar applied:false de verdad.
      if (b.status === "done" || b.status === TASK_NO_APLICA) {
        const before = await env.DB.prepare("SELECT report FROM mission_tasks WHERE mission_id=? AND code=?").bind(mid, code).first();
        const effectiveReport = b.report != null ? String(b.report) : String(before && before.report || "");
        if (!effectiveReport.trim()) {
          // Descartar un paso EXIGE motivo, y por eso el mensaje es distinto: un
          // «no aplicaba» sin explicación es indistinguible de uno abandonado, y
          // entonces el estado nuevo sólo serviría para vaciar árboles incómodos.
          // Quien lo descarta tiene que decir POR QUÉ no era trabajo de esta misión.
          const descarte = b.status === TASK_NO_APLICA;
          return json({ ok:false, code: descarte ? "motivo_required" : "report_required",
            error: descarte
              ? "no se puede descartar un paso sin motivo: di por qué no aplicaba a esta misión"
              : "no se puede terminar una tarea sin informe",
            mission:mid, task_code:code, applied:false }, 409);
        }
      }
      // 1) La prueba se comprueba después de autorizar al actor y antes de writes.
      let img = null;
      if (b.image != null && String(b.image).trim() !== "") {
        const norm = await validateProofImage(env, b.image, url.origin);
        if (!norm.value) return json({ ok: false, error: "image no válida: " + norm.error, field: "image", mission: mid, code, applied: false }, 400);
        img = norm.value;
      }
      // PREFLIGHT DE CIERRE sin efectos: una petición que completaría un árbol
      // existente debe demostrar proceso y prueba final ANTES del auto-claim,
      // del evento de inicio o de sembrar un plan. `applied:false` significa así
      // cero mutaciones de negocio, también cuando el ticket seguía `open`.
      let tasks = await listMissionTasks(env, mid);
      let cur = tasks.find((t) => t.code === code);
      let nextSt = cur && TASK_STATUS.includes(b.status) ? b.status : cur && cur.status;
      let cierraArbol = !!cur && tareaConcluida(nextSt) && tasks.every((t) => t.code === code || tareaConcluida(t));
      if (cierraArbol) {
        const processEvidence = validateMissionProcessEvidence(tk);
        if (!processEvidence.ok) return json({ ok:false, code:processEvidence.code, field:processEvidence.field,
          error:processEvidence.error, mission:mid, task_code:code, applied:false }, 400);
        if (!img && !(await hasMissionProof(env, mid))) {
          return json({
            ok: false,
            error: "falta la prueba: con esta tarea el árbol de " + mid + " queda al 100%, y una misión de flota no finaliza sin pantallazo del trabajo.",
            hint: "repite esta misma llamada añadiendo «image» (URL http(s) de la captura o data:image/…;base64), o cierra con POST /fleet/informe.",
            field: "image", code: "closure_evidence_missing", missing: ["final_image"], mission: mid, task_code: code, applied: false
          }, 400);
        }
      }
      // AUTO-CLAIM en el ORIGEN: marcar un paso ES trabajar. Una misión que seguía «open»
      // (Pendiente rezagado) pasa YA a in_progress al primer task-status, sin esperar a
      // que el reconciliador por árbol la promueva. Cura de raíz del dato. (FLT-990 b/c)
      if (tk.source === "fleet" && tk.status === "open") {
        const claimedAt = Date.now();
        const claimed = await env.DB.prepare("UPDATE tickets SET status='in_progress', started_at=COALESCE(started_at,?), updated_at=? WHERE id=? AND status='open'").bind(claimedAt, claimedAt, mid).run();
        // El Highscore necesita el primer hecho de inicio, no el updated_at mutable
        // del ticket. El auto-claim anterior cambiaba estado sin dejar esa prueba.
        if (!claimed || !claimed.meta || Number(claimed.meta.changes) > 0) {
          await addEvent(env, mid, "status", "yokup",
            "Estado → in_progress · primer avance de tarea");
        }
        tk.status = "in_progress";
      }
      // La misión puede no tener árbol todavía (los planes se generan al abrirla en el
      // navegador). Para que la evolución se vea DESDE EL PRIMER paso, se siembra aquí
      // el plan por defecto (sin IA, instantáneo). (951)
      if (!tasks.length && tk.source === "fleet") {
        await saveMissionPlan(env, mid, flattenSteps(defaultFleetPlan()));
        tasks = await listMissionTasks(env, mid);
      }
      cur = tasks.find((t) => t.code === code);
      if (!cur) return json({ ok: false, error: "la misión " + mid + " no tiene la tarea «" + code + "» en su plan" }, 404);
      // 2) EL RECHAZO SE EXPLICA (FLT-988 b3). Si este marcado deja el árbol al 100%
      // y no hay prueba por ningún lado, se responde 400 con el motivo y NO se aplica.
      // Degradar la misión a «en curso» sin decir nada era la respuesta por defecto y
      // dejaba el tablero mintiendo (FLT-982/983/984, rematadas a mano en D1).
      nextSt = TASK_STATUS.includes(b.status) ? b.status : cur.status;
      cierraArbol = tareaConcluida(nextSt) && tasks.every((t) => t.code === code || tareaConcluida(t));
      const row = await setTaskStatus(env, mid, code, b.status, b.report, actor.actor, img, cierraArbol ? "final" : "task", b.work_session);
      if (!row) return json({ ok: false, error: "no se pudo actualizar la tarea «" + code + "» de " + mid }, 500);
      if (row.error) return json({ ok:false, code:row.code, error:row.message,
        mission:mid, task_code:code, applied:false },409);
      // 3) Una prueba de PASO no se presenta como prueba FINAL de misión. Sólo la
      // captura adjunta al movimiento que completa el árbol asciende al ticket.
      if (img) {
        if (cierraArbol) {
          await env.DB.prepare("UPDATE tickets SET proof_image=?,proof_kind='final',updated_at=? WHERE id=?").bind(img, Date.now(), mid).run();
        }
        await addEvent(env, mid, "proof", actor.actor, (cierraArbol ? "📸 Pantallazo final de «" : "📷 Evidencia de tarea «") + code + "»: " + proofLabel(img));
      }
      const fleet = await fleetReconcileMission(env, mid);
      // CIERRE POR RESPALDO (FLT-989 b1): si el árbol cerró SIN «image» en esta
      // llamada pero hay captura en un paso anterior, la ficha se quedaría con el
      // logotipo de relleno. Se sube por el punto único, con el mismo criterio.
      if (!img && cierraArbol) await ascendMissionProof(env, mid);
      return json({ ok: true, task: row, proof: img, fleet });
    }
    // Ingesta UNIVERSAL de incidencias (Carlos, 2026-07-17): cualquier sistema,
    // monitor o agente reporta aquí y aparece en /incidencias. PÚBLICO (como
    // /fleet/informe). Body: {subject, resource, kind, project, severity, source,
    // detail, by}. Con {resolve:true, resource} cierra (recupera) la del recurso.
    if (url.pathname === "/incident" && req.method === "POST") {
      try {
        const b = await req.json().catch(() => ({}));
        if (b && b.resolve) {
          const rid = await resolveIncident(env, b.resource, b.by, b.detail);
          return json({ ok: true, resolved: rid });
        }
        if (!b || (!b.subject && !b.resource)) return json({ ok: false, error: "subject o resource requerido" }, 400);
        const id = await createIncident(env, b);
        return json({ ok: !!id, id });
      } catch (e) {
        return json({ ok: false, error: String(e && e.message || e), code:e && e.code || "incident_error" }, Number(e && e.status) || 500);
      }
    }
    if (url.pathname === "/fleet/plan" && req.method === "POST") {
      await ensureSchema(env);
      return json(await fleetPlanPending(env, url.searchParams.get("limit"), {
        mission: url.searchParams.get("mission") || "",
        skeleton: url.searchParams.get("skeleton") === "1"
      }));
    }
    // EL AGENTE ESCRIBE SU PROPIO ÁRBOL (Carlos, 2026-08-09). Carril público
    // /fleet/*, igual que task-status y por el mismo motivo: los agentes no
    // cruzan la verja Google. Añade las subtareas a1..c3 que hagan falta para
    // repartir el trabajo entre subagentes, y corrige los títulos que todavía
    // son el esqueleto de fábrica. Nunca borra: lo que ya tiene avance, informe
    // o prueba se respeta y se devuelve en `ignored` con su motivo.
    // Body { mission:"FLT-x", by:"SubMorfeoMacMini", tasks:[{code,title,owner}] }
    if (url.pathname === "/fleet/plan-tasks" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      const mid = await resolveFleetMissionReference(env, b.mission || b.id);
      if (!mid) return json({ ok: false, error: "mission requerida" }, 400);
      const tk = await env.DB.prepare("SELECT id,assignee,loc,status,role FROM tickets WHERE id=?").bind(mid).first();
      if (!tk) return json({ ok: false, error: "la misión " + mid + " no existe" }, 404);
      // Identidad ANTES de cualquier escritura, como en task-status e informe.
      const actor = validateMissionActor(tk, b.by || b.owner);
      if (!actor.ok) return json({ ok: false, code: "owner_mismatch", error: actor.error,
        expected_assignee: actor.expected, received_owner: actor.actor, mission: mid, applied: false }, 403);
      if (tk.status === "resolved" || tk.status === "cancelled") {
        return json({ ok: false, code: "mission_closed", mission: mid, status: tk.status, applied: false,
          error: "la misión ya está cerrada: su árbol no se reescribe" }, 409);
      }
      // Una tarea suelta no tiene árbol por definición (ensureFleetStandaloneTask
      // borra todo lo que no sea «a»): dárselo aquí sería sembrar filas que el
      // siguiente reconciliador barre, y el agente no entendería por qué.
      if (tk.role === "standalone-task") {
        return json({ ok: false, code: "standalone_task", mission: mid, applied: false,
          error: "una tarea suelta no lleva árbol a·b·c; si necesita pasos, dala de alta como misión" }, 409);
      }
      const arr = Array.isArray(b.tasks) ? b.tasks : [];
      if (!arr.length || arr.length > 12) {
        return json({ ok: false, error: "tasks: entre 1 y 12 (3 tareas a·b·c + 9 subtareas)", applied: false }, 400);
      }
      const r = await mergeMissionPlan(env, mid, arr, tk);
      if (r.added.length || r.retitled.length) {
        await addEvent(env, mid, "log", actor.actor, "Árbol ampliado por el agente" +
          (r.added.length ? " · añade " + r.added.join(", ") : "") +
          (r.retitled.length ? " · retitula " + r.retitled.join(", ") : ""));
      }
      return json({ ok: true, mission: mid, by: actor.actor,
        applied: r.added.length + r.retitled.length > 0,
        added: r.added, retitled: r.retitled, ignored: r.ignored,
        progress: tercios(r.tasks, tk.role === "standalone-task"), tasks: r.tasks });
    }
    // CARRIL DE AGENTE (abierto, como el resto de /fleet/*) para colgar una misión
    // HIJA de una misión MADRE existente — lo que por la web exige la verja Google
    // (FLT-990 b2). No crea misiones ni inventa agrupaciones: sólo enlaza dos que YA
    // existen. Body { child:"FLT-x", parent:"FLT-y" } cuelga x de y; parent:null la
    // desengancha y vuelve a plana.
    if (url.pathname === "/fleet/parent" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      try { return json(await fleetSetParent(env, b)); } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/fleet/reconcile" && req.method === "POST") {
      await ensureSchema(env);
      return json(await fleetReconcileAll(env));
    }
    // ── PROYECTOS ─────────────────────────────────────────────────────────────
    // Censo de proyectos y a qué máquinas/agentes toca cada uno. ABIERTO, en el
    // mismo carril que /fleet/* y /decisions y por el mismo motivo: los agentes
    // escriben desde el CLI y NO cruzan la verja de Google. El front de Equipo
    // lee y escribe por aquí igual que ellos.
    //   GET  /projects                  lista + asignaciones + misiones vivas
    //   POST /projects                  alta y edición (machines[]/agents[] reemplazan)
    //   POST /projects/delete           baja  {id}
    //   POST /projects/assign           asignar/quitar uno {project,kind,ref,remove?}
    //   POST /projects/order            orden de las fichas {ids:[...]} (arrastrar)
    //   POST /projects/importance       importancia compartida {project,importance:0..5}
    //   POST /projects/responsibles     responsables silicio/carbono del proyecto
    //   POST /projects/mission          proyecto de una misión {mission,project}
    //   GET  /projects/principal        declaraciones vigentes del día de Madrid
    //   POST /projects/principal        declara {agent,machine?,project,declared_by?,statement?}
    if (url.pathname === "/projects" && req.method === "GET") {
      try {
        const projects = await listProjects(env);
        const selectableTotal = projects.filter((project) => String(project.status || "activo").toLowerCase() !== "archivado").length;
        const noveltyRows = (await env.DB.prepare(PROJECT_NOVELTY_RECENT_SQL).all()).results || [];
        return json({ ok: true, day: madridDayKey(Date.now()), projects,
          principal_declarations: await listPrincipalProjectDeclarations(env),
          ...projectNoveltyContract(noveltyRows, selectableTotal) });
      }
      catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/projects" && req.method === "POST") {
      try {
        const b = await req.json().catch(() => ({}));
        const validTypes = validateProjectResponsibleTypes(b);
        if (!validTypes.ok) {
          return json({ ok: false, error: validTypes.field + " debe ser string" }, 400);
        }
        const r = await upsertProject(env, b);
        return json(r, r.ok ? 200 : (r.status || 400));
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/projects/importance" && req.method === "POST") {
      try {
        // La lectura del censo sigue abierta, pero priorizar un proyecto es una
        // decision humana persistente. El actor sale de la sesion Google; nunca
        // se confia en un `by` enviado por el cliente.
        const sess = await requireAuth(env, req);
        if (!sess) return json({ ok: false, error: "unauthorized" }, 401);
        await ensureSchema(env);
        const b = await req.json().catch(() => ({}));
        const projectId = String((b && b.project) || "").trim();
        if (!projectId) return json({ ok: false, error: "project requerido" }, 400);
        if (!Number.isInteger(b && b.importance) || b.importance < 0 || b.importance > 5) {
          return json({ ok: false, error: "importance debe ser un entero entre 0 y 5" }, 400);
        }
        if (!Number.isInteger(b && b.expected_importance) || b.expected_importance < 0 || b.expected_importance > 5) {
          return json({ ok: false, error: "expected_importance debe ser un entero entre 0 y 5" }, 400);
        }
        const previous = await env.DB.prepare("SELECT id,status,importance,updated_at,updated_by FROM projects WHERE id=?").bind(projectId).first();
        if (!previous) return json({ ok: false, error: "project no existe en el censo" }, 404);
        if (String(previous.status || "activo").toLowerCase() === "archivado") {
          return json({ ok: false, error: "project archivado" }, 409);
        }
        const current = Number.isInteger(Number(previous.importance)) ? Number(previous.importance) : 0;
        if (current === b.importance) {
          return json({ ok: true, changed: false, previous_importance: current,
            project: (await listProjects(env)).find((row) => row.id === projectId) || null });
        }
        if (current !== b.expected_importance) {
          return json({ ok: false, error: "importance conflict", current_importance: current,
            current_updated_at: Number(previous.updated_at) || 0, current_updated_by: previous.updated_by || "" }, 409);
        }
        const updatedAt = Date.now(), updatedBy = String(sess.email || sess.user || "web").slice(0, 120);
        const changed = await env.DB.prepare("UPDATE projects SET importance=?,updated_at=?,updated_by=? WHERE id=? AND COALESCE(importance,0)=? AND COALESCE(status,'activo')!='archivado'")
          .bind(b.importance, updatedAt, updatedBy, projectId, current).run();
        if (!changed || !changed.meta || Number(changed.meta.changes) !== 1) {
          const latest = await env.DB.prepare("SELECT id,status,importance,updated_at,updated_by FROM projects WHERE id=?").bind(projectId).first();
          if (!latest) return json({ ok: false, error: "project no existe en el censo" }, 404);
          if (String(latest.status || "activo").toLowerCase() === "archivado") return json({ ok: false, error: "project archivado" }, 409);
          const latestImportance = Number.isInteger(Number(latest.importance)) ? Number(latest.importance) : 0;
          if (latestImportance !== b.importance) return json({ ok: false, error: "importance conflict", current_importance: latestImportance,
            current_updated_at: Number(latest.updated_at) || 0, current_updated_by: latest.updated_by || "" }, 409);
        }
        return json({ ok: true, changed: true, previous_importance: current,
          project: (await listProjects(env)).find((row) => row.id === projectId) || null });
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/projects/responsibles" && req.method === "POST") {
      try {
        // Ambos responsables son datos de gobierno del proyecto. La lectura es
        // pública, pero la edición exige sesión y atribuye el cambio al usuario
        // autenticado, nunca a un `by` aportado por el navegador.
        const sess = await requireAuth(env, req);
        if (!sess) return json({ ok: false, error: "unauthorized" }, 401);
        await ensureSchema(env);
        const b = await req.json().catch(() => ({}));
        const validTypes = validateProjectResponsibleTypes(b);
        if (!validTypes.ok) {
          return json({ ok: false, error: validTypes.field + " debe ser string" }, 400);
        }
        const projectId = String((b && b.project) || "").trim();
        if (!projectId) return json({ ok: false, error: "project requerido" }, 400);
        const hasSilicon = Object.prototype.hasOwnProperty.call(b || {}, "silicon_responsible") ||
          Object.prototype.hasOwnProperty.call(b || {}, "primary_responsible");
        const hasCarbon = Object.prototype.hasOwnProperty.call(b || {}, "carbon_responsible");
        if (!hasSilicon && !hasCarbon) {
          return json({ ok: false, error: "silicon_responsible o carbon_responsible requerido" }, 400);
        }
        if (hasSilicon && !Object.prototype.hasOwnProperty.call(b || {}, "expected_silicon_responsible")) {
          return json({ ok: false, error: "expected_silicon_responsible requerido" }, 400);
        }
        if (hasCarbon && !Object.prototype.hasOwnProperty.call(b || {}, "expected_carbon_responsible")) {
          return json({ ok: false, error: "expected_carbon_responsible requerido" }, 400);
        }
        const previous = await env.DB.prepare("SELECT id,status,owner,carbon_responsible,updated_at,updated_by FROM projects WHERE id=?")
          .bind(projectId).first();
        if (!previous) return json({ ok: false, error: "project no existe en el censo" }, 404);
        if (String(previous.status || "activo").toLowerCase() === "archivado") {
          return json({ ok: false, error: "project archivado" }, 409);
        }
        const siliconInput = Object.prototype.hasOwnProperty.call(b || {}, "silicon_responsible")
          ? b.silicon_responsible : b.primary_responsible;
        const siliconResponsible = hasSilicon
          ? canonicalProjectAgentRef(siliconInput.trim().slice(0, 80))
          : canonicalProjectAgentRef(previous.owner || "");
        const carbonResponsible = hasCarbon
          ? projectCarbonResponsible(b.carbon_responsible)
          : projectCarbonResponsible(previous.carbon_responsible);
        if (/\p{Cc}/u.test(carbonResponsible)) {
          return json({ ok: false, error: "carbon_responsible contiene caracteres de control" }, 400);
        }
        const previousOwnerRaw = String(previous.owner || "");
        const previousCarbonRaw = String(previous.carbon_responsible || "");
        const previousSilicon = canonicalProjectAgentRef(previousOwnerRaw);
        const previousCarbon = projectCarbonResponsible(previousCarbonRaw);
        const expectedSilicon = hasSilicon
          ? canonicalProjectAgentRef(b.expected_silicon_responsible.trim().slice(0, 80))
          : previousSilicon;
        const expectedCarbon = hasCarbon ? projectCarbonResponsible(b.expected_carbon_responsible) : previousCarbon;
        const siliconChanged = hasSilicon && siliconResponsible !== previousSilicon;
        const carbonChanged = hasCarbon && carbonResponsible !== previousCarbon;
        if ((siliconChanged && expectedSilicon !== previousSilicon) ||
            (carbonChanged && expectedCarbon !== previousCarbon)) {
          return json({ ok: false, error: "responsibles conflict",
            current_silicon_responsible: previousSilicon,
            current_carbon_responsible: previousCarbon,
            current_updated_at: Number(previous.updated_at) || 0,
            current_updated_by: previous.updated_by || "" }, 409);
        }
        if (!siliconChanged && !carbonChanged) {
          return json({ ok: true, changed: false,
            project: (await listProjects(env)).find((row) => row.id === projectId) || null });
        }
        const updatedAt = Date.now(), updatedBy = String(sess.email || sess.user || "web").slice(0, 120);
        let changed;
        const historyStatement = carbonChanged && carbonResponsible
          ? env.DB.prepare(PROJECT_CARBON_ASSIGNMENT_UPSERT_IF_CURRENT_SQL)
            .bind(projectId, projectCarbonKey(carbonResponsible), carbonResponsible, updatedAt, updatedAt, projectId, carbonResponsible)
          : null;
        if (siliconChanged && carbonChanged) {
          const update = env.DB.prepare(PROJECT_BOTH_RESPONSIBLES_CAS_SQL)
            .bind(siliconResponsible, carbonResponsible, updatedAt, updatedBy, projectId, previousOwnerRaw, previousCarbonRaw);
          changed = historyStatement ? (await env.DB.batch([update, historyStatement]))[0] : await update.run();
        } else if (siliconChanged) {
          changed = await env.DB.prepare(PROJECT_SILICON_CAS_SQL)
            .bind(siliconResponsible, updatedAt, updatedBy, projectId, previousOwnerRaw).run();
        } else {
          const update = env.DB.prepare(PROJECT_CARBON_CAS_SQL)
            .bind(carbonResponsible, updatedAt, updatedBy, projectId, previousCarbonRaw);
          changed = historyStatement ? (await env.DB.batch([update, historyStatement]))[0] : await update.run();
        }
        if (!changed || !changed.meta || Number(changed.meta.changes) !== 1) {
          const latest = await env.DB.prepare("SELECT id,status,owner,carbon_responsible,updated_at,updated_by FROM projects WHERE id=?")
            .bind(projectId).first();
          if (!latest) return json({ ok: false, error: "project no existe en el censo" }, 404);
          if (String(latest.status || "activo").toLowerCase() === "archivado") {
            return json({ ok: false, error: "project archivado" }, 409);
          }
          const latestSilicon = canonicalProjectAgentRef(latest.owner || "");
          const latestCarbon = projectCarbonResponsible(latest.carbon_responsible);
          if ((!hasSilicon || latestSilicon === siliconResponsible) &&
              (!hasCarbon || latestCarbon === carbonResponsible)) {
            return json({ ok: true, changed: false, converged: true,
              project: (await listProjects(env)).find((row) => row.id === projectId) || null });
          }
          return json({ ok: false, error: "responsibles conflict",
            current_silicon_responsible: latestSilicon,
            current_carbon_responsible: latestCarbon,
            current_updated_at: Number(latest.updated_at) || 0,
            current_updated_by: latest.updated_by || "" }, 409);
        }
        return json({ ok: true, changed: true,
          previous_silicon_responsible: previousSilicon,
          previous_carbon_responsible: previousCarbon,
          project: (await listProjects(env)).find((row) => row.id === projectId) || null });
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/projects/agents/unassign" && req.method === "POST") {
      try {
        const sess = await requireAuth(env, req);
        if (!sess) return json({ ok: false, error: "unauthorized" }, 401);
        await ensureSchema(env);
        const b = await req.json().catch(() => ({}));
        const agent = projectCarbonResponsible(b && b.agent);
        const agentKey = projectCarbonKey(agent);
        const expected = Array.isArray(b && b.expected_projects)
          ? [...new Set(b.expected_projects.map((id) => String(id || "").trim()).filter(Boolean))].sort()
          : null;
        if (!agentKey) return json({ ok: false, error: "agent requerido" }, 400);
        if (!expected) return json({ ok: false, error: "expected_projects requerido" }, 400);
        if (b.confirmed !== true) return json({ ok: false, error: "confirmación explícita requerida" }, 400);
        const currentRows = ((await env.DB.prepare("SELECT id,name,carbon_responsible FROM projects WHERE COALESCE(status,'activo')!='archivado'").all()).results || [])
          .filter((row) => projectCarbonKey(row.carbon_responsible) === agentKey)
          .sort((a, z) => String(a.id).localeCompare(String(z.id)));
        const currentIds = currentRows.map((row) => String(row.id));
        if (JSON.stringify(currentIds) !== JSON.stringify(expected)) {
          return json({ ok: false, error: "agent assignments conflict", current_projects: currentIds }, 409);
        }
        const updatedAt = Date.now(), updatedBy = String(sess.email || sess.user || "web").slice(0, 120);
        const pairSql = currentRows.map(() => "(id=? AND COALESCE(carbon_responsible,'')=?)").join(" OR ");
        const pairValues = currentRows.flatMap((row) => [row.id, String(row.carbon_responsible || "")]);
        const changed = currentRows.length ? await env.DB.prepare(
          "UPDATE projects SET carbon_responsible='',updated_at=?,updated_by=? " +
          "WHERE COALESCE(status,'activo')!='archivado' AND (" + pairSql + ") " +
          "AND (SELECT COUNT(*) FROM projects WHERE COALESCE(status,'activo')!='archivado' AND (" + pairSql + "))=?"
        ).bind(updatedAt, updatedBy, ...pairValues, ...pairValues, currentRows.length).run() : null;
        if (currentRows.length && (!changed || !changed.meta || Number(changed.meta.changes) !== currentRows.length)) {
          return json({ ok: false, error: "agent assignments conflict" }, 409);
        }
        return json({ ok: true, changed: currentRows.length > 0, agent,
          orphaned_projects: currentRows.map((row) => ({ id: row.id, name: row.name || row.id })),
          projects: await listProjects(env) });
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/projects/principal" && req.method === "GET") {
      try {
        const day = String(url.searchParams.get("day") || madridDayKey(Date.now())).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ ok: false, error: "day debe ser YYYY-MM-DD" }, 400);
        return json({ ok: true, day, declarations: await listPrincipalProjectDeclarations(env, day) });
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/projects/principal" && req.method === "POST") {
      try {
        const result = await declarePrincipalProject(env, await req.json().catch(() => ({})));
        return json(result, result.ok ? 200 : (result.status || 400));
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/projects/decision" && req.method === "POST") {
      try {
        await ensureSchema(env);
        const b = await req.json().catch(() => ({}));
        const identity = resolveDecisionIdentity(b.agent, b.machine);
        if (!identity.ok) return json({ ok: false, error: identity.error, code: "exact_identity_required" }, 400);
        const idx = await projectIndex(env);
        const project = idx.get((b && b.project) || "");
        if (!project || project.status === "archivado") return json({ ok: false, error: "project activo requerido" }, 404);
        const linkedAgent = await env.DB.prepare("SELECT 1 ok FROM project_members WHERE project_id=? AND kind='agent' AND replace(lower(ref),'macmini','mini')=replace(lower(?),'macmini','mini') LIMIT 1")
          .bind(project.id, identity.agent).first();
        if (!linkedAgent) return json({ ok: false, error: "el agente no está asociado al proyecto", code: "agent_not_assigned" }, 400);
        const assignment = await exactDecisionProjectAssignment(env, identity.agent, identity.machine, project.id);
        if (!assignment) return json({ ok: false, error: "el equipo físico del agente no está asociado al proyecto", code: "team_not_assigned" }, 400);
        const live = await env.DB.prepare("SELECT id,deadline FROM decisions WHERE replace(lower(agent),'macmini','mini')=replace(lower(?),'macmini','mini') AND status='pending' AND deadline>? ORDER BY created_at DESC LIMIT 1")
          .bind(identity.agent, Date.now()).first();
        if (live) return json({ ok: true, existing: true, decision_id: live.id, deadline: live.deadline, url: DECIDE_URL });
        const options = await generateProjectImprovementOptions(env, project, identity);
        if (!options) return json({ ok: false, error: "la IA no devolvió 3 mejoras usables; reintenta" }, 502);
        const result = await openInitialMissionDecision(env, {
          question: "¿Qué mejora ejecutará " + identity.agent + " para " + (project.name || project.id) + "?",
          options: buildDecideDecisionOptions(options), recommended: 0, minutes: DECISION_MIN_DEFAULT,
          url: DECIDE_URL, surface: "dashboard", mission: "project-improvement:" + project.id,
          // La dispara una persona pulsando en el agente: cupo manual (6/hora).
          manual: true,
          agent: identity.agent, machine: identity.machine,
          project: project.name, project_slug: decisionProjectSlug(project.name), project_id: project.id, project_web: project.web || ""
        });
        if (!result.ok) return json({ ok: false, error: result.error, code: result.code }, result.status || 400);
        return json({ ok: true, decision_id: result.id, options, recommended: 0, deadline: result.deadline,
                      secondsLeft: Math.max(0, Math.round((result.deadline - Date.now()) / 1000)), project: result.project, url: DECIDE_URL });
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/projects/delete" && req.method === "POST") {
      try {
        await ensureSchema(env);
        const b = await req.json().catch(() => ({}));
        const id = projectSlug((b && b.id) || "");
        if (!id) return json({ ok: false, error: "id requerido" }, 400);
        const prev = await env.DB.prepare("SELECT id FROM projects WHERE id=?").bind(id).first();
        if (!prev) return json({ ok: false, error: "no existe" }, 404);
        await env.DB.prepare("DELETE FROM project_members WHERE project_id=?").bind(id).run();
        await env.DB.prepare("DELETE FROM project_launch_assignments WHERE project_id=?").bind(id).run();
        await env.DB.prepare("DELETE FROM projects WHERE id=?").bind(id).run();
        // Las misiones NO se quedan apuntando a un proyecto que ya no existe.
        await env.DB.prepare("UPDATE tickets SET project='',project_id=NULL WHERE project=? OR project_id=?").bind(id,id).run();
        return json({ ok: true, deleted: id });
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/projects/assign" && req.method === "POST") {
      try {
        await ensureSchema(env);
        const b = await req.json().catch(() => ({}));
        const idx = await projectIndex(env);
        const p = idx.get((b && b.project) || "");
        if (!p) return json({ ok: false, error: "project no existe en el censo" }, 404);
        const kind = String((b && b.kind) || "").toLowerCase() === "agent" ? "agent" : "machine";
        let ref = String((b && b.ref) || "").trim().slice(0, 80);
        if (!ref) return json({ ok: false, error: "ref requerido (id de máquina o de agente)" }, 400);
        if (kind === "agent" && b && b.machine) {
          const identity = resolveDecisionIdentity(ref,b && b.machine);
          if (!identity.ok) return json({ ok: false, error: identity.error, code: "exact_identity_required" }, 400);
          ref = identity.agent;
          if (!b.remove) {
            const teams = (await env.DB.prepare("SELECT ref FROM project_members WHERE kind='machine' AND project_id=?").bind(p.id).all()).results || [];
            if (!teams.some((row) => memberRefMatches("machine", row.ref, identity.machine))) {
              return json({ ok: false, error: "asigna primero el proyecto al equipo físico", code: "team_not_assigned" }, 400);
            }
          }
        } else if (kind === "agent" && !(b && b.remove)) {
          return json({ ok: false, error: "machine requerida para asociar un agente", code: "exact_identity_required" }, 400);
        }
        const beforeMembers = ((await env.DB.prepare("SELECT kind,ref FROM project_members WHERE project_id=? ORDER BY kind,ref").bind(p.id).all()).results || [])
          .map((item) => item.kind + ":" + item.ref).join("\n");
        if (b && b.remove) {
          if (kind === "agent" && canonicalProjectAgentRef(ref) === "OraculoMini") {
            await env.DB.prepare("DELETE FROM project_members WHERE project_id=? AND kind='agent' AND lower(ref) IN ('oraculomini','oraculomacmini')")
              .bind(p.id).run();
          } else {
            await env.DB.prepare("DELETE FROM project_members WHERE project_id=? AND kind=? AND ref=?").bind(p.id, kind, ref).run();
          }
          if (kind === "machine") {
            const launches=(await env.DB.prepare("SELECT machine FROM project_launch_assignments WHERE project_id=?").bind(p.id).all()).results||[];
            for(const launch of launches)if(memberRefMatches("machine",launch.machine,ref)){
              await env.DB.prepare("DELETE FROM project_launch_assignments WHERE project_id=? AND machine=?").bind(p.id,launch.machine).run();
            }
            const removedSuffix = machineSuffix(ref);
            if (removedSuffix) {
              const agents = (await env.DB.prepare("SELECT ref FROM project_members WHERE project_id=? AND kind='agent'").bind(p.id).all()).results || [];
              for (const row of agents) {
                if (resolveDecisionIdentity(row.ref, ref).ok) {
                  await env.DB.prepare("DELETE FROM project_members WHERE project_id=? AND kind='agent' AND ref=?").bind(p.id, row.ref).run();
                }
              }
            }
          }
        } else {
          await env.DB.prepare("INSERT OR IGNORE INTO project_members (project_id,kind,ref,added_at) VALUES (?,?,?,?)")
            .bind(p.id, kind, ref, Date.now()).run();
        }
        const afterMembers = ((await env.DB.prepare("SELECT kind,ref FROM project_members WHERE project_id=? ORDER BY kind,ref").bind(p.id).all()).results || [])
          .map((item) => item.kind + ":" + item.ref).join("\n");
        if (beforeMembers !== afterMembers) {
          await env.DB.prepare("UPDATE projects SET updated_at=?,updated_by='projects/assign' WHERE id=?")
            .bind(Date.now(), p.id).run();
        }
        return json({ ok: true, project: (await listProjects(env)).find((x) => x.id === p.id) || null });
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/projects/launch" && req.method === "POST") {
      try {
        await ensureSchema(env);
        const sess = await requireAuth(env, req);
        if (!sess) return json({ ok:false, error:"unauthorized" }, 401);
        let launch;
        try { launch = normalizeProjectLaunch(await req.json().catch(() => ({}))); }
        catch (error) { return json({ ok:false, error:String(error && error.message || "invalid-launch") }, 400); }
        const project = await env.DB.prepare("SELECT id,status FROM projects WHERE id=?").bind(launch.project).first();
        if (!project || project.status === "archivado") return json({ ok:false, error:"project activo requerido" }, 404);
        const machines = (await env.DB.prepare("SELECT ref FROM project_members WHERE project_id=? AND kind='machine'").bind(launch.project).all()).results || [];
        if (!machines.some((row) => memberRefMatches("machine", row.ref, launch.machine))) {
          return json({ ok:false, error:"asigna primero el proyecto al equipo físico", code:"team_not_assigned" }, 409);
        }
        const launchIdentity = principalAgentIdentity(launch.persona, launch.machine);
        if (!launchIdentity) return json({ ok:false, error:"identidad operativa exacta requerida", code:"exact_agent_required" }, 400);
        let dispatched;
        try { dispatched = await dispatchAgentStart(env, projectLaunchTarget(launch)); }
        catch (error) {
          const known = error instanceof AgentStopError;
          return json({ ok:false, error:known ? error.code : "project-launch-failed" }, known ? error.status : 500);
        }
        const now=Date.now(),by=String(sess.email || "").slice(0,120);
        await env.DB.prepare("INSERT INTO project_launch_assignments(project_id,machine,platform,runtime,model,selection,persona,session_id,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,machine) DO UPDATE SET platform=excluded.platform,runtime=excluded.runtime,model=excluded.model,selection=excluded.selection,persona=excluded.persona,session_id=excluded.session_id,updated_at=excluded.updated_at,updated_by=excluded.updated_by")
          .bind(launch.project,launch.machine,launch.host,launch.runtime,launch.model,launch.selection,launch.persona,launch.session_id,now,by).run();
        const principal = await declarePrincipalProject(env, {
          agent:launchIdentity.agent, machine:launch.machine, project:launch.project,
          declared_by:by || "Dashboard",
          statement:"Proyecto principal diario al lanzar " + launch.selection + " desde Dashboard"
        });
        if (!principal.ok) return json({ ok:false, error:principal.error, code:principal.code || "principal-project-failed" }, principal.status || 500);
        const saved=(await listProjects(env)).find((row)=>row.id===launch.project)||null;
        return json({ ok:true, launch, control:dispatched.result, principal_declaration:principal.declaration, project:saved }, dispatched.result.status === "already_running" ? 200 : 202);
      } catch (e) { return json({ ok:false, error:String(e) }, 500); }
    }
    // ORDEN de las fichas. Llega la lista COMPLETA de ids tal y como han quedado
    // en pantalla y se numera 0,1,2… Se ignoran los ids que no existan (una ficha
    // borrada desde otra pestaña no debe tumbar el guardado entero), y si no queda
    // ninguno válido no se toca nada: mejor dejar el orden viejo que vaciarlo.
    if (url.pathname === "/projects/order" && req.method === "POST") {
      try {
        await ensureSchema(env);
        const b = await req.json().catch(() => ({}));
        const ids = Array.isArray(b && b.ids) ? b.ids.map((x) => projectSlug(x)).filter(Boolean) : [];
        if (!ids.length) return json({ ok: false, error: "ids requerido (array)" }, 400);
        const vivos = new Set(((await env.DB.prepare("SELECT id FROM projects").all()).results || []).map((r) => r.id));
        const orden = [...new Set(ids)].filter((id) => vivos.has(id));
        if (!orden.length) return json({ ok: false, error: "ningún id del censo" }, 404);
        // updated_at NO se toca: colocar una ficha no es editarla, y si se tocara
        // la ficha diría «editada ahora» cada vez que alguien la arrastra.
        for (let i = 0; i < orden.length; i++) {
          await env.DB.prepare("UPDATE projects SET sort_order=? WHERE id=?").bind(i, orden[i]).run();
        }
        return json({ ok: true, order: orden, projects: await listProjects(env) });
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/projects/mission" && req.method === "POST") {
      try {
        await ensureSchema(env);
        const b = await req.json().catch(() => ({}));
        const mid = normalizeMissionReference(b && b.mission);
        if (!mid) return json({ ok: false, error: "mission requerida" }, 400);
        const t = await env.DB.prepare("SELECT id FROM tickets WHERE id=?").bind(mid).first();
        if (!t) return json({ ok: false, error: "la misión " + mid + " no existe" }, 404);
        const raw = String((b && b.project) || "").trim();
        // Al fijar (o quitar) el proyecto a mano se BORRA la marca de heredado: si
        // alguien ha entrado a decir cuál es, ya no es una suposición de otro día y
        // el asterisco de aviso dejaría de decir la verdad.
        if (!raw) {   // quitar el proyecto es legítimo: mejor vacío que inventado
          await env.DB.prepare("UPDATE tickets SET project='',project_id=NULL,project_inherited=0,project_inherited_from=NULL,updated_at=? WHERE id=?").bind(Date.now(), mid).run();
          return json({ ok: true, mission: mid, project: "", project_name: "" });
        }
        const idx = await projectIndex(env);
        const p = idx.get(raw);
        if (!p) return json({ ok: false, error: "el proyecto «" + raw + "» no está dado de alta; créalo en /equipo" }, 404);
        await env.DB.prepare("UPDATE tickets SET project=?,project_id=?,project_inherited=0,project_inherited_from=NULL,updated_at=? WHERE id=?").bind(p.id,p.id,Date.now(),mid).run();
        return json({ ok: true, mission: mid, project: p.id, project_name: p.name || p.id });
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    // CONTADORES DEL MENÚ SUPERIOR — PÚBLICO (agregados, sin dato sensible) para
    // que la barra los pinte en TODA página, con o sin sesión. Cache ~30s.
    if (url.pathname === "/menu/contadores" && req.method === "GET") {
      try {
        await ensureSchema(env);
        const c = await menuCounters(env);
        return new Response(JSON.stringify(Object.assign({ ok: true }, c)), {
          headers: { ...CORS, "content-type": "application/json", "Cache-Control": "public, max-age=30" }
        });
      } catch (e) {
        return json({ ok: false, error: String(e) }, 500);
      }
    }
    // El puente del equipo se autentica con el secreto del ejecutor y sale SIEMPRE
    // desde el Mac: no exponemos puertos PTY/tmux entrantes en la flota. Antes de
    // unirlo a una sala se vuelve a contrastar la identidad exacta con Presence.
    if (url.pathname === "/fleet/pty/bridge" && req.method === "GET") {
      const auth = await authorizeCliExecutor(env, req);
      if (!auth.ok) return json({ ok:false, code:auth.code, error:auth.error }, auth.status);
      let target;
      try {
        target = await verifyCliTerminalTarget(env, {
          machine:url.searchParams.get("machine"), persona:url.searchParams.get("persona"),
          runtime:url.searchParams.get("runtime"), host:url.searchParams.get("host"),
          session_id:url.searchParams.get("session_id"), pid:url.searchParams.get("pid"), action:"read"
        });
      } catch (error) {
        const known = error instanceof AgentStopError;
        return json({ ok:false, error:known ? error.code : "pty-target-invalid" }, known ? error.status : 500);
      }
      target = normalizeAgentStopTarget(target);
      return openPtyRoom(env, req, target, "bridge");
    }
    // El navegador no conoce el secreto de la flota: usa un ticket HMAC de 60 s,
    // ligado a UNA sesión viva y emitido desde una sesión Google del perímetro.
    if (url.pathname === "/fleet/pty/ws" && req.method === "GET") {
      if (!yokupViewerOrigin(req)) return json({ ok:false, error:"invalid-origin" }, 403);
      const ticket = await readSession(env, url.searchParams.get("ticket"));
      if (!ticket || ticket.scope !== "pty-view" || !ticket.target) return json({ ok:false, error:"invalid-pty-ticket" }, 401);
      let target;
      try { target = normalizeAgentStopTarget(ticket.target); }
      catch { return json({ ok:false, error:"invalid-pty-target" }, 401); }
      return openPtyRoom(env, req, target, "viewer");
    }
    if (url.pathname==='/fleet/agent/mode/transcript' && req.method==='GET') {
      await ensureHourlyModeSchema(env);
      const id=String(url.searchParams.get('run_id') || '');
      const work=/^HMODE-[a-f0-9]{28}$/.test(id)?await env.DB.prepare('SELECT transcript FROM fleet_hourly_work WHERE run_id=?').bind(id).first():null;
      if (!work?.transcript) return json({ok:false,error:'transcript_not_found'},404);
      const safe=work.transcript.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      return new Response('<!doctype html><html lang="es"><meta charset="utf-8"><title>Informe de investigación horaria</title><style>body{max-width:900px;margin:36px auto;padding:24px;font:17px system-ui;color:#15232e;background:#f7fafc}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.6 ui-monospace}h1{font-size:24px}</style><h1>Respuesta final del ejecutor · Yokup</h1><pre>'+safe+'</pre></html>',{headers:{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'",'cache-control':'no-store','x-robots-tag':'noindex'}});
    }
    if (["/fleet/agent/mode","/fleet/agent/mode/guard","/fleet/agent/mode/complete","/fleet/agent/mode/runs","/fleet/agent/mode/work"].includes(url.pathname)) {
      const session=await requireAuth(env,req);
      const executorAllowed=!session && url.pathname!=="/fleet/agent/mode" && (await authorizeCliExecutor(env,req)).ok;
      if (!session && !executorAllowed) return json({ok:false,error:'unauthorized'},401);
      await ensureSchema(env); await ensureHourlyModeSchema(env);
      try {
        if (url.pathname==='/fleet/agent/mode/work' && req.method==='POST') return json(await hourlyModeWork(env,await req.json()));
        if (url.pathname==='/fleet/agent/mode/guard' && req.method==='GET') {
          const hasTarget=executorAllowed || url.searchParams.has('machine');
          const target=hasTarget?normalizeModeTarget(Object.fromEntries(url.searchParams)):null;
          return json({ok:true,...await hourlyModeGuard(env,String(url.searchParams.get('run_id') || ''),Date.now(),target)});
        }
        if (url.pathname==='/fleet/agent/mode/runs' && req.method==='GET') {
          const id=String(url.searchParams.get('id') || '');
          const run=await env.DB.prepare('SELECT * FROM fleet_agent_mode_runs WHERE id=?').bind(id).first();
          const work=run?await env.DB.prepare('SELECT t.id,t.status,t.proof_image,t.proof_kind FROM fleet_hourly_work w JOIN tickets t ON t.id=w.mission_id WHERE w.run_id=?').bind(id).first():null;
          return run?json({ok:true,run,work}):json({ok:false,error:'run_not_found'},404);
        }
        if (url.pathname==='/fleet/agent/mode' && req.method==='GET') return json({ok:true,items:await hourlyModeInventory(env)});
        if (url.pathname==='/fleet/agent/mode' && req.method==='POST') {
          const body=await req.json();
          if (String(body.mode).toLowerCase()!=='manual') {
            const key=modeTargetKey(normalizeModeTarget(body)),support=(await hourlyModeInventory(env)).find(row=>row.identity_key===key);
            if (!support?.available_modes?.includes(String(body.mode).toLowerCase())) return json({ok:false,error:'consumer_unavailable'},409);
          }
          const item=await saveAgentMode(env,body,session.email,(...args)=>hourlyModeProject(env,...args));
          const enriched=(await hourlyModeInventory(env)).find(row=>row.identity_key===item.identity_key);
          return json({ok:true,item:enriched || item});
        }
        if (url.pathname==='/fleet/agent/mode/complete' && req.method==='POST') {
          const body=await req.json(),runId=String(body.run_id || ''),capsuleId=String(body.capsule_id || '');
          const run=await env.DB.prepare('SELECT * FROM fleet_agent_mode_runs WHERE id=?').bind(runId).first();
          if (!run || !['learning','training'].includes(run.mode)) return json({ok:false,error:'run_not_found'},404);
          const pref=await env.DB.prepare('SELECT * FROM fleet_agent_modes WHERE identity_key=?').bind(run.identity_key).first();
          if (session && String(pref?.requested_by || '').toLowerCase()!==String(session.email || '').toLowerCase()) return json({ok:false,error:'run_forbidden'},403);
          if (run.status==='completed') return run.mode==='training' || run.capsule_id===capsuleId?json({ok:true,reused:true,run}):json({ok:false,error:'already_completed'},409);
          if (!run.command_id || !['dispatched','awaiting_delivery','failed'].includes(run.status)) return json({ok:false,error:'run_not_dispatched'},409);
          if (run.mode==='training') {
            const completed=await completeHourlyTraining(env,run,pref,body);
            return json(completed,completed.ok?200:completed.status || 409);
          }
          const completionGuard=await hourlyModeGuard(env,runId);if (!completionGuard.allowed) return json({ok:false,error:completionGuard.reason},409);
          const assets=await stockIndexFresh(),capsule=assets.find(row=>String(row.id)===capsuleId);
          if (!capsule || String(capsule.type).toLowerCase()!=='capsula' || !(stockHasTags(capsule,[runId.replace(/^HMODE-/, '')]) || stockHasTags(capsule,[runId])) || String(capsule.comment || '').trim().length<120 || !/^https:\/\//.test(String(capsule.prompt || ''))) return json({ok:false,error:'capsule_not_verified'},422);
          let sourceUrl;try { sourceUrl=new URL(capsule.prompt); } catch { return json({ok:false,error:'capsule_source_invalid'},422); }
          if (sourceUrl.href.length>2048 || sourceUrl.username || sourceUrl.password || sourceUrl.port || !sourceUrl.hostname.includes('.') || /^[\d.]+$/.test(sourceUrl.hostname) || sourceUrl.hostname.includes(':') || /(?:\.local|\.internal|\.localhost)$/.test(sourceUrl.hostname)) return json({ok:false,error:'capsule_source_invalid'},422);
          const sourceResponse=await fetch(sourceUrl.href,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(10000)});
          if (!sourceResponse.ok) return json({ok:false,error:'capsule_source_unavailable'},422);
          const deliverable='https://www.pixeria.com/stock.html?highlight='+encodeURIComponent(capsuleId),now=Date.now();
          const previous=await env.DB.prepare('SELECT id FROM fleet_agent_mode_runs WHERE capsule_id=? AND id<>?').bind(capsuleId,runId).first();
          if (previous) return json({ok:false,error:'capsule_already_used'},409);
          const finalCompletionGuard=await hourlyModeGuard(env,runId);if (!finalCompletionGuard.allowed) return json({ok:false,error:finalCompletionGuard.reason},409);
          const changed=await env.DB.prepare("UPDATE fleet_agent_mode_runs SET status='completed',reason='capsule_verified',capsule_id=?,deliverable_url=?,updated_at=? WHERE id=? AND status IN ('dispatched','awaiting_delivery','failed') AND capsule_id IS NULL")
            .bind(capsuleId,deliverable,now,runId).run();
          if (!changed.meta?.changes) {
            const saved=await env.DB.prepare('SELECT * FROM fleet_agent_mode_runs WHERE id=?').bind(runId).first();
            return saved?.capsule_id===capsuleId?json({ok:true,reused:true,run:saved}):json({ok:false,error:'already_completed'},409);
          }
          await env.DB.prepare("UPDATE fleet_agent_modes SET status='completed',reason='capsule_verified' WHERE identity_key=? AND mode='learning'").bind(run.identity_key).run();
          await env.DB.prepare('DELETE FROM fleet_hourly_family_leases WHERE run_id=?').bind(runId).run();
          return json({ok:true,run_id:runId,capsule_id:capsuleId,deliverable_url:deliverable});
        }
        return json({ok:false,error:'method_not_allowed'},405);
      } catch (error) { return json({ok:false,error:String(error.code || error.message || 'mode_failed').slice(0,120)},Number(error.status) || 500); }
    }
    if (PROTECTED.has(url.pathname) || url.pathname.startsWith("/mission/")) {
      const sess = await requireAuth(env, req);
      if (!sess) return json({ error: "unauthorized" }, 401);
    }

    if (url.pathname === "/fleet/pty/ticket" && req.method === "POST") {
      const sess = await requireAuth(env, req);
      if (!sess) return json({ error:"unauthorized" }, 401);
      let body;
      try { body = await req.json(); }
      catch { return json({ ok:false, error:"bad-json" }, 400); }
      let target;
      try { target = await verifyCliTerminalTarget(env, { ...body, action:"read" }); }
      catch (error) {
        const known = error instanceof AgentStopError;
        return json({ ok:false, error:known ? error.code : "pty-target-invalid" }, known ? error.status : 500);
      }
      target = normalizeAgentStopTarget(target);
      const ticket = await makePtyTicket(env, sess.email, target);
      const wsProtocol = url.protocol === "http:" ? "ws:" : "wss:";
      return json({ ok:true, expires_in:60, target,
        url:`${wsProtocol}//${url.host}/fleet/pty/ws?ticket=${encodeURIComponent(ticket)}` });
    }

    // PARADA DE UNA SESIÓN DE AGENTE (FLT-1160): mando destructivo, siempre tras
    // el perímetro Google. Yokup no confía en la tarjeta que pintó el navegador:
    // vuelve a consultar el snapshot vivo de TELEGRAM y sólo reenvía si los seis
    // identificadores siguen describiendo UNA sesión de proceso exacta.
    // ── CONTROL DE CLIs ──────────────────────────────────────────────────────
    // Encender y apagar los CLI de la flota desde el Highscore (Carlos, 8-ago-2026).
    // Encaja con la regla 20: los CLI se lanzan y se matan, no viven residentes —
    // hasta ahora solo se encendian entrando a la maquina.
    if (url.pathname === "/fleet/cli" && req.method === "GET") {
      await ensureSchema(env);
      const vivos = (await env.DB.prepare("SELECT machine,cli,alive,pid,seen_at,desired,desired_command_id,desired_at FROM cli_state").all()).results || [];
      const ahora = Date.now();
      const items = CLI_CATALOGO.map((e) => {
        const st = vivos.find((v) => String(v.machine).toLowerCase() === e.machine.toLowerCase() && v.cli === e.cli);
        // Un latido viejo no dice que este apagado: dice que no se sabe. Son
        // cosas distintas y confundirlas haria "arrancar" algo que ya corre.
        const fresco = st && (ahora - Number(st.seen_at || 0)) < 90 * 1000;
        return { cli:e.cli, label:e.label, machine:e.machine, kind:e.kind || "cli",
                 alive: fresco ? !!st.alive : null,
                 pid: fresco ? (st.pid || null) : null,
                 seen_at: st ? Number(st.seen_at) : null,
                 desired: st && st.desired || "unknown",
                 desired_command_id: st && st.desired_command_id || null,
                 desired_at: st && st.desired_at ? Number(st.desired_at) : null,
                 converged: !!(fresco && (st.desired === "running" || st.desired === "stopped") &&
                   ((st.desired === "running") === !!st.alive)),
                 state: fresco ? (st.alive ? "vivo" : "parado") : "sin noticias" };
      });
      return json({ ok:true, items });
    }
    if (url.pathname === "/fleet/cli" && req.method === "POST") {
      await ensureSchema(env);
      // Crear la orden EXIGE sesion del perimetro: es el unico punto de control.
      const sess = await requireAuth(env, req);
      if (!sess) return json({ error:"unauthorized" }, 401);
      let b; try { b = await req.json(); } catch { return json({ ok:false, error:"bad-json" }, 400); }
      const target = canonicalCliTarget(b.machine, b.cli);
      const action = canonicalCliAction(b.action);
      if (!action) {
        return json({ ok:false, error:"action debe ser start, stop o mission" }, 400);
      }
      if (!target) return json({ ok:false, error:"cli no esta en la lista blanca" }, 403);
      const { machine, cli } = target;
      let detalle = null;
      if (action === "mission") {
        // A una SESION de terminal no se le manda texto: al otro lado hay una shell.
        if (cliTipo(cli) === "session") {
          return json({ ok:false, code:"mission_not_supported",
            error:"a una sesión de terminal no se le manda una misión: al otro lado hay una shell, no un agente" }, 400);
        }
        const texto = cliMisionTexto(b.text || b.mission || b.detail);
        if (!texto.ok) return json({ ok:false, field:"text", error:texto.error }, 400);
        detalle = texto.value;
      }
      const id = "CLI-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const quien = String((sess && (sess.email || sess.user)) || "perimetro");
      const ahora = Date.now(), desired = desiredStateForAction(action);
      if (desired) {
        // Un doble clic no crea dos arranques. Si cambia la intención, sólo queda
        // viva la orden más reciente y el ejecutor recibe su desired state.
        const latest = await env.DB.prepare(
          "SELECT id,action,created_at FROM cli_commands WHERE lower(machine)=lower(?) AND cli=? AND action IN ('start','stop') AND status='queued' ORDER BY created_at DESC,id DESC LIMIT 1"
        ).bind(machine, cli).first();
        if (latest && latest.action === action) {
          await env.DB.prepare(
            "INSERT INTO cli_state(machine,cli,alive,pid,seen_at,desired,desired_command_id,desired_at) VALUES(?,?,NULL,NULL,0,?,?,?) " +
            "ON CONFLICT(machine,cli) DO UPDATE SET desired=excluded.desired,desired_command_id=excluded.desired_command_id,desired_at=excluded.desired_at"
          ).bind(machine, cli, desired, latest.id, ahora).run();
          return json({ ok:true, id:latest.id, machine, cli, action, status:"queued", text:detalle,
            desired, deduplicated:true }, 202);
        }
        const statements = [
          env.DB.prepare(
            "UPDATE cli_commands SET status='superseded',updated_at=? WHERE lower(machine)=lower(?) AND cli=? AND status='queued' AND action IN ('start','stop')"
          ).bind(ahora, machine, cli),
          env.DB.prepare(
            "INSERT INTO cli_commands(id,machine,cli,action,status,requested_by,detail,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?,?,?)"
          ).bind(id, machine, cli, action, quien, detalle, ahora, ahora),
          env.DB.prepare(
            "INSERT INTO cli_state(machine,cli,alive,pid,seen_at,desired,desired_command_id,desired_at) VALUES(?,?,NULL,NULL,0,?,?,?) " +
            "ON CONFLICT(machine,cli) DO UPDATE SET desired=excluded.desired,desired_command_id=excluded.desired_command_id,desired_at=excluded.desired_at"
          ).bind(machine, cli, desired, id, ahora)
        ];
        if (typeof env.DB.batch === "function") await env.DB.batch(statements);
        else for (const statement of statements) await statement.run();
      } else {
        await env.DB.prepare("INSERT INTO cli_commands(id,machine,cli,action,status,requested_by,detail,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?,?,?)")
          .bind(id, machine, cli, action, quien, detalle, ahora, ahora).run();
      }
      return json({ ok:true, id, machine, cli, action, status:"queued", text:detalle,
        desired:desired || undefined }, 202);
    }
    // El ejecutor de cada maquina recoge SOLO ordenes ya autorizadas y reporta.
    // Tanto la recogida como el ACK exigen el Bearer compartido con el servicio
    // local; una web anónima ya no puede leer órdenes ni falsificar latidos.
    if (url.pathname === "/fleet/cli/pending" && req.method === "GET") {
      const auth = await authorizeCliExecutor(env, req);
      if (!auth.ok) return json({ ok:false, code:auth.code, error:auth.error }, auth.status);
      const machine = canonicalCliMachine(url.searchParams.get("machine"));
      if (!machine) return json({ ok:false, code:"invalid_machine", error:"machine fuera de la lista blanca" }, 400);
      await ensureSchema(env);
      // Una MISION caduca a los 10 minutos. Dos razones, las dos serias: una orden
      // de trabajo escrita a las 19:00 no puede aparecer tecleada en la sesion de
      // Grok a las 23:00, cuando el contexto ya no existe; y el texto deja de estar
      // dando vueltas por la cola. `start`/`stop` no caducan: encender algo sigue
      // queriendo decir lo mismo dentro de una hora.
      const CADUCA_MISION = 10 * 60 * 1000, ahora = Date.now();
      await env.DB.prepare(
        "UPDATE cli_commands SET status='expired',result_detail='caducada: nadie la recogió en 10 min',updated_at=? " +
        "WHERE lower(machine)=lower(?) AND status='queued' AND action='mission' AND created_at < ?"
      ).bind(ahora, machine, ahora - CADUCA_MISION).run();
      const raw = (await env.DB.prepare(
        // Start/stop en running vuelve a ofrecerse tras 60 s: ambas operaciones
        // son idempotentes. Una misión nunca se reinyecta automáticamente.
        "SELECT id,machine,cli,action,status,detail,created_at,updated_at FROM cli_commands " +
        "WHERE lower(machine)=lower(?) AND (status='queued' OR (status='running' AND action IN ('start','stop') AND updated_at<?)) " +
        "ORDER BY created_at,id LIMIT 50"
      ).bind(machine, ahora - 60 * 1000).all()).results || [];

      // Filtra cualquier fila histórica fuera del catálogo y conserva sólo la
      // intención de control más reciente por CLI. Las misiones mantienen orden.
      const valid = [], rejected = [], latestControl = new Map();
      for (const row of raw) {
        const target = canonicalCliTarget(row.machine || machine, row.cli);
        const action = canonicalCliAction(row.action);
        if (!target || target.machine !== machine || !action) {
          if (row.status === "queued") rejected.push(row.id);
          continue;
        }
        const item = { id:String(row.id), cli:target.cli, action, detail:row.detail || null,
          created_at:Number(row.created_at), status:String(row.status || "queued") };
        if (action === "start" || action === "stop") latestControl.set(target.cli, item);
        else valid.push(item);
      }
      const selectedIds = new Set([...latestControl.values()].map((item) => item.id));
      const superseded = raw.filter((row) => row.status === "queued" &&
        (row.action === "start" || row.action === "stop") && !selectedIds.has(String(row.id))).map((row) => String(row.id));
      const housekeeping = [];
      for (const id of rejected) housekeeping.push(env.DB.prepare(
        "UPDATE cli_commands SET status='rejected',result_detail='machine/cli/action fuera de catálogo',updated_at=? WHERE id=? AND status='queued'"
      ).bind(ahora, id));
      for (const id of superseded) housekeeping.push(env.DB.prepare(
        "UPDATE cli_commands SET status='superseded',result_detail='sustituida por la intención más reciente',updated_at=? WHERE id=? AND status='queued'"
      ).bind(ahora, id));
      for (const item of latestControl.values()) {
        const desired = desiredStateForAction(item.action);
        housekeeping.push(env.DB.prepare(
          "INSERT INTO cli_state(machine,cli,alive,pid,seen_at,desired,desired_command_id,desired_at) VALUES(?,?,NULL,NULL,0,?,?,?) " +
          "ON CONFLICT(machine,cli) DO UPDATE SET desired=excluded.desired,desired_command_id=excluded.desired_command_id,desired_at=excluded.desired_at"
        ).bind(machine, item.cli, desired, item.id, ahora));
        valid.push({ ...item, desired, redelivered:item.status === "running" });
      }
      if (housekeeping.length) {
        if (typeof env.DB.batch === "function") await env.DB.batch(housekeeping);
        else for (const statement of housekeeping) await statement.run();
      }
      valid.sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
      const states = (await env.DB.prepare(
        "SELECT cli,desired,desired_command_id,desired_at FROM cli_state WHERE lower(machine)=lower(?)"
      ).bind(machine).all()).results || [];
      return json({ ok:true, machine, items:valid.slice(0, 5), desired:states });
    }
    if (url.pathname === "/fleet/cli/ack" && req.method === "POST") {
      const auth = await authorizeCliExecutor(env, req);
      if (!auth.ok) return json({ ok:false, code:auth.code, error:auth.error }, auth.status);
      let body; try { body = await req.json(); } catch { return json({ ok:false, error:"bad-json" }, 400); }
      const ack = validateCliAckBody(body);
      if (!ack.ok) return json({ ok:false, code:ack.code, error:ack.error }, ack.status);
      await ensureSchema(env);
      const ahora = Date.now();
      let transition = null;
      if (ack.id) {
        const command = await env.DB.prepare(
          "SELECT id,machine,cli,action,status FROM cli_commands WHERE id=?"
        ).bind(ack.id).first();
        // 404 también para un id de otra máquina: el token no permite usar ACK
        // como oráculo para enumerar órdenes de compañeros.
        if (!command) return json({ ok:false, code:"command_not_found", error:"orden no encontrada" }, 404);
        const match = ackMatchesCommand(command, ack);
        if (!match.ok) {
          const status = match.code === "command_target_mismatch" ? 404 : 409;
          return json({ ok:false, code:match.code, error:match.error || "ACK incompatible con la orden" }, status);
        }
        transition = cliAckTransition(command.status, ack.status);
        if (!transition.ok) {
          return json({ ok:false, code:transition.code, status:transition.status,
            error:"la orden no admite esa transición" }, 409);
        }
      }
      const writes = [env.DB.prepare(
        "INSERT INTO cli_state(machine,cli,alive,pid,seen_at) VALUES(?,?,?,?,?) " +
        "ON CONFLICT(machine,cli) DO UPDATE SET alive=excluded.alive,pid=excluded.pid,seen_at=excluded.seen_at"
      ).bind(ack.machine, ack.cli, ack.alive ? 1 : 0, ack.pid, ahora)];
      // Repetir running renueva el lease de 60 s; repetir un terminal sólo late
      // cli_state y no reescribe el resultado ya sellado.
      if (ack.id && (!transition.duplicate || transition.status === "running")) {
        writes.push(env.DB.prepare(
          "UPDATE cli_commands SET status=?,result_detail=?,updated_at=? WHERE id=? AND status IN ('queued','running')"
        ).bind(transition.status, ack.detail, ahora, ack.id));
      }
      if (typeof env.DB.batch === "function") await env.DB.batch(writes);
      else for (const statement of writes) await statement.run();
      const state = await env.DB.prepare(
        "SELECT machine,cli,alive,pid,seen_at,desired,desired_command_id,desired_at FROM cli_state WHERE lower(machine)=lower(?) AND cli=?"
      ).bind(ack.machine, ack.cli).first();
      return json({ ok:true, command:ack.id ? { id:ack.id, status:transition.status,
        duplicate:!!transition.duplicate } : null, state:state || {
        machine:ack.machine, cli:ack.cli, alive:ack.alive, pid:ack.pid, seen_at:ahora
      } });
    }
    if (url.pathname === "/fleet/cli/terminal") {
      const sess = await requireAuth(env, req);
      if (!sess) return json({ error:"unauthorized" }, 401);
      await ensureSchema(env);
      if (req.method === "GET") {
        const commandId = String(url.searchParams.get("id") || "").trim();
        const audit = await env.DB.prepare(
          "SELECT id,requested_by FROM fleet_agent_commands WHERE upstream_command_id=? AND action IN ('terminal_read','terminal_write','terminal_focus','terminal_unfocus') ORDER BY created_at DESC LIMIT 1"
        ).bind(commandId).first();
        if (!audit || String(audit.requested_by || "").toLowerCase() !== String(sess.email || "").toLowerCase()) {
          return json({ ok:false, error:"terminal-command-not-found" }, 404);
        }
        try {
          const result = await readCliTerminalResult(env, commandId);
          await env.DB.prepare(
            "UPDATE fleet_agent_commands SET status=?,detail=?,updated_at=? WHERE id=?"
          ).bind(result.status, result.error || "", Date.now(), audit.id).run();
          return json(result);
        } catch (error) {
          const known = error instanceof AgentStopError;
          return json({ ok:false, error:known ? error.code : "terminal-status-failed" }, known ? error.status : 500);
        }
      }
      if (req.method !== "POST") return json({ ok:false, error:"method" }, 405);
      let body;
      try { body = await req.json(); }
      catch { return json({ ok:false, error:"bad-json" }, 400); }
      let terminal;
      try { terminal = normalizeCliTerminalRequest(body); }
      catch (error) {
        const known = error instanceof AgentStopError;
        return json({ ok:false, error:known ? error.code : "invalid-terminal-request" }, known ? error.status : 400);
      }
      const now = Date.now();
      const auditId = "terminal-" + now.toString(36) + "-" + crypto.randomUUID().slice(0, 8);
      await env.DB.prepare(
        "INSERT INTO fleet_agent_commands(id,action,machine,persona,runtime,host,session_id,pid,requested_by,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'requested',?,?)"
      ).bind(auditId, "terminal_" + terminal.action, terminal.machine, terminal.persona, terminal.runtime,
        terminal.host, terminal.session_id, terminal.pid, String(sess.email || "").slice(0, 120), now, now).run();
      try {
        const dispatched = await dispatchCliTerminal(env, terminal);
        await env.DB.prepare(
          "UPDATE fleet_agent_commands SET status=?,upstream_command_id=?,detail='',updated_at=? WHERE id=?"
        ).bind(dispatched.result.status, dispatched.result.command_id, Date.now(), auditId).run();
        return json({ ...dispatched.result, action:terminal.action }, 202);
      } catch (error) {
        const known = error instanceof AgentStopError;
        const code = known ? error.code : "terminal-command-failed";
        await env.DB.prepare(
          "UPDATE fleet_agent_commands SET status='rejected',detail=?,updated_at=? WHERE id=?"
        ).bind(code, Date.now(), auditId).run().catch(() => {});
        return json({ ok:false, error:code }, known ? error.status : 500);
      }
    }
    if (url.pathname === "/fleet/desktop/write" || url.pathname === "/fleet/desktop/capture" || url.pathname === "/fleet/desktop/verify-close") {
      const sess = await requireAuth(env, req);
      if (!sess) return json({ error:"unauthorized" }, 401);
      await ensureSchema(env);
      const capture = url.pathname === "/fleet/desktop/capture";
      const closeProof = url.pathname === "/fleet/desktop/verify-close";
      const auditAction = capture ? "desktop_capture" : closeProof ? "desktop_verify_close" : "desktop_write";
      if (req.method === "GET") {
        const commandId = String(url.searchParams.get("id") || "").trim();
        const audit = await env.DB.prepare(
          "SELECT id,requested_by FROM fleet_agent_commands WHERE upstream_command_id=? AND action=? AND lower(requested_by)=? ORDER BY created_at DESC LIMIT 1"
        ).bind(commandId,auditAction,String(sess.email || "").toLowerCase()).first();
        if (!audit) {
          return json({ ok:false, error:"desktop-command-not-found" }, 404);
        }
        try {
          const result = await readDesktopResult(env,commandId,capture?"capture":closeProof?"verify-close":"write");
          await env.DB.prepare("UPDATE fleet_agent_commands SET status=?,detail=?,updated_at=? WHERE id=?")
            .bind(result.status,result.error||"",Date.now(),audit.id).run();
          return json(result);
        } catch (error) {
          const known=error instanceof AgentStopError;
          return json({ok:false,error:known?error.code:"desktop-status-failed"},known?error.status:500);
        }
      }
      if (req.method !== "POST") return json({ok:false,error:"method"},405);
      let body;try{body=await req.json();}catch{return json({ok:false,error:"bad-json"},400);}
      const now=Date.now(),auditId=auditAction+"-"+now.toString(36)+"-"+crypto.randomUUID().slice(0,8);
      let target;
      try{target=normalizeAgentStopTarget(body);if(target.host!=="app")throw new AgentStopError("desktop-command-requires-app",400);}
      catch(error){const known=error instanceof AgentStopError;return json({ok:false,error:known?error.code:"invalid-desktop-target"},known?error.status:400);}
      await env.DB.prepare(
        "INSERT INTO fleet_agent_commands(id,action,machine,persona,runtime,host,session_id,pid,requested_by,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'requested',?,?)"
      ).bind(auditId,auditAction,target.machine,target.persona,target.runtime,target.host,target.session_id,target.pid,String(sess.email||"").slice(0,120),now,now).run();
      try{
        const dispatched=capture?await dispatchDesktopCapture(env,body):closeProof?await dispatchDesktopVerifyClose(env,body):await dispatchDesktopWrite(env,body);
        await env.DB.prepare("UPDATE fleet_agent_commands SET status=?,upstream_command_id=?,detail='',updated_at=? WHERE id=?")
          .bind(dispatched.result.status,dispatched.result.command_id,Date.now(),auditId).run();
        return json(dispatched.result,202);
      }catch(error){
        const known=error instanceof AgentStopError,code=known?error.code:"desktop-command-failed";
        await env.DB.prepare("UPDATE fleet_agent_commands SET status='rejected',detail=?,updated_at=? WHERE id=?")
          .bind(code,Date.now(),auditId).run().catch(()=>{});
        return json({ok:false,error:code},known?error.status:500);
      }
    }
    if (url.pathname === "/fleet/desktop/capture/clear" && req.method === "POST") {
      const sess=await requireAuth(env,req);if(!sess)return json({error:"unauthorized"},401);
      await ensureSchema(env);
      let body;try{body=await req.json();}catch{return json({ok:false,error:"bad-json"},400);}
      try{
        const target=await authorizeDesktopCaptureClear(env.DB,body,sess.email);
        return json(await clearDesktopCapture(env,target));
      }
      catch(error){const known=error instanceof AgentStopError;return json({ok:false,error:known?error.code:"desktop-capture-clear-failed"},known?error.status:500);}
    }
    if (url.pathname === "/fleet/agent/control") {
      const sess = await requireAuth(env, req);
      if (!sess) return json({ error:"unauthorized" }, 401);
      await ensureSchema(env);
      if (req.method === "GET") {
        const commandId = String(url.searchParams.get("id") || "").trim();
        const audit = await env.DB.prepare(
          "SELECT id,requested_by FROM fleet_agent_commands WHERE upstream_command_id=? AND action IN ('start','stop') ORDER BY created_at DESC LIMIT 1"
        ).bind(commandId).first();
        if (!audit || String(audit.requested_by || "").toLowerCase() !== String(sess.email || "").toLowerCase()) {
          return json({ ok:false, error:"agent-control-command-not-found" }, 404);
        }
        try {
          const result = await readAgentControlResult(env, commandId);
          await env.DB.prepare(
            "UPDATE fleet_agent_commands SET status=?,detail=?,updated_at=? WHERE id=?"
          ).bind(result.status, result.error || "", Date.now(), audit.id).run();
          return json(result);
        } catch (error) {
          const known = error instanceof AgentStopError;
          return json({ ok:false, error:known ? error.code : "agent-control-status-failed" }, known ? error.status : 500);
        }
      }
      if (req.method !== "POST") return json({ ok:false, error:"method" }, 405);
      let body;
      try { body = await req.json(); }
      catch { return json({ ok:false, error:"bad-json" }, 400); }
      const action = String(body && body.action || "").trim().toLowerCase();
      if (action !== "start" && action !== "stop") return json({ ok:false, error:"invalid-action" }, 400);
      let target;
      try { target = action === "start" ? normalizeAgentStartTarget(body) : normalizeAgentStopTarget(body); }
      catch (error) {
        const code = error instanceof AgentStopError ? error.code : "invalid-target";
        return json({ ok:false, error:code }, error instanceof AgentStopError ? error.status : 400);
      }
      const now = Date.now();
      const auditId = "control-" + now.toString(36) + "-" + crypto.randomUUID().slice(0, 8);
      await env.DB.prepare(
        "INSERT INTO fleet_agent_commands(id,action,machine,persona,runtime,host,session_id,pid,requested_by,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'requested',?,?)"
      ).bind(auditId, action, target.machine, target.persona, target.runtime, target.host, target.session_id, target.pid, String(sess.email || "").slice(0, 120), now, now).run();
      try {
        const dispatched = action === "start" ? await dispatchAgentStart(env, target) : await dispatchAgentStop(env, target);
        await env.DB.prepare(
          "UPDATE fleet_agent_commands SET status=?,upstream_command_id=?,detail='',updated_at=? WHERE id=?"
        ).bind(dispatched.result.status, dispatched.result.command_id, Date.now(), auditId).run();
        return json({ ...dispatched.result, action }, dispatched.result.status === "already_running" ? 200 : 202);
      } catch (error) {
        const known = error instanceof AgentStopError;
        const code = known ? error.code : "agent-control-failed";
        const status = known ? error.status : 500;
        await env.DB.prepare(
          "UPDATE fleet_agent_commands SET status='rejected',detail=?,updated_at=? WHERE id=?"
        ).bind(code, Date.now(), auditId).run();
        return json({ ok:false, error:code, action }, status);
      }
    }
    if (url.pathname === "/fleet/agent/stop") {
      if (req.method !== "POST") return json({ ok:false, error:"method" }, 405);
      const sess = await requireAuth(env, req);
      if (!sess) return json({ error:"unauthorized" }, 401);
      let body;
      try { body = await req.json(); }
      catch { return json({ ok:false, error:"bad-json" }, 400); }
      let target;
      try { target = normalizeAgentStopTarget(body); }
      catch (error) {
        const code = error instanceof AgentStopError ? error.code : "invalid-target";
        return json({ ok:false, error:code }, error instanceof AgentStopError ? error.status : 400);
      }
      await ensureSchema(env);
      const now = Date.now();
      const auditId = "stop-" + now.toString(36) + "-" + crypto.randomUUID().slice(0, 8);
      await env.DB.prepare(
        "INSERT INTO fleet_agent_commands(id,action,machine,persona,runtime,host,session_id,pid,requested_by,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'requested',?,?)"
      ).bind(auditId, "stop", target.machine, target.persona, target.runtime, target.host, target.session_id, target.pid, String(sess.email || "").slice(0, 120), now, now).run();
      try {
        const dispatched = await dispatchAgentStop(env, target);
        await env.DB.prepare(
          "UPDATE fleet_agent_commands SET status=?,upstream_command_id=?,detail='',updated_at=? WHERE id=?"
        ).bind(dispatched.result.status, dispatched.result.command_id, Date.now(), auditId).run();
        return json(dispatched.result, 202);
      } catch (error) {
        const known = error instanceof AgentStopError;
        const code = known ? error.code : "stop-command-failed";
        const status = known ? error.status : 500;
        await env.DB.prepare(
          "UPDATE fleet_agent_commands SET status='rejected',detail=?,updated_at=? WHERE id=?"
        ).bind(code, Date.now(), auditId).run().catch(() => {});
        return json({ ok:false, error:code }, status);
      }
    }

    // ── EQUIPO: puente de ESCRITURA hacia admira-fleet ───────────────────────
    // La fuente de verdad del equipo (fichas de máquina + personas de silicio)
    // es el worker admira-fleet, compartido con admira.live/control. Su escritura
    // exige FLEET_TOKEN, que NO puede viajar al navegador → yokup-rtc firma en su
    // nombre después de validar la sesión Google del perímetro (rutas PROTECTED).
    if (url.pathname === "/equipo/machine" || url.pathname === "/equipo/silicon") {
      if (req.method !== "POST") return json({ error: "method" }, 405);
      const destino = url.pathname === "/equipo/machine" ? "/machines/profile" : "/silicon";
      try {
        const body = await req.json();
        // borrado: {delete:true, id} → DELETE en el registro remoto
        const del = body && body.delete === true;
        const ruta = del
          ? (destino === "/silicon" ? "/silicon/" : "/machines/profile/") + encodeURIComponent(String(body.id || ""))
          : destino;
        const r = await env.FLEET_SVC.fetch(new Request(FLEET_API + ruta, {
          method: del ? "DELETE" : "POST",
          headers: { "content-type": "application/json", authorization: "Bearer " + env.FLEET_TOKEN,
                     // admira-fleet va tras Cloudflare y RECHAZA user-agents no navegador (error 1010)
                     "user-agent": "Mozilla/5.0 (compatible; yokup-rtc)" },
          body: del ? undefined : JSON.stringify(body)
        }));
        const d = await r.json().catch(() => ({}));
        return json(d, r.status);
      } catch (e) {
        return json({ ok: false, error: String(e) }, 500);
      }
    }
    if (url.pathname.startsWith("/mission/")) {
      try {
        return await missionRoute(req, env, url);
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/fleet/nudge" && req.method === "POST") {
      let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
      try { return json(await fleetNudge(env, b)); } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/turn") {
      try {
        const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${env.TURN_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ttl: 3600 })
        });
        return new Response(await r.text(), { headers: { ...CORS, "content-type": "application/json" } });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/incidents") {
      try {
        const r = await fetch("https://api.admira.store/signage/screens", { cf: { cacheTtl: 5 } });
        return new Response(await r.text(), { headers: { ...CORS, "content-type": "application/json" } });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/ai-triage") {
      const screen = url.searchParams.get("screen") || "una pantalla";
      const age = url.searchParams.get("age") || "?";
      const loc = url.searchParams.get("loc") || "";
      const text = await aiRun(env, `Eres el copiloto de soporte de Yokup (mantenimiento de pantallas DOOH). Incidencia: la pantalla "${screen}"${loc ? " en " + loc : ""} lleva ${age} segundos sin se\xF1al de emisi\xF3n (proof-of-play ca\xEDdo). Responde SOLO en espa\xF1ol, \xFAtil y concreto (m\xE1x 55 palabras), EXACTAMENTE en 3 l\xEDneas:
\u{1F50D} Causa probable: ...
\u{1F6E0}\uFE0F Acci\xF3n inmediata: ...
\u{1F477} T\xE9cnico: s\xED/no \u2014 motivo`, 170);
      return text ? json({ text }) : json({ error: "sin respuesta" }, 500);
    }
    if (url.pathname === "/tickets") {
      try {
        const scope = url.searchParams.get("scope") || "campo";
        // La bandeja de campo reconcilia pantallas; la de flota se nutre del sync
        // del bot-inbox (cron cada 2 min), no de las pantallas DOOH.
        if (scope !== "fleet") await reconcile(env);
        const limit = url.searchParams.get("limit"), offset = url.searchParams.get("offset");
        const filters = { day:url.searchParams.get("day") || "", project_id:url.searchParams.get("project_id") || "",
          state:url.searchParams.get("state") || "" };
        const page = await listTickets(env, scope, limit, offset, filters);
        if (!page.ok) return json({ error:page.error }, 400);
        const legacyStats = await stats(env, scope, filters);
        if (!legacyStats.ok && legacyStats.error) return json({ error:legacyStats.error }, 400);
        return json({ tickets:page.rows, stats:legacyStats, roster:ROSTER,
          visible_counts:page.visible_counts, universe:page.universe });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/tasks/all") {
      try {
        await ensureSchema(env);
        const scope = url.searchParams.get("scope") || "todas";
        if (url.searchParams.get("paginated") === "1") {
          const options = parseReportsPageOptions(url.searchParams);
          if (!options.ok) return json({ error:options.error, applied:false }, 400);
          return json(await listMissionReportsPage(env, scope, options));
        }
        const filters = parseAllTasksFilters(url.searchParams);
        if (!filters.ok) return json({ error:filters.error, applied:false }, 400);
        return json({ tasks: await listAllMissionTasks(env, scope, filters) });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/ticket") {
      try {
        await ensureSchema(env);
        const id = url.searchParams.get("id");
        const t = await env.DB.prepare(
          "SELECT t.*, f.inbox_id FROM tickets t LEFT JOIN fleet_ids f ON f.mission_id=t.id WHERE t.id=?"
        ).bind(id).first();
        if (!t) return json({ error: "not-found" }, 404);
        t.project_name = resolveProject(await projectIndex(env), t.project || "").name;
        await attachDisplayRefs(env, "mission", t, (row) => row.id, (row) => row.created_at);
        const { results } = await env.DB.prepare("SELECT * FROM events WHERE ticket_id=? ORDER BY id ASC").bind(id).all();
        return json({ ticket: t, events: results || [] });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/ticket/note" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        await addEvent(env, b.id, "note", b.author || "T\xE9cnico", String(b.text || "").slice(0, 2e3));
        await env.DB.prepare("UPDATE tickets SET updated_at=?, status=CASE WHEN status='open' THEN 'in_progress' ELSE status END WHERE id=?").bind(Date.now(), b.id).run();
        return json({ ok: true });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    // CAMBIO DE ESTADO EN BLOQUE (Carlos, 2026-07-17): varias/todas las misiones a la vez
    // desde yokup.com/misiones, con UN SOLO aviso al grupo (no uno por misión). Actualiza
    // los tickets + baja el estado a los encargos de flota en bloque (/bot-inbox/bulk-status).
    if (url.pathname === "/tickets/status" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map((x) => String(x)).filter(Boolean))] : [];
        const status = b.status;
        if (!ids.length || !["open", "in_progress", "resolved", "cancelled"].includes(status)) {
          return json({ ok: false, error: "ids (array) y status (open|in_progress|resolved|cancelled) requeridos" }, 400);
        }
        if (status === "resolved") {
          const missing = [];
          const batchMissions = [];
          for (const id of ids) {
            const t = await env.DB.prepare("SELECT source FROM tickets WHERE id=?").bind(id).first();
            if (t && t.source === "fleet" && !(await hasMissionProof(env, id))) missing.push(id);
            if (t && t.source === "decision-batch") batchMissions.push(id);
          }
          if (missing.length) return json({
            ok: false,
            error: "No se puede finalizar sin pantallazo del trabajo realizado",
            missing_proof: missing
          }, 409);
          if (batchMissions.length) return json({
            ok: false,
            error: "Una misión de cola exige evidencia y aceptación del Agente; ciérrala individualmente.",
            requires_acceptance: batchMissions
          }, 409);
        }
        const now = Date.now();
        const resolvedAt = status === "resolved" ? now : null;
        const author = String(b.author || "Misiones (bloque)").slice(0, 40);
        const fleetInboxIds = [];
        const targetBatches = [];
        let updated = 0;
        for (const id of ids) {
          await env.DB.prepare("UPDATE tickets SET status=?, updated_at=?, resolved_at=? WHERE id=?").bind(status, now, resolvedAt, id).run();
          await addEvent(env, id, "status", author, `Estado → ${status} (cambio en bloque)`);
          // La vía WEB sigue el MISMO criterio que la de agente (FLT-989 b2): al finalizar,
          // la prueba de respaldo asciende por el punto único (arriba ya se exigió, con
          // hasMissionProof, que la haya). Si no, la ficha saldría con el logotipo.
          if (status === "resolved") {
            await ascendMissionProof(env, id);
            const targetBatch = await reconcileBatchTargetMission(env, id);
            targetBatches.push(targetBatch);
          }
          // Nº de encargo REAL (fleet_ids → screen → FLT): el cambio en bloque tocaba
          // el encargo equivocado tras el reparto anticolisión. (FLT-990 c)
          const iid = await fleetEncargoId(env, id);
          if (iid) fleetInboxIds.push(iid);
          updated++;
        }
        // UNA sola notificación al grupo + estados de encargo actualizados en bloque.
        if (fleetInboxIds.length && env.TELEGRAM) {
          const inboxStatus = status === "resolved" ? "done" : status === "in_progress" ? "in_progress" : status === "cancelled" ? "cancelled" : "pending";
          try {
            await env.TELEGRAM.fetch(new Request("https://bot.yokup.com/api/bot-inbox/bulk-status", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ ids: fleetInboxIds, status: inboxStatus, by: author, note: "Cambio en bloque desde yokup.com/misiones." })
            }));
          } catch (e) {}
        }
        return json({ ok: true, updated, reconciliation_partial:targetBatches.some((row) => !row.ok), target_batches:targetBatches });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    // PERSONALIZACIÓN del perímetro (Carlos, 2026-07-19): iconos/fotos por
    // agente y por ordenador, editados desde AJUSTES → Panel de control.
    // Un único doc JSON en prefs('customize'): {agents:{slug:{icon,img}},
    // machines:{slug:{icon,img}}}. LECTURA abierta (la consumen las listas);
    // ESCRITURA con sesión del perímetro (requireAuth inline: PROTECTED es por
    // ruta y capa los dos métodos, y el GET debe seguir abierto).
    // ── IDEAS / OBJETIVOS ──────────────────────────────────────────────────
    // Bandeja de ideas que consume www.yokup.com/objetivos (yokup-site/ideas.html).
    // Tabla D1 `ideas` (ya existente): id,title,body,author,tag,status,created_at,
    // updated_at,mission_id. Estados: nueva|estudio|hecha|mision|descartada.
    // RESCATE FLT (23-jul-2026): estas 4 rutas eran un deploy-sin-versionar y un
    // redeploy del repo las pisó; reimplementadas contra la tabla real y versionadas.
    // Lectura y escritura abiertas a propósito (el panel escribe sin login), igual
    // que /decisions. CORS lo aporta json()/CORS global.
    // GET /council/ticks — bitácora del cron del Consejo (FLT-1016), pública, JSON,
    // últimos 20 huecos. Para auditar franjas perdidas: cada fila dice si el hueco de
    // 3h parió idea (ok) o falló (con su error recortado). Lectura abierta, igual que
    // /ideas. `ok` viaja como booleano y `slot` como ISO para leerlo de un vistazo.
    // HISTORIA DE FORMACIÓN — LECTURA PÚBLICA, igual que /council/ticks. El estado
    // («sabe 12») lo da /council/knowledge; esto da el ACONTECIMIENTO: qué silla
    // creció, cuánto y cuándo. Es lo que convierte «se le ha formado» en algo que se
    // puede mirar en yokup en vez de deducirlo comparando dos capturas del contador.
    // La cápsula de la hora. PÚBLICA a propósito: la consume admira.academy, que no
    // tiene perímetro ni sesión. No expone nada que no esté ya publicado en el Stock.
    // Se dispara aquí además de en la rutina: si el sitio pregunta a las HH:00:03 y
    // todavía no hubo tráfico, la hora se abre con esa misma visita.
    // EL SELLO DEL WORKER (Morfeo, 2026-08-09). El Webmaster daba «sin portada» a
    // yokup-rtc porque un worker no tiene index.html donde poner el <meta>. Pero sí
    // puede DECIRLO: esta ruta es su portada a efectos de la norma 07 y 08, con el
    // mismo contrato que un version.json de Pages. Lo escribe el deploy, no se
    // teclea: si no hay sello, se dice, en vez de inventarse uno.
    if (url.pathname === "/version.json" && req.method === "GET") {
      return json(SELLO_WORKER && SELLO_WORKER.version
        ? SELLO_WORKER
        : { version:null, error:"este worker se publicó sin sellar: deploy.sh escribe src/version-stamp.json" });
    }
    if (url.pathname === "/academy/capsula" && req.method === "GET") {
      try {
        const r = await runAcademyCapsuleTick(env);
        const historia = ((await env.DB.prepare(
          "SELECT * FROM academy_capsulas ORDER BY hour_start DESC LIMIT 12"
        ).all()).results || []).map(academyCapsuleRow);
        return json({ ok:true, capsula:r.capsula, nueva:r.nueva, status:r.status,reason:r.reason,historia });
      } catch (e) { return json({ ok:false, error:String(e) }, 500); }
    }
    // BUZÓN DE SMITH — lectura pública de trabajo no sensible. El CLI se lanza,
    // recoge como máximo una franja actual o adelantada y se apaga al entregar.
    // No hay claim mutable: el lock local impide dos ejecuciones en este equipo y
    // el cierre verificado/idempotente hace inocuo cualquier reintento.
    if (url.pathname === "/academy/capsula/smith/pending" && req.method === "GET") {
      try {
        if (!legacyAcademyAvailability().allowed) { await runAcademyCapsuleTick(env); return json({ok:true,job:null,...legacyAcademyAvailability()}); }
        await runAcademyCapsuleTick(env);
        await ensureAcademyCapsuleSchema(env);
        const currentHour = Math.floor(Date.now() / ACADEMY_HORA_MS) * ACADEMY_HORA_MS;
        const row = await env.DB.prepare(
          "SELECT * FROM academy_capsulas WHERE hour_start>=? AND hour_start<=? AND COALESCE(smith_status,'pending')!='verified' ORDER BY hour_start ASC LIMIT 1"
        ).bind(currentHour - ACADEMY_HORA_MS,currentHour + ACADEMY_HORA_MS).first();
        return json({ok:true,job:academyCapsuleRow(row)});
      } catch (e) { return json({ok:false,error:String(e)},500); }
    }
    // Feedback operativo para el Coach. La lectura es pública y la escritura sólo
    // puede mover una franja viva por el vocabulario cerrado de etapas. No concede
    // puntos ni puede marcarla verificada: esa transición sigue ocurriendo
    // exclusivamente en /result después de releer el índice público de Pixeria.
    if (url.pathname === "/academy/capsula/smith/progress" && req.method === "GET") {
      try {
        await runAcademyCapsuleTick(env);
        await ensureAcademyCapsuleSchema(env);
        const raw = url.searchParams.get("hourStart");
        const hourStart = raw === null ? Math.floor(Date.now() / ACADEMY_HORA_MS) * ACADEMY_HORA_MS : Number(raw);
        if (!Number.isInteger(hourStart) || hourStart % ACADEMY_HORA_MS !== 0) return json({ok:false,error:"Franja no válida"},400);
        const row = await env.DB.prepare("SELECT * FROM academy_capsulas WHERE hour_start=?").bind(hourStart).first();
        const latest = await env.DB.prepare("SELECT * FROM academy_capsulas WHERE smith_status='verified' ORDER BY COALESCE(smith_updated_at,at) DESC LIMIT 1").first();
        return json({ok:true,capsula:academyCapsuleRow(row),latest:academyCapsuleRow(latest)});
      } catch (e) { return json({ok:false,error:String(e)},500); }
    }
    // HIGHSCORE DE ACADEMY — feed público mínimo y autoritativo. Sólo expone
    // cápsulas que Yokup ya verificó contra Pixeria; nunca estados pendientes,
    // aplicaciones privadas ni identificadores de navegador.
    if (url.pathname === "/academy/highscore/capsulas" && req.method === "GET") {
      try {
        const items = await academyCapsuleHighscore(env);
        return json({ok:true,source:"yokup",items,total:items.length,builtAt:new Date().toISOString()});
      } catch (e) { return json({ok:false,error:String(e)},500); }
    }
    if (url.pathname === "/academy/capsula/smith/progress" && req.method === "POST") {
      try {
        if (Number(req.headers.get("content-length") || 0) > 1200) return json({ok:false,error:"Solicitud demasiado grande"},413);
        const result = await updateSmithCapsuleProgress(env,await req.json().catch(() => null));
        if (!result.ok) return json({ok:false,error:result.error},result.status || 400);
        return json({ok:true,reused:Boolean(result.reused),capsula:academyCapsuleRow(result.row)});
      } catch (e) { return json({ok:false,error:String(e)},500); }
    }
    // La entrega no se cree al cliente: Yokup vuelve al índice público de Pixeria y
    // exige vídeo YouTube + #formacion + etiqueta de la silla + cápsula enlazada.
    // Por eso esta escritura puede ser pública sin permitir inventar conocimiento.
    if (url.pathname === "/academy/capsula/smith/result" && req.method === "POST") {
      try {
        if (Number(req.headers.get("content-length") || 0) > 2000) return json({ok:false,error:"Solicitud demasiado grande"},413);
        const body = await req.json().catch(() => null);
        const result = await verifySmithCapsuleResult(env, body);
        if (!result.ok) return json({ok:false,error:result.error},result.status || 400);
        return json({ok:true,reused:Boolean(result.reused),capsula:academyCapsuleRow(result.row)});
      } catch (e) { return json({ok:false,error:String(e)},500); }
    }
    // COACH DE LA ACADEMIA — la escritura llega servidor-a-servidor desde Pages y
    // usa un secreto que nunca se entrega al navegador. Yokup vuelve a derivar la
    // franja, dimensión y lección: el cliente sólo aporta identidad y aplicación.
    // La clave primaria hace que un reintento sea idempotente. La lectura pública
    // omite deliberadamente el texto de aplicación, que puede contener contexto de
    // una persona de carbono.
    if (url.pathname === "/academy/coach/launch" && req.method === "POST") {
      try {
        const token = String(env.ACADEMY_COACH_TOKEN || "");
        const supplied = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
        if (!token) return json({ok:false,error:"Coach no configurado"}, 503);
        if (supplied !== token) return json({ok:false,error:"unauthorized"}, 401);
        const body = await req.json().catch(() => null);
        const audience = String(body && body.audience || "").toLowerCase();
        if (!COACH_AUDIENCES.has(audience)) return json({ok:false,error:"Audiencia no válida"}, 400);
        if (!legacyAcademyAvailability().allowed) { await runAcademyCapsuleTick(env); return json({ok:false,error:'consumer_unverified',...legacyAcademyAvailability()},409); }
        const coachNow = Date.now();
        const targetAt = (Math.floor(coachNow / COACH_HOUR) + 1) * COACH_HOUR;
        // El botón manual no inventa otra rueda: adelanta exactamente la cápsula
        // canónica de la próxima hora, incluida su silla y ventana puntuable.
        const capsuleResult = await runAcademyCapsuleTick(env, targetAt);
        const capsule = capsuleResult && capsuleResult.capsula;
        if (!capsule || !capsule.seat) return json({ok:false,error:"Yokup no pudo resolver la próxima cápsula"}, 502);
        const valid = validateCoachLaunch({audience,counselor:capsule.seat}, coachNow);
        if (!valid.ok) return json({ok:false,error:valid.error}, valid.status);
        await ensureAcademyCoachSchema(env);
        let row = await env.DB.prepare("SELECT * FROM academy_coach_launches WHERE launch_id=?").bind(valid.launchId).first();
        if (row) return json({ok:true,reused:true,registry:"academy-coach",capsula:capsule,ventana:capsuleResult.ventana || null,...academyCoachLaunchPublicRow(row)});
        const launchedAt = Date.now();
        await env.DB.prepare("INSERT OR IGNORE INTO academy_coach_launches (launch_id,audience,counselor,target_slot_id,dimension,lesson_id,launched_at) VALUES (?,?,?,?,?,?,?)")
          .bind(valid.launchId,valid.audience,valid.counselor,valid.targetSlotId,valid.dimension,valid.lessonId,launchedAt).run();
        row = await env.DB.prepare("SELECT * FROM academy_coach_launches WHERE audience=? AND counselor=? AND target_slot_id=?")
          .bind(valid.audience,valid.counselor,valid.targetSlotId).first();
        return json({ok:true,reused:false,registry:"academy-coach",capsula:capsule,ventana:capsuleResult.ventana || null,...academyCoachLaunchPublicRow(row)});
      } catch (e) { return json({ok:false,error:String(e)}, 500); }
    }
    if (url.pathname === "/academy/coach/completion" && req.method === "POST") {
      try {
        const token = String(env.ACADEMY_COACH_TOKEN || "");
        const supplied = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
        if (!token) return json({ ok:false, error:"Coach no configurado" }, 503);
        if (supplied !== token) return json({ ok:false, error:"unauthorized" }, 401);
        const body = await req.json().catch(() => null);
        await ensureAcademyCoachSchema(env);
        const coachNow = Date.now();
        const currentSlot = Math.floor(coachNow / (60 * 60 * 1000));
        const requestedSlot = Number(body && body.slotId);
        const manualLaunch = requestedSlot === currentSlot + 1 && await env.DB.prepare(
          "SELECT launch_id FROM academy_coach_launches WHERE audience=? AND counselor=? AND target_slot_id=?"
        ).bind(String(body && body.audience || "").toLowerCase(),String(body && body.counselor || "").toLowerCase(),requestedSlot).first();
        const valid = validateCoachCompletion(body, coachNow, {allowNextSlot:Boolean(manualLaunch)});
        if (!valid.ok) return json({ ok:false, error:valid.error }, valid.status);
        let row = await env.DB.prepare("SELECT * FROM academy_coach_completions WHERE event_id=?").bind(valid.eventId).first();
        if (row) return json({ ok:true, reused:true, registry:"academy-coach", ...academyCoachPublicRow(row) });
        const completedAt = Date.now();
        await env.DB.prepare("INSERT OR IGNORE INTO academy_coach_completions (event_id,audience,counselor,slot_id,dimension,lesson_id,application,completed_at) VALUES (?,?,?,?,?,?,?,?)")
          .bind(valid.eventId,valid.audience,valid.counselor,valid.slotId,valid.dimension,valid.lessonId,valid.application,completedAt).run();
        row = await env.DB.prepare("SELECT * FROM academy_coach_completions WHERE audience=? AND counselor=? AND slot_id=?")
          .bind(valid.audience,valid.counselor,valid.slotId).first();
        return json({ ok:true, reused:false, registry:"academy-coach", ...academyCoachPublicRow(row) });
      } catch (e) { return json({ ok:false, error:String(e) }, 500); }
    }
    if (url.pathname === "/academy/coach/health" && req.method === "GET") {
      try {
        const token = String(env.ACADEMY_COACH_TOKEN || "");
        const supplied = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
        if (!token) return json({ ok:false, error:"Coach no configurado" }, 503);
        if (supplied !== token) return json({ ok:false, error:"unauthorized" }, 401);
        await ensureAcademyCoachSchema(env);
        return json({ ok:true, registry:"academy-coach", checkedAt:new Date().toISOString() });
      } catch (e) { return json({ ok:false, error:String(e) }, 500); }
    }
    if (url.pathname === "/academy/coach/completions" && req.method === "GET") {
      try {
        await ensureAcademyCoachSchema(env);
        const audience = String(url.searchParams.get("audience") || "").toLowerCase();
        const counselor = String(url.searchParams.get("counselor") || "").toLowerCase();
        const clauses = [], binds = [];
        if (audience) { clauses.push("audience=?"); binds.push(audience); }
        if (counselor) { clauses.push("counselor=?"); binds.push(counselor); }
        const query = "SELECT event_id,audience,counselor,slot_id,dimension,lesson_id,completed_at FROM academy_coach_completions" + (clauses.length ? " WHERE " + clauses.join(" AND ") : "") + " ORDER BY completed_at DESC LIMIT 200";
        const result = await env.DB.prepare(query).bind(...binds).all();
        return json({ ok:true, completions:(result.results || []).map(academyCoachPublicRow) });
      } catch (e) { return json({ ok:false, error:String(e) }, 500); }
    }
    if (url.pathname === "/academy/coach/source" && req.method === "POST") {
      try {
        const token = String(env.ACADEMY_COACH_TOKEN || "");
        const supplied = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
        if (!token) return json({ok:false,error:"Coach no configurado"},503);
        if (supplied !== token) return json({ok:false,error:"unauthorized"},401);
        if (Number(req.headers.get("content-length") || 0) > 2200) return json({ok:false,error:"Solicitud demasiado grande"},413);
        const body = await req.json().catch(() => null);
        const result = await verifyAcademyCoachSource(env, body);
        if (!result.ok) return json({ok:false,error:result.error},result.status || 400);
        return json({ok:true,reused:Boolean(result.reused),registry:"academy-coach-source",source:academyCoachSourcePublicRow(result.row)});
      } catch (e) { return json({ok:false,error:String(e)},500); }
    }
    if (url.pathname === "/academy/coach/sources" && req.method === "GET") {
      try {
        await ensureAcademyCoachSchema(env);
        const audience = String(url.searchParams.get("audience") || "").toLowerCase();
        const counselor = String(url.searchParams.get("counselor") || "").toLowerCase();
        if (audience && !COACH_AUDIENCES.has(audience)) return json({ok:false,error:"Audiencia no válida"},400);
        if (counselor && !COUNCIL[counselor]) return json({ok:false,error:"Consejero no válido"},400);
        const clauses = [], binds = [];
        if (audience) { clauses.push("audience=?"); binds.push(audience); }
        if (counselor) { clauses.push("counselor=?"); binds.push(counselor); }
        const query = "SELECT * FROM academy_coach_sources" + (clauses.length ? " WHERE " + clauses.join(" AND ") : "") + " ORDER BY imported_at DESC LIMIT 100";
        const result = await env.DB.prepare(query).bind(...binds).all();
        return json({ok:true,sources:(result.results || []).map(academyCoachSourcePublicRow)});
      } catch (e) { return json({ok:false,error:String(e)},500); }
    }
    if (url.pathname === "/council/formacion" && req.method === "GET") {
      try {
        await ensureCouncilKnowledgeSchema(env);
        const log = ((await env.DB.prepare(
          "SELECT seat,delta,total,dado,formado,at FROM council_knowledge_log ORDER BY id DESC LIMIT 40"
        ).all()).results || []).map((r) => {
          const c = COUNCIL[String(r.seat)] || {};
          return { seat: r.seat, role: c.role || "", alias: c.alias || "",
            delta: Number(r.delta) || 0, total: Number(r.total) || 0,
            dado: Number(r.dado) || 0, formado: Number(r.formado) || 0, at: Number(r.at) || 0 };
        });
        return json({ ok: true, source: "pixeria/stock", eventos: log });
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }
    if (url.pathname === "/council/ticks" && req.method === "GET") {
      try {
        await ensureCouncilTicksSchema(env);
        const r = await env.DB.prepare(
          "SELECT slot_start,seat,ok,error,at FROM council_ticks ORDER BY slot_start DESC LIMIT 20"
        ).all();
        const ticks = (r.results || []).map((t) => ({
          slot_start: t.slot_start,
          slot: new Date(t.slot_start).toISOString(),
          seat: t.seat || "",
          ok: !!t.ok,
          error: t.error || "",
          at: t.at
        }));
        return json({ ticks });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // GET /worker/beats — bitácora de las rutinas del scheduled (FLT-1016 c), pública,
    // JSON. Una fila por rutina con su último resultado (ok/error/at/edad) + la fila
    // '__scheduled' (último disparo del cerrojo). Para auditar que la rutina corre por
    // latido HTTP aunque el cron esté muerto.
    if (url.pathname === "/worker/beats" && req.method === "GET") {
      try {
        await ensureWorkerBeatsSchema(env);
        const r = await env.DB.prepare(
          "SELECT routine,ok,error,at FROM worker_beats ORDER BY at DESC LIMIT 100"
        ).all();
        const beats = (r.results || []).map((b) => ({
          routine: b.routine,
          ok: !!b.ok,
          error: b.error || "",
          at: b.at,
          at_iso: b.at ? new Date(b.at).toISOString() : null,
          age_s: b.at ? Math.round((Date.now() - b.at) / 1e3) : null
        }));
        return json({ beats });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // Auditoría pública, de solo lectura, del cierre diario. El renderer obtiene
    // causa/fecha de cada ticket; esta ruta permite verificar ejecución, reintentos
    // y cantidad sin disparar mutaciones desde el navegador.
    if (url.pathname === "/fleet/daily-close" && req.method === "GET") {
      try {
        await ensureSchema(env);
        const day = String(url.searchParams.get("day") || "").trim();
        if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error:"day debe ser YYYY-MM-DD" }, 400);
        const r = day
          ? await env.DB.prepare("SELECT day,closed_at,active_after,status,started_at,finished_at,cancelled_count,error FROM mission_daily_closures WHERE day=?").bind(day).all()
          : await env.DB.prepare("SELECT day,closed_at,active_after,status,started_at,finished_at,cancelled_count,error FROM mission_daily_closures ORDER BY day DESC LIMIT 31").all();
        return json({ closures:r.results || [], next:dailyMissionClosePlan(Date.now()) });
      } catch (e) { return json({ error:String(e) }, 500); }
    }
    // Comprobador canónico para automatizaciones OnIdle. Sólo el estado visible
    // dentro de la hora bloquea; lo no concluido conserva su status técnico.
    if (url.pathname === "/fleet/onidle-state" && req.method === "GET") {
      try {
        await ensureSchema(env);
        const identity = resolveDecisionIdentity(url.searchParams.get("agent"), url.searchParams.get("machine"));
        if (!identity.ok) return json({ ok:false, code:"exact_identity_required", error:identity.error }, 400);
        return json({ ok:true, ...(await operationalOnIdleState(env, identity)) });
      } catch (e) { return json({ ok:false, error:String(e) }, 500); }
    }
    // Solicitud autenticada de ejecución inmediata del tick OnIDLE para una
    // identidad exacta. No acepta opciones, máquina ni payload de decisión: el
    // servidor los deriva del censo y pasa por la misma rutina scheduled.
    if (url.pathname === "/fleet/onidle-request" && req.method === "POST") {
      try {
        await ensureSchema(env);
        const session = await requireAuth(env, req);
        if (!session) return json({ ok:false, status:"unauthorized", error:"unauthorized" }, 401);
        let body;
        try { body = await req.json(); }
        catch { return json({ ok:false, status:"invalid", error:"bad-json" }, 400); }
        const result = await requestImmediateOnIdle(env, body, session);
        const response = json(result.body, result.status);
        response.headers.set("cache-control", "no-store");
        return response;
      } catch (e) { return json({ ok:false, status:"error", error:String(e) }, 500); }
    }
    // Fuente única de las tres alternativas OnIdle. El cuerpo es JSONL para que
    // el launchd pueda consumirlo sin fichero intermedio; nunca devuelve 1/2
    // candidatas ni rellena huecos con texto libre.
    if (url.pathname === "/fleet/onidle-proposals" && req.method === "GET") {
      try {
        await ensureSchema(env);
        const identity = resolveDecisionIdentity(url.searchParams.get("agent"), url.searchParams.get("machine"));
        if (!identity.ok) return json({ ok:false, code:"exact_identity_required", error:identity.error }, 400);
        const result = await canonicalOnIdleProposals(env, identity, String(url.searchParams.get("project_id") || "").trim());
        if (!result.ok) return json(result, result.status || 409);
        return new Response(result.proposals.map((row) => JSON.stringify(row)).join("\n") + "\n", {
          status:200, headers:{ ...CORS, "content-type":"application/x-ndjson; charset=utf-8", "cache-control":"no-store" }
        });
      } catch (e) { return json({ ok:false, error:String(e) }, 500); }
    }
    if (url.pathname === "/ideas" && (req.method === "GET" || req.method === "POST")) {
      const IDEA_STATUS = /* @__PURE__ */ new Set(["nueva", "estudio", "hecha", "mision", "descartada"]);
      try {
        await ensureIdeasSchema(env);
        if (req.method === "GET") {
          // slim=1 (FLT-1423): lo que el Highscore necesita — autor, título,
          // proyecto, estado y fechas de las ideas con vida en las últimas 24 h.
          // El feed completo de abajo carga TODAS las ideas con body/review/media
          // y además ejecuta una sincronización idea→decisión EN SERIE por cada
          // idea con reloj; eso lo convertía en la llamada más lenta del batch
          // (4-7,6 s medidos). Esta rama ni parsea ni sincroniza: la vista que
          // solo pinta actividad fresca no debe pagar el precio del feed entero.
          if (url.searchParams.get("slim") === "1") {
            const desde = Date.now() - 24 * 60 * 60 * 1000;
            const r = await env.DB.prepare(
              "SELECT id,title,author,status,created_at,updated_at,project FROM ideas " +
              "WHERE COALESCE(updated_at, created_at) >= ? ORDER BY created_at DESC LIMIT 300"
            ).bind(desde).all();
            return json({ ideas: r.results || [], slim: true });
          }
          const r = await env.DB.prepare("SELECT id,title,body,author,tag,status,created_at,updated_at,mission_id,seat,review,media,project,decision_id FROM ideas ORDER BY created_at DESC").all();
          const rows = r.results || [];
          // `review` y `media` viajan YA PARSEADOS como objeto (o null): el front los pinta directo.
          for (const it of rows) {
            if (it.review) { try { it.review = JSON.parse(it.review); } catch (e) { it.review = null; } } else it.review = null;
            if (it.media) { try { it.media = JSON.parse(it.media); } catch (e) { it.media = null; } } else it.media = null;
            it.project = it.project || "";
            it.decision_id = it.decision_id || "";
            // Idea→Decisión→Misión (LAZY): si la idea abrió un reloj y su tanda ya
            // materializó la misión, aquí pasa a «mision» con su mission_id. Sólo se
            // consulta para las que tienen decision_id y aún no son misión.
            if (it.decision_id && it.status !== "mision" && !it.mission_id) {
              try { const s = await syncIdeaFromDecision(env, it); it.status = s.status; it.mission_id = s.mission_id; } catch (e) {}
            }
          }
          await attachDisplayRefs(env, "objective", rows, (row) => row.id, (row) => row.created_at);
          return json({ ideas: rows });
        }
        const b = await req.json();
        const title = String(b.title || "").trim().slice(0, 200);
        if (!title) return json({ ok: false, error: "title requerido" }, 400);
        const body = String(b.body || "").trim().slice(0, 4000);
        const tag = String(b.tag || "").trim().slice(0, 40);
        // Silla del Consejo (opcional). Un valor fuera de las 8 se ignora → seat "".
        const seatIn = String(b.seat || "").trim().toLowerCase();
        const seat = IDEA_SEATS.has(seatIn) ? seatIn : "";
        // El navegador no es fuente de identidad: acceso.js ya firma esta petición
        // con la sesión. Sólo un cliente agente con secreto dedicado (o FLEET_TOKEN
        // legado) conserva `author` explícito. Un borrador del Consejo se verifica
        // por su seat y se reconstruye desde COUNCIL, nunca desde texto del cliente.
        const authHeader = req.headers.get("authorization") || "";
        const bearer = authHeader.replace(/^Bearer\s+/i, "");
        const session = await requireAuth(env, req);
        const trustedAgent = !!bearer && [env.IDEAS_AGENT_TOKEN, env.FLEET_TOKEN].filter(Boolean).some((token) => bearer === token);
        const council = session && tag.toLowerCase() === "consejo" && seat && COUNCIL[seat]
          ? COUNCIL[seat].role + " · " + COUNCIL[seat].alias : "";
        const actor = resolveIdeaAuthor({ session, explicitAuthor:b.author, trustedAgent,
          councilAuthor:council, councilSeat:seat });
        if (!actor.ok) return json({ ok:false, error:actor.error, code:actor.code }, actor.status || 400);
        const author = actor.author;
        // Proyecto del censo (opcional, FLT-1009). Se VALIDA contra el censo: un valor
        // suelto (id, nombre o dominio) se resuelve a su slug canónico; inválido → "".
        const projIn = String(b.project || b.projectSlug || "").trim();
        let project = "";
        if (projIn) { try { const p = (await projectIndex(env)).get(projIn); if (p) project = p.id; } catch (e) { project = ""; } }
        const now = Date.now();
        const id = "IDEA-" + (crypto.randomUUID().replace(/-/g, "").slice(0, 8));
        // El vídeo del que salió la idea, si vino de uno. Se guarda al nacer porque
        // después no hay forma de reconstruirlo: el texto ya está guionizado y no
        // dice de dónde viene. Se acepta sólo http(s) y se recorta; es una imagen
        // para enseñar, no una entrada de confianza.
        const imgIn = String(b.source_image || "").trim();
        const urlIn = String(b.source_url || "").trim();
        const sourceImage = /^https?:\/\//i.test(imgIn) ? imgIn.slice(0, 500) : "";
        const sourceUrl = /^https?:\/\//i.test(urlIn) ? urlIn.slice(0, 500) : "";
        await env.DB.batch([
          env.DB.prepare("INSERT INTO ideas (id,title,body,author,tag,status,created_at,updated_at,mission_id,seat,project) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
            .bind(id, title, body, author, tag, "nueva", now, now, "", seat, project),
          env.DB.prepare("UPDATE ideas SET author_source=?,author_identity=?,source_image=?,source_url=? WHERE id=?")
            .bind(actor.source, actor.identity, sourceImage, sourceUrl, id)
        ]);
        const idea = { id, title, body, author, author_source:actor.source, tag, status: "nueva", created_at: now, updated_at: now, mission_id: "", seat, project,
          source_image: sourceImage, source_url: sourceUrl };
        await attachDisplayRefs(env, "objective", idea, (row) => row.id, (row) => row.created_at);
        return json({ ok: true, idea });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // (Re)asigna la silla del Consejo a una idea. seat "" (o inválido) la desasigna.
    if (url.pathname === "/ideas/seat" && req.method === "POST") {
      try {
        await ensureIdeasSchema(env);
        const b = await req.json();
        const id = String(b.id || "").trim();
        if (!id) return json({ ok: false, error: "id requerido" }, 400);
        const seatIn = String(b.seat || "").trim().toLowerCase();
        const seat = IDEA_SEATS.has(seatIn) ? seatIn : "";
        const r = await env.DB.prepare("UPDATE ideas SET seat=?, updated_at=? WHERE id=?").bind(seat, Date.now(), id).run();
        if (!r.meta || r.meta.changes === 0) return json({ ok: false, error: "not_found" }, 404);
        return json({ ok: true, id, seat });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // POST /ideas/media {id, kind:audio|video|pdf|presentacion, url} — adjunta al Kit
    // de venta (FLT-1007) un activo generado en NotebookLM (audio/vídeo/PDF) o una
    // presentación del Generador de Presentaciones de AdmiraNeXT (FLT-1008, url del
    // deck compartible). Valida kind y url http(s). Fusiona sobre el media existente
    // (no pisa los otros). Devuelve la idea con media parseada.
    if (url.pathname === "/ideas/media" && req.method === "POST") {
      const MEDIA_KINDS = /* @__PURE__ */ new Set(["audio", "video", "pdf", "presentacion"]);
      try {
        await ensureIdeasSchema(env);
        const b = await req.json();
        const id = String(b.id || "").trim();
        if (!id) return json({ ok: false, error: "id requerido" }, 400);
        const kind = String(b.kind || "").trim().toLowerCase();
        if (!MEDIA_KINDS.has(kind)) return json({ ok: false, error: "kind inválido (audio|video|pdf|presentacion)" }, 400);
        const murl = String(b.url || "").trim().slice(0, 2000);
        if (!/^https?:\/\/\S+$/i.test(murl)) return json({ ok: false, error: "url http(s) requerida" }, 400);
        const idea = await env.DB.prepare("SELECT id,title,body,author,tag,status,created_at,updated_at,mission_id,seat,review,media FROM ideas WHERE id=?").bind(id).first();
        if (!idea) return json({ ok: false, error: "not_found" }, 404);
        let media = {};
        if (idea.media) { try { media = JSON.parse(idea.media) || {}; } catch (e) { media = {}; } }
        media[kind] = { url: murl, at: Date.now() };
        await env.DB.prepare("UPDATE ideas SET media=?, updated_at=? WHERE id=?").bind(JSON.stringify(media), Date.now(), id).run();
        idea.media = media;
        if (idea.review) { try { idea.review = JSON.parse(idea.review); } catch (e) { idea.review = null; } } else idea.review = null;
        return json({ ok: true, id, idea });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // Progreso por silla: para cada una de las 8, sus ideas y —para las promovidas
    // (mission_id no vacío)— el progreso REAL de la misión leyendo tickets +
    // mission_tasks. Null-safe con las ideas viejas sin seat (caen en "" → sin silla).
    if (url.pathname === "/objetivos/progreso" && req.method === "GET") {
      try {
        await ensureIdeasSchema(env);
        const rows = (await env.DB.prepare("SELECT id,title,status,mission_id,seat FROM ideas ORDER BY created_at DESC").all()).results || [];
        // Cache de progreso por misión para no repetir consultas si dos ideas
        // apuntaran a la misma misión.
        const misCache = new Map();
        async function missionProgress(mid) {
          if (!mid) return { tasks_total: 0, tasks_done: 0, mission_status: null };
          if (misCache.has(mid)) return misCache.get(mid);
          let tasks_total = 0, tasks_done = 0, mission_status = null;
          try {
            const t = await env.DB.prepare("SELECT COUNT(*) total, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) done FROM mission_tasks WHERE mission_id=?").bind(mid).first();
            tasks_total = (t && t.total) || 0;
            tasks_done = (t && t.done) || 0;
          } catch (e) {}
          try {
            const tk = await env.DB.prepare("SELECT status FROM tickets WHERE id=?").bind(mid).first();
            mission_status = tk ? (tk.status || null) : null;
          } catch (e) {}
          const out = { tasks_total, tasks_done, mission_status };
          misCache.set(mid, out);
          return out;
        }
        const bySeat = new Map();
        for (const s of IDEA_SEATS) bySeat.set(s, []);
        const unseated = [];
        for (const it of rows) {
          const seat = IDEA_SEATS.has(String(it.seat || "").toLowerCase()) ? String(it.seat).toLowerCase() : "";
          const mid = String(it.mission_id || "");
          const prog = mid ? await missionProgress(mid) : { tasks_total: 0, tasks_done: 0, mission_status: null };
          const entry = { id: it.id, title: it.title, status: it.status, mission_id: mid,
            tasks_total: prog.tasks_total, tasks_done: prog.tasks_done, mission_status: prog.mission_status };
          (seat ? bySeat.get(seat) : unseated).push(entry);
        }
        const seats = [...IDEA_SEATS].map((seat) => {
          const ideas = bySeat.get(seat) || [];
          const missions = ideas.filter((x) => x.mission_id).length;
          const tasks_total = ideas.reduce((a, x) => a + (x.tasks_total || 0), 0);
          const tasks_done = ideas.reduce((a, x) => a + (x.tasks_done || 0), 0);
          return { seat, ideas, ideas_count: ideas.length, missions, tasks_total, tasks_done };
        });
        return json({ ok: true, seats, unseated, unseated_count: unseated.length });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    if (url.pathname === "/ideas/status" && req.method === "POST") {
      const IDEA_STATUS = /* @__PURE__ */ new Set(["nueva", "estudio", "hecha", "mision", "descartada"]);
      try {
        const b = await req.json();
        const id = String(b.id || "").trim();
        const status = String(b.status || "").trim();
        if (!id) return json({ ok: false, error: "id requerido" }, 400);
        if (!IDEA_STATUS.has(status)) return json({ ok: false, error: "status inválido" }, 400);
        await ensureIdeasSchema(env);
        // El cambio de estado es lo prioritario: se hace SIEMPRE y primero.
        const r = await env.DB.prepare("UPDATE ideas SET status=?, updated_at=? WHERE id=?").bind(status, Date.now(), id).run();
        if (!r.meta || r.meta.changes === 0) return json({ ok: false, error: "not_found" }, 404);
        // Al pasar a «estudio», el Consejo delibera UNA vez (idempotente: solo si la
        // idea no tiene ya review). El handler `fetch(req,env)` NO recibe ctx, así que
        // no hay waitUntil: generamos INLINE con aiRunRaw (una sola llamada, rápida) y
        // devolvemos la review en la respuesta. Es best-effort — el estado ya quedó
        // guardado arriba; si la IA falla, la idea queda en estudio sin review y
        // POST /ideas/review la regenera bajo demanda. Nunca tumba el cambio de estado.
        let review = null;
        if (status === "estudio") {
          try {
            const idea = await env.DB.prepare("SELECT id,title,body,author,seat,review FROM ideas WHERE id=?").bind(id).first();
            if (idea && !idea.review) review = await generateCouncilReview(env, idea);
            else if (idea && idea.review) { try { review = JSON.parse(idea.review); } catch (e) {} }
          } catch (e) { review = null; }
        }
        return json({ ok: true, id, status, review });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // POST /ideas/review {id} — (re)genera la deliberación del Consejo bajo demanda.
    // Sirve cuando la IA falló al pasar a estudio, o para refrescarla. Regenera aunque
    // ya exista (así el botón «regenerar» tiene sentido). Devuelve la review creada.
    if (url.pathname === "/ideas/review" && req.method === "POST") {
      try {
        await ensureIdeasSchema(env);
        const b = await req.json();
        const id = String(b.id || "").trim();
        if (!id) return json({ ok: false, error: "id requerido" }, 400);
        const idea = await env.DB.prepare("SELECT id,title,body,author,seat FROM ideas WHERE id=?").bind(id).first();
        if (!idea) return json({ ok: false, error: "not_found" }, 404);
        const review = await generateCouncilReview(env, idea);
        if (!review) return json({ ok: false, error: "la IA no devolvió una deliberación usable; reintenta" }, 502);
        return json({ ok: true, id, review });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // Borra una idea DE VERDAD (la cruz de las fichas de /objetivos·/ideas).
    // Destructivo e irreversible por diseño: el panel muestra un confirm() con el
    // título antes de llamar. 404 si el id no existe. Mismo estilo json()/CORS.
    if (url.pathname === "/ideas/delete" && req.method === "POST") {
      try {
        const b = await req.json();
        const id = String(b.id || "").trim();
        if (!id) return json({ ok: false, error: "id requerido" }, 400);
        const r = await env.DB.prepare("DELETE FROM ideas WHERE id=?").bind(id).run();
        if (!r.meta || r.meta.changes === 0) return json({ ok: false, error: "not_found" }, 404);
        return json({ ok: true, id, deleted: true });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    if (url.pathname === "/ideas/promote" && req.method === "POST") {
      try {
        const b = await req.json();
        const id = String(b.id || "").trim();
        const mission_id = String(b.mission_id || "").trim().slice(0, 40);
        if (!id) return json({ ok: false, error: "id requerido" }, 400);
        if (!mission_id) return json({ ok: false, error: "mission_id requerido" }, 400);
        const r = await env.DB.prepare("UPDATE ideas SET mission_id=?, status='mision', updated_at=? WHERE id=?").bind(mission_id, Date.now(), id).run();
        if (!r.meta || r.meta.changes === 0) return json({ ok: false, error: "not_found" }, 404);
        return json({ ok: true, id, mission_id, status: "mision" });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // POST /ideas/decide {id} — convierte la idea/objetivo en una VENTANA DE DECISIÓN
    // de 3 minutos con las 3 MEJORES opciones para EJECUTARLA (generadas por Workers
    // AI, ordenadas de más a menos adecuada) + «Volver atrás». Si nadie elige, la
    // maquinaria de relojes tira con la recomendada (la 1ª). Abre la decisión por la
    // función interna openInitialMissionDecision (mismos guardas que POST /decisions),
    // bajo el agente de ideas NeoMini·Mac Mini y el proyecto de la idea si está
    // censado Y asignado, o el de respaldo «Yokup · ideas-objetivos». IDEMPOTENTE: si
    // la idea ya tiene una decisión VIVA (pending sin vencer), devuelve esa. NO rompe
    // POST /ideas/promote (sigue existiendo para enlazar una misión a mano).
    if (url.pathname === "/ideas/decide" && req.method === "POST") {
      try {
        await ensureIdeasSchema(env);
        const b = await req.json();
        const id = String(b.id || "").trim();
        if (!id) return json({ ok: false, error: "id requerido" }, 400);
        const idea = await env.DB.prepare("SELECT id,title,body,author,seat,review,project,status,mission_id,decision_id FROM ideas WHERE id=?").bind(id).first();
        if (!idea) return json({ ok: false, error: "not_found" }, 404);
        // Idempotencia: una decisión viva (pending sin vencer) → devolvemos la existente.
        if (idea.decision_id) {
          const prev = await env.DB.prepare("SELECT id,status,deadline FROM decisions WHERE id=?").bind(idea.decision_id).first();
          if (prev && prev.status === "pending" && prev.deadline > Date.now()) {
            return json({ ok: true, id, decision_id: prev.id, existing: true, deadline: prev.deadline,
                          secondsLeft: Math.max(0, Math.round((prev.deadline - Date.now()) / 1000)), url: DECIDE_URL });
          }
        }
        // Proyecto del reloj: el de la idea SÓLO si está censado Y asignado a
        // NeoMini+Mac Mini; si no (o la idea no tiene proyecto), el de respaldo.
        const idx = await projectIndex(env);
        let proj = idea.project ? idx.get(idea.project) : null;
        if (proj) {
          const a = await exactDecisionProjectAssignment(env, DECIDE_AGENT, DECIDE_MACHINE, proj.id);
          if (!a || String(a.id) !== String(proj.id)) proj = null;   // censado pero no asignado → respaldo
        }
        if (!proj) proj = idx.get(DECIDE_FALLBACK_PROJECT);
        if (!proj) return json({ ok: false, error: "falta el proyecto de respaldo censado (yokup-ideas-objetivos)" }, 500);
        // PRIMERO MIRAN LOS CONSEJEROS (Carlos, 2026-08-07). generateDecideOptions
        // alimenta su prompt con la deliberación del Consejo, pero sólo si existe:
        // un objetivo que nunca pasó por «estudio» llegaba aquí con review a null y
        // las 3 opciones salían a ciegas, que es justo lo contrario de la idea —
        // trabajar el objetivo antes de convertirlo en misión. Se genera si falta.
        // Best-effort: si la IA no da deliberación usable, la ventana se abre igual
        // (sin ella se decide peor, pero no decidir es peor todavía).
        if (!idea.review) {
          try { const r = await generateCouncilReview(env, idea); if (r) idea.review = JSON.stringify(r); }
          catch (e) { /* la ventana no se cae por una deliberación */ }
        }
        // 3 mejores opciones para EJECUTAR la idea (IA), ordenadas de más a menos
        // adecuada, nacidas de lo que dijeron los consejeros.
        const options = await generateDecideOptions(env, idea, proj.name);
        if (!options) return json({ ok: false, error: "la IA no devolvió 3 opciones usables; reintenta" }, 502);
        const res = await openInitialMissionDecision(env, {
          question: idea.title,
          options: buildDecideDecisionOptions(options),   // 3 mejoras + back + Custom
          recommended: 0,                                 // la 1ª es la más adecuada
          minutes: DECISION_MIN_DEFAULT,
          url: DECIDE_URL,
          surface: "web",
          mission: idea.id,                               // traza reversa decisión→idea
          agent: DECIDE_AGENT, machine: DECIDE_MACHINE,
          project: proj.name, project_slug: decisionProjectSlug(proj.name),
          project_id: proj.id, project_web: proj.web || ""
        });
        if (!res.ok) {
          // Candado del modelo: un reloj vivo del agente de ideas → no se abre otro.
          if (res.error === "live_decision") {
            return json({ ok: false, error: "live_decision", existing: res.existing, deadline: res.deadline,
                          secondsLeft: res.secondsLeft, url: DECIDE_URL }, 409);
          }
          return json({ ok: false, error: res.error, code: res.code }, res.status || 400);
        }
        await env.DB.prepare("UPDATE ideas SET decision_id=?, updated_at=? WHERE id=?").bind(res.id, Date.now(), id).run();
        return json({ ok: true, id, decision_id: res.id, display_ref: res.display_ref, options, recommended: 0,
                      deadline: res.deadline, secondsLeft: Math.max(0, Math.round((res.deadline - Date.now()) / 1000)),
                      project: res.project, url: DECIDE_URL });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // POST /ideas/generate {seat?,tag?,project_id?,topic?} — genera una idea del Consejo BAJO
    // DEMANDA. Las selecciones explícitas se validan y nunca se sustituyen: sólo un
    // selector vacío activa los fallbacks históricos de silla/proyecto/tipo.
    // `topic` opcional (string corto): si viene, la idea nace CENTRADA en ese tema,
    // manteniendo la voz del punto fuerte de la silla. `project` opcional (slug del
    // censo): fuerza el proyecto de la idea. Sin tema NI project, se sortea un proyecto
    // del censo con web (FLT-1009). El cron NO pasa nada (libre → proyecto al azar).
    // Misma generación, firma «ROL · alias», tag=consejo y guardado que el cron.
    // Devuelve la idea creada. Mismo estilo json()/CORS.
    // CONOCIMIENTO DE CADA SILLA — LECTURA PÚBLICA. Qué material tiene cada
    // consejero en pixeria (etiquetas #stevejobs, #waltdisney…), separando lo que
    // le dio Carlos de lo que le trajo la formación de admira.live.
    //
    // `count` a secas era un contador que subía sin que subiera el conocimiento: el
    // techo del prompt son 8 piezas, así que una silla con 60 y otra con 8 leen lo
    // mismo. Por eso el nivel son TRES números y no uno — recibido, lo que le cabe
    // en la cabeza, y de dónde vino— y el `ultima` dice cuándo estudió por última vez.
    if (url.pathname === "/council/knowledge") {
      const items = await stockIndex();
      const seats = COUNCIL_ORDER.map((s) => {
        const c = COUNCIL[s], pieces = seatKnowledgeFrom(items, s, 0);   // 0 = todas
        const formado = pieces.filter((p) => p.origin === "formado").length;
        return { seat: s, role: c.role, alias: c.alias, tag: c.tag,
          count: pieces.length, dado: pieces.length - formado, formado,
          // Lo único que de verdad ENSEÑA algo: sin cápsulas, una silla con sesenta
          // vídeos sabe lo que sabía, porque de un vídeo sólo lee el título.
          capsulas: pieces.filter((p) => p.capsula).length,
          // Vídeos que se pasan de los 5 minutos. 0 puede significar «ninguno» o
          // «el índice no trae duración»: `duracion_conocida` lo distingue, que si
          // no el criterio parecería cumplirse solo.
          largos: pieces.filter((p) => p.largo).length,
          duracion_conocida: pieces.some((p) => p.duracion > 0),
          // Lo que DE VERDAD lee la silla al opinar, ya con la cuota aplicada.
          enCabeza: ventanaReservada(pieces, COUNCIL_KNOWLEDGE_PROMPT_MAX).length,
          ultima: pieces.length ? pieces[0].at || "" : "",
          pieces: pieces.slice(0, 20) };
      });
      return json({ ok: true, source: "pixeria/stock", tope: COUNCIL_KNOWLEDGE_PROMPT_MAX,
        presupuesto: COUNCIL_KNOWLEDGE_PROMPT_CHARS, capsula_tipo: COUNCIL_CAPSULA_TYPE,
        video_max_secs: COUNCIL_VIDEO_MAX_SECS, formacion_tag: COUNCIL_FORMACION_TAG, seats });
    }
    // ── UNA IDEA DEL STOCK, GUIONIZADA ──────────────────────────────────────
    // Carlos graba ideas en vídeo y las etiqueta #idea en el Stock de Pixeria. Ahí
    // se quedaban: para convertir una en objetivo había que verla, entenderla y
    // reescribirla a mano, así que casi nunca se hacía. Esto coge la MÁS RECIENTE y
    // la deja redactada en los dos campos del formulario —la frase y su desarrollo—
    // para que el Consejo pueda deliberarla.
    //
    // NO se guarda nada: igual que «✨ Objetivo nuevo», devuelve un borrador y el
    // alta la hace el humano con «Añadir objetivo». Lo que se genera no es una idea
    // inventada: es LA SUYA, dicha con sus palabras y ordenada.
    if (url.pathname === "/ideas/desde-stock" && req.method === "POST") {
      let peticion = {}; try { peticion = await req.json(); } catch (e) { peticion = {}; }
      // La etiqueta la dice quien llama; «idea» es sólo el valor por defecto. Fijarla
      // aquí obligaría a desplegar el worker para buscar otra cosa.
      const items = await stockIndex();
      const marca = normalizaEtiqueta(peticion && peticion.etiqueta ? peticion.etiqueta : "idea");
      // La etiqueta puede venir en `tags` o como #idea en el comentario, que es como
      // la deja el importador de Telegram. Se miran las dos: exigir sólo una dejaría
      // fuera la mitad de lo que Carlos graba.
      const ideas = (items || []).filter((it) => {
        const porTag = Array.isArray(it && it.tags) && it.tags.some((t) => normalizaEtiqueta(t) === marca);
        const porComentario = String((it && it.comment) || "").split(/\s+/)
          .some((w) => w.startsWith("#") && normalizaEtiqueta(w) === marca);
        return porTag || porComentario;
      }).sort((a, b) => String(b && b.createdAt || "").localeCompare(String(a && a.createdAt || "")));
      if (!ideas.length) {
        return json({ ok: false, error: "sin-ideas",
          detail: "No hay nada etiquetado #" + marca + " en el Stock de Pixeria. Sube un vídeo con esa etiqueta y vuelve a pulsar." }, 404);
      }
      const fuente = ideas[0];
      // Lo que sabemos de la pieza. El comentario suele ser lo que Carlos dijo al
      // subirla, así que pesa más que el título del vídeo.
      const nota = String(fuente.comment || "").replace(/#\w+/g, " ").trim();
      const titulo = String(fuente.title || "").trim();
      if (!nota && !titulo) {
        return json({ ok: false, error: "idea-muda",
          detail: "La última pieza #idea no trae ni título ni comentario: no hay nada que guionizar." }, 422);
      }
      const prompt = `Carlos graba sus ideas en vídeo y las etiqueta #idea. Esta es la última.

TÍTULO DE LA PIEZA: ${titulo || "(sin título)"}
LO QUE ÉL ANOTÓ: ${nota || "(sin nota)"}

Conviértelo en un objetivo accionable para AdmiraNeXT —ecosistema de señalización digital hecho por agentes de IA: yokup.com gestiona misiones, pixeria.com produce contenido, admira.tv emite y admira.live es el Consejo—, para que el Consejo pueda deliberarlo y ayudarle a hacerlo realidad.

NO inventes una idea distinta: es la SUYA. Ordénala y hazla accionable, sin adornarla ni prometer lo que no dice.
Si la pieza es demasiado vaga para saber qué quiere, dilo en el cuerpo en vez de rellenar con humo.

Responde SOLO con un objeto JSON válido, sin texto alrededor ni markdown:
{"titulo":"<la idea en una frase, máx 90 caracteres>","cuerpo":"<2 o 3 frases: el porqué, el cómo y para quién>"}
Todo en español.`;
      const raw = await aiRunRaw(env, prompt, 400);
      const { title, body } = parseIdeaJSON(raw);
      if (!title) return json({ ok: false, error: "sin-redaccion", detail: "El motor no devolvió un borrador legible." }, 502);
      return json({ ok: true,
        idea: { title, body },
        fuente: { id: fuente.id || "", title: titulo, url: fuente.url || "", thumbnail: fuente.thumbnail || "",
                  createdAt: fuente.createdAt || "", nota },
        total: ideas.length });
    }
    // ── IDEA DESDE UNA URL QUE AÚN NO ESTÁ EN PIXERIA ────────────────────────
    // Carlos, 7-ago-2026 (FLT-1266): «a la derecha del botón de ideas tenemos que
    // poder pegar una url y que importe el contenido en pixeria.com si es un vídeo
    // y haga el análisis y la conversión a guion». Es el hermano de /ideas/desde-stock:
    // mismo destino —titular + desarrollo escritos en el formulario— pero partiendo
    // de algo que todavía no existe en el Stock.
    //
    // Va en DOS PASOS a propósito. Importar un vídeo lleva de treinta segundos a
    // varios minutos, y un worker no puede sostener una petición así: se cortaría
    // sola y el usuario no sabría si el vídeo entró o no. Este paso arranca la
    // importación y devuelve el job; /ideas/desde-url/estado la sigue. De paso, es
    // lo que permite contar por dónde va, que es lo que Carlos pidió para el botón.
    if (url.pathname === "/ideas/desde-url" && req.method === "POST") {
      let p = {}; try { p = await req.json(); } catch (e) { p = {}; }
      const enlace = String((p && p.url) || "").trim();
      if (!enlace) return json({ ok: false, error: "sin-url", detail: "Pega un enlace." }, 400);
      let host = "";
      try { host = new URL(enlace).hostname.toLowerCase(); }
      catch (e) { return json({ ok: false, error: "url-invalida", detail: "Eso no es un enlace válido." }, 400); }

      const base = tubeBase(env);
      // Primero se pregunta QUÉ es. Si el proxy no lo reconoce como vídeo
      // importable, se dice ya —antes de arrancar una descarga que va a fallar—.
      let meta = null;
      try {
        const rm = await fetch(base + "/tube/meta", { method: "POST",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: enlace }) });
        meta = rm.ok ? await rm.json() : null;
        if (!rm.ok) {
          const t = await rm.text().catch(() => "");
          return json({ ok: false, error: "no-es-video",
            detail: "Ese enlace no es un vídeo que Pixeria sepa importar (" + (t.slice(0, 120) || rm.status) + ")." }, 422);
        }
      } catch (e) {
        return json({ ok: false, error: "proxy-caido",
          detail: "No contesta el importador de Pixeria. Mira que el proxy del Mac Mini esté vivo." }, 502);
      }
      // La duración manda igual que en la formación de consejeros: piezas cortas.
      // No se rechaza, se avisa — la idea puede estar en el primer minuto.
      const largo = meta && Number.isFinite(meta.duration) ? meta.duration : null;

      let jobId = "";
      try {
        const ri = await fetch(base + "/tube/import-to-stock", { method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: enlace, format: "video",
            // La etiqueta deja el vídeo localizable después en el Stock: entró por
            // aquí, y quien lo mire mañana sabrá por qué está.
            comment: "#idea importado desde yokup.com/objetivos" }) });
        if (!ri.ok) {
          const t = await ri.text().catch(() => "");
          return json({ ok: false, error: "importacion-rechazada",
            detail: "Pixeria rechazó la importación: " + (t.slice(0, 160) || ri.status) }, 502);
        }
        const pl = await ri.json().catch(() => null);
        jobId = pl && pl.jobId ? String(pl.jobId) : "";
      } catch (e) {
        return json({ ok: false, error: "proxy-caido", detail: "Se cayó el importador al arrancar la descarga." }, 502);
      }
      if (!jobId) return json({ ok: false, error: "sin-job", detail: "El importador no devolvió trabajo que seguir." }, 502);

      return json({ ok: true, job: jobId, fase: "importando",
        fuente: { url: enlace, host, title: (meta && meta.title) || "", duration: largo,
                  description: (meta && meta.description) || "" } });
    }
    // Segundo paso: se pregunta por el job hasta que Pixeria lo dé por publicado y
    // sólo entonces se guioniza. El guion se escribe con lo que el vídeo dice de sí
    // mismo (título y descripción, que vienen del primer paso), no con la URL pelada.
    if (url.pathname === "/ideas/desde-url/estado" && req.method === "POST") {
      let p = {}; try { p = await req.json(); } catch (e) { p = {}; }
      const job = String((p && p.job) || "").trim();
      if (!job) return json({ ok: false, error: "sin-job" }, 400);
      const fuente = (p && p.fuente) || {};

      let st = null;
      try {
        const rs = await fetch(tubeBase(env) + "/tube/status?id=" + encodeURIComponent(job));
        // Un 404 aquí es ambiguo: o el job nunca existió, o ya se limpió tras
        // publicar. El proxy lo conserva 90 s justo para no confundir las dos cosas,
        // así que si no está, se dice que se perdió y no se inventa un final feliz.
        if (rs.status === 404) return json({ ok: false, error: "job-perdido",
          detail: "El importador ya no sabe de esa descarga. Vuelve a pegar el enlace." }, 404);
        st = await rs.json().catch(() => null);
      } catch (e) {
        return json({ ok: false, error: "proxy-caido", detail: "Se perdió el contacto con el importador." }, 502);
      }
      const estado = String((st && st.state) || "").toLowerCase();
      if (estado === "error") return json({ ok: false, error: "importacion-fallida",
        detail: String((st && st.error) || "La descarga falló.").slice(0, 300) }, 502);
      if (estado !== "published") {
        return json({ ok: true, listo: false, fase: estado === "done" ? "subiendo" : "descargando",
          size: (st && st.size) || 0, title: (st && st.title) || "" });
      }

      const titulo = String((st && st.title) || fuente.title || "").trim();
      const desc = String(fuente.description || "").trim();
      if (!titulo && !desc) return json({ ok: false, error: "video-mudo",
        detail: "El vídeo entró en Pixeria pero no trae ni título ni descripción: no hay nada que guionizar." }, 422);

      const prompt = `Carlos ha pegado el enlace de un vídeo para convertirlo en un objetivo. Ya está importado en el Stock de Pixeria.

TÍTULO DEL VÍDEO: ${titulo || "(sin título)"}
LO QUE EL VÍDEO CUENTA DE SÍ MISMO: ${desc ? desc.slice(0, 2000) : "(sin descripción)"}
ENLACE: ${String(fuente.url || "")}

Conviértelo en un objetivo accionable para AdmiraNeXT —ecosistema de señalización digital hecho por agentes de IA: yokup.com gestiona misiones, pixeria.com produce contenido, admira.tv emite y admira.live es el Consejo—, para que el Consejo pueda deliberarlo y ayudarle a hacerlo realidad.

Esto es material AJENO: la idea es qué hacer NOSOTROS con lo que ahí se cuenta, no un resumen del vídeo. No inventes datos que el vídeo no dé.
Si con el título y la descripción no hay suficiente para saber qué hacer, dilo en el cuerpo en vez de rellenar con humo.

Responde SOLO con un objeto JSON válido, sin texto alrededor ni markdown:
{"titulo":"<la idea en una frase, máx 90 caracteres>","cuerpo":"<2 o 3 frases: el porqué, el cómo y para quién>"}
Todo en español.`;
      const raw = await aiRunRaw(env, prompt, 400);
      const { title, body } = parseIdeaJSON(raw);
      if (!title) return json({ ok: false, error: "sin-redaccion", detail: "El motor no devolvió un borrador legible." }, 502);
      return json({ ok: true, listo: true, idea: { title, body },
        fuente: { url: String(fuente.url || ""), title: titulo,
                  thumbnail: miniaturaDeVideo(String(fuente.url || "")),
                  assetId: (st && st.assetId) || "", assetUrl: (st && st.assetUrl) || "" } });
    }
    if (url.pathname === "/ideas/generate" && req.method === "POST") {
      try {
        await ensureIdeasSchema(env);
        let b = {}; try { b = await req.json(); } catch (e) {}
        const selected = await resolveGenerateSelections(env, b);
        if (!selected.ok) return json({ ok:false, error:selected.error, code:selected.code }, selected.status);
        const seat = selected.seat;
        const topic = String(b && b.topic || "").trim();
        const projectHint = selected.project;
        const tagHint = selected.tag;
        // FLT-1017: `preview` devuelve el borrador sin guardarlo (lo pide /objetivos
        // para rellenar el formulario). Sin la bandera, todo sigue igual que antes.
        const preview = !!(b && (b.preview || b.dry_run));
        const idea = await generateCouncilIdea(env, seat, topic, projectHint, !preview, tagHint);
        if (!idea) return json({ ok: false, error: "la IA no devolvió una idea usable; reintenta" }, 502);
        if (!preview && idea.id) await attachDisplayRefs(env, "objective", idea, (row) => row.id, (row) => row.created_at);
        return json({ ok: true, idea });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    // ── RELOJES DE DECISIÓN ────────────────────────────────────────────────
    // POST /decisions            (agente) publica 3 mejoras + back + Custom
    // GET  /decisions            (panel /misiones) lista las vivas + recién cerradas
    // POST /decisions/<id>/choose (Carlos) elige una opción
    // GET  /decisions/<id>       (agente) consulta el desenlace
    // Lectura abierta (el panel la pinta); publicar y elegir NO piden sesión a
    // propósito: los agentes publican desde el CLI sin login de navegador.
    // ── DECLARAR TRABAJO HECHO ────────────────────────────────────────────
    // POST /declare (agente, sin login) registra una misión y sus tareas a/b/c.
    //
    // Un agente podía ABRIR una ventana de decisión desde el CLI sin sesión,
    // pero no podía DECLARAR lo que había hecho: /tickets, /tasks/all y todo
    // /mission/* viven tras el perímetro. El marcador medía exactamente lo que
    // no dejaba registrar, así que una jornada entera de trabajo real salía a
    // cero tareas (Carlos, 2026-08-05). Esto cierra el círculo por el mismo
    // carril que /decisions, con UNA exigencia que las demás rutas no tienen:
    //
    //   NINGUNA TAREA SE DECLARA HECHA SIN EVIDENCIA.
    //
    // Un commit, un sello de despliegue o una URL viva. Es lo único que separa
    // declarar trabajo de apuntarse puntos, y por eso la ruta puede ser pública
    // sin convertirse en un grifo de marcador.
    // CONFIG DE FLOTA — ESCRITURA protegida por el perímetro (sesión de Google).
    if (url.pathname === "/config" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch (e) { return json({ ok: false, error: "bad json" }, 400); }
      // Nombre acotado: es una bandera, no un cajón de sastre donde acabe
      // colándose un secreto por la puerta de atrás.
      const name = String(b.name || "").trim().toUpperCase().slice(0, 40);
      if (!/^[A-Z][A-Z0-9_]{2,39}$/.test(name)) return json({ ok: false, error: "name debe ser A-Z0-9_ (3..40)" }, 400);
      const value = String(b.value == null ? "" : b.value).slice(0, 500);
      const sess = await requireAuth(env, req);
      const by = (sess && sess.email) || "web";
      const now = Date.now();
      await env.DB.prepare("INSERT INTO fleet_config (name, value, updated_at, updated_by) VALUES (?,?,?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by")
        .bind(name, value, now, by).run();
      return json({ ok: true, name, value, updated_at: now, updated_by: by });
    }

    // ESTRATEGIA (norte) — ESCRITURA protegida por el perímetro. team ∈ atomos|bits.
    if (url.pathname === "/strategy" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch (e) { return json({ ok: false, error: "bad json" }, 400); }
      const team = String(b.team || "").toLowerCase();
      if (team !== "atomos" && team !== "bits") return json({ ok: false, error: "team debe ser atomos|bits" }, 400);
      const text = String(b.text || "").slice(0, 4000);
      const sess = await requireAuth(env, req);
      const by = (sess && sess.email) || "web";
      const now = Date.now();
      await env.DB.prepare("INSERT INTO strategy (team, text, updated_at, updated_by) VALUES (?,?,?,?) ON CONFLICT(team) DO UPDATE SET text=excluded.text, updated_at=excluded.updated_at, updated_by=excluded.updated_by")
        .bind(team, text, now, by).run();
      return json({ ok: true, team, updated_at: now, updated_by: by });
    }

    if (url.pathname === "/declare" && req.method === "POST") {
      try {
        await ensureSchema(env);
        const b = await req.json();
        const identity = resolveDecisionIdentity(b.agent, b.machine);
        if (!identity.ok) return json({ ok: false, error: identity.error, code: "exact_identity_required" }, 400);
        const subject = String(b.subject || "").trim().slice(0, 160);
        if (!subject) return json({ ok: false, error: "subject requerido" }, 400);

        const rawTasks = Array.isArray(b.tasks) ? b.tasks : [];
        if (!rawTasks.length || rawTasks.length > 3) {
          return json({ ok: false, error: "una misión son entre 1 y 3 tareas (a, b, c)" }, 400);
        }
        const now = Date.now();
        const codes = /* @__PURE__ */ new Set();
        const tasks = [];
        for (const t of rawTasks) {
          const code = String((t && t.code) || "").trim().toLowerCase();
          if (!/^[abc]$/.test(code) || codes.has(code)) {
            return json({ ok: false, error: "cada tarea necesita un código único a, b o c" }, 400);
          }
          codes.add(code);
          const title = String((t && t.title) || "").trim().slice(0, 120);
          if (!title) return json({ ok: false, error: `la tarea ${code} necesita título` }, 400);
          const status = TASK_STATUS.includes(t && t.status) ? t.status : "pending";
          let evidence = null;
          if (status === "done") {
            evidence = declaredEvidence(t && t.evidence);
            if (!evidence) {
              return json({ ok: false, code: "evidence_required",
                error: `la tarea ${code} se declara hecha sin evidencia: hace falta commit, sello de despliegue o URL` }, 400);
            }
          }
          const report = String((t && t.report) || "").trim().slice(0, 1800);
          tasks.push({ code, title, status, evidence,
            report: [report, evidence ? "Evidencia · " + evidence.text : ""].filter(Boolean).join("\n") || null });
        }

        // TODO lo que puede fallar se comprueba ANTES de escribir. La primera
        // versión validaba el cierre DESPUÉS del INSERT, así que un 400 por
        // «tareas sin hacer» dejaba una misión huérfana viva en el tablero —
        // justo el tipo de registro falso que esta ruta viene a evitar.
        const todasHechas = tasks.every((t) => t.status === "done");
        const evidenciaMision = b.resolve === true ? declaredEvidence(b.evidence) : null;
        if (b.resolve === true) {
          if (!todasHechas) return json({ ok: false, code: "tasks_pending",
            error: "no se cierra una misión con tareas sin hacer" }, 400);
          if (!evidenciaMision) return json({ ok: false, code: "evidence_required",
            error: "cerrar la misión exige evidencia: commit, sello de despliegue o URL" }, 400);
        }

        // Una misión existente sólo la declara SU agente. Si no, cualquiera
        // podría colgarse el trabajo de otro.
        let missionId = String(b.mission_id || "").trim().slice(0, 80);
        let creada = false;
        let persistedAtomically = false;
        const rawIdempotencyKey = String(req.headers.get("idempotency-key") || b.idempotency_key || "").trim();
        if (rawIdempotencyKey.length > 128 || /[\u0000-\u001f\u007f]/.test(rawIdempotencyKey)) {
          return json({ ok:false, error:"idempotency_key inválida", code:"invalid_idempotency_key" }, 400);
        }
        const inheritedContext = await validateDeclareCreationContext(env, b, identity);
        if (!inheritedContext.ok) return json({ ok:false, error:inheritedContext.error, code:inheritedContext.code }, inheritedContext.status);
        const projectContext = await resolveCreationProject(env, {
          project_id:b.project_id, decision_id:b.decision_id, batch_id:b.batch_id,
          parent_id:b.parent_id || missionId, agent:identity.agent, machine:identity.machine
        });
        if (!projectContext.ok) return json({ ok:false, error:projectContext.error, code:projectContext.code }, projectContext.status);
        if (inheritedContext.project_ids.some((id) => id !== projectContext.project_id)) {
          return json({ ok:false, error:"los contextos heredados no pertenecen al mismo proyecto", code:"context_project_mismatch" }, 400);
        }
        // La resolución dice QUÉ proyecto aporta el contexto; esta segunda
        // comprobación demuestra que el agente+máquina puede trabajar en él.
        // Aplica igual a project_id explícito, padre, decisión/batch y principal
        // diario: ninguna vía heredada evita projects + project_members.
        const authorized = await exactDecisionProjectAssignment(env, identity.agent, identity.machine, projectContext.project_id);
        if (!authorized || authorized.id !== projectContext.project_id) {
          return json({ ok:false, error:"proyecto no autorizado para agente+máquina", code:"exact_project_required" }, 400);
        }
        const idempotentResponse = async (existing) => {
          const display_ref = await ensureEntityDisplayRef(env, "mission", existing.id, existing.created_at || now);
          return json({ ok:true, mission_id:existing.id, display_ref, creada:false,
            cerrada:existing.status === "resolved", idempotent:true,
            agent:identity.agent, machine:identity.machine, project:projectContext.project,
            project_id:projectContext.project_id,
            tasks:tasks.map((t) => ({ code:t.code, status:t.status, evidencia:!!t.evidence })) });
        };
        if (missionId) {
          const existing = await env.DB.prepare("SELECT id,assignee,loc,project,project_id FROM tickets WHERE id=?").bind(missionId).first();
          if (!existing) return json({ ok: false, error: "mission_id no existe" }, 404);
          const suya = sameAgentFamily(existing.assignee || "", identity.agent) &&
            memberRefMatches("machine", existing.loc || identity.machine, identity.machine);
          if (!suya) return json({ ok: false, code: "not_your_mission",
            error: "esa misión está asignada a otro agente" }, 403);
          await env.DB.prepare("UPDATE tickets SET subject=?,project=?,project_id=?,parent_id=COALESCE(?,parent_id),updated_at=? WHERE id=?")
            .bind(subject, projectContext.project_id, projectContext.project_id, inheritedContext.parent_id, now, missionId).run();
        } else {
          missionId = await declareMissionId({
            day:madridDayKey(now), agent:identity.agent, machine:identity.machine,
            project_id:projectContext.project_id, parent_id:inheritedContext.parent_id,
            decision_id:String(b.decision_id || "").trim(), batch_id:String(b.batch_id || "").trim(),
            subject, tasks, resolve:b.resolve === true, evidence:evidenciaMision,
            idempotency_key:rawIdempotencyKey
          });
          // Camino normal del reintento: la primera petición terminó en D1 y el
          // cliente no recibió su 200. No se reescribe nada; se devuelve la misma
          // misión y la misma referencia visible.
          const previous = await env.DB.prepare(
            "SELECT id,subject,assignee,loc,project,project_id,source,status,created_at FROM tickets WHERE id=?"
          ).bind(missionId).first();
          if (previous) {
            if (!sameIdempotentDeclaration(previous, identity, projectContext.project_id, subject)) {
              return json({ ok:false, error:"colisión de idempotencia", code:"idempotency_conflict" }, 409);
            }
            return idempotentResponse(previous);
          }
          // `screen` lleva un índice UNIQUE entre tickets NO resueltos (una sola
          // incidencia abierta por pantalla física). Sembrarlo con el proyecto
          // dejaba una única misión declarable por proyecto y reventaba la
          // segunda con un D1_ERROR. Va con el id de la misión, único por
          // construcción, que además hace el origen legible en el tablero.
          // El PROYECTO se persiste en el ticket, no sólo se valida. Sin esto la
          // misión declarada salía en /misiones sin proyecto: icono por defecto
          // de AdmiraNeXT y sin rótulo, aunque la ruta lo hubiera comprobado
          // contra el censo dos líneas antes (Carlos lo vio en la tabla).
          const statements = [env.DB.prepare(
            // Aquí las dos columnas de herencia van ANTES de `project`: declare-evidence
            // exige que este INSERT TERMINE en «…,project,project_id,parent_id,created_at,
            // updated_at)» — es el contrato de que la misión declarada nace con proyecto.
            "INSERT INTO tickets(id,screen,subject,loc,role,status,priority,assignee,source,ai_triage,project_inherited,project_inherited_from,project,project_id,parent_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
          ).bind(missionId, "declare:" + missionId, subject, identity.machine, "mission",
            "in_progress", "normal", identity.agent, "cli-declare", "",
            projectContext.inherited ? 1 : 0, projectContext.inherited_from || null,
            projectContext.project_id, projectContext.project_id, inheritedContext.parent_id, now, now),
            env.DB.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)")
              .bind(missionId, now, "status", identity.agent, "Misión declarada desde el CLI: pasa a en curso (in_progress).")];
          for (const t of tasks) {
            const suggested = ownerFor(t.code, t.title);
            const owner = reportAgentIdentity(identity.agent, identity.machine);
            const executor = scopedMissionOwner(suggested, /^infra/i.test(suggested) ? "infra" : "sub", identity.agent, identity.machine);
            statements.push(env.DB.prepare(
              "INSERT INTO mission_tasks(mission_id,code,title,status,owner,executor,report,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)"
            ).bind(missionId, t.code, t.title, t.status, owner, executor, t.report, now, now));
            if (t.evidence) statements.push(env.DB.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)")
              .bind(missionId, now, "log", identity.agent, `Tarea ${t.code} declarada hecha desde el CLI · ${t.evidence.text}`));
          }
          // /declare registra trabajo que ya está en curso (o terminado), no un
          // plan futuro. Persistir el inicio en ticket y tareas evita que
          // active-work descarte el handON mientras highscore/daily sí lo puntúa.
          if (tasks.some((t) => ["in_progress", "doing", "active", "done"].includes(t.status))) {
            statements.push(env.DB.prepare("UPDATE tickets SET started_at=COALESCE(started_at,?) WHERE id=?")
              .bind(now, missionId));
          }
          for (const t of tasks.filter((item) => ["in_progress", "doing", "active", "done"].includes(item.status))) {
            statements.push(env.DB.prepare("UPDATE mission_tasks SET started_at=COALESCE(started_at,?) WHERE mission_id=? AND code=?")
              .bind(now, missionId, t.code));
          }
          if (b.resolve === true) {
            statements.push(env.DB.prepare("UPDATE tickets SET status='resolved',resolved_at=?,updated_at=? WHERE id=?").bind(now, now, missionId));
            statements.push(env.DB.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)")
              .bind(missionId, now, "accept", identity.agent, `Misión declarada resuelta desde el CLI · ${evidenciaMision.text}`));
          }
          // D1 batch es atómico: ticket, proyecto, plan y eventos nacen juntos.
          // Si falla cualquier sentencia no queda una misión parcial u huérfana.
          try {
            await env.DB.batch(statements);
          } catch (error) {
            // Dos reintentos pueden superar a la vez la lectura anterior. D1
            // conserva la PK única y el batch atómico: el perdedor consulta el
            // ganador y responde con él, pero no oculta ningún otro fallo.
            const winner = await env.DB.prepare(
              "SELECT id,subject,assignee,loc,project,project_id,source,status,created_at FROM tickets WHERE id=?"
            ).bind(missionId).first();
            if (sameIdempotentDeclaration(winner, identity, projectContext.project_id, subject)) {
              return idempotentResponse(winner);
            }
            throw error;
          }
          persistedAtomically = true;
          creada = true;
        }

        if (!persistedAtomically) await saveMissionPlan(env, missionId, tasks.map((t) => ({
          code: t.code, title: t.title, status: t.status, report: t.report
        })));

        // Rastro auditable: quién declaró qué y con qué evidencia. Sin esto la
        // ruta sería una caja negra que sube marcadores.
        for (const t of persistedAtomically ? [] : tasks) {
          if (!t.evidence) continue;
          await addEvent(env, missionId, "log", identity.agent,
            `Tarea ${t.code} declarada hecha desde el CLI · ${t.evidence.text}`);
        }

        // El cierre ya venía validado arriba, antes de tocar la base. El evento
        // 'accept' es el mismo que exige la cola de tandas para avanzar, así que
        // no se firma sin evidencia.
        let cerrada = false;
        if (b.resolve === true && !persistedAtomically) {
          await env.DB.prepare("UPDATE tickets SET status='resolved', resolved_at=?, updated_at=? WHERE id=?")
            .bind(now, now, missionId).run();
          await addEvent(env, missionId, "accept", identity.agent,
            `Misión declarada resuelta desde el CLI · ${evidenciaMision.text}`);
          cerrada = true;
        }
        if (b.resolve === true && persistedAtomically) cerrada = true;
        const display_ref = await ensureEntityDisplayRef(env, "mission", missionId, now);
        return json({ ok: true, mission_id: missionId, display_ref, creada, cerrada,
          agent: identity.agent, machine: identity.machine, project: projectContext.project,
          project_id: projectContext.project_id,
          tasks: tasks.map((t) => ({ code: t.code, status: t.status, evidencia: !!t.evidence })) });
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
    }

    if (url.pathname === "/decisions" && req.method === "POST") {
      try {
        await ensureSchema(env);
        const b = await req.json();
        // La ventana inicial mantiene tres caminos + salida. Una continuación
        // enlazada al mismo batch acepta únicamente las 1..2 misiones que aún
        // quedan en cola + la salida terminal.
        const rawOpts = Array.isArray(b.options) ? b.options : [];
        let dparent = String(b.parent_decision || "").trim().slice(0, 80);
        let dbatch = String(b.batch_id || "").trim().slice(0, 80);
        const continuation = !!(dparent || dbatch);
        const opts = rawOpts.slice(0, continuation ? 3 : 5).map((o) => String(o).slice(0, 200));
        const q = String(b.question || "").trim().slice(0, 400);
        let parent = null;
        if (!q || rawOpts.length !== opts.length || (continuation ? !isContinuationMissionDecision(opts, { parent_decision: dparent || "linked" }) : !isInitialMissionDecision(opts))) {
          return json({ ok: false, error: continuation ? "La continuación requiere entre 1 y 2 misiones restantes y «Volver atrás» al final" : "La decisión inicial requiere 3 mejoras, «Volver atrás» como cuarta opción y «Custom» como quinta" }, 400);
        }
        if (continuation) {
          parent = dparent ? await env.DB.prepare("SELECT id,batch_id,options,agent,machine,project,project_slug FROM decisions WHERE id=?").bind(dparent).first() : null;
          if (dparent && !parent) return json({ ok: false, error: "parent_decision no existe" }, 404);
          const inferredBatch = parent && (parent.batch_id || batchIdForDecision(parent.id));
          if (dbatch && inferredBatch && dbatch !== inferredBatch) return json({ ok: false, error: "parent_decision y batch_id no coinciden" }, 400);
          dbatch = dbatch || inferredBatch || "";
          const batch = dbatch && await env.DB.prepare("SELECT id,decision_id,status FROM mission_batches WHERE id=?").bind(dbatch).first();
          if (!batch || batch.status !== "awaiting_continuation") {
            return json({ ok: false, error: "batch_id awaiting_continuation requerido" }, 400);
          }
          dparent = dparent || batch.decision_id || "";
          if (!parent && dparent) parent = await env.DB.prepare("SELECT id,batch_id,options,agent,machine,project,project_slug FROM decisions WHERE id=?").bind(dparent).first();
          const open = await env.DB.prepare("SELECT id FROM decisions WHERE batch_id=? AND status='pending' LIMIT 1").bind(dbatch).first();
          if (open) return json({ ok: false, error: "continuation_pending", existing: open.id }, 409);
          const queued = await reconcileQueuedBatchItems(env, dbatch);
          if (!continuationMissionOrder(opts, 0, queued).length) {
            return json({ ok: false, error: "Las opciones deben coincidir exactamente con las misiones restantes del batch, sin completadas ni duplicados" }, 400);
          }
        }
        const rawAgent = String(b.agent || "").trim().slice(0, 40);
        const rawMachine = String(b.machine || "").trim().slice(0, 60);
        const decisionIdentity = resolveDecisionIdentity(rawAgent, rawMachine);
        if (!decisionIdentity.ok) {
          return json({ ok: false, error: decisionIdentity.error, code: "exact_identity_required" }, 400);
        }
        const requestedProjectId = String(b.project_id || (continuation && parent ? parent.project : "")).trim().slice(0, 120);
        const onIdle = !continuation && (b.onidle === true || String(b.mission || "") === ONIDLE_MISSION_MARKER);
        if (onIdle && !isCanonicalOnIdleOptions(opts)) {
          return json({ ok:false, error:"OnIDLE requiere 3 propuestas distintas, «Volver atrás» como cuarta opción y «Custom» como quinta",
            code:"invalid_onidle_options" }, 400);
        }
        if (onIdle && b.user_override !== true) {
          const operational = await operationalOnIdleState(env, decisionIdentity, requestedProjectId);
          if (!operational.can_open) {
            return json({ ok:false, error:"onidle_blocked", code:operational.reason,
              blockers:operational.blockers, quota:operational.quota,
              operational_limit_ms:operational.operational_limit_ms }, 409);
          }
          await pauseTimedOutOnIdleBatches(env, decisionIdentity, operational.evaluated_at);
        }
        const decisionInput = { ...b, agent: decisionIdentity.agent, machine: decisionIdentity.machine };
        // Cuando agent+machine participa en varios proyectos, la raíz debe
        // seleccionar uno por id. Las continuaciones heredan el id ya
        // autorizado de su decisión raíz. Una selección ajena falla cerrado.
        const assignment = await exactDecisionProjectAssignment(
          env, decisionIdentity.agent, decisionIdentity.machine, requestedProjectId
        );
        let inherited = null;
        if (continuation && parent) {
          const pidx = await projectIndex(env);
          const rootProject = resolveProject(pidx, parent.project || "");
          inherited = { agent: parent.agent, machine: parent.machine, project_id: rootProject.id, project: rootProject.name, project_slug: parent.project_slug || "" };
        }
        const projectContext = resolveDecisionProject(decisionInput, assignment, inherited);
        if (!projectContext.ok) return json({ ok: false, error: projectContext.error, code: "exact_project_required" }, 400);
        const targetContract = normalizeDecisionOptionTargets(b.option_targets, opts, continuation);
        if (!targetContract.ok) return json(targetContract, 400);
        const validTargets = await validateDecisionOptionTargets(env, targetContract.targets, projectContext.project_id, dbatch);
        if (!validTargets.ok) return json(validTargets, validTargets.status || 400);
        const mins = Math.min(DECISION_MIN_MAX, Math.max(1, +b.minutes || DECISION_MIN_DEFAULT));
        const now = Date.now();
        const agent = projectContext.agent;
        const machine = projectContext.machine;
        // UN RELOJ VIVO A LA VEZ POR AGENTE (FLT-982 b3, sustituye a `daily_limit`).
        // La regla vieja era «uno al día por agente»: el segundo reloj de la jornada
        // se rechazaba con {error:"daily_limit"}. Eso hacía IMPOSIBLE el protocolo
        // que fijó Carlos —abrir una ventana de 5 minutos al cerrar CADA misión—,
        // porque la segunda misión del día ya no podía preguntar nada.
        // Ahora sólo estorba un reloj que siga VIVO: pending y sin vencer. Vencido
        // (deadline pasado, lo marque o no el cron), decidido o cancelado → vía libre.
        const live = await env.DB.prepare(
          "SELECT id,deadline FROM decisions WHERE replace(lower(agent),'macmini','mini')=replace(lower(?),'macmini','mini') AND status='pending' AND deadline > ? ORDER BY created_at DESC LIMIT 1"
        ).bind(agent, now).first();
        const userOverride = b.user_override === true;
        if (live && !userOverride && !continuation) {
          return json({ ok: false, error: "live_decision", existing: live.id, deadline: live.deadline,
                        secondsLeft: Math.max(0, Math.round((live.deadline - now) / 1000)) }, 409);
        }
        const manual = b.manual === true;
        if (manual && !(await requireAuth(env, req))) {
          return json({ ok: false, code: "manual_needs_session",
            error: "lanzar a mano exige sesión del perímetro: el cupo de 6/hora es de quien mira la pantalla" }, 401);
        }
        // LA VENTANA HORARIA NO INTERRUMPE A QUIEN ESTA TRABAJANDO (Carlos, 3-sep-2026).
        // Solo se aplica a la automatica: una que pide una persona, una continuacion o un
        // override entran igual, porque ahi hay alguien decidiendo, no un reloj.
        if (!continuation && !userOverride && !manual) {
          const { trabajo, desde } = await agenteTrabajoLaUltimaHora(env, projectContext, now);
          if (trabajo > 0) {
            return json({ ok: false, code: "agente_ocupado", applied: false,
              error: "no se abre ventana: " + agent + " ha trabajado en la ultima hora (" + trabajo + " movimientos)",
              hint: "la ventana horaria es para cuando NO hay trabajo (mandamiento 10); vuelve a intentarlo cuando la hora este parada",
              desde }, 409);
          }
        }
        if (!continuation && !userOverride && !onIdle) {
          // Las decisiones ordinarias comparten criterio con openInitialMissionDecision:
          // UNA VENTANA VIVA por agente —pendiente y dentro de plazo—, no una cada 60
          // minutos (Carlos, 3-sep-2026: «el limite es por agente no por hora»). Una
          // caducada no reserva sitio: hoy la automatica de las 06:13, con opciones de
          // hace 540 horas, impedia abrir la propuesta que Carlos habia pedido.
          // OnIdle ya pasó su guard canónico justo arriba (viva, trabajo fresco,
          // 8/día Madrid), por lo que repetir aquí 1/h impediría el siguiente
          // ciclo inmediatamente después del cierre.
          const previas = ((await env.DB.prepare(
            "SELECT id,created_at,deadline FROM decisions WHERE replace(lower(agent),'macmini','mini')=replace(lower(?),'macmini','mini') AND (parent_decision IS NULL OR parent_decision='') AND status='pending' AND deadline > ? ORDER BY created_at DESC"
          ).bind(agent, now).all()).results) || [];
          const tope = manual ? MANUAL_PER_HOUR : 1;
          if (previas.length >= tope) {
            // El hueco lo libera la MÁS VIEJA de las que siguen dentro de la hora.
            const masVieja = previas[previas.length - 1];
            return json({ ok: false, error: "hourly_limit", manual, limite: tope,
              usadas: previas.length, existing: previas[0].id,
              nextAt: Number(masVieja.deadline) || (Number(masVieja.created_at) + HOURLY_WINDOW_MS) }, 409);
          }
          // TURNO — sólo para las automáticas. Cuando la lanza una persona manda
          // la persona: bloquearla porque «no es su turno» convertiría una ayuda
          // en un estorbo.
          if (!manual) {
            const turno = await ventanaTurno(env, agent, now);
            if (!turno.enTurno) {
              return json({ ok: false, error: "fuera_de_turno",
                mensaje: `Su franja es cada ${Math.round(turno.paso / 60000)} min con ${turno.n} agentes en el reparto.`,
                turno: turno.idx + 1, agentes: turno.n, pasoMin: Math.round(turno.paso / 60000),
                nextAt: turno.proximo }, 409);
            }
          }
        }
        const id = "DEC-" + now.toString(36) + Math.random().toString(36).slice(2, 6);
        await backfillTodayDisplayRefs(env, now);
        // mission/url son metadatos. El proyecto ya fue validado contra la
        // intersección canónica projects+project_members; jamás se hereda del
        // último ticket o trabajo.
        const durl = String(b.url || "").slice(0, 300);
        const dmission = String(onIdle ? ONIDLE_MISSION_MARKER : (b.mission || "")).slice(0, 120);
        const dproject = projectContext.project_id;
        const dprojectSlug = projectContext.project_slug;
        await env.DB.prepare("INSERT INTO decisions (id,machine,agent,surface,question,options,recommended,status,created_at,deadline,url,mission,project,project_slug,parent_decision,batch_id,option_targets) VALUES (?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,?,?)")
          .bind(id, machine, agent,
                String(b.surface || "").slice(0, 20), q, JSON.stringify(opts),
                Math.max(0, Math.min(continuation ? opts.length - 2 : 2, +b.recommended || 0)), now, now + mins * 60000,
                durl, dmission, dproject, dprojectSlug, dparent, dbatch, JSON.stringify(targetContract.targets)).run();
        const display_ref = await ensureEntityDisplayRef(env, "window", id, now);
        // Abrir una ventana es trabajo: queda anotado, agrupado por agente y jornada.
        const trabajo_id = await anotarVentanaComoTrabajo(env, agent, machine, dproject, q, now);
        const telegram = await avisarVentanaPorTelegram(env, { agent, machine, question: q, options: opts,
          recommended: Math.max(0, Math.min(continuation ? opts.length - 2 : 2, +b.recommended || 0)),
          deadline: now + mins * 60000, display_ref, projectId: dproject });
        return json({ ok: true, id, display_ref, trabajo_id, telegram, deadline: now + mins * 60000, project: projectContext.project, project_id: dproject, project_slug: dprojectSlug, parent_decision: dparent, batch_id: dbatch, continuation, user_override: userOverride });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    if (url.pathname === "/decisions" && req.method === "GET") {
      try {
        const now = Date.now();
        // El cambio de estado es una sola query y debe verse en esta respuesta.
        // Materializar/reordenar tandas puede tocar decenas de filas: sigue
        // garantizado por cron y se completa en background, sin bloquear la UI.
        await expireDecisions(env);
        if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(startDecisionBatches(env).catch(() => {}));
        }
        // HISTÓRICO (FLT-982 b2). Hasta ahora esto sólo devolvía las vivas y las
        // cerradas de la última hora, e IGNORABA cualquier parámetro: la página
        // /decisiones tenía que guardarse el pasado en localStorage de cada
        // navegador. Parámetros admitidos (todos opcionales; sin ninguno el
        // comportamiento es EXACTAMENTE el de antes, para no romper a nadie):
        //   ?all=1            → sin la ventana de 1 h: todo el histórico
        //   ?since=<ms>       → sólo desde ese epoch (implica all)
        //   ?until=<ms>       → sólo hasta ese epoch (paginación hacia atrás)
        //   ?limit=<1..500>   → tamaño de página (40 por defecto)
        //   ?agent=<nombre>   → filtra por agente (case-insensitive)
        //   ?status=<a,b>     → pending|decided|expired|cancelled, coma-separados
        const qp = url.searchParams;
        const num = (k) => { const v = qp.get(k); return v == null || v === "" ? null : (Number.isFinite(+v) ? +v : null); };
        const since = num("since");
        const until = num("until");
        const all = qp.get("all") === "1" || qp.get("all") === "true" || since !== null || until !== null;
        const limit = Math.min(500, Math.max(1, num("limit") || 40));
        const agentQ = String(qp.get("agent") || "").trim().slice(0, 40);
        const statusQ = String(qp.get("status") || "").split(",").map((s) => s.trim().toLowerCase())
          .filter((s) => ["pending", "decided", "expired", "cancelled"].includes(s));
        const where = [], binds = [];
        // Ventana por defecto: vivas + cerradas de la última hora (lo de siempre).
        if (!all) { where.push("(status='pending' OR decided_at > ? OR deadline > ?)"); binds.push(now - 3600000, now - 3600000); }
        if (since !== null) { where.push("created_at >= ?"); binds.push(since); }
        if (until !== null) { where.push("created_at <= ?"); binds.push(until); }
        if (agentQ) { where.push("replace(lower(agent),'macmini','mini')=replace(lower(?),'macmini','mini')"); binds.push(agentQ); }
        if (statusQ.length) { where.push(`status IN (${statusQ.map(() => "?").join(",")})`); binds.push(...statusQ); }
        const sql = "SELECT * FROM decisions" + (where.length ? " WHERE " + where.join(" AND ") : "")
          + " ORDER BY created_at DESC LIMIT ?";
        const r = await env.DB.prepare(sql).bind(...binds, limit).all();
        // Proyecto: se resuelve al NOMBRE del censo (una consulta para toda la
        // página). Una decisión sin proyecto propio hereda el de su misión —de
        // ahí salía el «Proyecto sin identificar» de la ficha— y si no hay
        // ninguno se devuelve vacío, para que el front diga «Sin proyecto».
        const pidxG = await projectIndex(env);
        const misIds = [...new Set((r.results || []).map((d) => String(d.mission || "").toUpperCase()).filter(Boolean))];
        const misProj = {};
        if (misIds.length) {
          const tks = await selectIn(env, misIds, (ph) => `SELECT id, project FROM tickets WHERE id IN (${ph})`);
          for (const t of tks || []) if (t.project) misProj[t.id] = t.project;
        }
        const parsed = (r.results || []).map((d) => {
          let options = []; try { options = JSON.parse(d.options || "[]"); } catch (e) {}
          const targetContract = normalizeDecisionOptionTargets(d.option_targets, options, !!d.parent_decision);
          return { d, options, option_targets:targetContract.ok ? targetContract.targets : [] };
        });
        const batchIds = parsed.slice(0, 40)
          .filter(({ d, options }) => isMissionDecision(options, d))
          .map(({ d }) => d.batch_id || batchIdForDecision(d.id));
        const batchMap = await missionBatchSnapshots(env, batchIds);
        const items = parsed.map(({ d, options: o, option_targets }, i) => {
          const legacyProject = d.status === "pending" ? (d.project || "")
            : (d.project || misProj[String(d.mission || "").toUpperCase()] || "");
          const resolvedProject = resolveProject(pidxG, legacyProject);
          // El carrusel sigue limitado a las primeras 40 fichas, pero sale del
          // mapa precargado de la página, no de 3 queries por decisión.
          const batch = (i < 40 && isMissionDecision(o, d))
            ? (batchMap.get(d.batch_id || batchIdForDecision(d.id)) || null) : null;
          return { id: d.id, machine: d.machine, agent: d.agent, surface: d.surface, question: d.question,
                   options: o, option_targets, recommended: d.recommended, status: d.status, chosen: d.chosen,
                   // QUIÉN decidió: lo escribe /decisions/<id>/choose desde siempre,
                   // pero nunca salía por aquí, así que el histórico no podía
                   // distinguir «lo eligió Carlos» de «venció y tiró la recomendada».
                   chosen_by: d.chosen_by || "",
                   url: d.url || "", mission: d.mission || "",
                   project: resolvedProject.name, project_id: resolvedProject.id,
                   project_slug: d.project_slug || "",
                   parent_decision: d.parent_decision || "", batch_id: d.batch_id || "",
                   batch,
                   created_at: d.created_at, deadline: d.deadline, decided_at: d.decided_at,
                   secondsLeft: Math.max(0, Math.round((d.deadline - now) / 1000)) };
        });
        await attachDisplayRefs(env, "window", items, (row) => row.id, (row) => row.created_at);
        // `query` devuelve lo que REALMENTE se aplicó (un ?limit=9999 se recorta a
        // 500) y `next_until` da el cursor para pedir la página siguiente hacia
        // atrás: &until=<next_until-1>. null = no hay más.
        return json({ ok: true, items, count: items.length,
                      query: { all, since, until, limit, agent: agentQ || null, status: statusQ.length ? statusQ : null },
                      next_until: items.length === limit ? items[items.length - 1].created_at : null });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    if (/^\/decisions\/[^/]+\/choose$/.test(url.pathname) && req.method === "POST") {
      try {
        await ensureSchema(env);
        const id = decodeURIComponent(url.pathname.split("/")[2]);
        const b = await req.json();
        const idx = +b.choice;
        const d = await env.DB.prepare("SELECT * FROM decisions WHERE id=?").bind(id).first();
        if (!d) return json({ ok: false, error: "not_found" }, 404);
        if (d.status !== "pending") return json({ ok: false, error: "decision_closed", status: d.status, chosen: d.chosen }, 409);
        let o = []; try { o = JSON.parse(d.options || "[]"); } catch (e) {}
        if (!(idx >= 0 && idx < o.length)) return json({ ok: false, error: "choice fuera de rango" }, 400);
        const initial = isInitialMissionDecision(o);
        const custom = initial && idx === 4;
        const customText = String(b.custom_text || "").trim().replace(/\s+/g, " ").slice(0, 180);
        if (custom && !customText) return json({ ok: false, error: "custom_text requerido" }, 400);
        if (custom) {
          o[4] = "✍️ Custom: " + customText;
          await env.DB.prepare("UPDATE decisions SET options=? WHERE id=?").bind(JSON.stringify(o), id).run();
        }
        const back = initial ? idx === 3 : idx === o.length - 1 && isMissionDecision(o, d);
        await env.DB.prepare("UPDATE decisions SET status=?, chosen=?, chosen_by=?, decided_at=? WHERE id=?")
          .bind(back ? "cancelled" : "decided", idx, String(b.by || "Carlos").slice(0, 40), Date.now(), id).run();
        const chosen = await env.DB.prepare("SELECT * FROM decisions WHERE id=?").bind(id).first();
        const batch = back ? null : await ensureMissionBatchFromDecision(env, chosen);
        if (batch && batch.ok === false) return json(batch, batch.status || 400);
        // Elegir temática en una ventana de formación cambia la cápsula de esa hora
        // AQUÍ MISMO, no en el siguiente barrido: quien pulsa espera ver la Academia
        // cambiada al recargar, no dentro de un minuto.
        const formacion = await aplicaEleccionFormacion(env, chosen);
        await attachDisplayRefs(env, "window", chosen, (row) => row.id, (row) => row.created_at);
        return json({ ok: true, id, display_ref: chosen.display_ref, chosen: idx, option: o[idx], cancelled: back, batch, formacion });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    if (/^\/decisions\/[^/]+$/.test(url.pathname) && req.method === "GET") {
      try {
        await ensureSchema(env);
        const id = decodeURIComponent(url.pathname.split("/")[2]);
        let d = await env.DB.prepare("SELECT * FROM decisions WHERE id=?").bind(id).first();
        if (!d) return json({ ok: false, error: "not_found" }, 404);
        if (d.status === "pending" && d.deadline < Date.now()) {
          await env.DB.prepare("UPDATE decisions SET status='expired' WHERE id=? AND status='pending'").bind(id).run();
          d = await env.DB.prepare("SELECT * FROM decisions WHERE id=?").bind(id).first();
        }
        let o = []; try { o = JSON.parse(d.options || "[]"); } catch (e) {}
        const targetContract = normalizeDecisionOptionTargets(d.option_targets, o, !!d.parent_decision);
        const now = Date.now();
        const batch = await ensureMissionBatchFromDecision(env, d);
        if (batch && batch.ok === false) return json(batch, batch.status || 400);
        const expired = d.status === "expired";
        const pOne = resolveProject(await projectIndex(env), d.project || "");
        const item = { id: d.id, status: d.status,
                      chosen: d.chosen, recommended: d.recommended, options: o,
                      option_targets:targetContract.ok ? targetContract.targets : [],
                      project: pOne.name, project_id: pOne.id, project_slug: d.project_slug || "", mission: d.mission || "", url: d.url || "",
                      parent_decision: d.parent_decision || "", batch_id: d.batch_id || "",
                      // si venció sin respuesta, el agente tira con la recomendada
                      effective: d.status === "decided" || d.status === "cancelled" ? d.chosen : (expired ? d.recommended : null),
                      batch,
                      created_at: d.created_at, deadline: d.deadline, decided_at: d.decided_at,
                      secondsLeft: Math.max(0, Math.round((d.deadline - now) / 1000)) };
        await attachDisplayRefs(env, "window", item, (row) => row.id, (row) => row.created_at);
        return json({ ok: true, ...item });
      } catch (e) { return json({ error: String(e) }, 500); }
    }
    if (url.pathname === "/prefs/customize" && req.method === "GET") {
      try {
        await ensureSchema(env);
        const row = await env.DB.prepare("SELECT value FROM prefs WHERE key='customize'").first();
        let c = {};
        try { c = row && row.value ? JSON.parse(row.value) : {}; } catch (e) {}
        return json({ ok: true, customize: c });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/prefs/customize" && req.method === "POST") {
      try {
        const sess = await requireAuth(env, req);
        if (!sess) return json({ error: "unauthorized" }, 401);
        const b = await req.json();
        const c = b && b.customize && typeof b.customize === "object" ? b.customize : null;
        if (!c) return json({ ok: false, error: "customize (objeto) requerido" }, 400);
        const v = JSON.stringify(c);
        if (v.length > 1e5) return json({ ok: false, error: "customize demasiado grande" }, 413);
        await ensureSchema(env);
        await env.DB.prepare("INSERT INTO prefs (key,value,updated_at) VALUES ('customize',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(v, Date.now()).run();
        return json({ ok: true });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    // ELIMINAR misiones (Carlos, 2026-07-19): borrado REAL de ticket + eventos +
    // tareas, en bloque. La UI exige doble confirmación; aquí el cinturón es el
    // campo confirm:"ELIMINAR" obligatorio. Si la misión venía de FLOTA, su
    // encargo del bot-inbox se marca done (nota «eliminada») para que
    // /fleet/sync no la resucite en el siguiente ciclo.
    if (url.pathname === "/tickets/delete" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map((x) => String(x)).filter(Boolean))] : [];
        if (!ids.length || b.confirm !== "ELIMINAR") {
          return json({ ok: false, error: 'ids (array) y confirm:"ELIMINAR" requeridos' }, 400);
        }
        const author = String(b.author || "Misiones (bloque)").slice(0, 40);
        const fleetInboxIds = [];
        let deleted = 0;
        for (const id of ids) {
          const t = await env.DB.prepare("SELECT id,source,screen FROM tickets WHERE id=?").bind(id).first();
          if (!t) continue;
          // Nº de encargo REAL (fleet_ids → screen → FLT) antes de borrar el ticket. (FLT-990 c)
          const iid = await fleetEncargoId(env, id, t.screen);
          if (t.source === "fleet" && iid) fleetInboxIds.push(iid);
          await env.DB.prepare("DELETE FROM events WHERE ticket_id=?").bind(id).run();
          await env.DB.prepare("DELETE FROM mission_tasks WHERE mission_id=?").bind(id).run();
          await env.DB.prepare("DELETE FROM tickets WHERE id=?").bind(id).run();
          deleted++;
        }
        if (fleetInboxIds.length && env.TELEGRAM) {
          try {
            await env.TELEGRAM.fetch(new Request("https://bot.yokup.com/api/bot-inbox/bulk-status", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ ids: fleetInboxIds, status: "done", by: author, note: "Misi\u00f3n ELIMINADA desde yokup.com/misiones." })
            }));
          } catch (e) {}
        }
        return json({ ok: true, deleted });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/ticket/status" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        const current = await env.DB.prepare("SELECT id,source,assignee,loc,screen FROM tickets WHERE id=?").bind(b.id).first();
        if (b.status === "resolved" && current && current.source === "fleet" && !(await hasMissionProof(env, b.id))) {
          return json({ ok: false, error: "No se puede finalizar sin pantallazo del trabajo realizado", missing_proof: [b.id] }, 409);
        }
        const isBatchMission = !!(current && current.source === "decision-batch");
        const evidence = String(b.evidence || "").trim().slice(0, 2000);
        const acceptedBy = String(b.accepted_by || "").trim().slice(0, 80);
        if (isBatchMission && b.status === "resolved" && (!evidence || !acceptedBy)) {
          return json({
            ok: false,
            error: "La cola sólo avanza con evidencia y aceptación explícita del Agente.",
            requires: ["evidence", "accepted_by"]
          }, 409);
        }
        const now = Date.now();
        const resolvedAt = b.status === "resolved" ? now : null;
        await env.DB.prepare("UPDATE tickets SET status=?, updated_at=?, resolved_at=? WHERE id=?").bind(b.status, now, resolvedAt, b.id).run();
        await addEvent(env, b.id, "status", b.author || "T\xE9cnico", `Estado \u2192 ${b.status}${b.note ? ": " + b.note : ""}`);
        let batch = null;
        if (isBatchMission) {
          const batchId = await batchForMission(env, b.id);
          if (b.status === "resolved") {
            if (!(await batchClosureAccepted(env, b.id))) {
              await addEvent(env, b.id, "accept", acceptedBy, "Cierre aceptado por el Agente. Evidencia: " + evidence);
            }
            if (/^https?:\/\//i.test(evidence)) {
              await env.DB.prepare("UPDATE tickets SET proof_image=COALESCE(NULLIF(proof_image,''),?) WHERE id=?").bind(evidence, b.id).run();
            }
          }
          if (batchId) {
            const pauseReason = b.status === "cancelled" ? "La misión activa fue cancelada expresamente."
              : b.status === "blocked" && b.requires_carlos === true ? "Bloqueada: requiere decisión de Carlos."
              : b.new_priority === true || b.pause_batch === true ? "Pausada por nueva prioridad explícita del Agente."
              : "";
            batch = pauseReason ? await pauseMissionBatch(env, batchId, pauseReason)
              : b.status === "resolved" ? await completeBatchMissionAndAwaitContinuation(env, batchId, b.id)
              : await missionBatchSnapshot(env, batchId);
          }
        }
        let targetBatch = null;
        if (b.status === "resolved") {
          targetBatch = await reconcileBatchTargetMission(env, b.id);
        }
        // Cerrar (o reabrir) a mano una misi\u00f3n de FLOTA baja tambi\u00e9n al encargo.
        {
          const t = current;
          if (t && t.source === "fleet") {
            // Vía WEB, mismo criterio que la de agente (FLT-989 b2): al finalizar una
            // misión de flota, la prueba de respaldo asciende por el punto único.
            if (b.status === "resolved") await ascendMissionProof(env, b.id);
            const inboxStatus = b.status === "resolved" ? "done" : b.status === "in_progress" ? "in_progress" : b.status === "cancelled" ? "cancelled" : "pending";
            await fleetPushStatus(env, t, inboxStatus);
          }
        }
        if (b.status === "resolved" && env.VECTORIZE) {
          const t = await env.DB.prepare("SELECT * FROM tickets WHERE id=?").bind(b.id).first();
          const ev = await env.DB.prepare("SELECT text FROM events WHERE ticket_id=?").bind(b.id).all();
          const vec = await embed(env, `${t.subject} (${t.screen}). ${(ev.results || []).map((e) => e.text).join(" ")}`);
          if (vec) {
            try {
              await env.VECTORIZE.upsert([{ id: b.id, values: vec, metadata: { id: b.id, subject: t.subject, screen: t.screen } }]);
            } catch (e) {
            }
          }
        }
        return json({ ok: true, batch, target_batch:targetBatch,
          reconciliation_partial:!!(targetBatch && !targetBatch.ok) });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/stats") {
      try {
        await ensureSchema(env);
        return json(await stats(env));
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    // Resumen MÍNIMO para el aviso del móvil. Público a propósito pero inútil sin
    // la llave del dispositivo: sólo devuelve el titular de la última incidencia
    // abierta, nunca la bandeja entera. Va ANTES del guardia: el service worker
    // no puede autenticarse con la sesión Google.
    if (url.pathname === "/push/peek") {
      try {
        await ensureSchema(env);
        const k = url.searchParams.get("k") || "";
        if (!k) return json({ error: "sin llave" }, 401);
        const ok = await env.DB.prepare("SELECT 1 AS x FROM subs WHERE peek_key=?").bind(k).first();
        if (!ok) return json({ error: "llave no válida" }, 401);
        const t = await env.DB.prepare(
          "SELECT id, subject, screen, assignee FROM tickets WHERE status='open' ORDER BY created_at DESC LIMIT 1"
        ).first();
        return json({ ok: true, ticket: t || null });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/push/subscribe" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        // LLAVE DE LECTURA DEL SERVICE WORKER. El push va SIN payload (evita la
        // criptografía de RFC8291), así que el sw.js tiene que preguntar QUÉ
        // incidencia anunciar. Pero /tickets está tras el perímetro Google y un
        // service worker no lleva sesión: ese fetch daba 401 y el aviso salía
        // siempre genérico ("se ha abierto un ticket"), sin decir cuál.
        // Se emite aquí —esta ruta YA exige sesión— una clave aleatoria por
        // dispositivo, que el SW usa contra /push/peek. No abre el perímetro:
        // es por dispositivo, inadivinable, y muere con la suscripción.
        let key = "";
        if (b.endpoint) {
          const prev = await env.DB.prepare("SELECT peek_key FROM subs WHERE endpoint=?").bind(b.endpoint).first();
          key = (prev && prev.peek_key) || crypto.randomUUID().replace(/-/g, "");
          await env.DB.prepare("INSERT INTO subs(endpoint,created_at,peek_key) VALUES(?,?,?) ON CONFLICT(endpoint) DO UPDATE SET peek_key=excluded.peek_key")
            .bind(b.endpoint, Date.now(), key).run();
        }
        return json({ ok: true, key, count: (await env.DB.prepare("SELECT COUNT(*) c FROM subs").first())?.c || 0 });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/agents") {
      try {
        await ensureSchema(env);
        const { results } = await env.DB.prepare("SELECT assignee, status, COUNT(*) n, AVG(CASE WHEN status='resolved' AND resolved_at >= created_at AND resolved_at - created_at < 31536000000 THEN resolved_at-created_at END) mttr FROM tickets GROUP BY assignee,status").all();
        const map = {};
        for (const r of results || []) {
          const a = map[r.assignee] || (map[r.assignee] = { open: 0, in_progress: 0, resolved: 0, mttr: null });
          a[r.status] = r.n;
          if (r.status === "resolved" && r.mttr) a.mttr = Math.round(r.mttr / 6e4);
        }
        // La plantilla sale del CENSO, no de la constante. Se conserva la forma
        // de la respuesta (name/skills/zone + contadores) para no romper a
        // /agentes ni a la bandeja, y se añade lo que el censo sí sabe y la
        // constante no podía saber: id, estado y foco.
        const ahora = Date.now();
        const agents = (await carbonRoster(env)).map((t) => {
          const fila = carbonRow(t, ahora);
          return Object.assign({}, fila, { skills: fila.skills.join(", ") },
            map[t.name] || { open: 0, in_progress: 0, resolved: 0, mttr: null });
        });
        return json({ agents });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/ticket/simulate" && req.method === "POST") {
      try {
        await ensureSchema(env);
        let screen, loc = "", role = "", age = 300;
        try {
          const r = await fetch("https://api.admira.store/signage/screens");
          const d = await r.json();
          const s = (d.screens || []).find((x) => x.online);
          if (s) {
            screen = s.screen;
            loc = s.locName || s.loc || "";
            role = s.role || "";
          }
        } catch (e) {
        }
        if (!screen) {
          const c = ["Gr\xE0cia \xB7 Barcelona", "Madrid Centro", "Eixample \xB7 Barcelona", "Sant Andreu \xB7 Barcelona", "Sants \xB7 Barcelona"];
          screen = "demo-" + Math.random().toString(36).slice(2, 7);
          loc = c[Math.floor(Math.random() * c.length)];
          role = "DOOH";
        }
        const id = await createTicket(env, { screen, loc, role, age, source: "agent-iot" });
        return json({ ok: true, id });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/ai-summary" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        const { results } = await env.DB.prepare("SELECT kind,author,text FROM events WHERE ticket_id=? ORDER BY id ASC").bind(b.id).all();
        const convo = (results || []).map((e) => `[${e.author}] ${e.text}`).join("\n");
        const text = await aiRun(env, `Resume esta incidencia de soporte t\xE9cnico (pantallas DOOH) en 2 frases en espa\xF1ol, clara para un responsable. Di el estado y lo pendiente.

${convo}`, 140);
        return json({ text });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/ai-suggest" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        const { results } = await env.DB.prepare("SELECT kind,author,text FROM events WHERE ticket_id=? ORDER BY id ASC").bind(b.id).all();
        const convo = (results || []).map((e) => `[${e.author}] ${e.text}`).join("\n");
        const text = await aiRun(env, `Eres el copiloto del t\xE9cnico en una incidencia de pantallas DOOH. Sugiere el SIGUIENTE PASO concreto (una nota breve, m\xE1x 40 palabras, en espa\xF1ol, en primera persona como si fuera el t\xE9cnico) seg\xFAn la conversaci\xF3n:

${convo}`, 120);
        return json({ text });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/kb-search") {
      try {
        await ensureSchema(env);
        const q = url.searchParams.get("q") || "";
        let ids = [], semantic = false;
        if (env.VECTORIZE) {
          const vec = await embed(env, q);
          if (vec) {
            try {
              const m = await env.VECTORIZE.query(vec, { topK: 5, returnMetadata: true });
              ids = (m.matches || []).filter((x) => x.score > 0.3).map((x) => x.id);
              semantic = ids.length > 0;
            } catch (e) {
            }
          }
        }
        let rows;
        if (ids.length) {
          const ph = ids.map(() => "?").join(",");
          rows = (await env.DB.prepare(`SELECT t.id,t.subject,t.screen, GROUP_CONCAT(e.text,' | ') notes FROM tickets t LEFT JOIN events e ON e.ticket_id=t.id WHERE t.id IN (${ph}) GROUP BY t.id`).bind(...ids).all()).results || [];
        } else {
          rows = (await env.DB.prepare("SELECT t.id,t.subject,t.screen, GROUP_CONCAT(e.text,' | ') notes FROM tickets t LEFT JOIN events e ON e.ticket_id=t.id WHERE t.status='resolved' GROUP BY t.id ORDER BY t.resolved_at DESC LIMIT 8").all()).results || [];
        }
        const kb = rows.map((r) => `#${r.id} (${r.screen}): ${r.subject}. ${String(r.notes || "").slice(0, 400)}`).join("\n\n");
        const text = await aiRun(env, `Eres la base de conocimiento de soporte de Yokup (pantallas DOOH). Bas\xE1ndote SOLO en estas incidencias resueltas anteriores, responde a la consulta del t\xE9cnico en espa\xF1ol (m\xE1x 70 palabras): pasos recomendados y, si aplica, cita el #id de la incidencia similar. Si no hay nada parecido, dilo.

INCIDENCIAS RESUELTAS:
${kb || "(a\xFAn no hay incidencias resueltas)"}

CONSULTA: ${q}`, 180);
        return json({ text, semantic, sources: rows.map((r) => ({ id: r.id, screen: r.screen, subject: r.subject })) });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname === "/copilot" && req.method === "POST") {
      try {
        const b = await req.json();
        await ensureSchema(env);
        const q = String(b.question || "").slice(0, 500);
        const open = (await env.DB.prepare("SELECT id,screen,subject,assignee,priority,status FROM tickets WHERE status!='resolved' ORDER BY created_at DESC LIMIT 8").all()).results || [];
        let kb = [];
        if (env.VECTORIZE) {
          const v = await embed(env, q);
          if (v) {
            try {
              const m = await env.VECTORIZE.query(v, { topK: 3, returnMetadata: true });
              const ids = (m.matches || []).map((x) => x.id);
              if (ids.length) {
                const ph = ids.map(() => "?").join(",");
                kb = (await env.DB.prepare(`SELECT t.id,t.subject, GROUP_CONCAT(e.text,' ') notes FROM tickets t LEFT JOIN events e ON e.ticket_id=t.id WHERE t.id IN (${ph}) GROUP BY t.id`).bind(...ids).all()).results || [];
              }
            } catch (e) {
            }
          }
        }
        const s = await stats(env);
        const ctx = `ESTADO: ${s.open} abiertas, ${s.in_progress} en curso, ${s.resolved} resueltas, MTTR ${s.mttr ?? "\u2014"} min.
TICKETS ACTIVOS:
${open.map((t) => `#${t.id} ${t.subject} (${t.screen}) \xB7 ${t.assignee} \xB7 ${t.priority} \xB7 ${t.status}`).join("\n") || "(ninguno)"}
CONOCIMIENTO (incidencias resueltas parecidas):
${kb.map((k) => `#${k.id}: ${k.subject}. ${String(k.notes || "").slice(0, 280)}`).join("\n") || "(nada)"}`;
        const text = await aiRun(env, `Eres "Admira", el copiloto con avatar del helpdesk Yokup (mantenimiento de pantallas DOOH de admira.tv). Hablas con el t\xE9cnico. Responde en espa\xF1ol, natural y MUY BREVE (m\xE1x 45 palabras, se lee en voz alta), usando el contexto. Si preguntan el estado, res\xFAmelo. Si es una aver\xEDa, da el paso concreto y cita #id si hay uno parecido. Nada de markdown.

${ctx}

T\xC9CNICO: ${q}`, 160);
        return json({ text: text || "Ahora mismo no puedo responder, int\xE9ntalo de nuevo." });
      } catch (e) {
        return json({ error: String(e) }, 500);
      }
    }
    if (url.pathname.startsWith("/room/")) {
      const id = url.pathname.split("/")[2] || "default";
      const stub = env.ROOM.get(env.ROOM.idFromName(id));
      return stub.fetch(req);
    }
    return new Response("yokup-rtc \xB7 helpdesk API + realtime", { headers: CORS });
  },
  // Cron cada 2 min: reconcilia pantallas→tickets y encargos de la flota→misiones,
  // aunque nadie mire la bandeja. Un fallo en uno no debe tumbar al otro.
  async scheduled(event, env, ctx) {
    // MISMO cuerpo que el latido HTTP y el MISMO cerrojo D1 (FLT-1016 c): si el cron
    // revive, no se solapa con el latido (idempotencia total, cero duplicación de
    // código). runScheduledRoutine hace ensureSchema y envuelve cada sub-rutina en su
    // try/catch con su latido en worker_beats. La platafoma HOY no dispara esto —el
    // latido HTTP lo cubre—, pero queda listo para cuando el cron vuelva.
    try {
      if (await tryAcquireBeatLease(env, "__scheduled", 120000)) await runScheduledRoutine(env, event);
    } catch (e) {}
  }
};
var index_default = {
  async fetch(req, env, ctx) {
    return withCredentialCors(await worker_app.fetch(req, env, ctx), req);
  },
  scheduled(event, env, ctx) {
    return worker_app.scheduled(event, env, ctx);
  }
};
var Room = class {
  static {
    __name(this, "Room");
  }
  constructor(state, env) {
    this.peers = /* @__PURE__ */ new Map();
  }
  async fetch(req) {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    const id = crypto.randomUUID().slice(0, 8);
    server.send(JSON.stringify({ type: "welcome", id, peers: [...this.peers.keys()] }));
    for (const s of this.peers.values()) {
      try {
        if (s.readyState === 1) s.send(JSON.stringify({ type: "peer-joined", id }));
      } catch (e) {
      }
    }
    this.peers.set(id, server);
    server.addEventListener("message", (evt) => {
      let m;
      try {
        m = JSON.parse(evt.data);
      } catch (e) {
        return;
      }
      const target = this.peers.get(m.to);
      if (target && target.readyState === 1) {
        m.from = id;
        try {
          target.send(JSON.stringify(m));
        } catch (e) {
        }
      }
    });
    const bye = /* @__PURE__ */ __name(() => {
      this.peers.delete(id);
      for (const s of this.peers.values()) {
        try {
          if (s.readyState === 1) s.send(JSON.stringify({ type: "peer-left", id }));
        } catch (e) {
        }
      }
    }, "bye");
    server.addEventListener("close", bye);
    server.addEventListener("error", bye);
    return new Response(null, { status: 101, webSocket: client });
  }
};
export {
  PtyRoom,
  Room,
  // Puras y sin estado: se exportan para poder PROBARLAS. Un worker de módulos sólo
  // usa `default` como manejador; los demás nombres no cambian su comportamiento.
  extraerPlanExplicito,
  palabrasDeContenido,
  subtareaRespaldada,
  flattenSteps,
  proposePlan,
  index_default as default
};
//# sourceMappingURL=index.js.map
