#!/usr/bin/env bash
# Ejecutar explícitamente en cada máquina ANTES de desplegar el Worker: los
# clientes nuevos son compatibles con el API viejo; el Worker nuevo rechaza
# clientes antiguos sin owner/captured_at/evidence_kind.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${ADMIRA_VAULT_DIR:-/Users/csilvasantin/Claude/admira-vault}"
[ -f "$DEST/persona-id.sh" ] || { echo "destino no canónico: falta $DEST/persona-id.sh" >&2; exit 2; }
TOOLS=(quien-ejecuta.sh mission-evidence.sh progreso-cli.sh bot-inbox-informe.sh mission-proof.sh bot-inbox-paso.sh bot-inbox-claim.sh bot-inbox-ack.sh)
for name in "${TOOLS[@]}"; do
  install -m 0755 "$HERE/$name" "$DEST/$name"
  cmp -s "$HERE/$name" "$DEST/$name" || { echo "copia no verificable: $name" >&2; exit 3; }
  [ -x "$DEST/$name" ] || { echo "cliente no ejecutable: $name" >&2; exit 3; }
done
printf 'Herramientas de evidencia instaladas en %s\n' "$DEST"
if [ "${YOKUP_VERIFY_IDENTITY:-0}" = "1" ]; then
  IDENTITY="$(ADMIRA_VAULT_DIR="$DEST" bash "$DEST/quien-ejecuta.sh")" || {
    echo "falló la verificación de identidad post-install" >&2; exit 4;
  }
  printf 'Identidad verificada: %s\n' "$IDENTITY"
fi
