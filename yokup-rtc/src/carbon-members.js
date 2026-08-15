// CENSO DE CARBONO — las personas del equipo, con las mismas primitivas que el
// silicio (identidad, latido, foco) y con las diferencias que son REALES, no
// caprichos de esquema.
//
// De dónde viene esto: hasta hoy el «equipo humano» de Yokup eran cinco nombres
// inventados en la constante ROSTER de index.js (Javier M., Laura R., Dani K.,
// Sofía P., Construcciones Oria), repartidos por `hash(screen) % ROSTER.length`.
// No había alta, ni baja, ni latido, ni forma de saber si una persona existe.
// Una herramienta que dice controlar equipos no puede tener a la mitad de la
// plantilla escrita a mano en un fichero de código.
//
// LAS DOS DIFERENCIAS CON EL SILICIO, y no hay más:
//
//  1) UNA PERSONA NO TIENE MÁQUINA. La identidad de silicio es persona+apellido
//     de hierro (NeoMBP16) y sin apellido el worker responde 403 owner_mismatch,
//     porque un agente sin máquina no es nadie. Aplicar esa regla al carbono
//     dejaría fuera a todo el mundo: una persona ES la persona, y punto. Por eso
//     el id de carbono se deriva SOLO del nombre.
//
//  2) UNA PERSONA NO LATE CADA CINCO MINUTOS. El silicio manda presencia desde un
//     launchd; el carbono late cuando dice algo. Medir a una persona con la vara
//     del demonio la pinta muerta a los seis minutos de ir a comer. La ventana
//     por defecto es un TURNO (90 min), no un ciclo de proceso.
//
// Y la honestidad del mandamiento 2 aplicada al estado: quien nunca ha latido
// está «sin-latido», que NO es lo mismo que «ausente». Ausente es quien latió y
// dejó de hacerlo; sin-latido es quien está en el censo y aún no ha aparecido.
// Fundir los dos casos en «desconectado» es la clase de mentira cómoda que hace
// que un panel de control deje de servir para controlar.

export const CARBON_BEAT_WINDOW_MS = 90 * 60 * 1e3;

export const CARBON_MEMBERS_TABLE_SQL =
  "CREATE TABLE IF NOT EXISTS carbon_members (" +
  "id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT, zone TEXT, skills TEXT, " +
  "contact TEXT, status TEXT NOT NULL DEFAULT 'activo', " +
  "created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, created_by TEXT, " +
  "last_beat_at INTEGER, focus TEXT, focus_at INTEGER)";

export const CARBON_MEMBERS_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS idx_carbon_status ON carbon_members(status, name)";

const CARBON_STATUS = ["activo", "baja"];

