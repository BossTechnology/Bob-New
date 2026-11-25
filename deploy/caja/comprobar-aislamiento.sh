#!/usr/bin/env bash
# ¿Están aislados los contenedores de BOb al lado de la caja? Lo corren deploy.sh y rollback.sh después de cada
# cambio, y Henry cuando quiera. Solo lee: docker inspect, docker network inspect y los ficheros montados.
#
# DESCUBRE, NO ENUMERA. Mira todo contenedor del demonio, en marcha o parado, que se llame `bob-*` o que lleve
# la etiqueta de compose del proyecto `bob` o la etiqueta `bob.vecina`. Uno nuevo entra solo en la comprobación;
# para que pase, tiene que estar declarado en compose.yml.
#
# LO QUE FALLA, por contenedor:
#   nombre     lleva las etiquetas de BOb pero no se llama bob-*
#   declarado  su servicio no está en compose.yml (con el perfil feeder incluido)
#   redes      está en una red que su servicio no declara, o en el modo de red host
#   salida     está en una red que no es `internal` (sale a internet), salvo la excepción declarada en
#              BOB_SALIDA_ACEPTADA. Por omisión, una: bob-web en bzzz-edge, porque por ahí llega Traefik y
#              D77 §5 lo deja así hasta D59. Vacía (BOB_SALIDA_ACEPTADA=), no se acepta ninguna
#   secreto    su entorno o un fichero montado trae la service role (SUPABASE_SERVICE_ROLE_KEY, SERVICE_ROLE_KEY,
#              un JWT con role=service_role), JWT_SECRET, POSTGRES_PASSWORD o la credencial de migración
#   montaje    monta algo fuera de /opt/bob/config y /opt/bob/secrets (el socket de Docker, /opt/bzzz…)
#   puertos    publica un puerto en el host
#
# CONTRATO (como los guiones de la caja): UNA línea por stdout y el rc. El detalle, por stderr.
#   0  «aislada: N contenedores bob-* (…)»
#   1  «no-aislada: …»
#   2  «no-medible: …»   sin docker, sin python3, compose.yml no se puede leer, o no hay ningún contenedor de BOb
set -uo pipefail

BOB_RAIZ=${BOB_RAIZ:-/opt/bob}
BOB_COMPOSE=${BOB_COMPOSE:-$BOB_RAIZ/compose.yml}
BOB_ENV=${BOB_ENV:-$BOB_RAIZ/.env}
BOB_PROYECTO=${BOB_PROYECTO:-bob}
ENTRADA=${BOB_RED_ENTRADA:-bzzz-edge}
ACEPTADA=${BOB_SALIDA_ACEPTADA-bob-web=$ENTRADA}

