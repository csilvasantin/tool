// Establecimientos del comercio → circuitos de Cartelería Digital en Admira.
//
// Carlos, 14-sep-2026: los circuitos se dan de alta desde /retailer, porque lo
// hace el cliente final. Cada establecimiento es un circuito (como los kioskos de
// Vila, Jardinets o Lesseps) y aparece «sin canal» en admira.tv/digitalsignage
// hasta que un operador lo asigna. Admira es la dueña del registro
// (api.admira.store/grid/circuits); Yokup solo guarda qué id le dio a cada
// establecimiento y si el alta llegó.
//
// La sincronización NUNCA bloquea al comercio: corre después de responder
// (waitUntil) y en el cron, con reintentos acotados. Sin ADMIRA_CIRCUIT_SERVICE_KEY
// no hace nada. Al registro solo viajan id, nombre del establecimiento y ciudad:
// ni email, ni dirección, ni coordenadas.

export const ADMIRA_CIRCUITS_URL = 'https://api.admira.store/grid/circuits';
const MAX_ATTEMPTS = 8;
const BATCH = 25;

function slug(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Id legible y único: nombre del establecimiento + 6 caracteres de su UUID.
export function circuitIdForSite(site) {
  const tail = String(site.id || '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 6) || '000000';
  const base = slug(site.name).slice(0, 32).replace(/-+$/, '') || 'comercio';
  return (/^[a-z0-9]/.test(base) ? base : 'c' + base) + '-' + tail;
}

export function circuitNameForSite(site) {
  return [site.name, site.city].map(v => String(v || '').replace(/[\u0000-\u001f<>]/g, '').trim()).filter(Boolean).join(' · ').slice(0, 60);
}

export async function syncRetailerCircuits(env, fetcher = fetch) {
  if (!env.ADMIRA_CIRCUIT_SERVICE_KEY || !env.DB) return { skipped: true };
  const now = Date.now();
  // 1) Asignar id de circuito a los establecimientos que aún no lo tienen.
  const fresh = await env.DB.prepare(`SELECT s.id,s.name,s.city FROM retailer_sites s LEFT JOIN retailer_site_circuits c ON c.site_id=s.id
    WHERE c.site_id IS NULL ORDER BY s.created_at LIMIT ?`).bind(BATCH).all();
  for (const site of fresh.results || []) {
    await env.DB.prepare('INSERT OR IGNORE INTO retailer_site_circuits(site_id,circuit_id,status,attempts,created_at) VALUES(?,?,?,?,?)')
      .bind(site.id, circuitIdForSite(site), 'pending', 0, now).run();
  }
  // 2) Dar de alta en Admira lo pendiente (idempotente en el registro).
  const pending = await env.DB.prepare(`SELECT c.site_id,c.circuit_id,c.attempts,s.name,s.city,s.retailer_id FROM retailer_site_circuits c
    JOIN retailer_sites s ON s.id=c.site_id WHERE c.status!='synced' AND c.attempts<? ORDER BY c.created_at LIMIT ?`).bind(MAX_ATTEMPTS, BATCH).all();
  let synced = 0, failed = 0;
  for (const row of pending.results || []) {
    let error = '';
    try {
      const r = await fetcher(ADMIRA_CIRCUITS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.ADMIRA_CIRCUIT_SERVICE_KEY, 'user-agent': 'yokup-api/retailer-circuits' },
        body: JSON.stringify({ circuit: row.circuit_id, name: circuitNameForSite(row), source: 'yokup-retailer', actor: 'retailer:' + row.retailer_id })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok !== true) error = String(d.error || 'http_' + r.status);
    } catch (e) { error = String(e && e.message || 'network').slice(0, 80); }
    if (!error) {
      await env.DB.prepare("UPDATE retailer_site_circuits SET status='synced',last_error=NULL,synced_at=?,attempts=attempts+1 WHERE site_id=?").bind(Date.now(), row.site_id).run();
      synced++;
    } else {
      const status = row.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending';
      await env.DB.prepare('UPDATE retailer_site_circuits SET status=?,last_error=?,attempts=attempts+1 WHERE site_id=?').bind(status, error.slice(0, 120), row.site_id).run();
      failed++;
    }
  }
  return { assigned: (fresh.results || []).length, synced, failed };
}
