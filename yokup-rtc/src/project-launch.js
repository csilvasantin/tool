const DESKTOP_RUNTIMES = new Set(["Claude", "Codex", "OpenCode"]);
const CLI_MODELS = new Map([
  ["grok", { selection:"Grok", runtime:"Grok" }],
  ["nemotron", { selection:"Nemotron", runtime:"OpenCode" }],
  ["qwen", { selection:"Qwen", runtime:"OpenCode" }],
]);

function text(value, field, max = 80) {
  const result = String(value == null ? "" : value).trim();
  if (!result || result.length > max) throw new Error(`invalid-${field}`);
  return result;
}

export function normalizeProjectLaunch(input) {
  const project = text(input && input.project, "project", 80);
  const machine = text(input && input.machine, "machine", 60);
  const persona = text(input && input.persona, "persona", 60);
  const runtime = text(input && input.runtime, "runtime", 30);
  const host = text(input && (input.host || input.platform), "platform", 12).toLowerCase();
  const session_id = text(input && input.session_id, "session_id", 80);
  const selectionRaw = text(input && (input.selection || input.choice || runtime), "selection", 40);
  const model = String(input && input.model || "").trim().slice(0, 80);

  if (host !== "app" && host !== "cli") throw new Error("invalid-platform");
  if (host === "app") {
    if (!DESKTOP_RUNTIMES.has(runtime) || selectionRaw.toLowerCase() !== runtime.toLowerCase()) {
      throw new Error("invalid-desktop-selection");
    }
    if (session_id !== "desktop:" + runtime.toLowerCase()) throw new Error("invalid-desktop-session");
    return { project, machine, persona, runtime, host, session_id, selection:runtime, model };
  }

  const preset = CLI_MODELS.get(selectionRaw.toLowerCase());
  if (!preset || runtime !== preset.runtime) throw new Error("invalid-cli-selection");
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(session_id)) throw new Error("invalid-cli-session");
  // Qwen sólo puede reutilizar una sesión que ya demuestre ese modelo. Hasta que
  // el watcher anuncie modelos arrancables, no convertimos OpenCode/Nemotron en
  // Qwen por cambiar una etiqueta en el navegador.
  if (preset.selection === "Qwen" && !/qwen/i.test(model)) {
    throw new Error("qwen-not-provisioned");
  }
  return { project, machine, persona, runtime, host, session_id, selection:preset.selection, model };
}

export function projectLaunchTarget(launch) {
  return {
    machine:launch.machine,
    persona:launch.persona,
    runtime:launch.runtime,
    host:launch.host,
    session_id:launch.session_id,
  };
}
