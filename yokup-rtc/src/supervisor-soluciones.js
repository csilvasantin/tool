// Estado público del supervisor de soluciones (Insta360 del Mac Mini).
// Va delante de la verja de /supervisor/* : el bucle de la cámara no tiene sesión Google.
// Solo guarda un JSON corto. Las fotos viven en media de flota, ya pixeladas.

export const SOLUCIONES_SQL = "CREATE TABLE IF NOT EXISTS supervisor_soluciones (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)";

const ID_RE = /^[a-z0-9-]{1,40}$/;
const FOTO_RE = /^https:\/\/api\.yokup\.com\/media\/fleet\/[a-f0-9]{8,64}\.(?:jpe?g|png|webp)$/i;
const TICKET_RE = /^INC-[A-Z0-9]{4,16}$/;
const ESTADOS = new Set(["encendida", "apagada", "sin-dato"]);
export const SOLUCIONES_MAX_BODY = 48000;
const UA_MARCA = "supervisor-soluciones";

function texto(value, max) {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
}

function ticket(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = texto(raw.id, 24);
  if (!TICKET_RE.test(id)) return null;
  const url = `https://www.admira.app/ticket?id=${id}`;
  return { id, posicion: texto(raw.posicion, 40), url, cuando: texto(raw.cuando, 40) };
}

function listaTickets(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const limpio = ticket(item);
    if (limpio) out.push(limpio);
    if (out.length >= 12) break;
  }
  return out;
}

export function sanearSoluciones(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "bad-json" };
  const id = texto(body.id, 40);
  if (!ID_RE.test(id)) return { ok: false, error: "id" };
  if (!Array.isArray(body.posiciones) || !body.posiciones.length) return { ok: false, error: "posiciones" };
  const posiciones = [];
  for (const raw of body.posiciones) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "posicion" };
    const pid = texto(raw.id, 40);
    if (!ID_RE.test(pid)) return { ok: false, error: "posicion" };
    const foto = texto(raw.foto, 180);
    if (foto && !FOTO_RE.test(foto)) return { ok: false, error: "foto" };
    let luz = Number(raw.luz);
    if (!Number.isFinite(luz)) luz = null;
    else luz = Math.round(Math.max(0, Math.min(1, luz)) * 1000) / 1000;
    const incidencia = ticket(raw.incidencia);
    posiciones.push({
      id: pid,
      luz,
      estado: ESTADOS.has(raw.estado) ? raw.estado : "sin-dato",
      foto,
      cuando: texto(raw.cuando, 40),
      incidencia
    });
    if (posiciones.length >= 8) break;
  }
  const ciclo = Number(body.ciclo);
  return {
    ok: true,
    payload: {
      id,
      ciclo: Number.isFinite(ciclo) ? Math.max(0, Math.min(1_000_000, Math.floor(ciclo))) : 0,
      en: texto(body.en, 40),
      cuando: texto(body.cuando, 40),
      posiciones,
      abiertas: listaTickets(body.abiertas),
      cerradas: listaTickets(body.cerradas)
    }
  };
}

export async function handleSolucionesIngest(req, env, url, json) {
  if (req.method === "GET") {
    const id = texto(url.searchParams.get("id") || "macmini-insta360", 40);
    if (!ID_RE.test(id)) return json({ ok: false, error: "id" }, 400);
    await env.DB.exec(SOLUCIONES_SQL);
    const row = await env.DB.prepare("SELECT payload, updated_at FROM supervisor_soluciones WHERE id=?").bind(id).first();
    if (!row) return json({ ok: true, id, ciclo: 0, en: "", cuando: "", posiciones: [], abiertas: [], cerradas: [], updated_at: 0 });
    let payload = {};
    try { payload = JSON.parse(row.payload); } catch { payload = {}; }
    return json({ ok: true, ...payload, updated_at: row.updated_at });
  }
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  const ua = req.headers.get("user-agent") || "";
  if (!ua.includes(UA_MARCA)) return json({ ok: false, error: "ua" }, 403);
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > SOLUCIONES_MAX_BODY) return json({ ok: false, error: "too-big" }, 413);
  const raw = await req.text();
  if (raw.length > SOLUCIONES_MAX_BODY) return json({ ok: false, error: "too-big" }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "bad-json" }, 400); }
  const sane = sanearSoluciones(body);
  if (!sane.ok) return json({ ok: false, error: sane.error }, 400);
  await env.DB.exec(SOLUCIONES_SQL);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO supervisor_soluciones (id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at"
  ).bind(sane.payload.id, JSON.stringify(sane.payload), now).run();
  return json({ ok: true, id: sane.payload.id, updated_at: now });
}
