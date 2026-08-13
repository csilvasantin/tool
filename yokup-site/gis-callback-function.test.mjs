import assert from 'node:assert/strict';
import test from 'node:test';
import { createCallbackProxy, createChallengeProxy } from './functions/_shared/gis-callback.mjs';
import { onRequest as callbackOnRequest } from './functions/auth/callback.js';
import { onRequest as challengeOnRequest } from './functions/auth/challenge.js';

test('las Pages Functions reales resuelven su helper compartido', () => {
  assert.equal(typeof callbackOnRequest, 'function');
  assert.equal(typeof challengeOnRequest, 'function');
});

test('challenge same-origin preserva Set-Cookie y no acepta métodos o cuerpos amplios', async () => {
  let forwarded;
  const handle = createChallengeProxy({ backendUrl:'https://api.yokup.com/auth/challenge', publicOrigin:'https://www.yokup.com', fetchImpl:async (url, init) => {
    forwarded={url,init}; return new Response('{"ok":true}', {headers:{'Set-Cookie':'__Host-yk_challenge=state; Secure; HttpOnly; Path=/'}});
  }});
  const response = await handle(new Request('https://www.yokup.com/auth/challenge', {method:'POST',headers:{'content-type':'application/json'},body:'{"flow":"redirect"}'}));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /__Host-yk_challenge=state/);
  assert.equal(forwarded.init.headers.Origin, 'https://www.yokup.com');
  assert.equal((await handle(new Request('https://www.yokup.com/auth/challenge'))).status, 405);
});

test('callback same-origin valida double CSRF antes de reenviar POST exacto', async () => {
  let calls=0, forwarded;
  const handle = createCallbackProxy({ backendUrl:'https://api.yokup.com/auth/callback', publicOrigin:'https://www.yokup.com', fetchImpl:async (url, init) => {
    calls+=1; forwarded={url,init}; return new Response('<form>opaque only</form>', {headers:{'Content-Type':'text/html','Set-Cookie':'__Host-yk_challenge=; Max-Age=0'}});
  }});
  const body = new URLSearchParams({credential:'secret-token',state:'state',g_csrf_token:'csrf'});
  const good = await handle(new Request('https://www.yokup.com/auth/callback', {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',cookie:'g_csrf_token=csrf; __Host-yk_challenge=state'},body}));
  assert.equal(good.status,200); assert.equal(calls,1);
  assert.equal(forwarded.init.headers.Cookie,'g_csrf_token=csrf; __Host-yk_challenge=state');
  assert.match(forwarded.init.body,/credential=secret-token/);
  const bad = await handle(new Request('https://www.yokup.com/auth/callback', {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',cookie:'g_csrf_token=otro'},body}));
  assert.equal(bad.status,403); assert.equal(calls,1); assert.doesNotMatch(await bad.text(),/secret-token/);
});

test('callback same-origin preserva el 303 de relevo sin ejecutar HTML intermedio', async () => {
  const handle = createCallbackProxy({ backendUrl:'https://api.yokup.com/auth/callback', publicOrigin:'https://www.yokup.com', fetchImpl:async () => {
    return new Response(null, {status:303, headers:{Location:'https://api.yokup.com/auth/handoff?code=opaque','Referrer-Policy':'no-referrer'}});
  }});
  const body = new URLSearchParams({credential:'secret-token',state:'state',g_csrf_token:'csrf'});
  const response = await handle(new Request('https://www.yokup.com/auth/callback', {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',cookie:'g_csrf_token=csrf; __Host-yk_challenge=state'},body}));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://api.yokup.com/auth/handoff?code=opaque');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await response.text(), '');
});
