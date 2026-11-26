# shellcheck shell=bash
# Lo que comparten deploy.sh y rollback.sh. No se corre solo.
#
# Las rutas, el comprobador de atestaciones, sus firmantes y la imagen de psql son fijos en una caja (fijos.sh).
# Lo único que se ajusta desde el entorno es cuánto se espera: BOB_ESPERA_SALUD (segundos, 180).

AQUI=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIJOS_NO=no-empieza
# shellcheck source=deploy/caja/fijos.sh
. "$AQUI/fijos.sh"
BOB_AISLAMIENTO=$AQUI/comprobar-aislamiento.sh

say() { printf '%s\n' "$*" >&2; }
no_empieza() { echo "no-empieza: $1"; exit 2; }

BOB_ESPERA_SALUD=${BOB_ESPERA_SALUD:-180}
# Sin ceros delante: «08» pasaría un ^[0-9]+$ y luego $(( )) lo leería como octal y abortaría a mitad del cambio.
[[ "$BOB_ESPERA_SALUD" =~ ^[1-9][0-9]{0,4}$ ]] || no_empieza "BOB_ESPERA_SALUD tiene que ser un número de segundos («$BOB_ESPERA_SALUD»)"
# En una caja corre como root: la carpeta de entrega, los secretos y .env son de root. Solo el banco corre sin serlo.
[ "$(id -u)" = 0 ] || bob_banco || no_empieza "hay que correrlo como root"

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
# (bzzz-conector:local…), aunque su atestación no case después.
id_del_tar() {
  python3 -I - "$1" "$SERVICIO" <<'PY'
import hashlib, json, re, sys, tarfile
ruta, servicio = sys.argv[1:3]
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
if len(idx.get("manifests", [])) > 1:
    no(f"index.json trae {len(idx['manifests'])} imágenes; tiene que traer una")
for d in idx.get("manifests", []):
    an = d.get("annotations") or {}
    n = an.get("io.containerd.image.name")
    if n and not nombre.match(n):
        malas.append(n)
    # org.opencontainers.image.ref.name: la etiqueta sola («<12 hex>») o el nombre entero.
    rn = an.get("org.opencontainers.image.ref.name")
    if rn and not (re.fullmatch(r"[0-9a-f]{12}", rn) or nombre.match(rn)):
        malas.append(rn)
    # index.json apunta a un manifiesto o a un índice (multiplataforma, o con atestaciones de buildx). De un índice
    # se sigue el único manifiesto linux/amd64. Cada blob tiene que casar con su digest.
    # Se despacha por mediaType: el del descriptor y el del blob tienen que coincidir, y un blob que es a la vez
    # índice y manifiesto (híbrido) se rechaza.
    INDICES = {"application/vnd.oci.image.index.v1+json", "application/vnd.docker.distribution.manifest.list.v2+json"}
    MANIFIESTOS = {"application/vnd.oci.image.manifest.v1+json", "application/vnd.docker.distribution.manifest.v2+json"}
    def blob(desc):
        dg = desc.get("digest", "")
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", dg):
            no(f"un descriptor apunta a «{dg}», que no es un sha256")
        try:
            b = leer("blobs/sha256/" + dg.split(":", 1)[1])
        except KeyError:
            no(f"index.json apunta a {dg}, que no está en el tar")
        if "sha256:" + hashlib.sha256(b).hexdigest() != dg:
            no(f"el blob {dg} no casa con su digest")
        j = json.loads(b)
        # El descriptor tiene que decir qué es (OCI lo exige); el blob puede no repetirlo, pero si lo dice, lo mismo.
        mt = desc.get("mediaType")
        if not mt:
            no(f"el descriptor de {dg} no dice su mediaType")
        if "mediaType" in j and j["mediaType"] != mt:
            no(f"el blob {dg} dice ser {j['mediaType']} y su descriptor {mt}")
        if mt in INDICES and "manifests" in j and "config" not in j and "layers" not in j:
            return "indice", j
        if mt in MANIFIESTOS and "config" in j and "manifests" not in j:
            return "manifiesto", j
        no(f"el blob {dg} no es ni un índice ni un manifiesto limpio ({mt})")
    tipo, mf = blob(d)
    if tipo == "indice":
        amd = [x for x in mf["manifests"] if (x.get("platform") or {}).get("os") == "linux"
               and (x.get("platform") or {}).get("architecture") == "amd64"]
        if len(amd) != 1:
            no(f"el índice trae {len(amd)} manifiestos linux/amd64; tiene que traer uno")
        tipo, mf = blob(amd[0])
        if tipo != "manifiesto":
            no("el linux/amd64 del índice no es un manifiesto")
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
  [ ! -L "$d" ] || { say "  $d es un enlace"; return 1; }
  mkdir -p "$d" || return 1
  [ -O "$d" ] && [ ! -L "$d" ] || { say "  $d no es de $(id -un) o es un enlace"; return 1; }
  chmod 700 "$d" || return 1
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

# La config (la identidad atestada) de una imagen en el disco, por su referencia local. La saca
# scripts/id-de-imagen.sh de Bzzz (#454), el mismo que usa el comprobador: con overlay2 es .Id; con containerd lee
# la configuración de `docker save` (con --platform si docker lo admite). rc 1: docker no conoce la imagen; rc 2: no
# se pudo medir. Imprime solo un id válido.
config_de() {
  local out rc
  out=$(bash "$(dirname "$BOB_COMPROBAR_ATESTACION")/id-de-imagen.sh" "$1" 2>/dev/null); rc=$?
  [ "$rc" = 0 ] && es_id "$out" && { echo "$out"; return 0; }
  say "  id-de-imagen.sh $1: rc $rc ${out:0:120}"
  [ "$rc" = 0 ] && return 2 || return "$rc"
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
# Después de parar, se vuelve a descubrir: si algo sigue en marcha (o docker no contesta), rc 2 y PARAR_RESTOS dice
# qué. Quien llama no puede decir «todo parado» sin un 0 de aquí.
bob_en_marcha() {
  { docker ps -q --no-trunc --filter 'name=^/bob-' &&
    docker ps -q --no-trunc --filter "label=com.docker.compose.project=$BOB_PROYECTO" &&
    docker ps -q --no-trunc --filter label=bob.vecina; } | sort -u
}
parar_todo() {
  say "  se para todo lo de BOb"
  PARAR_RESTOS=
  docker compose -p "$BOB_PROYECTO" -f "$BOB_COMPOSE" --env-file "$BOB_ENV" --profile feeder stop >&2 || true
  local ids
  ids=$(bob_en_marcha 2>/dev/null) || true
  [ -z "$ids" ] || docker stop $ids >&2 || true
  if ! ids=$(bob_en_marcha 2>/dev/null); then
    PARAR_RESTOS="docker ps no contesta"; say "  no sé si quedó parado: $PARAR_RESTOS"; return 2
  fi
  if [ -n "$ids" ]; then
    PARAR_RESTOS=$(docker inspect -f '{{.Name}}' $ids 2>/dev/null | tr -d / | tr '\n' ' ')
    PARAR_RESTOS=${PARAR_RESTOS:-$ids}; say "  siguen en marcha: $PARAR_RESTOS"; return 2
  fi
  return 0
}
# La línea final de un fallo que para todo: dice si de verdad quedó parado.
fallo_y_parar() {
  if parar_todo; then echo "fallo: $1; todo lo de BOb queda parado"
  else echo "fallo: $1; NO se pudo parar todo lo de BOb (siguen: $PARAR_RESTOS): pararlo a mano"; fi
}

# /opt/bob y secrets/: de root y sin escritura para otros; en secrets/, cada entrada un fichero normal (sin enlaces
# ni directorios), 600 o 400, y del usuario que lo lee: migrador.env de root (lo lee deploy.sh) y el resto de 65534
# (bob-web y el feeder corren con ese usuario: un 600 de root no lo podrían leer). En el banco, del que lo corre.
modo_de() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }
dueno_de() { stat -c %u "$1" 2>/dev/null || stat -f %u "$1"; }
# comprobar_padres <dir> <tope> <uid>: cada directorio desde el padre de <dir> hasta <tope> (incluido) es de <uid>,
# no es un enlace y nadie más puede escribir en él. Quien pudiera escribir en /opt o en / podría cambiar /opt/bob.
# Imprime el primero que falla y devuelve 1.
comprobar_padres() {
  local d=$1 tope=$2 uid=$3 m
  while [ "$d" != "$tope" ] && [ "$d" != / ]; do
    d=$(dirname "$d")
    [ -d "$d" ] && [ ! -L "$d" ] || { echo "$d no es un directorio (o es un enlace)"; return 1; }
    [ "$(dueno_de "$d")" = "$uid" ] || { echo "$d no es del uid $uid (es del $(dueno_de "$d"))"; return 1; }
    m=$(modo_de "$d"); [ $(( 8#$m & 022 )) = 0 ] || { echo "$d tiene permisos $m: otros pueden escribir"; return 1; }
  done
}
comprobar_raiz_y_secretos() {
  local raiz=$BOB_RAIZ d f n m u root=0 app=65534 malo
  bob_banco && { root=$(id -u); app=$(id -u); }
  # En una caja, la cadena entera hasta / (/opt y /). En el banco la raíz cuelga de la carpeta temporal del sistema,
  # que no es suya: esa cadena no se mira (comprobar_padres tiene su propio caso de banco).
  if ! bob_banco; then malo=$(comprobar_padres "$raiz" / 0) || no_empieza "$malo"; fi
  for d in "$raiz" "$raiz/secrets"; do
    [ -d "$d" ] && [ ! -L "$d" ] || no_empieza "$d no es un directorio (o es un enlace)"
    [ "$(dueno_de "$d")" = "$root" ] || no_empieza "$d no es de root (uid $(dueno_de "$d"))"
    m=$(modo_de "$d"); [ $(( 8#$m & 022 )) = 0 ] || no_empieza "$d tiene permisos $m: otros pueden escribir"
  done
  # Se descubre con find, no con un glob: «*» y «.[!.]*» no ven, por ejemplo, «..x».
  while IFS= read -r -d '' f; do
    n=$(basename "$f")
    [ -f "$f" ] && [ ! -L "$f" ] || no_empieza "secrets/$n no es un fichero normal (enlace o directorio)"
    m=$(modo_de "$f"); [ "$m" = 600 ] || [ "$m" = 400 ] || no_empieza "secrets/$n tiene permisos $m: tiene que ser 600"
    u=$(dueno_de "$f")
    case "$n" in
      migrador.env) [ "$u" = "$root" ] || no_empieza "secrets/$n es del uid $u: tiene que ser de root" ;;
      *)            [ "$u" = "$app" ]  || no_empieza "secrets/$n es del uid $u: tiene que ser del $app (el usuario de los contenedores)" ;;
    esac
  done < <(find "$raiz/secrets" -mindepth 1 -maxdepth 1 -print0)
}

# Pone una imagen (ya atestada) en .env, levanta y comprueba.
#   0 sano y aislado · 1 no quedó sano (sigue levantado) · 3 aislamiento roto o sin puerta (TODO lo de BOb parado)
#   4 aislamiento roto o sin puerta y NO se pudo parar todo (PARAR_RESTOS dice qué sigue)
poner() {
  local id=$1 at=$2 ais rc
  escribir "${CLAVE}_IMAGEN" "$id" "${CLAVE}_ATESTACION" "$at"
  compose up -d --no-build --pull never "$SERVICIO" >&2 || { say "  compose up falló"; return 1; }
  esperar_salud "$id" || return 1
  salud_por_traefik; rc=$?
  [ "$rc" = 3 ] && { parar_todo || return 4; return 3; }
  [ "$rc" = 0 ] || return 1
  ais=$("$BOB_AISLAMIENTO"); rc=$?
  say "  aislamiento: $ais"
  [ "$rc" = 0 ] && return 0
  parar_todo || return 4
  return 3
}
