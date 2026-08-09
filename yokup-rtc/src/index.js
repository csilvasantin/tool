import puppeteer from "@cloudflare/puppeteer";
import { memberRefMatches, resolveDecisionIdentity, resolveDecisionProject, selectDecisionProjectAssignment, projectSlug as decisionProjectSlug } from "./decision-project.js";
import { baseAgentIdentity, identityKey, machineSuffix, parseAgentIdentity, reportAgentFamily, reportAgentIdentity, scopedAgentIdentity, sameAgentFamily } from "./agent-identity.js";
import { buildReportsPageFilter, encodeReportsCursor, parseReportsPageOptions } from "./reports-pagination.js";
import { parseDecideOptions, ideaDeliberationText, buildDecideDecisionOptions } from "./ideas-decide.js";
import { AgentStopError, dispatchAgentStop, normalizeAgentStopTarget } from "./fleet-agent-stop.js";
import { DISPLAY_REF_ENTITY_TYPES, epochMillis, formatDisplayRef, madridDayKey, madridDayStart, sortDisplayRefCandidates } from "./display-ref.js";
import { MISSION_NOVELTY_DECISION_INDEX_SQL, MISSION_NOVELTY_INDEX_SQL, MISSION_NOVELTY_INSERT_SQL, MISSION_NOVELTY_RECENT_SQL, MISSION_NOVELTY_TABLE_SQL, missionNoveltyContract, missionNoveltyEventKey } from "./mission-novelty.js";
import { PROJECT_NOVELTY_INDEX_SQL, PROJECT_NOVELTY_INSERT_SQL, PROJECT_NOVELTY_RECENT_SQL, PROJECT_NOVELTY_TABLE_SQL, projectNoveltyContract, projectNoveltyEventKey } from "./project-novelty.js";
import { resolveIdeaAuthor } from "./idea-author.js";
import { missionProofOrigin } from "./proof-origin.js";
import { validateCoachCompletion, validateCoachLaunch, coachLessonForSlot, COACH_AUDIENCES, COACH_HOUR } from "./academy-coach.js";
import { missionDayRange, missionVisibleCounts, missionVisibleDetails,
  onIdleEligibility, taskVisibleDetails } from "./mission-visible.js";
import { DAILY_MISSION_CLOSE_AUTHOR, DAILY_MISSION_CLOSE_EVENT_KIND, DAILY_MISSION_CLOSE_LEASE_MS, DAILY_MISSION_CLOSE_REASON, MISSION_UNCONCLUDED_AFTER_MS, dailyMissionCloseEventText, dailyMissionClosePlan } from "./daily-mission-close.js";
import { selectOnIdleProposals } from "./onidle-proposals.js";
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
var WL_API = "https://admira-whitelist.csilvasantin.workers.dev";
var WL_FALLBACK = ["csilva@admira.com", "csilvasantin@gmail.com", "mzavaleta@admira.com", "agonzalez@admira.com", "jsedano@admira.com"];
var PROTECTED = /* @__PURE__ */ new Set(["/copilot", "/tickets", "/tickets/status", "/tickets/delete", "/tasks/all", "/ticket", "/ticket/note", "/ticket/status", "/ticket/simulate", "/incidents", "/stats", "/agents", "/ai-triage", "/ai-summary", "/ai-suggest", "/kb-search", "/push/subscribe", "/fleet/nudge", "/fleet/agent/stop", "/equipo/machine", "/equipo/silicon", "/strategy", "/config"]);
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
  const p = b64uJson({ email, name:String(name || "").replace(/\s+/g, " ").trim().slice(0, 80), exp: Date.now() + 12 * 3600 * 1e3 });
  return p + "." + b64u(await hmac(env, p));
}
__name(makeSession, "makeSession");
async function readSession(env, token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [p, sig] = token.split(".");
  if (b64u(await hmac(env, p)) !== sig) return null;
  try {
    const body = JSON.parse(decodeURIComponent(escape(atob(p.replace(/-/g, "+").replace(/_/g, "/")))));
    if (!body.exp || Date.now() > body.exp) return null;
    return body;
  } catch (e) {
    return null;
  }
}
__name(readSession, "readSession");
async function requireAuth(env, req) {
  const h = req.headers.get("authorization") || "";
  return readSession(env, h.replace(/^Bearer\s+/i, ""));
}
__name(requireAuth, "requireAuth");
async function verifyGoogle(cred) {
  try {
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(cred));
    if (!r.ok) return null;
    const d = await r.json();
    if (d.aud !== AUTH_CLIENT_ID) return null;
    if (d.email_verified !== "true" && d.email_verified !== true) return null;
    if (!d.email) return null;
    return d;
  } catch (e) {
    return null;
  }
}
__name(verifyGoogle, "verifyGoogle");
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
function hash(s) {
  let h = 0;
  for (const c of String(s)) h = h * 31 + c.charCodeAt(0) >>> 0;
  return h;
}
__name(hash, "hash");
async function applySchema(env) {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, screen TEXT, subject TEXT, loc TEXT, role TEXT, status TEXT, priority TEXT, assignee TEXT, source TEXT, ai_triage TEXT, created_at INTEGER, updated_at INTEGER, resolved_at INTEGER)");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT, ts INTEGER, kind TEXT, author TEXT, text TEXT)");
  await env.DB.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_open_screen ON tickets(screen) WHERE status != 'resolved'");
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
  // AUTENTICADO en el Highscore (perimetro Google); el ejecutor de cada maquina solo
  // recoge ordenes YA autorizadas. El punto de control es la creacion, no la recogida.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS cli_commands (id TEXT PRIMARY KEY, machine TEXT NOT NULL, cli TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', requested_by TEXT, detail TEXT, created_at INTEGER NOT NULL, updated_at INTEGER)");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_cli_commands_pend ON cli_commands(machine,status,created_at)");
  // Latido: cada ejecutor dice si SU cli esta vivo. Sin latido reciente no se afirma
  // que este apagado, se dice que no se sabe: son cosas distintas.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS cli_state (machine TEXT NOT NULL, cli TEXT NOT NULL, alive INTEGER, pid INTEGER, seen_at INTEGER NOT NULL, PRIMARY KEY(machine,cli))");
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
  await env.DB.exec("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT, blurb TEXT, web TEXT, status TEXT DEFAULT 'activo', color TEXT, created_at INTEGER, updated_at INTEGER, updated_by TEXT)");
  // Sólo las altas posteriores a este esquema escriben aquí. No se hace backfill:
  // el despliegue establece baseline y no anuncia como nuevos proyectos históricos.
  await env.DB.exec(PROJECT_NOVELTY_TABLE_SQL);
  await env.DB.exec(PROJECT_NOVELTY_INDEX_SQL);
  // Un proyecto toca VARIAS máquinas y VARIOS agentes. `kind` distingue los dos
  // planos que la sección Equipo ya separa (átomos/bits) y `ref` es el id que
  // usa admira-fleet (machines[].id / silicon[].id): NO se inventa censo nuevo.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS project_members (project_id TEXT, kind TEXT, ref TEXT, added_at INTEGER, PRIMARY KEY (project_id, kind, ref))");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_pmembers_ref ON project_members(kind, ref)");
  // PROYECTO PRINCIPAL DIARIO por identidad operativa exacta. Es una declaración
  // temporal y auditable: NO convierte al agente en miembro, NO cambia owner y
  // NO reescribe ids del censo. La clave día+agente hace idempotente repetir
  // «hoy el proyecto principal de X es Y» y conserva los días anteriores.
  await env.DB.exec("CREATE TABLE IF NOT EXISTS agent_project_declarations (day TEXT NOT NULL, agent_key TEXT NOT NULL, agent TEXT NOT NULL, project_id TEXT NOT NULL, declared_by TEXT, statement TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(day,agent_key))");
  await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_apd_project_day ON agent_project_declarations(project_id,day)");
  // RESPONSABLE PRINCIPAL del proyecto. Se conserva la columna `owner` para no
  // romper a los clientes históricos, pero el contrato público también lo expone
  // como `primary_responsible`. Si aún no se ha guardado uno, el responsable por
  // defecto compartido con AdmiraNeXT Webmaster es NeoMacMini.
  await env.DB.exec("ALTER TABLE projects ADD COLUMN owner TEXT").catch(() => {});
  // ORDEN de las fichas, el que Carlos deja al arrastrarlas. Va en la tabla y no
  // en el navegador a propósito: el orden es del proyecto, no del portátil desde
  // el que se miró. NULL = nunca se ha tocado → cae al orden de siempre.
  await env.DB.exec("ALTER TABLE projects ADD COLUMN sort_order INTEGER").catch(() => {});
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
var STOCK_INDEX_URL = "https://pub-bf043a4daa3b43b7a0b769617729d074.r2.dev/stock/index.json";
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
// ── GUIONES: LO QUE EL CONSEJERO APRENDE, NO EL TÍTULO DEL VÍDEO ────────────
// Hasta aquí, al prompt de una silla le entraba el TÍTULO de la pieza. Un vídeo de
// cinco minutos de Dieter Rams aportaba la cadena «Dieter Rams: Less but Better» y
// nada más: eso es una bibliografía, no conocimiento. Se le podían subir sesenta
// vídeos y seguía sabiendo exactamente lo mismo.
//
// Un guión es una pieza de texto —un tipo nuevo del Stock— con lo que ese vídeo le
// enseña a ESA silla, etiquetada igual que el vídeo (alias + formación) y apuntando
// a él en `externalRef`. Dos consecuencias que no son obvias:
//  · el guión SUSTITUYE a su vídeo en la cabeza del consejero. Si entraran los dos,
//    leería el título y el guión, y el título ya no aporta nada. El vídeo se queda
//    como fuente y evidencia, no como conocimiento.
//  · contar PIEZAS deja de valer. Ocho títulos son ~400 caracteres; ocho guiones,
//    ~5.000. La ventana pasa a tener también presupuesto de texto.
var COUNCIL_GUION_TYPE = "guion";
var COUNCIL_GUION_MAX = 900;              // caracteres de UN guión en el prompt
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
// Lo que pesa una pieza en el prompt. un título son 40 caracteres; un guión, 900.
// La ventana tiene que contar esto y no «piezas», o el presupuesto lo fija el azar
// de cuántos guiones hayan caído en los ocho huecos.
function pesoEnPrompt(p) {
  return (String(p && p.title || "").length + String(p && p.note || "").length + 4);
}
__name(pesoEnPrompt, "pesoEnPrompt");
// Toma de una lista ya ordenada (más nueva primero) mientras quepa en SUS huecos y
// en SU presupuesto. La primera pieza entra siempre aunque se pase: media idea es
// peor que una idea larga, y un guión cortado a la mitad no enseña nada.
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
// Un vídeo con guión ya no entra en la cabeza del consejero: entraría su título al
// lado del guión que lo explica, y el título no añade nada. El vídeo sigue en el
// Stock y en el recuento —es la fuente y la evidencia—, pero deja de ser lo que se
// lee. El enlace lo declara el guión en `externalRef`; si no lo trae, vale que se
// llamen igual, que es como los sube quien transcribe.
function sustituyePorGuiones(piezas) {
  const cubiertas = /* @__PURE__ */ new Set();
  for (const p of piezas) {
    if (!p.guion) continue;
    if (p.fuente) cubiertas.add(p.fuente);
    const porTitulo = normalizaEtiqueta(p.title);
    if (porTitulo) cubiertas.add(porTitulo);
  }
  if (!cubiertas.size) return piezas;
  return piezas.filter((p) => p.guion ||
    !(cubiertas.has(normalizaEtiqueta(p.id)) || cubiertas.has(normalizaEtiqueta(p.title))));
}
__name(sustituyePorGuiones, "sustituyePorGuiones");
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
    // GUIÓN, en cambio, el comentario ES el conocimiento y se conserva entero.
    const nota = String(it.comment || "").trim();
    const soloEtiqueta = normalizaEtiqueta(nota) === tag;
    const esGuion = String(it.type || "").toLowerCase() === COUNCIL_GUION_TYPE;
    // El origen sale de la ETIQUETA, no de quién llamó: una pieza que subió Carlos y
    // otra que trajo admira.live se distinguen en el índice o no se distinguen en
    // ninguna parte. Sin `#formacion` una pieza es «dada», que es como estaba.
    const formado = it.tags.some((t) => normalizaEtiqueta(t) === formacion);
    const dur = Number(it.duration || it.duracion || 0) || 0;
    return { id: it.id || "", type: it.type || "", at: it.createdAt || "",
      title: String(it.title || "").trim().slice(0, 200),
      note: soloEtiqueta ? "" : nota.slice(0, esGuion ? COUNCIL_GUION_MAX : 300),
      origin: formado ? "formado" : "dado",
      guion: esGuion,
      // De qué pieza es este guión. Sin esto no se puede sustituir al vídeo.
      fuente: normalizaEtiqueta(it.externalRef || ""),
      duracion: dur, vistas: Number(it.views || it.vistas || 0) || 0,
      largo: dur > COUNCIL_VIDEO_MAX_SECS,
      url: it.url || "" };
  }).filter((p) => p.title || p.note));
  return ventanaReservada(sustituyePorGuiones(piezas), limit);
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
// Las cuatro lecciones son las de admira.academy, palabra por palabra. Son el
// respaldo cuando una silla no tiene material propio: preferimos enseñar algo
// verdadero de la casa antes que dejar la hora en blanco.
var ACADEMY_LECCIONES = [
  { id:"identity",  title:"Identidad y normativa", summary:"Saber quién actúa, con qué fuente y bajo qué reglas." },
  { id:"ecosystem", title:"Mapa del ecosistema",   summary:"Entender cómo encaja la silla en la suite AdmiraNeXT." },
  { id:"mission",   title:"Misión con evidencia",  summary:"Convertir criterio en una entrega comprobable." },
  { id:"closure",   title:"Cierre y puntuación",   summary:"Cerrar sin atribuciones no verificadas." }
];
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
async function ensureAcademyCapsuleSchema(env) {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS academy_capsulas (hour_start INTEGER PRIMARY KEY, seat TEXT, source TEXT, capsule_id TEXT, title TEXT, note TEXT, url TEXT, at INTEGER)");
  // Aditivas: las capsulas de ayer no tenian tematica ni agente de turno.
  await env.DB.exec("ALTER TABLE academy_capsulas ADD COLUMN tema TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE academy_capsulas ADD COLUMN agent TEXT").catch(() => {});
  await env.DB.exec("ALTER TABLE academy_capsulas ADD COLUMN decision_id TEXT").catch(() => {});
}
__name(ensureAcademyCapsuleSchema, "ensureAcademyCapsuleSchema");

