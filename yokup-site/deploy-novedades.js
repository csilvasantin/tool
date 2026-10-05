// Novedades del sello (Merovingio, 06-10-2026 · sello con novedades en toda la suite).
// novedades.json[sello] o .default → version.json.novedades[] (2-4 líneas en español). Las pinta
// al pasar el ratón el cargador compartido https://www.admiranext.com/assets/sello-novedades.js
export function novedadesFor(raw, version) {
  let data = raw;
  if (typeof raw === "string") {
    try { data = JSON.parse(raw); } catch (_) { return []; }
  }
  let list = [];
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === "object") list = data[version] ?? data.default ?? data.novedades ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 4);
}
