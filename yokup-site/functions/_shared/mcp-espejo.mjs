// POST /mcp y GET /mcp/galaxia.json del espejo hablan con el guardián de
// yokup.com (yokup-site-gate), que es quien tiene D1 y los bindings. Pages
// solo tiene el HTML y por eso un POST devolvía 405. El manifiesto y llms.txt
// son ficheros estáticos: en el host admira.biz se reescriben con la marca de
// la casa. El login no pasa por aquí.
import { esEspejo } from "./casas.mjs";
import { esContratoMarca, marcaCuerpoTexto } from "./espejo-puertas.mjs";

export const GUARDIAN = "https://www.yokup.com";
export const ORIGENES_ESPEJO = new Set([
  "https://admira.biz",
  "https://www.admira.biz",
  "https://yokup.com",
  "https://www.yokup.com",
]);

export function debeProxy(request) {
  let url;
  try { url = new URL(request.url); } catch (_) { return false; }
  const path = url.pathname;
  if (path === "/mcp/galaxia.json") return request.method === "GET";
  if (path !== "/mcp" && path !== "/mcp/") return false;
  if (request.method !== "GET" && request.method !== "HEAD") return true;
  return (request.headers.get("accept") || "").includes("text/event-stream");
}

export async function proxyAlGuardian(request, fetchImpl = fetch) {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, GUARDIAN);
  const headers = new Headers(request.headers);
  for (const name of ["host", "content-length", "connection", "transfer-encoding"]) headers.delete(name);
  const origin = headers.get("origin");
  // El guardián admite el origen de yokup. El espejo se lo quitamos para no
  // recibir origin_not_allowed y devolvemos el CORS del host que preguntó.
  const espejo = origin && ORIGENES_ESPEJO.has(origin) && origin !== "https://www.yokup.com" && origin !== "https://yokup.com";
  if (espejo) headers.delete("origin");
  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;
  const response = await fetchImpl(target, init);
  if (!origin || !ORIGENES_ESPEJO.has(origin)) return response;
  const headersOut = new Headers(response.headers);
  headersOut.set("access-control-allow-origin", origin);
  headersOut.set("vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: headersOut });
}

export async function responderMcp(request, { next, fetchImpl = fetch } = {}) {
  if (debeProxy(request)) return proxyAlGuardian(request, fetchImpl);
  const url = new URL(request.url);
  if (!esContratoMarca(url.pathname)) return next();
  const response = await next();
  if (!response.ok || !esEspejo(url.hostname)) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(marcaCuerpoTexto(await response.text(), url.hostname), { status: response.status, headers });
}
