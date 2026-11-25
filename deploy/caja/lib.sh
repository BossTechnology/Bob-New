# shellcheck shell=bash
# Lo que comparten deploy.sh y rollback.sh. No se corre solo.
#
# Las rutas, el comprobador de atestaciones, sus firmantes y la imagen de psql son fijos en una caja (fijos.sh).
# Lo único que se ajusta desde el entorno es cuánto se espera: BOB_ESPERA_SALUD (segundos, 180).

AQUI=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIJOS_NO=no-empieza
# shellcheck source=deploy/caja/fijos.sh
. "$AQUI/fijos.sh"
BOB_ESPERA_SALUD=${BOB_ESPERA_SALUD:-180}
BOB_AISLAMIENTO=$AQUI/comprobar-aislamiento.sh

say() { printf '%s\n' "$*" >&2; }
no_empieza() { echo "no-empieza: $1"; exit 2; }

# Componente: web o feeder. Fija el contenedor, el servicio, las claves de .env y la etiqueta que puede traer su tar.
componente() {
  case "$1" in
    web)    SERVICIO=bob-web;    CLAVE=BOB_WEB;    PERFIL=() ;;
    feeder) SERVICIO=bob-feeder; CLAVE=BOB_FEEDER; PERFIL=(--profile feeder) ;;
    *) no_empieza "componente desconocido «$1» (web o feeder)" ;;
  esac
}

compose() { docker compose -p "$BOB_PROYECTO" -f "$BOB_COMPOSE" --env-file "$BOB_ENV" "${PERFIL[@]}" "$@"; }

# Lee una clave de un fichero KEY=VALUE (la última gana). Sin eval: no son guiones.
clave_de() { [ -f "$2" ] && sed -n "s/^$1=//p" "$2" | tail -1; }
leer() { clave_de "$1" "$BOB_ENV"; }

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

# Lee un tar de `docker save` SIN cargarlo y, si es aceptable, imprime «<config> <objetivo>»:
#   config    sha256 de la configuración de su única imagen. Es LA identidad de la imagen: lo que firma la atestación,
#             igual en cualquier almacén de docker.
#   objetivo  el digest al que apunta index.json, que es el .Id que le da docker con el almacén de containerd (con
#             overlay2, .Id es la config). Si el tar no trae index.json, la config.
# Se niega si trae más de una imagen o si nombra algo que no sea <servicio>:<12 hex>, la etiqueta que pone
# construir-imagen-bob.sh: un tar así podría mover, al cargarlo, una etiqueta que la caja usa sin digest
# (bzzz-conector:local…), aunque su atestación no case después. Con un tercer argumento «sin-etiquetas» no mira
# las etiquetas: es para un tar que esta caja acaba de sacar de su propio docker (config_de).
id_del_tar() {
  python3 -I - "$1" "$SERVICIO" "${2:-}" <<'PY'
import hashlib, json, re, sys, tarfile
ruta, servicio, modo = sys.argv[1:4]
def no(m): print(m); sys.exit(1)
nombre = re.compile(rf"^(docker\.io/library/)?{re.escape(servicio)}:[0-9a-f]{{12}}$")
try:
    t = tarfile.open(ruta)
    leer = lambda n: t.extractfile(t.getmember(n)).read()
    man = json.loads(leer("manifest.json"))
except Exception as e:
    no(f"no es un tar de docker save legible ({e.__class__.__name__})")
if not isinstance(man, list) or len(man) != 1:
    no(f"trae {len(man) if isinstance(man, list) else '?'} imágenes; tiene que traer una")
m = man[0]
cfg = m.get("Config", "")
hexd = re.search(r"([0-9a-f]{64})(\.json)?$", cfg)
if not hexd:
    no("la configuración de la imagen no tiene nombre de digest")
try:
    real = hashlib.sha256(leer(cfg)).hexdigest()
except KeyError:
    no("falta la configuración de la imagen en el tar")
if real != hexd.group(1):
    no("la configuración del tar no casa con su nombre")
malas = [x for x in (m.get("RepoTags") or []) if not nombre.match(x)]
try:
    repos = json.loads(leer("repositories"))
except KeyError:
    repos = {}
malas += [f"{r}:{tg}" for r, tags in repos.items() for tg in tags if not nombre.match(f"{r}:{tg}")]
try:
    idx = json.loads(leer("index.json"))
except KeyError:
    idx = {"manifests": []}
if modo == "sin-etiquetas":
    malas = []
if len(idx.get("manifests", [])) > 1:
    no(f"index.json trae {len(idx['manifests'])} imágenes; tiene que traer una")
for d in idx.get("manifests", []):
    n = (d.get("annotations") or {}).get("io.containerd.image.name")
    if n and not nombre.match(n) and modo != "sin-etiquetas":
        malas.append(n)
    # index.json apunta a un manifiesto o a un índice (multiplataforma, o con atestaciones de buildx). De un índice
    # se sigue el único manifiesto linux/amd64. Cada blob tiene que casar con su digest.
    def blob(dg):
        try:
            b = leer("blobs/sha256/" + dg.split(":", 1)[1])
        except KeyError:
            no(f"index.json apunta a {dg}, que no está en el tar")
        if "sha256:" + hashlib.sha256(b).hexdigest() != dg:
            no(f"el blob {dg} no casa con su digest")
        return json.loads(b)
    mf = blob(d["digest"])
    if "manifests" in mf:
        amd = [x for x in mf["manifests"] if (x.get("platform") or {}).get("os") == "linux"
               and (x.get("platform") or {}).get("architecture") == "amd64"]
        if len(amd) != 1:
            no(f"el índice trae {len(amd)} manifiestos linux/amd64; tiene que traer uno")
        mf = blob(amd[0]["digest"])
    if mf.get("config", {}).get("digest") != "sha256:" + real:
        no("index.json apunta a otra configuración que manifest.json")
if malas:
    no("nombra etiquetas que no son de " + servicio + ": " + ", ".join(sorted(set(malas))))
objetivo = idx["manifests"][0]["digest"] if idx.get("manifests") else "sha256:" + real
if not re.fullmatch(r"sha256:[0-9a-f]{64}", objetivo):
    no("index.json apunta a un digest que no es sha256")
print("sha256:" + real, objetivo)
PY
}

