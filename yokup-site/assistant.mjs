// assistant.mjs — la parte del Asistente que toca el navegador: aparatos, cámara, micro, órdenes y pantalla.
// El criterio (qué es una incidencia y cómo se arregla) está en assistant-core.mjs, que se prueba sin navegador.
//
// Lo único que sale de este móvil son órdenes al player y lecturas de su estado. La imagen de la cámara y el sonido
// del micro se reducen aquí a tres números (brillo, movimiento, decibelios) y no se guardan ni se envían.
import {
  UMBRAL, luma, creaOjos, nivelDb, calibraOido, creaOrejas, declarado, rasgos, diagnostica, creaGuardia, PASOS, juzgaPaso, informe, duracion,
} from "./assistant-core.mjs";

const API = {
  pantallas: "https://api.admira.store/signage/screens",
  ahora: "https://api.admira.store/signage/now",
  orden: "https://api.admira.store/locations/cmd",
  virtuales: "https://mcp-tv.admira.store/virtual-players",
};
const $ = id => document.getElementById(id);
const pausa = ms => new Promise(ok => setTimeout(ok, ms));
const guarda = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
const lee = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const json = (url, opts) => fetch(url, { cache: "no-store", ...opts }).then(r => r.json());
function nodo(tag, clase, texto) { const e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; }

const S = {
  aparatos: [], aparato: null, now: null, dec: null, decAt: 0,
  stream: null, ctx: null, analizador: null, buf: null, dbs: [], db: null, frame: null,
  ojosOn: false, orejasOn: false, ojos: creaOjos(), orejas: creaOrejas(), guardia: creaGuardia(),
  vigilando: false, probando: false, calibrando: false, desde: null, sucesos: [], cerrojo: null, oculto: false,
  sim: null,   // ?simula=1 · sentidos fingidos para ensayar la vigilancia con un aparato virtual, sin cámara ni micro
};
const lienzo = document.createElement("canvas"); lienzo.width = 160; lienzo.height = 90;
const pincel = lienzo.getContext("2d", { willReadFrequently: true });

