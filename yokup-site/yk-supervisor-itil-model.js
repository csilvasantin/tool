export const CATEGORY = {pantalla:"Pantalla",tpv:"TPV",red:"Red",audio:"Audio",iot:"IoT / sensor",player:"Player",kiosk:"Kiosco",mobiliario:"Mobiliario",iluminacion:"Iluminación",otro:"Otro"};
export const STATUS = {operational:"Operativo",degraded:"Degradado",maintenance:"En mantenimiento",planned:"Planificado",retired:"Retirado",unknown:"Sin dato"};
export function attentionReasons(ci) {
  return [ci.open_incidents > 0 ? `${ci.open_incidents} incidencia${ci.open_incidents === 1 ? " abierta" : "s abiertas"}` : "",
    ci.maintenance_due ? "Mantenimiento pendiente" : "",
    ci.warranty === "expired" ? "Garantía vencida" : ci.warranty === "expiring" ? "Garantía próxima a vencer" : "",
    ["degraded","maintenance"].includes(ci.status) ? STATUS[ci.status] : ""].filter(Boolean);
}
export function filterInventory(cis, {search="",category="",attention=false}={}) {
  const normalized = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const query = normalized(search).trim();
  return cis.filter(ci => (!category || ci.category === category || category === "otro" && !Object.hasOwn(CATEGORY,ci.category))
    && (!attention || attentionReasons(ci).length > 0)
    && (!query || normalized([ci.code,ci.name,ci.position,ci.group,ci.parent].join(" ")).includes(query)));
}
export function observationFreshness(value, now=Date.now()) {
  const at = typeof value === "number" ? value : Date.parse(value);
  const age = now - at;
  if (!Number.isFinite(at) || at <= 0 || age < -30000) return {fresh:false,label:"Sin fecha verificable",age:null};
  if (age > 90000) return {fresh:false,label:"Observación caducada",age};
  return {fresh:true,label:"Observación reciente",age};
}
export function inventoryCsv(cis, scope) {
  const cell = v => '"' + (/^[\s]*[=+@-]/.test(String(v ?? "")) ? "'" : "") + String(v ?? "").replaceAll('"','""') + '"';
  const rows = [["Establecimiento","Código ITIL","Equipo","Categoría","Ubicación","Estado de ficha (no telemetría)","Garantía","Mantenimiento pendiente","Incidencias abiertas","Depende de","Origen de red","Consulta del inventario"]];
  for (const ci of cis) rows.push([scope.xpacio.id,ci.code,ci.name,CATEGORY[ci.category] || ci.category,[ci.group,ci.position].filter(Boolean).join(" · "),STATUS[ci.status] || "Sin dato",ci.warranty,ci.maintenance_due ? "Sí" : "No",ci.open_incidents,ci.parent,ci.network?.source || "Sin telemetría",scope.generated_at]);
  return "\uFEFF" + rows.map(row=>row.map(cell).join(";")).join("\r\n");
}

