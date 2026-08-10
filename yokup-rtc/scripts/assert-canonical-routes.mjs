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
  ["GET /fleet/cli", /url\.pathname\s*===\s*["']\/fleet\/cli["']\s*&&\s*req\.method\s*===\s*["']GET["']/]
];
const missing = required.filter(([, pattern]) => !pattern.test(source)).map(([name]) => name);
if (missing.length) {
  console.error(`Deploy bloqueado: ${file} no contiene ${missing.join(" ni ")}.`);
  process.exit(1);
}
console.log(`  ✓ rutas canónicas presentes en ${file}`);
