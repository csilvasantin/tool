// Public operational totals only: no subjects, people or ticket identifiers.
// Read the canonical tickets table so recovery alone never turns a point green.
export const INCIDENT_MAP_SQL = `SELECT loc AS location_id,COUNT(*) AS active,
 SUM(CASE WHEN priority IN ('alta','urgente') THEN 1 ELSE 0 END) AS severe
 FROM tickets WHERE id LIKE 'INC-%' AND status NOT IN ('resolved','cancelled')
 AND COALESCE(role,'')!='mission' AND COALESCE(source,'') NOT IN ('fleet','decision-batch','cli-declare')
 AND loc IS NOT NULL AND loc<>'' GROUP BY loc LIMIT 10001`;
export async function handleIncidentMap(env,json) {
 try {
  const rows=(await env.DB.prepare(INCIDENT_MAP_SQL).all()).results||[];
  if(rows.length>10000)throw Error('incomplete');
  const locations=rows.map(r=>({id:r.location_id,active:Number(r.active),severe:Number(r.severe),level:Number(r.severe)>0?2:1}));
  const response=json({ok:true,generated_at:Date.now(),locations});
  response.headers.set('Cache-Control','public, max-age=5');return response;
 }catch{return json({ok:false,error:'incident_map_unavailable'},503);}
}
