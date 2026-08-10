const CENSUS_ORIGIN = "https://macmini.tail48b61c.ts.net/api/council/fleet-census";

function releaseFromEnv(env) {
  try { return JSON.parse(String(env.RELEASE_JSON || "")); } catch (_) { return null; }
}

async function fleetCensus(request, ctx, fetchImpl = fetch) {
  if (request.method !== "GET") return new Response("Method Not Allowed", {status:405, headers:{Allow:"GET"}});
  const cacheKey = new Request(new URL(request.url).origin + "/api/fleet-census", {method:"GET"});
  const hit = await caches.default.match(cacheKey);
  if (hit) return hit;
  let payload, status = 200;
  try {
    const response = await fetchImpl(CENSUS_ORIGIN, {signal:AbortSignal.timeout(6000), cf:{cacheTtl:0}});
    if (!response.ok) throw new Error("el Mac Mini respondió " + response.status);
    const data = await response.json();
    if (!data || !Array.isArray(data.machines)) throw new Error("censo con forma inesperada");
    payload = {...data, servedAt:Math.floor(Date.now() / 1000), via:"site-gate"};
  } catch (error) {
    status = 503;
    payload = {ok:false, error:String(error && error.message || error), servedAt:Math.floor(Date.now() / 1000), via:"site-gate"};
  }
  const response = Response.json(payload, {status, headers:{
    "Access-Control-Allow-Origin":"*",
    "Cache-Control":status === 200 ? "public, max-age=15" : "no-store"
  }});
  if (status === 200 && ctx && ctx.waitUntil) ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
}

export async function handleRequest(request, env, ctx, fetchImpl = fetch) {
  const incoming = new URL(request.url);
  const release = releaseFromEnv(env);
  if (!release) return Response.json({ok:false, error:"missing-release"}, {status:503, headers:{"Cache-Control":"no-store"}});
  if (request.method === "GET" && incoming.pathname === "/__yokup-gate") {
    return Response.json({ok:true, mode:"worker-assets", version:release.version, gitFull:release.gitFull}, {
      headers:{"Cache-Control":"no-store", "X-Yokup-Gate":"worker-assets", "X-Yokup-Gate-Version":release.version}
    });
  }
  if (request.method === "GET" && incoming.pathname === "/version.json") {
    return Response.json(release, {headers:{"Cache-Control":"no-store", "Access-Control-Allow-Origin":"*", "X-Yokup-Gate":"worker-assets"}});
  }
  if (incoming.pathname === "/api/fleet-census") return fleetCensus(request, ctx, fetchImpl);
  return env.ASSETS.fetch(request);
}

// Cloudflare invoca fetch(request, env, ctx). No se puede exportar handleRequest
// directamente porque `env` ocuparía el parámetro inyectable fetchImpl y el proxy
// intentaría ejecutar un objeto como función.
export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx, fetch);
  }
};
