/**
 * grok.js — cliente mínimo de la API de xAI (Grok).
 *
 * Grok es el "cerebro" del bot: tría/resume incidencias, clasifica prioridad
 * y responde en lenguaje natural a los comandos libres del grupo de Telegram.
 *
 * Secrets (wrangler secret put):
 *   XAI_API_KEY    -> clave de api.x.ai
 * Vars opcionales (wrangler.toml [vars] o secret):
 *   XAI_MODEL         -> modelo de texto   (default 'grok-4')
 *   XAI_VISION_MODEL  -> modelo con visión (default 'grok-2-vision-1212')
 *
 * La API de xAI es compatible con el formato chat/completions de OpenAI.
 */

const XAI_URL = "https://api.x.ai/v1/chat/completions";

/**
 * Llama a Grok con una lista de mensajes [{role, content}] y devuelve el texto.
 * `content` puede ser string o, para visión, un array de partes
 * [{type:'text',text}, {type:'image_url', image_url:{url}}].
 */
export async function askGrok(env, messages, opts = {}) {
  if (!env.XAI_API_KEY) {
    const e = new Error("XAI_API_KEY no configurada"); e.status = 503; throw e;
  }
  const model = opts.model
    || (opts.vision ? (env.XAI_VISION_MODEL || "grok-2-vision-1212")
                    : (env.XAI_MODEL || "grok-4"));

  const r = await fetch(XAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.max_tokens ?? 800,
    }),
  });
  const text = await r.text();
  if (!r.ok) { const e = new Error(`xai ${r.status}: ${text}`); e.status = r.status; throw e; }
  const data = JSON.parse(text);
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

/**
 * Triaje de una intervención recién creada: resumen de una línea + prioridad
 * sugerida. Devuelve {summary, priority} y nunca lanza (degrada a null) para no
 * romper la ingesta del webhook de Admira si Grok falla o no está configurado.
 */
export async function triageIntervention(env, iv) {
  if (!env.XAI_API_KEY) return null;
  try {
    const out = await askGrok(env, [
      { role: "system", content:
        "Eres el operador técnico de Yokup (intervenciones sobre equipos de puntos de venta). " +
        "Resume la incidencia en una sola frase clara para un técnico y propón una prioridad. " +
        "Responde SOLO JSON: {\"summary\":\"...\",\"priority\":\"baja|media|alta|critica\"}." },
      { role: "user", content: JSON.stringify({
        title: iv.title, description: iv.description,
        type: iv.type, store_id: iv.store_id, priority: iv.priority }) },
    ], { max_tokens: 200 });
    const m = out.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null; // degradar en silencio
  }
}
