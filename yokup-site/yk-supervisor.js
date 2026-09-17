const API = "https://api.yokup.com";
const ANALYSIS_INTERVAL_MS = 12_000;
const MAX_CAPTURE_EDGE = 960;
const JPEG_QUALITY = 0.72;
const PREFS_KEY = "yokup.supervisor.preferences.v1";

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
  return {
    x:left + values[0] * renderedWidth,
    y:top + values[1] * renderedHeight,
    width:values[2] * renderedWidth,
    height:values[3] * renderedHeight
  };
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

function boot() {
  const byId = (id) => document.getElementById(id);
  const dom = {
    projectBadge:byId("projectBadge"), projectName:byId("projectName"), stationHeading:byId("stationHeading"),
    liveState:byId("liveState"), stage:byId("stage"), camera:byId("camera"), frame:byId("frameCanvas"),
    overlay:byId("visionOverlay"), cameraEmpty:byId("cameraEmpty"), stageStation:byId("stageStation"),
    stageClock:byId("stageClock"), start:byId("startButton"), stop:byId("stopButton"), scan:byId("scanButton"),
    upload:byId("uploadInput"), uploadLabel:byId("uploadLabel"), runtime:byId("runtimeMessage"), form:byId("stationForm"),
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
    projectId:null, projectName:"", monitoring:false, hiddenPaused:false, analyzing:false,
    stream:null, timer:0, abort:null, lockTask:null, releaseLock:null, conflict:false,
    mediaWidth:16, mediaHeight:9, lastScreens:[], lastStation:null, lastMetrics:null, nextDelay:ANALYSIS_INTERVAL_MS
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
    dom.start.disabled = state.monitoring || !hasProject || state.conflict;
    dom.stop.disabled = !state.monitoring;
    dom.scan.disabled = !state.monitoring || state.hiddenPaused || state.analyzing;
    dom.upload.disabled = state.monitoring || !hasProject || state.analyzing || state.conflict;
    dom.uploadLabel.classList.toggle("disabled", dom.upload.disabled);
    dom.uploadLabel.setAttribute("aria-disabled", String(dom.upload.disabled));
    [dom.stationId, dom.stationLabel, dom.stationLocation, dom.expected, dom.canonical].forEach((input) => { input.disabled = state.monitoring; });
  }

  function applyProject(projectId, project) {
    const next = String(projectId || "").trim() || null;
    if (state.monitoring && state.projectId !== next) stopMonitoring("El proyecto ha cambiado. Reinicia el supervisor para usar el nuevo alcance.");
    state.projectId = next;
    state.projectName = project && (project.name || project.id) || next || "";
    dom.projectBadge.classList.toggle("missing", !next);
    dom.projectName.textContent = next ? (state.projectName || next) : "Selecciona un proyecto";
    dom.projectBadge.title = next ? `project_id: ${next}` : "El supervisor no analiza sin un proyecto explícito";
    state.conflict = false;
    updateButtons();
    if (!next) message("Selecciona el proyecto en la barra superior antes de iniciar.", "error");
    else refreshState({quiet:true});
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
    state.mediaWidth = dom.camera.videoWidth || 16;
    state.mediaHeight = dom.camera.videoHeight || 9;
    dom.stage.classList.remove("has-still");
    dom.stage.classList.add("has-media");
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

  function captureDrawable(drawable, sourceWidth, sourceHeight, showStill) {
    const size = scaleCaptureSize(sourceWidth, sourceHeight, MAX_CAPTURE_EDGE);
    dom.frame.width = size.width;
    dom.frame.height = size.height;
    const context = dom.frame.getContext("2d", {alpha:false, willReadFrequently:true});
    context.drawImage(drawable, 0, 0, size.width, size.height);
    const metrics = computeFrameMetrics(context.getImageData(0, 0, size.width, size.height));
    const image = dom.frame.toDataURL("image/jpeg", JPEG_QUALITY);
    state.mediaWidth = size.width;
    state.mediaHeight = size.height;
    if (showStill) {
      dom.stage.classList.add("has-still", "has-media");
    }
    return {image, metrics, width:size.width, height:size.height};
  }

  function screenTone(screenState) {
    if (["playing", "on", "content"].includes(screenState)) return "healthy";
    if (["off", "black", "no_signal", "error"].includes(screenState)) return "critical";
    return "warning";
  }

  function screenLabel(screenState) {
    return ({playing:"Emitiendo",on:"Encendida",content:"Emitiendo",off:"Apagada",black:"En negro",no_signal:"Sin señal",error:"Error",unknown:"Incierta"})[screenState] || "Incierta";
  }

  function drawBoxes() {
    const rect = dom.stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!rect.width || !rect.height) return;
    dom.overlay.width = Math.round(rect.width * dpr);
    dom.overlay.height = Math.round(rect.height * dpr);
    const context = dom.overlay.getContext("2d");
    context.scale(dpr, dpr);
    context.clearRect(0, 0, rect.width, rect.height);
    state.lastScreens.forEach((screen, index) => {
      const box = boxToPixels(screen.bbox, state.mediaWidth, state.mediaHeight, rect.width, rect.height);
      if (!box) return;
      const tone = screenTone(screen.state);
      const color = tone === "critical" ? "#ff5f6d" : tone === "healthy" ? "#88ffaa" : "#ffd866";
      context.strokeStyle = color;
      context.lineWidth = 1.5;
      context.strokeRect(box.x, box.y, box.width, box.height);
      const label = `${index + 1} · ${screenLabel(screen.state).toUpperCase()} · ${Math.round((Number(screen.confidence) || 0) * 100)}%`;
      context.font = "700 10px ui-monospace, monospace";
      const labelWidth = Math.min(box.width, context.measureText(label).width + 12);
      context.fillStyle = color;
      context.fillRect(box.x, Math.max(0, box.y - 20), labelWidth, 20);
      context.fillStyle = "#02080d";
      context.fillText(label, box.x + 6, Math.max(13, box.y - 6));
    });
  }

  function renderScreens(screens) {
    state.lastScreens = Array.isArray(screens) ? screens : [];
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
      title.textContent = `Pantalla ${index + 1} · ${screenLabel(screen.state)}`;
      const confidence = document.createElement("span");
      confidence.textContent = `${Math.round((Number(screen.confidence) || 0) * 100)}%`;
      head.append(title, confidence);
      const copy = document.createElement("p");
      copy.textContent = screen.description || "Sin detalle adicional.";
      card.append(head, copy);
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
    if (!config.station_id) return null;
    try {
      const response = await fetch(`${API}/supervisor/state?station=${encodeURIComponent(config.station_id)}`, {cache:"no-store"});
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) throw new Error(result.error || `HTTP ${response.status}`);
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
      if (!quiet) message(`No se pudo leer el estado: ${error.message}`, "error");
      return null;
    }
  }

  function speakAlert(result) {
    const key = voiceEventKey(result);
    if (!key || !dom.voice.checked || !("speechSynthesis" in window) || document.hidden) return;
    const storageKey = `yokup.supervisor.spoken:${key}`;
    try { if (sessionStorage.getItem(storageKey)) return; } catch (_) {}
    const text = result.speech && result.speech.text || result.voice;
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = result.speech && result.speech.lang || "es-ES";
    utterance.rate = 0.78;
    utterance.pitch = 0.45;
    utterance.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => /^es(?:-|_)/i.test(voice.lang) && /google|mónica|monica|jorge|paulina|helena/i.test(voice.name))
      || voices.find((voice) => /^es(?:-|_)/i.test(voice.lang)) || null;
    try { sessionStorage.setItem(storageKey, "1"); } catch (_) {}
    window.speechSynthesis.speak(utterance);
  }

  function handleAnalysis(result, frame) {
    if (result.station) renderStation(result.station, {...frame.metrics});
    renderScreens(result.screens || []);
    renderTicket(result.ticket || (result.station && result.station.ticket_id ? {id:result.station.ticket_id} : null));
    dom.model.textContent = String(result.model || "visión IA").replace(/^@cf\//, "");
    if (result.transition === "incident_confirmed") message(`Incidencia ${result.ticket && result.ticket.id || "creada"}. La alarma ha sido confirmada.`, "error");
    else if (result.transition === "incident_reused") message(`Incidencia ${result.ticket && result.ticket.id || "existente"} ya vinculada. No se repite la alarma.`, "error");
    else if (result.transition === "recovery_detected") message("La emisión vuelve a verse. El ticket queda pendiente de verificación humana.", "ok");
    else if (result.reused) message("Esta observación ya estaba procesada; no se repite la alarma.");
    else message("Observación completada. Siguiente lectura en 12 segundos.", "ok");
    speakAlert(result);
  }

  async function submitFrame(frame, continuous) {
    if (state.analyzing) return;
    if (!state.projectId) throw new Error("Selecciona un proyecto antes de analizar.");
    const config = readConfig(true);
    state.analyzing = true;
    state.nextDelay = ANALYSIS_INTERVAL_MS;
    updateButtons();
    dom.stage.classList.add("analyzing");
    setLiveState("scanning", "Analizando");
    message("La visión artificial está leyendo la escena…");
    const controller = new AbortController();
    state.abort = controller;
    try {
      const payload = {
        observation_id:observationId(), captured_at:Date.now(), project_id:state.projectId,
        station_id:config.station_id, label:config.label, location:config.location,
        expected_screens:config.expected_screens, canonical_screen:config.canonical_screen,
        image:frame.image, metrics:frame.metrics
      };
      const response = await fetch(`${API}/supervisor/analyze`, {
        method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(payload), signal:controller.signal
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) {
        const error = new Error(result.error || `HTTP ${response.status}`);
        error.retryAfter = Number(result.retry_after_ms) || 0;
        throw error;
      }
      handleAnalysis(result, frame);
      await refreshState({quiet:true});
    } catch (error) {
      if (error.name !== "AbortError") {
        state.nextDelay = error.retryAfter || ANALYSIS_INTERVAL_MS;
        const friendly = error.message === "scan_too_frequent" ? "Yokup está protegiendo el intervalo entre lecturas." : `No se pudo completar el análisis: ${error.message}`;
        message(friendly, "error");
        if (state.lastStation) setLiveState(state.lastStation.status, statusCopy(state.lastStation.status, state.lastStation.issue_code));
        else setLiveState("warning", "Sin respuesta");
      }
    } finally {
      frame.image = "";
      state.abort = null;
      state.analyzing = false;
      dom.stage.classList.remove("analyzing");
      updateButtons();
      if (continuous && state.monitoring && !state.hiddenPaused && !document.hidden) scheduleNext(state.nextDelay);
    }
  }

  async function analyzeVideo() {
    clearTimer();
    if (!state.monitoring || state.hiddenPaused || state.analyzing || !state.stream) return;
    if (!dom.camera.videoWidth || dom.camera.readyState < 2) {
      message("Esperando el primer fotograma de la cámara…");
      scheduleNext(500);
      return;
    }
    const frame = captureDrawable(dom.camera, dom.camera.videoWidth, dom.camera.videoHeight, false);
    state.lastMetrics = frame.metrics;
    dom.luminance.textContent = `${Math.round(frame.metrics.luminance * 100)}%`;
    dom.darkRatio.textContent = `${Math.round(frame.metrics.dark_ratio * 100)}% de píxeles oscuros`;
    await submitFrame(frame, true);
  }

  async function startMonitoring() {
    if (state.monitoring) return;
    try {
      if (!state.projectId) throw new Error("Selecciona un proyecto en la barra superior.");
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
    if (state.abort) state.abort.abort();
    state.abort = null;
    stopTracks();
    releaseStationLock();
    dom.stage.classList.remove("has-media", "has-still", "analyzing");
    state.lastScreens = [];
    drawBoxes();
    setLiveState(state.lastStation ? state.lastStation.status : "idle", state.lastStation ? statusCopy(state.lastStation.status, state.lastStation.issue_code) : "En espera");
    updateButtons();
    if (!quiet) message(reason);
  }

  async function analyzeUpload(file) {
    if (!file) return;
    try {
      if (!state.projectId) throw new Error("Selecciona un proyecto antes de analizar.");
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
      const frame = captureDrawable(bitmap, bitmap.width || bitmap.naturalWidth, bitmap.height || bitmap.naturalHeight, true);
      if (typeof bitmap.close === "function") bitmap.close();
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
    if (!state.monitoring || state.hiddenPaused) return;
    state.hiddenPaused = true;
    clearTimer();
    stopTracks();
    dom.stage.classList.remove("has-media");
    setLiveState("idle", "En pausa");
    updateButtons();
    message("Supervisión pausada: la pestaña está oculta y la cámara se ha cerrado.");
  }

  async function resumeAfterVisibility() {
    if (!state.monitoring || !state.hiddenPaused) return;
    try {
      state.hiddenPaused = false;
      updateButtons();
      await openCamera();
      message("Cámara reactivada. Reanudando la supervisión…", "ok");
      scheduleNext(350);
    } catch (error) {
      stopMonitoring(`No se pudo reactivar la cámara: ${error.message}`);
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
  applyProject(window.YkProjectScope && window.YkProjectScope.get ? window.YkProjectScope.get() : null, null);
  updateButtons();
  tickClock();

  dom.form.addEventListener("submit", (event) => event.preventDefault());
  dom.form.addEventListener("input", () => { paintConfig(); savePreferences(); });
  dom.stationId.addEventListener("change", () => { state.conflict = false; refreshState(); });
  dom.start.addEventListener("click", startMonitoring);
  dom.stop.addEventListener("click", () => stopMonitoring());
  dom.scan.addEventListener("click", () => { clearTimer(); analyzeVideo(); });
  dom.upload.addEventListener("change", () => analyzeUpload(dom.upload.files && dom.upload.files[0]));
  dom.refresh.addEventListener("click", () => refreshState());
  window.addEventListener("yk:project-change", (event) => applyProject(event.detail && event.detail.project_id, event.detail && event.detail.project));
  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseForVisibility(); else resumeAfterVisibility(); });
  window.addEventListener("pagehide", () => stopMonitoring("", true));
  if (typeof ResizeObserver === "function") new ResizeObserver(drawBoxes).observe(dom.stage);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, {once:true});
  else boot();
}
