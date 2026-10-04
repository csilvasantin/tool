// Proxy del cerebro que ya existe (brain.digitalavatar.ai). La clave xAI se queda
// en ese servidor. Aquí no hay una segunda IA: se le pasa la ficha de los cuatro
// pilares y, si no contesta, se responde con la ficha. El audio no se reenvía.
// FLT-101350. Preview: esta ruta es pública solo para la pregunta, no abre el sitio.

const BRAIN = 'https://brain.digitalavatar.ai/metahuman/ask';

const SHEET = {
  es: [
    'AdmiraNeXT tiene cuatro pilares, en este orden: Studio, Store, App y Yokup.',
    'Studio (pixeria.com; la cara Admira es admira.studio) es el estudio para crear contenido con IA. Su modo Experto es la consola del navegador: /help, /clear, /echo, /date, /status, /version, /history y /open (secciones home, audio, music, images, video, stock, assets, docs, radar).',
    'Store (xpaceos.com y admira.store) es el sistema operativo de la tienda Admira XP. El gemelo digital está en /admira-xp/. El modo Experto es la barra inferior. En cualquier página: /help, /limpiar, /gemelo y /marca (marca blanca; /marca off vuelve a Admira). Los verbos del gemelo (good, better, best, matrix, /distribuir, /inventario, /sincro) se ejecutan en /admira-xp/.',
    'App (admira.app y clearchannel.tv) es la cara de circuitos de publicidad exterior. Tiene su propia consola de experto en esa web.',
    'Yokup (yokup.com) es la bandeja de la flota: encargos, decisiones y normativa. No es el estudio ni la tienda.',
    'El avatar digital se invoca desde el modo Experto: /avatar good abre el calvo (cara 3D), /avatar better abre la chica (Ready Player Me, gafas) y /avatar best abre a Neo (MetaHuman; si el host de render está apagado, entra la chica). /avatar sin nivel dice el estado. /avatarON lo muestra y /avatarOFF lo oculta. Alias: /avatarDigital, /digitalAvatar, /cli ayudante, /cli helper. El estado se recuerda en este sitio, en el navegador. No hay claves en la página.',
  ],
  en: [
    'AdmiraNeXT has four pillars, in this order: Studio, Store, App and Yokup.',
    'Studio (pixeria.com; the Admira face is admira.studio) is the studio for creating content with AI. Its Expert mode is the browser console: /help, /clear, /echo, /date, /status, /version, /history and /open (sections home, audio, music, images, video, stock, assets, docs, radar).',
    'Store (xpaceos.com and admira.store) is the operating system of the Admira XP shop. The digital twin is at /admira-xp/. Expert mode is the bottom bar. On any page: /help, /limpiar, /gemelo and /marca (white label; /marca off returns to Admira). Twin verbs (good, better, best, matrix, /distribuir, /inventario, /sincro) run inside /admira-xp/.',
    'App (admira.app and clearchannel.tv) is the out-of-home advertising circuits face. It has its own expert console on that site.',
    'Yokup (yokup.com) is the fleet desk: tasks, decisions and rules. It is not the studio and it is not the shop.',
    'The digital avatar is invoked from Expert mode: /avatar good opens the bald 3D face, /avatar better opens the girl (Ready Player Me, glasses) and /avatar best opens Neo (MetaHuman; if the render host is off, the girl takes over). /avatar alone shows the status. /avatarON shows it and /avatarOFF hides it. Aliases: /avatarDigital, /digitalAvatar, /cli ayudante, /cli helper. The state is remembered on this site, in the browser. There are no keys in the page.',
  ],
};

const TOPICS = [
  {keys: ['studio', 'pixeria', 'admira.studio'], i: 1},
  {keys: ['store', 'xpace', 'admira.store', 'gemelo', 'twin'], i: 2},
  {keys: ['clearchannel', 'admira.app'], i: 3},
  {keys: ['yokup'], i: 4},
  {keys: ['avatar', 'ayudante', 'helper', 'avatardigital', 'digitalavatar', 'experto', 'expert'], i: 5},
];

export function sheetAnswer(question, lang) {
  const L = lang === 'en' ? 'en' : 'es';
  const q = String(question || '').toLowerCase();
  const hits = [];
  for (const topic of TOPICS) {
    if (topic.keys.some((k) => q.includes(k))) hits.push(SHEET[L][topic.i]);
  }
  if (/pilar|pillar|admiranext|cuatro|four/.test(q)) hits.unshift(SHEET[L][0]);
  if (hits.length) return [...new Set(hits)].join(' ');
  return L === 'en'
    ? 'That is not in the sheet. I can talk about Admira Studio (pixeria.com), Admira Store (xpaceos.com), admira.app and yokup.com.'
    : 'Eso no consta en la ficha. Puedo hablar de Admira Studio (pixeria.com), Admira Store (xpaceos.com), admira.app y yokup.com.';
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'},
  });
}

export async function onRequest(context, fetchImpl = fetch) {
  const request = context.request;
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: {'cache-control': 'no-store'}});
  if (request.method !== 'POST') return json({text: 'POST {question, lang}'}, 405);
  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }
  const question = String(body.question || '').trim().slice(0, 500);
  const lang = String(body.lang || 'es').toLowerCase().indexOf('en') === 0 ? 'en' : 'es';
  if (!question) return json({text: lang === 'en' ? 'Ask a question.' : 'Escribe una pregunta.'});
  const grounded = (lang === 'en'
    ? 'You are the AdmiraNeXT avatar. Answer in English, in 2 to 4 sentences. Use ONLY this sheet. If it is not in the sheet, say it is not in the sheet. Do not invent figures, prices or clients.\n\nSHEET:\n'
    : 'Eres el avatar de AdmiraNeXT. Responde en español, en 2 a 4 frases. Usa SOLO esta ficha. Si no consta, di que no consta en la ficha. No inventes cifras, precios ni clientes.\n\nFICHA:\n')
    + SHEET.es.join('\n') + '\n' + SHEET.en.join('\n') + '\n\nPREGUNTA:\n' + question;
  try {
    const r = await fetchImpl(BRAIN, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({question: grounded, lang, room: 'xtanco', persona: 'neo'}),
    });
    const data = await r.json().catch(() => ({}));
    const text = String((data && (data.text || data.answer)) || '').trim();
    const sheet = sheetAnswer(question, lang);
    const sheetMiss = /no consta en la ficha|not in the sheet/i.test(sheet);
    // El cerebro a veces dice «no consta» aunque la ficha sí trae el párrafo.
    // En ese caso manda la ficha: es el dato que sí tenemos.
    const brainMiss = /no consta|not in the sheet|isn['’]?t in the sheet|no est[aá] en la ficha/i.test(text);
    const ancla = /pixeria|xpaceos|yokup|clearchannel|admira\.app|admira\.studio|admira\.store/i.test(text);
    // Un saludo o un «isn't in the sheet» no cuentan: si la ficha tiene el dato, manda la ficha.
    if (r.ok && text && !(brainMiss && !sheetMiss) && (sheetMiss || ancla)) return json({text: text.slice(0, 1200)});
    return json({text: sheet});
  } catch (_) {}
  return json({text: sheetAnswer(question, lang)});
}
