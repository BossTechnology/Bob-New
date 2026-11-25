#!/usr/bin/env bash
# Banco local de BOb al lado de la caja. NUNCA en una caja: crea y borra contenedores, redes e imágenes propias.
#
# Imita la caja con lo mínimo que hace falta para que el paquete se pruebe de verdad:
#   - una red `internal` como bzzz-vecina-bob y otra con salida como bzzz-edge (con nombres de banco);
#   - la base de la caja (supabase/postgres:17.6.1.136, la misma imagen) con bob_app (CONNECTION LIMIT 10) y
#     bob_migrador, y el GoTrue de Supabase, con los alias bzzz-supabase-db y bzzz-supabase-auth;
#   - un Traefik de prueba con la versión de la caja, el proveedor de Docker y middlewares de mentira con los
#     nombres de la caja (puerta-apps, cabeceras, login-ritmo);
#   - imágenes atestadas con el comprobador de Bzzz y una llave SSH de usar y tirar.
#
# Y corre, en este orden: el chequeo sin contenedores (no medible), deploy de A, deploy de B, rollback.sh (vuelve
# a A), deploy de una imagen que no queda sana (vuelve sola a A), deploy de una imagen sin atestación (no
# empieza), --migrar con una migración buena y una mala, y el chequeo de aislamiento visto fallar cinco veces.
#
# USO
#   deploy/caja/banco/banco.sh <imagen de bob-web ya construida> <comprobar-atestacion-bob.sh de Bzzz>
#   p. ej. docker build -t bob-web:banco-a . && deploy/caja/banco/banco.sh bob-web:banco-a ../Bzzz/scripts/comprobar-atestacion-bob.sh
# SALIDA: 0 todo lo esperado pasó · 1 algo no · 2 no empezó
set -uo pipefail

[ "$#" = 2 ] || { echo "no-empieza: uso: $0 <imagen bob-web> <comprobar-atestacion-bob.sh>"; exit 2; }
IMG_A=$1; CHECKER=$2
for c in docker ssh-keygen curl python3 openssl; do command -v "$c" >/dev/null || { echo "no-empieza: falta $c"; exit 2; }; done
docker image inspect "$IMG_A" >/dev/null 2>&1 || { echo "no-empieza: no está la imagen $IMG_A"; exit 2; }
[ -f "$CHECKER" ] || { echo "no-empieza: no encuentro $CHECKER"; exit 2; }
if docker ps -aq --filter name='^bob-' | grep -q .; then echo "no-empieza: ya hay contenedores bob-* en este demonio"; exit 2; fi

CAJA=$(cd "$(dirname "$0")/.." && pwd)
PG_IMG=supabase/postgres@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00
GOTRUE_IMG=${BANCO_GOTRUE_IMAGEN:-public.ecr.aws/supabase/gotrue:v2.197.0}
TRAEFIK_IMG=traefik@sha256:9c437ac4f09ce6f4980a8544902d3475fdf70a1a7c578729581d2535dfa7d635
P=banco-bobcaja
RV=$P-vecina; RE=$P-edge; RX=$P-otra
PUERTO=${BANCO_PUERTO:-18443}
HOST=bob.banco.test

R=$(mktemp -d "${TMPDIR:-/tmp}/bobcaja.XXXXXX"); R=$(cd "$R" && pwd -P)
limpiar() {
  docker compose -p bob -f "$R/compose.yml" --env-file "$R/.env" --profile feeder down -t 2 >/dev/null 2>&1
  docker rm -f bob-intruso $P-db $P-auth $P-traefik >/dev/null 2>&1
  docker network rm $RV $RE $RX >/dev/null 2>&1
  docker rmi -f $P:b $P:mala $P:sin-atestar >/dev/null 2>&1
  rm -rf "$R"
}
trap limpiar EXIT

FALLOS=0
ok()  { printf 'ok    %s\n' "$*"; }
mal() { printf 'MAL   %s\n' "$*"; FALLOS=$((FALLOS + 1)); }
# espera <rc esperado> <prefijo esperado de la línea> <descripción> -- <orden...>
espera() {
  local rc_e=$1 pre=$2 desc=$3; shift 4
  local out rc; out=$("$@" 2>"$R/ultimo.err"); rc=$?
  if [ "$rc" = "$rc_e" ] && [[ "$out" == "$pre"* ]]; then ok "$desc → rc $rc «$out»"
  else mal "$desc → rc $rc «$out» (se esperaba rc $rc_e «$pre…»)"; sed 's/^/        /' "$R/ultimo.err" | tail -15; fi
}
corre() { docker inspect -f '{{.Image}}' bob-web 2>/dev/null; }
id_de() { docker image inspect -f '{{.Id}}' "$1"; }
clave() { openssl rand -hex 24; }

