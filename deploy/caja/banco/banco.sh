#!/usr/bin/env bash
# Banco local de BOb al lado de la caja. NUNCA en una caja: crea y borra contenedores, redes e imágenes propias, y se
# niega a correr si existe /opt/bzzz o si las redes de la caja ya existen.
#
# Imita la caja con lo mínimo que hace falta para que el paquete se pruebe de verdad:
#   - las redes con sus nombres de caja: bzzz-vecina-bob (internal) y bzzz-edge (con salida);
#   - la base de la caja (supabase/postgres:17.6.1.136, la misma imagen) con bob_app (CONNECTION LIMIT 10) y
#     bob_migrador (con el migrador.env del alta, que este paquete no lee), y el GoTrue de Supabase, con los alias bzzz-supabase-db y bzzz-supabase-auth;
#   - un Traefik con la versión de la caja, el proveedor de Docker y los middlewares con sus nombres de caja. La
#     puerta (puerta-apps) es un forwardAuth a un contenedor que niega (401) sin la cabecera de sesión del banco;
#   - imágenes etiquetadas como las deja construir-imagen-bob.sh (bob-web:<12 hex>) y atestadas con el comprobador
#     de Bzzz y una llave SSH de usar y tirar.
# Lo fijo de la caja (fijos.sh) solo se cambia con BOB_BANCO=1, que este banco pone.
#
# USO
#   deploy/caja/banco/banco.sh <imagen de bob-web ya construida> <comprobar-atestacion-bob.sh de Bzzz>
#   p. ej. docker build -t bob-web:banco-a . && deploy/caja/banco/banco.sh bob-web:banco-a ../Bzzz/scripts/comprobar-atestacion-bob.sh
# SALIDA: 0 todo lo esperado pasó · 1 algo no · 2 no empezó
set -uo pipefail

[ "$#" = 2 ] || { echo "no-empieza: uso: $0 <imagen bob-web> <comprobar-atestacion-bob.sh>"; exit 2; }
IMG=$1; CHECKER=$2
[ ! -e /opt/bzzz ] || { echo "no-empieza: hay /opt/bzzz: esto es una caja, no un banco"; exit 2; }
for c in docker ssh-keygen curl python3 openssl; do command -v "$c" >/dev/null || { echo "no-empieza: falta $c"; exit 2; }; done
docker image inspect "$IMG" >/dev/null 2>&1 || { echo "no-empieza: no está la imagen $IMG"; exit 2; }
[ -f "$CHECKER" ] || { echo "no-empieza: no encuentro $CHECKER"; exit 2; }
if docker ps -aq --filter name='^bob-' | grep -q .; then echo "no-empieza: ya hay contenedores bob-* en este demonio"; exit 2; fi
RV=bzzz-vecina-bob; RE=bzzz-edge; RX=banco-bobcaja-otra; RD=bzzz-data
for r in $RV $RE $RD $RX; do
  docker network inspect $r >/dev/null 2>&1 && { echo "no-empieza: ya existe la red $r en este demonio"; exit 2; }
done

CAJA=$(cd "$(dirname "$0")/.." && pwd)
PG_IMG=supabase/postgres@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00
GOTRUE_IMG=${BANCO_GOTRUE_IMAGEN:-public.ecr.aws/supabase/gotrue:v2.197.0}
TRAEFIK_IMG=traefik@sha256:9c437ac4f09ce6f4980a8544902d3475fdf70a1a7c578729581d2535dfa7d635
P=banco-bobcaja
PUERTO=${BANCO_PUERTO:-18443}
HOST=bob.banco.test
HA=aaaaaaaaaaaa; HB=bbbbbbbbbbbb; HM=cccccccccccc; HS=dddddddddddd   # las <12 hex> de cada imagen
AJENA=$P-ajena:local

