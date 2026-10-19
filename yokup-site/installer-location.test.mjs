import test from 'node:test';import assert from 'node:assert/strict';
import {onRequestGet} from './functions/api/installer-location.js';
const feature=(country='ES',coords=[2.177,41.382])=>({geometry:{type:'Point',coordinates:coords},properties:{name:'Barcelona',countrycode:country,state:'Catalunya',country:'España'}});
const request=params=>new Request('https://www.admira.app/api/installer-location?'+params);
test('city search is bounded, country-filtered and uses supported provider language',async()=>{
 let url;const r=await onRequestGet({request:request('q=Barcelona&country=ES&lang=es'),env:{FETCH:async u=>{url=u;return Response.json({features:[feature(),feature('FR'),feature('ES',[999,0])]});}}});
 assert.equal(url.origin,'https://photon.komoot.io');assert.equal(url.searchParams.get('lang'),'default');assert.equal(url.searchParams.get('countrycode'),'ES');assert.deepEqual(url.searchParams.getAll('layer'),['city','locality']);
 assert.equal((await r.json()).places.length,1);assert.match(r.headers.get('Cache-Control'),/86400/);
});
test('invalid city or coordinates never call upstream; zero coordinates are valid',async()=>{
 for(const p of ['q=x&country=ES','q=Barcelona&country=evil','lat=&lon=0','lat=91&lon=0','lat=NaN&lon=1']){
  const r=await onRequestGet({request:request(p),env:{FETCH:()=>assert.fail('no upstream')}});assert.equal(r.status,400);
 }
 const r=await onRequestGet({request:request('lat=0&lon=0&lang=en'),env:{FETCH:async u=>{assert.equal(u.pathname,'/reverse');return Response.json({features:[feature('ES',[0,0])]});}}});assert.equal((await r.json()).places[0].latitude,0);assert.equal(r.headers.get('Cache-Control'),'no-store');
});
test('geocoder failure is explicit and never cached as success',async()=>{
 const r=await onRequestGet({request:request('q=Barcelona&country=ES'),env:{FETCH:async()=>{throw Error('offline')}}});assert.equal(r.status,503);assert.equal(r.headers.get('Cache-Control'),'no-store');
});
