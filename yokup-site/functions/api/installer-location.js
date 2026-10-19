// Deliberate city searches only (no search-as-you-type). No account data is sent.
// Photon public API: https://github.com/komoot/photon/blob/master/docs/api-v1.md
const json=(data,status=200,privateLocation=false)=>Response.json(data,{status,headers:{'Cache-Control':status===200&&!privateLocation?'public, max-age=86400':'no-store'}});
export async function onRequestGet({request,env={}}){
 const p=new URL(request.url).searchParams, reverse=p.has('lat')||p.has('lon');
 const u=new URL(reverse?'https://photon.komoot.io/reverse':'https://photon.komoot.io/api');
 u.searchParams.set('limit',reverse?'1':'6');
 // The public instance supports English and native place names, not lang=es.
 u.searchParams.set('lang',p.get('lang')==='en'?'en':'default');
 if(reverse){
  const a=p.get('lat'),b=p.get('lon'),lat=Number(a),lon=Number(b);
  if(!a?.trim()||!b?.trim()||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return json({error:'invalid_location'},400);
  u.searchParams.set('lat',String(lat));u.searchParams.set('lon',String(lon));
 }else{
  const q=(p.get('q')||'').trim(),country=(p.get('country')||'').toUpperCase();
  if(q.length<2||q.length>120||! /^[A-Z]{2}$/.test(country))return json({error:'invalid_search'},400);
  u.searchParams.set('q',q);u.searchParams.set('countrycode',country);u.searchParams.set('layer','city');u.searchParams.append('layer','locality');
 }
 try{
  const r=await (env.FETCH||fetch)(u,{headers:{Accept:'application/json','User-Agent':'AdmiraInstaller/1.0 (https://www.admira.app/instalador)'},signal:AbortSignal.timeout(8000),cf:{cacheTtl:reverse?0:86400,cacheEverything:!reverse}});
  if(!r.ok)throw new Error('geocoder unavailable');
  const data=await r.json();
  if(!Array.isArray(data.features))throw new Error('invalid geocoder response');
  const places=data.features.flatMap(f=>{
   const p=f.properties||{},[longitude,latitude]=f.geometry?.coordinates||[],country=String(p.countrycode||'').toUpperCase();
   if(f.geometry?.type!=='Point'||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180||! /^[A-Z]{2}$/.test(country))return [];
   if(!reverse&&country!==u.searchParams.get('countrycode'))return [];
   const city=String((reverse?p.city||p.district||p.name:p.name)||'').trim().slice(0,120);if(city.length<2)return [];
   const label=[city,p.state,p.country].filter(Boolean).map(v=>String(v).slice(0,120)).filter((v,i,a)=>a.indexOf(v)===i).join(' · ');
   return [{city,country,label,latitude,longitude}];
  }).slice(0,reverse?1:6);
  return json({places},200,reverse);
 }catch{return json({error:'location_unavailable'},503);}
}