R=$(mktemp -d "${TMPDIR:-/tmp}/bobcaja.XXXXXX"); R=$(cd "$R" && pwd -P)
limpiar() {
  docker compose -p bob -f "$R/compose.yml" --env-file "$R/.env" --profile feeder down -t 2 >/dev/null 2>&1
  docker rm -f bob-intruso $P-db $P-auth $P-traefik $P-puerta >/dev/null 2>&1
  docker network rm $RV $RE $RX $RD >/dev/null 2>&1
  docker rmi -f bob-web:$HA bob-web:$HB bob-web:$HM bob-web:$HS $AJENA >/dev/null 2>&1
  rm -rf "$R"
}
trap limpiar EXIT
# Interrumpido o matado también limpia: sin esto, un kill deja las redes y bloquea los bancos de otros.
trap 'exit 130' INT TERM HUP

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
cierto() { if eval "$2"; then ok "$1"; else mal "$1"; fi; }
corre() { docker inspect -f '{{.Image}}' bob-web 2>/dev/null; }
en_marcha() { [ "$(docker inspect -f '{{.State.Running}}' bob-web 2>/dev/null)" = true ]; }
id_de() { docker image inspect -f '{{.Id}}' "$1" 2>/dev/null; }
clave() { openssl rand -hex 24; }
por_traefik() { curl -sk -o /dev/null -w '%{http_code}' --resolve "$HOST:$PUERTO:127.0.0.1" "$@" "https://$HOST:$PUERTO/api/health"; }

echo "== banco en $R"
# --- redes -------------------------------------------------------------------------------------------------
docker network create --internal $RV >/dev/null && docker network create $RE >/dev/null \
  && docker network create $RX >/dev/null && docker network create --internal $RD >/dev/null \
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
  docker run --rm --network $RV "$IMG" node -e "fetch('http://bzzz-supabase-auth:9999/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null && break
  sleep 2
done

# --- Traefik de prueba y una puerta que niega sin sesión --------------------------------------------------------
docker run -d --name $P-puerta --network $RE "$IMG" node -e "require('http').createServer((q,s)=>{s.statusCode=q.headers['x-banco-sesion']==='si'?200:401;s.end()}).listen(4180)" >/dev/null \
  || { echo "no-empieza: no arrancó la puerta de banco"; exit 2; }
mkdir -p "$R/traefik"
puerta_de_verdad() {
  cat > "$R/traefik/middlewares.yml" <<'YML'
# Con los nombres de la caja. La puerta de verdad (forwardAuth a /verificar/app) es de Bzzz; esta niega sin sesión.
http:
  middlewares:
    puerta-apps:
      forwardAuth: { address: "http://banco-bobcaja-puerta:4180/" }
    cabeceras:
      headers: { frameDeny: true, contentTypeNosniff: true }
    login-ritmo:
      rateLimit: { average: 5, burst: 10 }
YML
}
puerta_que_no_cierra() {   # el mismo nombre, pero deja pasar a cualquiera
  sed -i.bak 's|forwardAuth: { address: "http://banco-bobcaja-puerta:4180/" }|headers: { customResponseHeaders: { X-Banco: "abierta" } }|' "$R/traefik/middlewares.yml"
  rm -f "$R/traefik/middlewares.yml.bak"
}
puerta_de_verdad
docker run -d --name $P-traefik --network $RE -p 127.0.0.1:$PUERTO:443 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro -v "$R/traefik:/etc/traefik/dynamic:ro" "$TRAEFIK_IMG" \
  --providers.docker=true --providers.docker.exposedbydefault=false \
  --providers.file.directory=/etc/traefik/dynamic --providers.file.watch=true --entrypoints.websecure.address=:443 \
  --certificatesresolvers.le.acme.storage=/tmp/acme.json --certificatesresolvers.le.acme.tlschallenge=true \
  --certificatesresolvers.le.acme.caserver=https://127.0.0.1:1/directory \
  --global.checknewversion=false --global.sendanonymoususage=false >/dev/null \
  || { echo "no-empieza: no arrancó Traefik"; exit 2; }