// ── Aparatos ────────────────────────────────────────────────────────────────────────────────────────────────────
const enLinea = a => !!a && (a.online === true || (a.age_seconds != null && a.age_seconds < 180) || (!!a.last_seen && Date.now() - a.last_seen < 180000));
const nombre = a => a.name || a.locName || a.screen;
async function cargaVirtuales() {
  const todos = []; let cursor = "";
  for (let i = 0; i < 5; i++) {
    const d = await json(API.virtuales + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""), { credentials: "omit" });
    if (!d || !d.ok || !Array.isArray(d.players)) break;
    todos.push(...d.players); cursor = d.cursor || ""; if (!cursor) break;
  }
  return todos;
}
async function cargaAparatos() {
  const [vivos, virtuales] = await Promise.all([json(API.pantallas).then(d => d.screens || []).catch(() => null), cargaVirtuales().catch(() => [])]);
  if (!vivos && !S.aparatos.length) { $("apLista").replaceChildren(nodo("div", "vacio", "No he podido leer los aparatos. Comprueba la conexión del móvil.")); return; }
  const porId = new Map();
  (vivos || []).forEach(s => { if (s && s.screen) porId.set(s.screen, { ...s }); });
  virtuales.forEach(v => { const id = v && (v.screen || v.id); if (!id) return; const vivo = porId.get(id) || {};
    porId.set(id, { ...v, ...vivo, screen: id, name: v.name || vivo.name, player_type: "virtual", hardware: false, online: vivo.online === true }); });
  S.aparatos = [...porId.values()].sort((a, b) => Number(enLinea(b)) - Number(enLinea(a)) || nombre(a).localeCompare(nombre(b)));
  if (S.aparato) { const f = porId.get(S.aparato.screen); if (f) S.aparato = f; pintaElegido(); }
  pintaLista();
  const vivosN = S.aparatos.filter(enLinea).length;
  $("apEstado").textContent = vivosN + " en línea · " + S.aparatos.length + " en total";
}
function pintaLista() {
  const q = ($("apQ").value || "").toLowerCase().trim();
  const lista = S.aparatos.filter(a => !q || [nombre(a), a.screen, a.locName, a.machine, a.circuit].join(" ").toLowerCase().includes(q));
  if (!lista.length) { $("apLista").replaceChildren(nodo("div", "vacio", S.aparatos.length ? "Ningún aparato coincide con «" + q + "»." : "Ningún aparato registrado.")); return; }
  $("apLista").replaceChildren(...lista.map(a => {
    const b = nodo("button", "ap" + (enLinea(a) ? " on" : "")); b.type = "button";
    const tx = nodo("span", "tx"); tx.append(nodo("div", "nm", nombre(a)), nodo("div", "mt", subtitulo(a)));
    b.append(nodo("span", "d"), tx); b.onclick = () => elige(a); return b;
  }));
}
function subtitulo(a) {
  const r = rasgos(a);
  return [r.virtual ? "virtual · navegador" : r.tinta ? "tinta electrónica" : "player", a.screen, enLinea(a) ? "en línea" : "sin señal"].join(" · ");
}
function elige(a) {
  S.aparato = a; guarda("asst_screen", a.screen);
  S.guardia = creaGuardia({ aparato: rasgos(a) }); S.ojos.reinicia(); S.orejas.reinicia();
  const u = Number(lee("asst_umbral_" + a.screen)); if (Number.isFinite(u) && u < 0) S.orejas.ajusta(u);
  S.now = null; S.dec = null; S.decAt = 0;
  anota("Aparato elegido: " + nombre(a) + " (" + a.screen + ").");
  pintaElegido(); pintaPasos(); leeDeclarado().then(pintaTodo); pintaTodo();
}
function pintaElegido() {
  const a = S.aparato, caja = $("apElegido");
  caja.hidden = !a; $("apBuscador").hidden = !!a;
  if (!a) return;
  const fila = nodo("div", "elegido ap" + (enLinea(a) ? " on" : ""));
  const tx = nodo("span", "tx"); tx.append(nodo("div", "nm", nombre(a)), nodo("div", "mt", subtitulo(a) + (S.dec && S.dec.titulo ? " · emite «" + S.dec.titulo + "»" : "")));
  const cambiar = nodo("button", "btn mini", "Cambiar"); cambiar.type = "button";
  cambiar.onclick = () => { if (S.vigilando) paraVigilancia(); S.aparato = null; pintaElegido(); pintaTodo(); $("apQ").focus(); };
  fila.append(nodo("span", "d"), tx, cambiar); caja.replaceChildren(fila);
}
async function leeDeclarado() {
  if (!S.aparato) return null;
  const id = S.aparato.screen; S.decAt = Date.now() / 1000;
  try { const now = await json(API.ahora + "?screen=" + encodeURIComponent(id) + "&_=" + Date.now()); if (S.aparato && S.aparato.screen === id) { S.now = now; S.dec = declarado(now, S.aparato, Date.now()); } }
  catch (_) { /* sin red en el móvil: se sigue con lo último que se supo */ }
  return S.dec;
}

// ── Órdenes ─────────────────────────────────────────────────────────────────────────────────────────────────────
// La cola es la del mando de admira.tv. El identificador de la cola es la PANTALLA, nunca el circuito: una orden
// en la cola del circuito la reciben todos sus players.
async function manda(cmd) {
  const id = S.aparato.screen;
  const r = await fetch(API.orden, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, screen: id, cmd }) });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || !d.ok || !d.action) throw new Error("la cola de órdenes no ha dado recibo");
  return d;
}
async function esperaAcuse(action, tope = 20000) {
  const id = S.aparato.screen, t0 = Date.now();
  while (Date.now() - t0 < tope) {
    await pausa(600);
    const a = await json(API.orden + "/ack?id=" + encodeURIComponent(id) + "&action=" + encodeURIComponent(action) + "&_=" + Date.now()).catch(() => null);
    const k = a && a.seen && a.ack;
    if (k && k.action === action && (k.status === "executed" || k.status === "failed")) return k.status;
  }
  return null;
}
/** Manda y espera el acuse: 'executed' | 'failed' | null (sin acuse a tiempo) | 'sin-cola' (ni siquiera se encoló). */
async function mandaYespera(cmd, tope) {
  let d; try { d = await manda(cmd); } catch (_) { return "sin-cola"; }
  return esperaAcuse(d.action, tope);
}
const acuseTxt = a => a === "executed" ? "el player la ha ejecutado" : a === "failed" ? "el player la ha rechazado" : a === "sin-cola" ? "no se ha podido encolar" : "sin acuse del player todavía";

