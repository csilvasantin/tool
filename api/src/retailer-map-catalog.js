import {statement,fail,response} from './installer-portal.js';
export const catalogId=siteId=>'yokup-'+siteId;
export function publicLocation(site){
 const kinds={tobacco:'Estanco',kiosk:'Kiosco',supermarket:'Supermercado',hospitality:'Hostelería',other:'Comercio'};
 return {id:catalogId(site.id),name:site.name,kind:kinds[site.kind]+' · Retail Yokup',addr:[site.address,site.city,site.country].join(' · '),coords:[site.longitude,site.latitude],city:site.city,country:site.country,network:'Yokup',source:'yokup-retailer',surfaces:[]};
}
export function publishStatements(env,sites,now=Date.now()){
 const ops=[];
 for(let n=0;n<sites.length;n+=8){const chunk=sites.slice(n,n+8);
  ops.push(statement(env,'INSERT INTO admira_retailer_locations(id,site_id,public_json,created_at,updated_at) VALUES '+chunk.map(()=>'(?,?,?,?,?)').join(',')+' ON CONFLICT(site_id) DO NOTHING',...chunk.flatMap(s=>[catalogId(s.id),s.id,JSON.stringify(publicLocation(s)),now,now])));
 }
 return ops;
}
export async function publishOwnedSite(request,env,owner,id){
 const site=await statement(env,'SELECT * FROM retailer_sites WHERE id=? AND retailer_id=?',id,owner).first();if(!site)fail(404,'Establecimiento no encontrado.');
 await env.DB.batch(publishStatements(env,[site]));
 return response(request,{ok:true,id:site.id,catalog_id:catalogId(site.id),map_status:'published'});
}
