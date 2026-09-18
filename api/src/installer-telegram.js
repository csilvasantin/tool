// Avisos de oportunidad por Telegram (Carlos, 18-sep-2026). Cada aviso nuevo de un
// instalador con chat vinculado sale una vez; si Telegram falla se reintenta en el
// siguiente barrido. Sin TELEGRAM_BOT_TOKEN no se envía nada.
const DAY=86400000;
export async function sendTelegramAlerts(env){
 if(!env.TELEGRAM_BOT_TOKEN)return;
 const {results}=await env.DB.prepare(`SELECT n.id,t.chat_id,i.title,d.name AS device_name,n.distance_km,rd.priority FROM installer_notifications n JOIN installer_telegram t ON t.installer_id=n.installer_id JOIN installer_incidents i ON i.id=n.incident_id JOIN installer_devices d ON d.id=i.device_id LEFT JOIN retailer_incident_details rd ON rd.incident_id=i.id WHERE i.status='open' AND n.created_at>? AND NOT EXISTS(SELECT 1 FROM installer_telegram_sent s WHERE s.notification_id=n.id) LIMIT 50`).bind(Date.now()-DAY).all();
 for(const n of results){
  const claimed=await env.DB.prepare('INSERT OR IGNORE INTO installer_telegram_sent(notification_id,sent_at) VALUES(?,?)').bind(n.id,Date.now()).run();
  if(!claimed.meta.changes)continue;
  const text=['🔧 Yokup · nueva oportunidad de trabajo'+(n.priority==='urgent'?' · URGENTE':''),n.title,`${n.device_name} · a ${Number(n.distance_km).toFixed(1).replace('.',',')} km`,'Acéptala en https://www.yokup.com/instalador'].join('\n');
  let ok=false;
  try{ok=(await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:n.chat_id,text,disable_web_page_preview:true})})).ok;}catch{}
  if(!ok)await env.DB.prepare('DELETE FROM installer_telegram_sent WHERE notification_id=?').bind(n.id).run();
 }
}
