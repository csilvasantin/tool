// ── IDEAS → DECISIÓN (piezas puras, testeables sin worker) ───────────────────
// Cuando en /objetivos·/ideas se pulsa «→ misión», el worker abre un reloj de
// decisión de 3 minutos con las 5 MEJORES opciones para EJECUTAR la idea (más
// «Volver atrás» de sexta). Estas funciones son el troceo puro de ese flujo: el
// parseo de lo que devuelva Workers AI, el resumen de la deliberación del Consejo
// que alimenta el prompt, y el armado de las 6 opciones de la ventana. Sin efectos
// secundarios: se prueban directas en ideas-decide.test.mjs.

// Normaliza lo que devuelva el modelo (objeto {opciones|options|...}, array, JSON
// embebido en texto, o líneas numeradas/con viñeta) a un array de hasta `n` opciones
// limpias. Nunca lanza: una entrada rara devuelve []. Corta a 150 caracteres.
export function parseDecideOptions(raw, n = 5) {
  let arr = null;
  if (Array.isArray(raw)) arr = raw;
  else if (raw && typeof raw === "object") arr = raw.opciones || raw.options || raw.opts || raw.lista || null;
  if (!arr) {
    const s = String(raw || "");
    const m = s.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (m) {
      try {
        const o = JSON.parse(m[0]);
        arr = Array.isArray(o) ? o : (o.opciones || o.options || o.opts || o.lista || null);
      } catch (e) {}
    }
    if (!arr) {
      const lines = s.split("\n").map((x) => x.trim()).filter(Boolean);
      const listed = lines.filter((x) => /^(?:\d+[.)]|[-*•])\s+/.test(x));
      arr = (listed.length ? listed : lines);
    }
  }
  const out = [];
  for (const it of (Array.isArray(arr) ? arr : [])) {
    let t = "";
    if (typeof it === "string") t = it;
    else if (it && typeof it === "object") t = String(it.text || it.opcion || it.titulo || it.title || it.t || "");
    t = String(t).trim().replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").replace(/^["']+|["']+$/g, "").trim().slice(0, 150);
    if (t) out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

// Resume la deliberación del Consejo (el `review` de la idea: string JSON u objeto
// {pros:[{text}],cons:[{text}]}) en un texto corto para el prompt. Sin review → "".
export function ideaDeliberationText(review) {
  let r = review;
  if (typeof r === "string") { try { r = JSON.parse(r); } catch (e) { return ""; } }
  if (!r || typeof r !== "object") return "";
  const pick = (a) => (Array.isArray(a) ? a.map((x) => (typeof x === "string" ? x : (x && x.text) || "")).filter(Boolean) : []);
  const pros = pick(r.pros), cons = pick(r.cons);
  const parts = [];
  if (pros.length) parts.push("A favor: " + pros.join("; "));
  if (cons.length) parts.push("En contra: " + cons.join("; "));
  return parts.join("\n").slice(0, 1200);
}

// Arma las opciones de la ventana de decisión: las 5 opciones de la idea (recortadas
// a 5, sin vacías) + «Volver atrás» de sexta terminal. Es lo que consume la
// maquinaria de relojes (isInitialMissionDecision exige EXACTAMENTE 6 con la salida
// al final). Devuelve el array; el llamador valida que haya 5 reales antes de abrir.
export function buildDecideDecisionOptions(options) {
  const five = (Array.isArray(options) ? options : [])
    .map((o) => String(o || "").trim()).filter(Boolean).slice(0, 5);
  return [...five, "Volver atrás"];
}
