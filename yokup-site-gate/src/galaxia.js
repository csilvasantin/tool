// galaxia.js — LAS DOS PUERTAS DE CADA SOLUCIÓN, MEDIDAS (norma 24: /help para el carbono y
// /mcp para el silicio). Carlos, 7-sep-2026: «vamos con esos MCPs, es la forma de comunicarnos
// más efectiva entre todas las soluciones». Un directorio escrito a mano miente al mes: el de
// esta página se auditó el 9-ago y el 7-sep ya no cuadraba (manifest de admira.app copiado de
// clearchannel, enlaces muertos, llms.txt 404). Esto lo mide en vivo y lo dice tal cual.
//
//   GET /mcp/galaxia.json                → el censo: sitios (uno por dominio del censo de
//                                          proyectos de yokup) y qué proyectos heredan de cada uno.
//   GET /mcp/galaxia.json?sitio=<host>   → la medida de ESE sitio: /help, /mcp, llms.txt,
//                                          manifest.json, y cada servidor MCP que declare
//                                          (initialize + tools/list sin clave).
//
// Por qué por sitio y no todo de una: un worker tiene un cupo de subpeticiones por petición;
// medir 15 sitios con sus servidores son ~80 y la petición moría a medias. Cada sitio son ≤10 y
// la página los pide en paralelo. Cada medida se guarda una hora en la caché del edge.
// Solo se mide lo que está en el censo: esto no es un escáner de terceros.
const UA = "Mozilla/5.0 (compatible; yokup-galaxia/1.0; +https://www.yokup.com/mcp/)";
const CENSO_ORIGIN = "https://api.yokup.com/projects";
export const TTL_SEGUNDOS = 3600;
const TIMEOUT_MS = 6000;

export function hostDe(web) {
  const w = String(web || "").trim();
  if (!w) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(w) ? w : "https://" + w);
    return { host: u.hostname.toLowerCase(), path: u.pathname.replace(/\/+$/, "") || "" };
  } catch (_) { return null; }
}

/** Sitios del censo: un sitio por host; los proyectos con ruta heredan las puertas del host. */
export function sitiosDelCenso(proyectos) {
  const porHost = new Map();
  for (const p of proyectos || []) {
    const h = hostDe(p.web || p.project_web);
    if (!h) continue;
    const s = porHost.get(h.host) || { host: h.host, base: "https://" + h.host, proyectos: [], hereda: [] };
    (h.path ? s.hereda : s.proyectos).push({ id: p.id, name: p.name, web: p.web || p.project_web });
    porHost.set(h.host, s);
  }
  return [...porHost.values()].sort((a, b) => a.host.localeCompare(b.host));
}

async function pedir(fetchImpl, url, init = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetchImpl(url, { ...init, signal: ctl.signal, headers: { "user-agent": UA, accept: "application/json, text/event-stream, text/plain, text/html;q=0.9", ...(init.headers || {}) }, cf: { cacheTtl: 0 } });
    const texto = await r.text();
    return { status: r.status, url: r.url || url, ct: String(r.headers.get("content-type") || "").split(";")[0], texto };
  } catch (e) {
    return { status: 0, url, ct: "", texto: "", error: String(e && e.message || e) };
  } finally { clearTimeout(t); }
}

const parece404 = (r) => r.status === 200 && /\b(404|not found|no encontrad[ao]|p[aá]gina no existe)\b/i.test(r.texto.slice(0, 800));
const puerta = (r) => ({ status: r.status, ok: r.status === 200 && !parece404(r), url: r.url, ...(r.error ? { error: r.error } : {}) });

export function endpointsDeManifiesto(m) {
  const eps = new Set();
  const mira = (o) => {
    if (Array.isArray(o)) { o.forEach(mira); return; }
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (["endpoint", "mcp_server", "server_url", "mcp_endpoint", "url"].includes(k) && typeof v === "string" && /^https:\/\/[^\s]+\/mcp\/?$/i.test(v)) eps.add(v.replace(/\/$/, ""));
      else if (typeof v === "object") mira(v);
    }
  };
  mira(m);
  return [...eps].slice(0, 3);
}

