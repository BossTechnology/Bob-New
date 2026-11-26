# shellcheck shell=bash
# Lo que en una caja es fijo (Bzzz D77). Lo cargan deploy.sh, rollback.sh y comprobar-aislamiento.sh.
#
# Ninguno de estos valores sale del entorno en una caja: si alguno viene puesto con otro valor, el guion no
# empieza. Solo el banco local puede cambiarlos, y solo si se cumplen las tres cosas:
#   - BOB_BANCO=1;
#   - la máquina NO tiene /opt/bzzz (un BOB_BANCO=1 olvidado en una caja no apaga nada);
#   - BOB_BANCO_MARCA apunta a la marca que crea banco.sh: un fichero normal (no un enlace), de quien corre esto,
#     fuera de /opt, cuya única línea es «banco-bobcaja <la carpeta del banco>» y que está en esa carpeta.
#
# Uso: FIJOS_NO=«prefijo de la línea de salida con rc 2» y después `. fijos.sh`.

bob_banco() {
  local m=${BOB_BANCO_MARCA:-}
  [ "${BOB_BANCO:-}" = 1 ] && [ ! -e /opt/bzzz ] && [ ! -L /opt/bzzz ] || return 1
  [ -n "$m" ] && [ -f "$m" ] && [ ! -L "$m" ] && [ -O "$m" ] || return 1
  case "$m" in /opt/*) return 1 ;; esac
  [ "$(cat "$m")" = "banco-bobcaja $(dirname "$m")" ]
}

# fijo NOMBRE VALOR_DE_CAJA
fijo() {
  local n=$1 v=$2
  if [ -n "${!n+x}" ] && [ "${!n}" != "$v" ]; then
    bob_banco || { echo "${FIJOS_NO:-no-empieza}: $n viene del entorno con otro valor; en una caja es fijo ($v)"; exit 2; }
  else
    printf -v "$n" '%s' "$v"
  fi
  export "${n?}"
}

fijo BOB_RAIZ /opt/bob
fijo BOB_COMPROBAR_ATESTACION /opt/bzzz/scripts/comprobar-atestacion-bob.sh
fijo BOB_FIRMANTES /opt/bzzz/config/bob/firmantes_imagen
BOB_COMPOSE=$BOB_RAIZ/compose.yml
BOB_ENV=$BOB_RAIZ/.env
BOB_PROYECTO=bob
export BOB_COMPOSE BOB_ENV BOB_PROYECTO

# Las redes y lo que cada servicio puede tocar: de D77 (insumos §2.2 y §5), no de /opt/bob/compose.yml, que es lo
# que se protege. El banco crea redes con estos mismos nombres.
BOB_RED_VECINA=bzzz-vecina-bob
BOB_RED_ENTRADA=bzzz-edge
