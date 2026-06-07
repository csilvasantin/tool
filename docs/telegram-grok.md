# Integración Telegram + Grok

El bot de Yokup vive **dentro del Cloudflare Worker** (`api/`). Avisa al grupo
**GrokControl** de nuevas intervenciones, responde comandos y lenguaje natural
con **Grok** (xAI), y analiza fotos (grupo **GrokAdmiraNext**) con visión.

> ⚠️ En un Worker **no hay long-polling**: Telegram entrega las actualizaciones
> por **webhook**. Si en el otro equipo el bot corría con un script Node en
> bucle (`getUpdates`), aquí se sustituye por el webhook que monta este Worker.

```
Telegram ──webhook POST──▶ yokup-api /api/telegram/webhook ──▶ Supabase + Grok
Admira   ──webhook POST──▶ yokup-api /api/ingest/admira ──▶ aviso a GrokControl
```

## 1. Secrets y variables

```bash
cd api
npm run secret:tg-token     # TELEGRAM_BOT_TOKEN   (de @BotFather)
npm run secret:tg-secret    # TELEGRAM_SECRET_TOKEN (inventa una cadena larga)
npm run secret:xai          # XAI_API_KEY          (api.x.ai)
```

Chat ids de los grupos: en `wrangler.toml` → `[vars]`
(`TELEGRAM_CHAT_GROKCONTROL`, `TELEGRAM_CHAT_GROKADMIRANEXT`) o como secret.
Para obtener el id de un grupo: añade el bot al grupo, escribe un mensaje y
mira `chat.id` en `getUpdates`, o usa @RawDataBot. Los grupos suelen ser
negativos (`-100...`).

Modelo de Grok: `XAI_MODEL` (texto) y `XAI_VISION_MODEL` (imágenes) en `[vars]`.

## 2. Desplegar y registrar el webhook

```bash
npm run deploy   # imprime https://yokup-api.<sub>.workers.dev
```

Registra el webhook en Telegram (una sola vez) con el **mismo** secret:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://yokup-api.<sub>.workers.dev/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_SECRET_TOKEN>"
```

Comprobar: `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

## 3. Comandos del bot

| Comando | Qué hace |
|---|---|
| `/ayuda` | ayuda |
| `/pendientes` | intervenciones nuevas o publicadas |
| `/tecnicos` | técnicos dados de alta |
| `/intervencion <id>` | detalle de una intervención |
| texto libre | responde Grok con contexto de intervenciones recientes |
| foto | Grok (visión) describe la incidencia |

## 4. Degradado seguro

Todo es opcional: si falta `TELEGRAM_BOT_TOKEN`, `XAI_API_KEY` o el chat id, la
pieza correspondiente se salta **sin romper** la ingesta de Admira ni el resto
de la API. Así se puede desplegar por partes.

## Pendiente de confirmar con el otro equipo

- ¿El bot anterior era long-polling (Node) o ya webhook?
- Token del bot y chat ids reales de GrokControl / GrokAdmiraNext.
- Modelo exacto de Grok usado (texto y visión).
- Si las imágenes de GrokAdmiraNext se *analizan* (visión) o solo se archivan.
