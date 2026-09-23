// Editorial selection: general learning, not approved equipment procedures.
export const categories={diagnostico:'Diagnóstico',atencion:'Atención',calidad:'Calidad',coordinacion:'Coordinación',seguridad:'Seguridad'};
export const selection={
 '1786368553979-dz99j2':{category:'diagnostico',use:'Describe el síntoma antes de proponer una solución. Distingue qué ocurre, qué debería ocurrir y qué comprobación permite descartar una causa.'},
 '1786456925296-giu2an':{category:'diagnostico',use:'Reúne señales del equipo, alertas y contexto de la instalación. Una sola señal no basta para declarar resuelta una incidencia.'},
 '1788487956163-a5yn50':{category:'atencion',use:'Explica qué vas a pedir y por qué. Da al participante la opción de parar o hablar con una persona y conserva su control sobre la intervención.'},
 '1786565058665-si2gpi':{category:'atencion',use:'Da una instrucción sencilla cada vez, evita jerga y comprueba que la persona la ha entendido antes de avanzar.'},
 '1788348284525-usg549':{category:'calidad',use:'Define qué se va a comprobar. Distingue entre una acción solicitada, una acción realizada y una recuperación verificada.'},
 '1786551218608-8682ug':{category:'calidad',use:'Prueba el recorrido real: detección, contacto, respuesta y resultado. Un envío aceptado o una llamada que suena no demuestra que la asistencia haya funcionado.'},
 '1786111642195-kto4yn':{category:'calidad',use:'Verifica la integración completa en la instalación. Documenta el resultado que ve el comercio, además de las comprobaciones de cada componente.'},
 '1786402888874-yqy84e':{category:'coordinacion',use:'Asigna un responsable a cada incidencia y deja claro quién recibe el siguiente paso cuando se necesita escalar a un técnico.'},
 '1786274076684-qiqbot':{category:'seguridad',use:'Recoge solo los datos necesarios para ayudar. No pidas contraseñas por voz ni conviertas una excepción de acceso en un permiso permanente.'}
};
export function capsulesFrom(payload){
 const items=Array.isArray(payload)?payload:payload?.items;if(!Array.isArray(items))throw Error('Pixeria no ha devuelto un catálogo válido.');
 const seen=new Set();return items.flatMap(it=>{
  if(!it||!['capsula','guion'].includes(String(it.type).toLowerCase())||typeof it.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(it.id)||seen.has(it.id))return [];
  const tags=Array.isArray(it.tags)?it.tags.filter(t=>typeof t==='string').map(t=>t.trim().toLowerCase().replace(/^#/,'')):[];
  if(!tags.includes('yokup')||typeof it.comment!=='string'||!it.comment.trim())return [];
  seen.add(it.id);const editorial=selection[it.id];return [{id:it.id,title:String(it.title||'Cápsula sin título').slice(0,200),note:it.comment.slice(0,12000),tags,category:editorial?.category||'general',use:editorial?.use||'Material etiquetado para Yokup. Su aplicación concreta está pendiente de revisión.',source:'https://www.pixeria.com/stock.html?highlight='+encodeURIComponent(it.id),technical:false}];
 }).sort((a,b)=>a.category.localeCompare(b.category)||a.title.localeCompare(b.title,'es'));
}
export const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function filterCapsules(items,query,category){const words=normalize(query).split(/\s+/).filter(Boolean);return items.filter(c=>(!category||c.category===category)&&words.every(w=>normalize(c.title+' '+c.note+' '+c.use+' '+c.tags.join(' ')).includes(w)));}
