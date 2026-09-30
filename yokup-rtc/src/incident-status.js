// ESTADO PÚBLICO DE INCIDENCIAS DE DEMO (DEC-munpe1fhy7kq, Carlos 30-sep-2026).
// XpaceOS abre la incidencia con POST /incident y hasta hoy no volvía a saber nada
// de ella: la pantalla se quedaba negra y el ciclo de Yokup (técnico, SLA, cierre)
// no se veía en el gemelo. GET /incident/status devuelve lo mínimo para pintarlo
// sobre la pantalla. Es PÚBLICO como POST /incident, así que sólo sirve recursos
// `demo:` —nunca misiones de flota ni pantallas reales— y sólo campos operativos.

export const INCIDENT_STATUS_PREFIX = 'demo:';
export const INCIDENT_STATUS_MAX_IDS = 20;
export const INCIDENT_STATUS_MAX_ACTIVE = 40;
export const INCIDENT_STATUS_CACHE_S = 5;

// Minutos de SLA por gravedad: respuesta (primer gesto humano) y resolución (cierre).
export const INCIDENT_SLA_MIN = Object.freeze({
  urgente: Object.freeze({ response: 15, resolution: 240 }),
  alta: Object.freeze({ response: 30, resolution: 480 }),
  normal: Object.freeze({ response: 120, resolution: 1440 }),
  baja: Object.freeze({ response: 480, resolution: 4320 })
});

const ID_RE = /^[A-Z]{3}-[A-Z0-9]{4,10}$/;
const RESPONSE_KINDS = new Set(['note', 'status', 'close', 'evidence']);

// prefix = `demo:<tienda>:`; ids = lista separada por comas de INC-… abiertos desde el gemelo.
export function normalizeIncidentStatusQuery(params) {
  const get = (k) => (params && typeof params.get === 'function' ? params.get(k) : params && params[k]) || '';
  const prefix = String(get('prefix')).trim().slice(0, 160);
  if (prefix && (!prefix.startsWith(INCIDENT_STATUS_PREFIX) || prefix.length < INCIDENT_STATUS_PREFIX.length + 3)) {
    return { ok: false, error: 'prefix debe empezar por ' + INCIDENT_STATUS_PREFIX + '<tienda>' };
  }
  const ids = [...new Set(String(get('ids')).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (ids.length > INCIDENT_STATUS_MAX_IDS) return { ok: false, error: 'máximo ' + INCIDENT_STATUS_MAX_IDS + ' ids' };
  if (ids.some((id) => !ID_RE.test(id))) return { ok: false, error: 'id de incidencia inválido' };
  if (!prefix && !ids.length) return { ok: false, error: 'prefix o ids requerido' };
  return { ok: true, prefix, ids };
}

// Límite superior del rango de un prefijo, para que SQLite use el índice por `screen`.
export function prefixUpperBound(prefix) {
  return prefix + '￿';
}

export function incidentSla(priority, createdAt, respondedAt, resolvedAt, now = Date.now()) {
  const sla = INCIDENT_SLA_MIN[priority] || INCIDENT_SLA_MIN.alta;
  const created = Number(createdAt) || now;
  const responseDue = created + sla.response * 60000;
  const resolutionDue = created + sla.resolution * 60000;
  const responded = Number(respondedAt) || 0;
  const resolved = Number(resolvedAt) || 0;
  return {
    response_min: sla.response,
    resolution_min: sla.resolution,
    response_due: responseDue,
    resolution_due: resolutionDue,
    responded_at: responded || null,
    // null = todavía en juego; true/false = ya decidido (a tiempo o fuera de plazo).
    response_ok: responded ? responded <= responseDue : (now > responseDue ? false : null),
    resolution_ok: resolved ? resolved <= resolutionDue : (now > resolutionDue ? false : null)
  };
}

// abierta → en_curso (un humano ya respondió) → recuperada (el recurso vuelve, falta
// verificar) → cerrada. `cancelada` sale aparte para que el gemelo la retire.
export function incidentStage(status, events) {
  if (status === 'resolved') return 'cerrada';
  if (status === 'cancelled') return 'cancelada';
  const list = Array.isArray(events) ? events : [];
  const last = list.length ? list[list.length - 1] : null;
  if (last && last.kind === 'recover') return 'recuperada';
  if (status === 'in_progress' || list.some((e) => RESPONSE_KINDS.has(e.kind))) return 'en_curso';
  return 'abierta';
}

export function serializeIncidentStatus(ticket, events, now = Date.now()) {
  const list = (Array.isArray(events) ? events : []).slice().sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
  const created = Number(ticket.created_at) || 0;
  const responded = list.find((e) => RESPONSE_KINDS.has(e.kind) && (Number(e.ts) || 0) >= created);
  const recovered = [...list].reverse().find((e) => e.kind === 'recover');
  const resolvedAt = ticket.status === 'resolved' ? (Number(ticket.resolved_at) || Number(ticket.updated_at) || null) : null;
  const closing = ticket.status === 'resolved' ? [...list].reverse().find((e) => e.kind === 'status' || e.kind === 'close') : null;
  return {
    id: ticket.id,
    resource: ticket.screen,
    subject: ticket.subject || '',
    status: ticket.status,
    stage: incidentStage(ticket.status, list),
    priority: ticket.priority || 'alta',
    assignee: ticket.assignee || '',
    created_at: created || null,
    updated_at: Number(ticket.updated_at) || null,
    recovered_at: recovered ? Number(recovered.ts) || null : null,
    resolved_at: resolvedAt,
    closed_by: closing ? String(closing.author || '').slice(0, 60) : '',
    proof: ticket.status === 'resolved' && /^https:\/\//.test(String(ticket.proof_image || '')) ? ticket.proof_image : null,
    // Cerrar sin nota previa también es responder: el técnico actuó al cerrar.
    sla: incidentSla(ticket.priority, created, (responded && responded.ts) || resolvedAt, resolvedAt, now)
  };
}

// Sesiones del gemelo (Carlos, 30-sep-2026). Cada pestaña que abre el Xtore/Matrix late en
// /signage/screens como `xtore-<azar>` con role `xtore-game`: no es una pantalla, es un
// visitante. Al cerrar la pestaña deja de latir y el vigilante abría «Pantalla sin señal»
// nueva por sesión (40 abiertas en el Starbucks). Sólo se vigilan pantallas de emisión.
export const RECONCILE_SKIP_ROLES = new Set(['xtore-game']);
export function isMonitoredScreen(screen) {
  return !!(screen && screen.screen) && !RECONCILE_SKIP_ROLES.has(String(screen.role || ''));
}