# --- /opt/bob de banco ---------------------------------------------------------------------------------------
mkdir -p "$R/config" "$R/secrets" "$R/entrega"
cp "$CAJA/compose.yml" "$R/compose.yml"
printf 'BOB_HOST=%s\nBOB_RAIZ=%s\n' "$HOST" "$R" > "$R/.env"
cat > "$R/config/caja.env" <<EOF
BOB_ORG_ID=00000000-0000-4000-8000-00000000b0b0
BOB_GOTRUE_URL=http://bzzz-supabase-auth:9999
BOB_DB_HOST=bzzz-supabase-db
EOF
printf 'BOB_APP_USUARIO=bob_app\nBOB_APP_CLAVE=%s\n' "$APPPW" > "$R/secrets/app.env"
# Como lo deja el alta de Bzzz (generar-secretos-vecina.sh bob): de root en la caja, lo lee `firma-instalacion … resto`
# de BOb-engine y nada de este paquete. Aquí está para que deploy.sh lo vea en secrets/ y lo acepte.
printf 'MIGRADOR_USUARIO=bob_migrador\nMIGRADOR_CLAVE=%s\nMIGRADOR_HOST=bzzz-supabase-db\nMIGRADOR_RED=%s\n' "$MIGPW" "$RV" > "$R/secrets/migrador.env"
chmod 600 "$R/secrets/"*.env
cp "$R/secrets/app.env" "$R/app.env.limpio"

ssh-keygen -q -t ed25519 -N '' -C banco -f "$R/llave" || { echo "no-empieza: ssh-keygen"; exit 2; }
printf 'banco@bob namespaces="bzzz-bob-imagen" %s\n' "$(cut -d' ' -f1,2 "$R/llave.pub")" > "$R/firmantes"
# El comprobador de Bzzz (#454) necesita id-de-imagen.sh a su lado: se copian los dos, como llegan a la caja.
[ -f "$(dirname "$CHECKER")/id-de-imagen.sh" ] || { echo "no-empieza: falta id-de-imagen.sh junto a $CHECKER"; exit 2; }
cp "$CHECKER" "$R/comprobar-atestacion-bob.sh"; cp "$(dirname "$CHECKER")/id-de-imagen.sh" "$R/id-de-imagen.sh"
chmod +x "$R/comprobar-atestacion-bob.sh" "$R/id-de-imagen.sh"

printf 'banco-bobcaja %s\n' "$R" > "$R/.banco-bobcaja"   # la marca que fijos.sh exige además de BOB_BANCO=1
export BOB_BANCO=1 BOB_BANCO_MARCA=$R/.banco-bobcaja BOB_RAIZ=$R BOB_COMPROBAR_ATESTACION=$R/comprobar-atestacion-bob.sh BOB_FIRMANTES=$R/firmantes
export BOB_URL_SALUD="https://$HOST:$PUERTO/api/health" BOB_URL_SALUD_RESOLVER="$HOST:$PUERTO:127.0.0.1" BOB_ESPERA_SALUD=150

# --- imágenes, tars y atestaciones ----------------------------------------------------------------------------
derivar() { printf 'FROM %s\n%s\n' "$IMG" "$2" | docker build -q -t "$1" - >/dev/null; }
docker tag "$IMG" bob-web:$HA
derivar bob-web:$HB 'LABEL banco.version="b"' || { echo "no-empieza: imagen b"; exit 2; }
derivar bob-web:$HM 'CMD ["node","-e","setInterval(()=>{},1e6)"]' || { echo "no-empieza: imagen mala"; exit 2; }   # corre pero no contesta
derivar bob-web:$HS 'LABEL banco.version="sin-atestar"' || { echo "no-empieza: imagen sin atestar"; exit 2; }
derivar $AJENA 'LABEL banco.version="ajena"' || { echo "no-empieza: imagen ajena"; exit 2; }
A=$(id_de bob-web:$HA); B=$(id_de bob-web:$HB); MALA=$(id_de bob-web:$HM); SIN=$(id_de bob-web:$HS); Z=$(id_de $AJENA)

