/**
 * telegram.js — capa de Telegram Bot API para el Worker de Yokup.
 *
 * En un Cloudflare Worker NO hay long-polling: Telegram entrega las
 * actualizaciones por webhook (POST a /api/telegram/webhook). El alta del
 * webhook se hace una vez con `setWebhook` (ver docs/telegram-grok.md).
 *
 * Secrets (wrangler secret put):
 *   TELEGRAM_BOT_TOKEN     -> token del bot (de @BotFather)
 *   TELEGRAM_SECRET_TOKEN  -> token secreto que valida que el POST viene de Telegram
 * Vars (chat ids de los grupos; pueden ir como secret o en [vars]):
 *   TELEGRAM_CHAT_GROKCONTROL     -> grupo donde el bot avisa de intervenciones
 *   TELEGRAM_CHAT_GROKADMIRANEXT  -> grupo donde se dejan imágenes (visión)
 */

const api = (env, method) =>
  `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;

/** Llamada genérica a la Bot API. No lanza: devuelve {ok:false} si algo falla. */
export async function tgCall(env, method, payload) {
  if (!env.TELEGRAM_BOT_TOKEN) return { ok: false, error: "sin TELEGRAM_BOT_TOKEN" };
  try {
    const r = await fetch(api(env, method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

/** Envía un mensaje de texto (Markdown) a un chat. */
export function tgSend(env, chatId, text, opts = {}) {
  return tgCall(env, "sendMessage", {
    chat_id: chatId, text,
    parse_mode: opts.parse_mode || "Markdown",
    disable_web_page_preview: true,
    ...opts,
  });
}

/** Construye la URL pública de un fichero de Telegram a partir de su file_id. */
export async function tgFileUrl(env, fileId) {
  const f = await tgCall(env, "getFile", { file_id: fileId });
  if (!f.ok) return null;
  return `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${f.result.file_path}`;
}

/**
 * Verifica que el POST del webhook viene realmente de Telegram comparando la
 * cabecera secreta. Si no hay TELEGRAM_SECRET_TOKEN configurado, acepta (dev).
 */
export function verifyTelegram(env, request) {
  if (!env.TELEGRAM_SECRET_TOKEN) return true; // modo dev
  return request.headers.get("X-Telegram-Bot-Api-Secret-Token") === env.TELEGRAM_SECRET_TOKEN;
}
