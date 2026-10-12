// assistant-core.mjs — los sentidos y el criterio del Asistente de Admira (admira.app/assistant).
//
// Un móvil apuntando a una pantalla le da al asistente OJOS (cámara) y OREJAS (micro). Este módulo decide, sin DOM
// ni red, qué ve, qué oye, qué dice el propio player que está haciendo, si eso es una incidencia y qué orden se le
// manda para arreglarla. Todo lo que toca el navegador (cámara, micro, fetch) vive en assistant.mjs.
//
// Nada de lo que captan la cámara o el micro sale del móvil: aquí sólo entran números (brillo, cambio, decibelios).

// Umbrales de partida. Los de imagen son los del tester de admira.tv (tester/analysis.js), para que los dos digan
// lo mismo de la misma pantalla; los de sonido se ajustan en cada sitio con la calibración (ver calibraOido).
export const UMBRAL = Object.freeze({
  negro: 0.045,        // brillo medio (0-1) por debajo del cual la pantalla se da por apagada o en negro
  movimiento: 0.008,   // cambio medio entre dos muestras por debajo del cual la imagen «no se mueve»
  cambio: 0.03,        // cambio mínimo entre el antes y el después de una orden para decir «ha cambiado»
  silencioDb: -50,     // nivel (dBFS) por debajo del cual se da por silencio si no se ha calibrado
  margenDb: 6,         // lo que tiene que subir el sonido sobre el ambiente para poder distinguirlo
});

// ── Ojos ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Píxeles RGBA → grises Rec.709 (0-1) y brillo medio. */
export function luma(rgba) {
  const n = rgba.length >> 2, gray = new Float32Array(n);
  let suma = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const y = (0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2]) / 255;
    gray[i] = y; suma += y;
  }
  return { gray, brillo: n ? suma / n : 0 };
}

/** Cambio medio (0-1) entre dos imágenes en grises del mismo tamaño; null si no se pueden comparar. */
export function diferencia(a, b) {
  if (!a || !b || !a.length || a.length !== b.length) return null;
  let suma = 0;
  for (let i = 0; i < a.length; i++) suma += Math.abs(a[i] - b[i]);
  return suma / a.length;
}

/**
 * Vigilante de imagen. Se le da una muestra por segundo y dice si la pantalla lleva `aguante` segundos en negro o,
 * cuando el contenido debería moverse (un vídeo), congelada. Un hueco de muestras rompe la continuidad: no se
 * acusa a una pantalla de algo que no se ha estado mirando.
 */
export function creaOjos({ negro = UMBRAL.negro, movimiento = UMBRAL.movimiento, aguante = 15, hueco = 4 } = {}) {
  let prev = null, prevAt = null, negroDesde = null, quietoDesde = null;
  const reinicia = () => { prev = null; prevAt = null; negroDesde = null; quietoDesde = null; };
  return {
    reinicia,
    muestra({ gray, brillo, at, esperaMovimiento = false }) {
      if (prevAt != null && at - prevAt > hueco) reinicia();
      const cambio = diferencia(prev, gray);
      if (brillo < negro) { if (negroDesde == null) negroDesde = at; } else negroDesde = null;
      if (cambio != null) { if (cambio < movimiento) { if (quietoDesde == null) quietoDesde = prevAt; } else quietoDesde = null; }
      prev = gray; prevAt = at;
      const negroSeg = negroDesde == null ? 0 : at - negroDesde, quietoSeg = quietoDesde == null ? 0 : at - quietoDesde;
      let estado = cambio == null ? "sin-datos" : "viendo";
      if (negroDesde != null && negroSeg >= aguante) estado = "negro";
      else if (esperaMovimiento && quietoDesde != null && quietoSeg >= aguante) estado = "congelada";
      return { estado, brillo, cambio, negroSeg, quietoSeg };
    },
  };
}

