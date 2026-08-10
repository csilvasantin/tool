const SIMULATION_LOCATIONS = Object.freeze([
  "Gràcia · Barcelona", "Madrid Centro", "Eixample · Barcelona",
  "Sant Andreu · Barcelona", "Sants · Barcelona"
]);

export function newSimulationTicket(random = Math.random) {
  const raw = Number(random());
  const seed = Number.isFinite(raw) ? Math.max(0, Math.min(raw, 0.999999999)) : 0;
  const token = Math.floor(seed * 60_466_176).toString(36).padStart(5, "0").slice(-5);
  return {
    screen: `demo-${token}`,
    loc: SIMULATION_LOCATIONS[Math.floor(seed * SIMULATION_LOCATIONS.length)],
    role: "DOOH",
    age: 300,
    source: "simulation"
  };
}

export function ticketEvidenceFor(source) {
  const simulation = source === "simulation";
  return {
    subject: simulation ? "SIMULACIÓN · Pantalla sin señal de emisión" : "Pantalla sin señal de emisión",
    eventAuthor: simulation ? "Simulador Yokup" : "Agente IoT",
    eventText: simulation
      ? "SIMULACIÓN: caída de pantalla creada manualmente para comprobar el flujo de incidencias."
      : "Incidencia detectada automáticamente: pantalla sin señal de emisión (proof-of-play caído).",
    triageContext: simulation
      ? "Es una SIMULACIÓN operativa, no una caída observada en una pantalla real. "
      : ""
  };
}