async function ensureAcademyCoachSchema(env) {
  await env.DB.exec("CREATE TABLE IF NOT EXISTS academy_coach_completions (event_id TEXT PRIMARY KEY, audience TEXT NOT NULL, counselor TEXT NOT NULL, slot_id INTEGER NOT NULL, dimension TEXT NOT NULL, lesson_id TEXT NOT NULL, application TEXT NOT NULL, completed_at INTEGER NOT NULL, UNIQUE(audience,counselor,slot_id))");
  await env.DB.exec("CREATE TABLE IF NOT EXISTS academy_coach_launches (launch_id TEXT PRIMARY KEY, audience TEXT NOT NULL, counselor TEXT NOT NULL, target_slot_id INTEGER NOT NULL, dimension TEXT NOT NULL, lesson_id TEXT NOT NULL, launched_at INTEGER NOT NULL, UNIQUE(audience,counselor,target_slot_id))");
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

function academyCapsuleRow(row) {
  if (!row) return null;
  const c = COUNCIL[String(row.seat)] || {};
  const tema = ACADEMY_TEMAS.find((t) => t.id === String(row.tema || "")) || null;
  return { hour_start:Number(row.hour_start) || 0, seat:row.seat, role:c.role || "", alias:c.alias || "",
    tema:row.tema || "", tema_nombre:tema ? tema.nombre : "",
    source:row.source || "", id:row.capsule_id || "", title:row.title || "", note:row.note || "",
    url:row.url || "", agent:row.agent || "", decision_id:row.decision_id || "", at:Number(row.at) || 0 };
}
__name(academyCapsuleRow, "academyCapsuleRow");


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

// Abre la ventana de la hora. NUNCA materializa misiones, y no por una bandera que
// alguien pueda quitar sin darse cuenta, sino por la FORMA: `ensureMissionBatchFromDecision`
// sale a la primera si las opciones no tienen forma de misión, y una sola opción no la
// tiene ni como ventana inicial (exige 5) ni como continuación (exige 2 o 3 y salida).
// Con 24 al día, una ventana que materializara sola serían 24 misiones fantasma diarias.
async function abreVentanaFormacion(env, { hourStart, tema, seat, capsula }) {
  const turno = ACADEMY_TURNOS[Math.floor(hourStart / COACH_HOUR) % ACADEMY_TURNOS.length];
  const identidad = resolveDecisionIdentity(turno.agent, turno.machine);
  // Sin identidad canónica el Highscore descarta la fila en silencio y la ventana no
  // puntuaría a nadie: mejor no abrirla y que se vea el hueco.
  if (!identidad.ok) return { ok:false, error:identidad.error };
  const c = COUNCIL[seat] || {};
  const ahora = Date.now();
  const id = "DCL-form-" + hourStart.toString(36);
  const pregunta = "Formación de " + tema.nombre + ": " + (c.role || seat) + " · " + (c.alias || "") +
    " tiene cápsula esta hora — " + String((capsula && capsula.title) || "").slice(0, 180);
  // Se lee bien en la frase que pinta la web al vencer: «se aplicó la recomendada: …».
  const opciones = ["Atender la cápsula de " + tema.nombre + " en admira.academy"];
  await env.DB.prepare(
    "INSERT OR IGNORE INTO decisions (id,machine,agent,surface,question,options,recommended,status,created_at,deadline,url,mission,project,project_slug,parent_decision)" +
    " VALUES (?,?,?,?,?,?,0,'pending',?,?,?,?,?,?,?)"
  ).bind(id, identidad.machine, identidad.agent, "academy", pregunta.slice(0, 400), JSON.stringify(opciones),
    ahora, ahora + ACADEMY_DECISION_MIN * 60 * 1000, "https://admira.academy/#capsula",
    "formacion:" + tema.id, "admira-academy", "ADMIRA-ACADEMY", ACADEMY_DECISION_PARENT).run();
  return { ok:true, id, agent:identidad.agent, machine:identidad.machine };
}
__name(abreVentanaFormacion, "abreVentanaFormacion");

async function runAcademyCapsuleTick(env, ahora = Date.now()) {
  await ensureAcademyCapsuleSchema(env);
  const hourStart = Math.floor(ahora / ACADEMY_HORA_MS) * ACADEMY_HORA_MS;
  const ya = await env.DB.prepare("SELECT * FROM academy_capsulas WHERE hour_start=?").bind(hourStart).first();
  if (ya) return { ok:true, nueva:false, capsula:academyCapsuleRow(ya) };
  // La HORA manda la temática y la temática manda la silla. 24 h / 3 temáticas = 8
  // ventanas de cada una al día, exactas, sin llevar cuentas. Dentro de la temática la
  // silla también rota, para que no le toque siempre al mismo de los suyos.
  const horas = Math.floor(hourStart / COACH_HOUR);
  const { tema, lessonId } = academyTemaDeFranja(horas);
  const seat = tema.seats[Math.floor(horas / ACADEMY_TEMAS.length) % tema.seats.length];
  let elegida = null;
  try {
    const piezas = seatKnowledgeFrom(await stockIndex(), seat, 0);
    // Primero lo que le trajeron PARA formarse (#formacion); si no, lo que tenga.
    const formacion = piezas.filter((p) => p.origin === "formado");
    const pool = formacion.length ? formacion : piezas;
    if (pool.length) {
      const pieza = pool[Math.floor(hourStart / ACADEMY_HORA_MS) % pool.length];
      elegida = { source:"pixeria/stock", id:pieza.id || "", title:pieza.title || "",
                  note:pieza.note || "", url:pieza.url || "" };
    }
  } catch (e) { /* pixeria caida no deja la hora sin capsula: se cae a la leccion */ }
  if (!elegida) {
    // Sin material propio, la cápsula ES la lección que el Coach da esta hora: misma
    // temática, mismo reloj. Antes caía a una de las cuatro lecciones viejas de la
    // portada y podía contradecir al Coach en la misma franja.
    const l = ACADEMY_LECCIONES.find((x) => x.id === lessonId);
    elegida = { source:"academia/leccion", id:lessonId,
      title:(l && l.title) || ("Lección de " + tema.nombre + ": " + lessonId.replace(/-/g, " ")),
      note:(l && l.summary) || ("Lección del Coach de esta hora en " + tema.nombre + "."),
      url:"https://admira.academy/#formacion" };
  }
  await env.DB.prepare(
    "INSERT OR IGNORE INTO academy_capsulas (hour_start,seat,tema,source,capsule_id,title,note,url,at) VALUES (?,?,?,?,?,?,?,?,?)"
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
  const known = ["Neo", "Morfeo", "Trinity", "Oraculo", "Smith", "WhiteRabbit"].includes(parsed.persona);
  if (!known || !suffix) return null;
  const visible = reportAgentIdentity(agent, machine || suffix);
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
  return { ok:false, status:400, code:"project_required",
    error:"No se puede crear una misión sin project_id explícito, heredado o declarado para el agente y la máquina" };
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
    day: r.day, agent_key: r.agent_key, agent: r.agent, project_id: r.project_id,
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
  return rows.map((p) => ({
    id: p.id, name: p.name || p.id, blurb: p.blurb || "", web: p.web || "",
    status: p.status || "activo", color: p.color || "",
    owner: p.owner || "",
    primary_responsible: p.owner || "NeoMacMini",
    sort_order: p.sort_order == null ? null : Number(p.sort_order),
    machines: mem.filter((m) => m.project_id === p.id && m.kind === "machine").map((m) => m.ref),
    agents: mem.filter((m) => m.project_id === p.id && m.kind === "agent").map((m) => m.ref),
    daily_primary_agents: declarations.filter((d) => d.project_id === p.id).map((d) => ({
      day: d.day, agent: d.agent, agent_key: d.agent_key, declared_by: d.declared_by,
      statement: d.statement, updated_at: d.updated_at
    })),
    missions: misBy[String(p.id).toLowerCase()] || 0,               // vivas = en curso
    missions_pending: pendBy[String(p.id).toLowerCase()] || 0,      // encargadas y sin empezar
    created_at: p.created_at, updated_at: p.updated_at, updated_by: p.updated_by || ""
  }));
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
  const primaryResponsible = b && b.primary_responsible !== undefined
    ? String(b.primary_responsible).trim().slice(0, 80)
    : val("owner", 80);
  const row = {
    id, name: name || (prev && prev.name) || id,
    blurb: val("blurb", 240), web: val("web", 160).replace(/\/+$/, ""),
    status, color: val("color", 24), owner: primaryResponsible,
    created_at: prev ? prev.created_at : now, updated_at: now,
    updated_by: String((b && b.by) || "").slice(0, 60)
  };
  const saveProject = env.DB.prepare(
    "INSERT INTO projects (id,name,blurb,web,status,color,owner,created_at,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?)" +
    " ON CONFLICT(id) DO UPDATE SET name=excluded.name, blurb=excluded.blurb, web=excluded.web, status=excluded.status, color=excluded.color, owner=excluded.owner, updated_at=excluded.updated_at, updated_by=excluded.updated_by"
  ).bind(row.id, row.name, row.blurb, row.web, row.status, row.color, row.owner, row.created_at, row.updated_at, row.updated_by);
  if (!prev) {
    // D1 ejecuta el batch como transacción: el proyecto y su cursor aparecen
    // juntos. event_key UNIQUE hace inocuo repetir la misma alta tras un timeout.
    await env.DB.batch([
      saveProject,
      env.DB.prepare(PROJECT_NOVELTY_INSERT_SQL).bind(projectNoveltyEventKey(row.id), row.id)
    ]);
  } else {
    // Editar metadatos, responsable o estado no es una nueva alta.
    await saveProject.run();
  }
  for (const kind of ["machine", "agent"]) {
    const campo = kind === "machine" ? "machines" : "agents";
    if (!b || !Array.isArray(b[campo])) continue;
    const refs = [...new Set(b[campo].map((r) => String(r || "").trim().slice(0, 80)).filter(Boolean))].slice(0, 60);
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
  let own = false;
  try { own = parsed.origin === new URL(origin).origin; } catch (e) {}
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
    const mapped = await env.DB.prepare("SELECT mission_id FROM fleet_ids WHERE inbox_id=?")
      .bind(Number(numeric[1])).first();
    if (mapped && mapped.mission_id) return mapped.mission_id;
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
  const base = baseAgentIdentity(agent) || "Agente";
  return [
    { code: "a", title: "Implementar: " + short, owner: scopedAgentIdentity(base, machine, "sub") },
    { code: "b", title: "Verificar y entregar evidencia: " + short, owner: scopedAgentIdentity(base, machine, "sub") },
    { code: "c", title: "Documentar informe factual autorizado", owner: scopedAgentIdentity(base, machine, "infra") }
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
    const statusResponse = await env.TELEGRAM.fetch(new Request("https://admira-telegram.csilvasantin.workers.dev/api/bot-inbox/bulk-status", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [Number(numId)], status: "done", by: persona, note: "auto: informe con proof en yokup" })
    }));
    return { required: true, updated: resultResponse.ok && statusResponse.ok, inbox_id: numId };
  } catch (e) { return { required: true, updated: false, inbox_id: numId }; }
}
__name(notifyFleetInformeClosure, "notifyFleetInformeClosure");
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
  const next = remaining[0] || null;
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
      "INSERT OR IGNORE INTO mission_tasks(mission_id,code,title,status,owner,report,created_at,updated_at) VALUES(?,?,?,'pending',?,NULL,?,?)"
    ).bind(missionId, task.code, task.title, task.owner, now, now));
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
  await expireDecisions(env);
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
     WHERE d.status IN ('decided','expired') AND (
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
    "SELECT id,deadline FROM decisions WHERE lower(agent)=lower(?) AND status='pending' AND deadline > ? ORDER BY created_at DESC LIMIT 1"
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
  const previas = ((await env.DB.prepare(
    "SELECT id,created_at FROM decisions WHERE lower(agent)=lower(?) AND (parent_decision IS NULL OR parent_decision='') AND created_at > ? ORDER BY created_at DESC"
  ).bind(agent, now - HOURLY_WINDOW_MS).all()).results) || [];
  const tope = input.manual === true ? MANUAL_PER_HOUR : 1;
  if (previas.length >= tope && input.user_override !== true) {
    const previous = previas[previas.length - 1];
    return { ok: false, status: 409, error: "hourly_limit", manual: input.manual === true,
             limite: tope, usadas: previas.length, existing: previas[0].id,
             nextAt: Number(previous.created_at) + HOURLY_WINDOW_MS };
  }
  const id = "DEC-" + now.toString(36) + Math.random().toString(36).slice(2, 6);
  await backfillTodayDisplayRefs(env, now);
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

async function operationalOnIdleState(env, identity, now = Date.now()) {
  const [missionResult, taskResult, decisionResult] = await Promise.all([
    env.DB.prepare("SELECT id,status,assignee,loc,created_at,started_at,updated_at,live_at,source FROM tickets WHERE status IN ('in_progress','unconcluded')").all(),
    env.DB.prepare("SELECT m.mission_id,m.code,m.status,m.started_at,m.created_at,m.updated_at,t.assignee,t.loc " +
      "FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id WHERE m.status IN ('in_progress','doing','active','unconcluded') " +
      "AND t.status NOT IN ('resolved','cancelled')").all(),
    env.DB.prepare("SELECT id,agent,machine,deadline FROM decisions WHERE status='pending' AND deadline>?").bind(now).all()
  ]);
  const owns = (row) => sameAgentFamily(row.assignee || row.agent || "", identity.agent) &&
    memberRefMatches("machine", row.loc || row.machine || identity.machine, identity.machine);
  const missions = (missionResult.results || []).filter(owns);
  const tasks = (taskResult.results || []).filter(owns);
  const live = (decisionResult.results || []).filter(owns).length;
  const range = missionDayRange(madridDayKey(now));
  const usedRows = range ? (await env.DB.prepare(
    "SELECT agent,machine FROM decisions WHERE (parent_decision IS NULL OR parent_decision='') " +
    "AND mission=? AND created_at>=? AND created_at<?"
  ).bind(ONIDLE_MISSION_MARKER, range.start, range.end).all()).results || [] : [];
  const windowsToday = usedRows.filter(owns).length;
  const eligibility = onIdleEligibility({ missions, tasks, live_decisions:live,
    windows_today:windowsToday, now, daily_limit:ONIDLE_DAILY_LIMIT });
  return { ...eligibility, agent:identity.agent, machine:identity.machine,
    evaluated_at:now, operational_limit_ms:MISSION_UNCONCLUDED_AFTER_MS,
    state_semantics:"operational-hour-v1" };
}
__name(operationalOnIdleState, "operationalOnIdleState");

async function canonicalOnIdleProposals(env, identity, requestedProjectId) {
  if (!requestedProjectId) return { ok:false, status:400, code:"exact_project_required",
    error:"project_id exacto requerido para obtener propuestas" };
  const assignment = await exactDecisionProjectAssignment(env, identity.agent, identity.machine, requestedProjectId);
  if (!assignment) return { ok:false, status:400, code:"exact_project_required",
    error:"project_id no pertenece a la asignación canónica de agent+machine" };
  const projectId = String(assignment.id);
  const projectName = String(assignment.name);
  const [backlogResult, decisionResult, activeBatchResult] = await Promise.all([
    env.DB.prepare(
      "SELECT id,subject,status,priority,assignee,loc,project,project_id,created_at,updated_at FROM tickets " +
      "WHERE (project_id=? OR (COALESCE(project_id,'')='' AND lower(project)=lower(?))) " +
      "AND lower(COALESCE(status,'')) NOT IN ('resolved','cancelled','closed') " +
      "ORDER BY CASE lower(COALESCE(priority,'')) WHEN 'critical' THEN 0 WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END," +
      "COALESCE(created_at,updated_at) ASC,id ASC LIMIT 300"
    ).bind(projectId, projectName).all(),
    env.DB.prepare(
      "SELECT agent,machine,project,options,option_targets FROM decisions WHERE mission=? " +
      "AND (parent_decision IS NULL OR parent_decision='') AND (project=? OR lower(project)=lower(?)) ORDER BY created_at DESC"
    ).bind(ONIDLE_MISSION_MARKER, projectId, projectName).all(),
    env.DB.prepare(
      "SELECT active_mission_id,agent,machine,project_id FROM mission_batches " +
      "WHERE status='active' AND active_mission_id IS NOT NULL AND active_mission_id!=''"
    ).all()
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
    .map((row) => row.active_mission_id);
  const candidates = (backlogResult.results || []).map((row) => ({
    title:row.subject, target_mission_id:row.id, status:row.status,
    priority:row.priority, created_at:row.created_at || row.updated_at
  }));
  return { ...selectOnIdleProposals(candidates, {
    used_target_ids:usedTargetIds, used_titles:usedTitles, active_mission_ids:activeMissionIds
  }), project_id:projectId, agent:identity.agent, machine:identity.machine };
}
__name(canonicalOnIdleProposals, "canonicalOnIdleProposals");

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

var TASK_STATUS = ["pending", "in_progress", "done"];
function validTaskCode(c) {
  return typeof c === "string" && TASK_CODE.test(c);
}
__name(validTaskCode, "validTaskCode");
// Capa sugerida: los pasos (a/b/c) los ejecuta un subagente; las subtareas de
// verificación/reporte las cubre un infraagente.
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
    return scopedAgentIdentity(missionBase, machine, generic || parsed.role || fallbackRole || "sub");
  }
  return value;
}
__name(scopedMissionOwner, "scopedMissionOwner");
async function listMissionTasks(env, mid) {
  const { results } = await env.DB.prepare(
    "SELECT mission_id, code, title, status, owner, report, image, image_kind, created_at, updated_at FROM mission_tasks WHERE mission_id=? ORDER BY code"
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
var AGENT_SOURCE_SQL = "source IN ('fleet','decision-batch','cli-declare')";
var AGENT_SOURCE_SQL_T = "t.source IN ('fleet','decision-batch','cli-declare')";
var FIELD_SOURCE_SQL_T = "(t.source IS NULL OR t.source NOT IN ('fleet','decision-batch','cli-declare'))";
// La bandeja operativa acepta también las misiones antiguas/importadas cuya
// fuente no es una de las tres puertas del marcador pero que sí declaran el rol.
// No ampliamos AGENT_SOURCE_SQL: ese contrato pertenece al highscore histórico.
var MISSION_SCOPE_SQL = "(role='mission' OR source IN ('fleet','decision-batch','cli-declare'))";
var MISSION_SCOPE_SQL_T = "(t.role='mission' OR t.source IN ('fleet','decision-batch','cli-declare'))";
var FIELD_MISSION_SCOPE_SQL_T = "(COALESCE(t.role,'')!='mission' AND (t.source IS NULL OR t.source NOT IN ('fleet','decision-batch','cli-declare')))";

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

async function listAllMissionTasks(env, scope) {
  const where = scope === "fleet" ? `WHERE ${AGENT_SOURCE_SQL_T}`
    : scope === "todas" ? ""
    : `WHERE ${FIELD_SOURCE_SQL_T}`;
  const { results } = await env.DB.prepare(
    // ADITIVO (Carlos, 2026-07-23 · /informes): además de la hora de inicio de la
    // misión (t.created_at → mission_created) traemos la de FIN (t.resolved_at →
    // mission_resolved) y la PRUEBA de cierre de la misión (t.proof_image →
    // mission_proof) para que la columna Captura tenga un fallback real cuando la
    // tarea no dejó imagen propia. No rompe a /tareas: sólo añade campos.
    `SELECT m.mission_id, m.code, m.title, m.status, m.owner, m.report, m.image, m.image_kind, m.created_at, m.started_at, m.updated_at,
            t.subject, t.screen, t.loc, t.project, t.source, t.role, t.assignee, t.live_shot, t.live_at, t.live_kind,
            t.live_surface AS process_surface, t.live_context AS process_context,
            CASE WHEN t.live_kind='process' THEN t.live_shot ELSE NULL END AS process_image,
            CASE WHEN t.live_kind='process' THEN t.live_at ELSE NULL END AS process_captured_at,
            -- De qué vídeo nació la idea (Carlos, 7-ago-2026). LEFT JOIN a propósito:
            -- una misión que no viene de una idea sigue exactamente igual, con NULL,
            -- y la columna Proceso conserva su comportamiento de siempre.
            i.source_image AS idea_image, i.source_url AS idea_url, i.id AS idea_id,
            t.status AS mission_status, t.created_at AS mission_created,
            t.resolved_at AS mission_resolved, t.proof_image AS mission_proof,
            t.points_start AS points_start, t.points_end AS points_end
       FROM mission_tasks m JOIN tickets t ON t.id = m.mission_id
       LEFT JOIN ideas i ON i.mission_id = t.id AND COALESCE(i.source_image,'') <> ''
       ${where}
       ORDER BY m.mission_id, m.code`
  ).all();
  const now = Date.now();
  const rows = (results || []).map((task) => {
    const visible = taskVisibleDetails(task, now);
    return { ...task, visible_state:visible.state, active_since:visible.active_since,
      visible_state_at:visible.transition_at, visible_state_reason:visible.reason,
      agent_identity: reportAgentIdentity(task.owner, task.loc),
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
  const identity = reportAgentFamily(task.owner, task.loc);
  return { executor:identity.executor, executor_role:identity.role,
    family_key:identity.family_key, family_name:identity.family_name };
}
__name(legacyReportIdentityFields, "legacyReportIdentityFields");

function enrichReportTaskIdentity(task) {
  const identity = reportAgentFamily(task.owner, task.loc);
  return { ...task, agent_identity: reportAgentIdentity(task.owner, task.loc), ...identity };
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
  const sql = `SELECT m.mission_id,m.code,m.title,m.status,m.owner,m.report,m.image,m.image_kind,m.created_at,m.updated_at,
      t.subject,t.screen,t.loc,t.project,t.source,t.role AS mission_role,t.assignee,
      t.live_surface AS process_surface,t.live_context AS process_context,
      CASE WHEN t.live_kind='process' THEN t.live_shot ELSE NULL END AS process_image,
      CASE WHEN t.live_kind='process' THEN t.live_at ELSE NULL END AS process_captured_at,
      i.source_image AS idea_image, i.source_url AS idea_url, i.id AS idea_id,
      t.status AS mission_status,t.created_at AS mission_created,t.resolved_at AS mission_resolved,t.proof_image AS mission_proof,
      t.points_start AS points_start,t.points_end AS points_end
    FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id
    LEFT JOIN ideas i ON i.mission_id = t.id AND COALESCE(i.source_image,'') <> ''
    WHERE ${filter.page_sql}
    ORDER BY COALESCE(m.updated_at,0) DESC,m.mission_id DESC,m.code DESC LIMIT ?`;
  const result = await env.DB.prepare(sql).bind(...filter.page_binds, options.limit + 1).all();
  const fetched = result.results || [], hasMore = fetched.length > options.limit;
  const rows = fetched.slice(0, options.limit).map(enrichReportTaskIdentity);
  await attachReportDisplayRefs(env, rows);
  let total = null;
  if (options.include_total) {
    const counted = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id WHERE ${filter.count_sql}`
    ).bind(...filter.count_binds).first();
    total = Number(counted && counted.total) || 0;
  }
  return {
    tasks:rows,
    next_cursor:hasMore && rows.length ? encodeReportsCursor(rows[rows.length - 1]) : null,
    has_more:hasMore,
    total
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
    const suggested = t && t.owner ? String(t.owner).slice(0, 40) : ownerFor(code, title);
    const owner = mission
      ? scopedMissionOwner(suggested, /^infra/i.test(suggested) ? "infra" : "sub", mission.assignee, mission.loc)
      : suggested;
    const report = t && t.report != null ? String(t.report).slice(0, 2e3) : null;
    clean.push({ mission_id: mid, code, title, status, owner, report, created_at: now, updated_at: now });
  }
  await env.DB.prepare("DELETE FROM mission_tasks WHERE mission_id=?").bind(mid).run();
  for (const r of clean) {
    await env.DB.prepare(
      "INSERT INTO mission_tasks(mission_id,code,title,status,owner,report,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)"
    ).bind(r.mission_id, r.code, r.title, r.status, r.owner, r.report, r.created_at, r.updated_at).run();
  }
  return listMissionTasks(env, mid);
}
__name(saveMissionPlan, "saveMissionPlan");
async function setTaskStatus(env, mid, code, status, report, owner, image, imageKind) {
  const cur = await env.DB.prepare("SELECT * FROM mission_tasks WHERE mission_id=? AND code=?").bind(mid, code).first();
  if (!cur) return null;
  const st = TASK_STATUS.includes(status) ? status : cur.status;
  const rp = report != null ? String(report).slice(0, 2e3) : cur.report;
  let ow = owner != null ? String(owner).slice(0, 40) : cur.owner;
  if (owner != null) {
    const mission = await env.DB.prepare("SELECT assignee,loc FROM tickets WHERE id=?").bind(mid).first();
    if (mission) ow = scopedMissionOwner(ow, parseAgentIdentity(ow).role, mission.assignee, mission.loc);
  }
  // Captura PROPIA del paso: cada paso deja constancia con su enlace/miniatura. (954)
  const im = image != null && normalizeProofImage(image).value ? normalizeProofImage(image).value : cur.image;
  const ik = image != null ? (imageKind === "final" ? "final" : "task") : cur.image_kind;
  const now = Date.now();
  // `started_at` sólo nace en la primera transición a in_progress. Un reporte o
  // heartbeat repetido actualiza updated_at, pero no compra otros 60 minutos.
  // Volver explícitamente a pending inicia un ciclo nuevo y limpia el sello.
  await env.DB.prepare("UPDATE mission_tasks SET status=?, report=?, owner=?, image=?, image_kind=?, " +
    "started_at=CASE WHEN ?='in_progress' THEN COALESCE(started_at,?) WHEN ?='pending' AND status!='pending' THEN NULL ELSE started_at END, " +
    "updated_at=? WHERE mission_id=? AND code=?")
    .bind(st, rp, ow, im, ik, st, now, st, now, mid, code).run();
  const row = await env.DB.prepare("SELECT * FROM mission_tasks WHERE mission_id=? AND code=?").bind(mid, code).first();
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
function flattenSteps(steps) {
  const letters = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const tasks = [];
  const clean = (steps || []).filter((s) => { const t = stepTitle(s); return t && !CEREMONY_RE.test(t); });
  clean.slice(0, 3).forEach((step, si) => {   // REGLA DE LOS TERCIOS: 3 pasos a/b/c (963)
    const code = letters[si];
    const title = String((step && (step.title || step.titulo || step.step || step.name || step.paso || step.descripcion || step.description)) || "").slice(0, 60) || "Paso " + code.toUpperCase();
    tasks.push({ code, title });
    const subsRaw = step && (step.subtasks || step.subtareas || step.tasks || step.tareas || step.pasos || step.items || step.steps);
    const subs = (Array.isArray(subsRaw) ? subsRaw : [])
      .map((s) => typeof s === "string" ? s : (s && (s.title || s.text || s.name)) || "")
      .filter((st) => st && !CEREMONY_RE.test(st));   // fuera la ceremonia también en subtareas
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
async function proposePlan(env, mid) {
  const t = await env.DB.prepare("SELECT * FROM tickets WHERE id=?").bind(mid).first();
  const subject = t ? t.subject : "Incidencia";
  const screen = t ? t.screen || "" : "";
  const loc = t ? t.loc || "" : "";
  const triage = t ? t.ai_triage || "" : "";
  const isFleet = !!t && t.source === "fleet";
  let prompt;
  if (isFleet) {
    // El texto íntegro del encargo es el primer evento de la misión (fleetSync).
    const ev = await env.DB.prepare("SELECT text FROM events WHERE ticket_id=? ORDER BY id ASC LIMIT 1").bind(mid).first();
    const full = (ev && ev.text) || subject;
    prompt = `Eres el agente principal de AdmiraNeXT, un equipo de agentes de IA que desarrolla software (webs, workers de Cloudflare, players de se\xF1alizaci\xF3n). Carlos, el arquitecto, ha hecho este ENCARGO al agente "${t.assignee || "un agente"}"${loc ? ' que corre en el ordenador "' + loc + '"' : ""}.

ENCARGO:
${String(full).slice(0, 900)}

Descomp\xF3n el encargo en un PLAN AJUSTADO A SU TAMA\xD1O: usa SOLO los pasos que el encargo REALMENTE necesite (EXACTAMENTE 3 pasos a/b/c, cada uno con EXACTAMENTE 3 subtareas (REGLA DE LOS TERCIOS de la casa: la misi\xF3n es SIEMPRE 3 tareas x 3 subtareas, para todos los agentes por igual; lo que no quepa va al TEXTO del paso o baja a microtarea, NO se ensancha el plan)), con c\xF3digos correlativos desde "a" (a, b, c…), cada uno con EXACTAMENTE 3 subtareas. Una tarea peque\xF1a (p.ej. dibujar algo, un cambio de una l\xEDnea) son 1-3 pasos, NO ocho: no rellenes con ceremonia (recibir encargo, leer instrucciones, verificar prioridad, asignar subagente). El array tendr\xE1 TANTOS objetos como pasos reales, no ocho por defecto. Doctrina del equipo: los pasos los ejecuta un subagente y la verificaci\xF3n/reporte la cubre un infraagente; nada se da por hecho sin verificarlo en real y publicarlo a su URL p\xFAblica. Pasos concretos y accionables SOBRE ESTE ENCARGO (no inventes averías de hardware ni pantallas: esto es trabajo de software), en espa\xF1ol, cada title de m\xE1ximo 60 caracteres.

Responde SOLO con un array JSON v\xE1lido, sin texto adicional, con esta forma exacta:
[{"code":"a","title":"<paso a: concreto, dice el trabajo real>","subtasks":["<sub a1>","<sub a2>","<sub a3>"]},{"code":"b","title":"<paso b: concreto>","subtasks":["<sub b1>","<sub b2>","<sub b3>"]},{"code":"c","title":"<paso c: verificar y reportar>","subtasks":["<sub c1>","<sub c2>","<sub c3>"]}]
(EXACTAMENTE 3 objetos a/b/c, cada uno con EXACTAMENTE 3 subtareas: 3x3. Nunca 8.)`;
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
  const raw = await aiRun(env, prompt, 1800);
  let tasks = flattenSteps(parsePlanJson(raw));
  if (!tasks.length) tasks = flattenSteps(isFleet ? defaultFleetPlan() : defaultPlan());
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
    const row = await setTaskStatus(env, mid, code, b.status, b.report, b.owner);
    if (!row) return json({ error: "not-found" }, 404);
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
async function lastEventKind(env, ticketId) {
  const r = await env.DB.prepare("SELECT kind FROM events WHERE ticket_id=? ORDER BY id DESC LIMIT 1").bind(ticketId).first();
  return r ? r.kind : null;
}
__name(lastEventKind, "lastEventKind");
async function createTicket(env, s) {
  const existing = await env.DB.prepare("SELECT id FROM tickets WHERE screen=? AND status!='resolved'").bind(s.screen).first();
  if (existing) return existing.id;
  const now = Date.now();
  const id = ("INC-" + now.toString(36).slice(-5) + Math.floor(Math.random() * 36).toString(36)).toUpperCase();
  const tech = ROSTER[hash(s.screen) % ROSTER.length];
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
// external) y kind el tipo. 1 incidencia ABIERTA por recurso (índice idx_open_screen);
// el `resource` va prefijado por tipo (svc:/maq:/agt:) para no chocar con pantallas DOOH.
async function createIncident(env, inc) {
  await ensureSchema(env);
  const resource = String((inc && (inc.resource || inc.screen)) || "").slice(0, 160);
  if (!resource) return null;
  const existing = await env.DB.prepare("SELECT id FROM tickets WHERE screen=? AND status!='resolved'").bind(resource).first();
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
  const assignee = (String((inc && inc.assignee) || "").slice(0, 60)) || (ROSTER[hash(resource) % ROSTER.length].name);
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
  const open = await env.DB.prepare("SELECT id FROM tickets WHERE screen=? AND status!='resolved'").bind(String(resource || "")).first();
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
var PRESENCE_URL = "https://admira-telegram.csilvasantin.workers.dev/api/presence";

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
    const open = await env.DB.prepare("SELECT id FROM tickets WHERE screen=? AND status!='resolved'").bind(s.screen).first();
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
  return { ok:true, sql:clauses.length ? "WHERE " + clauses.join(" AND ") : "", binds,
    day:filters.day || null, project_id:projectId || null };
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
  return { ok:true, rows, visible_counts:missionVisibleCounts(rows), universe:{
    scope, day:universe.day, project_id:universe.project_id, limit:take, offset:skip,
    returned:rows.length, total, has_more:skip + rows.length < total,
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
// Se pide por el service binding TELEGRAM (ver wrangler.toml): un fetch normal a
// este host hace loopback contra el propio yokup-rtc (mismo subdominio
// workers.dev) y devuelve su 404. El host se conserva porque admira-telegram
// enruta por hostname: con "https://admira-telegram/" a secas también da 404.
var FLEET_API = "https://admira-fleet.csilvasantin.workers.dev";
// Contrato público operativo: elimina chat/message/note. Durante el despliegue
// gradual puede omitir target_machine (caso real #1112); resolveFleetAssignment
// lo reconstruye sólo si el censo proyecto+agente+máquina da una pareja única.
// El endpoint privado exige Authorization y no se usa desde este binding.
var FLEET_INBOX = "https://admira-telegram.csilvasantin.workers.dev/api/public/inbox?limit=200";
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
  const agent = "(?:(?:Sub|Infra)?(?:Oraculo|Oráculo|Morfeo|Neo|Trinity|Cypher|Smith|Agente\\s+Smith)[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*(?:\\s+en\\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 -]+)?)";
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
  const line = cleanMissionAttributions(String(text || "").replace(/^\s*\[TAREA SUELTA\]\s*/i, "").split("\n")[0]);
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
// OJO: `screen` tiene un índice ÚNICO entre las no resueltas (idx_open_screen),
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
  const t = String(it.text || "").trim();
  if (!t) return false;
  if (/^soy\s+.{2,60}?(corriendo en|en el ordenador)/i.test(t)) return false;
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
  const base = baseAgentIdentity(assignment.assignee) || assignment.assignee || "Agente";
  return [
    { code: "a", title: "Implementar: " + short, owner: scopedAgentIdentity(base, assignment.loc, "sub") },
    { code: "b", title: "Probar y aportar evidencia: " + short, owner: scopedAgentIdentity(base, assignment.loc, "sub") },
    { code: "c", title: "Documentar y reportar el resultado", owner: scopedAgentIdentity(base, assignment.loc, "infra") }
  ];
}
__name(fleetMainTasks, "fleetMainTasks");
async function ensureFleetMainTasks(env, missionId, subject, assignment, reassignPending) {
  const current = await listMissionTasks(env, missionId);
  const main = fleetMainTasks(subject, assignment), byCode = new Map(current.map((t) => [t.code, t]));
  const now = Date.now();
  for (const task of main) {
    if (!byCode.has(task.code)) {
      await env.DB.prepare("INSERT OR IGNORE INTO mission_tasks(mission_id,code,title,status,owner,report,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
        .bind(missionId, task.code, task.title, "pending", task.owner, null, now, now).run();
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
      const owner = scopedAgentIdentity(baseAgentIdentity(assignment.assignee), assignment.loc, task.code === "c" ? "infra" : "sub");
      if (owner && owner !== raw) await env.DB.prepare("UPDATE mission_tasks SET owner=?,updated_at=? WHERE mission_id=? AND code=?")
        .bind(owner, now, missionId, task.code).run();
    }
  }
}
__name(ensureFleetMainTasks, "ensureFleetMainTasks");

// Una tarea suelta conserva el contrato relacional existente (toda tarea tiene
// mission_id), pero no inventa un plan A/B/C. La misión-contenedor lleva una sola
// fila `a`, visible y operable desde /tareas como el encargo que pidió Carlos.
async function ensureFleetStandaloneTask(env, missionId, subject, assignment, reassignPending) {
  const current = await listMissionTasks(env, missionId);
  const base = baseAgentIdentity(assignment.assignee) || assignment.assignee || "Agente";
  const owner = scopedAgentIdentity(base, assignment.loc, "sub");
  const now = Date.now();
  const task = current.find((row) => row.code === "a");
  if (!task) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO mission_tasks(mission_id,code,title,status,owner,report,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)"
    ).bind(missionId, "a", String(subject || "Tarea suelta").slice(0, 120), "pending", owner, null, now, now).run();
  } else if (reassignPending && task.status === "pending" && owner && task.owner !== owner) {
    await env.DB.prepare("UPDATE mission_tasks SET owner=?,updated_at=? WHERE mission_id=? AND code='a'")
      .bind(owner, now, missionId).run();
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
  const changed = prev.status !== status || prev.assignee !== asig || (prev.loc || "") !== loc ||
    prev.subject !== subject || prev.source !== "fleet" || (prev.project || "") !== project || (prev.role || "") !== role;
  if (!changed) {
    if (standalone) await ensureFleetStandaloneTask(env, id, subject, assignment, false);
    return { changed: false, assignmentChanged: false, assignee: asig, loc, project, role, subject };
  }
  await env.DB.prepare("UPDATE tickets SET status=?,assignee=?,loc=?,screen=?,subject=?,source='fleet',project=?,project_id=?,role=?,updated_at=?,resolved_at=? WHERE id=?")
    .bind(status, asig, loc, fleetScreen(it, { assignee: asig, loc }), subject, project, project, role, now, status === "resolved" ? (prev.resolved_at || now) : null, id).run();
  if (standalone) await ensureFleetStandaloneTask(env, id, subject, assignment, assignmentChanged);
  else if (assignmentChanged) await ensureFleetMainTasks(env, id, subject, assignment, true);
  return { changed: true, assignmentChanged, assignee: asig, loc, project, role, subject };
}
__name(reconcileFleetTicket, "reconcileFleetTicket");

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
    const prev = await env.DB.prepare("SELECT id,subject,project,project_id,source,role,status,assignee,loc,proof_image,resolved_at FROM tickets WHERE id=?").bind(id).first();
    // Un DONE del agente no basta: Yokup sólo finaliza cuando el cierre incluye
    // un pantallazo real del trabajo. El bot puede haber terminado, pero la misión
    // permanece EN CURSO hasta que /fleet/informe registre proof_image.
    const proofRequired = st === "resolved" && epochMs(it.done_at, now) >= PROOF_REQUIRED_AFTER;
    if (proofRequired && !(prev && await hasMissionProof(env, id))) {
      st = "in_progress";
    }
    if (!prev) {
      // Red de seguridad del salto anterior: si el encargo parecía tener misión pero
      // el ticket no aparece, esto vuelve a ser un NACIMIENTO y sigue exigiendo
      // proyecto. Ninguna misión nace sin él por haber esquivado el guard.
      if (!projectContext.ok) {
        rejected.push({ inbox_id:it.id, code:"project_required",
          error:"No se puede crear una misión sin project_id explícito, heredado o declarado para el agente y la máquina" });
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
        "INSERT OR IGNORE INTO tickets(id,screen,subject,loc,project,project_id,role,status,priority,assignee,source,ai_triage,created_at,updated_at,resolved_at,project_inherited,project_inherited_from,points_start) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
      ).bind(
        id, fleetScreen(it, assignment), fleetSubject(it.text), assignment.loc, projectContext.project_id, projectContext.project_id, it.from_name || "",
        st, fleetPriority(it.text), assignment.assignee, "fleet", "", ts, now,
        st === "resolved" ? epochMs(it.done_at, now) : null,
        projectContext.inherited ? 1 : 0, projectContext.inherited_from || null,
        await puntosDeAgenteAhora(env, assignment.assignee)
      ).run();
      // El texto íntegro del encargo queda como primer evento de la misión.
      await addEvent(env, id, "log", it.from_name || "Carlos", String(it.text || ""));
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
            "UPDATE mission_tasks SET status='done', owner=COALESCE(NULLIF(owner,''),'auto-cierre'), updated_at=? WHERE mission_id=? AND status='pending'"
          ).bind(now, id).run();
          // Si finaliza apoyándose en la captura de un paso, asciende por el punto único (FLT-989 b1).
          await ascendMissionProof(env, id);
        }
        updated++;
      }
    }
  }
  return { ok:true, partial:rejected.length > 0, seen:items.length, created, updated, rejected };
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
  const r = await env.NAVEGADORES.fetch(new Request("https://admira-navegadores.csilvasantin.workers.dev/api/cmd", {
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
      `https://admira-telegram.csilvasantin.workers.dev/api/bot-inbox/${id}/status`,
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
  const allDone = tasks.every((x) => x.status === "done");
  const standalone = t.role === "standalone-task";
  const hasInforme = tasks.some((x) => x.code === "z1" && x.status === "done" && String(x.report || "").trim());
  const started = tasks.some((x) => x.status !== "pending");
  const proof = allDone ? await hasMissionProof(env, mid) : false;
  const derived = allDone && proof && (!standalone || hasInforme) ? "resolved" : started || allDone ? "in_progress" : "open";
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
  if (standalone && allDone && proof && !hasInforme && t.status !== "resolved") {
    const txt = "⏸ La tarea standalone está hecha y tiene prueba, pero espera el informe canónico de /fleet/informe.";
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
  await addEvent(env, mid, next === "resolved" ? "recover" : "log", "yokup",
    `La misión pasa a ${next} por su árbol de tareas. Encargo #${fleetInboxId(mid)} → ${inboxStatus.toUpperCase()}${pushed ? "" : " (no se pudo avisar al bot-inbox)"}.`);
  return { mission: mid, status: next, inbox: inboxStatus, pushed, blocked: allDone && !proof ? "sin-prueba" : null };
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
    const derived = allDone && proof ? "resolved" : r.started > 0 || allDone ? "in_progress" : "open";
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
async function fleetPlanPending(env, limit) {
  const n = Math.max(1, Math.min(+limit || 5, 20));
  const { results } = await env.DB.prepare(
    `SELECT t.id FROM tickets t
      WHERE t.source='fleet' AND t.status!='resolved'
        AND NOT EXISTS (SELECT 1 FROM mission_tasks m WHERE m.mission_id = t.id)
      ORDER BY t.created_at DESC LIMIT ?`
  ).bind(n).all();
  const ids = (results || []).map((r) => r.id);
  const planned = [];
  for (const id of ids) {
    try {
      const tasks = await proposePlan(env, id);
      if (tasks && tasks.length) planned.push(id);
    } catch (e) {
    }
  }
  // pendientes que quedan tras esta tanda
  const left = (await env.DB.prepare(
    `SELECT COUNT(*) c FROM tickets t WHERE t.source='fleet' AND t.status!='resolved'
       AND NOT EXISTS (SELECT 1 FROM mission_tasks m WHERE m.mission_id = t.id)`
  ).first())?.c || 0;
  return { ok: true, planned, count: planned.length, pending: left };
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
  if (standalone) {
    return {
      done: hecho(top), total: Math.max(1, top.length),
      sdone: 0, stotal: 0,
      topN: top.length, subN: 0,
      incompleto: false, standalone: true,
      extra, extraDone
    };
  }
  return {
    done: hecho(top), total: 3,
    sdone: hecho(sub), stotal: 9,
    topN: top.length, subN: sub.length,
    incompleto: top.length < 3 || sub.length < 9,
    extra, extraDone
  };
}
__name(tercios, "tercios");

// Lectura PÚBLICA para admira.live/status. El árbol de tareas va EMBEBIDO: los
// /mission/* viven tras el perímetro (Google) y status no pasa el gate. No
// expone nada que el bot-inbox público no publique ya.
async function fleetMissions(env) {
  const { results } = await env.DB.prepare(
    // project_inherited va al final por el mismo motivo que en los INSERT: hay un
    // contrato de forma en projects.test.mjs sobre el prefijo de este SELECT.
    "SELECT id,screen,subject,loc,project,project_id,role,status,assignee,agent_runtime,agent_host,proof_image,live_shot,live_at,live_kind,live_surface,live_context,created_at,updated_at,note,parent_id,project_inherited,project_inherited_from,points_start,points_end FROM tickets WHERE source='fleet' ORDER BY (status='open') DESC,(status='in_progress') DESC, created_at DESC LIMIT 120"
  ).all();
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
      source: "fleet",
      tasks,
      // Una misión terminada SIN parte es deuda visible (Carlos, 24-jul-2026).
      has_report: tasks.some((t) => t.has_report),
      progress: tercios(tasks, r.role === "standalone-task")
    });
  });
}
__name(fleetMissions, "fleetMissions");

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
var HIGHSCORE_WEIGHTS = { objective: 20, window: 8, mission: 40 };
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
var HIGHSCORE_PERSONAS = ["neo", "morfeo", "trinity", "oraculo", "smith", "whiterabbit", "cypher"];

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
    "AND NOT (t.status='cancelled' AND COALESCE(t.closure_reason,'')='equivalent_mission')"
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
async function highscorePeriodMetrics(env, inicio, fin) {
  const totals = new Map();
  const keyOf = (agent) => String(agent || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "");
  const rowFor = (agent, machine) => {
    const visible = reportAgentIdentity(agent, machine) || String(agent || "").trim();
    const key = keyOf(visible);
    if (!key) return null;
    if (!totals.has(key)) totals.set(key, { agent_key:key, agent:visible, machine:String(machine || ""),
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
    "AND NOT (t.status='cancelled' AND COALESCE(t.closure_reason,'')='equivalent_mission') " +
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
    const agent = scopedMissionOwner(task.owner, "sub", task.assignee, task.loc), row = rowFor(agent, task.loc);
    if (!row) continue;
    row.tasks += 1;
    row.points += HIGHSCORE_TASK_WEIGHTS.task +
      (["doing", "in_progress"].includes(String(task.status || "")) ? HIGHSCORE_TASK_WEIGHTS.active_bonus : 0);
  }
  return totals;
}
__name(highscorePeriodMetrics, "highscorePeriodMetrics");

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
  const old = new Map((legacy && legacy.scores || []).map((row) => [String(row.agent_key || "") ||
    String(row.agent || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ""), row]));
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
  const keyOf = (agent) => String(agent || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "");
  const add = (agent, machine, points) => {
    const visible = reportAgentIdentity(agent, machine) || String(agent || "").trim();
    const key = keyOf(visible);
    if (!key) return;
    if (!totals.has(key)) totals.set(key, { agent_key: key, agent: visible, machine: String(machine || ""), points: 0 });
    totals.get(key).points += Number(points) || 0;
  };
  for (const row of scores || []) add(row.agent, row.machine,
    (Number(row.objective_points) || 0) + (Number(row.window_points) || 0) + (Number(row.mission_points) || 0));

  const taskRows = ((await env.DB.prepare(
    `SELECT m.mission_id,m.code,m.status,m.owner,m.updated_at,t.assignee,t.loc ` +
    `FROM mission_tasks m JOIN tickets t ON t.id=m.mission_id WHERE ${AGENT_SOURCE_SQL_T} ` +
    "AND NOT (t.status='cancelled' AND COALESCE(t.closure_reason,'')='equivalent_mission') " +
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
    const agent = scopedMissionOwner(task.owner, "sub", task.assignee, task.loc);
    const points = HIGHSCORE_TASK_WEIGHTS.task +
      (["doing", "in_progress"].includes(String(task.status || "")) ? HIGHSCORE_TASK_WEIGHTS.active_bonus : 0);
    add(agent, task.loc, points);
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
async function puntosDeAgenteAhora(env, agente) {
  const nombre = String(agente || "").trim();
  if (!nombre) return null;
  try {
    const daily = await highscoreDaily(env);
    const totales = ((daily && daily.hourly && daily.hourly.scores) || []);
    const buscado = identityKey(nombre);
    const fila = totales.find((f) => identityKey(String(f.agent || "")) === buscado);
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

// Lista BLANCA de CLIs controlables. Arrancar procesos desde una web solo puede
// hacerse sobre lo que esta escrito aqui: nunca un comando libre.
//
// El catalogo nacio (8-ago-2026) con una sola entrada, "Smith · Grok (OpenCode)",
// y Carlos lo corrigio ese mismo dia: el panel se habia centrado en OpenCode, que
// no es la sesion de terminal que el queria manejar. Lo que se enciende y se apaga
// desde aqui son DOS cosas por ordenador — la SESION de terminal y el CLI de Grok
// que vive dentro de ella — y en cualquier equipo del grupo, no solo en dos.
//
// `kind` no es decorativo: manda los verbos de la interfaz. Una sesion se ACTIVA y
// se DESACTIVA; un CLI se ARRANCA y se MATA. Decir "matar" de una sesion vacia, o
// "activar" de un proceso, es lo que hacia que el panel se leyera mal.
var CLI_MAQUINAS = ["MacBookAir16plata", "MacBookPro14", "MacMini"];
var CLI_TIPOS = [
  { cli:"terminal",   kind:"session", label:"Sesión de terminal" },
  { cli:"grok",       kind:"cli",     label:"Grok · CLI" },
  { cli:"smith-grok", kind:"app",     label:"Smith · OpenCode" }
];
var CLI_CATALOGO = CLI_MAQUINAS.flatMap((machine) =>
  CLI_TIPOS.map((tipo) => ({ cli:tipo.cli, kind:tipo.kind, label:tipo.label, machine })));
function cliPermitido(machine, cli) {
  const m = String(machine || "").trim().toLowerCase(), c = String(cli || "").trim();
  return CLI_CATALOGO.some((e) => e.machine.toLowerCase() === m && e.cli === c);
}
__name(cliPermitido, "cliPermitido");
function cliTipo(cli) {
  const c = String(cli || "").trim();
  const tipo = CLI_TIPOS.find((t) => t.cli === c);
  return tipo ? tipo.kind : "";
}
__name(cliTipo, "cliTipo");

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

async function highscoreDaily(env) {
  const ahora = Date.now(), inicio = madridDayStart(ahora), fin = madridDayStart(inicio + 36 * 60 * 60 * 1e3);
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
    const k = a.toLowerCase() + "|" + (machineSuffix(m) || m).toLowerCase();
    if (!acc.has(k)) acc.set(k, {
      agent: a, machine: m,
      objectives: 0, objective_points: 0, windows: 0, window_points: 0, missions: 0, mission_points: 0
    });
    return acc.get(k);
  };
  const filas = async (sql) => ((await env.DB.prepare(sql).bind(inicio, fin).all()).results || []);

  // OBJETIVOS: ideas creadas hoy. Sin máquina — el marcador funde la fila con la
  // principal del agente, igual que hace con la presencia.
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
  const traceability = await highscoreTraceability(env, inicio, fin, ahora);
  const scores = [...acc.values()];
  const current = await highscoreCurrentTotals(env, scores, inicio, fin);
  const legacyHourly = await highscoreHourlyTrend(env, current, ahora);
  const hourly = await highscoreHourlyContract(env, legacyHourly, ahora, inicio, fin);
  return { ok: true, day: madridDayKey(ahora), weights: HIGHSCORE_WEIGHTS, scores, traceability, hourly };
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
  // Tareas = mission_tasks (todas).
  const ta = (await env.DB.prepare(
    "SELECT CASE WHEN status='in_progress' AND " +
    "(CASE WHEN COALESCE(started_at,updated_at,created_at)<4102444800 THEN COALESCE(started_at,updated_at,created_at)*1000 ELSE COALESCE(started_at,updated_at,created_at) END)<=? " +
    "THEN 'unconcluded' ELSE status END visible_state, COUNT(*) n FROM mission_tasks " +
    "WHERE status IN ('pending','in_progress') GROUP BY visible_state"
  ).bind(cutoff).all()).results || [];
  out.tareas.no_concluidas = 0;
  for (const r of ta) { if (r.visible_state === "in_progress") out.tareas.curso = r.n;
    else if (r.visible_state === "pending") out.tareas.pend = r.n;
    else if (r.visible_state === "unconcluded") out.tareas.no_concluidas = r.n; }
  // INFORMES no tienen estado: o están escritos o no están (Carlos, 24-jul-2026).
  // Antes se contaban «en curso/pendientes» las tareas CON parte que seguían abiertas
  // — doblemente falso: le inventaba un ciclo de vida al informe e ignoraba justo los
  // partes ya escritos (los de tareas cerradas), que son casi todos. De ahí el «1/18».
  // El número honesto es la COBERTURA: de las misiones de flota ya terminadas, cuántas
  // tienen su parte. Toda misión finalizada lo debe, así que total−hechos es la deuda.
  const inf = await env.DB.prepare(
    "SELECT COUNT(*) total, SUM(CASE WHEN EXISTS (" +
    "  SELECT 1 FROM mission_tasks m WHERE m.mission_id=t.id AND m.report IS NOT NULL AND TRIM(m.report)!=''" +
    ") THEN 1 ELSE 0 END) hechos FROM tickets t WHERE t.source='fleet' AND t.status='resolved'"
  ).first();
  out.informes = { hechos: (inf && inf.hechos) | 0, total: (inf && inf.total) | 0 };
  // NOTIFICACIONES (FLT-1020): un diálogo del sistema en cualquier equipo de la
  // flota es un equipo PARADO. Sólo cuenta lo abierto — o hay que ir o no hay nada.
  const nt = await env.DB.prepare("SELECT COUNT(*) n FROM notifs WHERE status='abierta'").first();
  out.notificaciones = { abiertas: (nt && nt.n) | 0 };
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
var index_default = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
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
      const ALLOW = /^https?:\/\/(www\.)?(pixeria\.com|xpaceos\.com|yokup\.com|admira\.live|admira\.tv|admira\.store|clearchannel\.tv|admiranext\.com|ainimation\.studio|digitalavatar\.ai|carlossilva\.info)(\/|$|\?)/i;
      if (!ALLOW.test(target)) return json({ error: "dominio no permitido" }, 400);
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
    if (url.pathname === "/auth/login" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const g = await verifyGoogle(b.credential || "");
      if (!g) return json({ ok: false, error: "token inv\xE1lido" }, 401);
      const email = String(g.email).toLowerCase();
      const wl = await whitelist();
      if (!wl.has(email)) return json({ ok: false, error: "no autorizado" }, 403);
      return json({ ok: true, token: await makeSession(env, email, g.name || ""), email, name:String(g.name || "").trim() });
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
        if (img) {
          await env.DB.prepare(
            "UPDATE tickets SET status=CASE WHEN status='open' THEN 'in_progress' ELSE status END,live_shot=?,live_at=?,live_kind=?,live_surface=?,live_context=?,points_start=COALESCE(points_start,?),updated_at=? WHERE id=? AND status NOT IN ('resolved','cancelled')"
          ).bind(img, capturedAt, liveKind, captureSurface, captureContext, await puntosDeAgenteAhora(env, t.assignee || actor.actor), now, mid).run();
        // Red de seguridad del sello de SALIDA: las misiones nacen ya con
        // points_start (fleetSync), pero las creadas por otras vias o antes de ese
        // cambio llegan aqui sin el. Va con COALESCE en las DOS ramas, con captura
        // y sin ella: cuando solo estaba en la rama con imagen, el sello se ponia
        // en la prueba de proceso — cuando la mision YA habia sumado sus 40 puntos,
        // asi que la resta con points_end daba 0 y /informes decia que el encargo
        // no habia producido nada.
        } else {
          await env.DB.prepare(
            "UPDATE tickets SET status=CASE WHEN status='open' THEN 'in_progress' ELSE status END,points_start=COALESCE(points_start,?),updated_at=? WHERE id=? AND status NOT IN ('resolved','cancelled')"
          ).bind(await puntosDeAgenteAhora(env, t.assignee || actor.actor), now, mid).run();
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
        return json({ ok: true, mission: mid, evidence_updated: !!img, evidence_kind: liveKind, captured_at: capturedAt,
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
          "SELECT created_at FROM decisions WHERE lower(agent)=lower(?) AND (parent_decision IS NULL OR parent_decision='') ORDER BY created_at DESC LIMIT 1"
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
    if (url.pathname === "/fleet/missions") {
      await ensureSchema(env);
      return json({ missions: await fleetMissions(env) });
    }
    if (url.pathname === "/highscore/daily") {
      await ensureSchema(env);
      await ensureIdeasSchema(env);
      return json(await highscoreDaily(env));
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
      const { results } = await env.DB.prepare(
        "SELECT * FROM notifs" + (todas ? "" : " WHERE status='abierta'") +
        " ORDER BY (status='abierta') DESC, last_at DESC LIMIT 200"
      ).all();
      const abiertas = (results || []).filter((n) => n.status === "abierta").length;
      return json({ ok: true, abiertas, notificaciones: results || [] });
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
    // DEUDA DE INFORMES (FLT-1018): misiones de flota TERMINADAS sin un solo parte.
    // Consulta propia y NO la lista de /fleet/missions, que va capada a 120 y saca
    // primero las abiertas: la deuda vieja —justo la que hay que perseguir— caía
    // fuera de esa ventana. Sin tope de fecha: una deuda vieja sigue siendo deuda.
    if (url.pathname === "/fleet/informes-deuda") {
      await ensureSchema(env);
      const { results } = await env.DB.prepare(
        "SELECT t.id, t.subject, t.assignee, t.loc, t.updated_at FROM tickets t " +
        "WHERE t.source='fleet' AND t.status='resolved' AND NOT EXISTS (" +
        "  SELECT 1 FROM mission_tasks m WHERE m.mission_id=t.id AND m.report IS NOT NULL AND TRIM(m.report)!=''" +
        ") ORDER BY t.updated_at DESC"
      ).all();
      return json({ ok: true, missions: results || [] });
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
      if (missing.length) return json({ ok: false, code: "closure_evidence_missing", error: "no se puede cerrar: faltan " + missing.join(", "), missing, applied: false }, 400);
      const t = await env.DB.prepare("SELECT id,assignee,loc,status,source,screen,created_at,proof_image,proof_kind,live_shot,live_at,live_kind,live_surface,live_context,role FROM tickets WHERE id=?").bind(mid).first();
      if (!t) return json({ ok: false, error: "la misión " + mid + " no existe" }, 404);
      // La identidad se valida ANTES de auto-claim, informe, prueba o evento.
      // Una firma cruzada se rechaza completa: no deja ningún rastro falso.
      const actor = validateMissionActor(t, owner);
      if (!actor.ok) return json({ ok: false, code: "owner_mismatch", error: actor.error, expected_assignee: actor.expected, received_owner: actor.actor, applied: false }, 403);
      if (t.status === "cancelled") return json({ ok: false, code: "mission_closed", error: "la misión está cancelada", status: t.status, applied: false }, 409);
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
      const puntosCierre = await puntosDeAgenteAhora(env, t.assignee || actor.actor);
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
            env.DB.prepare("INSERT INTO mission_tasks(mission_id,code,title,status,owner,report,image,image_kind,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(mission_id,code) DO UPDATE SET report=excluded.report,status='done',owner=excluded.owner,image=excluded.image,image_kind='final',updated_at=excluded.updated_at")
              .bind(mid,"z1","Informe del InfraAgente","done",owner,report,rawImage,"final",now,now),
            env.DB.prepare("UPDATE mission_tasks SET status='done',updated_at=? WHERE mission_id=? AND code!='z1'").bind(now,mid),
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
        const sameClosure = t.proof_kind === "final" && t.proof_image === rawImage && previous &&
          previous.owner === owner && previous.report === report && previous.image === rawImage && previous.image_kind === "final";
        if (!sameClosure) return json({ ok: false, code: "mission_closed", error: "la misión ya está cerrada y sólo admite reintentar exactamente el mismo cierre", status: t.status, applied: false }, 409);
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
      const writes = await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO mission_tasks(mission_id,code,title,status,owner,report,image,image_kind,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) " +
          "ON CONFLICT(mission_id,code) DO UPDATE SET report=excluded.report,status='done',owner=excluded.owner,image=excluded.image,image_kind='final',updated_at=excluded.updated_at"
        ).bind(mid, "z1", "Informe del InfraAgente", "done", owner, report, image, "final", now, now),
        env.DB.prepare(
          "UPDATE tickets SET status='resolved',resolved_at=COALESCE(resolved_at,?),proof_image=?,proof_kind='final',agent_runtime=COALESCE(NULLIF(?,''),agent_runtime),agent_host=COALESCE(NULLIF(?,''),agent_host),points_end=?,points_start=COALESCE(points_start,?),updated_at=? WHERE id=? AND status NOT IN ('resolved','cancelled')"
        ).bind(now, image, runtime, host, puntosCierre, puntosCierre, now, mid),
        env.DB.prepare("UPDATE mission_tasks SET status='done',updated_at=? WHERE mission_id=? AND code!='z1' AND EXISTS(SELECT 1 FROM tickets WHERE id=? AND role='standalone-task')").bind(now,mid,mid),
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
      const t = await env.DB.prepare("SELECT id,status,screen FROM tickets WHERE id=?").bind(mid).first();
      if (!t) return json({ ok: false, error: "la misión " + mid + " no existe" }, 404);
      const now = Date.now();
      await env.DB.prepare("UPDATE tickets SET status='cancelled', note=?, updated_at=?, resolved_at=NULL WHERE id=?").bind(note || null, now, mid).run();
      await addEvent(env, mid, "log", by, "🗑 Eliminada" + (note ? ": " + note : "") + ".");
      // Nº de encargo REAL (fleet_ids → screen → FLT): sin esto una cancelación cancelaba
      // el encargo equivocado tras el reparto anticolisión y la misión resucitaba. (FLT-990 c)
      const numId = await fleetEncargoId(env, mid, t.screen);
      if (/^\d+$/.test(numId) && env.TELEGRAM) {
        try {
          await env.TELEGRAM.fetch(new Request("https://admira-telegram.csilvasantin.workers.dev/api/bot-inbox/bulk-status", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ ids: [Number(numId)], status: "cancelled", by: by, note: note || "cancelada desde yokup" })
          }));
        } catch (e) {}
      }
      return json({ ok: true, mission: mid, cancelled: true });
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
      if (!actor.ok) return json({ ok: false, code: "owner_mismatch", error: actor.error, expected_assignee: actor.expected, received_owner: actor.actor, mission: mid, code, applied: false }, 403);
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
        const compatible = tk.role === "standalone-task" && code === "a" && b.status === "done" &&
          requestedReport.length > 0 && requestedReport.length <= 2e3 && requestedReport.trim().length > 0 &&
          tk.proof_kind === "final" && !!tk.proof_image && requestedImage === tk.proof_image && !!cur &&
          (cur.status === "in_progress" || cur.status === "done") &&
          (!cur.owner || cur.owner === actor.actor) &&
          (!cur.report || cur.report === requestedReport) &&
          (!cur.image || cur.image === requestedImage) &&
          (!cur.image_kind || cur.image_kind === "final");
        if (!compatible) return json({ ok: false, code: "mission_closed", error: "la misión ya está cerrada y sólo admite la convergencia exacta de A con su prueba final", status: tk.status, mission: mid, task_code: code, applied: false }, 409);
        const exact = cur.status === "done" && cur.owner === actor.actor &&
          cur.report === requestedReport && cur.image === requestedImage && cur.image_kind === "final";
        const row = exact ? cur : await setTaskStatus(env, mid, code, "done", requestedReport, actor.actor, requestedImage, "final");
        if (!row) return json({ ok: false, error: "no se pudo converger la tarea «a» de " + mid }, 500);
        return json({ ok: true, task: row, proof: requestedImage, fleet: null, converged: true, resolved: true, applied: !exact });
      }
      if (tk.status === "cancelled") return json({ ok: false, code: "mission_closed", error: "la misión ya está cerrada y sus tareas/pruebas no se sobrescriben", status: tk.status, mission: mid, task_code: code, applied: false }, 409);
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
      let cierraArbol = !!cur && nextSt === "done" && tasks.every((t) => t.code === code || t.status === "done");
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
      cierraArbol = nextSt === "done" && tasks.every((t) => t.code === code || t.status === "done");
      const row = await setTaskStatus(env, mid, code, b.status, b.report, actor.actor, img, cierraArbol ? "final" : "task");
      if (!row) return json({ ok: false, error: "no se pudo actualizar la tarea «" + code + "» de " + mid }, 500);
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
      return json(await fleetPlanPending(env, url.searchParams.get("limit")));
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
        const r = await upsertProject(env, b);
        return json(r, r.ok ? 200 : (r.status || 400));
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
        const linkedAgent = await env.DB.prepare("SELECT 1 ok FROM project_members WHERE project_id=? AND kind='agent' AND lower(ref)=lower(?) LIMIT 1")
          .bind(project.id, identity.agent).first();
        if (!linkedAgent) return json({ ok: false, error: "el agente no está asociado al proyecto", code: "agent_not_assigned" }, 400);
        const assignment = await exactDecisionProjectAssignment(env, identity.agent, identity.machine, project.id);
        if (!assignment) return json({ ok: false, error: "el equipo físico del agente no está asociado al proyecto", code: "team_not_assigned" }, 400);
        const live = await env.DB.prepare("SELECT id,deadline FROM decisions WHERE lower(agent)=lower(?) AND status='pending' AND deadline>? ORDER BY created_at DESC LIMIT 1")
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
        if (b && b.remove) {
          await env.DB.prepare("DELETE FROM project_members WHERE project_id=? AND kind=? AND ref=?").bind(p.id, kind, ref).run();
          if (kind === "machine") {
            const removedSuffix = machineSuffix(ref);
            if (removedSuffix) {
              const agents = (await env.DB.prepare("SELECT ref FROM project_members WHERE project_id=? AND kind='agent'").bind(p.id).all()).results || [];
              for (const row of agents) {
                if (parseAgentIdentity(row.ref).suffix === removedSuffix) {
                  await env.DB.prepare("DELETE FROM project_members WHERE project_id=? AND kind='agent' AND ref=?").bind(p.id, row.ref).run();
                }
              }
            }
          }
        } else {
          await env.DB.prepare("INSERT OR IGNORE INTO project_members (project_id,kind,ref,added_at) VALUES (?,?,?,?)")
            .bind(p.id, kind, ref, Date.now()).run();
        }
        return json({ ok: true, project: (await listProjects(env)).find((x) => x.id === p.id) || null });
      } catch (e) { return json({ ok: false, error: String(e) }, 500); }
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
    if (PROTECTED.has(url.pathname) || url.pathname.startsWith("/mission/")) {
      const sess = await requireAuth(env, req);
      if (!sess) return json({ error: "unauthorized" }, 401);
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
      const vivos = (await env.DB.prepare("SELECT machine,cli,alive,pid,seen_at FROM cli_state").all()).results || [];
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
      const machine = String(b.machine || "").trim(), cli = String(b.cli || "").trim();
      const action = String(b.action || "").trim().toLowerCase();
      if (action !== "start" && action !== "stop" && action !== "mission") {
        return json({ ok:false, error:"action debe ser start, stop o mission" }, 400);
      }
      if (!cliPermitido(machine, cli)) return json({ ok:false, error:"cli no esta en la lista blanca" }, 403);
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
      await env.DB.prepare("INSERT INTO cli_commands(id,machine,cli,action,status,requested_by,detail,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?,?,?)")
        .bind(id, machine, cli, action, quien, detalle, Date.now(), Date.now()).run();
      return json({ ok:true, id, machine, cli, action, status:"queued", text:detalle }, 202);
    }
    // El ejecutor de cada maquina recoge SOLO ordenes ya autorizadas y reporta.
    if (url.pathname === "/fleet/cli/pending" && req.method === "GET") {
      await ensureSchema(env);
      const machine = String(url.searchParams.get("machine") || "").trim();
      if (!machine) return json({ ok:false, error:"machine requerida" }, 400);
      // Una MISION caduca a los 10 minutos. Dos razones, las dos serias: una orden
      // de trabajo escrita a las 19:00 no puede aparecer tecleada en la sesion de
      // Grok a las 23:00, cuando el contexto ya no existe; y el texto deja de estar
      // dando vueltas por la cola. `start`/`stop` no caducan: encender algo sigue
      // queriendo decir lo mismo dentro de una hora.
      const CADUCA_MISION = 10 * 60 * 1000, ahora = Date.now();
      await env.DB.prepare(
        "UPDATE cli_commands SET status='expired',detail='caducada: nadie la recogió en 10 min',updated_at=? " +
        "WHERE lower(machine)=lower(?) AND status='queued' AND action='mission' AND created_at < ?"
      ).bind(ahora, machine, ahora - CADUCA_MISION).run();
      const { results } = await env.DB.prepare(
        // `detail` viaja porque una orden `mission` ES su texto: sin el, el ejecutor
        // recogeria una orden vacia y no sabria que escribir.
        "SELECT id,cli,action,detail,created_at FROM cli_commands WHERE lower(machine)=lower(?) AND status='queued' ORDER BY created_at LIMIT 5"
      ).bind(machine).all();
      return json({ ok:true, items: results || [] });
    }
    if (url.pathname === "/fleet/cli/ack" && req.method === "POST") {
      await ensureSchema(env);
      let b; try { b = await req.json(); } catch { return json({ ok:false, error:"bad-json" }, 400); }
      const ahora = Date.now();
      if (b.id) {
        const st = ["running", "done", "failed"].includes(String(b.status)) ? String(b.status) : "done";
        await env.DB.prepare("UPDATE cli_commands SET status=?,detail=?,updated_at=? WHERE id=?")
          .bind(st, String(b.detail || "").slice(0, 300), ahora, String(b.id)).run();
      }
      if (b.machine && b.cli) {
        await env.DB.prepare("INSERT INTO cli_state(machine,cli,alive,pid,seen_at) VALUES(?,?,?,?,?) " +
          "ON CONFLICT(machine,cli) DO UPDATE SET alive=excluded.alive,pid=excluded.pid,seen_at=excluded.seen_at")
          .bind(String(b.machine), String(b.cli), b.alive ? 1 : 0, Number(b.pid) || null, ahora).run();
      }
      return json({ ok:true });
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
        const filters = { day:url.searchParams.get("day") || "", project_id:url.searchParams.get("project_id") || "" };
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
        return json({ tasks: await listAllMissionTasks(env, scope) });
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
            await env.TELEGRAM.fetch(new Request("https://admira-telegram.csilvasantin.workers.dev/api/bot-inbox/bulk-status", {
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
    if (url.pathname === "/academy/capsula" && req.method === "GET") {
      try {
        const r = await runAcademyCapsuleTick(env);
        const historia = ((await env.DB.prepare(
          "SELECT * FROM academy_capsulas ORDER BY hour_start DESC LIMIT 12"
        ).all()).results || []).map(academyCapsuleRow);
        return json({ ok:true, capsula:r.capsula, nueva:r.nueva, historia });
      } catch (e) { return json({ ok:false, error:String(e) }, 500); }
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
          // Lo único que de verdad ENSEÑA algo: sin guiones, una silla con sesenta
          // vídeos sabe lo que sabía, porque de un vídeo sólo lee el título.
          guiones: pieces.filter((p) => p.guion).length,
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
        presupuesto: COUNCIL_KNOWLEDGE_PROMPT_CHARS, guion_tipo: COUNCIL_GUION_TYPE,
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
          missionId = "DCL-" + now.toString(36) + Math.random().toString(36).slice(2, 6);
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
            const owner = scopedMissionOwner(suggested, /^infra/i.test(suggested) ? "infra" : "sub", identity.agent, identity.machine);
            statements.push(env.DB.prepare(
              "INSERT INTO mission_tasks(mission_id,code,title,status,owner,report,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)"
            ).bind(missionId, t.code, t.title, t.status, owner, t.report, now, now));
            if (t.evidence) statements.push(env.DB.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)")
              .bind(missionId, now, "log", identity.agent, `Tarea ${t.code} declarada hecha desde el CLI · ${t.evidence.text}`));
          }
          if (b.resolve === true) {
            statements.push(env.DB.prepare("UPDATE tickets SET status='resolved',resolved_at=?,updated_at=? WHERE id=?").bind(now, now, missionId));
            statements.push(env.DB.prepare("INSERT INTO events(ticket_id,ts,kind,author,text) VALUES(?,?,?,?,?)")
              .bind(missionId, now, "accept", identity.agent, `Misión declarada resuelta desde el CLI · ${evidenciaMision.text}`));
          }
          // D1 batch es atómico: ticket, proyecto, plan y eventos nacen juntos.
          // Si falla cualquier sentencia no queda una misión parcial u huérfana.
          await env.DB.batch(statements);
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
        const onIdle = !continuation && (b.onidle === true || String(b.mission || "") === ONIDLE_MISSION_MARKER);
        if (onIdle && b.user_override !== true) {
          const operational = await operationalOnIdleState(env, decisionIdentity);
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
        const requestedProjectId = String(b.project_id || (continuation && parent ? parent.project : "")).trim().slice(0, 120);
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
          "SELECT id,deadline FROM decisions WHERE lower(agent)=lower(?) AND status='pending' AND deadline > ? ORDER BY created_at DESC LIMIT 1"
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
        if (!continuation && !userOverride && !onIdle) {
          // Las decisiones ordinarias conservan el reloj móvil de 60 min de
          // openInitialMissionDecision: 1 automática o MANUAL_PER_HOUR manuales.
          // OnIdle ya pasó su guard canónico justo arriba (viva, trabajo fresco,
          // 8/día Madrid), por lo que repetir aquí 1/h impediría el siguiente
          // ciclo inmediatamente después del cierre.
          const previas = ((await env.DB.prepare(
            "SELECT id,created_at FROM decisions WHERE lower(agent)=lower(?) AND (parent_decision IS NULL OR parent_decision='') AND created_at > ? ORDER BY created_at DESC"
          ).bind(agent, now - HOURLY_WINDOW_MS).all()).results) || [];
          const tope = manual ? MANUAL_PER_HOUR : 1;
          if (previas.length >= tope) {
            // El hueco lo libera la MÁS VIEJA de las que siguen dentro de la hora.
            const masVieja = previas[previas.length - 1];
            return json({ ok: false, error: "hourly_limit", manual, limite: tope,
              usadas: previas.length, existing: previas[0].id,
              nextAt: Number(masVieja.created_at) + HOURLY_WINDOW_MS }, 409);
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
        return json({ ok: true, id, display_ref, deadline: now + mins * 60000, project: projectContext.project, project_id: dproject, project_slug: dprojectSlug, parent_decision: dparent, batch_id: dbatch, continuation, user_override: userOverride });
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
        if (agentQ) { where.push("lower(agent)=lower(?)"); binds.push(agentQ); }
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
        await attachDisplayRefs(env, "window", chosen, (row) => row.id, (row) => row.created_at);
        return json({ ok: true, id, display_ref: chosen.display_ref, chosen: idx, option: o[idx], cancelled: back, batch });
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
            await env.TELEGRAM.fetch(new Request("https://admira-telegram.csilvasantin.workers.dev/api/bot-inbox/bulk-status", {
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
        const agents = ROSTER.map((t) => Object.assign({}, t, map[t.name] || { open: 0, in_progress: 0, resolved: 0, mttr: null }));
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
  Room,
  index_default as default
};
//# sourceMappingURL=index.js.map
