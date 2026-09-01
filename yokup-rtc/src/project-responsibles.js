// FLT-1505 · actualizaciones CAS por campo. Cada sentencia modifica únicamente
// el responsable solicitado para que una pestaña de Carbono no pise Silicio (o
// viceversa). Las variantes comparten la misma atribución y guard de archivado.
export const PROJECT_SILICON_CAS_SQL =
  "UPDATE projects SET owner=?,updated_at=?,updated_by=? WHERE id=? AND COALESCE(owner,'')=? AND COALESCE(status,'activo')!='archivado'";

export const PROJECT_CARBON_CAS_SQL =
  "UPDATE projects SET carbon_responsible=?,updated_at=?,updated_by=? WHERE id=? AND COALESCE(carbon_responsible,'')=? AND COALESCE(status,'activo')!='archivado'";

export const PROJECT_BOTH_RESPONSIBLES_CAS_SQL =
  "UPDATE projects SET owner=?,carbon_responsible=?,updated_at=?,updated_by=? WHERE id=? AND COALESCE(owner,'')=? AND COALESCE(carbon_responsible,'')=? AND COALESCE(status,'activo')!='archivado'";

// El POST histórico puede crear un proyecto con responsables iniciales, pero en
// un conflicto sólo edita metadatos. Ni un body malicioso ni una carrera entre
// pestañas pueden reescribir el gobierno de un proyecto ya existente.
export const PROJECT_METADATA_UPSERT_SQL =
  "INSERT INTO projects (id,name,blurb,web,status,color,owner,carbon_responsible,created_at,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)" +
  " ON CONFLICT(id) DO UPDATE SET name=excluded.name, blurb=excluded.blurb, web=excluded.web, status=excluded.status, color=excluded.color, updated_at=excluded.updated_at, updated_by=excluded.updated_by";

export function projectCarbonResponsible(raw) {
  return String(raw == null ? "" : raw).trim().slice(0, 80);
}

export function validateProjectResponsibleTypes(body) {
  const value = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  for (const field of [
    "carbon_responsible", "expected_carbon_responsible",
    "silicon_responsible", "primary_responsible", "expected_silicon_responsible"
  ]) {
    if (Object.prototype.hasOwnProperty.call(value, field) && typeof value[field] !== "string") {
      return { ok: false, field };
    }
  }
  return { ok: true };
}
