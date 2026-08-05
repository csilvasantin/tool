#!/usr/bin/env bash
# Ejecutar explícitamente en cada máquina ANTES de desplegar el Worker: los
# clientes nuevos son compatibles con el API viejo; el Worker nuevo rechaza
# clientes antiguos sin owner/captured_at/evidence_kind.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${ADMIRA_VAULT_DIR:-/Users/csilvasantin/Claude/admira-vault}"
[ -f "$DEST/persona-id.sh" ] || { echo "destino no canónico: falta $DEST/persona-id.sh" >&2; exit 2; }
for name in quien-ejecuta.sh mission-evidence.sh progreso-cli.sh bot-inbox-informe.sh mission-proof.sh bot-inbox-paso.sh bot-inbox-claim.sh bot-inbox-ack.sh; do
  install -m 0755 "$HERE/$name" "$DEST/$name"
done
printf 'Herramientas de evidencia instaladas en %s\n' "$DEST"