# Carpeta de root bajo /opt/bob donde deploy.sh copia lo que recibe antes de mirarlo: lo que se comprueba es lo que
# se carga, aunque alguien cambie el fichero de origen entre medias.
carpeta_privada() {
  local d=$BOB_RAIZ/entrega
  mkdir -p "$d" && chmod 700 "$d" || return 1
  [ -O "$d" ] && [ ! -L "$d" ] || { say "  $d no es de $(id -un) o es un enlace"; return 1; }
  mktemp -d "$d/XXXXXX"
}

# La referencia local de una imagen ya cargada: el .Id que le da docker, que es la config (overlay2) o el objetivo
# (containerd). Imprime el que exista con ese mismo .Id; falla si no está ninguno.
ref_cargada() {
  local c
  for c in "$@"; do
    [ "$(docker image inspect -f '{{.Id}}' "$c" 2>/dev/null)" = "$c" ] && { echo "$c"; return 0; }
  done
  return 1
}

# La config (la identidad atestada) de una imagen en el disco, por su referencia local. Con overlay2 la referencia
# YA es la config. Con containerd no hay forma de preguntarla: se saca la imagen con docker save y se lee del tar.
config_de() {
  local ref=$1 d out
  if ! docker info -f '{{json .DriverStatus}}' 2>/dev/null | grep -q 'io.containerd.snapshotter'; then
    [ "$(docker image inspect -f '{{.Id}}' "$ref" 2>/dev/null)" = "$ref" ] && echo "$ref"; return
  fi
  d=$(carpeta_privada) || return 1
  docker save -o "$d/i.tar" "$ref" 2>/dev/null && out=$(id_del_tar "$d/i.tar" sin-etiquetas) && echo "${out%% *}"
  rm -rf "$d"
}

sha256_de() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

