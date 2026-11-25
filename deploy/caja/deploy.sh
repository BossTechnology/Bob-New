#!/usr/bin/env bash
# Despliega una imagen de BOb al lado de la caja (Bzzz D77 §8). Lo corre Henry, a mano, en la caja.
# Runbook: docs/caja/instalar-y-volver-atras.md.
#
# USO
#   deploy.sh [--feeder] --imagen <bob-web-xxx.tar> --atestacion <bob-web-xxx.atestacion> [--migrar <fichero.sql>]...
#
# EN ESTE ORDEN, y se para en el primer paso que falla:
#   1. carga la imagen (docker load) y toma su id;
#   2. comprueba su atestación firmada con el guion de Bzzz (#407): sin una que case, no toca nada;
#   3. solo con --migrar: aplica esas migraciones, en el orden dado, cada una en su transacción, como
#      bob_migrador, desde un contenedor desechable en la red de la vecina. La contraseña la lee este guion
#      de /opt/bob/secrets/migrador.env y se la pasa por stdin: no va al entorno ni a la línea de órdenes.
#      Si una falla, se para: la aplicación sigue con la imagen de antes;
#   4. guarda la imagen que corre como anterior, pone la nueva y levanta;
#   5. comprueba la salud: el contenedor sano, la URL por Traefik si se dio BOB_URL_SALUD, y el
#      aislamiento (comprobar-aislamiento.sh);
#   6. si el paso 5 falla, vuelve a la imagen anterior y lo comprueba igual. Las migraciones NO se
#      deshacen: la vuelta atrás de datos es del esquema `bob` (D77 §3.2), aparte.
#
# SALIDA (una línea por stdout; el detalle, por stderr):
#   0  «desplegada: <id>»
#   1  «vuelta-atras: …» o «fallo: …»   la nueva no quedó sana (y se dice dónde quedó la caja)
#   2  «no-empieza: …»                   no se tocó nada que corra
set -uo pipefail
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

COMP=web; TAR=; AT=; MIGR=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --feeder) COMP=feeder; shift ;;
    --imagen) TAR=${2:-}; shift 2 ;;
    --atestacion) AT=${2:-}; shift 2 ;;
    --migrar) MIGR+=("${2:-}"); shift 2 ;;
    *) no_empieza "argumento desconocido «$1»" ;;
  esac
done
componente "$COMP"
[ -f "$TAR" ] || no_empieza "falta --imagen <tar> (o no existe)"
[ -f "$AT" ] && [ -f "$AT.sig" ] || no_empieza "falta --atestacion <fichero> con su .sig al lado"
for m in "${MIGR[@]}"; do [ -f "$m" ] || no_empieza "no existe la migración $m"; done
command -v docker >/dev/null || no_empieza "falta docker"
[ -f "$BOB_COMPOSE" ] || no_empieza "no está $BOB_COMPOSE"
[ -f "$BOB_ENV" ] || no_empieza "no está $BOB_ENV (BOB_HOST y, después del primer deploy, las imágenes)"
for s in app.env $( [ "$COMP" = feeder ] && echo feeder.env ) $( [ "${#MIGR[@]}" -gt 0 ] && echo migrador.env ); do
  f=$BOB_RAIZ/secrets/$s
  [ -f "$f" ] || no_empieza "falta $f (lo deja generar-secretos-vecina.sh de Bzzz)"
  m=$(stat -c %a "$f" 2>/dev/null || stat -f %Lp "$f")
  [ "$m" = 600 ] || [ "$m" = 400 ] || no_empieza "$f tiene permisos $m: tiene que ser 600"
done

say "== 1. cargar $TAR"
ID=$(docker load -q -i "$TAR" | sed -n 's/^Loaded image ID: //p; s/^Loaded image: //p' | tail -1)
[ -n "$ID" ] || no_empieza "docker load no dijo qué cargó"
es_id "$ID" || ID=$(docker image inspect -f '{{.Id}}' "$ID" 2>/dev/null)
es_id "$ID" || no_empieza "no saco el id de la imagen cargada"
say "   $ID"

