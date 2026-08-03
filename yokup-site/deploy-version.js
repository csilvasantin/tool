const FORMAT = /^v\.(\d{2})\.(\d{2})\.(\d{4})\.r(\d+)(?:\.(\d{2}):(\d{2}))?$/i;
const LEGACY_DATE_FIRST_FORMAT = /^v\.(\d{4})\.(\d{2})\.(\d{2})\.r(\d+)(?:\.(\d{2}):(\d{2}))?$/i;

function madridParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone:"Europe/Madrid", year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", hourCycle:"h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.map((item) => [item.type, item.value]));
}

export function madridDay(date) {
  const p = madridParts(date);
  return `${p.day}.${p.month}.${p.year}`;
}

export function madridTime(date) {
  const p = madridParts(date);
  return `${p.hour}:${p.minute}`;
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
  return `v.${day}.r${revision + 1}.${madridTime(date)}`;
}

export function versionFromPayload(value) {
  if (!value) return "";
  if (typeof value === "string") {
    try { return versionFromPayload(JSON.parse(value)); } catch (_) { return value.trim(); }
  }
  return String(value.version || "").trim();
}
