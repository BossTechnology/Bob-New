# shellcheck shell=bash
# Lo que comparten deploy.sh y rollback.sh. No se corre solo.
#
# Variables (todas con su valor de caja por omisión; el banco las cambia):
#   BOB_RAIZ               /opt/bob: compose.yml, .env, config/, secrets/, atestaciones/
#   BOB_COMPROBAR_ATESTACION  /opt/bzzz/scripts/comprobar-atestacion-bob.sh (Bzzz #407)
#   BOB_FIRMANTES          /opt/bzzz/config/bob/firmantes_imagen
#   BOB_ESPERA_SALUD       segundos que se espera a que el contenedor esté sano (180)
#   BOB_URL_SALUD          opcional: URL por Traefik que tiene que contestar después del cambio
#   BOB_URL_SALUD_CODIGOS  códigos que valen para esa URL ("200 302 303 307 401": la puerta
#                          redirige o niega sin sesión, y eso ya prueba que Traefik llega a BOb)
#   BOB_URL_SALUD_RESOLVER opcional, host:puerto:ip para curl --resolve (solo el banco)
#   BOB_PROYECTO           nombre del proyecto de compose (bob)

BOB_RAIZ=${BOB_RAIZ:-/opt/bob}
BOB_COMPOSE=${BOB_COMPOSE:-$BOB_RAIZ/compose.yml}
BOB_ENV=${BOB_ENV:-$BOB_RAIZ/.env}
BOB_PROYECTO=${BOB_PROYECTO:-bob}
BOB_COMPROBAR_ATESTACION=${BOB_COMPROBAR_ATESTACION:-/opt/bzzz/scripts/comprobar-atestacion-bob.sh}
BOB_FIRMANTES=${BOB_FIRMANTES:-/opt/bzzz/config/bob/firmantes_imagen}
BOB_ESPERA_SALUD=${BOB_ESPERA_SALUD:-180}
BOB_URL_SALUD_CODIGOS=${BOB_URL_SALUD_CODIGOS:-200 302 303 307 401}
AQUI=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BOB_AISLAMIENTO=${BOB_AISLAMIENTO:-$AQUI/comprobar-aislamiento.sh}
export BOB_RAIZ BOB_COMPOSE BOB_ENV BOB_PROYECTO

say() { printf '%s\n' "$*" >&2; }
no_empieza() { echo "no-empieza: $1"; exit 2; }

# Componente: web o feeder. Fija el contenedor, el servicio y las claves de .env.
componente() {
  case "$1" in
    web)    SERVICIO=bob-web;    CLAVE=BOB_WEB;    PERFIL=() ;;
    feeder) SERVICIO=bob-feeder; CLAVE=BOB_FEEDER; PERFIL=(--profile feeder) ;;
    *) no_empieza "componente desconocido «$1» (web o feeder)" ;;
  esac
}

compose() { docker compose -p "$BOB_PROYECTO" -f "$BOB_COMPOSE" --env-file "$BOB_ENV" "${PERFIL[@]}" "$@"; }

# Lee una clave de .env (la última gana). Sin eval: .env no es un guion.
leer() { [ -f "$BOB_ENV" ] && sed -n "s/^$1=//p" "$BOB_ENV" | tail -1; }

# Escribe claves en .env de una vez, con un fichero nuevo y mv: o queda el viejo o el nuevo.
escribir() {
  local tmp; tmp=$(mktemp "$BOB_ENV.XXXXXX")
  [ -f "$BOB_ENV" ] && cat "$BOB_ENV" > "$tmp"
  while [ "$#" -ge 2 ]; do
    local k=$1 v=$2; shift 2
    grep -v "^$k=" "$tmp" > "$tmp.b" || true; mv "$tmp.b" "$tmp"
    [ -n "$v" ] && printf '%s=%s\n' "$k" "$v" >> "$tmp"
  done
  chmod 644 "$tmp"; mv "$tmp" "$BOB_ENV"
}

es_id() { [[ "$1" =~ ^sha256:[0-9a-f]{64}$ ]]; }

# La atestación de una imagen: <fichero> y <fichero>.sig, comprobados con el guion de Bzzz.
# Imprime su línea; devuelve su rc (0 atestada, 1 no, 2 no medible).
atestar() {
  local at=$1 id=$2
  [ -x "$BOB_COMPROBAR_ATESTACION" ] || { echo "no-medible: no encuentro $BOB_COMPROBAR_ATESTACION"; return 2; }
  "$BOB_COMPROBAR_ATESTACION" "$at" "$BOB_FIRMANTES" "$id"
}

# Espera a que el contenedor del servicio corra la imagen pedida y esté sano.
esperar_salud() {
  local id=$1 fin=$(( $(date +%s) + BOB_ESPERA_SALUD )) img est
  while [ "$(date +%s)" -lt "$fin" ]; do
    img=$(docker inspect -f '{{.Image}}' "$SERVICIO" 2>/dev/null || true)
    est=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$SERVICIO" 2>/dev/null || true)
    if [ "$img" = "$id" ]; then
      case "$est" in
        healthy) return 0 ;;
        running) [ "$SERVICIO" = bob-feeder ] && return 0 ;;   # el feeder no declara healthcheck todavía
        unhealthy|exited|dead) say "  $SERVICIO: $est"; return 1 ;;
      esac
    fi
    sleep 3
  done
  say "  $SERVICIO: no quedó sano en ${BOB_ESPERA_SALUD}s (estado «${est:-sin contenedor}»)"
  return 1
}

# La URL por Traefik, si se pidió. Reintenta: Traefik tarda unos segundos en ver el contenedor sano.
salud_por_traefik() {
  [ -n "${BOB_URL_SALUD:-}" ] || return 0
  [ "$SERVICIO" = bob-web ] || return 0
  local r=() c i
  [ -n "${BOB_URL_SALUD_RESOLVER:-}" ] && r=(--resolve "$BOB_URL_SALUD_RESOLVER")
  for i in $(seq 1 10); do
    c=$(curl -sk -o /dev/null -m 5 -w '%{http_code}' "${r[@]}" "$BOB_URL_SALUD" || true)
    case " $BOB_URL_SALUD_CODIGOS " in *" $c "*) say "  por Traefik: $c"; return 0 ;; esac
    sleep 2
  done
  say "  por Traefik: $c en $BOB_URL_SALUD (valen: $BOB_URL_SALUD_CODIGOS)"
  return 1
}

# Pone una imagen (ya atestada) en .env, levanta y comprueba. 0 sano, 1 no.
poner() {
  local id=$1 at=$2
  escribir "${CLAVE}_IMAGEN" "$id" "${CLAVE}_ATESTACION" "$at"
  compose up -d --no-build --pull never "$SERVICIO" >&2 || { say "  compose up falló"; return 1; }
  esperar_salud "$id" || return 1
  salud_por_traefik || return 1
  local ais; ais=$("$BOB_AISLAMIENTO"); local rc=$?
  say "  aislamiento: $ais"
  [ "$rc" = 0 ]
}
