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
  try{const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:n.chat_id,text,disable_web_page_preview:true})});ok=r.ok;if(!ok)console.warn('telegram',r.status,(await r.text()).slice(0,200));}catch(e){console.warn('telegram',String(e));}
  if(!ok)await env.DB.prepare('DELETE FROM installer_telegram_sent WHERE notification_id=?').bind(n.id).run();
 }
}

// «/start CÓDIGO» enviado al bot vincula ese chat con el instalador dueño del código.
export async function linkTelegramChats(env){
 if(!env.TELEGRAM_BOT_TOKEN)return;
 const api=`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
 const offset=Number((await env.DB.prepare("SELECT value FROM telegram_state WHERE key='offset'").bind().first())?.value||0);
 let updates=[];
 try{const r=await fetch(`${api}/getUpdates?offset=${offset}&timeout=0&allowed_updates=%5B%22message%22%5D`);if(!r.ok){console.warn('telegram getUpdates',r.status);return;}updates=(await r.json()).result||[];}catch(e){console.warn('telegram getUpdates',String(e));return;}
 for(const u of updates){
  const m=u.message,code=/^\/start\s+([a-f0-9]{12,64})$/.exec((m?.text||'').trim())?.[1];
  if(!code||!m.chat)continue;
  const link=await env.DB.prepare('SELECT l.installer_id,a.name FROM installer_telegram_links l JOIN installer_accounts a ON a.id=l.installer_id WHERE l.code=? AND l.expires_at>?').bind(code,Date.now()).first();
  if(!link)continue;
  await env.DB.batch([env.DB.prepare('INSERT OR REPLACE INTO installer_telegram(installer_id,chat_id,created_at) VALUES(?,?,?)').bind(link.installer_id,String(m.chat.id),Date.now()),env.DB.prepare('DELETE FROM installer_telegram_links WHERE code=?').bind(code)]);
  try{await fetch(`${api}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:m.chat.id,text:`✅ Telegram vinculado a Yokup. Aquí recibirás los avisos de trabajo de ${link.name}.`})});}catch{}
 }
 if(updates.length)await env.DB.prepare("INSERT OR REPLACE INTO telegram_state(key,value) VALUES('offset',?)").bind(String(updates.at(-1).update_id+1)).run();
}
