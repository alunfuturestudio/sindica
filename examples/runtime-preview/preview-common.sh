#!/usr/bin/env bash
set -euo pipefail

PREVIEW_ROOT="${PREVIEW_ROOT:-/workspaces/.previews}"
PREVIEW_PORT_START="${PREVIEW_PORT_START:-31000}"
PREVIEW_PORT_COUNT="${PREVIEW_PORT_COUNT:-1000}"
PREVIEW_TTL_HOURS="${PREVIEW_TTL_HOURS:-24}"
PREVIEW_HOST="${PREVIEW_HOST:-localhost}"
PREVIEW_HEALTH_PATH="${PREVIEW_HEALTH_PATH:-/}"

preview_key() {
  local issue="$1"
  printf "issue-%s" "$issue"
}

preview_dir() {
  local issue="$1"
  printf "%s/%s" "$PREVIEW_ROOT" "$(preview_key "$issue")"
}

preview_meta_path() {
  local issue="$1"
  printf "%s/preview.json" "$(preview_dir "$issue")"
}

preview_now_epoch() {
  date -u +%s
}

preview_iso_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

preview_iso_from_epoch() {
  date -u -d "@$1" +"%Y-%m-%dT%H:%M:%SZ"
}

preview_expires_epoch() {
  local ttl_hours="${1:-$PREVIEW_TTL_HOURS}"
  echo $(( $(preview_now_epoch) + (ttl_hours * 3600) ))
}

preview_require_issue() {
  local issue="$1"
  if [[ ! "$issue" =~ ^[0-9]+$ ]]; then
    echo "Issue must be a numeric issue number." >&2
    exit 2
  fi
}

preview_process_alive() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

preview_port_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

preview_health_ok() {
  local port="$1"
  if [[ -n "${PREVIEW_HEALTH_COMMAND:-}" ]]; then
    PORT="$port" bash -lc "$PREVIEW_HEALTH_COMMAND" >/dev/null 2>&1
    return
  fi
  curl -fsS --max-time 5 "http://127.0.0.1:${port}${PREVIEW_HEALTH_PATH}" >/dev/null 2>&1
}

preview_read_json_field() {
  local file="$1"
  local field="$2"
  jq -r "$field // empty" "$file" 2>/dev/null || true
}

preview_touch_meta() {
  local issue="$1"
  local meta
  meta="$(preview_meta_path "$issue")"
  [[ -f "$meta" ]] || return 0

  local now expires expires_iso tmp
  now="$(preview_iso_now)"
  expires="$(preview_expires_epoch)"
  expires_iso="$(preview_iso_from_epoch "$expires")"
  tmp="$(mktemp)"
  jq \
    --arg now "$now" \
    --arg expiresAt "$expires_iso" \
    --argjson expiresAtEpoch "$expires" \
    '.lastTouchedAt = $now | .expiresAt = $expiresAt | .expiresAtEpoch = $expiresAtEpoch' \
    "$meta" >"$tmp"
  mv "$tmp" "$meta"
}

preview_release_port_lock() {
  local port="$1"
  rm -rf "$PREVIEW_ROOT/ports/${port}.lock"
}

preview_find_issue_by_port() {
  local port="$1"
  local lock="$PREVIEW_ROOT/ports/${port}.lock/issue"
  [[ -f "$lock" ]] && cat "$lock"
}

preview_alloc_port() {
  local issue="$1"
  local start="$PREVIEW_PORT_START"
  local count="$PREVIEW_PORT_COUNT"
  local preferred=$(( start + (issue % count) ))

  mkdir -p "$PREVIEW_ROOT/ports"

  local offset port lock lock_issue
  for offset in $(seq 0 $(( count - 1 ))); do
    port=$(( start + ((preferred - start + offset) % count) ))
    lock="$PREVIEW_ROOT/ports/${port}.lock"

    if mkdir "$lock" 2>/dev/null; then
      printf "%s\n" "$issue" >"$lock/issue"
      preview_iso_now >"$lock/created_at"
      printf "%s\n" "$port"
      return 0
    fi

    lock_issue="$(preview_find_issue_by_port "$port" || true)"
    if [[ "$lock_issue" == "$issue" ]]; then
      printf "%s\n" "$port"
      return 0
    fi

    if ! preview_port_listening "$port"; then
      rm -rf "$lock"
      if mkdir "$lock" 2>/dev/null; then
        printf "%s\n" "$issue" >"$lock/issue"
        preview_iso_now >"$lock/created_at"
        printf "%s\n" "$port"
        return 0
      fi
    fi
  done

  echo "No free preview port found in ${start}-$(( start + count - 1 ))." >&2
  exit 1
}