firmar() {  # firmar <nombre> <id que dice la atestación> [servicio]: <nombre>.atestacion y .sig sobre <nombre>.tar
  local n=$1 id=$2
  cat > "$R/entrega/$n.atestacion" <<EOF
formato=bzzz-bob-atestacion/1
commit=$(git -C "$CAJA" rev-parse HEAD 2>/dev/null || printf '0%.0s' $(seq 40))
repo=BossTechnology/Bob-New
imagen_id=$id
servicio=${3:-bob-web}
comando=banco local
imagen_tar_sha256=$(openssl dgst -sha256 -r "$R/entrega/$n.tar" | cut -d' ' -f1)
dockerfile_sha256=banco
dockerfile=Dockerfile
EOF
  ssh-keygen -q -Y sign -f "$R/llave" -n bzzz-bob-imagen "$R/entrega/$n.atestacion" >/dev/null 2>&1
}
entregar() { docker save -o "$R/entrega/$1.tar" "${@:3}" && firmar "$1" "$2"; }
entregar a "$A" bob-web:$HA
entregar b "$B" bob-web:$HB
entregar mala "$MALA" bob-web:$HM
entregar sin-atestar "$A" bob-web:$HS                      # firmada, pero con el id de otra imagen
docker tag bob-web:$HB $AJENA                              # B solo con una etiqueta que «la caja usa»
entregar ajena "$B" $AJENA
docker tag "$Z" $AJENA                                     # la etiqueta vuelve a su imagen
entregar dos "$A" bob-web:$HA bob-web:$HB                  # dos imágenes en un tar
docker save -o "$R/entrega/otro-servicio.tar" bob-web:$HA && firmar otro-servicio "$A" bob-feeder   # A, firmada como feeder
python3 -I "$CAJA/banco/tar-con-indice.py" "$R/entrega/a.tar" "$R/entrega/indice.tar" 1    # index.json → índice amd64 + atestación
python3 -I "$CAJA/banco/tar-con-indice.py" "$R/entrega/a.tar" "$R/entrega/indice-doble.tar" 2
python3 -I "$CAJA/banco/tar-con-indice.py" "$R/entrega/a.tar" "$R/entrega/indice-hibrido.tar" 1 hibrido
docker rmi bob-web:$HS >/dev/null                          # para ver que un tar rechazado no se carga

D="$CAJA/deploy.sh"; RB="$CAJA/rollback.sh"; AIS="$CAJA/comprobar-aislamiento.sh"
# BANCO_CONTAINERD=1: los guiones de la caja ven un docker que se porta como el almacén de containerd (.Id y .Image
# son el objetivo del índice, la config no es una referencia). El banco sigue usando el docker de verdad.
if [ "${BANCO_CONTAINERD:-0}" = 1 ]; then
  F=$R/falso; mkdir -p "$F"
  export BANCO_DOCKER_REAL; BANCO_DOCKER_REAL=$(command -v docker); export BANCO_MAPA_CONTAINERD=$R/mapa-containerd
  ln -s "$CAJA/banco/docker-containerd-falso.sh" "$F/docker"
  for g in deploy rollback comprobar-aislamiento; do
    printf '#!/usr/bin/env bash\nPATH=%q:"$PATH" exec %q "$@"\n' "$F" "$CAJA/$g.sh" > "$F/$g.sh"; chmod +x "$F/$g.sh"
  done
  D=$F/deploy.sh; RB=$F/rollback.sh; AIS=$F/comprobar-aislamiento.sh
  echo "== con un docker que imita containerd"
fi
# Lo que corre bob-web, como lo ve la caja (con containerd, el objetivo): para comparar con el .env.
objetivo_de() { if [ -f "${BANCO_MAPA_CONTAINERD:-/nada}" ]; then awk -v c="$1" '$2==c{print $1; exit}' "$BANCO_MAPA_CONTAINERD"; else echo "$1"; fi; }
dep() { "$D" --imagen "$R/entrega/$1.tar" --atestacion "$R/entrega/$1.atestacion" "${@:2}"; }