say "== 2. atestación"
LINEA=$(atestar "$AT" "$ID"); RC=$?
say "   $LINEA"
[ "$RC" = 0 ] || no_empieza "la imagen no está atestada: $LINEA"
mkdir -p "$BOB_RAIZ/atestaciones"
GUARDADA=$BOB_RAIZ/atestaciones/$(basename "$AT")
if [ "$(cd "$(dirname "$AT")" && pwd)/$(basename "$AT")" != "$GUARDADA" ]; then
  cp "$AT" "$GUARDADA" && cp "$AT.sig" "$GUARDADA.sig" || no_empieza "no pude guardar la atestación en $BOB_RAIZ/atestaciones"
fi

if [ "${#MIGR[@]}" -gt 0 ]; then
  say "== 3. migraciones con bob_migrador (${#MIGR[@]})"
  RED=${BOB_RED_VECINA:-bzzz-vecina-bob}
  PSQL=${BOB_PSQL_IMAGEN:-supabase/postgres@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00}
  HOST=$(sed -n 's/^BOB_DB_HOST=//p' "$BOB_RAIZ/config/caja.env" | tail -1)
  [ -n "$HOST" ] || no_empieza "no hay BOB_DB_HOST en $BOB_RAIZ/config/caja.env"
  U=$(sed -n 's/^BOB_MIGRADOR_USUARIO=//p' "$BOB_RAIZ/secrets/migrador.env" | tail -1)
  [ "$U" = bob_migrador ] || no_empieza "migrador.env no es de bob_migrador («$U»)"
  for m in "${MIGR[@]}"; do
    say "   $(basename "$m")"
    # La contraseña entra por stdin: ni por -e (la devuelve docker inspect) ni por argumento (la ve ps).
    if ! sed -n 's/^BOB_MIGRADOR_CLAVE=//p' "$BOB_RAIZ/secrets/migrador.env" | tail -1 | \
        docker run -i --rm --network "$RED" --read-only --cap-drop ALL --security-opt no-new-privileges:true \
        --user 65534:65534 --memory 256m --entrypoint sh \
        -v "$(cd "$(dirname "$m")" && pwd)/$(basename "$m"):/migracion.sql:ro" \
        -e "PGHOST=$HOST" -e "PGUSER=$U" -e PGDATABASE="${BOB_DB_NAME:-postgres}" "$PSQL" -c '
          IFS= read -r PGPASSWORD; export PGPASSWORD
          exec psql -X -q -v ON_ERROR_STOP=1 --single-transaction -f /migracion.sql' >&2; then
      echo "fallo: la migración $(basename "$m") no se aplicó (las anteriores de esta lista sí); la aplicación sigue con la imagen de antes"
      exit 1
    fi
  done
else
  say "== 3. sin --migrar: no se toca la base"
fi

say "== 4. poner $ID"
ANT_ID=$(docker inspect -f '{{.Image}}' "$SERVICIO" 2>/dev/null || true)
ANT_AT=$(leer "${CLAVE}_ATESTACION")
if es_id "$ANT_ID" && [ "$ANT_ID" != "$ID" ]; then
  escribir "${CLAVE}_IMAGEN_ANTERIOR" "$ANT_ID" "${CLAVE}_ATESTACION_ANTERIOR" "$ANT_AT"
  say "   anterior: $ANT_ID"
elif [ "$ANT_ID" = "$ID" ]; then
  say "   ya corría esta imagen: la anterior guardada no cambia"
  ANT_ID=$(leer "${CLAVE}_IMAGEN_ANTERIOR"); ANT_AT=$(leer "${CLAVE}_ATESTACION_ANTERIOR")
else
  say "   primera instalación: no hay anterior"
  ANT_ID=
fi

say "== 5. salud"
if poner "$ID" "$GUARDADA"; then
  echo "desplegada: $ID ($SERVICIO)"
  exit 0
fi

say "== 6. la nueva no quedó sana: vuelta atrás"
if ! es_id "${ANT_ID:-}"; then
  compose stop "$SERVICIO" >&2 || true
  echo "fallo: $ID no quedó sana y no hay imagen anterior; $SERVICIO queda parado"
  exit 1
fi
# La imagen nueva queda como «anterior» para poder mirarla; la que vuelve es la que corría.
escribir "${CLAVE}_IMAGEN_ANTERIOR" "$ID" "${CLAVE}_ATESTACION_ANTERIOR" "$GUARDADA"
if poner "$ANT_ID" "$ANT_AT"; then
  echo "vuelta-atras: $ID no quedó sana; corre otra vez $ANT_ID"
else
  echo "fallo: $ID no quedó sana y la vuelta a $ANT_ID tampoco; mirar $SERVICIO a mano"
fi
exit 1
