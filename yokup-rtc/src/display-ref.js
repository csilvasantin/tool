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

/** Medianoche de Madrid del instante dado, en epoch ms — el corte con el que el
 *  marcador diario vuelve a cero. Se calcula con el desfase REAL de ese día y se
 *  recalcula una vez sobre el resultado, que es donde muerde el cambio de hora:
 *  la madrugada del salto, el desfase de las 12:00 y el de las 00:00 no son el
 *  mismo y el corte se iría una hora. */
export function madridDayStart(value) {
  const instante = epochMillis(value);
  const desfase = (ms) => {
    const p = madridParts(ms);
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute))
      - Math.floor(ms / 60000) * 60000;
  };
  const off = desfase(instante);
  const inicioLocal = Math.floor((instante + off) / 86400000) * 86400000;
  const candidato = inicioLocal - off;
  const off2 = desfase(candidato);
  return off2 === off ? candidato : inicioLocal - off2;
}

export function formatDisplayRef(sequence, value) {
  const part = madridParts(value);
  const number = String(Math.max(0, Math.floor(Number(sequence) || 0))).padStart(4, "0");
  return `${number}.${part.day}/${part.month}/${part.year}.${part.hour}:${part.minute}`;
}

/** N de la misión del día: el seq persistido (sin padding). FLT no se toca. */
export const MONTHS_ES = Object.freeze(["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]);

export function dailyN(sequence) {
  return Math.max(0, Math.floor(Number(sequence) || 0));
}

export function formatHistAlias(sequence, dayOrTs) {
  const n = dailyN(sequence);
  let day = "", mon = "", d = "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(dayOrTs || ""))) {
    const [y, m, dd] = String(dayOrTs).split("-");
    day = `${y}-${m}-${dd}`;
    mon = MONTHS_ES[Number(m) - 1] || m;
    d = String(Number(dd));
  } else {
    const part = madridParts(dayOrTs);
    day = `${part.year}-${part.month}-${part.day}`;
    mon = MONTHS_ES[Number(part.month) - 1] || part.month;
    d = String(Number(part.day));
  }
  return { n, day, label: `${d} ${mon} · #${n}` };
}

/** Rótulo humano de la misión del día. Interno = FLT. Fuera = Hoy #N o DD mon · #N. */
export function formatMissionDelDia(sequence, dayOrTs, now = Date.now()) {
  const hist = formatHistAlias(sequence, dayOrTs);
  const isToday = hist.day === madridDayKey(now);
  const hoy = `Hoy #${hist.n}`;
  return { n: hist.n, day: hist.day, hoy, hist: hist.label, isToday, label: isToday ? hoy : hist.label };
}

export function parseMissionDelDia(query, now = Date.now()) {
  const q = String(query || "").trim().replace(/\s+/g, " ");
  if (!q) return null;
  const flt = /^(FLT-\d+)$/i.exec(q);
  if (flt) return { kind: "flt", id: flt[1].replace(/^flt/i, "FLT") };
  const hoy = /^hoy\s*#?\s*(\d+)$/i.exec(q);
  if (hoy) return { kind: "hoy", n: Number(hoy[1]), day: madridDayKey(now) };
  const hist = /^(\d{1,2})\s*(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.?\s*[·.,]?\s*#?\s*(\d+)$/i.exec(q);
  if (hist) {
    const mon = MONTHS_ES.indexOf(hist[2].toLowerCase()) + 1;
    const year = madridParts(now).year;
    const day = `${year}-${String(mon).padStart(2, "0")}-${String(Number(hist[1])).padStart(2, "0")}`;
    return { kind: "hist", n: Number(hist[3]), day };
  }
  const legacy = /^(\d{1,4})\.(\d{2})\/(\d{2})\/(\d{4})\./.exec(q);
  if (legacy) {
    return { kind: "legacy", n: Number(legacy[1]), day: `${legacy[4]}-${legacy[3]}-${legacy[2]}` };
  }
  return null;
}

export const DISPLAY_REF_ENTITY_TYPES = Object.freeze(["objective", "window", "mission", "task"]);

export function sortDisplayRefCandidates(rows) {
  const rank = new Map(DISPLAY_REF_ENTITY_TYPES.map((type, index) => [type, index]));
  return (rows || []).map((row) => ({ ...row, entity_created_at:epochMillis(row.entity_created_at) }))
    .sort((a, b) => a.entity_created_at - b.entity_created_at
      || (rank.get(a.entity_type) ?? 99) - (rank.get(b.entity_type) ?? 99)
      || String(a.entity_key).localeCompare(String(b.entity_key)));
}
