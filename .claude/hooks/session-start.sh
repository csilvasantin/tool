#!/bin/bash
# SessionStart hook — bootstrap del repo en cualquier máquina/sesión.
# Contenedores efímeros: cada sesión clona de cero, así que dejamos el entorno
# listo (deps del Worker) automáticamente. Idempotente y no interactivo.
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

# API (Cloudflare Worker): instala dependencias de Node (wrangler).
# npm install (no ci) para aprovechar el cacheo del contenedor tras el hook.
if [ -f "$ROOT/api/package.json" ]; then
  echo "· session-start: instalando dependencias de api/ …"
  (cd "$ROOT/api" && npm install --no-audit --no-fund)
fi

echo "· session-start: entorno listo."