// ── Sentidos ────────────────────────────────────────────────────────────────────────────────────────────────────
async function activaSentidos() {
  if (S.stream) { apagaSentidos(); pintaTodo(); return; }
  const ojos = $("chOjos").checked, orejas = $("chOrejas").checked;
  if (!ojos && !orejas) { $("seAyuda").textContent = "Marca al menos uno: ojos u orejas."; return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $("seAyuda").textContent = "Este navegador no deja usar la cámara ni el micro desde una página."; return; }
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({
      video: ojos ? { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } } : false,
      // Sin tratamiento de voz: la ganancia automática sube el volumen del silencio hasta que «se oye» algo.
      audio: orejas ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
    });
  } catch (e) {
    $("seAyuda").textContent = e && e.name === "NotAllowedError" ? "Has denegado el permiso. Actívalo en los ajustes del navegador para esta página y vuelve a pulsar."
      : "No he podido abrir la cámara o el micro (" + ((e && e.name) || "error") + ").";
    return;
  }
  if (ojos && S.stream.getVideoTracks().length) { const v = $("vid"); v.srcObject = new MediaStream(S.stream.getVideoTracks()); await v.play().catch(() => {}); S.ojosOn = true; S.ojos.reinicia(); }
  if (orejas && S.stream.getAudioTracks().length) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    S.ctx = new Ctx(); await S.ctx.resume().catch(() => {});
    S.analizador = S.ctx.createAnalyser(); S.analizador.fftSize = 2048; S.buf = new Float32Array(S.analizador.fftSize);
    S.ctx.createMediaStreamSource(new MediaStream(S.stream.getAudioTracks())).connect(S.analizador);
    S.orejasOn = true; S.orejas.reinicia(); S.dbs = [];
  }
  $("seAyuda").textContent = "Sentidos activos. Encuadra la pantalla dentro del marco y deja el móvil quieto.";
  anota("Sentidos activados: " + [S.ojosOn ? "ojos" : "", S.orejasOn ? "orejas" : ""].filter(Boolean).join(" y ") + ".");
  pintaTodo();
}
function apagaSentidos() {
  if (S.stream) S.stream.getTracks().forEach(t => t.stop());
  if (S.ctx) S.ctx.close().catch(() => {});
  $("vid").srcObject = null;
  Object.assign(S, { stream: null, ctx: null, analizador: null, buf: null, ojosOn: false, orejasOn: false, frame: null, db: null, dbs: [] });
}
/* Ensayo: una imagen que cambia cada segundo (o negro) y un nivel de sonido de sala (o silencio), sin sensores. */
function fingeFrame() {
  const gray = new Float32Array(160 * 90), semilla = Math.floor(Date.now() / 1000);
  if (!S.sim.negro) for (let i = 0; i < gray.length; i++) gray[i] = 0.25 + ((i * 31 + semilla * 97) % 100) / 200;
  return { gray, brillo: S.sim.negro ? 0.004 : 0.5 };
}
function miraFrame() {
  if (S.sim) return fingeFrame();
  const v = $("vid");
  if (!S.ojosOn || document.hidden || v.readyState < 2 || !v.videoWidth) return null;
  const w = v.videoWidth, h = v.videoHeight;
  pincel.drawImage(v, w * 0.1, h * 0.1, w * 0.8, h * 0.8, 0, 0, 160, 90);   // sólo lo que cae dentro del marco
  return luma(pincel.getImageData(0, 0, 160, 90).data);
}
function escucha() {   // cuatro veces por segundo; el nivel del segundo es el pico (una pausa de un instante no es silencio)
  if (S.sim) { S.db = S.sim.silencio ? -72 : -24; return; }
  if (!S.orejasOn || !S.analizador) return;
  S.analizador.getFloatTimeDomainData(S.buf);
  S.dbs.push(nivelDb(S.buf)); if (S.dbs.length > 4) S.dbs.shift();
  S.db = Math.max(...S.dbs);
}
async function mideDb(ms) {   // mediana del nivel durante un rato
  const m = []; const t0 = Date.now();
  while (Date.now() - t0 < ms) { await pausa(250); if (S.db != null) m.push(S.db); }
  m.sort((a, b) => a - b); return m.length ? m[Math.floor(m.length / 2)] : NaN;
}
async function calibra() {
  if (!S.aparato || !S.orejasOn || S.calibrando || S.probando) return;
  S.calibrando = true; $("bCalibra").disabled = true;
  const nota = t => { $("seCalNota").textContent = t; };
  try {
    await leeDeclarado(); const estabaMudo = !!(S.dec && S.dec.silenciado === true);
    nota("Silenciando el aparato para medir el ruido del sitio…");
    const a1 = await mandaYespera("audiooff"); await pausa(1500); const ambiente = await mideDb(4000);
    nota("Poniendo el audio para medir cómo suena…");
    const a2 = await mandaYespera("audioon"); await pausa(2500); const sonando = await mideDb(6000);
    const c = calibraOido(ambiente, sonando);
    if (c.distingue) {
      S.orejas.ajusta(c.umbralDb); guarda("asst_umbral_" + S.aparato.screen, String(c.umbralDb));
      nota("Calibrado: el sitio hace " + Math.round(ambiente) + " dB de ruido y el audio suena a " + Math.round(sonando) + " dB. Umbral de silencio: " + Math.round(c.umbralDb) + " dB.");
      anota("Oído calibrado: ambiente " + Math.round(ambiente) + " dB, sonando " + Math.round(sonando) + " dB.", "bien");
    } else {
      nota("No distingo el audio del ruido del sitio (sólo " + Math.round(c.margenDb) + " dB de diferencia" + (a1 !== "executed" || a2 !== "executed" ? "; el player no ha confirmado las órdenes de audio" : "") + "). Acerca el móvil al altavoz o sube el volumen y vuelve a calibrar.");
      anota("Calibración sin resultado: el audio no se distingue del ambiente.", "mal");
    }
    if (estabaMudo) await mandaYespera("audiooff");   // estaba silenciado antes de empezar: se deja como estaba
  } finally { S.calibrando = false; $("bCalibra").disabled = false; S.orejas.reinicia(); pintaTodo(); }
}
function mueveUmbral(d) { S.orejas.ajusta(S.orejas.umbralDb + d); if (S.aparato) guarda("asst_umbral_" + S.aparato.screen, String(S.orejas.umbralDb)); pintaTodo(); }

