import { assessProvenance, FALLBACK_ORIGIN, PRIMARY_ORIGIN } from "./provenance.js";

const DECISION_TTL_MS = 15_000;
let cachedDecision = null;

async function inspectPrimary(fetchImpl = fetch) {
  try {
    const response = await fetchImpl(PRIMARY_ORIGIN + "/version.json?gate=" + Date.now(), {
      cache:"no-store",
      cf:{ cacheTtl:0, cacheEverything:false }
    });
    if (!response.ok) return { origin:FALLBACK_ORIGIN, mode:"fallback", reason:`version-http-${response.status}`, version:"" };
    const payload = await response.json();
    const assessment = assessProvenance(payload);
    return assessment.trusted
      ? { origin:PRIMARY_ORIGIN, mode:"primary", reason:assessment.reason, version:payload.version }
      : { origin:FALLBACK_ORIGIN, mode:"fallback", reason:assessment.reason, version:String(payload.version || "") };
  } catch (_) {
    return { origin:FALLBACK_ORIGIN, mode:"fallback", reason:"version-unreachable", version:"" };
  }
}

async function deploymentDecision(fetchImpl = fetch, force = false) {
  const now = Date.now();
  if (!force && cachedDecision && cachedDecision.expiresAt > now) return cachedDecision;
  const inspected = await inspectPrimary(fetchImpl);
  cachedDecision = {...inspected, checkedAt:new Date(now).toISOString(), expiresAt:now + DECISION_TTL_MS};
  return cachedDecision;
}

function publicDecision(decision) {
  return {
    ok:true,
    mode:decision.mode,
    reason:decision.reason,
    version:decision.version,
    checkedAt:decision.checkedAt,
    fallback:decision.mode === "fallback"
  };
}

export async function handleRequest(request, fetchImpl = fetch) {
  const incoming = new URL(request.url);
  const isStatus = request.method === "GET" && incoming.pathname === "/__yokup-gate";
  const decision = await deploymentDecision(fetchImpl, isStatus);
  if (isStatus) {
    return Response.json(publicDecision(decision), {
      headers:{ "Cache-Control":"no-store", "X-Yokup-Gate":decision.mode, "X-Yokup-Gate-Reason":decision.reason }
    });
  }

  const upstreamUrl = new URL(incoming.pathname + incoming.search, decision.origin);
  const upstreamRequest = new Request(upstreamUrl, request);
  const upstream = await fetchImpl(upstreamRequest);
  const headers = new Headers(upstream.headers);
  headers.set("X-Yokup-Gate", decision.mode);
  headers.set("X-Yokup-Gate-Reason", decision.reason);
  headers.set("X-Yokup-Gate-Version", decision.version || "unknown");
  return new Response(upstream.body, { status:upstream.status, statusText:upstream.statusText, headers });
}

export default { fetch:handleRequest };