echo "== lo fijo de la caja no se cambia desde el entorno"
espera 2 "no-empieza: BOB_FIRMANTES" "deploy con BOB_FIRMANTES de otro sitio y sin BOB_BANCO" -- env -u BOB_BANCO -u BOB_RAIZ -u BOB_COMPROBAR_ATESTACION "$D" --imagen "$R/entrega/a.tar" --atestacion "$R/entrega/a.atestacion"
espera 2 "no-medible:" "el chequeo con BOB_RAIZ de otro sitio y sin BOB_BANCO" -- env -u BOB_BANCO "$AIS"
espera 2 "no-empieza: BOB_RAIZ" "BOB_BANCO=1 sin la marca del banco" -- env -u BOB_BANCO_MARCA "$D" --imagen "$R/entrega/a.tar" --atestacion "$R/entrega/a.atestacion"
printf 'banco-bobcaja /otra\n' > "$R/marca-falsa"
espera 2 "no-empieza: BOB_RAIZ" "BOB_BANCO=1 con una marca que no es de esta carpeta" -- env BOB_BANCO_MARCA="$R/marca-falsa" "$D" --imagen "$R/entrega/a.tar" --atestacion "$R/entrega/a.atestacion"
espera 2 "no-medible:" "BOB_SALIDA_ACEPTADA ya no existe" -- env BOB_SALIDA_ACEPTADA=bob-web=bzzz-data "$AIS"
A_DEP=(--imagen "$R/entrega/a.tar" --atestacion "$R/entrega/a.atestacion")
if [ "$(id -u)" != 0 ]; then
  espera 2 "no-empieza: hay que correrlo como root" "deploy sin nada del banco y sin ser root (llega a la guarda de root)" -- \
    env -u BOB_BANCO -u BOB_BANCO_MARCA -u BOB_RAIZ -u BOB_COMPROBAR_ATESTACION -u BOB_FIRMANTES -u BOB_URL_SALUD -u BOB_URL_SALUD_RESOLVER "$D" "${A_DEP[@]}"
  espera 2 "no-empieza: hay que correrlo como root" "rollback sin nada del banco y sin ser root" -- \
    env -u BOB_BANCO -u BOB_BANCO_MARCA -u BOB_RAIZ -u BOB_COMPROBAR_ATESTACION -u BOB_FIRMANTES -u BOB_URL_SALUD -u BOB_URL_SALUD_RESOLVER "$RB"
else
  echo "SALTA la guarda de root: este banco corre como root, así que no puede verla fallar"
fi
espera 2 "no-empieza: BOB_ESPERA_SALUD" "BOB_ESPERA_SALUD=08 (octal en \$(( )))" -- env BOB_ESPERA_SALUD=08 "$D" "${A_DEP[@]}"
espera 2 "no-empieza: BOB_ESPERA_SALUD" "BOB_ESPERA_SALUD=0" -- env BOB_ESPERA_SALUD=0 "$D" "${A_DEP[@]}"
espera 2 "no-empieza: BOB_ESPERA_SALUD" "BOB_ESPERA_SALUD=3m" -- env BOB_ESPERA_SALUD=3m "$D" "${A_DEP[@]}"
ln -s app.env "$R/secrets/vecinos.key"
espera 2 "no-empieza: secrets/vecinos.key no es un fichero normal" "un enlace en secrets/ (se mira todo secrets/, no solo tres)" -- "$D" "${A_DEP[@]}"
rm "$R/secrets/vecinos.key"; mkdir "$R/secrets/raro"
espera 2 "no-empieza: secrets/raro no es un fichero normal" "un directorio en secrets/" -- "$D" "${A_DEP[@]}"
rmdir "$R/secrets/raro"; ln -s app.env "$R/secrets/..x"
espera 2 "no-empieza: secrets/..x no es un fichero normal" "un enlace «..x» en secrets/ (find, no un glob)" -- "$D" "${A_DEP[@]}"
rm "$R/secrets/..x"; chmod 644 "$R/secrets/app.env"
espera 2 "no-empieza: secrets/app.env tiene permisos 644" "app.env legible por otros" -- "$D" "${A_DEP[@]}"
chmod 600 "$R/secrets/app.env"; chmod 777 "$R/secrets"
espera 2 "no-empieza: $R/secrets tiene permisos 777" "secrets/ escribible por otros" -- "$D" "${A_DEP[@]}"
chmod 700 "$R/secrets"
mkdir -p "$R/padres/malo/hijo"; chmod 777 "$R/padres/malo"
cierto "comprobar_padres ve un padre escribible por otros" '[[ "$( (. "$CAJA/lib.sh"; comprobar_padres "$R/padres/malo/hijo" "$R" "$(id -u)") )" == *"padres/malo tiene permisos 777"* ]]'
chmod 755 "$R/padres/malo"
cierto "comprobar_padres da por buena la cadena arreglada" '( . "$CAJA/lib.sh"; comprobar_padres "$R/padres/malo/hijo" "$R" "$(id -u)" )'
rm -rf "$R/padres"

