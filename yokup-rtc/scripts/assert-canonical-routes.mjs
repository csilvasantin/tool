#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const file = process.argv[2];
if (!file) {
  console.error("uso: node scripts/assert-canonical-routes.mjs <worker.js>");
  process.exit(2);
}

const source = await readFile(file, "utf8");
const required = [
  ["GET /fleet/onidle-state", /url\.pathname\s*===\s*["']\/fleet\/onidle-state["']\s*&&\s*req\.method\s*===\s*["']GET["']/],
  ["GET /fleet/cli", /url\.pathname\s*===\s*["']\/fleet\/cli["']\s*&&\s*req\.method\s*===\s*["']GET["']/],
  ["Supervisor autenticado", /url\.pathname\.startsWith\(["']\/supervisor\/["']\)[\s\S]{0,260}requireAuth\([^,]+,\s*req\)[\s\S]{0,1200}handleSupervisorRequest/]
];
const unauthenticatedSupervisorHandler = /url\.pathname\.startsWith\(["']\/supervisor\/["']\)(?:(?!url\.pathname\.startsWith\(["']\/supervisor\/["']\)|requireAuth\([^,]+,\s*req\))[\s\S])*?handleSupervisorRequest/;
if (unauthenticatedSupervisorHandler.test(source)) {
  console.error(`Deploy bloqueado: ${file} contiene un Supervisor sin autenticación previa.`);
  process.exit(1);
}
const missing = required.filter(([, pattern]) => !pattern.test(source)).map(([name]) => name);
if (missing.length) {
  console.error(`Deploy bloqueado: ${file} no contiene ${missing.join(" ni ")}.`);
  process.exit(1);
}
console.log(`  ✓ rutas canónicas presentes en ${file}`);
