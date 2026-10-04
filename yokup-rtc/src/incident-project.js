// PROYECTO = ESTABLECIMIENTO (FLT-101292, Carlos 30-sep-2026: «todas las incidencias
// tienen que estar asociadas a un proyecto, el nombre del establecimiento»).
// Las incidencias de pantalla nacían sin project/project_id y /incidencias las pintaba
// como «Sin proyecto». Ahora cada una nace colgada del proyecto de su establecimiento:
//   · id   = slug del id de establecimiento del censo (`loc`, p. ej. «alsea-sbux-021»);
//            si no hay `loc`, slug del nombre (`locName`).
//   · name = nombre legible (`locName`, p. ej. «Starbucks Paseo de Gracia»).
// La tabla `projects` no tiene columna de tipo/categoría, así que la marca es una
// CONVENCIÓN documentada: blurb «Establecimiento · <loc>» y updated_by
// «yokup·establecimientos». El alta es directa e idempotente (ON CONFLICT) y NO pasa
// por upsertProject: no emite la novedad «proyecto nuevo» de la barra por cada
// tienda ni toca responsables/miembros. Si el id ya existe como proyecto «normal»
// (no creado por esta convención) se reutiliza tal cual y jamás se renombra.
// Sin loc ni locName no se inventa nada: la incidencia conserva el comportamiento
// previo (sin proyecto).
import { assignMissingProjectNumber } from "./project-number.js";

export const ESTABLISHMENT_BLURB_PREFIX = 'Establecimiento';
export const ESTABLISHMENT_UPDATED_BY = 'yokup·establecimientos';

// Mismo algoritmo que projectSlug() de src/index.js (copiado para que el módulo se
// pueda probar sin el worker); establishment-project.test.mjs vigila que no diverjan.
export function establishmentSlug(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

export function establishmentProjectRef(loc, locName) {
  const rawLoc = String(loc || '').trim(), rawName = String(locName || '').trim();
  const id = establishmentSlug(rawLoc || rawName);
  if (!id) return null;
  return {
    id,
    name: (rawName || rawLoc).slice(0, 80) || id,
    blurb: (ESTABLISHMENT_BLURB_PREFIX + ' · ' + (rawLoc || rawName)).slice(0, 240)
  };
}

export function isEstablishmentProject(project) {
  return !!project && String(project.blurb || '').startsWith(ESTABLISHMENT_BLURB_PREFIX + ' · ');
}

// Devuelve {id,name} del proyecto del establecimiento, creándolo si falta. Nunca
// lanza: un fallo de D1 aquí no puede impedir que nazca la incidencia.
export async function ensureEstablishmentProject(env, loc, locName, now = Date.now()) {
  const ref = establishmentProjectRef(loc, locName);
  if (!ref) return null;
  try {
    await env.DB.prepare(
      "INSERT INTO projects (id,name,blurb,web,status,color,created_at,updated_at,updated_by) VALUES (?,?,?,'','activo','',?,?,?) " +
      "ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at " +
      "WHERE projects.blurb LIKE '" + ESTABLISHMENT_BLURB_PREFIX + " · %' AND COALESCE(projects.name,'')!=excluded.name"
    ).bind(ref.id, ref.name, ref.blurb, now, now, ESTABLISHMENT_UPDATED_BY).run();
    try { await assignMissingProjectNumber(env, ref.id); } catch { /* el alta del establecimiento no depende del número */ }
    const row = await env.DB.prepare('SELECT id,name FROM projects WHERE id=?').bind(ref.id).first();
    return row ? { id: row.id, name: row.name || row.id } : { id: ref.id, name: ref.name };
  } catch (e) {
    return null;
  }
}
