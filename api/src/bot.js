/**
 * bot.js — manejo de actualizaciones de Telegram (comandos + lenguaje natural).
 *
 * Grok es el cerebro: los comandos con "/" consultan/actúan sobre Supabase de
 * forma determinista; el texto libre se delega a Grok con contexto de las
 * intervenciones recientes. Las imágenes (grupo GrokAdmiraNext) se analizan con
 * el modelo de visión de Grok.
 *
 * `handleUpdate(env, update, { sb })` recibe el cliente Supabase ya construido
 * en index.js para no duplicarlo ni crear imports circulares.
 */

import { tgSend, tgFileUrl } from "./telegram.js";
import { askGrok } from "./grok.js";

const enc = encodeURIComponent;

export async function handleUpdate(env, update, { sb }) {
  const msg = update.message || update.edited_message;
  if (!msg) return; // ignoramos otros tipos (callback_query, etc.) por ahora
  const chatId = msg.chat.id;

  // --- Imágenes: análisis con visión (p.ej. fotos en GrokAdmiraNext) --------
  if (msg.photo && msg.photo.length) {
    return handlePhoto(env, msg, chatId);
  }

  const text = (msg.text || "").trim();
  if (!text) return;

  // --- Comandos deterministas ----------------------------------------------
  if (text.startsWith("/")) {
    const [cmd, ...rest] = text.split(/\s+/);
    const arg = rest.join(" ").trim();
    switch (cmd.replace(/@.*$/, "").toLowerCase()) {
      case "/start":
      case "/ayuda":
      case "/help":
        return tgSend(env, chatId, HELP);
      case "/pendientes":
        return cmdPendientes(env, chatId, sb);
      case "/tecnicos":
        return cmdTecnicos(env, chatId, sb);
      case "/intervencion":
        return cmdIntervencion(env, chatId, sb, arg);
      default:
        return tgSend(env, chatId, "No conozco ese comando. Prueba /ayuda.");
    }
  }

  // --- Texto libre: Grok con contexto de intervenciones recientes -----------
  return askGrokFreeform(env, chatId, sb, text);
}

const HELP = [
  "*Yokup bot* 🤖",
  "",
  "/pendientes — intervenciones nuevas o publicadas",
  "/tecnicos — técnicos dados de alta",
  "/intervencion `<id>` — detalle de una intervención",
  "",
  "También puedes escribirme en lenguaje natural y te responde Grok.",
].join("\n");

async function cmdPendientes(env, chatId, sb) {
  const rows = await sb(env, "GET",
    "intervention?status=in.(nueva,publicada)&order=created_at.desc&limit=10");
  if (!rows.length) return tgSend(env, chatId, "No hay intervenciones pendientes. ✅");
  const lines = rows.map(iv =>
    `• [${iv.priority}] *${iv.title}* — ${iv.status}\n  \`${iv.id}\``);
  return tgSend(env, chatId, `*Pendientes (${rows.length})*\n\n${lines.join("\n")}`);
}

async function cmdTecnicos(env, chatId, sb) {
  const rows = await sb(env, "GET", "technician?order=rating_avg.desc&limit=15");
  if (!rows.length) return tgSend(env, chatId, "No hay técnicos dados de alta todavía.");
  const lines = rows.map(t =>
    `• *${t.name}* (${t.kind}) — ${t.status} · ⭐ ${t.rating_avg ?? 0} (${t.rating_n ?? 0})`);
  return tgSend(env, chatId, `*Técnicos (${rows.length})*\n\n${lines.join("\n")}`);
}

async function cmdIntervencion(env, chatId, sb, id) {
  if (!id) return tgSend(env, chatId, "Uso: /intervencion `<id>`");
  const rows = await sb(env, "GET", `intervention?id=eq.${enc(id)}`);
  const iv = rows[0];
  if (!iv) return tgSend(env, chatId, "No encuentro esa intervención.");
  return tgSend(env, chatId, [
    `*${iv.title}*`,
    `Estado: ${iv.status} · Prioridad: ${iv.priority} · Tipo: ${iv.type}`,
    `Punto: ${iv.store_id}`,
    iv.description ? `\n${iv.description}` : "",
    `\n\`${iv.id}\``,
  ].filter(Boolean).join("\n"));
}

async function askGrokFreeform(env, chatId, sb, text) {
  let context = [];
  try {
    context = await sb(env, "GET",
      "intervention?order=created_at.desc&limit=15&select=id,title,status,priority,type,store_id");
  } catch { /* sin contexto si Supabase falla */ }
  try {
    const reply = await askGrok(env, [
      { role: "system", content:
        "Eres el asistente operativo de Yokup, marketplace de intervenciones técnicas " +
        "sobre equipos de puntos de venta. Responde breve y en español. Usa el contexto " +
        "de intervenciones recientes si es relevante; si no sabes algo, dilo." },
      { role: "user", content:
        `Intervenciones recientes:\n${JSON.stringify(context)}\n\nPregunta: ${text}` },
    ]);
    return tgSend(env, chatId, reply || "No tengo respuesta para eso.");
  } catch (e) {
    return tgSend(env, chatId, `No pude consultar a Grok (${e.message}).`);
  }
}

async function handlePhoto(env, msg, chatId) {
  // Telegram manda varias resoluciones; cogemos la mayor (última).
  const fileId = msg.photo[msg.photo.length - 1].file_id;
  const url = await tgFileUrl(env, fileId);
  if (!url) return tgSend(env, chatId, "No pude leer la imagen.");
  const caption = msg.caption || "Describe la incidencia técnica que se ve en la imagen.";
  try {
    const reply = await askGrok(env, [
      { role: "system", content:
        "Eres un técnico de Yokup. Analiza la foto del equipo del punto de venta y " +
        "describe la incidencia, su gravedad y una acción recomendada. Breve, en español." },
      { role: "user", content: [
        { type: "text", text: caption },
        { type: "image_url", image_url: { url } },
      ] },
    ], { vision: true });
    return tgSend(env, chatId, reply || "No pude analizar la imagen.");
  } catch (e) {
    return tgSend(env, chatId, `No pude analizar la imagen (${e.message}).`);
  }
}
