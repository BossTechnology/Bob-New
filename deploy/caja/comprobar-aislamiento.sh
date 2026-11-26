#!/usr/bin/env bash
# ¿Están aislados los contenedores de BOb al lado de la caja? Lo corren deploy.sh y rollback.sh después de cada
# cambio, y Henry cuando quiera. Solo lee: docker inspect, docker network inspect y los ficheros montados.
#
# DESCUBRE, NO ENUMERA. Mira todo contenedor del demonio, en marcha o parado, que se llame `bob-*` o que lleve la
# etiqueta de compose del proyecto `bob` o la etiqueta `bob.vecina`. Uno nuevo entra solo en la comprobación.
#
# LO PERMITIDO SALE DE D77, NO DE /opt/bob/compose.yml (que es lo que se protege: si alguien le añade bzzz-data,
# esto tiene que fallar). Fijo aquí:
#   bob-web     bzzz-vecina-bob y bzzz-edge   (bzzz-edge sale a internet: la excepción de Henry, 2026-11-25, «(A)
#                                              bzzz-edge como excepción»; cerrarla queda para D59)
#   bob-feeder  bzzz-vecina-bob               (sin salida)
# Con BOB_SALIDA_ESTRICTA=1 no hay excepción y bob-web en bzzz-edge falla. Solo endurece, por eso se acepta del
# entorno.
#
# LO QUE FALLA, por contenedor:
#   nombre     lleva las etiquetas de BOb pero no es bob-web ni bob-feeder
#   declarado  no es el servicio de ese nombre del proyecto de compose `bob`
#   redes      está en una red que D77 no le da, o en el modo de red host
#   salida     está en una red que no es `internal` (sale a internet), salvo bob-web en bzzz-edge
#   traefik    una etiqueta traefik.tcp.* o traefik.udp.*, enrutable sin ser bob-web, por otra red que bzzz-edge, o un
#              router HTTP sin puerta-apps@file como primer middleware
#   secreto    su entorno trae una variable con nombre de contraseña, llave, token o secreto (SECRET_NAME, el mismo
#              patrón que lib/bob/runtime.ts: descubre, no enumera; MIGRADOR_CLAVE cae aunque nadie la nombre), una de
#              FORBIDDEN_IN_BOX, una URL con contraseña o un JWT con role=service_role; o un fichero montado trae lo
#              mismo, salvo el login propio de ese contenedor en su fichero de /opt/bob/secrets (BOB_APP_CLAVE de
#              bob-web, BOB_FEEDER_CLAVE del feeder)
#   montaje    monta algo fuera de /opt/bob/config y /opt/bob/secrets, un volumen, un directorio o un enlace
#   puertos    publica un puerto en el host
#
# CONTRATO (como los guiones de la caja): UNA línea por stdout y el rc. El detalle, por stderr.
#   0  «aislada: N contenedores bob-* (…)»
#   1  «no-aislada: …»
#   2  «no-medible: …»   sin docker o python3, o no hay ningún contenedor de BOb (vacío no es aislado)
set -uo pipefail

FIJOS_NO=no-medible
# shellcheck source=deploy/caja/fijos.sh
. "$(cd "$(dirname "$0")" && pwd)/fijos.sh"
[ -z "${BOB_SALIDA_ACEPTADA+x}" ] || { echo "no-medible: BOB_SALIDA_ACEPTADA ya no existe: la excepción es fija; para quitarla, BOB_SALIDA_ESTRICTA=1"; exit 2; }
ESTRICTA=${BOB_SALIDA_ESTRICTA:-0}

