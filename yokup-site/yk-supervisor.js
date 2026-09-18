const API = "https://api.yokup.com";
const ANALYSIS_INTERVAL_MS = 12_000;
const ANALYSIS_TIMEOUT_MS = 45_000;
const MAX_CAPTURE_EDGE = 960;
const JPEG_QUALITY = 0.72;
const PREFS_KEY = "yokup.supervisor.preferences.v1";
const ADMIRA_REMOTE_HOSTS = new Set(["admira.tv", "www.admira.tv"]);
const ADMIRA_REMOTE_PATH = "/remotecontrol/";
const ADMIRA_SCREEN_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const MIN_REMOTE_TARGET_SIZE = 44;

function compactIdentityText(value, maxLength = 120) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizedIdentityEntity(value, fallbackId, fallbackName) {
  const entity = value && typeof value === "object" ? value : null;
  const id = compactIdentityText(entity && entity.id || fallbackId, 160);
  const name = compactIdentityText(entity && (entity.name || entity.label) || fallbackName, 160);
  return id || name ? {id, name:name || id} : null;
}

export function safeRemoteControlUrl(value, expectedScreenId = "") {
  const candidate = compactIdentityText(value, 2_048);
  const expected = compactIdentityText(expectedScreenId, 80);
  if (!candidate || !/^https:\/\//i.test(candidate)) return "";
  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();
    const authority = candidate.slice(candidate.indexOf("//") + 2).split(/[/?#]/, 1)[0].toLowerCase();
    const keys = [...parsed.searchParams.keys()];
    const screenIds = parsed.searchParams.getAll("screen");
    const soloValues = parsed.searchParams.getAll("solo");
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || authority !== hostname
      || !ADMIRA_REMOTE_HOSTS.has(hostname) || parsed.pathname !== ADMIRA_REMOTE_PATH || parsed.hash
      || keys.length !== 2 || new Set(keys).size !== 2 || screenIds.length !== 1 || soloValues.length !== 1
      || !ADMIRA_SCREEN_ID.test(screenIds[0]) || soloValues[0] !== "1"
      || expected && screenIds[0] !== expected) return "";
    return parsed.href;
  } catch (_) {
    return "";
  }
}

export function normalizeScreenIdentity(screen) {
  const raw = screen && typeof screen === "object"
    ? (screen.identity && typeof screen.identity === "object" ? screen.identity
      : screen.match && typeof screen.match === "object" ? screen.match : null)
    : null;
  const suppliedStatus = compactIdentityText(raw && raw.status, 24).toLowerCase();
  const status = ["matched", "ambiguous", "unmatched", "unavailable"].includes(suppliedStatus)
    ? suppliedStatus : "unavailable";
  const source = compactIdentityText(raw && raw.source, 40).toLowerCase();
  const confidenceValue = raw && typeof raw.confidence === "number" ? raw.confidence : NaN;
  const confidence = Number.isFinite(confidenceValue) && confidenceValue >= 0 && confidenceValue <= 1
    ? confidenceValue : null;
  const project = normalizedIdentityEntity(raw && raw.project, raw && raw.project_id, raw && raw.project_name);
  const player = normalizedIdentityEntity(raw && raw.player, raw && raw.player_id, raw && raw.player_name);
  const rawContent = raw && raw.content && typeof raw.content === "object" ? raw.content : null;
  const contentTitle = compactIdentityText(rawContent && rawContent.title, 180);
  const contentType = compactIdentityText(rawContent && rawContent.type, 40);
  const content = contentTitle ? {title:contentTitle, type:contentType || null} : null;
  const evidence = Array.isArray(raw && raw.evidence)
    ? [...new Set(raw.evidence.map((item) => compactIdentityText(item, 180)).filter(Boolean))].slice(0, 5)
    : [];
  const verified = status === "matched" && source === "admira-mcp"
    && Boolean(project && project.id && player && player.id);
  const remoteRaw = raw && raw.remote && typeof raw.remote === "object" ? raw.remote : null;
  const remoteUrl = verified ? safeRemoteControlUrl(remoteRaw && remoteRaw.url, player && player.id) : "";
  const remote = remoteUrl ? {
    url:remoteUrl,
    label:compactIdentityText(remoteRaw && remoteRaw.label, 80) || `Mando de ${player.name}`
  } : null;
  return {
    status, source:source === "admira-mcp" ? source : null, confidence,
    verified, project:verified ? project : null, player:verified ? player : null,
    content:verified ? content : null, evidence, remote
  };
}

export function screenIdentityLabel(identity) {
  if (identity && identity.verified) return "Verificado por Admira MCP";
  return ({ambiguous:"Coincidencia ambigua", unmatched:"Sin coincidencia", unavailable:"Sin verificar"})[identity && identity.status]
    || "Sin verificar";
}

export function scaleCaptureSize(width, height, maxEdge = MAX_CAPTURE_EDGE) {
  const sourceWidth = Math.max(1, Number(width) || 1);
  const sourceHeight = Math.max(1, Number(height) || 1);
  const scale = Math.min(1, Math.max(1, Number(maxEdge) || MAX_CAPTURE_EDGE) / Math.max(sourceWidth, sourceHeight));
  return {width:Math.max(1, Math.round(sourceWidth * scale)), height:Math.max(1, Math.round(sourceHeight * scale))};
}

export function computeFrameMetrics(imageData) {
  const pixels = imageData && imageData.data ? imageData.data : imageData;
  if (!pixels || !pixels.length) return {luminance:0, dark_ratio:1};
  const pixelCount = Math.floor(pixels.length / 4);
  const step = Math.max(1, Math.ceil(pixelCount / 50_000));
  let sum = 0, dark = 0, samples = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const index = pixel * 4;
    const luminance = (0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]) / 255;
    sum += luminance;
    if (luminance < 0.08) dark += 1;
    samples += 1;
  }
  return {
    luminance:Number((samples ? sum / samples : 0).toFixed(4)),
    dark_ratio:Number((samples ? dark / samples : 1).toFixed(4))
  };
}

export function boxToPixels(box, mediaWidth, mediaHeight, viewportWidth, viewportHeight) {
  if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)) return null;
  const mw = Math.max(1, Number(mediaWidth) || 1), mh = Math.max(1, Number(mediaHeight) || 1);
  const vw = Math.max(1, Number(viewportWidth) || 1), vh = Math.max(1, Number(viewportHeight) || 1);
  const scale = Math.min(vw / mw, vh / mh);
  const renderedWidth = mw * scale, renderedHeight = mh * scale;
  const left = (vw - renderedWidth) / 2, top = (vh - renderedHeight) / 2;
  const values = box.map((value) => Math.min(1, Math.max(0, value)));
  const right = Math.min(1, values[0] + values[2]), bottom = Math.min(1, values[1] + values[3]);
  if (right <= values[0] || bottom <= values[1]) return null;
  const pixel = (value) => Number(value.toFixed(4));
  return {
    x:pixel(left + values[0] * renderedWidth),
    y:pixel(top + values[1] * renderedHeight),
    width:pixel((right - values[0]) * renderedWidth),
    height:pixel((bottom - values[1]) * renderedHeight)
  };
}

export function screenTargetId(index, screen = null) {
  const supplied = String(screen && (screen.target_id || screen.id) || "").trim().toUpperCase();
  if (/^SCREEN-\d{2,3}$/.test(supplied)) return supplied;
  const target = Math.max(1, Math.trunc(Number(index) || 0) + 1);
  return `SCREEN-${String(target).padStart(2, "0")}`;
}

export function screenStateLabel(screenState) {
  return ({playing:"Emitiendo",on:"Encendida",content:"Emitiendo",off:"Apagada",black:"En negro",no_signal:"Sin señal",error:"Error",unknown:"Incierta"})[screenState] || "Incierta";
}