// ── Orejas ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** Muestras de audio (-1..1) → nivel RMS en dBFS, acotado a -100. */
export function nivelDb(muestras) {
  if (!muestras || !muestras.length) return -100;
  let suma = 0;
  for (let i = 0; i < muestras.length; i++) suma += muestras[i] * muestras[i];
  const rms = Math.sqrt(suma / muestras.length);
  return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100;
}

/**
 * Calibración del oído. Un micro en una tienda oye ruido aunque el altavoz esté callado, así que un umbral fijo no
 * vale: se mide el ambiente con el player en silencio y otra vez con el audio puesto (el asistente lo silencia y lo
 * reanuda él mismo), y el umbral se pone a medio camino. Si el audio no sube `margen` dB sobre el ambiente, el móvil
 * no puede distinguirlo desde donde está: hay que acercarlo al altavoz, y se dice.
 */
export function calibraOido(ambienteDb, sonandoDb, margen = UMBRAL.margenDb) {
  const margenDb = sonandoDb - ambienteDb;
  if (!Number.isFinite(margenDb) || margenDb < margen) return { distingue: false, umbralDb: null, margenDb: Number.isFinite(margenDb) ? margenDb : 0 };
  return { distingue: true, umbralDb: ambienteDb + margenDb / 2, margenDb };
}

/** Vigilante de sonido: silencio sostenido durante `aguante` segundos (una pausa entre canciones no cuenta). */
export function creaOrejas({ umbralDb = UMBRAL.silencioDb, aguante = 12, hueco = 4 } = {}) {
  let umbral = umbralDb, prevAt = null, silencioDesde = null;
  const reinicia = () => { prevAt = null; silencioDesde = null; };
  return {
    reinicia,
    get umbralDb() { return umbral; },
    ajusta(db) { if (Number.isFinite(db)) umbral = db; reinicia(); },
    muestra({ db, at }) {
      if (prevAt != null && at - prevAt > hueco) reinicia();
      const primera = prevAt == null; prevAt = at;
      if (db < umbral) { if (silencioDesde == null) silencioDesde = at; } else silencioDesde = null;
      const silencioSeg = silencioDesde == null ? 0 : at - silencioDesde;
      const estado = silencioDesde != null && silencioSeg >= aguante ? "silencio" : primera ? "sin-datos" : "oyendo";
      return { estado, db, silencioSeg, umbralDb: umbral };
    },
  };
}

// ── Lo que el player dice de sí mismo ───────────────────────────────────────────────────────────────────────────
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const CON_SONIDO = new Set(["video", "audio", "music", "locucion", "animation"]);

/**
 * Junta la respuesta de /signage/now y la fila de /signage/screens en lo que al asistente le importa.
 * `enLinea`: el servidor lo dice, o el último latido tiene menos de 3 minutos (el criterio de mando.html).
 */
export function declarado(now, fila, ahoraMs = Date.now()) {
  const item = (now && now.item) || null, audio = (item && item.audio) || null;
  const visto = Math.max(num(now && now.lastSeen) || 0, num(fila && fila.last_seen) || 0, num(item && item.ts) || 0);
  const edadSeg = visto ? Math.max(0, Math.round((ahoraMs - visto) / 1000)) : null;
  const volumen = audio && num(audio.volume) != null ? Math.max(0, Math.min(100, num(audio.volume) <= 1 && num(audio.volume) > 0 ? num(audio.volume) * 100 : num(audio.volume))) : null;
  return {
    conocido: !!(now && now.ok !== false && (item || fila)),
    enLinea: !!(fila && fila.online === true) || (edadSeg != null && edadSeg < 180),
    edadSeg,
    standby: !!(now && now.standby),
    id: item && item.id != null ? String(item.id) : null,
    titulo: (item && item.title) || "",
    tipo: (item && item.type) || null,
    esVideo: !!item && (item.type === "video" || item.type === "animation"),
    conSonido: item ? CON_SONIDO.has(item.type) : null,
    silenciado: audio ? audio.muted === true : null,
    volumen,
    dichoEn: num(item && item.ts),   // cuándo publicó el player lo que declara (su reloj): sirve para saber si es de antes o de después de una orden
    atascos: now && now.health && num(now.health.stalls) != null ? num(now.health.stalls) : null,
  };
}

