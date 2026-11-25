#!/usr/bin/env bash
# Despliega una imagen de BOb al lado de la caja (Bzzz D77 §8). Lo corre Henry, a mano, en la caja.
# Runbook: docs/caja/instalar-y-volver-atras.md.
#
# USO
#   deploy.sh [--feeder] --imagen <bob-web-xxx.tar> --atestacion <bob-web-xxx.atestacion> [--migrar <fichero.sql>]...
#
# EN ESTE ORDEN, y se para en el primer paso que falla:
#   0. copia el tar y la atestación a una carpeta de root (/opt/bob/entrega): lo que se comprueba es lo que se carga;
#   1. lee esa copia SIN cargarla: una sola imagen, ninguna etiqueta que no sea <servicio>:<12 hex>, y su id (el
#      sha256 de su configuración, la identidad que firma la atestación en cualquier almacén de docker); el sha256
#      del tar tiene que ser el de la atestación;
#   2. comprueba la atestación firmada contra ese id con el guion de Bzzz (#407). Sin una que case, no carga nada;
#   3. carga la imagen (docker load) y busca su referencia local: con overlay2 es la config; con el almacén de
#      containerd, el digest al que apunta el index.json del tar. Esa referencia es la que corre y la que se guarda;
#   4. solo con --migrar: aplica esas migraciones, en el orden dado, cada una en su transacción, como bob_migrador,
#      desde un contenedor desechable en la red de la vecina, contra la base, el puerto y el nombre de caja.env. La
#      contraseña la lee este guion de /opt/bob/secrets/migrador.env y se la pasa por stdin: no va al entorno ni a la
#      línea de órdenes. Si una falla, se para y la aplicación sigue con la imagen de antes;
#   5. guarda la imagen que corre como anterior, pone la nueva y levanta;
#   6. comprueba: el contenedor sano, la puerta por Traefik (obligatoria para bob-web) y el aislamiento;
#   7. si la nueva no queda sana, vuelve a la anterior, con su atestación comprobada otra vez. Si lo que falla es
#      la seguridad (aislamiento roto o Traefik sin la puerta delante), NO vuelve atrás: para todo lo de BOb.
#   Las migraciones NO se deshacen: tras una, la vuelta atrás pone la imagen vieja sobre el esquema nuevo. La vuelta
#   atrás de datos es del esquema `bob` (D77 77.14), aparte. Los .sql tampoco van ligados al commit atestado.
#
# SALIDA (una línea por stdout; el detalle, por stderr):
#   0  «desplegada: <id>»
#   1  «vuelta-atras: …» o «fallo: …»   la nueva no quedó sana o no es segura (y se dice cómo quedó la caja)
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
for c in docker python3 curl; do command -v "$c" >/dev/null || no_empieza "falta $c"; done
[ -f "$BOB_COMPOSE" ] || no_empieza "no está $BOB_COMPOSE"
[ -f "$BOB_ENV" ] || no_empieza "no está $BOB_ENV (BOB_HOST y, después del primer deploy, las imágenes)"
CAJA_ENV=$BOB_RAIZ/config/caja.env
[ -f "$CAJA_ENV" ] || no_empieza "no está $CAJA_ENV"
for s in app.env $( [ "$COMP" = feeder ] && echo feeder.env ) $( [ "${#MIGR[@]}" -gt 0 ] && echo migrador.env ); do
  f=$BOB_RAIZ/secrets/$s
  [ -f "$f" ] || no_empieza "falta $f (lo deja generar-secretos-vecina.sh de Bzzz)"
  m=$(stat -c %a "$f" 2>/dev/null || stat -f %Lp "$f")
  [ "$m" = 600 ] || [ "$m" = 400 ] || no_empieza "$f tiene permisos $m: tiene que ser 600"
done
[ "$COMP" = web ] && fijar_url_salud

say "== 0. copiar lo recibido a una carpeta de root"
P=$(carpeta_privada) || no_empieza "no puedo crear la carpeta privada en $BOB_RAIZ/entrega"
trap 'rm -rf "$P"' EXIT
NOMBRE_AT=$(basename "$AT")
cp "$TAR" "$P/imagen.tar" && cp "$AT" "$P/$NOMBRE_AT" && cp "$AT.sig" "$P/$NOMBRE_AT.sig" \
  || no_empieza "no pude copiar el tar y la atestación a $P"
TAR=$P/imagen.tar; AT=$P/$NOMBRE_AT

