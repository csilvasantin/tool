import { publicOriginFor, esEspejo } from '../_shared/casas.mjs';

// Entrada de agentes (TG#5064 / FLT-101509): mismo contrato que admira.store/auth/agente.
// La lógica y el secret viven en api.admira.biz / api.yokup.com (yokup-rtc). Aquí solo
// se sirve el formulario en el espejo y se reenvía el POST al API de la casa.
function apiFor(request) {
  let host = '';
  try { host = new URL(request.url).hostname; } catch (_) {}
  return esEspejo(host) ? 'https://api.admira.biz' : 'https://api.yokup.com';
}

export async function onRequest(context) {
  const { request } = context;
  const api = apiFor(request);
  const publicOrigin = publicOriginFor(request);
  const url = new URL(request.url);
  const upstream = new URL('/auth/agente' + url.search, api);
  const headers = new Headers();
  const pass = ['authorization', 'content-type', 'x-agente', 'x-return-to', 'cookie', 'user-agent', 'cf-connecting-ip'];
  for (const name of pass) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('Origin', publicOrigin);
  const init = { method: request.method, headers, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;
  const response = await fetch(upstream, init);
  const out = new Headers(response.headers);
  out.set('Cache-Control', 'no-store');
  out.set('Referrer-Policy', 'no-referrer');
  out.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status: response.status, headers: out });
}