echo "== el paquete"
espera 2 "no-medible:" "aislamiento sin ningún bob-* (vacío no es aislado)" -- "$AIS"
espera 2 "no-empieza:" "rollback.sh sin deploy anterior" -- "$RB"
espera 0 "desplegada:" "deploy de A (atestada, sana, la puerta por Traefik, aislada)" -- dep a
cierto "corre A" '[ "$(corre)" = "$A" ]'
cierto "en .env queda la referencia local que ve la caja" '[ "$(sed -n "s/^BOB_WEB_IMAGEN=//p" "$R/.env")" = "$(objetivo_de "$A")" ]'
[ "${BANCO_CONTAINERD:-0}" = 1 ] && cierto "  y con containerd no es la config" '[ "$(objetivo_de "$A")" != "$A" ]'
cierto "por Traefik sin sesión: 401 de la puerta" '[ "$(por_traefik)" = 401 ]'
cierto "por Traefik con sesión: 200 de bob-web" '[ "$(por_traefik -H "X-Banco-Sesion: si")" = 200 ]'
espera 0 "aislada:" "aislamiento con bob-web en marcha" -- "$AIS"
espera 0 "desplegada:" "deploy de B" -- dep b
cierto "corre B" '[ "$(corre)" = "$B" ]'
espera 0 "vuelta-atras:" "rollback.sh" -- "$RB"
cierto "rollback.sh volvió a A" '[ "$(corre)" = "$A" ]'
espera 0 "vuelta-atras:" "rollback.sh otra vez (vuelve a B)" -- "$RB"
cierto "corre B otra vez" '[ "$(corre)" = "$B" ]'
espera 1 "vuelta-atras:" "deploy de una imagen que no queda sana (vuelve a B con su atestación comprobada)" -- dep mala
cierto "tras la mala, corre B" '[ "$(corre)" = "$B" ]'
grep -q 'atestación de la anterior: atestada' "$R/ultimo.err" && ok "  la vuelta atrás volvió a atestar la anterior" || mal "  la vuelta atrás no atestó la anterior"

echo "== el tar se lee antes de cargarlo"
espera 2 "no-empieza:" "un tar con la atestación de otra imagen" -- dep sin-atestar
espera 2 "no-empieza: la imagen no está atestada: no-atestada: la atestación es del servicio «bob-feeder»" "un tar de bob-web firmado como bob-feeder" -- dep otro-servicio
del_tar() { ( . "$CAJA/lib.sh"; componente web; id_del_tar "$1" ); }
cierto "id_del_tar sigue un índice hasta su manifiesto linux/amd64 (config = A)" '[ "$(del_tar "$R/entrega/indice.tar" | cut -d" " -f1)" = "$A" ]'
cierto "id_del_tar rechaza un índice con dos linux/amd64" '! del_tar "$R/entrega/indice-doble.tar" >/dev/null'
# Sin tubería: con pipefail, el rc 1 de del_tar haría fallar el caso aunque el mensaje sea el bueno.
cierto "id_del_tar rechaza un blob que es índice y manifiesto a la vez" '[[ "$(del_tar "$R/entrega/indice-hibrido.tar")" == *"ni un índice ni un manifiesto limpio"* ]]'
cierto "id_del_tar sigue leyendo bien un tar sin índice anidado (config = A)" '[ "$(del_tar "$R/entrega/a.tar" | cut -d" " -f1)" = "$A" ]'
cierto "  no se cargó: la imagen sigue sin estar en el disco" '[ -z "$(id_de "$SIN")" ]'
espera 2 "no-empieza: el tar no se acepta: nombra etiquetas" "un tar de una imagen que solo lleva la etiqueta $AJENA" -- dep ajena
cierto "  $AJENA sigue apuntando a su imagen" '[ "$(id_de $AJENA)" = "$Z" ]'
espera 2 "no-empieza: el tar no se acepta:" "un tar con dos imágenes" -- dep dos
cierto "  tras los tres, corre B" '[ "$(corre)" = "$B" ]'