echo "== banco en $R"
# --- redes -------------------------------------------------------------------------------------------------
docker network create --internal $RV >/dev/null && docker network create $RE >/dev/null && docker network create $RX >/dev/null \
  || { echo "no-empieza: no pude crear las redes"; exit 2; }

# --- la base y GoTrue, como en la caja ---------------------------------------------------------------------
PGPW=$(clave); APPPW=$(clave); MIGPW=$(clave)
docker run -d --name $P-db --network $RV --network-alias bzzz-supabase-db -e POSTGRES_PASSWORD="$PGPW" "$PG_IMG" >/dev/null \
  || { echo "no-empieza: no arrancó la base"; exit 2; }
for _ in $(seq 1 60); do docker exec $P-db pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break; sleep 2; done
sleep 3
docker exec -i $P-db psql -q -U supabase_admin -h 127.0.0.1 -d postgres -v ON_ERROR_STOP=1 \
  -v app="$APPPW" -v mig="$MIGPW" -v pg="$PGPW" >/dev/null <<'SQL' || { echo "no-empieza: no pude crear los roles de BOb"; exit 2; }
CREATE ROLE bob_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE CONNECTION LIMIT 10 PASSWORD :'app';
CREATE ROLE bob_migrador LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE CONNECTION LIMIT 1 PASSWORD :'mig';
CREATE SCHEMA bob AUTHORIZATION bob_migrador;
-- En la caja lo fija el alta de Supabase; la imagen sola no le pone contraseña.
ALTER ROLE supabase_auth_admin PASSWORD :'pg';
SQL
JWTS=$(clave)
docker run -d --name $P-auth --network $RV --network-alias bzzz-supabase-auth \
  -e GOTRUE_API_HOST=0.0.0.0 -e PORT=9999 -e API_EXTERNAL_URL=http://bzzz-supabase-auth:9999 \
  -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:$PGPW@bzzz-supabase-db:5432/postgres" \
  -e GOTRUE_SITE_URL=https://$HOST -e GOTRUE_JWT_SECRET="$JWTS" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_DISABLE_SIGNUP=true \
  -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=true "$GOTRUE_IMG" >/dev/null \
  || { echo "no-empieza: no arrancó GoTrue"; exit 2; }
for _ in $(seq 1 40); do
  [ "$(docker inspect -f '{{.State.Running}}' $P-auth 2>/dev/null)" = true ] || { echo "no-empieza: GoTrue se paró: $(docker logs $P-auth 2>&1 | tail -1)"; exit 2; }
  docker run --rm --network $RV "$IMG_A" node -e "fetch('http://bzzz-supabase-auth:9999/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null && break
  sleep 2
done

# --- Traefik de prueba ---------------------------------------------------------------------------------------
mkdir -p "$R/traefik"
cat > "$R/traefik/middlewares.yml" <<'YML'
# De mentira, con los nombres de la caja: la puerta de verdad (forwardAuth a /verificar/app) es de Bzzz.
http:
  middlewares:
    puerta-apps:
      headers:
        customResponseHeaders: { X-Banco-Puerta: "puerta-apps" }
    cabeceras:
      headers:
        frameDeny: true
        contentTypeNosniff: true
    login-ritmo:
      rateLimit: { average: 5, burst: 10 }
YML
docker run -d --name $P-traefik --network $RE -p 127.0.0.1:$PUERTO:443 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro -v "$R/traefik:/etc/traefik/dynamic:ro" "$TRAEFIK_IMG" \
  --providers.docker=true --providers.docker.exposedbydefault=false \
  --providers.file.directory=/etc/traefik/dynamic --entrypoints.websecure.address=:443 \
  --certificatesresolvers.le.acme.storage=/tmp/acme.json --certificatesresolvers.le.acme.tlschallenge=true \
  --certificatesresolvers.le.acme.caserver=https://127.0.0.1:1/directory \
  --global.checknewversion=false --global.sendanonymoususage=false >/dev/null \
  || { echo "no-empieza: no arrancó Traefik"; exit 2; }

# --- /opt/bob de banco ---------------------------------------------------------------------------------------
mkdir -p "$R/config" "$R/secrets" "$R/entrega"
cp "$CAJA/compose.yml" "$R/compose.yml"
cat > "$R/.env" <<EOF
BOB_HOST=$HOST
BOB_RAIZ=$R
BOB_RED_VECINA=$RV
BOB_RED_ENTRADA=$RE
EOF
cat > "$R/config/caja.env" <<EOF
BOB_ORG_ID=00000000-0000-4000-8000-00000000b0b0
BOB_GOTRUE_URL=http://bzzz-supabase-auth:9999
BOB_DB_HOST=bzzz-supabase-db
EOF
printf 'BOB_APP_USUARIO=bob_app\nBOB_APP_CLAVE=%s\n' "$APPPW" > "$R/secrets/app.env"
printf 'BOB_MIGRADOR_USUARIO=bob_migrador\nBOB_MIGRADOR_CLAVE=%s\n' "$MIGPW" > "$R/secrets/migrador.env"
chmod 600 "$R/secrets/"*.env

