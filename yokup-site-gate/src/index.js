const CENSUS_ORIGIN = "https://macmini.tail48b61c.ts.net/api/council/fleet-census";
import { handleMcp } from './mcp.js';
import { authProxy } from "./auth-proxy.js";

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
  const mcpPath = incoming.pathname === "/mcp" || incoming.pathname === "/mcp/";
  if (mcpPath && (request.method !== "GET" && request.method !== "HEAD" || request.headers.get("accept")?.includes("text/event-stream"))) return handleMcp(request, env);
  if (incoming.hostname === "yokup.com") {
    if (request.method === "GET" || request.method === "HEAD") {
      incoming.hostname = "www.yokup.com";
      return Response.redirect(incoming, 308);
    }
    if (incoming.pathname.startsWith("/auth/")) {
      return Response.json({ok:false, error:"canonical_origin_required"}, {status:403, headers:{"Cache-Control":"no-store"}});
    }
  }
  if (request.method === "GET" && incoming.pathname === "/__yokup-gate") {
    return Response.json({...release, ok:true, mode:"worker-assets"}, {
      headers:{"Cache-Control":"no-store", "X-Yokup-Gate":"worker-assets", "X-Yokup-Gate-Version":release.version}
    });
  }
  if (request.method === "GET" && incoming.pathname === "/version.json") {
    return Response.json(release, {headers:{"Cache-Control":"no-store", "Access-Control-Allow-Origin":"*", "X-Yokup-Gate":"worker-assets"}});
  }
  if (incoming.pathname === "/auth/challenge" || incoming.pathname === "/auth/callback") {
    return authProxy(request, fetchImpl);
  }
  if (incoming.pathname === "/api/fleet-census") return fleetCensus(request, ctx, fetchImpl);
  if ((incoming.pathname === "/agentica" || incoming.pathname === "/agentica.html") && (request.method === "GET" || request.method === "HEAD")) {
    return Response.redirect(new URL("/dashboard", incoming), 301);
  }
  let candidates;
  const releaseKey = String(release.gitShort || "").trim();
  if ((incoming.pathname === "/highscore" || incoming.pathname === "/highscore.html") && /^[a-f0-9]{7,40}$/i.test(releaseKey)) {
    candidates = [`/highscore-${releaseKey}.html`];
  }
  else if (incoming.pathname === "/") candidates = ["/index.html"];
  // CARBONO. La página del equipo de personas vive en agentes.html por los
  // enlaces vivos que apuntan ahí, pero «agente» es SILICIO en toda la
  // plataforma y el mismo rótulo para las dos mitades del equipo se lee mal.
  // Va aquí y no en _redirects porque www.yokup.com lo sirve este worker: el
  // _redirects de Pages no lo ve nadie, y una ruta que no enruta cae al
  // catch-all y sirve la portada con un 200 — la forma más cara de decir que
  // algo no existe, porque ni siquiera parece un error.
  else if (incoming.pathname === "/carbono" || incoming.pathname === "/carbono/") candidates = ["/agentes.html"];
  else if (incoming.pathname === "/mcp" || incoming.pathname === "/mcp/") candidates = ["/mcp/index.html"];
  else if (incoming.pathname === "/help" || incoming.pathname === "/help/") candidates = ["/help/index.html"];
  else if (incoming.pathname.endsWith("/")) candidates = [incoming.pathname + "index.html"];
  else if (!/\.[a-z0-9]+$/i.test(incoming.pathname)) candidates = [incoming.pathname + ".html", incoming.pathname];
  else candidates = [incoming.pathname];
  let response = new Response("Not Found", {status:404});
  for (const assetPath of candidates) {
    const assetUrl = new URL(incoming);
    assetUrl.pathname = assetPath;
    response = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (response.status !== 404) break;
  }
  // Equivale al catch-all histórico de Pages, implementado aquí porque Workers
  // Assets rechaza esa regla de _redirects por posible bucle con clean URLs.
  if (response.status === 404 && (request.method === "GET" || request.method === "HEAD")) {
    const home = new URL("/index.html", incoming);
    response = await env.ASSETS.fetch(new Request(home, request));
  }
  return response;
}

// Cloudflare invoca fetch(request, env, ctx). No se puede exportar handleRequest
// directamente porque `env` ocuparía el parámetro inyectable fetchImpl y el proxy
// intentaría ejecutar un objeto como función.
export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx, fetch);
  }
};
