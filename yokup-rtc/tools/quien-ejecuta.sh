#!/usr/bin/env bash
# Identidad única para Desktop, CLI y subagentes.
# Salida: PERSONA HOST OWNER RUNTIME. El rol por defecto es infra (cierre);
# YOKUP_ROLE=main|sub|infra permite usar el mismo helper para todo el ciclo.
set -euo pipefail
VAULT_DIR="${ADMIRA_VAULT_DIR:-/Users/csilvasantin/Claude/admira-vault}"
. "$VAULT_DIR/persona-id.sh"

# Los procesos lanzados desde Desktop conservan estas señales aunque el detector
# por `ps` esté limitado por sandbox. Nunca se cae a «infraagente» genérico.
RUNTIME="${YOKUP_RUNTIME:-${RUNTIME:-}}"
if [ -z "$RUNTIME" ]; then
  if [ -n "${CODEX_THREAD_ID:-}" ] || [ -n "${CODEX_CI:-}" ]; then RUNTIME="Codex"
  elif [ -n "${CLAUDECODE:-}" ] || [ -n "${CLAUDE_CODE:-}" ]; then RUNTIME="Claude"
  elif [ -n "${GROK_SESSION_ID:-}" ]; then RUNTIME="Grok"
  fi
fi
PERSONA="${YOKUP_PERSONA:-${PERSONA:-}}"
if [ -z "$PERSONA" ] && [ -n "$RUNTIME" ]; then
  PERSONA="$(python3 "$VAULT_DIR/resolve-persona.py" "$RUNTIME" persona 2>/dev/null || true)"
fi
[ -n "$RUNTIME" ] && [ -n "$PERSONA" ] || { echo "identidad indeterminada: define YOKUP_RUNTIME y YOKUP_PERSONA" >&2; exit 4; }

ROLE="${YOKUP_ROLE:-infra}"
case "$ROLE" in main|sub|infra) ;; *) echo "YOKUP_ROLE debe ser main, sub o infra" >&2; exit 2;; esac
HOST="${YOKUP_HOST:-}"
if [ -z "$HOST" ]; then
  if [ -n "${TMUX:-}" ] || [ -n "${CODEX_CLI:-}" ] || [ -n "${CLAUDE_CODE:-}" ]; then HOST="cli"; else HOST="app"; fi
fi

KEY="$(printf '%s' "$MACHINE" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]')"
case "$KEY" in
  *macmini*) SUFFIX="MacMini" ;;
  *macbookpro*14*|*mbp*14*) SUFFIX="MBP14" ;;
  *macbookpro*16*|*mbp*16*) SUFFIX="MBP16" ;;
  *macbookairazul*|*mbaazul*) SUFFIX="MBAAzul" ;;
  *macbookairrosa*|*mbarosa*) SUFFIX="MBARosa" ;;
  *macbookaircrema*|*mbacrema*) SUFFIX="MBACrema" ;;
  *macbookairplata*|*mbaplata*) SUFFIX="MBAPlata" ;;
  *macbookair16*|*mba16*) SUFFIX="MBA16" ;;
  *zenbook*) SUFFIX="Zenbook" ;;
  *dgx*spark*|*dgx*) SUFFIX="DGX" ;;
  *thinkstation*|*pgx*) SUFFIX="PGX" ;;
  *) echo "máquina sin apellido canónico: $MACHINE" >&2; exit 3 ;;
esac

BASE="$(PERSONA="$PERSONA" python3 -c 'import os,unicodedata; p=os.environ["PERSONA"]; p="".join(c for c in unicodedata.normalize("NFD",p) if unicodedata.category(c)!="Mn"); print("Smith" if p=="Agente Smith" else p)')"
case "$ROLE" in main) PREFIX="";; sub) PREFIX="Sub";; infra) PREFIX="Infra";; esac
OWNER="${PREFIX}${BASE}${SUFFIX}"
printf '%s %s %s %s\n' "$BASE" "$HOST" "$OWNER" "$RUNTIME"
