const PUBLIC_ORIGIN = "https://www.yokup.com";
const API_ORIGIN = "https://api.yokup.com";
const MAX_CHALLENGE_BYTES = 2048;
const MAX_CALLBACK_BYTES = 20000;

function cookies(header) {
  const out = Object.create(null);
  for (const part of String(header || "").split(";")) {
    const at = part.indexOf("=");
    if (at < 1) continue;
    try { out[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim()); } catch (_) {}
  }
  return out;
}

function equalText(left, right) {
  const a = String(left || ""), b = String(right || "");
  if (!a || a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

function noStore(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  // Estas rutas no pasan por Workers Assets, por lo que tampoco reciben
  // yokup-site/_headers. Mantener aquí el COOP de GIS evita que el callback
  // cambie de política respecto a la página que abrió el acceso.
  headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status:response.status, statusText:response.statusText, headers });
}

async function rawBody(request, limit) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > limit) return null;
  const body = await request.text();
  return body.length <= limit ? body : null;
}

export async function authProxy(request, fetchImpl = fetch) {
  const url = new URL(request.url);
  if (url.pathname === "/auth/challenge") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status:405, headers:{ Allow:"POST", "Cache-Control":"no-store" } });
    if (String(request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase() !== "application/json") return Response.json({error:"invalid_form"}, {status:400, headers:{"Cache-Control":"no-store"}});
    const body = await rawBody(request, MAX_CHALLENGE_BYTES);
    if (body == null) return Response.json({error:"invalid_form"}, {status:400, headers:{"Cache-Control":"no-store"}});
    const upstream = await fetchImpl(API_ORIGIN + "/auth/challenge", {
      method:"POST", headers:{"Content-Type":"application/json", Origin:PUBLIC_ORIGIN}, body, redirect:"manual"
    });
    return noStore(upstream);
  }
  if (url.pathname === "/auth/callback") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status:405, headers:{ Allow:"POST", "Cache-Control":"no-store" } });
    if (String(request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") return Response.json({error:"invalid_form"}, {status:400, headers:{"Cache-Control":"no-store"}});
    const body = await rawBody(request, MAX_CALLBACK_BYTES);
    if (body == null) return Response.json({error:"invalid_form"}, {status:400, headers:{"Cache-Control":"no-store"}});
    const form = new URLSearchParams(body);
    if (!equalText(cookies(request.headers.get("cookie")).g_csrf_token, form.get("g_csrf_token"))) return Response.json({error:"csrf_invalid"}, {status:403, headers:{"Cache-Control":"no-store"}});
    const upstream = await fetchImpl(API_ORIGIN + "/auth/callback", {
      method:"POST",
      headers:{"Content-Type":"application/x-www-form-urlencoded", Cookie:String(request.headers.get("cookie") || ""), Origin:PUBLIC_ORIGIN},
      body, redirect:"manual"
    });
    return noStore(upstream);
  }
  return null;
}
