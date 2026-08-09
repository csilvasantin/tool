export const CLI_MACHINES = Object.freeze([
  "MacBookAir16plata",
  "MacBookPro14",
  "MacMini"
]);

export const CLI_TYPES = Object.freeze([
  Object.freeze({ cli:"terminal", kind:"session", label:"Sesión de terminal" }),
  Object.freeze({ cli:"grok", kind:"cli", label:"Grok · CLI" }),
  Object.freeze({ cli:"smith-grok", kind:"app", label:"Smith · OpenCode (Grok)" }),
  Object.freeze({ cli:"whiterabbit", kind:"app", label:"WhiteRabbit · OpenCode (Nemotron)" })
]);

export const CLI_CATALOGO = Object.freeze(CLI_MACHINES.flatMap((machine) =>
  CLI_TYPES.map((tipo) => Object.freeze({ cli:tipo.cli, kind:tipo.kind, label:tipo.label, machine }))
));

const CLI_ACTIONS = new Set(["start", "stop", "mission"]);
const CLI_ACK_STATUSES = new Set(["running", "done", "failed"]);
const CLI_TERMINAL_STATUSES = new Set(["done", "failed"]);

function clean(value, max = 120) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

export function canonicalCliMachine(value) {
  const wanted = clean(value, 60).toLowerCase();
  return CLI_MACHINES.find((machine) => machine.toLowerCase() === wanted) || "";
}

export function canonicalCliTarget(machine, cli) {
  const canonicalMachine = canonicalCliMachine(machine);
  const canonicalCli = clean(cli, 40).toLowerCase();
  const type = CLI_TYPES.find((item) => item.cli === canonicalCli);
  if (!canonicalMachine || !type) return null;
  return { machine:canonicalMachine, cli:type.cli, kind:type.kind, label:type.label };
}

export function cliPermitido(machine, cli) {
  return !!canonicalCliTarget(machine, cli);
}

export function cliTipo(cli) {
  const canonicalCli = clean(cli, 40).toLowerCase();
  const type = CLI_TYPES.find((item) => item.cli === canonicalCli);
  return type ? type.kind : "";
}

export function canonicalCliAction(value) {
  const action = clean(value, 20).toLowerCase();
  return CLI_ACTIONS.has(action) ? action : "";
}

export function desiredStateForAction(action) {
  return action === "start" ? "running" : action === "stop" ? "stopped" : null;
}

async function sameSecret(left, right) {
  const bytes = (value) => new TextEncoder().encode(String(value || ""));
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", bytes(left)),
    crypto.subtle.digest("SHA-256", bytes(right))
  ]);
  const av = new Uint8Array(a), bv = new Uint8Array(b);
  let different = av.length ^ bv.length;
  for (let index = 0; index < Math.max(av.length, bv.length); index += 1) {
    different |= (av[index] || 0) ^ (bv[index] || 0);
  }
  return different === 0;
}

export async function authorizeCliExecutor(env, request) {
  const configured = clean(env && env.YOKUP_CLI_EXECUTOR_TOKEN, 4096);
  if (!configured) {
    return { ok:false, status:503, code:"executor_auth_not_configured",
      error:"autenticación del ejecutor no configurada" };
  }
  const header = String(request && request.headers && request.headers.get("authorization") || "");
  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim());
  if (!match || !(await sameSecret(match[1], configured))) {
    return { ok:false, status:401, code:"executor_unauthorized", error:"unauthorized" };
  }
  return { ok:true };
}

export function validateCliAckBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok:false, status:400, code:"invalid_ack", error:"body inválido" };
  }
  const target = canonicalCliTarget(body.machine, body.cli);
  if (!target) {
    return { ok:false, status:400, code:"invalid_target", error:"machine/cli fuera de la lista blanca" };
  }
  if (typeof body.alive !== "boolean") {
    return { ok:false, status:400, code:"invalid_alive", error:"alive debe ser boolean" };
  }
  let pid = null;
  if (body.pid != null && body.pid !== "") {
    pid = Number(body.pid);
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      return { ok:false, status:400, code:"invalid_pid", error:"pid debe ser un entero positivo o null" };
    }
  }
  const id = clean(body.id, 100);
  const status = clean(body.status, 20).toLowerCase();
  if (id && !CLI_ACK_STATUSES.has(status)) {
    return { ok:false, status:400, code:"invalid_ack_status",
      error:"status debe ser running, done o failed cuando se informa id" };
  }
  if (!id && status) {
    return { ok:false, status:400, code:"ack_id_required", error:"id requerido cuando se informa status" };
  }
  return { ok:true, ...target, alive:body.alive, pid, id, status,
    detail:clean(body.detail, 300) };
}

export function cliAckTransition(currentStatus, nextStatus) {
  const current = clean(currentStatus, 20).toLowerCase();
  const next = clean(nextStatus, 20).toLowerCase();
  if (!CLI_ACK_STATUSES.has(next)) return { ok:false, code:"invalid_ack_status" };
  if (CLI_TERMINAL_STATUSES.has(current)) {
    return current === next
      ? { ok:true, duplicate:true, status:current }
      : { ok:false, code:"command_already_terminal", status:current };
  }
  if (current !== "queued" && current !== "running") {
    return { ok:false, code:"command_not_acknowledgeable", status:current };
  }
  return { ok:true, duplicate:current === next, status:next };
}

export function ackMatchesCommand(command, ack) {
  const target = canonicalCliTarget(command && command.machine, command && command.cli);
  const action = canonicalCliAction(command && command.action);
  if (!target || !action) return { ok:false, code:"invalid_persisted_command" };
  if (target.machine !== ack.machine || target.cli !== ack.cli) {
    return { ok:false, code:"command_target_mismatch" };
  }
  if (ack.status === "done" && action === "start" && !ack.alive) {
    return { ok:false, code:"command_state_mismatch", error:"start done exige alive=true" };
  }
  if (ack.status === "done" && action === "stop" && ack.alive) {
    return { ok:false, code:"command_state_mismatch", error:"stop done exige alive=false" };
  }
  if (ack.status === "done" && action === "mission" && !ack.alive) {
    return { ok:false, code:"command_state_mismatch", error:"mission done exige alive=true" };
  }
  return { ok:true, action };
}
