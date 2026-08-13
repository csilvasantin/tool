const MAX_FORM_BYTES = 20000;
const MAX_CHALLENGE_BYTES = 2048;

function parseCookies(header) {
  const out = {};
  for (const item of String(header || '').split(';')) {
    const at = item.indexOf('=');
    if (at < 1) continue;
    try { out[item.slice(0, at).trim()] = decodeURIComponent(item.slice(at + 1).trim()); } catch (_) {}
  }
  return out;
}

function equalText(left, right) {
  const a = String(left || ''), b = String(right || '');
  if (!a || a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

export async function readGisForm(request) {
  const type = String(request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  if (type !== 'application/x-www-form-urlencoded') return null;
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_FORM_BYTES) return null;
  const raw = await request.text();
  if (raw.length > MAX_FORM_BYTES) return null;
  const form = new URLSearchParams(raw);
  const csrfCookie = parseCookies(request.headers.get('cookie')).g_csrf_token || '';
  if (!equalText(csrfCookie, form.get('g_csrf_token'))) return null;
  const credential = form.get('credential') || '', state = form.get('state') || '';
  if (!credential || credential.length > 16384 || !state) return null;
  return { raw, credential, state };
}

function cloneResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status:response.status, headers });
}

export function createCallbackProxy({ backendUrl, publicOrigin, fetchImpl = fetch }) {
  return async function handle(request) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status:405, headers:{Allow:'POST','Cache-Control':'no-store'} });
    const form = await readGisForm(request);
    if (!form) return new Response('Solicitud no válida', { status:403, headers:{'Cache-Control':'no-store'} });
    const response = await fetchImpl(backendUrl, {
      method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded','Cookie':request.headers.get('cookie') || '','Origin':publicOrigin},
      body:form.raw, redirect:'manual'
    });
    return cloneResponse(response);
  };
}

export function createChallengeProxy({ backendUrl, publicOrigin, fetchImpl = fetch }) {
  return async function handle(request) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status:405, headers:{Allow:'POST','Cache-Control':'no-store'} });
    const type = String(request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
    const length = Number(request.headers.get('content-length') || 0);
    if (type !== 'application/json' || length > MAX_CHALLENGE_BYTES) return new Response('Solicitud no válida', { status:400, headers:{'Cache-Control':'no-store'} });
    const raw = await request.text();
    if (raw.length > MAX_CHALLENGE_BYTES) return new Response('Solicitud no válida', { status:400, headers:{'Cache-Control':'no-store'} });
    const response = await fetchImpl(backendUrl, {
      method:'POST', headers:{'Content-Type':'application/json','Origin':publicOrigin}, body:raw, redirect:'manual'
    });
    return cloneResponse(response);
  };
}
