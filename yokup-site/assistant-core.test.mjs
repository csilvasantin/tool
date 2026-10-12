// Asistente de Admira (admira.app/assistant): ojos, orejas, diagnóstico y escalera de arreglos, sin navegador.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  UMBRAL, luma, diferencia, creaOjos, nivelDb, calibraOido, creaOrejas, declarado, rasgos, diagnostica,
  siguienteArreglo, creaGuardia, PASOS, juzgaPaso, informe, duracion,
} from "./assistant-core.mjs";

const gris = (v, n = 64) => Float32Array.from({ length: n }, () => v);
const ruido = (base, n = 64, k = 1) => Float32Array.from({ length: n }, (_, i) => base + (((i * 7 + k * 13) % 10) / 10) * 0.3);

test("luma y diferencia: brillo Rec.709 y cambio medio entre dos imágenes", () => {
  const { gray, brillo } = luma(Uint8ClampedArray.from([255, 255, 255, 255, 0, 0, 0, 255]));
  assert.deepEqual([...gray].map(v => +v.toFixed(3)), [1, 0]); assert.equal(+brillo.toFixed(6), 0.5);
  assert.equal(+luma(Uint8ClampedArray.from([0, 255, 0, 255])).brillo.toFixed(4), 0.7152);
  assert.equal(diferencia(gris(0.2), gris(0.5)).toFixed(3), "0.300");
  assert.equal(diferencia(gris(0.2), gris(0.2, 10)), null, "tamaños distintos no se comparan");
  assert.equal(diferencia(null, gris(0.2)), null);
});

test("ojos: negro sólo tras aguantar, y una imagen fija sólo es avería si debía ser un vídeo", () => {
  const ojos = creaOjos({ aguante: 5 });
  let r;
  for (let t = 0; t <= 4; t++) r = ojos.muestra({ gray: gris(0.01), brillo: 0.01, at: t });
  assert.equal(r.estado, "viendo", "4 s en negro todavía no es incidencia");
  r = ojos.muestra({ gray: gris(0.01), brillo: 0.01, at: 5 });
  assert.equal(r.estado, "negro"); assert.equal(r.negroSeg, 5);
  r = ojos.muestra({ gray: ruido(0.4), brillo: 0.5, at: 6 });
  assert.equal(r.estado, "viendo", "vuelve la imagen y se le quita la tacha al momento");

  const fija = creaOjos({ aguante: 5 });
  for (let t = 0; t <= 8; t++) r = fija.muestra({ gray: gris(0.5), brillo: 0.5, at: t, esperaMovimiento: false });
  assert.equal(r.estado, "viendo", "un cartel fijo no está congelado");
  for (let t = 9; t <= 12; t++) r = fija.muestra({ gray: gris(0.5), brillo: 0.5, at: t, esperaMovimiento: true });
  assert.equal(r.estado, "viendo", "el minuto que estuvo fijo el cartel no cuenta contra el vídeo que entra detrás");
  r = fija.muestra({ gray: gris(0.5), brillo: 0.5, at: 13, esperaMovimiento: true });
  assert.equal(r.estado, "congelada", "la misma imagen, si el player dice que es un vídeo y aguanta quieta, sí");
  const viva = creaOjos({ aguante: 5 });
  for (let t = 0; t <= 20; t++) r = viva.muestra({ gray: ruido(0.3, 64, t), brillo: 0.45, at: t, esperaMovimiento: true });
  assert.equal(r.estado, "viendo");
});

test("ojos: un hueco de muestras rompe la continuidad (no se acusa de lo que no se ha mirado)", () => {
  const ojos = creaOjos({ aguante: 5, hueco: 4 });
  let r;
  for (let t = 0; t <= 4; t++) r = ojos.muestra({ gray: gris(0.01), brillo: 0.01, at: t });
  r = ojos.muestra({ gray: gris(0.01), brillo: 0.01, at: 30 });
  assert.equal(r.estado, "sin-datos"); assert.equal(r.negroSeg, 0);
});