/** Rasgos del aparato que cambian lo que se le puede mandar. */
export function rasgos(fila) {
  const ua = String((fila && fila.user_agent) || ""), rol = String((fila && fila.role) || "");
  const virtual = !!fila && (fila.player_type === "virtual" || fila.hardware === false);
  return {
    virtual,
    tinta: rol === "eink",
    // Recargar la página deja muertas las apps Android de los Fold (hay que reabrirlas a mano) y a la tinta
    // electrónica no le dice nada: a esos no se les manda hardreload nunca.
    sinRecarga: rol === "eink" || /android/i.test(ua),
  };
}

// ── Diagnóstico ─────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Cruza lo que el player declara con lo que el móvil ve y oye. Devuelve las incidencias, la más grave primero.
 * Una pantalla en standby está apagada a propósito: se informa, pero no es una avería ni se «arregla» sola.
 */
export function diagnostica({ dec = null, ojos = null, orejas = null } = {}) {
  const lista = [];
  const standby = !!(dec && dec.standby);
  if (dec && dec.conocido && !dec.enLinea) {
    lista.push({ codigo: "sin-latido", grave: true, texto: "El player no da señales" + (dec.edadSeg != null ? " desde hace " + duracion(dec.edadSeg) : "") + ": no le llegan las órdenes." });
  }
  if (standby) lista.push({ codigo: "standby", grave: false, texto: "La pantalla está en standby (apagada a propósito desde el mando)." });
  if (ojos && !standby) {
    if (ojos.estado === "negro") lista.push({ codigo: "pantalla-negra", grave: true, texto: "La pantalla lleva " + duracion(ojos.negroSeg) + " en negro" + (dec && dec.titulo ? " y el player dice que emite «" + dec.titulo + "»" : "") + "." });
    else if (ojos.estado === "congelada") lista.push({ codigo: "pantalla-congelada", grave: true, texto: "La imagen lleva " + duracion(ojos.quietoSeg) + " sin moverse y debería ser un vídeo." });
  }
  if (orejas && !standby && orejas.estado === "silencio") {
    const causa = dec && (dec.silenciado === true || dec.volumen === 0);
    lista.push(causa
      ? { codigo: "audio-silenciado", grave: true, texto: "No se oye nada desde hace " + duracion(orejas.silencioSeg) + ": el player está " + (dec.silenciado ? "silenciado" : "con el volumen a cero") + "." }
      : { codigo: "audio-mudo", grave: true, texto: "No se oye nada desde hace " + duracion(orejas.silencioSeg) + (dec && dec.silenciado === false ? " y el player dice que tiene el audio puesto." : ".") });
  }
  return lista.sort((a, b) => Number(b.grave) - Number(a.grave));
}

export function duracion(seg) {
  const s = Math.max(0, Math.round(seg || 0));
  if (s < 90) return s + " s";
  if (s < 5400) return Math.round(s / 60) + " min";
  return (s / 3600).toFixed(1).replace(".", ",") + " h";
}

// ── Arreglos ────────────────────────────────────────────────────────────────────────────────────────────────────
// De la orden más suave a la más fuerte. Todas son del vocabulario de canal.html y ninguna cambia la programación:
// pasan de pieza, vuelven a poner el audio o recargan la página del player.
const ORDEN = Object.freeze({
  next: { cmd: "next", texto: "pasar a la pieza siguiente", espera: 20 },
  audioon: { cmd: "audioon", texto: "volver a poner el audio", espera: 15 },
  volumen: { cmd: "volume 50", texto: "subir el volumen al 50 %", espera: 15 },
  hardreload: { cmd: "hardreload", texto: "recargar el player", espera: 60 },
});
export const ESCALERA = Object.freeze({
  "pantalla-negra": ["next", "hardreload"],
  "pantalla-congelada": ["next", "hardreload"],
  "audio-silenciado": ["audioon", "volumen"],
  "audio-mudo": ["audioon", "next", "hardreload"],
});