// El id es un slug del nombre: estable, legible en una URL y deducible sin
// consultar la tabla, que es lo que permite que un móvil late sin haber leído
// antes el censo. Se despoja el acento porque el id viaja por querystring y por
// nombres de fichero de evidencia; el NOMBRE conserva su tilde intacta.
export function carbonId(value) {
  return String(value == null ? "" : value)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function texto(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

// Las habilidades entran como lista o como cadena con comas y salen SIEMPRE como
// lista limpia. El front no debería tener que adivinar cuál de las dos formas le
// tocó, que es justo lo que pasaba con `a.skills.split(",")` en /agentes.
export function carbonSkills(value) {
  const bruto = Array.isArray(value) ? value : String(value == null ? "" : value).split(",");
  return [...new Set(bruto.map((s) => texto(s, 40)).filter(Boolean))].slice(0, 12);
}

// Normaliza un alta o una edición. Devuelve {ok:false,error,code} en vez de
// lanzar: el handler traduce a 400 sin try/catch y el test comprueba el código.
export function normalizeCarbonMember(body, now) {
  const b = body || {};
  const name = texto(b.name, 80);
  if (!name) return { ok: false, code: "carbon_name_required", error: "una persona necesita nombre" };
  const id = carbonId(b.id || name);
  if (!id) return { ok: false, code: "carbon_id_invalid", error: "el nombre no produce un identificador válido" };
  const status = CARBON_STATUS.includes(b.status) ? b.status : "activo";
  return {
    ok: true,
    member: {
      id,
      name,
      role: texto(b.role, 60),
      zone: texto(b.zone, 60),
      skills: carbonSkills(b.skills).join(", "),
      contact: texto(b.contact, 120),
      status,
      created_by: texto(b.created_by || b.author, 80),
      updated_at: now
    }
  };
}

// El estado de una persona, con las tres respuestas honestas y ninguna más.
export function carbonState(member, now, windowMs = CARBON_BEAT_WINDOW_MS) {
  if (String((member && member.status) || "activo") === "baja") return "baja";
  const beat = Number((member && member.last_beat_at) || 0);
  if (!beat) return "sin-latido";
  return now - beat <= windowMs ? "en-turno" : "ausente";
}

// La fila que ve el front. `estado` va calculado en el servidor a propósito: si
// cada página lo dedujera por su cuenta acabarían discrepando, que es como el
// panel de máquinas llegó a decir «vivo» de un Mac apagado.
export function carbonRow(member, now, windowMs = CARBON_BEAT_WINDOW_MS) {
  const beat = Number((member && member.last_beat_at) || 0) || null;
  return {
    kind: "carbono",
    id: String((member && member.id) || ""),
    name: String((member && member.name) || ""),
    role: String((member && member.role) || ""),
    zone: String((member && member.zone) || ""),
    skills: carbonSkills(member && member.skills),
    contact: String((member && member.contact) || ""),
    status: String((member && member.status) || "activo"),
    estado: carbonState(member, now, windowMs),
    last_beat_at: beat,
    // Un «hace 3 min» lo calcula el front; lo que el servidor no puede dejar en
    // el aire es DESDE CUÁNDO, porque el reloj del navegador puede ir torcido.
    silencio_ms: beat ? Math.max(0, now - beat) : null,
    focus: String((member && member.focus) || ""),
    focus_at: Number((member && member.focus_at) || 0) || null,
    created_at: Number((member && member.created_at) || 0) || null,
    updated_at: Number((member && member.updated_at) || 0) || null
  };
}

// SEMILLA DEL CENSO, en SQL puro y con INSERT OR IGNORE. Se ejecuta con `exec`
// dentro de ensureSchema, que corre en cada petición: por eso NO puede empezar
// leyendo «¿ya hay alguien?» — una lectura por petición para no escribir nada el
// 99,99% de las veces. INSERT OR IGNORE ya es la comprobación, la hace el motor
// y es idempotente por clave primaria.
//
// El orden se congela en `created_at` incremental porque el reparto de partes es
// `hash(pantalla) % plantilla`: sembrar por orden alfabético habría cambiado de
// técnico todas las incidencias abiertas sin que nadie lo pidiera.
//
// `at` se pasa desde fuera (no Date.now() aquí) para que el SQL sea una constante
// estable: si cambiara en cada arranque, dos isolates sembrarían fechas distintas.
export function carbonSeedSql(roster, at) {
  const q = (v) => "'" + String(v == null ? "" : v).replace(/'/g, "''") + "'";
  return (Array.isArray(roster) ? roster : []).map((t, i) => {
    const id = carbonId(t && t.name);
    if (!id) return "";
    const skills = carbonSkills(t && t.skills).join(", ");
    return "INSERT OR IGNORE INTO carbon_members(id,name,role,zone,skills,contact,status,created_at,updated_at,created_by) VALUES(" +
      [q(id), q(t.name), q("técnico de campo"), q(t.zone), q(skills), q(""), q("activo"),
        at + i, at + i, q("semilla-roster")].join(",") + ");";
  }).filter(Boolean).join("\n");
}

// Un latido de carbono lleva foco o no lleva nada: si la persona no dice en qué
// anda, el latido sigue valiendo (está en turno) pero NO se pisa el foco
// anterior con una cadena vacía — perder «en el tótem de Gràcia» porque alguien
// pulsó «sigo aquí» sería destruir el único dato que hace útil el latido.
export function carbonBeat(body) {
  const b = body || {};
  const id = carbonId(b.id || b.name);
  if (!id) return { ok: false, code: "carbon_id_required", error: "el latido necesita id o nombre" };
  const focus = texto(b.focus, 200);
  return { ok: true, id, focus: focus || null };
}