export function screenStateConfidence(screen) {
  const value = screen && screen.confidence;
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1
    ? Math.round(value * 100) : null;
}

export function screenTargetAnnouncement(screens) {
  const targets = Array.isArray(screens) ? screens : [];
  if (!targets.length) return "No se ha localizado ninguna pantalla en la última lectura.";
  const detail = targets.map((screen, index) => {
    const confidence = screenStateConfidence(screen);
    const position = screen && Array.isArray(screen.bbox) && screen.bbox.length === 4 && screen.bbox.every(Number.isFinite)
      ? "localizada" : "sin posición precisa";
    const stateReading = confidence === null ? "estado sin confianza" : `confianza del estado ${confidence} por ciento`;
    const identity = normalizeScreenIdentity(screen);
    const identityReading = identity.verified
      ? `proyecto ${identity.project.name}, player ${identity.player.name}${identity.content ? `, emitiendo ${identity.content.title}` : ""}, verificado por Admira MCP`
      : screenIdentityLabel(identity).toLowerCase();
    return `${screenTargetId(index, screen)}, ${screenStateLabel(screen && screen.state)}, ${stateReading}, ${position}, ${identityReading}`;
  }).join(". ");
  return `${targets.length} ${targets.length === 1 ? "pantalla identificada" : "pantallas identificadas"}. ${detail}.`;
}

export function screenTargetSemanticKey(screens) {
  const targets = Array.isArray(screens) ? screens : [];
  if (!targets.length) return "none";
  return targets.map((screen, index) => {
    const located = Boolean(screen && Array.isArray(screen.bbox) && screen.bbox.length === 4 && screen.bbox.every(Number.isFinite));
    const identity = normalizeScreenIdentity(screen);
    const identityKey = identity.verified
      ? `matched:${identity.project.id}:${identity.player.id}:${identity.content && identity.content.title || "sin-contenido"}` : identity.status;
    return `${screenTargetId(index, screen)}:${String(screen && screen.state || "unknown")}:${located ? "located" : "unlocated"}:${identityKey}`;
  }).join("|");
}

export function screenTargetPlan(screens, mediaWidth, mediaHeight, viewportWidth, viewportHeight) {
  return (Array.isArray(screens) ? screens : []).map((screen, index) => {
    const box = boxToPixels(screen && screen.bbox, mediaWidth, mediaHeight, viewportWidth, viewportHeight);
    if (!box) return null;
    const state = String(screen && screen.state || "unknown");
    const tone = ["playing", "on", "content"].includes(state) ? "healthy"
      : ["off", "black", "no_signal", "error"].includes(state) ? "critical" : "warning";
    return {
      id:screenTargetId(index, screen),
      state,
      status:screenStateLabel(state),
      tone,
      stateConfidence:screenStateConfidence(screen),
      identity:normalizeScreenIdentity(screen),
      box
    };
  }).filter(Boolean);
}

function expandedRemoteTargetBox(box, viewportWidth, viewportHeight) {
  const vw = Math.max(1, Number(viewportWidth) || 1);
  const vh = Math.max(1, Number(viewportHeight) || 1);
  const width = Math.min(vw, Math.max(MIN_REMOTE_TARGET_SIZE, box.width));
  const height = Math.min(vh, Math.max(MIN_REMOTE_TARGET_SIZE, box.height));
  const x = Math.min(Math.max(0, box.x - (width - box.width) / 2), Math.max(0, vw - width));
  const y = Math.min(Math.max(0, box.y - (height - box.height) / 2), Math.max(0, vh - height));
  const pixel = (value) => Number(value.toFixed(4));
  return {x:pixel(x), y:pixel(y), width:pixel(width), height:pixel(height)};
}

function remoteTargetBoxesOverlap(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width
    && a.y < b.y + b.height && b.y < a.y + a.height;
}

function remoteActionsFromTargets(targets, viewportWidth, viewportHeight) {
  const actions = (Array.isArray(targets) ? targets : []).map((target) => {
    const identity = target && target.identity;
    const playerId = compactIdentityText(identity && identity.player && identity.player.id, 80);
    const href = identity && identity.verified && identity.remote
      ? safeRemoteControlUrl(identity.remote.url, playerId) : "";
    if (!href || !target.box || !identity.project || !identity.player) return null;
    return {
      id:target.id,
      href,
      project:identity.project.name,
      player:identity.player.name,
      playerId,
      content:identity.content && identity.content.title || "",
      box:expandedRemoteTargetBox(target.box, viewportWidth, viewportHeight)
    };
  }).filter(Boolean);
  const ambiguous = new Set();
  for (let first = 0; first < actions.length; first += 1) {
    for (let second = first + 1; second < actions.length; second += 1) {
      if (!remoteTargetBoxesOverlap(actions[first].box, actions[second].box)) continue;
      ambiguous.add(actions[first]);
      ambiguous.add(actions[second]);
    }
  }
  return actions.filter((action) => !ambiguous.has(action));
}

export function screenRemoteActionPlan(screens, mediaWidth, mediaHeight, viewportWidth, viewportHeight) {
  return remoteActionsFromTargets(
    screenTargetPlan(screens, mediaWidth, mediaHeight, viewportWidth, viewportHeight),
    viewportWidth,
    viewportHeight
  );
}

function targetPalette(tone) {
  if (tone === "critical") return {color:"#ff5f6d", wash:"rgba(255,95,109,.035)"};
  if (tone === "healthy") return {color:"#72ff62", wash:"rgba(114,255,98,.045)"};
  return {color:"#dcff55", wash:"rgba(220,255,85,.04)"};
}

function drawTargetCorners(context, box, color) {
  const length = Math.max(8, Math.min(24, box.width * .2, box.height * .24));
  const x1 = box.x, y1 = box.y, x2 = box.x + box.width, y2 = box.y + box.height;
  context.strokeStyle = color;
  context.lineWidth = 3.5;
  context.lineCap = "square";
  context.beginPath();
  context.moveTo(x1, y1 + length); context.lineTo(x1, y1); context.lineTo(x1 + length, y1);
  context.moveTo(x2 - length, y1); context.lineTo(x2, y1); context.lineTo(x2, y1 + length);
  context.moveTo(x2, y2 - length); context.lineTo(x2, y2); context.lineTo(x2 - length, y2);
  context.moveTo(x1 + length, y2); context.lineTo(x1, y2); context.lineTo(x1, y2 - length);
  context.stroke();
}

function drawTargetReticle(context, box, color) {
  const centerX = box.x + box.width / 2, centerY = box.y + box.height / 2;
  const radius = Math.max(6, Math.min(13, Math.min(box.width, box.height) * .12));
  const reach = radius + Math.max(5, radius * .55);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 1;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.arc(centerX, centerY, Math.max(3, radius * .48), 0, Math.PI * 2);
  context.moveTo(centerX - reach, centerY); context.lineTo(centerX - radius * .45, centerY);
  context.moveTo(centerX + radius * .45, centerY); context.lineTo(centerX + reach, centerY);
  context.moveTo(centerX, centerY - reach); context.lineTo(centerX, centerY - radius * .45);
  context.moveTo(centerX, centerY + radius * .45); context.lineTo(centerX, centerY + reach);
  context.stroke();
  context.beginPath();
  context.arc(centerX, centerY, 1.8, 0, Math.PI * 2);
  context.fill();
}

