// GET /api/fleet-census — puente entre el censo real y la web pública.
//
// El censo (quién existe y quién está encendido) lo produce el Mac Mini con
// Tailscale + un SSH real. Que lo lea el navegador directamente no funciona:
// desde Chrome la petición al Funnel tarda más de 8 s (por curl, 0,3 s) y
// *.workers.dev está bloqueado por los ISP españoles, así que un worker suelto
// tampoco sirve. Aquí lo pide el EDGE de Cloudflare y lo sirve desde el mismo
// origen que la página: sin bloqueo y sin la latencia del navegador.
//
// Esta función no opina sobre la flota: solo trae, cachea 15 s y dice la edad
// del dato. Si el Mini no contesta, devuelve ok:false — nunca un censo inventado.

const ORIGEN = "https://macmini.tail48b61c.ts.net/api/council/fleet-census";
const TIMEOUT_MS = 6000;
const CACHE_SEG = 15;

export async function onRequestGet(context) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(context.request.url).origin + "/api/fleet-census", { method: "GET" });

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let payload, status = 200;
  try {
    const r = await fetch(ORIGEN, { signal: ctrl.signal, cf: { cacheTtl: 0 } });
    if (!r.ok) throw new Error("el Mac Mini respondió " + r.status);
    const data = await r.json();
    if (!data || !Array.isArray(data.machines)) throw new Error("censo con forma inesperada");
    payload = { ...data, servedAt: Math.floor(Date.now() / 1000), via: "pages-function" };
  } catch (err) {
    status = 503;
    payload = {
      ok: false,
      error: (err && err.name === "AbortError")
        ? "el Mac Mini no respondió a tiempo"
        : String((err && err.message) || err),
      servedAt: Math.floor(Date.now() / 1000),
      via: "pages-function",
    };
  } finally {
    clearTimeout(timer);
  }

  const res = new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      // Un fallo no se cachea: la próxima petición vuelve a intentarlo.
      "cache-control": status === 200 ? `public, max-age=${CACHE_SEG}` : "no-store",
    },
  });
  if (status === 200) context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
