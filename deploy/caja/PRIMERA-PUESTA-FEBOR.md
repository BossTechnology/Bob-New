# Primera puesta de BOb en Febor

La secuencia que corre Henry, a mano, para ir de la imagen firmada a BOb sano al lado de la caja, con su vuelta
atrás. Es la versión corta: el porqué de cada paso está en `docs/caja/instalar-y-volver-atras.md`.

Lo que va entre `<…>` lo pone Henry. Los valores de ejemplo son inventados.

## 0. Antes de empezar (todo tiene que ser «sí»)

- En Bzzz están fusionados y llegaron a `/opt/bzzz` de Febor (rsync): #445 (`l7-bob.yml` fuera), #449
  (`bzzz-vecinos`), #450 (alta de vecinas) y #454 (atestación por la config, `id-de-imagen.sh`).
- En Bob-New está fusionado #55. El commit que se construye está en `main`.
- La firma: la llave pública de quien construye está en `/opt/bzzz/config/bob/firmantes_imagen`.
- La cadena actual de migraciones de BOb ya se aplicó una vez con `postgres` (D77 77.21). No va con `deploy.sh`.

Qué almacén de imágenes usa Docker. Se mira en lab-02, en model-01 y en Febor:

```bash
docker info -f '{{.ServerVersion}} {{.Driver}} {{json .DriverStatus}}'
```

Lo esperado: `overlay2`, sin `io.containerd.snapshotter`. Si alguna dice `io.containerd.snapshotter`, la rama de
containerd de `deploy.sh` y `rollback.sh` hay que probarla DE VERDAD en lab-02 (el viernes) antes de Febor, con un
deploy, un deploy de una imagen que no queda sana y un `rollback.sh`: el banco solo la imita.

En Febor, como root, comprobar que lo de Bzzz está:

```bash
ls -l /opt/bzzz/scripts/comprobar-atestacion-bob.sh /opt/bzzz/scripts/id-de-imagen.sh /opt/bzzz/config/bob/firmantes_imagen
```

```bash
docker network inspect -f '{{.Name}} internal={{.Internal}}' bzzz-vecina-bob bzzz-edge
```

Lo esperado: los tres ficheros existen, `bzzz-vecina-bob internal=true` y `bzzz-edge internal=false`.

```bash
ls -l /opt/bob/secrets/
```

Lo esperado: `app.env` y `migrador.env` con permisos `-rw-------`. Si no están, se corre primero el alta de la vecina
de Bzzz (`scripts/generar-secretos-vecina.sh bob`, #450).

## 1. En el portátil: construir y firmar

Desde el checkout de Bzzz, con el commit de `main` de Bob-New que va a Febor:

```bash
scripts/construir-imagen-bob.sh <checkout de Bob-New> <commit> <llave SSH> /tmp/bob-febor
```

Tiene que acabar con rc 0. Deja `bob-web-<12>.tar`, `bob-web-<12>.atestacion` y `bob-web-<12>.atestacion.sig`.

Llevarlos a Febor:

```bash
scp /tmp/bob-febor/bob-web-<12>.* root@<febor>:/root/entrega-bob/
```

## 2. En Febor: poner el paquete en /opt/bob

El paquete sale del MISMO commit de Bob-New que la imagen. Desde un checkout de ese commit, copiado a Febor:

```bash
install -d -m 755 /opt/bob /opt/bob/config
```

```bash
install -m 755 deploy/caja/deploy.sh deploy/caja/rollback.sh deploy/caja/lib.sh deploy/caja/fijos.sh deploy/caja/comprobar-aislamiento.sh /opt/bob/
```

```bash
install -m 644 deploy/caja/compose.yml /opt/bob/compose.yml
```

La configuración, sin secretos (`BOB_HOST` es el host que publica Traefik):

```bash
printf 'BOB_HOST=%s\n' '<host de BOb en Febor>' > /opt/bob/.env
```

```bash
printf 'BOB_ORG_ID=%s\nBOB_GOTRUE_URL=http://bzzz-supabase-auth:9999\nBOB_DB_HOST=bzzz-supabase-db\n' '<uuid de la org>' > /opt/bob/config/caja.env
```

## 3. Bajar el BOb viejo de la caja (si Febor lo tiene)

Dos BOb no pueden publicar el mismo host. Si Febor tenía `bzzz-bob` (`docker ps --filter name=bzzz-bob`), se baja,
pero el fichero se deja hasta el paso 6, por si hay que volver:

```bash
cd /opt/bzzz && docker compose --env-file compose/.env -f compose/l7-bob.yml down
```

## 4. Desplegar

Como root (`deploy.sh` y `rollback.sh` no empiezan si no):

```bash
cd /opt/bob && ./deploy.sh --imagen /root/entrega-bob/bob-web-<12>.tar --atestacion /root/entrega-bob/bob-web-<12>.atestacion; echo "rc=$?"
```

Lo esperado: `desplegada: sha256:… (bob-web)` y `rc=0`. Cualquier otra cosa: ir al paso 7.

## 5. Comprobar a mano

```bash
cd /opt/bob && ./comprobar-aislamiento.sh; echo "rc=$?"
```

Lo esperado: `aislada: 1 contenedor(es) bob-* (bob-web); salida aceptada: bob-web en bzzz-edge` y `rc=0`.

```bash
curl -sk -o /dev/null -w '%{http_code}\n' --resolve '<host de BOb en Febor>:443:127.0.0.1' 'https://<host de BOb en Febor>/api/health'
```

Lo esperado: 302, 303, 307 o 401, es decir, que contesta la puerta. Un 200 sin sesión es un fallo de seguridad: paso 7.

Después, en el navegador, entrar con una cuenta que tenga fila activa en `bob.users`. La lista de lo que hay que mirar
es `bob-web-real-box-checklist` (salud en menos de 2 s, 401 sin sesión, 403 sin fila y el simulador sin cifras
inventadas).

## 6. Cerrar

Solo cuando el paso 5 está bien y Henry da BOb por bueno:

```bash
cd /opt/bzzz && /opt/bzzz/scripts/verify-deployment.sh
```

Y, si existía, borrar el BOb viejo de Bzzz (#445):

```bash
rm /opt/bzzz/compose/l7-bob.yml
```

## 7. Volver atrás en la primera puesta

En la primera puesta no hay imagen anterior: `rollback.sh` dice `no-empieza` y no toca nada. Si `deploy.sh` no acabó
en `desplegada`, ya dejó `bob-web` parado (la línea `fallo: …` lo dice). Para quitarlo del todo:

```bash
cd /opt/bob && docker compose -p bob -f compose.yml --env-file .env --profile feeder down
```

Si Febor tenía el BOb viejo y hay que devolverlo mientras tanto:

```bash
cd /opt/bzzz && docker compose --env-file compose/.env -f compose/l7-bob.yml up -d
```

Las migraciones del paso 0 no se deshacen aquí (ver «Riesgos de v1» en el runbook).

## Después de la primera: actualizar y volver atrás

```bash
cd /opt/bob && ./deploy.sh --imagen <tar nuevo> --atestacion <atestación nueva>
```

Si la nueva no queda sana, `deploy.sh` vuelve solo a la anterior (`vuelta-atras: …`). Para volver a mano:

```bash
cd /opt/bob && ./rollback.sh; echo "rc=$?"
```

Lo esperado: `vuelta-atras: corre sha256:…` y `rc=0`. Correrlo otra vez deja la que había.