# La atestación de una imagen: <fichero> y <fichero>.sig, comprobados con el guion de Bzzz (#407, #454). Ese guion
# necesita a su lado scripts/id-de-imagen.sh (llegan juntos a /opt/bzzz/scripts por rsync) y recibe el servicio.
# Imprime su línea; devuelve su rc (0 atestada, 1 no, 2 no medible).
atestar() {
  local at=$1 id=$2
  [ -n "$at" ] && [ -f "$at" ] || { echo "no-atestada: no hay atestación guardada (${at:-ninguna})"; return 1; }
  [ -x "$BOB_COMPROBAR_ATESTACION" ] || { echo "no-medible: no encuentro $BOB_COMPROBAR_ATESTACION"; return 2; }
  # La atestación nombra el servicio (construir-imagen-bob.sh lo firma): una imagen de bob-web no se pone como feeder.
  local s; s=$(clave_de servicio "$at")
  [ "$s" = "$SERVICIO" ] || { echo "no-atestada: la atestación es del servicio «${s:-ninguno}», no de $SERVICIO"; return 1; }
  [ -r "$(dirname "$BOB_COMPROBAR_ATESTACION")/id-de-imagen.sh" ] \
    || { echo "no-medible: falta id-de-imagen.sh junto a $BOB_COMPROBAR_ATESTACION"; return 2; }
  "$BOB_COMPROBAR_ATESTACION" "$at" "$BOB_FIRMANTES" "$id" "$SERVICIO"
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

# Por Traefik de la caja, obligatorio para bob-web: https://<BOB_HOST>/api/health sin sesión, por el 443 del propio
# servidor. Tiene que contestar la PUERTA (redirige o niega): eso prueba que el router existe (Traefik no enruta a
# un contenedor que no está sano) y que puerta-apps@file va delante. Un 200 es un fallo de seguridad (rc 3): la
# puerta no está, y se trata como el aislamiento roto.
# Se fija al empezar (no a mitad del cambio): en una caja no se puede apuntar a otro sitio desde el entorno.
fijar_url_salud() {
  local host; host=$(leer BOB_HOST)
  [ -n "$host" ] || no_empieza "no hay BOB_HOST en $BOB_ENV"
  fijo BOB_URL_SALUD "https://$host/api/health"
  fijo BOB_URL_SALUD_RESOLVER "$host:443:127.0.0.1"
}
salud_por_traefik() {
  [ "$SERVICIO" = bob-web ] || return 0
  local c i
  for i in $(seq 1 15); do
    c=$(curl -sk -o /dev/null -m 5 -w '%{http_code}' --resolve "$BOB_URL_SALUD_RESOLVER" "$BOB_URL_SALUD" || true)
    case "$c" in
      302|303|307|401) say "  por Traefik: $c (contesta la puerta)"; return 0 ;;
      200) say "  por Traefik: 200 sin sesión: puerta-apps@file NO está delante de $SERVICIO"; return 3 ;;
    esac
    sleep 2
  done
  say "  por Traefik: $c en $BOB_URL_SALUD (se esperaba la puerta: 302, 303, 307 o 401)"
  return 1
}

# Para todo lo de BOb. Lo que se usa cuando el aislamiento falla: un fallo de seguridad no se queda sirviendo.
# Para por id todo lo que descubre comprobar-aislamiento.sh (nombre bob-*, proyecto de compose bob o etiqueta
# bob.vecina), no solo los servicios del compose: un bob-intruso también se para.
parar_todo() {
  say "  se para todo lo de BOb"
  docker compose -p "$BOB_PROYECTO" -f "$BOB_COMPOSE" --env-file "$BOB_ENV" --profile feeder stop >&2 || true
  local ids
  ids=$( { docker ps -q --no-trunc --filter 'name=^/bob-'
           docker ps -q --no-trunc --filter "label=com.docker.compose.project=$BOB_PROYECTO"
           docker ps -q --no-trunc --filter label=bob.vecina; } 2>/dev/null | sort -u)
  [ -z "$ids" ] || docker stop $ids >&2 || true
}

# Pone una imagen (ya atestada) en .env, levanta y comprueba.
#   0 sano y aislado · 1 no quedó sano (sigue levantado) · 3 aislamiento roto o sin puerta (TODO lo de BOb parado)
poner() {
  local id=$1 at=$2 ais rc
  escribir "${CLAVE}_IMAGEN" "$id" "${CLAVE}_ATESTACION" "$at"
  compose up -d --no-build --pull never "$SERVICIO" >&2 || { say "  compose up falló"; return 1; }
  esperar_salud "$id" || return 1
  salud_por_traefik; rc=$?
  [ "$rc" = 3 ] && { parar_todo; return 3; }
  [ "$rc" = 0 ] || return 1
  ais=$("$BOB_AISLAMIENTO"); rc=$?
  say "  aislamiento: $ais"
  [ "$rc" = 0 ] && return 0
  parar_todo
  return 3
}