test("orejas: decibelios, silencio sostenido y calibración contra el ambiente", () => {
  assert.equal(nivelDb(Float32Array.from([1, -1, 1, -1])), 0);
  assert.equal(Math.round(nivelDb(Float32Array.from([0.1, -0.1]))), -20);
  assert.equal(nivelDb(new Float32Array(8)), -100); assert.equal(nivelDb(null), -100);

  assert.deepEqual(calibraOido(-48, -30), { distingue: true, umbralDb: -39, margenDb: 18 });
  assert.equal(calibraOido(-40, -37).distingue, false, "3 dB sobre el ambiente no se distinguen: hay que acercar el móvil");
  assert.equal(calibraOido(-40, NaN).distingue, false);

  const orejas = creaOrejas({ aguante: 10 });
  orejas.ajusta(-39);
  let r = orejas.muestra({ db: -30, at: 0 });
  assert.equal(r.estado, "sin-datos");
  for (let t = 1; t <= 9; t++) r = orejas.muestra({ db: -47, at: t });
  assert.equal(r.estado, "oyendo", "una pausa de 8 s entre canciones no es una avería");
  r = orejas.muestra({ db: -30, at: 10 }); assert.equal(r.silencioSeg, 0);
  for (let t = 11; t <= 21; t++) r = orejas.muestra({ db: -47, at: t });
  assert.equal(r.estado, "silencio"); assert.equal(r.silencioSeg, 10); assert.equal(r.umbralDb, -39);
});

const AHORA = 1_791_800_800_000;
const NOW = (extra = {}, item = {}) => ({ ok: true, standby: false, lastSeen: AHORA - 20_000, health: null,
  item: { id: "p1", type: "video", title: "Promo", ts: String(AHORA - 20_000), audio: { muted: false, volume: 80, level: 0, analyzed: false }, ...item }, ...extra });

test("declarado: lo que el player dice de sí mismo, con las formas reales de /signage/now y /signage/screens", () => {
  const d = declarado(NOW(), { screen: "x", online: true, last_seen: AHORA - 20_000 }, AHORA);
  assert.deepEqual({ ...d }, { conocido: true, enLinea: true, edadSeg: 20, standby: false, id: "p1", titulo: "Promo", tipo: "video", esVideo: true, conSonido: true, silenciado: false, volumen: 80, empezoEn: null, dichoEn: AHORA - 20_000, atascos: null });
  assert.equal(declarado(NOW({}, { audio: { muted: true, volume: 47 } }), null, AHORA).silenciado, true);
  assert.equal(declarado(NOW({}, { audio: { muted: false, volume: 0.5 } }), null, AHORA).volumen, 50, "volumen 0-1 también vale");
  assert.equal(declarado(NOW({}, { type: "image" }), null, AHORA).esVideo, false);
  const viejo = declarado(NOW({ lastSeen: AHORA - 600_000 }, { ts: String(AHORA - 600_000) }), { online: false, last_seen: AHORA - 600_000 }, AHORA);
  assert.equal(viejo.enLinea, false); assert.equal(viejo.edadSeg, 600);
  assert.equal(declarado(null, null, AHORA).conocido, false);
  assert.equal(declarado(NOW({ health: { stalls: 3 } }), null, AHORA).atascos, 3);
});