export BOB_RAIZ=$R BOB_RED_VECINA=$RV BOB_RED_ENTRADA=$RE BOB_PSQL_IMAGEN=$PG_IMG BOB_ESPERA_SALUD=150
export BOB_URL_SALUD="https://$HOST:$PUERTO/api/health" BOB_URL_SALUD_RESOLVER="$HOST:$PUERTO:127.0.0.1" BOB_URL_SALUD_CODIGOS=200

# --- imágenes y atestaciones ---------------------------------------------------------------------------------
ssh-keygen -q -t ed25519 -N '' -C banco -f "$R/llave" || { echo "no-empieza: ssh-keygen"; exit 2; }
printf 'banco@bob namespaces="bzzz-bob-imagen" %s\n' "$(cut -d' ' -f1,2 "$R/llave.pub")" > "$R/firmantes"
cp "$CHECKER" "$R/comprobar-atestacion-bob.sh"; chmod +x "$R/comprobar-atestacion-bob.sh"
export BOB_COMPROBAR_ATESTACION=$R/comprobar-atestacion-bob.sh BOB_FIRMANTES=$R/firmantes

derivar() {  # derivar <etiqueta> <líneas de Dockerfile>
  printf 'FROM %s\n%s\n' "$IMG_A" "$2" | docker build -q -t "$1" - >/dev/null
}
derivar $P:b 'LABEL banco.version="b"' || { echo "no-empieza: imagen b"; exit 2; }
# No queda sana: el proceso corre pero no contesta en :3000.
derivar $P:mala 'CMD ["node","-e","setInterval(()=>{},1e6)"]' || { echo "no-empieza: imagen mala"; exit 2; }
derivar $P:sin-atestar 'LABEL banco.version="sin-atestar"' || { echo "no-empieza: imagen sin atestar"; exit 2; }

entregar() {  # entregar <imagen> <nombre> [firmar-otro-id]: deja <nombre>.tar, .atestacion y .atestacion.sig
  local img=$1 n=$2 id; id=$(id_de "$img")
  docker save -o "$R/entrega/$n.tar" "$img"
  [ -n "${3:-}" ] && id=$3
  cat > "$R/entrega/$n.atestacion" <<EOF
formato=bzzz-bob-atestacion/1
commit=$(git -C "$CAJA" rev-parse HEAD 2>/dev/null || printf '0%.0s' $(seq 40))
repo=BossTechnology/Bob-New
imagen_id=$id
comando=banco local
imagen_tar_sha256=$(openssl dgst -sha256 -r "$R/entrega/$n.tar" | cut -d' ' -f1)
dockerfile_sha256=banco
EOF
  ssh-keygen -q -Y sign -f "$R/llave" -n bzzz-bob-imagen "$R/entrega/$n.atestacion" >/dev/null 2>&1
}
entregar "$IMG_A" a; entregar $P:b b; entregar $P:mala mala
entregar $P:sin-atestar sin-atestar "$(id_de "$IMG_A")"   # firmada, pero de otra imagen
A=$(id_de "$IMG_A"); B=$(id_de $P:b); MALA=$(id_de $P:mala)

D="$CAJA/deploy.sh"; RB="$CAJA/rollback.sh"; AIS="$CAJA/comprobar-aislamiento.sh"
dep() { "$D" --imagen "$R/entrega/$1.tar" --atestacion "$R/entrega/$1.atestacion" "${@:2}"; }

