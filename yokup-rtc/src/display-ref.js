const MADRID = "Europe/Madrid";

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: MADRID,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function epochMillis(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return Date.now();
  return number < 4_102_444_800 ? Math.floor(number * 1000) : Math.floor(number);
}

export function madridParts(value) {
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(epochMillis(value)))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

export function madridDayKey(value) {
  const part = madridParts(value);
  return `${part.year}-${part.month}-${part.day}`;
}

export function formatDisplayRef(sequence, value) {
  const part = madridParts(value);
  const number = String(Math.max(0, Math.floor(Number(sequence) || 0))).padStart(4, "0");
  return `${number}.${part.day}/${part.month}/${part.year}.${part.hour}:${part.minute}`;
}

export const DISPLAY_REF_ENTITY_TYPES = Object.freeze(["objective", "window", "mission", "task"]);

export function sortDisplayRefCandidates(rows) {
  const rank = new Map(DISPLAY_REF_ENTITY_TYPES.map((type, index) => [type, index]));
  return (rows || []).map((row) => ({ ...row, entity_created_at:epochMillis(row.entity_created_at) }))
    .sort((a, b) => a.entity_created_at - b.entity_created_at
      || (rank.get(a.entity_type) ?? 99) - (rank.get(b.entity_type) ?? 99)
      || String(a.entity_key).localeCompare(String(b.entity_key)));
}