test("rasgos: a la tinta electrónica y a los Android no se les manda recargar", () => {
  assert.deepEqual(rasgos({ role: "eink", user_agent: "AdmiraEinkBridge/1.0" }), { virtual: false, tinta: true, sinRecarga: true });
  assert.equal(rasgos({ role: "canal", user_agent: "Mozilla/5.0 (Linux; Android 14; SM-F946B) AdmiraPlayer" }).sinRecarga, true);
  assert.deepEqual(rasgos({ role: "canal", user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) AdmiraPlayer" }), { virtual: false, tinta: false, sinRecarga: false });
  assert.equal(rasgos({ player_type: "virtual", hardware: false }).virtual, true);
});

test("diagnóstico: se cruza lo declarado con lo visto y lo oído", () => {
  const dec = declarado(NOW(), { online: true }, AHORA);
  assert.deepEqual(diagnostica({ dec, ojos: { estado: "viendo" }, orejas: { estado: "oyendo" } }), []);
  const negra = diagnostica({ dec, ojos: { estado: "negro", negroSeg: 40 } });
  assert.equal(negra[0].codigo, "pantalla-negra"); assert.match(negra[0].texto, /40 s en negro y el player dice que emite «Promo»/);
  assert.equal(diagnostica({ dec, ojos: { estado: "congelada", quietoSeg: 95 } })[0].texto, "La imagen lleva 2 min sin moverse y debería ser un vídeo.");
  const calla = diagnostica({ dec, orejas: { estado: "silencio", silencioSeg: 90 } })[0];
  assert.deepEqual([calla.codigo, calla.grave], ["audio-mudo", true]); assert.match(calla.texto, /emite «Promo» con el audio puesto/);
  // Silenciado desde el mando no es una avería (como el standby): se dice, pero no es grave y no se le manda nada.
  const mudo = declarado(NOW({}, { audio: { muted: true, volume: 80 } }), { online: true }, AHORA);
  const sil = diagnostica({ dec: mudo, orejas: { estado: "silencio", silencioSeg: 90 } })[0];
  assert.deepEqual([sil.codigo, sil.grave], ["audio-silenciado", false]); assert.match(sil.texto, /el player está silenciado \(a propósito/);
  // Una imagen en antena, o un player que no declara su audio: no se puede afirmar que tenga que sonar nada.
  assert.deepEqual(diagnostica({ dec: declarado(NOW({}, { type: "image" }), { online: true }, AHORA), orejas: { estado: "silencio", silencioSeg: 900 } }), []);
  assert.deepEqual(diagnostica({ dec: declarado(NOW({}, { audio: null }), { online: true }, AHORA), orejas: { estado: "silencio", silencioSeg: 900 } }), []);
  // Sin saber qué dice el player no se acusa a nadie.
  assert.deepEqual(diagnostica({ dec: null, ojos: { estado: "negro", negroSeg: 99 }, orejas: { estado: "silencio", silencioSeg: 99 } }), []);
  assert.deepEqual(diagnostica({ dec: declarado(null, null, AHORA), ojos: { estado: "negro", negroSeg: 99 } }), []);
  assert.match(diagnostica({ dec: declarado(NOW({}, { audio: { muted: false, volume: 0 } }), { online: true }, AHORA), orejas: { estado: "silencio", silencioSeg: 30 } })[0].texto, /volumen a cero/);
});

test("diagnóstico: el standby no es una avería, y un player sin latido se dice aunque la pantalla se vea", () => {
  const enStandby = declarado(NOW({ standby: true }), { online: true }, AHORA);
  const r = diagnostica({ dec: enStandby, ojos: { estado: "negro", negroSeg: 300 }, orejas: { estado: "silencio", silencioSeg: 300 } });
  assert.deepEqual(r.map(i => [i.codigo, i.grave]), [["standby", false]], "negro y callado a propósito: ni se alarma ni se arregla");
  const caido = declarado(NOW({ lastSeen: AHORA - 900_000 }, { ts: String(AHORA - 900_000) }), { online: false, last_seen: AHORA - 900_000 }, AHORA);
  const s = diagnostica({ dec: caido, ojos: { estado: "viendo" } });
  assert.equal(s[0].codigo, "sin-latido"); assert.match(s[0].texto, /desde hace 15 min/);
});

test("escalera: de la orden más suave a la más fuerte, sin repetir y respetando el aparato", () => {
  assert.equal(siguienteArreglo("pantalla-negra", [], {}).cmd, "next");
  assert.equal(siguienteArreglo("pantalla-negra", ["next"], {}).cmd, "hardreload");
  assert.equal(siguienteArreglo("pantalla-negra", ["next", "hardreload"], {}), null);
  assert.equal(siguienteArreglo("pantalla-negra", ["next"], { sinRecarga: true }), null, "a un Android no se le recarga");
  assert.equal(siguienteArreglo("audio-mudo", [], {}).cmd, "audioon");
  assert.equal(siguienteArreglo("audio-mudo", ["audioon"], {}), null, "por un silencio no se pasa de pieza ni se recarga: muchas piezas no llevan sonido");
  assert.equal(siguienteArreglo("audio-silenciado", [], {}), null, "silenciado a propósito: no se toca");
  assert.equal(siguienteArreglo("sin-latido", [], {}), null, "sin latido no hay orden que valga");
  assert.equal(siguienteArreglo("standby", [], {}), null);
});

test("guardia: manda, espera a ver el efecto, da por arreglado sólo tras unos segundos limpios", () => {
  const g = creaGuardia({ estable: 8 });
  const negra = [{ codigo: "pantalla-negra", grave: true, texto: "negro" }];
  assert.deepEqual(g.tic({ at: 0, incidencias: [] }), { tipo: "nada" });
  assert.deepEqual(g.tic({ at: 10, incidencias: negra }), { tipo: "manda", cmd: "next", texto: "pasar a la pieza siguiente", codigo: "pantalla-negra" });
  assert.equal(g.tic({ at: 15, incidencias: negra }).tipo, "comprobando", "no encadena órdenes sin esperar");
  assert.equal(g.tic({ at: 18, incidencias: [] }).tipo, "comprobando");
  assert.equal(g.tic({ at: 22, incidencias: [] }).tipo, "comprobando", "4 s limpios no bastan");
  assert.deepEqual(g.tic({ at: 26, incidencias: [] }), { tipo: "resuelto", codigo: "pantalla-negra", con: "next", seg: 16, escalada: false });
  assert.equal(g.caso, null);
});

test("guardia: si el primer arreglo no basta sube un peldaño, y cuando se acaban avisa una sola vez", () => {
  const g = creaGuardia({});
  const negra = [{ codigo: "pantalla-negra", grave: true, texto: "negro" }];
  assert.equal(g.tic({ at: 0, incidencias: negra }).cmd, "next");
  assert.equal(g.tic({ at: 29, incidencias: negra }).tipo, "comprobando");
  assert.equal(g.tic({ at: 30, incidencias: negra }).cmd, "hardreload");
  assert.equal(g.tic({ at: 100, incidencias: negra }).tipo, "comprobando", "recargar tarda: se le da más de un minuto");
  const e = g.tic({ at: 105, incidencias: negra });
  assert.deepEqual(e, { tipo: "escala", codigo: "pantalla-negra", texto: "negro", probados: ["next", "hardreload"], motivo: "agotada" });
  assert.deepEqual(g.tic({ at: 200, incidencias: negra }), { tipo: "nada" }, "no repite el aviso ni vuelve a mandar");
  assert.equal(g.tic({ at: 300, incidencias: [] }).tipo, "comprobando");
  assert.equal(g.tic({ at: 334, incidencias: [] }).tipo, "comprobando", "34 s limpios todavía no: detectar una recaída tarda 20");
  assert.equal(g.tic({ at: 335, incidencias: [] }).escalada, true, "si luego se arregla sola, se anota que hubo que avisar");
});

test("guardia: una avería que vuelve sigue la escalera donde iba, no recibe la misma orden sin fin", () => {
  const g = creaGuardia({});
  const congelada = [{ codigo: "pantalla-congelada", grave: true, texto: "congelada" }];
  assert.equal(g.tic({ at: 0, incidencias: congelada }).cmd, "next");
  assert.equal(g.tic({ at: 5, incidencias: [] }).tipo, "comprobando");
  // El vídeo siguiente también se congela: tarda 20 s en detectarse, así que a los 25 s la avería vuelve a estar.
  assert.equal(g.tic({ at: 25, incidencias: congelada }).tipo, "comprobando", "no se había dado por arreglada: sigue el mismo caso");
  assert.equal(g.tic({ at: 30, incidencias: congelada }).cmd, "hardreload", "y se sube de peldaño");
  // Y si llegó a darse por arreglada pero recae en menos de un cuarto de hora, tampoco se empieza de cero.
  const h = creaGuardia({ estable: 5 });
  assert.equal(h.tic({ at: 0, incidencias: congelada }).cmd, "next");
  h.tic({ at: 2, incidencias: [] }); assert.equal(h.tic({ at: 8, incidencias: [] }).tipo, "resuelto");
  const r = h.tic({ at: 120, incidencias: congelada });
  assert.equal(r.cmd, "hardreload"); assert.equal(h.caso.recaida, true);
  h.tic({ at: 200, incidencias: [] }); h.tic({ at: 210, incidencias: [] });
  assert.equal(h.tic({ at: 400, incidencias: congelada }).motivo, "agotada", "tercera vez: ya no queda nada que probar, hay que ir");
  const lejos = creaGuardia({ estable: 5, memoria: 60 });
  lejos.tic({ at: 0, incidencias: congelada }); lejos.tic({ at: 2, incidencias: [] }); lejos.tic({ at: 8, incidencias: [] });
  assert.equal(lejos.tic({ at: 500, incidencias: congelada }).cmd, "next", "pasada la memoria es una avería nueva");
});

test("guardia: no ver no es ver que está bien — sin datos ni manda ni da nada por arreglado", () => {
  const g = creaGuardia({ estable: 5 });
  const negra = [{ codigo: "pantalla-negra", grave: true, texto: "negro" }];
  assert.deepEqual(g.tic({ at: 0, incidencias: negra, ciego: true }), { tipo: "ciego" }); assert.equal(g.caso, null, "a ciegas no se abre caso");
  assert.equal(g.tic({ at: 1, incidencias: negra }).cmd, "next");
  for (let t = 2; t <= 200; t += 2) assert.equal(g.tic({ at: t, incidencias: [], ciego: true }).tipo, "ciego");
  assert.notEqual(g.caso, null, "200 s sin ver no arreglan nada: el caso sigue abierto");
  assert.equal(g.tic({ at: 201, incidencias: [] }).tipo, "comprobando", "y los segundos limpios empiezan a contar al volver a ver");
  assert.equal(g.tic({ at: 206, incidencias: [] }).tipo, "resuelto");
});

test("guardia: sin permiso para reparar, sin arreglo posible o al llegar al tope por hora, escala en vez de mandar", () => {
  const negra = [{ codigo: "pantalla-negra", grave: true, texto: "negro" }];
  assert.equal(creaGuardia({}).tic({ at: 0, incidencias: negra, autoreparar: false }).motivo, "manual");
  assert.equal(creaGuardia({}).tic({ at: 0, incidencias: [{ codigo: "sin-latido", grave: true, texto: "caído" }] }).motivo, "sin-arreglo");
  assert.deepEqual(creaGuardia({}).tic({ at: 0, incidencias: [{ codigo: "standby", grave: false, texto: "standby" }] }), { tipo: "nada" }, "lo que no es grave no abre caso");
  const g = creaGuardia({ maxHora: 2, estable: 1 });
  let at = 0;
  for (let i = 0; i < 2; i++) {
    assert.equal(g.tic({ at, incidencias: negra }).tipo, "manda"); at += 5;
    g.tic({ at, incidencias: [] }); at += 2; assert.equal(g.tic({ at, incidencias: [] }).tipo, "resuelto"); at += 60;
  }
  assert.equal(g.tic({ at, incidencias: negra }).motivo, "tope", "la tercera en una hora ya no se toca: se avisa");
  const fold = creaGuardia({ aparato: { sinRecarga: true } });
  fold.tic({ at: 0, incidencias: negra });
  assert.equal(fold.tic({ at: 30, incidencias: negra }).motivo, "agotada");
});

test("pruebas dirigidas: cada paso se juzga por acuse, por lo declarado y por lo que ve u oye el móvil", () => {
  assert.deepEqual(PASOS.map(p => p.cmd), ["next", "audiooff", "audioon", "standby", "resume"]);
  const paso = id => PASOS.find(p => p.id === id);
  const d = (extra, item) => declarado(NOW(extra, item), { online: true }, AHORA);
  let v = juzgaPaso(paso("siguiente"), { acuse: "executed", antes: { dec: d(), gray: gris(0.2) }, despues: { dec: d({}, { id: "p2" }), gray: gris(0.6) } });
  assert.deepEqual({ acuse: v.acuse, dicho: v.dicho, real: v.real, veredicto: v.veredicto }, { acuse: true, dicho: true, real: true, veredicto: "pasa" });
  v = juzgaPaso(paso("siguiente"), { acuse: "executed", antes: { dec: d(), gray: gris(0.2) }, despues: { dec: d({}, { id: "p2" }), gray: gris(0.2) } });
  assert.equal(v.real, false); assert.equal(v.veredicto, "falla", "el player dice que cambió y la pantalla no: eso es lo que hay que cazar");
  v = juzgaPaso(paso("siguiente"), { acuse: "executed", antes: { dec: d() }, despues: { dec: d({}, { id: "p2" }) } });
  assert.equal(v.real, null); assert.equal(v.veredicto, "parcial", "sin cámara vale lo virtual, y se dice que es parcial");
  // Lista de una sola pieza: «siguiente» la reinicia. Misma pieza con arranque posterior = ha obedecido.
  v = juzgaPaso(paso("siguiente"), { acuse: "executed", antes: { dec: d({}, { startedAt: "1000", ts: "1000" }) }, despues: { dec: d({}, { startedAt: "5000", ts: "5000" }) } });
  assert.deepEqual([v.dicho, v.veredicto], [true, "parcial"]);
  v = juzgaPaso(paso("siguiente"), { acuse: "executed", antes: { dec: d({}, { startedAt: "1000", ts: "1000" }) }, despues: { dec: d({}, { startedAt: "1000", ts: "5000" }) } });
  assert.deepEqual([v.dicho, v.veredicto], [false, "falla"], "ha vuelto a publicar y sigue en la misma pieza sin reiniciarla: no ha obedecido");
  v = juzgaPaso(paso("silencio"), { acuse: "executed", despues: { dec: d({}, { audio: { muted: true, volume: 80 } }), db: -48 }, umbralDb: -39 });
  assert.equal(v.veredicto, "pasa");
  v = juzgaPaso(paso("sonido"), { acuse: "executed", despues: { dec: d(), db: -48 }, umbralDb: -39 });
  assert.deepEqual([v.dicho, v.real, v.veredicto], [true, false, "falla"], "dice que suena y no se oye");
  v = juzgaPaso(paso("apagar"), { acuse: "executed", despues: { dec: d({ standby: true }), brillo: 0.01 } });
  assert.equal(v.veredicto, "pasa");
  v = juzgaPaso(paso("encender"), { acuse: "failed", despues: { dec: d(), brillo: 0.4 } });
  assert.deepEqual([v.acuse, v.veredicto], [false, "falla"]);
  assert.equal(juzgaPaso(paso("encender"), {}).veredicto, "sin-comprobar");
  // El player declara su audio en el latido (hasta un minuto): si lo que dice es de antes de la orden, no es un «no».
  const mudoViejo = d({}, { ts: "1000", audio: { muted: true, volume: 80 } });
  v = juzgaPaso(paso("sonido"), { acuse: "executed", antes: { dec: mudoViejo }, despues: { dec: mudoViejo } });
  assert.deepEqual([v.dicho, v.rancio, v.veredicto], [null, true, "parcial"], "aún no ha vuelto a publicar: sin dato, no falla");
  v = juzgaPaso(paso("sonido"), { acuse: "executed", antes: { dec: mudoViejo }, despues: { dec: d({}, { ts: "2000", audio: { muted: true, volume: 80 } }) } });
  assert.deepEqual([v.dicho, v.rancio, v.veredicto], [false, false, "falla"], "ha vuelto a publicar y sigue silenciado: eso sí es un fallo");
});

test("informe y duraciones", () => {
  assert.deepEqual([5, 89, 90, 600, 5400].map(duracion), ["5 s", "89 s", "2 min", "10 min", "1,5 h"]);
  const t = informe({ aparato: "iphone17-mupi", sucesos: [{ at: AHORA, texto: "Pantalla en negro" }, { at: AHORA + 1000, texto: "Mando «next»" }] });
  assert.match(t, /^Asistente de Admira · iphone17-mupi\n\d\d:\d\d:\d\d · Pantalla en negro\n\d\d:\d\d:\d\d · Mando «next»$/);
});

test("la página: tras el acceso de la flota, con el marco de la casa y sin sacar imagen ni sonido del móvil", async () => {
  const html = await readFile(new URL("./assistant.html", import.meta.url), "utf8");
  const ui = await readFile(new URL("./assistant.mjs", import.meta.url), "utf8");
  assert.match(html, /<script src="\/acceso\.js\?v=[^"]+"><\/script>/, "manda órdenes a aparatos reales: sólo con sesión de la flota");
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(ui, /autoGainControl:\s*false/, "con ganancia automática el micro «oye» el silencio");
  assert.match(ui, /facingMode:\s*["']environment["']/);
  // lo único que sale del móvil son órdenes y lecturas de estado: ni un fotograma ni una muestra de audio
  const destinos = [...ui.matchAll(/https:\/\/[a-z0-9.-]+\/[a-z0-9/_-]*/gi)].map(m => m[0]).sort();
  assert.deepEqual([...new Set(destinos)], [
    "https://api.admira.store/locations/cmd", "https://api.admira.store/signage/now", "https://api.admira.store/signage/screens",
    "https://mcp-tv.admira.store/virtual-players"]);
  assert.doesNotMatch(ui, /toDataURL|toBlob|MediaRecorder|captureStream/, "no se graba ni se exporta nada de la cámara o el micro");
  assert.equal(UMBRAL.negro, 0.045);
});