command -v docker >/dev/null || { echo "no-medible: falta docker"; exit 2; }
command -v python3 >/dev/null || { echo "no-medible: falta python3"; exit 2; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT

ENVARG=(); [ -f "$BOB_ENV" ] && ENVARG=(--env-file "$BOB_ENV")
# BOB_WEB_IMAGEN puede faltar si nunca se desplegó; para leer lo declarado basta un valor cualquiera.
BOB_WEB_IMAGEN=${BOB_WEB_IMAGEN:-x} BOB_HOST=${BOB_HOST:-x} \
  docker compose -p "$BOB_PROYECTO" -f "$BOB_COMPOSE" "${ENVARG[@]}" --profile feeder config --no-env-resolution --format json > "$T/compose.json" 2> "$T/err" \
  || { echo "no-medible: no puedo leer $BOB_COMPOSE: $(head -1 "$T/err")"; exit 2; }

docker ps -aq --no-trunc > "$T/todos" || { echo "no-medible: docker ps falló"; exit 2; }
if [ -s "$T/todos" ]; then
  xargs docker inspect < "$T/todos" > "$T/contenedores.json" || { echo "no-medible: docker inspect falló"; exit 2; }
  docker network ls -q --no-trunc | xargs docker network inspect > "$T/redes.json" || { echo "no-medible: docker network inspect falló"; exit 2; }
else
  echo '[]' > "$T/contenedores.json"; echo '[]' > "$T/redes.json"
fi

python3 -I - "$T" "$BOB_PROYECTO" "$BOB_RAIZ" "$ACEPTADA" <<'PY'
import base64, json, os, re, sys
d, proyecto, raiz, aceptada = sys.argv[1:5]
compose = json.load(open(f"{d}/compose.json"))
conts = json.load(open(f"{d}/contenedores.json"))
redes = {n["Name"]: n for n in json.load(open(f"{d}/redes.json"))}
acept = {tuple(x.split("=", 1)) for x in aceptada.split() if "=" in x}

nombre_red = {k: (v or {}).get("name", k) for k, v in compose.get("networks", {}).items()}
declaradas = {s: {nombre_red.get(k, k) for k in (v.get("networks") or {})} for s, v in compose["services"].items()}

NOMBRES = re.compile(r"(SERVICE_ROLE|JWT_SECRET|POSTGRES_PASSWORD|MIGRADOR_CLAVE|MIGRADOR_USUARIO)", re.I)
JWT = re.compile(r"eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]*")
PERMITIDOS = (os.path.join(raiz, "config") + "/", os.path.join(raiz, "secrets") + "/")

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
    if not n.startswith("bob-"):
        f("nombre", "lleva las etiquetas de BOb y no se llama bob-*")
    srv = l.get("com.docker.compose.service")
    if l.get("com.docker.compose.project") != proyecto or srv not in declaradas:
        f("declarado", f"no es un servicio de compose.yml (proyecto «{l.get('com.docker.compose.project')}», servicio «{srv}»)")
    modo = c["HostConfig"].get("NetworkMode", "")
    if modo == "host":
        f("redes", "modo de red host")
    mias = set((c["NetworkSettings"].get("Networks") or {}).keys())
    sobra = mias - declaradas.get(srv, set())
    if sobra:
        f("redes", f"en {', '.join(sorted(sobra))}, que {srv or 'su servicio'} no declara")
    for r in sorted(mias):
        info = redes.get(r)
        if info is None:
            no_medible.append(f"{n}: no encuentro la red {r}"); continue
        if not info.get("Internal") and (n, r) not in acept:
            f("salida", f"{r} no es internal: sale a internet")
    for e in c["Config"].get("Env") or []:
        k, _, v = e.partition("=")
        if NOMBRES.search(k):
            f("secreto", f"el entorno trae {k}")
        elif jwt_service_role(v):
            f("secreto", f"{k} es un JWT con role=service_role")
    for m in c.get("Mounts") or []:
        src = m.get("Source", "")
        if m.get("Type") == "bind" and not src.startswith(PERMITIDOS):
            f("montaje", f"monta {src}, fuera de {raiz}/config y {raiz}/secrets")
        if m.get("Type") == "bind" and os.path.isfile(src):
            try:
                texto = open(src, errors="replace").read(1 << 20)
            except OSError as ex:
                no_medible.append(f"{n}: no puedo leer {src} ({ex.strerror})"); continue
            for linea in texto.splitlines():
                k = linea.split("=", 1)[0].strip()
                if "=" in linea and NOMBRES.search(k):
                    f("secreto", f"{src} trae {k}")
            if jwt_service_role(texto):
                f("secreto", f"{src} trae un JWT con role=service_role")
    if any(c["HostConfig"].get("PortBindings") or {}):
        pb = [k for k, v in (c["HostConfig"].get("PortBindings") or {}).items() if v]
        if pb:
            f("puertos", f"publica {', '.join(pb)}")

for x in fallos + no_medible:
    print("  - " + x, file=sys.stderr)
if fallos:
    print(f"no-aislada: {len(fallos)} fallo(s) en {len(vistos)} contenedor(es): " + "; ".join(fallos)); sys.exit(1)
if no_medible:
    print("no-medible: " + "; ".join(no_medible)); sys.exit(2)
if not vistos:
    print("no-medible: no hay ningún contenedor de BOb (bob-*) en este demonio"); sys.exit(2)
print(f"aislada: {len(vistos)} contenedor(es) bob-* ({', '.join(sorted(vistos))}); salida aceptada: {aceptada or 'ninguna'}")
PY
