import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shopApi,shopRoute} from './functions/_shared/ecommerce-shop.mjs';
test('shop keeps the shared ecommerce path and sends operational portals to App',()=>{
 assert.equal(shopRoute(new Request('https://admira.shop')).headers.get('location'),'https://admira.shop/ecommerce');
 assert.equal(shopRoute(new Request('https://admira.shop/ecommerce')),null);
 assert.equal(shopRoute(new Request('https://admira.app/retailer')),null);
 assert.equal(shopRoute(new Request('https://admira.shop/retailer?incident=1')).headers.get('location'),'https://admira.app/retailer?incident=1');
 assert.equal(shopRoute(new Request('https://www.admira.shop/ecommerce')).headers.get('location'),'https://admira.shop/ecommerce');
});
test('shop proxy preserves same-site HttpOnly sessions and forwards only the chosen portal cookie',async()=>{
 let forwarded;const cookie='__Host-yk_retailer='+'a'.repeat(64);
 const r=await shopApi(new Request('https://admira.shop/ecommerce-api/retailer/login',{method:'POST',headers:{Origin:'https://admira.shop','Content-Type':'application/json',Cookie:cookie+'; unrelated=secret','Authorization':'Bearer must-not-forward'},body:'{"email":"test@example.test","password":"test-only"}'}),async req=>{forwarded=req;return Response.json({ok:true},{headers:{'Set-Cookie':cookie+'; Path=/; Secure; HttpOnly; SameSite=Strict'}});});
 assert.equal(forwarded.url,'https://data.admira.app/api/retailer/login');assert.equal(forwarded.headers.get('cookie'),cookie);assert.equal(forwarded.headers.get('authorization'),null);assert.equal(forwarded.headers.get('origin'),'https://admira.shop');assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.equal(r.headers.get('cache-control'),'no-store');
});
test('shop proxy rejects cross-origin writes, unknown hosts, traversal and unrelated APIs without network calls',async()=>{
 let calls=0;const fetcher=()=>{calls++;return Response.json({});};
 for(const [url,headers,method] of [
  ['https://admira.shop/ecommerce-api/retailer/login',{Origin:'https://evil.test','Content-Type':'application/json'},'POST'],
  ['https://evil.test/ecommerce-api/retailer/me',{},'GET'],
  ['https://admira.shop/ecommerce-api/portal-admin/superusers',{},'GET'],
  ['https://admira.shop/ecommerce-api/retailer/%2e%2e/portal-admin/me',{},'GET'],
  ['https://admira.shop/ecommerce-api/retailer/register',{Origin:'https://admira.shop','Content-Type':'application/json'},'POST']
 ])assert.ok((await shopApi(new Request(url,{method,headers,body:method==='POST'?'{}':undefined}),fetcher)).status>=400);
 assert.equal(calls,0);
});
