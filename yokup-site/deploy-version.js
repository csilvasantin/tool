const FORMAT = /^v\.(\d{2})\.(\d{2})\.(\d{4})\.r(\d+)$/i;
const LEGACY_DATE_FIRST_FORMAT = /^v\.(\d{4})\.(\d{2})\.(\d{2})\.r(\d+)$/i;

export function madridDay(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone:"Europe/Madrid", year:"numeric", month:"2-digit", day:"2-digit"
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return `${p.day}.${p.month}.${p.year}`;
}

export function nextDeployVersion(date, candidates) {
  const day = madridDay(date);
  let revision = 0;
  for (const raw of candidates || []) {
    const value = String(raw || "").trim();
    const match = FORMAT.exec(value);
    if (match && `${match[1]}.${match[2]}.${match[3]}` === day) {
      revision = Math.max(revision, Number(match[4]) || 0);
      continue;
    }
    const legacy = LEGACY_DATE_FIRST_FORMAT.exec(value);
    if (legacy && `${legacy[3]}.${legacy[2]}.${legacy[1]}` === day) {
      revision = Math.max(revision, Number(legacy[4]) || 0);
    }
  }
  return `v.${day}.r${revision + 1}`;
}

export function versionFromPayload(value) {
  if (!value) return "";
  if (typeof value === "string") {
    try { return versionFromPayload(JSON.parse(value)); } catch (_) { return value.trim(); }
  }
  return String(value.version || "").trim();
}
