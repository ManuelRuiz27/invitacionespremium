#!/usr/bin/env sh
set -eu

command_name="${1:-start}"
host_ip="${LAN_HOST_IP:-}"
project_name="invitacionespremium-docs"
repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compose_file="$repository_root/compose.yaml"

usage() {
  printf '%s\n' 'Usage: ./run/local-lan.sh [start|stop|status|logs|smoke]'
  printf '%s\n' 'Set LAN_HOST_IP to select a network interface explicitly.'
}

resolve_lan_ip() {
  if [ -n "$host_ip" ]; then
    printf '%s\n' "$host_ip"
    return
  fi

  if command -v ip >/dev/null 2>&1; then
    ip route get 1.1.1.1 2>/dev/null | awk '/src/ { for (index = 1; index <= NF; index++) if ($index == "src") { print $(index + 1); exit } }'
    return
  fi

  if command -v route >/dev/null 2>&1; then
    route -n get default 2>/dev/null | awk '/interface:/ { interface = $2 } END { if (interface != "") system("ipconfig getifaddr " interface) }'
    return
  fi

  return 1
}

validate_ipv4() {
  case "$1" in
    ''|0.0.0.0|127.*|169.254.*) return 1 ;;
    *[!0-9.]*) return 1 ;;
  esac
  printf '%s\n' "$1" | awk -F. 'NF == 4 { for (index = 1; index <= 4; index++) if ($index < 0 || $index > 255) exit 1; exit 0 } { exit 1 }'
}

configure_environment() {
  lan_ip="$1"
  origins=''
  for port in 5173 5174 5175 5176; do
    origins="${origins}${origins:+,}http://localhost:${port},http://127.0.0.1:${port},http://${lan_ip}:${port}"
  done

  export CORS_ORIGINS="$origins"
  export PUBLIC_INVITATION_BASE_URL="http://${lan_ip}:5173/invitacion"
  export VITE_API_BASE_URL="http://${lan_ip}:3000/api/v1"
  export VITE_SOCKET_URL="http://${lan_ip}:3000"
  export VITE_CLIENT_APP_URL="http://${lan_ip}:5173"
  export VITE_ADMIN_APP_URL="http://${lan_ip}:5174"
  export VITE_SCANNER_APP_URL="http://${lan_ip}:5175"
  export VITE_LANDING_URL="http://${lan_ip}:5176"
  export VITE_APP_URL="http://${lan_ip}:5176"
}

compose() {
  docker compose --project-name "$project_name" --file "$compose_file" "$@"
}

smoke() {
  lan_ip="$1"
  api_base="http://${lan_ip}:3000/api/v1"
  for attempt in $(seq 1 90); do
    if curl --fail --silent --show-error "$api_base/health" >/dev/null; then
      break
    fi
    if [ "$attempt" -eq 90 ]; then
      printf '%s\n' "Timed out waiting for $api_base/health" >&2
      exit 1
    fi
    sleep 2
  done

  for port in 5173 5174 5175 5176; do
    curl --fail --silent --show-error "http://${lan_ip}:${port}" | grep -q 'id="root"'
  done

  for port in 5173 5174 5175 5176; do
    origin="http://${lan_ip}:${port}"
    curl --fail --silent --show-error -H "Origin: ${origin}" -D - -o /dev/null "$api_base/health" |
      tr -d '\r' |
      grep -qi "^access-control-allow-origin: ${origin}$"
  done
}

case "$command_name" in
  start)
    lan_ip=$(resolve_lan_ip || true)
    if ! validate_ipv4 "$lan_ip"; then
      printf '%s\n' 'No reachable IPv4 address was found. Set LAN_HOST_IP explicitly.' >&2
      exit 1
    fi
    configure_environment "$lan_ip"
    compose up --build --detach
    smoke "$lan_ip"
    printf '\nLocal network URL: http://%s:5173\nAdmin:             http://%s:5174\nScanner:           http://%s:5175\nLanding:           http://%s:5176\nAPI health:        http://%s:3000/api/v1/health\n' "$lan_ip" "$lan_ip" "$lan_ip" "$lan_ip" "$lan_ip"
    printf '%s\n' 'For mobile Scanner camera tests, use HTTPS; browsers do not grant camera access to an HTTP LAN origin.'
    ;;
  smoke)
    lan_ip=$(resolve_lan_ip || true)
    validate_ipv4 "$lan_ip" || { printf '%s\n' 'Set LAN_HOST_IP to a reachable IPv4 address.' >&2; exit 1; }
    smoke "$lan_ip"
    ;;
  stop) compose down ;;
  status) compose ps ;;
  logs) compose logs --follow ;;
  *) usage; exit 1 ;;
esac