echo "== sin migraciones"
espera 2 "no-empieza: argumento desconocido «--migrar»" "deploy.sh ya no migra (van por firma-instalacion … resto)" -- dep b --migrar "$R/no-existe.sql"
cierto "  y corre B" '[ "$(corre)" = "$B" ]'
# Como dejaban la caja los deploys con --migrar: corre A y la anterior es B, sana. Lo que sigue (la vuelta atrás con
# un secreto montado) necesita una anterior que quede sana para llegar al chequeo de aislamiento.
espera 0 "desplegada:" "deploy de A (la anterior queda B, no la mala)" -- dep a

echo "== el aislamiento, visto fallar"
JWT="eyJhbGciOiJIUzI1NiJ9.$(printf '{"role":"service_role","iss":"banco"}' | openssl base64 -A | tr '+/' '-_' | tr -d '=').firma-de-banco"
docker run -d --name bob-intruso -e SUPABASE_SERVICE_ROLE_KEY="$JWT" "$IMG" node -e 'setInterval(()=>{},1e6)' >/dev/null
espera 1 "no-aislada:" "un bob-intruso con la service role, sin declarar y en bridge" -- "$AIS"
grep -q 'bob-intruso: secreto' "$R/ultimo.err" && grep -q 'bob-intruso: declarado' "$R/ultimo.err" && grep -q 'bob-intruso: salida' "$R/ultimo.err" \
  && ok "  nombra secreto, declarado y salida" || mal "  no nombra los tres motivos"
docker rm -f bob-intruso >/dev/null
# Descubre, no enumera: MIGRADOR_CLAVE (la del alta de Bzzz) no está en ninguna lista y tiene que caer por el patrón.
docker run -d --name bob-intruso --network $RV --label bob.vecina=bob -e MIGRADOR_CLAVE=banco "$IMG" node -e 'setInterval(()=>{},1e6)' >/dev/null
espera 1 "no-aislada:" "un bob-* con MIGRADOR_CLAVE en el entorno" -- "$AIS"
grep -q 'bob-intruso: secreto: el entorno trae MIGRADOR_CLAVE' "$R/ultimo.err" && ok "  nombra MIGRADOR_CLAVE" || mal "  no nombra MIGRADOR_CLAVE"
docker rm -f bob-intruso >/dev/null
docker run -d --name bob-intruso --network $RV --label bob.vecina=bob -e BOB_ALGO_URL="postgresql://bob_migrador:banco@bzzz-supabase-db/postgres" "$IMG" node -e 'setInterval(()=>{},1e6)' >/dev/null
espera 1 "no-aislada:" "un bob-* con una URL con contraseña en el entorno" -- "$AIS"
grep -q 'bob-intruso: secreto: en el entorno, BOB_ALGO_URL lleva una contraseña' "$R/ultimo.err" && ! grep -q 'bob_migrador:banco' "$R/ultimo.err" \
  && ok "  nombra la variable y no dice la contraseña" || mal "  no nombra BOB_ALGO_URL, o dice la contraseña"