// ── Vigilancia ──────────────────────────────────────────────────────────────────────────────────────────────────
let visto = { ojos: null, orejas: null, incs: [] };
function tic() {
  const at = Date.now() / 1000;
  let ojos = null, orejas = null;
  if (S.ojosOn) { const f = miraFrame(); if (f) { S.frame = f; ojos = S.ojos.muestra({ gray: f.gray, brillo: f.brillo, at, esperaMovimiento: !!(S.dec && S.dec.esVideo) }); } }
  if (S.orejasOn && S.db != null) orejas = S.orejas.muestra({ db: S.db, at });
  visto = { ojos, orejas, incs: visto.incs };
  if (S.vigilando && !S.probando && !S.calibrando) vigila(at, ojos, orejas);
  pintaSentidos(); pintaSemaforo();
}
function vigila(at, ojos, orejas) {
  if (at - S.decAt > 5) leeDeclarado().then(pintaElegido);
  if (document.hidden && !S.sim) { if (!S.oculto) { S.oculto = true; anota("Vigilancia en pausa: la pantalla de este móvil está apagada o en otra app.", "orden"); } return; }
  if (S.oculto) { S.oculto = false; anota("Vigilancia reanudada."); }
  const incs = diagnostica({ dec: S.dec, ojos, orejas }); visto.incs = incs;
  const antes = S.guardia.caso;
  const paso = S.guardia.tic({ at, incidencias: incs, autoreparar: $("chReparar").checked });
  if (!antes && S.guardia.caso) anota("Incidencia: " + S.guardia.caso.texto, "mal");
  if (paso.tipo === "manda") {
    anota("Arreglo: " + paso.texto + " (orden «" + paso.cmd + "»).", "orden");
    mandaYespera(paso.cmd, paso.cmd === "hardreload" ? 8000 : 20000).then(a => anota("Orden «" + paso.cmd + "»: " + acuseTxt(a) + ".", a === "executed" ? "" : "orden"));
  } else if (paso.tipo === "escala") {
    anota("Hay que ir: " + paso.texto + (paso.probados.length ? " No se ha arreglado con " + paso.probados.map(c => "«" + c + "»").join(" ni ") + "." : "")
      + (paso.motivo === "manual" ? " (Reparar solo está apagado.)" : paso.motivo === "tope" ? " (Tope de órdenes por hora alcanzado.)" : paso.motivo === "sin-arreglo" ? " (Desde aquí no se puede arreglar.)" : ""), "mal");
    alarma();
  } else if (paso.tipo === "resuelto") {
    anota((paso.con ? "Arreglado con «" + paso.con + "»" : "Se ha recuperado solo") + " en " + duracion(paso.seg) + ".", "bien");
  }
}
async function empiezaVigilancia() {
  if (S.vigilando) { paraVigilancia(); return; }
  if (!S.aparato || !(S.ojosOn || S.orejasOn)) return;
  S.vigilando = true; S.desde = Date.now(); S.oculto = false; S.guardia.olvida(); S.ojos.reinicia(); S.orejas.reinicia();
  await leeDeclarado();
  anota("Empieza la vigilancia de " + nombre(S.aparato) + " con " + [S.ojosOn ? "ojos" : "", S.orejasOn ? "orejas" : ""].filter(Boolean).join(" y ") + ".");
  pideCerrojo(); pintaTodo();
}
function paraVigilancia() {
  S.vigilando = false; anota("Fin de la vigilancia" + (S.desde ? " tras " + duracion((Date.now() - S.desde) / 1000) : "") + ".");
  if (S.cerrojo) { S.cerrojo.release().catch(() => {}); S.cerrojo = null; }
  visto.incs = []; pintaTodo();
}
async function pideCerrojo() {   // que el móvil no apague la pantalla mientras vigila
  try { if (navigator.wakeLock && S.vigilando && !document.hidden) S.cerrojo = await navigator.wakeLock.request("screen"); } catch (_) {}
}
function alarma() {
  try { if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); } catch (_) {}
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext, ctx = S.ctx || new Ctx();
    [0, 0.35, 0.7].forEach(t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.value = 0.25;
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22); });
  } catch (_) {}
}

