import { baseAgentIdentity, machineIdentityKey } from "./agent-identity.js";

const ACTIVE_STATES = new Set(["open", "pending", "unassigned", "in_progress", "unconcluded"]);

export function duplicateTextKey(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function duplicateStateClass(row) {
  const state = String(row && (row.visible_state || row.status) || "").toLowerCase();
  if (state === "resolved" || state === "done") return "resolved";
  if (state === "cancelled" || state === "deleted") return "cancelled";
  return ACTIVE_STATES.has(state) ? "active" : "other:" + (duplicateTextKey(state) || "unknown");
}

function canonicalFlt(value) {
  const match = /\bFLT-(\d+)\b/i.exec(String(value || ""));
  return match ? "FLT-" + String(Number(match[1])) : "";
}

function storyReference(row) {
  const own = canonicalFlt(row && row.id);
  for (const field of ["target_mission_id", "story_id", "source_mission_id", "canonical_mission_id"]) {
    const candidate = canonicalFlt(row && row[field]);
    if (candidate && candidate !== own) return candidate;
  }
  const subject = String(row && row.subject || "");
  const labelled = /\b(?:story|historia|tema|ref(?:erencia)?)\s*[:#-]?\s*(FLT-\d+)\b/i.exec(subject);
  if (labelled) {
    const candidate = canonicalFlt(labelled[1]);
    if (candidate && candidate !== own) return candidate;
  }
  // Los ecos del bucle no siempre conservan la palabra "story". La raíz es el
  // FLT externo más antiguo: se excluye el id de la propia fila y se escoge el
  // menor para no convertir referencias posteriores al eco en otra historia.
  const external = [...subject.matchAll(/\bFLT-(\d+)\b/gi)]
    .map((match) => "FLT-" + String(Number(match[1])))
    .filter((candidate) => candidate !== own)
    .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
  return external[0] || "";
}

function telegramReferences(row) {
  const refs = [...String(row && row.subject || "").matchAll(/\bTG\s*#?\s*(\d+)\b/gi)]
    .map((match) => String(Number(match[1]))).filter(Boolean);
  return [...new Set(refs)].sort((a, b) => Number(a) - Number(b));
}

function projectKey(row) {
  return String(row && (row.project_id || row.project) || "").trim().toLowerCase();
}

function agentKey(row) {
  return duplicateTextKey(baseAgentIdentity(row && (row.assignee || row.persona) || ""));
}

function machineKey(row) {
  return machineIdentityKey(row && (row.machine || row.loc) || "");
}

// Contrato aditivo para /tickets y /fleet/missions. Una referencia de historia
// identifica el mismo trabajo aunque cambie quién retransmite el eco. Sin una
// historia explícita, Telegram/tema son deliberadamente estrictos y conservan
// agente+máquina para no fundir trabajos parecidos.
function duplicateEvidence(row) {
  const project = projectKey(row);
  if (!project) return null; // sin proyecto no existe aislamiento demostrable
  const state = duplicateStateClass(row);
  const parent = duplicateTextKey(row && row.parent_id);
  const scope = [project, state, parent || "root"].join("|");
  const story = storyReference(row);
  const agent = agentKey(row), machine = machineKey(row);
  const telegrams = telegramReferences(row);
  const topic = duplicateTextKey(row && row.subject);
  const storyLink = story ? "story|" + scope + "|" + story.toLowerCase() : "";
  // Un eco que conserva story+TG actúa como puente verificable entre ambos ids.
  // TG sólo une dentro de agente+máquina; así un número repetido en otra bandeja
  // no mezcla trabajos de dos ejecutores.
  const telegramLinks = telegrams.map((tg) => ["telegram", scope, agent || "unknown", machine || "unknown", tg].join("|"));
  const topicLink = topic ? ["topic", scope, agent || "unknown", machine || "unknown", topic].join("|") : "";
  let descriptor;
  if (story) descriptor = {
    version: "mission-duplicates-v1", basis: "story", reference: story,
    project_id: project, state_class: state, agent_key: "",
    key: ["story", project, state, parent || "root", story.toLowerCase()].join("|")
  };
  else if (telegrams.length) descriptor = {
    version: "mission-duplicates-v1", basis: "telegram", reference: "TG" + telegrams.join("+"),
    project_id: project, state_class: state, agent_key: agent,
    key: ["telegram", project, state, parent || "root", agent || "unknown", machine || "unknown", telegrams.join("+")].join("|")
  };
  else if (topic) descriptor = {
    version: "mission-duplicates-v1", basis: "topic", reference: topic,
    project_id: project, state_class: state, agent_key: agent,
    key: ["topic", project, state, parent || "root", agent || "unknown", machine || "unknown", topic].join("|")
  };
  else return null;
  return {descriptor, storyLink, telegramLinks, topicLink, story, telegrams, topic, parent, project, state, agent, machine};
}

export function missionDuplicateDescriptor(row) {
  const evidence = duplicateEvidence(row);
  return evidence && evidence.descriptor;
}

export function annotateMissionDuplicates(rows) {
  const list = rows || [], evidence = list.map(duplicateEvidence);
  const parent = list.map((_, index) => index);
  const find = (index) => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const storyOwners = new Map();
  evidence.forEach((item, index) => {
    if (!item || !item.storyLink) return;
    if (storyOwners.has(item.storyLink)) union(index, storyOwners.get(item.storyLink));
    else storyOwners.set(item.storyLink, index);
  });
  // Las anclas secundarias pueden extender una story conocida (FLT-2268 enlaza
  // TG2264 con FLT-1893), pero nunca son autoridad para fundir DOS stories. Si
  // un TG/tema toca raíces incompatibles, los miembros sin story quedan juntos
  // como ambiguos y no se adjudican silenciosamente a ninguna.
  const componentStories = (index) => {
    const root = find(index), stories = new Set();
    evidence.forEach((item, candidate) => { if (item && find(candidate) === root && item.story) stories.add(item.story); });
    return stories;
  };
  const connectSecondary = (selector) => {
    const buckets = new Map();
    evidence.forEach((item, index) => {
      if (!item) return;
      const links = selector(item);
      for (const link of links) {
        if (!buckets.has(link)) buckets.set(link, []);
        buckets.get(link).push(index);
      }
    });
    buckets.forEach((indexes) => {
      const stories = new Set();
      indexes.forEach((index) => componentStories(index).forEach((story) => stories.add(story)));
      if (stories.size <= 1) {
        for (let offset = 1; offset < indexes.length; offset += 1) union(indexes[0], indexes[offset]);
        return;
      }
      const partitions = new Map();
      indexes.forEach((index) => {
        const own = [...componentStories(index)].sort().join("+") || "no-story";
        if (!partitions.has(own)) partitions.set(own, []);
        partitions.get(own).push(index);
      });
      partitions.forEach((part) => {
        for (let offset = 1; offset < part.length; offset += 1) union(part[0], part[offset]);
      });
    });
  };
  connectSecondary((item) => item.telegramLinks);
  connectSecondary((item) => item.topicLink ? [item.topicLink] : []);
  const components = new Map();
  list.forEach((_, index) => {
    const key = evidence[index] ? find(index) : index;
    if (!components.has(key)) components.set(key, []);
    components.get(key).push(index);
  });
  components.forEach((indexes) => {
    const items = indexes.map((index) => evidence[index]).filter(Boolean);
    if (!items.length) { indexes.forEach((index) => { list[index].duplicate = null; }); return; }
    const stories = [...new Set(items.map((item) => item.story).filter(Boolean))]
      .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
    let canonical = items.map((item) => item.descriptor).sort((a, b) => a.key.localeCompare(b.key))[0];
    if (stories.length) canonical = {
      version:"mission-duplicates-v1", basis:"story", reference:stories[0],
      project_id:items[0].project, state_class:items[0].state, agent_key:"",
      key:["story",items[0].project,items[0].state,items[0].parent||"root",stories[0].toLowerCase()].join("|")
    };
    const memberIds = indexes.map((index) => String(list[index].id || "")).filter(Boolean).sort();
    const states = {};
    indexes.forEach((index) => {
      const state = String(list[index].visible_state || list[index].status || "unknown");
      states[state] = (states[state] || 0) + 1;
    });
    const descriptor = Object.assign({}, canonical, {
      duplicate_scope:"response-page",
      count:indexes.length,
      member_ids:memberIds,
      states
    });
    indexes.forEach((index) => { list[index].duplicate = descriptor; });
  });
  return list;
}