function drawTargetLabel(context, target, box, color, viewportWidth, viewportHeight) {
  const identity = target.identity;
  const lock = `TARGET LOCK // ${target.id}`;
  const detail = target.stateConfidence === null
    ? `${target.status.toUpperCase()}  ·  ESTADO —`
    : `${target.status.toUpperCase()}  ·  STATE ${target.stateConfidence}%`;
  const identityLine = identity && identity.verified
    ? `${identity.project.name} // ${identity.player.name}`.toUpperCase() : "";
  const paddingX = 8, labelHeight = identityLine ? 51 : 38;
  context.font = "800 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  const lineWidths = [lock, detail, identityLine].filter(Boolean).map((line) => context.measureText(line).width);
  const labelWidth = Math.min(Math.max(148, ...lineWidths) + paddingX * 2, Math.max(1, viewportWidth - 12));
  const labelX = Math.min(Math.max(6, box.x), Math.max(6, viewportWidth - labelWidth - 6));
  let labelY = box.y - labelHeight - 6;
  if (labelY < 6) labelY = box.y + box.height + labelHeight + 6 <= viewportHeight
    ? box.y + box.height + 6
    : Math.min(Math.max(6, box.y + 5), Math.max(6, viewportHeight - labelHeight - 6));

  context.fillStyle = "rgba(2,8,13,.9)";
  context.fillRect(labelX, labelY, labelWidth, labelHeight);
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.strokeRect(labelX + .5, labelY + .5, labelWidth - 1, labelHeight - 1);
  context.fillStyle = color;
  context.fillRect(labelX, labelY, 4, labelHeight);
  const availableTextWidth = Math.max(1, labelWidth - paddingX * 2);
  context.fillText(lock, labelX + paddingX, labelY + 14, availableTextWidth);
  context.fillStyle = "rgba(223,248,255,.9)";
  context.font = "700 9px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.fillText(detail, labelX + paddingX, labelY + 28, availableTextWidth);
  if (identityLine) {
    context.fillStyle = color;
    context.fillText(identityLine, labelX + paddingX, labelY + 42, availableTextWidth);
  }

  const anchorX = Math.min(Math.max(labelX + labelWidth / 2, box.x), box.x + box.width);
  const anchorY = labelY < box.y ? labelY + labelHeight : labelY;
  const boxAnchorY = labelY < box.y ? box.y : box.y + box.height;
  context.strokeStyle = color;
  context.globalAlpha = .65;
  context.beginPath();
  context.moveTo(anchorX, anchorY);
  context.lineTo(anchorX, boxAnchorY);
  context.stroke();
  context.globalAlpha = 1;
}

export function drawTargetOverlay(context, targets, viewportWidth, viewportHeight) {
  if (!context) return 0;
  let painted = 0;
  (Array.isArray(targets) ? targets : []).forEach((target) => {
    if (!target || !target.box) return;
    const box = target.box, palette = targetPalette(target.tone);
    painted += 1;
    context.save();
    context.fillStyle = palette.wash;
    context.fillRect(box.x, box.y, box.width, box.height);
    context.strokeStyle = palette.color;
    context.globalAlpha = .82;
    context.lineWidth = 1.5;
    context.setLineDash([7, 5]);
    context.strokeRect(box.x + .5, box.y + .5, Math.max(0, box.width - 1), Math.max(0, box.height - 1));
    context.globalAlpha = .3;
    context.strokeRect(box.x - 4.5, box.y - 4.5, Math.max(0, box.width + 9), Math.max(0, box.height + 9));
    context.setLineDash([]);
    context.globalAlpha = 1;
    context.shadowColor = palette.color;
    context.shadowBlur = 8;
    drawTargetCorners(context, box, palette.color);
    context.shadowBlur = 4;
    drawTargetReticle(context, box, palette.color);
    context.shadowBlur = 0;
    drawTargetLabel(context, target, box, palette.color, viewportWidth, viewportHeight);
    context.restore();
  });
  return painted;
}

