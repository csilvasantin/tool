#!/usr/bin/env bash
# Publica y vigila relojes de Yokup con los sonidos canónicos de macOS.
# publish lee el JSON de stdin, toca Glass al publicar y deja un watcher que
# toca Ping cuando Carlos elige o vence el reloj.
set -euo pipefail

API="${YOKUP_DECISIONS_API:-https://yokup-rtc.csilvasantin.workers.dev/decisions}"
sound() { /usr/bin/afplay "/System/Library/Sounds/$1.aiff" >/dev/null 2>&1 || true; }

watch_decision() {
  local id="$1" response status
  while :; do
    response="$(/usr/bin/curl -fsS --max-time 15 "$API/$id" || true)"
    status="$(printf '%s' "$response" | /usr/bin/jq -r '.status // empty' 2>/dev/null || true)"
    case "$status" in
      decided|expired) sound Ping; exit 0 ;;
      pending) sleep 5 ;;
      *) sleep 5 ;;
    esac
  done
}

case "${1:-}" in
  publish)
    payload="$(/bin/cat)"
    response="$(printf '%s' "$payload" | /usr/bin/curl -fsS --max-time 20 -H 'content-type: application/json' --data-binary @- "$API")"
    id="$(printf '%s' "$response" | /usr/bin/jq -r 'select(.ok == true) | .id' 2>/dev/null || true)"
    if [ -z "$id" ]; then printf '%s\n' "$response" >&2; exit 1; fi
    sound Glass
    /usr/bin/nohup "$0" watch "$id" >/dev/null 2>&1 &
    printf '%s\n' "$response"
    ;;
  watch) [ -n "${2:-}" ] || { echo "id requerido" >&2; exit 64; }; watch_decision "$2" ;;
  *) echo "uso: $0 publish < decision.json | $0 watch DEC-..." >&2; exit 64 ;;
esac