function jsonRpcDe(texto) {
  const t = String(texto || "").trim();
  if (t.startsWith("{")) { try { return JSON.parse(t); } catch (_) { return null; } }
  let ultimo = null;
  for (const linea of t.split(/\r?\n/)) if (linea.startsWith("data:")) { try { ultimo = JSON.parse(linea.slice(5)); } catch (_) {} }
  return ultimo;
}

async function medirServidor(fetchImpl, endpoint) {
  const rpc = (body, extra = {}) => pedir(fetchImpl, endpoint, { method: "POST", headers: { "content-type": "application/json", ...extra }, body: JSON.stringify(body) });
  const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "yokup-galaxia", version: "1.0" } } });
  const out = { endpoint, status: init.status };
  if (init.status === 0) return { ...out, estado: "sin respuesta", error: init.error };
  if (init.status === 401 || init.status === 403) return { ...out, estado: "con clave" };
  const j = jsonRpcDe(init.texto);
  const info = j && j.result && j.result.serverInfo;
  if (init.status !== 200 || !info) return { ...out, estado: "no es un servidor MCP" };
  const r = { ...out, estado: "abierto", servidor: { name: info.name, version: info.version }, protocolo: j.result.protocolVersion || null, herramientas: [] };
  const tl = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const jl = jsonRpcDe(tl.texto);
  if (jl && jl.result && Array.isArray(jl.result.tools)) r.herramientas = jl.result.tools.map((t) => t.name).slice(0, 40);
  return r;
}

export async function medirSitio(sitio, fetchImpl) {
  const base = sitio.base;
  const [help, mcp, llms, manifest] = await Promise.all(["/help", "/mcp", "/mcp/llms.txt", "/mcp/manifest.json"].map((p) => pedir(fetchImpl, base + p)));
  let man = null;
  try { man = manifest.status === 200 ? JSON.parse(manifest.texto) : null; } catch (_) { man = null; }
  const endpoints = man ? endpointsDeManifiesto(man) : [];
  const servidores = await Promise.all(endpoints.map((e) => medirServidor(fetchImpl, e)));
  const puertas = { help: puerta(help), mcp: puerta(mcp), llms: puerta(llms), manifest: { ...puerta(manifest), ...(man ? { name: man.name || null, version: man.version || null } : {}) } };
  const verja = [help, mcp].every((r) => r.status === 401 || r.status === 403);
  return { ok: true, sitio: sitio.host, base, proyectos: sitio.proyectos.map((p) => p.id), hereda: sitio.hereda.map((p) => p.id), puertas, verja, servidores, medido: new Date().toISOString() };
}

async function censo(fetchImpl) {
  const r = await pedir(fetchImpl, CENSO_ORIGIN, { headers: { accept: "application/json" } });
  if (r.status !== 200) throw new Error("el censo de proyectos respondió " + (r.status || r.error));
  const d = JSON.parse(r.texto);
  const proyectos = d.projects || d.items || (Array.isArray(d) ? d : []);
  return { ok: true, sitios: sitiosDelCenso(proyectos), medido: new Date().toISOString(), ttl: TTL_SEGUNDOS };
}

export async function galaxia(request, ctx, fetchImpl = fetch) {
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET" } });
  const url = new URL(request.url);
  const host = String(url.searchParams.get("sitio") || "").toLowerCase().trim();
  const cacheKey = new Request(url.origin + "/mcp/galaxia.json" + (host ? "?sitio=" + encodeURIComponent(host) : ""), { method: "GET" });
  // En Node (pruebas) no hay caches.*: se mide sin caché.
  const cache = globalThis.caches && globalThis.caches.default;
  const hit = cache ? await cache.match(cacheKey) : null;
  if (hit) return hit;
  let payload, status = 200;
  try {
    const c = await censo(fetchImpl);
    if (!host) payload = c;
    else {
      const sitio = c.sitios.find((s) => s.host === host);
      if (!sitio) { status = 404; payload = { ok: false, error: "ese sitio no está en el censo de proyectos de yokup", sitios: c.sitios.map((s) => s.host) }; }
      else payload = await medirSitio(sitio, fetchImpl);
    }
  } catch (e) {
    status = 503; payload = { ok: false, error: String(e && e.message || e) };
  }
  const response = Response.json(payload, { status, headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": status === 200 ? `public, max-age=${TTL_SEGUNDOS}` : "no-store", "X-Yokup-Galaxia": "medido" } });
  if (status === 200 && cache && ctx && ctx.waitUntil) ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
