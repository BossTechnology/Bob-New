# shellcheck shell=bash
# Lo que en una caja es fijo (Bzzz D77). Lo cargan deploy.sh, rollback.sh y comprobar-aislamiento.sh.
#
# Ninguno de estos valores sale del entorno en una caja: si alguno viene puesto con otro valor, el guion no
# empieza. Solo el banco local puede cambiarlos, y solo con BOB_BANCO=1 en una máquina SIN /opt/bzzz, para que
# un BOB_BANCO=1 olvidado en una caja no apague nada.
#
# Uso: FIJOS_NO=«prefijo de la línea de salida con rc 2» y después `. fijos.sh`.

bob_banco() { [ "${BOB_BANCO:-}" = 1 ] && [ ! -e /opt/bzzz ]; }

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
fijo BOB_PSQL_IMAGEN supabase/postgres@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00
BOB_COMPOSE=$BOB_RAIZ/compose.yml
BOB_ENV=$BOB_RAIZ/.env
BOB_PROYECTO=bob
export BOB_COMPOSE BOB_ENV BOB_PROYECTO

# Las redes y lo que cada servicio puede tocar: de D77 (insumos §2.2 y §5), no de /opt/bob/compose.yml, que es lo
# que se protege. El banco crea redes con estos mismos nombres.
BOB_RED_VECINA=bzzz-vecina-bob
BOB_RED_ENTRADA=bzzz-edge