// ── Pruebas dirigidas ───────────────────────────────────────────────────────────────────────────────────────────
async function observa() {
  await leeDeclarado();
  const f = miraFrame();
  return { dec: S.dec, gray: f ? f.gray : undefined, brillo: f ? f.brillo : undefined, db: S.orejasOn && S.db != null ? S.db : undefined };
}
async function pruebaPaso(paso) {
  pintaVias(paso, null, "probando…");
  const antes = await observa();
  const ac = await mandaYespera(paso.cmd);
  let j = null;
  // Se le da ~12 s a que se vea u oiga y a que el player lo declare; en cuanto todo cuadra, se deja de esperar.
  // Si no hay sentido que lo confirme (aparato virtual, sin cámara o sin micro) y el player aún no ha vuelto a
  // publicar su estado, se espera a su latido: hasta un minuto y poco.
  const t0 = Date.now();
  for (let i = 0; ; i++) {
    await pausa(i ? 2000 : 3000);
    j = juzgaPaso(paso, { acuse: ac, antes, despues: await observa(), umbralDb: S.orejas.umbralDb });
    const seg = (Date.now() - t0) / 1000;
    if (j.dicho === true && j.real !== false) break;
    if (seg >= 11 && !(j.rancio && j.real == null && ac === "executed" && seg < 70)) break;
    if (seg >= 11) pintaVias(paso, null, "esperando a que el player lo declare (su latido tarda hasta un minuto)…");
  }
  pintaVias(paso, j);
  anota("Prueba «" + paso.titulo + "»: " + j.veredicto + " (acuse " + marca(j.acuse) + " · dice " + marca(j.dicho) + " · " + (paso.sentido === "ojos" ? "ve " : "oye ") + marca(j.real) + ").", j.veredicto === "falla" ? "mal" : j.veredicto === "pasa" ? "bien" : "");
  return j;
}
const marca = v => v === true ? "sí" : v === false ? "no" : "sin dato";
async function pruebaTodo() {
  if (!S.aparato || S.probando) return;
  S.probando = true; pintaTodo();
  await leeDeclarado();
  const estabaMudo = !!(S.dec && S.dec.silenciado === true), estabaStandby = !!(S.dec && S.dec.standby);
  let cuenta = { pasa: 0, falla: 0, parcial: 0, "sin-comprobar": 0 };
  try {
    if (estabaStandby) { anota("El aparato está en standby: se enciende para probar y se vuelve a apagar al terminar.", "orden"); await mandaYespera("resume"); await pausa(3000); }
    for (const paso of PASOS) { const j = await pruebaPaso(paso); cuenta[j.veredicto]++; }
  } finally {
    // Dejarlo como estaba, pase lo que pase en medio: pantalla encendida (o apagada si lo estaba) y audio como estaba.
    await mandaYespera(estabaStandby ? "standby" : "resume").catch(() => {});
    await mandaYespera(estabaMudo ? "audiooff" : "audioon").catch(() => {});
    S.probando = false; S.ojos.reinicia(); S.orejas.reinicia(); S.guardia.olvida();
    $("prEstado").textContent = cuenta.pasa + " pasan · " + cuenta.falla + " fallan" + (cuenta.parcial ? " · " + cuenta.parcial + " a medias" : "");
    anota("Pruebas terminadas: " + $("prEstado").textContent + ". Aparato devuelto a su estado.", cuenta.falla ? "mal" : "bien");
    pintaTodo();
  }
}
async function pruebaSuelta(paso) {
  if (!S.aparato || S.probando) return;
  S.probando = true; pintaTodo();
  try { await pruebaPaso(paso); } finally { S.probando = false; S.ojos.reinicia(); S.orejas.reinicia(); S.guardia.olvida(); pintaTodo(); }
}