say "== 1. leer el tar sin cargarlo"
SAL=$(id_del_tar "$TAR") || no_empieza "el tar no se acepta: $SAL"
ID=${SAL%% *}; OBJ=${SAL##* }
es_id "$ID" && es_id "$OBJ" || no_empieza "no saco el id de la imagen del tar"
say "   config $ID · objetivo $OBJ"
TSHA=$(sha256_de "$TAR")
[ "$TSHA" = "$(clave_de imagen_tar_sha256 "$AT")" ] || no_empieza "el sha256 del tar ($TSHA) no es el de la atestación"

say "== 2. atestación"
LINEA=$(atestar "$AT" "$ID"); RC=$?
say "   $LINEA"
[ "$RC" = 0 ] || no_empieza "la imagen no está atestada: $LINEA"

say "== 3. cargar"
docker load -q -i "$TAR" >&2 || no_empieza "docker load falló"
REF=$(ref_cargada "$ID" "$OBJ") || no_empieza "después de cargar no está ni $ID ni $OBJ"
say "   referencia local: $REF"
rm -f "$TAR"
mkdir -p "$BOB_RAIZ/atestaciones"
# Nombre único: una atestación nueva no pisa la de la imagen anterior, que la vuelta atrás vuelve a comprobar.
GUARDADA=$BOB_RAIZ/atestaciones/$SERVICIO-${ID:7:12}-$(date -u +%Y%m%dT%H%M%SZ)-$$.atestacion
cp "$AT" "$GUARDADA" && cp "$AT.sig" "$GUARDADA.sig" || no_empieza "no pude guardar la atestación en $BOB_RAIZ/atestaciones"

if [ "${#MIGR[@]}" -gt 0 ]; then
  say "== 4. migraciones con bob_migrador (${#MIGR[@]})"
  HOST=$(clave_de BOB_DB_HOST "$CAJA_ENV"); PORT=$(clave_de BOB_DB_PORT "$CAJA_ENV"); BASE=$(clave_de BOB_DB_NAME "$CAJA_ENV")
  PORT=${PORT:-5432}; BASE=${BASE:-postgres}
  [ -n "$HOST" ] || no_empieza "no hay BOB_DB_HOST en $CAJA_ENV"
  U=$(clave_de BOB_MIGRADOR_USUARIO "$BOB_RAIZ/secrets/migrador.env")
  [ "$U" = bob_migrador ] || no_empieza "migrador.env no es de bob_migrador («$U»)"
  for m in "${MIGR[@]}"; do
    say "   $(basename "$m") → $HOST:$PORT/$BASE"
    # La contraseña entra por stdin: ni por -e (la devuelve docker inspect) ni por argumento (la ve ps).
    if ! clave_de BOB_MIGRADOR_CLAVE "$BOB_RAIZ/secrets/migrador.env" | \
        docker run -i --rm --network "$BOB_RED_VECINA" --read-only --cap-drop ALL --security-opt no-new-privileges:true \
        --user 65534:65534 --memory 256m --entrypoint sh \
        -v "$(cd "$(dirname "$m")" && pwd)/$(basename "$m"):/migracion.sql:ro" \
        -e "PGHOST=$HOST" -e "PGPORT=$PORT" -e "PGDATABASE=$BASE" -e "PGUSER=$U" "$BOB_PSQL_IMAGEN" -c '
          IFS= read -r PGPASSWORD; export PGPASSWORD
          exec psql -X -q -v ON_ERROR_STOP=1 --single-transaction -f /migracion.sql' >&2; then
      echo "fallo: la migración $(basename "$m") no se aplicó (las anteriores de esta lista sí); la aplicación sigue con la imagen de antes"
      exit 1
    fi
  done
else
  say "== 4. sin --migrar: no se toca la base"
fi

say "== 5. poner $ID"
ANT_ID=$(docker inspect -f '{{.Image}}' "$SERVICIO" 2>/dev/null || true)
ANT_AT=$(leer "${CLAVE}_ATESTACION")
if es_id "$ANT_ID" && [ "$ANT_ID" != "$REF" ]; then
  escribir "${CLAVE}_IMAGEN_ANTERIOR" "$ANT_ID" "${CLAVE}_ATESTACION_ANTERIOR" "$ANT_AT"
  say "   anterior: $ANT_ID"
elif [ "$ANT_ID" = "$REF" ]; then
  say "   ya corría esta imagen: la anterior guardada no cambia"
  ANT_ID=$(leer "${CLAVE}_IMAGEN_ANTERIOR"); ANT_AT=$(leer "${CLAVE}_ATESTACION_ANTERIOR")
else
  say "   primera instalación: no hay anterior"
  ANT_ID=
fi

say "== 6. comprobar"
poner "$REF" "$GUARDADA"; RC=$?
case "$RC" in
  0) echo "desplegada: $ID ($SERVICIO)"; exit 0 ;;
  3) echo "fallo: $ID no es segura (aislamiento roto o sin la puerta delante); todo lo de BOb queda parado"; exit 1 ;;
esac

say "== 7. la nueva no quedó sana: vuelta atrás"
if ! es_id "${ANT_ID:-}"; then
  compose stop "$SERVICIO" >&2 || true
  echo "fallo: $ID no quedó sana y no hay imagen anterior; $SERVICIO queda parado"
  exit 1
fi
ANT_CFG=$(config_de "$ANT_ID")
LINEA=$(atestar "$ANT_AT" "${ANT_CFG:-sin-config}"); RC=$?
say "   atestación de la anterior: $LINEA"
if [ "$RC" != 0 ]; then
  compose stop "$SERVICIO" >&2 || true
  echo "fallo: $ID no quedó sana y la anterior $ANT_ID no está atestada ($LINEA); $SERVICIO queda parado"
  exit 1
fi
# La imagen nueva queda como «anterior» para poder mirarla; la que vuelve es la que corría.
escribir "${CLAVE}_IMAGEN_ANTERIOR" "$REF" "${CLAVE}_ATESTACION_ANTERIOR" "$GUARDADA"
poner "$ANT_ID" "$ANT_AT"; RC=$?
case "$RC" in
  0) echo "vuelta-atras: $ID no quedó sana; corre otra vez $ANT_ID" ;;
  3) echo "fallo: $ID no quedó sana y la anterior $ANT_ID no es segura; todo lo de BOb queda parado" ;;
  *) parar_todo; echo "fallo: $ID no quedó sana y la vuelta a $ANT_ID tampoco; todo lo de BOb queda parado" ;;
esac
exit 1