/** El siguiente peldaño para esta incidencia, o null si ya no queda nada que probar (toca avisar a una persona). */
export function siguienteArreglo(codigo, probados = [], aparato = {}) {
  for (const clave of ESCALERA[codigo] || []) {
    const o = ORDEN[clave];
    if (probados.includes(o.cmd)) continue;
    if (clave === "hardreload" && aparato.sinRecarga) continue;
    return { ...o };
  }
  return null;
}

/**
 * La guardia: lleva la cuenta de una incidencia desde que aparece hasta que se arregla o se escala.
 * En cada tic recibe las incidencias de ese instante y devuelve qué hacer:
 *   {tipo:'nada'} · {tipo:'manda', cmd, texto, codigo} · {tipo:'comprobando'} ·
 *   {tipo:'resuelto', codigo, con, seg} · {tipo:'escala', codigo, probados, motivo}
 * No manda más de `maxHora` órdenes por hora ni repite una orden dentro de la misma incidencia, y tras cada orden
 * espera a ver el efecto antes de probar la siguiente. Sólo da algo por arreglado tras `estable` segundos limpios.
 */
export function creaGuardia({ estable = 8, maxHora = 6, aparato = {} } = {}) {
  let caso = null, limpioDesde = null;
  const mandadas = [];
  const actua = (at, autoreparar) => {
    const estaHora = mandadas.filter(t => at - t < 3600).length;
    const sig = autoreparar && estaHora < maxHora ? siguienteArreglo(caso.codigo, caso.probados, aparato) : null;
    if (!sig) {
      caso.escalada = true;
      return { tipo: "escala", codigo: caso.codigo, texto: caso.texto, probados: [...caso.probados], motivo: !autoreparar ? "manual" : estaHora >= maxHora ? "tope" : caso.probados.length ? "agotada" : "sin-arreglo" };
    }
    caso.probados.push(sig.cmd); caso.mandadaEn = at; caso.espera = sig.espera; mandadas.push(at);
    return { tipo: "manda", cmd: sig.cmd, texto: sig.texto, codigo: caso.codigo };
  };
  return {
    get caso() { return caso ? { ...caso, probados: [...caso.probados] } : null; },
    olvida() { caso = null; limpioDesde = null; },
    tic({ at, incidencias = [], autoreparar = true }) {
      const inc = incidencias.find(i => i.grave) || null;
      if (!caso) {
        if (!inc) return { tipo: "nada" };
        caso = { codigo: inc.codigo, texto: inc.texto, desde: at, probados: [], mandadaEn: null, espera: 0, escalada: false };
        limpioDesde = null;
        return actua(at, autoreparar);
      }
      if (!inc) {
        if (limpioDesde == null) limpioDesde = at;
        if (at - limpioDesde < estable) return { tipo: "comprobando" };
        const c = caso; caso = null; limpioDesde = null;
        return { tipo: "resuelto", codigo: c.codigo, con: c.probados.length ? c.probados[c.probados.length - 1] : null, seg: at - c.desde, escalada: c.escalada };
      }
      limpioDesde = null;
      caso.texto = inc.texto;
      if (inc.codigo !== caso.codigo && !caso.escalada) caso.codigo = inc.codigo;   // la avería ha cambiado de cara: otra escalera, mismo caso
      if (caso.escalada) return { tipo: "nada" };
      if (caso.mandadaEn != null && at - caso.mandadaEn < caso.espera) return { tipo: "comprobando" };
      return actua(at, autoreparar);
    },
  };
}

