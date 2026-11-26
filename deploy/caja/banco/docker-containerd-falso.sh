#!/usr/bin/env bash
# Un `docker` falso que imita el almacén de imágenes de containerd encima de un docker con overlay2. Solo para el
# banco (BANCO_CONTAINERD=1): banco.sh lo pone primero en el PATH de deploy.sh, rollback.sh y el chequeo.
#
# Con containerd, el .Id de una imagen y el .Image de un contenedor son el digest al que apunta el index.json del tar
# (el «objetivo»), no el sha256 de la configuración, y la configuración no se puede usar como referencia. Aquí:
#   - `docker load` apunta en BANCO_MAPA_CONTAINERD la pareja «objetivo config» de cada tar que carga;
#   - un argumento que es un objetivo se cambia por su config antes de llamar al docker de verdad, y uno que es una
#     config apuntada se cambia por una referencia que no existe (como en containerd);
#   - en lo que imprime (salvo `docker save`), cada config apuntada sale como su objetivo;
#   - `docker compose` recibe una copia de --env-file con los objetivos cambiados por su config;
#   - `docker info` con DriverStatus dice io.containerd.snapshotter.v1.
set -uo pipefail
REAL=${BANCO_DOCKER_REAL:?}; MAPA=${BANCO_MAPA_CONTAINERD:?}
touch "$MAPA"

traducir_arg() {
  local x=$1 o c
  while read -r o c; do
    [ "$x" = "$o" ] && { printf '%s\n' "$c"; return; }
    [ "$x" = "$c" ] && { printf '%s\n' "sha256:0000000000000000000000000000000000000000000000000000000000000000"; return; }
  done < "$MAPA"
  printf '%s\n' "$x"   # no echo: se comería un argumento «-e» o «-n»
}
a_objetivo() {
  local e=() o c
  while read -r o c; do e+=(-e "s/${c#sha256:}/${o#sha256:}/g"); done < "$MAPA"
  if [ "${#e[@]}" -gt 0 ]; then sed "${e[@]}"; else cat; fi
}

case "${1:-}" in
  info)
    for a in "$@"; do case "$a" in *DriverStatus*) echo '[["driver-type","io.containerd.snapshotter.v1"]]'; exit 0 ;; esac; done
    exec "$REAL" "$@" ;;
  load)
    "$REAL" "$@" || exit $?
    tar=; prev=
    for a in "$@"; do [ "$prev" = -i ] && tar=$a; prev=$a; done
    [ -n "$tar" ] && python3 -I -c '
import json, re, sys, tarfile
t = tarfile.open(sys.argv[1]); r = lambda n: t.extractfile(n).read()
cfg = "sha256:" + re.search(r"([0-9a-f]{64})", json.loads(r("manifest.json"))[0]["Config"]).group(1)
print(json.loads(r("index.json"))["manifests"][0]["digest"], cfg)' "$tar" >> "$MAPA"
    exit 0 ;;
  compose)
    args=(); prev=
    for a in "$@"; do
      if [ "$prev" = --env-file ] && [ -f "$a" ]; then
        tmp=$(mktemp); e=()
        while read -r o c; do e+=(-e "s/${o#sha256:}/${c#sha256:}/g"); done < "$MAPA"
        if [ "${#e[@]}" -gt 0 ]; then sed "${e[@]}" "$a" > "$tmp"; else cp "$a" "$tmp"; fi
        a=$tmp
      fi
      args+=("$a"); prev=$a
    done
    "$REAL" "${args[@]}" | a_objetivo; exit "${PIPESTATUS[0]}" ;;
  save)   # un tar: se traducen los argumentos, la salida no (es binaria y su config es la de verdad)
    args=(); for a in "$@"; do args+=("$(traducir_arg "$a")"); done
    exec "$REAL" "${args[@]}" ;;
esac
args=(); for a in "$@"; do args+=("$(traducir_arg "$a")"); done
"$REAL" "${args[@]}" | a_objetivo; exit "${PIPESTATUS[0]}"
