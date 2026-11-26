#!/usr/bin/env bash
# Vuelve BOb a la imagen anterior (Bzzz D77 §8: «su vuelta a la imagen anterior por id»). Lo corre Henry, a mano.
# Runbook: docs/caja/instalar-y-volver-atras.md.
#
# USO
#   rollback.sh [--feeder]
#
# Toma de /opt/bob/.env la imagen anterior y su atestación, que dejó deploy.sh; comprueba otra vez esa atestación
# contra la imagen (que siga en el disco y que siga casando); la pone, levanta y comprueba la salud, la puerta por
# Traefik y el aislamiento igual que deploy.sh. La que corría pasa a ser la anterior: correrlo dos veces vuelve
# adonde estaba. Si lo que falla es la seguridad (aislamiento roto o sin la puerta delante), para todo lo de BOb.
#
# NO toca la base: las migraciones no se deshacen aquí. Tras una migración, esto pone la imagen vieja sobre el
# esquema nuevo; si no casan, la vuelta atrás es del esquema `bob` (D77 77.14), y eso es otro procedimiento.
#
# SALIDA (una línea por stdout; el detalle, por stderr):
#   0  «vuelta-atras: corre <id>»
#   1  «fallo: …»        la anterior no quedó sana o no es segura; se dice cómo quedó la caja
#   2  «no-empieza: …»   no se tocó nada
set -uo pipefail
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

COMP=web
case "${1:-}" in
  "") ;;
  --feeder) COMP=feeder ;;
  *) no_empieza "argumento desconocido «$1»" ;;
esac
componente "$COMP"
for c in docker python3 curl; do command -v "$c" >/dev/null || no_empieza "falta $c"; done
[ -f "$BOB_ENV" ] || no_empieza "no está $BOB_ENV"
[ -f "$BOB_RAIZ/secrets/app.env" ] || no_empieza "falta $BOB_RAIZ/secrets/app.env"
comprobar_raiz_y_secretos
[ "$COMP" = web ] && fijar_url_salud

ANT=$(leer "${CLAVE}_IMAGEN_ANTERIOR"); ANT_AT=$(leer "${CLAVE}_ATESTACION_ANTERIOR")
es_id "$ANT" || no_empieza "no hay ${CLAVE}_IMAGEN_ANTERIOR en $BOB_ENV: no hubo un deploy antes de este"
docker image inspect "$ANT" >/dev/null 2>&1 || no_empieza "la imagen anterior $ANT ya no está en el disco"
# La atestación firma la config. Con containerd, $ANT es otra cosa (el objetivo del índice): se saca la config de
# la imagen que hay en el disco, no de lo que diga .env.
ANT_CFG=$(config_de "$ANT")
LINEA=$(atestar "$ANT_AT" "${ANT_CFG:-sin-config}"); RC=$?
say "   atestación de la anterior: $LINEA"
[ "$RC" = 0 ] || no_empieza "la imagen anterior no está atestada: $LINEA"

ACT=$(docker inspect -f '{{.Image}}' "$SERVICIO" 2>/dev/null || leer "${CLAVE}_IMAGEN")
ACT_AT=$(leer "${CLAVE}_ATESTACION")
[ "$ACT" != "$ANT" ] || no_empieza "ya corre la imagen anterior ($ANT)"

say "== de ${ACT:-nada} a $ANT"
escribir "${CLAVE}_IMAGEN_ANTERIOR" "$ACT" "${CLAVE}_ATESTACION_ANTERIOR" "$ACT_AT"
poner "$ANT" "$ANT_AT"; RC=$?
case "$RC" in
  0) echo "vuelta-atras: corre $ANT ($SERVICIO)"; exit 0 ;;
  3) echo "fallo: $ANT no es segura (aislamiento roto o sin la puerta delante); todo lo de BOb queda parado"; exit 1 ;;
  4) echo "fallo: $ANT no es segura (aislamiento roto o sin la puerta delante) y NO se pudo parar todo lo de BOb (siguen: $PARAR_RESTOS): pararlo a mano"; exit 1 ;;
esac
fallo_y_parar "$ANT puesta en $BOB_ENV pero no quedó sana; la de antes ($ACT) es ahora la anterior: rollback.sh otra vez la devuelve"
exit 1