// ── Pruebas dirigidas ───────────────────────────────────────────────────────────────────────────────────────────
// Cada paso manda una orden y se comprueba por tres vías: el acuse del player, lo que el player declara después y lo
// que el móvil ve u oye. `vuelve` deshace el paso para dejar el aparato como estaba.
export const PASOS = Object.freeze([
  { id: "siguiente", cmd: "next", titulo: "Pasar a la pieza siguiente", espera: "cambia-pieza", sentido: "ojos" },
  { id: "silencio", cmd: "audiooff", titulo: "Quitar el audio", espera: "calla", sentido: "orejas" },
  { id: "sonido", cmd: "audioon", titulo: "Volver a poner el audio", espera: "suena", sentido: "orejas" },
  { id: "apagar", cmd: "standby", titulo: "Apagar la pantalla (standby)", espera: "negro", sentido: "ojos" },
  { id: "encender", cmd: "resume", titulo: "Encender la pantalla", espera: "imagen", sentido: "ojos" },
]);

/**
 * Juzga un paso. `antes` y `despues` llevan lo observado: {dec, gray, brillo, db}. Cada vía devuelve true (pasa),
 * false (falla) o null (no se pudo comprobar: sin cámara, sin micro o el player no lo declara).
 *
 * El player publica su estado al cambiar de pieza y, si no, en su latido (hasta un minuto). Si lo que declara es
 * todavía de antes de la orden, un «no» no significa nada: se queda en «sin dato» hasta que vuelva a publicar.
 */
export function juzgaPaso(paso, { acuse = null, antes = {}, despues = {}, umbralDb = UMBRAL.silencioDb } = {}) {
  const a = antes.dec || null, d = despues.dec || null;
  let dicho = null, real = null;
  const cambio = diferencia(antes.gray, despues.gray);
  switch (paso.espera) {
    case "cambia-pieza":
      dicho = a && d && a.id && d.id ? a.id !== d.id : null;
      real = cambio == null ? null : cambio >= UMBRAL.cambio;
      break;
    case "calla":
      dicho = d && d.silenciado != null ? d.silenciado === true || d.volumen === 0 : null;
      real = Number.isFinite(despues.db) ? despues.db < umbralDb : null;
      break;
    case "suena":
      dicho = d && d.silenciado != null ? d.silenciado === false && d.volumen !== 0 : null;
      real = Number.isFinite(despues.db) ? despues.db >= umbralDb : null;
      break;
    case "negro":
      dicho = d ? d.standby === true : null;
      real = Number.isFinite(despues.brillo) ? despues.brillo < UMBRAL.negro : null;
      break;
    case "imagen":
      dicho = d ? d.standby === false : null;
      real = Number.isFinite(despues.brillo) ? despues.brillo >= UMBRAL.negro : null;
      break;
  }
  const rancio = !!(a && d && a.dichoEn != null && d.dichoEn != null && d.dichoEn <= a.dichoEn);
  if (rancio && dicho === false) dicho = null;
  const vias = { acuse: acuse === "executed" ? true : acuse == null ? null : false, dicho, real };
  const valores = Object.values(vias);
  const veredicto = valores.includes(false) ? "falla" : valores.every(v => v === true) ? "pasa" : valores.some(v => v === true) ? "parcial" : "sin-comprobar";
  return { ...vias, veredicto, cambio, rancio };
}

/** Informe en texto del turno: lo que se copia o se comparte. No lleva imágenes ni sonido. */
export function informe({ aparato = "", desde = null, hasta = null, sucesos = [] } = {}) {
  const hora = ms => new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const cabecera = ["Asistente de Admira · " + (aparato || "sin aparato"),
    desde != null ? "Turno: " + new Date(desde).toLocaleDateString("es-ES") + " " + hora(desde) + (hasta != null ? " → " + hora(hasta) : "") : null].filter(Boolean);
  return cabecera.concat(sucesos.map(s => hora(s.at) + " · " + s.texto)).join("\n");
}
