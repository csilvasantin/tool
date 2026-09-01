const PROJECT_SHOT_HOSTS = new Set([
  "pixeria.com", "xpaceos.com", "yokup.com", "admira.live", "admira.tv",
  "admira.store", "clearchannel.tv", "admiranext.com", "ainimation.studio",
  "digitalavatar.ai", "digitalsignage.ai", "admira.academy", "carlossilva.info"
]);

export function normalizeProjectWeb(raw) {
  const value = String(raw == null ? "" : raw).trim();
  if (!value) return { ok: true, value: "" };
  if (/\p{Cc}/u.test(value)) return { ok: false, error: "web contiene caracteres de control" };
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : "https://" + value;
  let parsed;
  try { parsed = new URL(candidate); }
  catch { return { ok: false, error: "web no es una URL válida" }; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "web sólo admite http o https" };
  }
  if (!parsed.hostname) return { ok: false, error: "web requiere hostname" };
  if (parsed.username || parsed.password) return { ok: false, error: "web no admite credenciales" };
  return { ok: true, value: parsed.href.replace(/\/+$/, "") };
}

export function isProjectShotAllowed(raw) {
  const normalized = normalizeProjectWeb(raw);
  if (!normalized.ok || !normalized.value) return false;
  const hostname = new URL(normalized.value).hostname.toLowerCase();
  if (hostname === "playertaza.csilvasantin.workers.dev") return true;
  return PROJECT_SHOT_HOSTS.has(hostname.replace(/^www\./, ""));
}