echo "== el paquete"
espera 2 "no-medible:" "aislamiento sin ningún bob-* (vacío no es aislado)" -- "$AIS"
espera 2 "no-empieza:" "rollback.sh sin deploy anterior" -- "$RB"
espera 0 "desplegada:" "deploy de A (atestada, sana por dentro y por Traefik)" -- dep a
[ "$(corre)" = "$A" ] && ok "corre A" || mal "no corre A"
code=$(curl -sk -o /dev/null -w '%{http_code}' --resolve "$HOST:$PUERTO:127.0.0.1" "https://$HOST:$PUERTO/api/health")
hdr=$(curl -skI --resolve "$HOST:$PUERTO:127.0.0.1" "https://$HOST:$PUERTO/api/health" | tr -d '\r' | sed -n 's/^[Xx]-[Bb]anco-[Pp]uerta: //p')
[ "$code" = 200 ] && [ "$hdr" = puerta-apps ] && ok "Traefik → bob-web: 200 con puerta-apps delante" || mal "Traefik → bob-web: $code, puerta «$hdr»"
espera 0 "aislada:" "aislamiento con bob-web en marcha" -- "$AIS"
espera 0 "desplegada:" "deploy de B" -- dep b
[ "$(corre)" = "$B" ] && ok "corre B" || mal "no corre B"
espera 0 "vuelta-atras:" "rollback.sh" -- "$RB"
[ "$(corre)" = "$A" ] && ok "rollback.sh volvió a A" || mal "rollback.sh no volvió a A (corre $(corre))"
espera 0 "vuelta-atras:" "rollback.sh otra vez (vuelve a B)" -- "$RB"
[ "$(corre)" = "$B" ] && ok "corre B otra vez" || mal "no corre B"
espera 1 "vuelta-atras:" "deploy de una imagen que no queda sana" -- dep mala
[ "$(corre)" = "$B" ] && ok "tras la mala, corre B" || mal "tras la mala corre $(corre)"
espera 2 "no-empieza:" "deploy de una imagen con la atestación de otra" -- dep sin-atestar
[ "$(corre)" = "$B" ] && ok "sin atestación no tocó nada: corre B" || mal "corre $(corre)"

echo "== migraciones"
printf 'CREATE TABLE bob.banco_migracion (id int primary key);\n' > "$R/0001_buena.sql"
printf 'CREATE TABLE public.banco_fuera (id int);\n' > "$R/0002_fuera_de_bob.sql"
espera 0 "desplegada:" "deploy de A con --migrar una buena" -- dep a --migrar "$R/0001_buena.sql"
n=$(docker exec $P-db psql -tA -U supabase_admin -h 127.0.0.1 -d postgres -c "select tableowner from pg_tables where schemaname='bob' and tablename='banco_migracion'")
[ "$n" = bob_migrador ] && ok "la migración quedó con dueño bob_migrador" || mal "la migración: dueño «$n»"
espera 1 "fallo:" "--migrar una que crea en public (bob_migrador no puede)" -- dep b --migrar "$R/0002_fuera_de_bob.sql"
[ "$(corre)" = "$A" ] && ok "la migración fallida no cambió la imagen: corre A" || mal "corre $(corre)"
docker image inspect "$MALA" >/dev/null && ok "(la mala sigue en disco para mirarla)"

echo "== el aislamiento, visto fallar"
JWT="eyJhbGciOiJIUzI1NiJ9.$(printf '{"role":"service_role","iss":"banco"}' | openssl base64 -A | tr '+/' '-_' | tr -d '=').firma-de-banco"
docker run -d --name bob-intruso -e SUPABASE_SERVICE_ROLE_KEY="$JWT" "$IMG_A" node -e 'setInterval(()=>{},1e6)' >/dev/null
espera 1 "no-aislada:" "un bob-intruso con la service role, sin declarar y en bridge" -- "$AIS"
grep -q 'bob-intruso: secreto' "$R/ultimo.err" && grep -q 'bob-intruso: declarado' "$R/ultimo.err" && grep -q 'bob-intruso: salida' "$R/ultimo.err" \
  && ok "  nombra secreto, declarado y salida" || mal "  no nombra los tres motivos"
docker rm -f bob-intruso >/dev/null
# Otro bob-* en la red de entrada: la excepción es de bob-web, no de la red.
docker run -d --name bob-intruso --network $RE --label bob.vecina=bob "$IMG_A" node -e 'setInterval(()=>{},1e6)' >/dev/null
espera 1 "no-aislada:" "otro bob-* en la red de entrada (la excepción es solo de bob-web)" -- "$AIS"
grep -q "bob-intruso: salida: $RE no es internal" "$R/ultimo.err" && ok "  nombra la salida por la red de entrada" || mal "  no nombra la salida por $RE"
docker rm -f bob-intruso >/dev/null
docker network connect $RX bob-web
espera 1 "no-aislada:" "bob-web unido a una red no declarada y con salida" -- "$AIS"
docker network disconnect $RX bob-web
espera 1 "no-aislada:" "estricto (BOB_SALIDA_ACEPTADA vacía): bob-web en la red de entrada sale" -- env BOB_SALIDA_ACEPTADA= "$AIS"
printf 'X=1\nSUPABASE_SERVICE_ROLE_KEY=%s\n' "$JWT" >> "$R/secrets/app.env"
espera 1 "no-aislada:" "la service role en el fichero montado de bob-web" -- "$AIS"
sed -i.bak '/SERVICE_ROLE/d; /^X=1$/d' "$R/secrets/app.env" && rm -f "$R/secrets/app.env.bak"
espera 0 "aislada:" "otra vez limpio" -- "$AIS"

echo
if [ "$FALLOS" = 0 ]; then echo "banco: todo lo esperado pasó"; exit 0; fi
echo "banco: $FALLOS cosa(s) no pasaron"; exit 1