export function normalizeStationId(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

export function voiceEventKey(result) {
  const speech = result && result.speech;
  const text = speech && speech.text || result && result.voice;
  if (!result || result.alert !== true || !result.ticket || !result.ticket.id || !text) return "";
  return String(speech && speech.once_key || [result.ticket.id, result.observation_id || "alert", text].join(":"));
}

export function analysisScopeMatches(scope, current) {
  return Boolean(scope && current
    && scope.sequence === current.sequence
    && scope.projectId === current.projectId
    && scope.stationId === current.stationId);
}

function boot() {
  const byId = (id) => document.getElementById(id);
  const defaultProjectId = String(document.body && document.body.dataset.ykProjectDefault || "admira-tv").trim();
  const defaultProjectLabel = String(document.body && document.body.dataset.ykProjectDefaultLabel || "admira.tv").trim();
  const canChangeProject = () => Boolean(window.YkAccess && window.YkAccess.get && window.YkAccess.get()
    && window.YkAccess.get().capabilities && window.YkAccess.get().capabilities.supervisor_project_switch === true);
  const dom = {
    projectBadge:byId("projectBadge"), projectName:byId("projectName"), stationHeading:byId("stationHeading"),
    liveState:byId("liveState"), stage:byId("stage"), camera:byId("camera"), frame:byId("frameCanvas"),
    overlay:byId("visionOverlay"), targetActions:byId("targetActions"), cameraEmpty:byId("cameraEmpty"), targetStatus:byId("targetStatus"), stageStation:byId("stageStation"),
    stageClock:byId("stageClock"), start:byId("startButton"), stop:byId("stopButton"), scan:byId("scanButton"),
    upload:byId("uploadInput"), uploadButton:byId("uploadButton"), runtime:byId("runtimeMessage"), form:byId("stationForm"),
    stationId:byId("stationId"), stationLabel:byId("stationLabel"), stationLocation:byId("stationLocation"),
    expected:byId("expectedScreens"), canonical:byId("canonicalScreen"), voice:byId("voiceEnabled"),
    visible:byId("visibleKpi"), expectedKpi:byId("expectedKpi"), active:byId("activeKpi"),
    confidence:byId("confidenceKpi"), luminance:byId("luminanceKpi"), darkRatio:byId("darkRatioKpi"),
    lastSeen:byId("lastSeenKpi"), model:byId("modelKpi"), summary:byId("visionSummary"),
    detections:byId("detections"), ticket:byId("ticketLink"), ticketText:byId("ticketText"),
    history:byId("historyList"), refresh:byId("refreshButton")
  };
  if (!dom.stage || !dom.camera) return;

  const state = {
    projectId:defaultProjectId, projectName:defaultProjectLabel, monitoring:false, hiddenPaused:false, analyzing:false,
    stream:null, timer:0, abort:null, analysisSeq:0, refreshAbort:null, refreshSeq:0, lockTask:null, releaseLock:null, conflict:false,
    mediaWidth:16, mediaHeight:9, lastScreens:[], lastStation:null, lastMetrics:null, pendingFrame:null,
    deferredVisual:null, pendingSpeech:null, targetStatusKey:`message:${dom.targetStatus && dom.targetStatus.textContent || ""}`,
    nextDelay:ANALYSIS_INTERVAL_MS
  };

  function message(text, tone = "") {
    dom.runtime.textContent = text;
    dom.runtime.className = "sv-runtime" + (tone ? ` ${tone}` : "");
  }

  function statusCopy(status, issueCode) {
    const issues = {
      healthy:"Emisión correcta", screen_off:"Pantalla apagada", black_screen:"Pantalla en negro",
      no_signal:"Sin señal", player_error:"Error visible", camera_dark:"Cámara a oscuras",
      missing_screen:"Falta una pantalla", low_confidence:"Lectura por confirmar", uncertain:"Estado incierto"
    };
    if (issues[issueCode]) return issues[issueCode];
    return {healthy:"Saludable", warning:"Revisar", critical:"Incidencia", idle:"En espera"}[status] || "Observando";
  }

  function setLiveState(status = "idle", label = "") {
    const safe = ["healthy", "warning", "critical", "scanning", "idle"].includes(status) ? status : "idle";
    dom.liveState.className = `sv-state ${safe}`;
    dom.liveState.querySelector("span").textContent = label || statusCopy(safe, "");
  }

  function updateButtons() {
    const hasProject = Boolean(state.projectId);
    dom.start.disabled = state.monitoring || state.analyzing || !hasProject || state.conflict;
    dom.stop.disabled = !state.monitoring;
    dom.scan.disabled = !state.monitoring || state.hiddenPaused || state.analyzing;
    dom.upload.disabled = state.monitoring || !hasProject || state.analyzing || state.conflict;
    dom.uploadButton.disabled = dom.upload.disabled;
    [dom.stationId, dom.stationLabel, dom.stationLocation, dom.expected, dom.canonical].forEach((input) => {
      input.disabled = state.monitoring || state.analyzing;
    });
  }

  function currentAnalysisScope() {
    return {
      sequence:state.analysisSeq,
      projectId:state.projectId,
      stationId:readConfig(false).station_id
    };
  }

  function releaseCapturedFrame(frame) {
    if (!frame) return;
    frame.image = "";
    if (frame.buffer) {
      frame.buffer.width = 0;
      frame.buffer.height = 0;
      frame.buffer = null;
    }
  }

  function discardPendingFrame() {
    const pending = state.pendingFrame;
    state.pendingFrame = null;
    releaseCapturedFrame(pending);
  }

  function discardDeferredVisual() {
    const deferred = state.deferredVisual;
    state.deferredVisual = null;
    if (deferred) releaseCapturedFrame(deferred.frame);
  }

  function invalidateAnalysis(reason = "") {
    const active = state.analyzing;
    if (active) {
      state.analysisSeq += 1;
      if (state.abort) state.abort.abort();
    }
    discardPendingFrame();
    discardDeferredVisual();
    if (active && reason) message(reason);
    return active;
  }

  function applyProject(projectId, project) {
    const requested = String(projectId || "").trim() || defaultProjectId;
    const next = canChangeProject() ? requested : defaultProjectId;
    const changed = state.projectId !== next;
    if (state.monitoring && changed) stopMonitoring("El proyecto ha cambiado. Reinicia el supervisor para usar el nuevo alcance.");
    else if (changed) invalidateAnalysis("El proyecto ha cambiado. La lectura anterior se ha descartado.");
    if (changed) {
      clearPresentedFrame();
      clearScreenTargets("Proyecto cambiado. Esperando una nueva lectura visual.");
    }
    state.projectId = next;
    state.projectName = next === defaultProjectId ? defaultProjectLabel : project && (project.name || project.id) || next || "";
    dom.projectBadge.classList.toggle("missing", !next);
    dom.projectName.textContent = state.projectName || next;
    dom.projectBadge.title = canChangeProject() ? `project_id: ${next} · cambio habilitado para superusuario` : `project_id: ${next} · proyecto fijo`;
    state.conflict = false;
    updateButtons();
    refreshState({quiet:true});
  }

  function readPreferences() {
    try {
      const value = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      if (!value || typeof value !== "object") return;
      if (value.station_id) dom.stationId.value = String(value.station_id).slice(0, 64);
      if (value.label) dom.stationLabel.value = String(value.label).slice(0, 80);
      if (value.location) dom.stationLocation.value = String(value.location).slice(0, 120);
      if (value.canonical_screen) dom.canonical.value = String(value.canonical_screen).slice(0, 160);
      if (value.expected_screens) dom.expected.value = Math.min(8, Math.max(1, Number(value.expected_screens) || 1));
      if (typeof value.voice === "boolean") dom.voice.checked = value.voice;
    } catch (_) {}
  }

  function savePreferences() {
    const config = readConfig(false);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        station_id:config.station_id, label:config.label, location:config.location,
        canonical_screen:config.canonical_screen, expected_screens:config.expected_screens, voice:dom.voice.checked
      }));
    } catch (_) {}
  }

  function readConfig(strict = true) {
    const stationId = normalizeStationId(dom.stationId.value);
    const config = {
      station_id:stationId,
      label:String(dom.stationLabel.value || "").trim().slice(0, 80) || stationId,
      location:String(dom.stationLocation.value || "").trim().slice(0, 120),
      canonical_screen:String(dom.canonical.value || "").trim().slice(0, 160),
      expected_screens:Math.min(8, Math.max(1, Number(dom.expected.value) || 1))
    };
    if (strict && !stationId) throw new Error("Escribe un ID estable para este puesto.");
    return config;
  }

  function paintConfig() {
    const config = readConfig(false);
    dom.stationHeading.textContent = config.label || "Puesto sin nombre";
    dom.stageStation.textContent = `STATION · ${(config.station_id || "SIN-ID").toUpperCase()}`;
    dom.expectedKpi.textContent = `de ${config.expected_screens} esperada${config.expected_screens === 1 ? "" : "s"}`;
  }

  function observationId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
    const random = globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function"
      ? Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(36)).join("")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    return `obs-${random}`.slice(0, 80);
  }

  function clearTimer() {
    if (state.timer) window.clearTimeout(state.timer);
    state.timer = 0;
  }

  function scheduleNext(delay = ANALYSIS_INTERVAL_MS) {
    clearTimer();
    if (!state.monitoring || state.hiddenPaused || document.hidden) return;
    state.timer = window.setTimeout(() => analyzeVideo(), Math.max(250, delay));
  }

  function stopTracks() {
    if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
    dom.camera.srcObject = null;
  }

  async function openCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Este navegador no ofrece acceso a la cámara.");
    stopTracks();
    const stream = await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{ideal:"environment"}, width:{ideal:1280}, height:{ideal:720}},
      audio:false
    });
    if (!state.monitoring || document.hidden) {
      stream.getTracks().forEach((track) => track.stop());
      return false;
    }
    state.stream = stream;
    dom.camera.srcObject = stream;
    dom.camera.muted = true;
    await dom.camera.play();
    clearPresentedFrame({showVideo:true});
    clearScreenTargets("Cámara activa. Buscando pantallas.");
    return true;
  }

  async function claimStationLock(stationId) {
    if (!navigator.locks || typeof navigator.locks.request !== "function") return true;
    let announce;
    const acquired = new Promise((resolve) => { announce = resolve; });
    state.lockTask = navigator.locks.request(`yokup-supervisor:${stationId}`, {ifAvailable:true}, async (lock) => {
      if (!lock) { announce(false); return; }
      announce(true);
      await new Promise((resolve) => { state.releaseLock = resolve; });
    }).catch(() => announce(false));
    return acquired;
  }

  function releaseStationLock() {
    if (state.releaseLock) state.releaseLock();
    state.releaseLock = null;
    state.lockTask = null;
  }

  function clearPresentedFrame({showVideo = false} = {}) {
    const context = dom.frame.getContext("2d");
    if (context) context.clearRect(0, 0, dom.frame.width, dom.frame.height);
    dom.frame.width = 1;
    dom.frame.height = 1;
    dom.stage.classList.remove("has-still");
    dom.stage.classList.toggle("has-media", Boolean(showVideo && state.stream));
    state.mediaWidth = showVideo ? dom.camera.videoWidth || 16 : 16;
    state.mediaHeight = showVideo ? dom.camera.videoHeight || 9 : 9;
  }

  function presentCapturedFrame(frame) {
    if (!frame || !frame.buffer || !frame.width || !frame.height) return false;
    dom.frame.width = frame.width;
    dom.frame.height = frame.height;
    const context = dom.frame.getContext("2d", {alpha:false});
    if (!context) return false;
    context.drawImage(frame.buffer, 0, 0, frame.width, frame.height);
    state.mediaWidth = frame.width;
    state.mediaHeight = frame.height;
    dom.stage.classList.add("has-still", "has-media");
    return true;
  }

  function captureDrawable(drawable, sourceWidth, sourceHeight) {
    const size = scaleCaptureSize(sourceWidth, sourceHeight, MAX_CAPTURE_EDGE);
    const buffer = document.createElement("canvas");
    buffer.width = size.width;
    buffer.height = size.height;
    const context = buffer.getContext("2d", {alpha:false, willReadFrequently:true});
    if (!context) throw new Error("No se pudo preparar el fotograma.");
    context.drawImage(drawable, 0, 0, size.width, size.height);
    const metrics = computeFrameMetrics(context.getImageData(0, 0, size.width, size.height));
    const image = buffer.toDataURL("image/jpeg", JPEG_QUALITY);
    return {image, metrics, width:size.width, height:size.height, buffer};
  }

  function screenTone(screenState) {
    if (["playing", "on", "content"].includes(screenState)) return "healthy";
    if (["off", "black", "no_signal", "error"].includes(screenState)) return "critical";
    return "warning";
  }

  function screenLabel(screenState) {
    return screenStateLabel(screenState);
  }

  function renderTargetActions(targets, viewportWidth, viewportHeight) {
    if (!dom.targetActions) return;
    const focused = dom.targetActions.contains(document.activeElement) ? document.activeElement : null;
    const focusedKey = focused && focused.dataset ? focused.dataset.actionKey : "";
    const existing = new Map([...dom.targetActions.children].map((link) => [link.dataset.actionKey || "", link]));
    const retained = new Set();
    remoteActionsFromTargets(targets, viewportWidth, viewportHeight).forEach((action, index) => {
      const actionKey = `${action.id}\n${action.playerId}\n${action.href}`;
      let link = existing.get(actionKey);
      if (!link) {
        link = document.createElement("a");
        link.className = "sv-target-action";
        const hint = document.createElement("span");
        const hintTitle = document.createElement("b");
        const hintContext = document.createElement("small");
        const hintContent = document.createElement("small");
        hintTitle.className = "sv-target-action-title";
        hintContext.className = "sv-target-action-context";
        hintContent.className = "sv-target-action-content";
        hint.append(hintTitle, hintContext, hintContent);
        link.appendChild(hint);
      }
      retained.add(link);
      link.dataset.actionKey = actionKey;
      link.href = action.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.referrerPolicy = "no-referrer";
      link.draggable = false;
      link.dataset.target = action.id;
      link.dataset.player = action.playerId;
      link.style.left = `${action.box.x}px`;
      link.style.top = `${action.box.y}px`;
      link.style.width = `${action.box.width}px`;
      link.style.height = `${action.box.height}px`;
      const contentCopy = action.content ? `, emitiendo ${action.content}` : "";
      link.setAttribute("aria-label", `Abrir mando de ${action.id}: proyecto ${action.project}, player ${action.player}${contentCopy}. Abre en una pestaña nueva.`);
      link.title = `${action.project} · ${action.player}${action.content ? ` · ${action.content}` : ""}`;
      const hintTitle = link.querySelector(".sv-target-action-title");
      const hintContext = link.querySelector(".sv-target-action-context");
      const hintContent = link.querySelector(".sv-target-action-content");
      hintTitle.textContent = "ABRIR MANDO ↗";
      hintContext.textContent = `${action.project} · ${action.player}`;
      hintContent.textContent = action.content;
      hintContent.hidden = !action.content;
      const position = dom.targetActions.children[index] || null;
      if (position !== link) dom.targetActions.insertBefore(link, position);
    });
    [...dom.targetActions.children].forEach((link) => {
      if (!retained.has(link)) link.remove();
    });
    if (focusedKey && document.activeElement !== focused) {
      const restored = [...retained].find((link) => link.dataset.actionKey === focusedKey);
      if (restored) restored.focus({preventScroll:true});
    }
  }

  function drawBoxes() {
    const viewportWidth = dom.targetActions ? dom.targetActions.clientWidth : dom.stage.clientWidth;
    const viewportHeight = dom.targetActions ? dom.targetActions.clientHeight : dom.stage.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!viewportWidth || !viewportHeight) {
      renderTargetActions([], 0, 0);
      return;
    }
    dom.overlay.width = Math.round(viewportWidth * dpr);
    dom.overlay.height = Math.round(viewportHeight * dpr);
    const context = dom.overlay.getContext("2d");
    if (!context) {
      renderTargetActions([], viewportWidth, viewportHeight);
      return;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    const targets = screenTargetPlan(state.lastScreens, state.mediaWidth, state.mediaHeight, viewportWidth, viewportHeight);
    const painted = drawTargetOverlay(context, targets, viewportWidth, viewportHeight);
    renderTargetActions(targets, viewportWidth, viewportHeight);
    dom.stage.classList.toggle("has-targets", painted > 0);
  }

  function setTargetStatus(text, semanticKey) {
    const key = String(semanticKey || text || "");
    if (!dom.targetStatus || state.targetStatusKey === key) return false;
    state.targetStatusKey = key;
    dom.targetStatus.textContent = String(text || "");
    return true;
  }

  function clearScreenTargets(announcement = "Sin objetivos localizados.") {
    state.lastScreens = [];
    dom.stage.classList.remove("has-targets");
    setTargetStatus(announcement, `message:${announcement}`);
    drawBoxes();
  }

  function screenIdentityStatusCopy(identity) {
    if (identity.verified) return "Proyecto y player confirmados contra el catálogo de Admira.";
    if (identity.status === "ambiguous") return "El contenido coincide con más de un player; hace falta otra lectura.";
    if (identity.status === "unmatched") return "El contenido observado no coincide con ningún player del catálogo.";
    return "Admira MCP no ha confirmado todavía este objetivo.";
  }

  function appendIdentityField(list, label, value) {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    wrapper.append(term, detail);
    list.appendChild(wrapper);
  }

  function renderScreenIdentity(card, screen, target) {
    const identity = normalizeScreenIdentity(screen);
    const panel = document.createElement("section");
    panel.className = `sv-identity ${identity.verified ? "verified" : identity.status}`;
    panel.setAttribute("aria-label", `Identidad de ${target}`);

    const head = document.createElement("div");
    head.className = "sv-identity-head";
    const eyebrow = document.createElement("span");
    eyebrow.textContent = "IDENTIDAD DE EMISIÓN";
    const status = document.createElement("strong");
    status.textContent = screenIdentityLabel(identity);
    head.append(eyebrow, status);
    panel.appendChild(head);

    const summary = document.createElement("p");
    summary.className = "sv-identity-summary";
    summary.textContent = screenIdentityStatusCopy(identity);
    panel.appendChild(summary);

    if (identity.verified) {
      const fields = document.createElement("dl");
      fields.className = "sv-identity-fields";
      appendIdentityField(fields, "Proyecto", identity.project.name);
      appendIdentityField(fields, "Player", identity.player.name);
      appendIdentityField(fields, "Emitiendo ahora", identity.content && identity.content.title || "Sin título publicado");
      if (identity.confidence !== null) appendIdentityField(fields, "Coincidencia", `${Math.round(identity.confidence * 100)}%`);
      panel.appendChild(fields);
    }

    const evidence = document.createElement("div");
    evidence.className = "sv-evidence";
    const evidenceTitle = document.createElement("span");
    evidenceTitle.textContent = "EVIDENCIAS";
    evidence.appendChild(evidenceTitle);
    if (identity.evidence.length) {
      const list = document.createElement("ul");
      identity.evidence.forEach((item) => {
        const row = document.createElement("li");
        row.textContent = item;
        list.appendChild(row);
      });
      evidence.appendChild(list);
    } else {
      const empty = document.createElement("p");
      empty.textContent = "Sin evidencias de catálogo para mostrar.";
      evidence.appendChild(empty);
    }
    panel.appendChild(evidence);

    if (identity.remote) {
      const remote = document.createElement("a");
      remote.className = "sv-remote";
      remote.href = identity.remote.url;
      remote.target = "_blank";
      remote.rel = "noopener noreferrer";
      remote.referrerPolicy = "no-referrer";
      const remoteContentCopy = identity.content ? `, emitiendo ${identity.content.title}` : "";
      remote.setAttribute("aria-label", `${identity.remote.label}: proyecto ${identity.project.name}, player ${identity.player.name}${remoteContentCopy}. Abre en una pestaña nueva.`);
      remote.title = identity.remote.label;
      const remoteCopy = document.createElement("span");
      const remoteOverline = document.createElement("small");
      const remoteLabel = document.createElement("strong");
      const remoteCapabilities = document.createElement("em");
      remoteOverline.textContent = "MANDO ADMIRA VERIFICADO";
      remoteLabel.textContent = `${identity.project.name} · ${identity.player.name}`;
      remoteCapabilities.textContent = `${identity.content ? `Ahora: ${identity.content.title} · ` : ""}Playlist · primero/anterior/siguiente/último · pausa · mute · volumen · HUD`;
      remoteCopy.append(remoteOverline, remoteLabel, remoteCapabilities);
      const arrow = document.createElement("b");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";
      remote.append(remoteCopy, arrow);
      panel.appendChild(remote);
    } else {
      const unavailable = document.createElement("p");
      unavailable.className = "sv-remote-unavailable";
      unavailable.textContent = identity.verified
        ? "Este player no publica un mando remoto en el catálogo."
        : "El mando aparecerá sólo después de verificar proyecto y player.";
      panel.appendChild(unavailable);
    }

    card.appendChild(panel);
    return identity;
  }

  function renderScreens(screens) {
    state.lastScreens = Array.isArray(screens) ? screens : [];
    setTargetStatus(screenTargetAnnouncement(state.lastScreens), `screens:${screenTargetSemanticKey(state.lastScreens)}`);
    dom.detections.replaceChildren();
    if (!state.lastScreens.length) {
      const empty = document.createElement("p");
      empty.className = "sv-muted";
      empty.textContent = "No se ha delimitado ninguna pantalla en la última lectura.";
      dom.detections.appendChild(empty);
      drawBoxes();
      return;
    }
    state.lastScreens.forEach((screen, index) => {
      const card = document.createElement("article");
      card.className = `sv-detection ${screenTone(screen.state)}`;
      const head = document.createElement("div");
      head.className = "sv-detection-head";
      const title = document.createElement("strong");
      const target = screenTargetId(index, screen);
      title.textContent = `${target} · ${screenLabel(screen.state)}`;
      const confidence = document.createElement("span");
      const stateConfidence = screenStateConfidence(screen);
      confidence.textContent = stateConfidence === null ? "ESTADO —" : `STATE ${stateConfidence}%`;
      head.append(title, confidence);
      const copy = document.createElement("p");
      copy.textContent = screen.description || "Sin detalle adicional.";
      const identity = normalizeScreenIdentity(screen);
      card.setAttribute("role", "listitem");
      card.setAttribute("aria-label", stateConfidence === null
        ? `${target}, ${screenLabel(screen.state)}, estado sin confianza, ${screenIdentityLabel(identity)}`
        : `${target}, ${screenLabel(screen.state)}, confianza del estado ${stateConfidence} por ciento, ${screenIdentityLabel(identity)}`);
      card.append(head, copy);
      renderScreenIdentity(card, screen, target);
      dom.detections.appendChild(card);
    });
    drawBoxes();
  }

  function renderTicket(ticket) {
    if (!ticket || !ticket.id) {
      dom.ticket.hidden = true;
      return;
    }
    dom.ticket.hidden = false;
    dom.ticket.href = `/ticket?id=${encodeURIComponent(ticket.id)}`;
    dom.ticketText.textContent = `Abrir ${ticket.id}`;
  }

  function formatTime(timestamp) {
    const value = Number(timestamp);
    if (!value) return "—";
    try { return new Intl.DateTimeFormat("es-ES", {hour:"2-digit", minute:"2-digit", second:"2-digit"}).format(new Date(value)); }
    catch (_) { return "—"; }
  }

  function renderStation(station, latestObservation) {
    if (!station) {
      state.lastStation = null;
      dom.visible.textContent = "—";
      dom.active.textContent = "—";
      dom.confidence.textContent = "—";
      dom.lastSeen.textContent = "—";
      if (!state.analyzing) setLiveState("idle", "En espera");
      return;
    }
    state.lastStation = station;
    const expected = Number(station.expected_screens) || readConfig(false).expected_screens;
    dom.visible.textContent = String(Number(station.visible_screens) || 0);
    dom.active.textContent = String(Number(station.active_screens) || 0);
    dom.expectedKpi.textContent = `de ${expected} esperada${expected === 1 ? "" : "s"}`;
    dom.confidence.textContent = `${Math.round((Number(station.confidence) || 0) * 100)}%`;
    dom.lastSeen.textContent = formatTime(station.last_seen_at);
    dom.summary.textContent = station.summary || "Observación completada.";
    if (!state.analyzing) setLiveState(station.status, statusCopy(station.status, station.issue_code));
    renderTicket(station.ticket_id ? {id:station.ticket_id} : null);
    if (latestObservation) {
      const luminance = Number(latestObservation.luminance);
      const dark = Number(latestObservation.dark_ratio);
      if (Number.isFinite(luminance)) dom.luminance.textContent = `${Math.round(luminance * 100)}%`;
      if (Number.isFinite(dark)) dom.darkRatio.textContent = `${Math.round(dark * 100)}% de píxeles oscuros`;
    }
  }

  function renderHistory(observations) {
    const rows = Array.isArray(observations) ? observations : [];
    dom.history.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "Sin observaciones para este puesto.";
      dom.history.appendChild(empty);
      return;
    }
    rows.forEach((row) => {
      const item = document.createElement("li");
      item.className = ["healthy", "warning", "critical"].includes(row.status) ? row.status : "warning";
      const dot = document.createElement("i"); dot.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      const title = document.createElement("strong"); title.textContent = statusCopy(row.status, row.issue_code);
      const detail = document.createElement("small");
      detail.textContent = `${row.summary || "Sin detalle"} · ${Number(row.active_screens) || 0}/${Number(row.visible_screens) || 0} activas/visibles`;
      copy.append(title, detail);
      const time = document.createElement("time");
      time.dateTime = new Date(Number(row.observed_at) || Date.now()).toISOString();
      time.textContent = formatTime(row.observed_at);
      item.append(dot, copy, time);
      dom.history.appendChild(item);
    });
  }

  async function refreshState({quiet = false} = {}) {
    const config = readConfig(false);
    if (!config.station_id || !state.projectId) return null;
    const stationId = config.station_id, projectId = state.projectId, sequence = ++state.refreshSeq;
    if (state.refreshAbort) state.refreshAbort.abort();
    const controller = new AbortController();
    state.refreshAbort = controller;
    const isCurrent = () => sequence === state.refreshSeq && projectId === state.projectId
      && stationId === readConfig(false).station_id;
    try {
      const params = new URLSearchParams({station:stationId, project_id:projectId});
      const response = await fetch(`${API}/supervisor/state?${params}`, {cache:"no-store", signal:controller.signal});
      const result = await response.json().catch(() => ({}));
      if (!isCurrent()) return null;
      if (!response.ok || result.ok === false) {
        if (["station_project_conflict", "station_project_forbidden"].includes(result.error)) {
          state.conflict = true;
          const owner = result.project_id ? ` al proyecto ${result.project_id}` : " a otro proyecto";
          message(`El ID ${stationId} ya pertenece${owner}. Usa otro ID para no mezclar puestos.`, "error");
          updateButtons();
          return result;
        }
        throw new Error(result.error || `HTTP ${response.status}`);
      }
      const station = result.station || null;
      state.conflict = Boolean(station && state.projectId && station.project_id && station.project_id !== state.projectId);
      if (state.conflict) {
        message(`El ID ${config.station_id} ya pertenece al proyecto ${station.project_id}. Elige otro ID para no mezclar puestos.`, "error");
      } else if (!quiet && station) {
        message("Estado sincronizado con Yokup.", "ok");
      }
      const observations = result.observations || [];
      renderStation(station, observations[0]);
      renderHistory(observations);
      updateButtons();
      return result;
    } catch (error) {
      if (error.name !== "AbortError" && isCurrent() && !quiet) message(`No se pudo leer el estado: ${error.message}`, "error");
      return null;
    } finally {
      if (state.refreshAbort === controller) state.refreshAbort = null;
    }
  }

  function speakPendingAlert() {
    const pending = state.pendingSpeech;
    if (!pending) return false;
    if (pending.scope && !analysisScopeMatches(pending.scope, currentAnalysisScope())) {
      state.pendingSpeech = null;
      return false;
    }
    if (!dom.voice.checked || !("speechSynthesis" in window) || document.hidden) return false;
    const storageKey = `yokup.supervisor.spoken:${pending.key}`;
    try {
      if (sessionStorage.getItem(storageKey)) { state.pendingSpeech = null; return false; }
    } catch (_) {}
    const utterance = new SpeechSynthesisUtterance(pending.text);
    utterance.lang = pending.lang;
    utterance.rate = 0.78;
    utterance.pitch = 0.45;
    utterance.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => /^es(?:-|_)/i.test(voice.lang) && /google|mónica|monica|jorge|paulina|helena/i.test(voice.name))
      || voices.find((voice) => /^es(?:-|_)/i.test(voice.lang)) || null;
    try { window.speechSynthesis.speak(utterance); }
    catch (_) { return false; }
    state.pendingSpeech = null;
    try { sessionStorage.setItem(storageKey, "1"); } catch (_) {}
    return true;
  }

  function speakAlert(result, scope) {
    const key = voiceEventKey(result);
    if (!key || !dom.voice.checked || !("speechSynthesis" in window)) return;
    const storageKey = `yokup.supervisor.spoken:${key}`;
    try { if (sessionStorage.getItem(storageKey)) return; } catch (_) {}
    const text = result.speech && result.speech.text || result.voice;
    state.pendingSpeech = {key, text:String(text), lang:result.speech && result.speech.lang || "es-ES", scope};
    speakPendingAlert();
  }

  function renderAnalysisVisual(result, frame) {
    if (!presentCapturedFrame(frame)) throw new Error("No se pudo presentar el fotograma analizado.");
    renderScreens(result.screens || []);
  }

  function deferAnalysisVisual(result, frame, scope) {
    discardDeferredVisual();
    state.deferredVisual = {screens:Array.isArray(result.screens) ? result.screens : [], frame, scope};
    return true;
  }

  function presentDeferredVisual() {
    const deferred = state.deferredVisual;
    if (!deferred || document.hidden) return false;
    state.deferredVisual = null;
    const current = currentAnalysisScope();
    if (!analysisScopeMatches(deferred.scope, current)) {
      releaseCapturedFrame(deferred.frame);
      return false;
    }
    try {
      if (!presentCapturedFrame(deferred.frame)) return false;
      renderScreens(deferred.screens);
      return true;
    } finally {
      releaseCapturedFrame(deferred.frame);
    }
  }

  function handleAnalysis(result, frame, {deferVisual = false, scope = null} = {}) {
    const retainedFrame = deferVisual ? deferAnalysisVisual(result, frame, scope) : (renderAnalysisVisual(result, frame), false);
    if (result.station) renderStation(result.station, {...frame.metrics});
    renderTicket(result.ticket || (result.station && result.station.ticket_id ? {id:result.station.ticket_id} : null));
    dom.model.textContent = String(result.model || "visión IA").replace(/^@cf\//, "");
    if (result.transition === "incident_confirmed") message(`Incidencia ${result.ticket && result.ticket.id || "creada"}. La alarma ha sido confirmada.`, "error");
    else if (result.transition === "incident_reused") message(`Incidencia ${result.ticket && result.ticket.id || "existente"} ya vinculada. No se repite la alarma.`, "error");
    else if (result.transition === "recovery_detected") message("La emisión vuelve a verse. El ticket queda pendiente de verificación humana.", "ok");
    else if (result.reused) message("Esta observación ya estaba procesada; no se repite la alarma.");
    else message("Observación completada. Siguiente lectura en 12 segundos.", "ok");
    speakAlert(result, scope);
    return retainedFrame;
  }

  async function submitFrame(frame, continuous) {
    if (state.analyzing) { releaseCapturedFrame(frame); return; }
    if (!state.projectId) {
      releaseCapturedFrame(frame);
      throw new Error("El proyecto del Supervisor no está disponible.");
    }
    let config;
    try { config = readConfig(true); }
    catch (error) { releaseCapturedFrame(frame); throw error; }
    const scope = Object.freeze({
      sequence:++state.analysisSeq,
      projectId:state.projectId,
      stationId:config.station_id
    });
    const isCurrent = () => analysisScopeMatches(scope, currentAnalysisScope());
    state.analyzing = true;
    state.pendingFrame = frame;
    state.nextDelay = ANALYSIS_INTERVAL_MS;
    updateButtons();
    dom.stage.classList.add("analyzing");
    setLiveState("scanning", "Analizando");
    message("La visión artificial está leyendo la escena…");
    const controller = new AbortController();
    state.abort = controller;
    let timeoutTriggered = false, retainedFrame = false;
    const timeout = window.setTimeout(() => {
      timeoutTriggered = true;
      controller.abort();
    }, ANALYSIS_TIMEOUT_MS);
    try {
      const payload = {
        observation_id:observationId(), captured_at:Date.now(), project_id:scope.projectId,
        station_id:scope.stationId, label:config.label, location:config.location,
        expected_screens:config.expected_screens, canonical_screen:config.canonical_screen,
        image:frame.image, metrics:frame.metrics
      };
      let requestBody = JSON.stringify(payload);
      payload.image = "";
      frame.image = "";
      const request = fetch(`${API}/supervisor/analyze`, {
        method:"POST", headers:{"content-type":"application/json"}, body:requestBody, signal:controller.signal
      });
      requestBody = "";
      const response = await request;
      const result = await response.json().catch(() => ({}));
      window.clearTimeout(timeout);
      if (!isCurrent()) return;
      if (!response.ok || result.ok === false) {
        const error = new Error(result.error || `HTTP ${response.status}`);
        error.retryAfter = Number(result.retry_after_ms) || 0;
        throw error;
      }
      retainedFrame = handleAnalysis(result, frame, {deferVisual:document.hidden || state.hiddenPaused, scope});
      await refreshState({quiet:true});
    } catch (error) {
      if (timeoutTriggered && isCurrent()) {
        state.nextDelay = ANALYSIS_INTERVAL_MS;
        message("La visión ha superado el tiempo de espera. Yokup reintentará en el siguiente ciclo.", "error");
        if (state.lastStation) setLiveState(state.lastStation.status, statusCopy(state.lastStation.status, state.lastStation.issue_code));
        else setLiveState("warning", "Tiempo agotado");
      } else if (error.name !== "AbortError" && isCurrent()) {
        state.nextDelay = error.retryAfter || ANALYSIS_INTERVAL_MS;
        const friendly = error.message === "scan_too_frequent" ? "Yokup está protegiendo el intervalo entre lecturas."
          : error.message === "supervisor_rate_limited" ? "Se ha alcanzado el cupo de visión. Yokup reintentará en el siguiente intervalo."
          : error.message === "station_busy" ? "Este puesto ya tiene una lectura en curso."
          : `No se pudo completar el análisis: ${error.message}`;
        message(friendly, "error");
        if (state.lastStation) setLiveState(state.lastStation.status, statusCopy(state.lastStation.status, state.lastStation.issue_code));
        else setLiveState("warning", "Sin respuesta");
      }
    } finally {
      window.clearTimeout(timeout);
      if (state.pendingFrame === frame) state.pendingFrame = null;
      if (!retainedFrame) releaseCapturedFrame(frame);
      if (state.abort === controller) state.abort = null;
      state.analyzing = false;
      dom.stage.classList.remove("analyzing");
      updateButtons();
      if (continuous && state.monitoring && !state.hiddenPaused && !document.hidden) scheduleNext(state.nextDelay);
    }
  }

  async function analyzeVideo() {
    clearTimer();
    if (!state.monitoring || state.hiddenPaused || !state.stream) return;
    if (state.analyzing) { scheduleNext(500); return; }
    if (!dom.camera.videoWidth || dom.camera.readyState < 2) {
      message("Esperando el primer fotograma de la cámara…");
      scheduleNext(500);
      return;
    }
    const frame = captureDrawable(dom.camera, dom.camera.videoWidth, dom.camera.videoHeight);
    state.lastMetrics = frame.metrics;
    dom.luminance.textContent = `${Math.round(frame.metrics.luminance * 100)}%`;
    dom.darkRatio.textContent = `${Math.round(frame.metrics.dark_ratio * 100)}% de píxeles oscuros`;
    await submitFrame(frame, true);
  }

  async function startMonitoring() {
    if (state.monitoring) return;
    try {
      if (!state.projectId) throw new Error("El proyecto del Supervisor no está disponible.");
      const config = readConfig(true);
      savePreferences();
      await refreshState({quiet:true});
      if (state.conflict) throw new Error("Este ID de puesto ya pertenece a otro proyecto.");
      const locked = await claimStationLock(config.station_id);
      if (!locked) throw new Error("Este puesto ya está siendo supervisado en otra pestaña.");
      state.monitoring = true;
      state.hiddenPaused = false;
      updateButtons();
      const opened = await openCamera();
      if (!opened) throw new Error("La cámara no pudo permanecer abierta.");
      message("Cámara activa sin audio. Preparando la primera lectura…", "ok");
      setLiveState("scanning", "Cámara activa");
      scheduleNext(350);
    } catch (error) {
      state.monitoring = false;
      stopTracks();
      releaseStationLock();
      updateButtons();
      setLiveState("warning", "Cámara detenida");
      message(`${error.message} Puedes usar «Probar una imagen» como alternativa.`, "error");
    }
  }

  function stopMonitoring(reason = "Supervisor detenido. La cámara está apagada.", quiet = false) {
    state.monitoring = false;
    state.hiddenPaused = false;
    clearTimer();
    invalidateAnalysis();
    state.abort = null;
    stopTracks();
    releaseStationLock();
    dom.stage.classList.remove("analyzing");
    clearPresentedFrame();
    clearScreenTargets("Supervisor detenido. Sin objetivos localizados.");
    setLiveState(state.lastStation ? state.lastStation.status : "idle", state.lastStation ? statusCopy(state.lastStation.status, state.lastStation.issue_code) : "En espera");
    updateButtons();
    if (!quiet) message(reason);
  }

  async function analyzeUpload(file) {
    if (!file) return;
    try {
      if (!state.projectId) throw new Error("El proyecto del Supervisor no está disponible.");
      if (!/^image\/(?:jpeg|png|webp)$/i.test(file.type)) throw new Error("Usa una imagen JPEG, PNG o WebP.");
      if (file.size > 12_000_000) throw new Error("La imagen supera los 12 MB.");
      const config = readConfig(true);
      await refreshState({quiet:true});
      if (state.conflict) throw new Error(`El ID ${config.station_id} pertenece a otro proyecto.`);
      let bitmap;
      if (typeof createImageBitmap === "function") bitmap = await createImageBitmap(file);
      else {
        bitmap = await new Promise((resolve, reject) => {
          const image = new Image(), url = URL.createObjectURL(file);
          image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
          image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen.")); };
          image.src = url;
        });
      }
      let frame;
      try { frame = captureDrawable(bitmap, bitmap.width || bitmap.naturalWidth, bitmap.height || bitmap.naturalHeight); }
      finally { if (typeof bitmap.close === "function") bitmap.close(); }
      presentCapturedFrame(frame);
      clearScreenTargets("Nueva imagen preparada. Buscando pantallas.");
      state.lastMetrics = frame.metrics;
      dom.luminance.textContent = `${Math.round(frame.metrics.luminance * 100)}%`;
      dom.darkRatio.textContent = `${Math.round(frame.metrics.dark_ratio * 100)}% de píxeles oscuros`;
      await submitFrame(frame, false);
    } catch (error) {
      message(error.message, "error");
    } finally {
      dom.upload.value = "";
    }
  }

  async function pauseForVisibility() {
    clearTimer();
    if (state.monitoring) {
      if (state.hiddenPaused) return;
      state.hiddenPaused = true;
      stopTracks();
    }
    clearPresentedFrame();
    clearScreenTargets(state.analyzing
      ? "Vista oculta. El análisis continúa sin conservar la imagen en pantalla."
      : "Vista oculta. Sin imagen activa.");
    if (state.monitoring) setLiveState("idle", "En pausa");
    updateButtons();
    message(state.analyzing
      ? "Vista pausada y cámara cerrada. El análisis en curso terminará en segundo plano."
      : "Vista pausada: la pestaña está oculta y no conserva ningún fotograma.");
  }

  async function resumeAfterVisibility() {
    if (document.hidden) return;
    if (!state.monitoring || !state.hiddenPaused) {
      presentDeferredVisual();
      speakPendingAlert();
      return;
    }
    try {
      await openCamera();
      state.hiddenPaused = false;
      updateButtons();
      presentDeferredVisual();
      speakPendingAlert();
      message("Cámara reactivada. Reanudando la supervisión…", "ok");
      scheduleNext(350);
    } catch (error) {
      stopMonitoring(`No se pudo reactivar la cámara: ${error.message}`);
      speakPendingAlert();
    }
  }

  function tickClock() {
    dom.stageClock.textContent = state.monitoring && !state.hiddenPaused
      ? new Intl.DateTimeFormat("es-ES", {hour:"2-digit", minute:"2-digit", second:"2-digit"}).format(new Date())
      : "SIN SEÑAL";
    window.setTimeout(tickClock, 1_000);
  }

  readPreferences();
  paintConfig();
  applyProject(window.YkProjectScope && window.YkProjectScope.get ? window.YkProjectScope.get() : defaultProjectId, null);
  updateButtons();
  tickClock();

  dom.form.addEventListener("submit", (event) => event.preventDefault());
  dom.form.addEventListener("input", () => { paintConfig(); savePreferences(); });
  dom.voice.addEventListener("change", () => { if (dom.voice.checked) speakPendingAlert(); });
  dom.stationId.addEventListener("change", () => {
    invalidateAnalysis("El puesto ha cambiado. La lectura anterior se ha descartado.");
    clearPresentedFrame();
    clearScreenTargets("Puesto cambiado. Esperando una nueva lectura visual.");
    state.conflict = false;
    refreshState();
  });
  dom.start.addEventListener("click", startMonitoring);
  dom.stop.addEventListener("click", () => stopMonitoring());
  dom.scan.addEventListener("click", () => { clearTimer(); analyzeVideo(); });
  dom.uploadButton.addEventListener("click", () => dom.upload.click());
  dom.upload.addEventListener("change", () => analyzeUpload(dom.upload.files && dom.upload.files[0]));
  dom.refresh.addEventListener("click", () => refreshState());
  window.addEventListener("yk:project-change", (event) => applyProject(event.detail && event.detail.project_id, event.detail && event.detail.project));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseForVisibility();
    else resumeAfterVisibility();
  });
  window.addEventListener("pagehide", () => stopMonitoring("", true));
  if (typeof ResizeObserver === "function") new ResizeObserver(drawBoxes).observe(dom.stage);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, {once:true});
  else boot();
}
