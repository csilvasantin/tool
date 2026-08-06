function clean(value, max = 80) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function sessionDisplayName(session) {
  const verifiedName = clean(session && session.name);
  if (verifiedName && !verifiedName.includes("@")) return verifiedName;
  const email = clean(session && session.email, 160).toLowerCase();
  if (!email.includes("@")) return "";
  const local = email.split("@")[0].replace(/[._+-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!local) return "";
  return local.split(" ").map((part) => part ? part[0].toUpperCase() + part.slice(1) : "").join(" ").slice(0, 80);
}

export function resolveIdeaAuthor({ session, explicitAuthor, trustedAgent = false, councilAuthor = "", councilSeat = "" } = {}) {
  if (session) {
    const canonicalCouncil = clean(councilAuthor, 60);
    if (canonicalCouncil) return {
      ok:true, author:canonicalCouncil, source:"council-preview",
      identity:"council:" + clean(councilSeat, 20).toLowerCase()
    };
    const author = sessionDisplayName(session).slice(0, 60);
    if (!author) return { ok:false, status:401, code:"session_identity_missing", error:"la sesión no contiene una identidad visible válida" };
    return { ok:true, author, source:"session", identity:clean(session.email, 160).toLowerCase() };
  }
  if (trustedAgent) {
    const author = clean(explicitAuthor, 60);
    if (!author) return { ok:false, status:400, code:"author_required", error:"author requerido para el cliente agente autenticado" };
    return { ok:true, author, source:"agent", identity:"agent:" + author.toLowerCase() };
  }
  return { ok:false, status:401, code:"identity_required", error:"sesión Yokup o credencial de agente requerida para crear objetivos" };
}