docker rm -f bob-intruso >/dev/null
docker run -d --name bob-intruso --network $RE --label bob.vecina=bob "$IMG" node -e 'setInterval(()=>{},1e6)' >/dev/null
espera 1 "no-aislada:" "otro bob-* en bzzz-edge (la excepción es solo de bob-web)" -- "$AIS"
grep -q "bob-intruso: salida: $RE no es internal" "$R/ultimo.err" && ok "  nombra la salida por bzzz-edge" || mal "  no nombra la salida por $RE"
docker rm -f bob-intruso >/dev/null
docker run -d --name bob-intruso --network $RV --label bob.vecina=bob -l traefik.enable=true -l 'traefik.tcp.routers.t.rule=HostSNI(`*`)' "$IMG" node -e 'setInterval(()=>{},1e6)' >/dev/null
espera 1 "no-aislada:" "un bob-* con un router TCP de Traefik" -- "$AIS"
grep -q 'bob-intruso: traefik: etiqueta traefik.tcp' "$R/ultimo.err" && ok "  nombra el router TCP" || mal "  no nombra el router TCP"
docker rm -f bob-intruso >/dev/null
docker network connect $RX bob-web
espera 1 "no-aislada:" "bob-web unido a una red no declarada y con salida" -- "$AIS"
docker network disconnect $RX bob-web
espera 1 "no-aislada:" "estricto (BOB_SALIDA_ESTRICTA=1): bob-web en bzzz-edge sale" -- env BOB_SALIDA_ESTRICTA=1 "$AIS"
espera 0 "aislada:" "otra vez limpio" -- "$AIS"

echo "== un fallo de seguridad para todo"
printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "$JWT" >> "$R/secrets/app.env"
espera 1 "fallo:" "rollback.sh con la service role en el app.env montado" -- "$RB"
grep -q 'bob-web: secreto: .*app.env trae SUPABASE_SERVICE_ROLE_KEY' "$R/ultimo.err" && ok "  paró por el secreto" || mal "  no paró por el secreto"
cierto "  bob-web quedó parado" '! en_marcha'
cp "$R/app.env.limpio" "$R/secrets/app.env"; chmod 600 "$R/secrets/app.env"
espera 0 "desplegada:" "deploy de A con app.env limpio" -- dep a
printf 'MIGRADOR_CLAVE=banco\n' >> "$R/secrets/app.env"
espera 1 "fallo:" "rollback.sh con MIGRADOR_CLAVE en el app.env montado" -- "$RB"
grep -q 'bob-web: secreto: .*app.env trae MIGRADOR_CLAVE' "$R/ultimo.err" && ok "  paró por MIGRADOR_CLAVE" || mal "  no paró por MIGRADOR_CLAVE"
cierto "  bob-web quedó parado" '! en_marcha'
cp "$R/app.env.limpio" "$R/secrets/app.env"; chmod 600 "$R/secrets/app.env"
espera 0 "desplegada:" "deploy de A con app.env limpio otra vez" -- dep a
puerta_que_no_cierra; sleep 3
espera 1 "fallo:" "deploy de B con Traefik sin la puerta delante (200 sin sesión)" -- dep b
grep -q 'puerta-apps@file NO está delante' "$R/ultimo.err" && ok "  paró por la puerta" || mal "  no paró por la puerta"
cierto "  bob-web quedó parado" '! en_marcha'
puerta_de_verdad; sleep 3
espera 0 "desplegada:" "deploy de A con la puerta otra vez" -- dep a
cp "$R/compose.yml" "$R/compose.limpio"
python3 -I - "$R/compose.yml" <<'PY'
import sys; p = sys.argv[1]; s = open(p).read()
s = s.replace("    networks: [vecina, entrada]\n", "    networks: [vecina, entrada, datos]\n", 1)
s += "  datos:\n    name: bzzz-data\n    external: true\n"
open(p, "w").write(s)
PY
espera 1 "fallo:" "deploy de B con bzzz-data añadida a bob-web en /opt/bob/compose.yml" -- dep b
grep -q 'bob-web: redes: en bzzz-data, que D77 no le da' "$R/ultimo.err" && ok "  la red la juzga D77, no el compose.yml" || mal "  no nombra bzzz-data"
cierto "  bob-web quedó parado" '! en_marcha'
cp "$R/compose.limpio" "$R/compose.yml"
espera 0 "desplegada:" "deploy de A con el compose de vuelta" -- dep a
espera 0 "aislada:" "al final, aislada" -- "$AIS"

echo
if [ "$FALLOS" = 0 ]; then echo "banco: todo lo esperado pasó"; exit 0; fi
echo "banco: $FALLOS cosa(s) no pasaron"; exit 1