command -v docker >/dev/null || { echo "no-medible: falta docker"; exit 2; }
command -v python3 >/dev/null || { echo "no-medible: falta python3"; exit 2; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT

docker ps -aq --no-trunc > "$T/todos" || { echo "no-medible: docker ps falló"; exit 2; }
if [ -s "$T/todos" ]; then
  # Entre `ps` y `inspect` otro proceso puede borrar un contenedor o una red: inspect sale con 1 pero imprime los
  # que siguen. Lo que ya no existe no puede estar mal aislado; solo es «no medible» si no sale un JSON legible.
  xargs docker inspect < "$T/todos" > "$T/contenedores.json" 2> "$T/err.c" || true
  docker network ls -q --no-trunc | xargs docker network inspect > "$T/redes.json" 2> "$T/err.r" || true
  for j in contenedores redes; do
    python3 -I -c 'import json,sys; assert isinstance(json.load(open(sys.argv[1])), list)' "$T/$j.json" 2>/dev/null \
      || { echo "no-medible: docker inspect de $j no dio un JSON: $(head -1 "$T/err.${j:0:1}")"; exit 2; }
  done
else
  echo '[]' > "$T/contenedores.json"; echo '[]' > "$T/redes.json"
fi

python3 -I - "$T" "$BOB_PROYECTO" "$BOB_RAIZ" "$BOB_RED_VECINA" "$BOB_RED_ENTRADA" "$ESTRICTA" <<'PY'
import base64, json, os, re, sys
d, proyecto, raiz, vecina, entrada, estricta = sys.argv[1:7]
conts = json.load(open(f"{d}/contenedores.json"))
redes = {n["Name"]: n for n in json.load(open(f"{d}/redes.json"))}

# D77 §2.2 y §5. No se lee de compose.yml.
PERMITIDAS = {"bob-web": {vecina, entrada}, "bob-feeder": {vecina}}
SALIDA = set() if estricta == "1" else {("bob-web", entrada)}

# SECRET_NAME, FORBIDDEN_IN_BOX y URL_WITH_PASSWORD, copia literal de lib/bob/runtime.ts. lib/bob/caja-compose.test.ts
# falla si se separan.
# --- FORBIDDEN_IN_BOX ---
SECRET_NAME = re.compile(r"PASS|_PWD|CLAVE|CONTRASE|SECRET|TOKEN|LLAVE|KEY|CREDENTIAL|CREDENCIAL|SERVICE_ROLE|DATABASE_URL|DSN", re.I)
FORBIDDEN_IN_BOX = [
    "TWILIO_ACCOUNT_SID", "SLACK_WEBHOOK_URL",
]
URL_WITH_PASSWORD = re.compile(r"[a-z][a-z0-9+.-]*:\/\/[^\s/:@]*:[^\s/@]+@", re.I)
MOUNTED_SECRETS = "/run/secrets/bob/"
# --- fin ---
# Una variable con nombre de secreto puede llevar la ruta de un fichero: uno montado aquí (BOB_VECINOS_CLAVE del
# feeder) o cualquier ruta absoluta con un nombre *_FILE (la convención de Docker). La ruta no es el secreto.
def es_ruta(k, v):
    return re.fullmatch(r"/\S*", v) is not None and ".." not in v.split("/") \
        and (v.startswith(MOUNTED_SECRETS) or k.upper().endswith("_FILE"))
def secreto(k, v, ruta_ok=True):
    if k in FORBIDDEN_IN_BOX:
        return "trae " + k
    if SECRET_NAME.search(k) and not (ruta_ok and es_ruta(k, v)):
        return "trae " + k
    if URL_WITH_PASSWORD.search(v):
        return k + " lleva una contraseña dentro de una URL"
    return None
# En un fichero montado de /opt/bob/secrets, el login de ese contenedor (va precisamente ahí). Nada más.
PROPIA = {"bob-web": {"BOB_APP_CLAVE"}, "bob-feeder": {"BOB_FEEDER_CLAVE"}}
JWT = re.compile(r"eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*")
PERMITIDOS = (os.path.join(raiz, "config") + "/", os.path.join(raiz, "secrets") + "/")
ROUTER = re.compile(r"^traefik\.http\.routers\.([^.]+)\.")

def jwt_service_role(texto):
    for m in JWT.finditer(texto):
        p = m.group(1); p += "=" * (-len(p) % 4)
        try:
            if json.loads(base64.urlsafe_b64decode(p)).get("role") == "service_role":
                return True
        except Exception:
            pass
    return False

def es_de_bob(c):
    n = c["Name"].lstrip("/"); l = c["Config"].get("Labels") or {}
    return n.startswith("bob-") or l.get("com.docker.compose.project") == proyecto or "bob.vecina" in l

fallos, vistos, no_medible = [], [], []
for c in conts:
    if not es_de_bob(c):
        continue
    n = c["Name"].lstrip("/"); l = c["Config"].get("Labels") or {}
    vistos.append(n)
    f = lambda que, por: fallos.append(f"{n}: {que}: {por}")
    if n not in PERMITIDAS:
        f("nombre", "no es bob-web ni bob-feeder")
    if l.get("com.docker.compose.project") != proyecto or l.get("com.docker.compose.service") != n:
        f("declarado", f"no es el servicio {n} del proyecto {proyecto} (proyecto «{l.get('com.docker.compose.project')}», servicio «{l.get('com.docker.compose.service')}»)")
    if c["HostConfig"].get("NetworkMode", "") == "host":
        f("redes", "modo de red host")
    mias = set((c["NetworkSettings"].get("Networks") or {}).keys())
    sobra = mias - PERMITIDAS.get(n, set())
    if sobra:
        f("redes", f"en {', '.join(sorted(sobra))}, que D77 no le da")
    for r in sorted(mias):
        info = redes.get(r)
        if info is None:
            no_medible.append(f"{n}: no encuentro la red {r}"); continue
        if not info.get("Internal") and (n, r) not in SALIDA:
            f("salida", f"{r} no es internal: sale a internet")
    # Traefik: lo que lee el Traefik de la caja de las etiquetas, venga de donde venga el contenedor. Traefik no
    # distingue mayúsculas en las claves: se comparan en minúsculas.
    l = {k.lower(): v for k, v in l.items()}
    for k in l:
        if k.startswith(("traefik.tcp.", "traefik.udp.")):
            f("traefik", f"etiqueta {k}: BOb solo entra por HTTP con la puerta")
    if l.get("traefik.enable", "").lower() == "true":
        if n != "bob-web":
            f("traefik", "enrutable (traefik.enable=true) y solo bob-web lo es")
        if l.get("traefik.docker.network") != entrada:
            f("traefik", f"traefik.docker.network es «{l.get('traefik.docker.network')}», no {entrada}")
    for r in sorted({m.group(1) for k in l for m in [ROUTER.match(k)] if m}):
        mw = [x.strip() for x in l.get(f"traefik.http.routers.{r}.middlewares", "").split(",") if x.strip()]
        if not mw or mw[0].lower() != "puerta-apps@file":
            f("traefik", f"el router {r} no lleva puerta-apps@file primero ({','.join(mw) or 'sin middlewares'})")
    for e in c["Config"].get("Env") or []:
        k, _, v = e.partition("=")
        por = secreto(k, v)
        if por:
            f("secreto", f"el entorno {por}" if por.startswith("trae") else f"en el entorno, {por}")
        elif jwt_service_role(v):
            f("secreto", f"{k} es un JWT con role=service_role")
    for m in c.get("Mounts") or []:
        src = m.get("Source", "")
        if m.get("Type") != "bind":
            f("montaje", f"monta un {m.get('Type')} ({m.get('Name') or src})"); continue
        if not src.startswith(PERMITIDOS):
            f("montaje", f"monta {src}, fuera de {raiz}/config y {raiz}/secrets")
        # Solo ficheros sueltos: un directorio montado no se puede revisar entero aquí, y un enlace apunta a otro sitio.
        if os.path.islink(src):
            f("montaje", f"monta {src}, que es un enlace"); continue
        if os.path.isdir(src):
            f("montaje", f"monta el directorio {src}: BOb solo monta ficheros"); continue
        if not os.path.exists(src):
            no_medible.append(f"{n}: no encuentro {src} en este servidor"); continue
        if os.path.isfile(src):
            try:
                texto = open(src, errors="replace").read(1 << 20)
            except OSError as ex:
                no_medible.append(f"{n}: no puedo leer {src} ({ex.strerror})"); continue
            propia = PROPIA.get(n, set()) if src.startswith(PERMITIDOS[1]) else set()
            for linea in texto.splitlines():
                if "=" not in linea or linea.lstrip().startswith("#"):
                    continue
                k, _, v = linea.partition("=")
                k = re.sub(r"^export\s+", "", k.strip()); v = v.strip().strip("'\"")
                if k in propia:
                    continue
                por = secreto(k, v, ruta_ok=False)
                if por:
                    f("secreto", f"{src} {por}")
            if jwt_service_role(texto):
                f("secreto", f"{src} trae un JWT con role=service_role")
    pb = [k for k, v in (c["HostConfig"].get("PortBindings") or {}).items() if v]
    if pb:
        f("puertos", f"publica {', '.join(pb)}")

for x in fallos + no_medible:
    print("  - " + x, file=sys.stderr)
excep = "ninguna (estricta)" if not SALIDA else ", ".join(f"{a} en {b}" for a, b in sorted(SALIDA))
if fallos:
    print(f"no-aislada: {len(fallos)} fallo(s) en {len(vistos)} contenedor(es): " + "; ".join(fallos)); sys.exit(1)
if no_medible:
    print("no-medible: " + "; ".join(no_medible)); sys.exit(2)
if not vistos:
    print("no-medible: no hay ningún contenedor de BOb (bob-*) en este demonio"); sys.exit(2)
print(f"aislada: {len(vistos)} contenedor(es) bob-* ({', '.join(sorted(vistos))}); salida aceptada: {excep}")
PY