// ── Pantalla ────────────────────────────────────────────────────────────────────────────────────────────────────
function anota(texto, clase = "") {
  S.sucesos.push({ at: Date.now(), texto, clase }); if (S.sucesos.length > 300) S.sucesos.shift();
  const li = nodo("li", clase); const t = nodo("time", "", new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  li.append(t, nodo("span", "", texto)); $("diario").prepend(li);
  while ($("diario").children.length > 80) $("diario").lastChild.remove();
}
const pct = v => Math.max(0, Math.min(100, v));
function pintaSentidos() {
  const o = visto.ojos, e = visto.orejas;
  if (S.ojosOn && S.frame) {
    $("mBrillo").style.width = pct(S.frame.brillo * 100) + "%"; $("tBrillo").textContent = Math.round(S.frame.brillo * 100) + " %";
    $("uBrillo").style.left = UMBRAL.negro * 100 + "%";
    const c = o && o.cambio != null ? o.cambio : 0;
    $("mCambio").style.width = pct(c * 400) + "%"; $("tCambio").textContent = (c * 100).toFixed(1).replace(".", ",") + " %";
    $("seRot").textContent = o && o.estado === "negro" ? "en negro desde hace " + duracion(o.negroSeg) : o && o.estado === "congelada" ? "sin moverse desde hace " + duracion(o.quietoSeg) : "viendo la pantalla";
  }
  if (S.orejasOn && S.db != null) {
    const aBarra = db => pct((db + 80) / 80 * 100);   // de -80 dB a 0 dB
    $("mDb").style.width = aBarra(S.db) + "%"; $("tDb").textContent = Math.round(S.db) + " dB";
    $("uDb").style.left = aBarra(S.orejas.umbralDb) + "%"; $("tUmbral").textContent = "umbral " + Math.round(S.orejas.umbralDb) + " dB";
    if (e && e.estado === "silencio") $("tDb").textContent += " · silencio";
  }
}
function pintaSemaforo() {
  const sem = $("semaforo"), caso = S.guardia.caso, leves = visto.incs.filter(i => !i.grave);
  let clase = "", tit = "Sin vigilar", det = !S.aparato ? "Elige un aparato." : !(S.ojosOn || S.orejasOn) ? "Activa los ojos o las orejas." : "Todo listo: pulsa «Empezar a vigilar».";
  if (S.vigilando) {
    if (S.probando || S.calibrando) { clase = "ojo"; tit = S.probando ? "Probando…" : "Calibrando el oído…"; det = "La vigilancia espera a que termine."; }
    else if (caso && caso.escalada) { clase = "mal"; tit = "Hay que ir"; det = caso.texto + (caso.probados.length ? " Probado sin éxito: " + caso.probados.join(", ") + "." : ""); }
    else if (caso) { clase = "ojo"; tit = "Arreglando…"; det = caso.texto + (caso.probados.length ? " Última orden: «" + caso.probados[caso.probados.length - 1] + "»." : ""); }
    else if (leves.length) { clase = "ojo"; tit = "En standby"; det = leves[0].texto; }
    else {
      clase = "bien"; tit = "Todo bien";
      det = [S.dec && S.dec.titulo ? "Emite «" + S.dec.titulo + "»" : "", S.ojosOn && S.frame ? "brillo " + Math.round(S.frame.brillo * 100) + " %" : "", S.orejasOn && S.db != null ? "sonido " + Math.round(S.db) + " dB" : ""].filter(Boolean).join(" · ") || "Vigilando.";
    }
    $("viTiempo").textContent = S.desde ? "vigilando " + duracion((Date.now() - S.desde) / 1000) : "";
  } else $("viTiempo").textContent = "";
  sem.className = "semaforo" + (clase ? " " + clase : ""); $("semTit").textContent = tit; $("semDet").textContent = det;
}
function pintaPasos() {
  $("pasos").replaceChildren(...PASOS.map(p => {
    const d = nodo("div", "paso"); d.id = "paso-" + p.id;
    const tx = nodo("div"); tx.append(nodo("div", "ti", p.titulo), nodo("div", "cm", "orden «" + p.cmd + "»"));
    const b = nodo("button", "btn mini", "Probar"); b.type = "button"; b.dataset.paso = p.id; b.onclick = () => pruebaSuelta(p);
    const v = nodo("div", "vias"); v.id = "vias-" + p.id;
    d.append(tx, b, v); return d;
  }));
}
function pintaVias(paso, j, espera) {
  const caja = $("vias-" + paso.id); if (!caja) return;
  if (!j) { caja.replaceChildren(nodo("span", "via", espera || "")); return; }
  const chip = (rotulo, v) => nodo("span", "via" + (v === true ? " si" : v === false ? " no" : ""), rotulo + " " + (v === true ? "✓" : v === false ? "✗" : "–"));
  const ver = nodo("span", "via ver" + (j.veredicto === "pasa" ? " si" : j.veredicto === "falla" ? " no" : ""), j.veredicto === "sin-comprobar" ? "sin comprobar" : j.veredicto);
  caja.replaceChildren(chip("acuse", j.acuse), chip("dice", j.dicho), chip(paso.sentido === "ojos" ? "se ve" : "se oye", j.real), ver);
}
function pintaTodo() {
  const hay = !!S.aparato, sentidos = S.ojosOn || S.orejasOn, ocupado = S.probando || S.calibrando;
  $("seVisor").hidden = !S.ojosOn; $("seOido").hidden = !S.orejasOn; $("visor").hidden = !!S.sim;
  $("chOjos").disabled = $("chOrejas").disabled = !!S.stream;
  $("seEstado").textContent = sentidos ? [S.ojosOn ? "ojos" : "", S.orejasOn ? "orejas" : ""].filter(Boolean).join(" + ") : "apagados";
  $("bSentidos").textContent = S.stream ? "Apagar los sentidos" : "Activar ojos y orejas"; $("bSentidos").className = "btn" + (S.stream ? "" : " solid");
  $("bSentidos").hidden = !!S.sim; $("seSim").hidden = !S.sim;
  $("bCalibra").disabled = !hay || !S.orejasOn || ocupado;
  $("bVigilar").disabled = !S.vigilando && (!hay || !sentidos);
  $("bVigilar").textContent = S.vigilando ? "Dejar de vigilar" : "Empezar a vigilar"; $("bVigilar").className = "btn" + (S.vigilando ? " alerta" : " solid");
  $("bProbarTodo").disabled = !hay || ocupado; $("bProbarTodo").textContent = S.probando ? "Probando…" : "Probar todo";
  document.querySelectorAll("#pasos button").forEach(b => { b.disabled = !hay || ocupado; });
  pintaSentidos(); pintaSemaforo();
}
async function comparte() {
  const texto = informe({ aparato: S.aparato ? nombre(S.aparato) + " (" + S.aparato.screen + ")" : "", desde: S.desde || (S.sucesos[0] && S.sucesos[0].at) || Date.now(), hasta: Date.now(), sucesos: S.sucesos });
  try { if (navigator.share) { await navigator.share({ title: "Informe del asistente", text: texto }); return; } } catch (_) { return; }
  try { await navigator.clipboard.writeText(texto); $("bInforme").textContent = "Copiado"; setTimeout(() => { $("bInforme").textContent = "Compartir informe"; }, 1500); } catch (_) {}
}

// ── Arranque ────────────────────────────────────────────────────────────────────────────────────────────────────
async function arranca() {
  try { if (window.YkAccess && window.YkAccess.ready) await window.YkAccess.ready; } catch (_) {}
  $("apQ").addEventListener("input", pintaLista);
  $("bSentidos").onclick = activaSentidos; $("bCalibra").onclick = calibra;
  $("bUmbMenos").onclick = () => mueveUmbral(-3); $("bUmbMas").onclick = () => mueveUmbral(3);
  $("bVigilar").onclick = empiezaVigilancia; $("bProbarTodo").onclick = pruebaTodo; $("bInforme").onclick = comparte;
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pideCerrojo(); });
  window.addEventListener("pagehide", apagaSentidos);
  if (new URLSearchParams(location.search).has("simula")) {
    S.sim = { negro: false, silencio: false }; S.ojosOn = S.orejasOn = true; S.orejas.ajusta(-45);
    $("simNegro").onchange = e => { S.sim.negro = e.target.checked; anota(S.sim.negro ? "Ensayo: finjo que la pantalla se queda en negro." : "Ensayo: la pantalla vuelve a verse.", "orden"); };
    $("simSilencio").onchange = e => { S.sim.silencio = e.target.checked; anota(S.sim.silencio ? "Ensayo: finjo que el audio deja de sonar." : "Ensayo: el audio vuelve a sonar.", "orden"); };
    $("seAyuda").textContent = "Modo ensayo: los ojos y las orejas son fingidos. Sirve para ver cómo reacciona el asistente con un aparato virtual; las órdenes que manda son de verdad.";
  }
  pintaPasos(); pintaTodo();
  await cargaAparatos();
  const pedido = new URLSearchParams(location.search).get("screen") || lee("asst_screen");
  const a = pedido && S.aparatos.find(x => x.screen === pedido); if (a) elige(a);
  setInterval(escucha, 250); setInterval(tic, 1000); setInterval(cargaAparatos, 30000);
}
arranca();
