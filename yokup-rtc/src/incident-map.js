// Public operational previews only. Never expose ticket titles, notes, people or photos.
export const INCIDENT_MAP_SQL = `WITH active AS (
 SELECT id,loc,priority,source,ROW_NUMBER() OVER(PARTITION BY loc ORDER BY
 CASE priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
 updated_at DESC,id) AS position
 FROM tickets WHERE id LIKE 'INC-%' AND status NOT IN ('resolved','cancelled')
 AND COALESCE(role,'')!='mission' AND COALESCE(source,'') NOT IN ('fleet','decision-batch','cli-declare')
 AND loc IS NOT NULL AND loc<>''
) SELECT loc AS location_id,COUNT(*) AS active,
 SUM(CASE WHEN priority IN ('alta','urgente') THEN 1 ELSE 0 END) AS severe,
 MAX(CASE WHEN position=1 THEN id END) AS incident_id,
 MAX(CASE WHEN position=1 THEN source END) AS incident_source
 FROM active GROUP BY loc LIMIT 10001`;
export function incidentPreview(row) {
 if(!/^INC-[A-Z0-9]{4,16}$/.test(row.incident_id||''))return null;
 const severe=Number(row.severe)>0,supervisor=String(row.incident_source||'').startsWith('supervisor-');
 const summary=supervisor
  ? severe?{es:'Fallo grave de emisión detectado por el Supervisor.',en:'Severe playback fault detected by Supervisor.'}:{es:'Incidencia de emisión abierta, pendiente de revisión.',en:'Open playback incident, awaiting review.'}
  : severe?{es:'Incidencia grave o total abierta en el establecimiento.',en:'Open severe or total incident at this establishment.'}:{es:'Incidencia abierta en un equipo del establecimiento.',en:'Open incident affecting equipment at this establishment.'};
 return {id:row.incident_id,summary};
}
export async function handleIncidentMap(env,json) {
 try {
  const rows=(await env.DB.prepare(INCIDENT_MAP_SQL).all()).results||[];
  if(rows.length>10000)throw Error('incomplete');
  const locations=rows.map(r=>({id:r.location_id,active:Number(r.active),severe:Number(r.severe),level:Number(r.severe)>0?2:1,incident:incidentPreview(r)}));
  const response=json({ok:true,generated_at:Date.now(),locations});
  response.headers.set('Cache-Control','public, max-age=5');return response;
 }catch{return json({ok:false,error:'incident_map_unavailable'},503);}
}
