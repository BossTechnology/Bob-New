# Primera puesta de BOb al lado de la caja: lab-02, model-01 y Febor

La secuencia que corre Henry, a mano, para ir de una caja con el BOb viejo de Bzzz (o sin BOb) a BOb v1 sano al lado
de la caja (Bzzz D77), con su vuelta atrás. Es la versión corta: el porqué de cada paso está en
`docs/caja/instalar-y-volver-atras.md` (este repo) y en `docs/p5-application-layer.md` §6.2 (BOb-engine).

Se corre tres veces, en este orden, y no se pasa a la siguiente caja si la anterior no acabó bien:

| Caja | Día | Entrada | Qué es |
|---|---|---|---|
| lab-02 | viernes 27 nov | `ssh bzzz-lab-02` | ensayo; aquí se miden las cosas que siguen sin medir |
| model-01 | sábado 28 nov | `ssh bzzz-model-01` | ensayo en una caja como la de un cliente |
| Febor | lunes 30 nov | `ssh bzzz-febor` | producción: lo corre Henry y nadie más |

Las tres entradas van con el usuario `bzzzops` por `bzzz-centro`. **Nada se corre en una shell de root.** Lo que
necesita root lleva `sudo` delante, orden por orden, desde `bzzzops`. `firma-instalacion` lo exige: lee `SUDO_UID`
y no empieza sin él. Los guiones de Bzzz que ya llaman a `sudo` por dentro (`actualizar.sh`,
`generar-secretos-vecina.sh`, `generar-secretos-bob.sh`, `generar-config-portal.sh`, `verify-deployment.sh`) se
corren como `bzzzops`, sin `sudo` delante.

Lo que va entre `<…>` lo pone Henry. Aquí no hay IPs, secretos ni datos de cliente: todo valor de ejemplo es
inventado, y ningún paso imprime una contraseña.

Leyenda:
- **[ventana]** corta el login de la caja unos segundos;
- **[llave-img]** necesita la llave SSH de `firmantes_imagen`;
- **[llave-fido]** necesita la llave de instalación de Henry, con un toque;
- **[pendiente: …]** depende de algo que aún no está en `main`. Hasta que entre, ese paso no se puede correr.

## Lo que cambia de una caja a otra

Se apunta antes de empezar. El resto de la secuencia es igual en las tres.

| | lab-02 | model-01 | Febor |
|---|---|---|---|
| `<host de BOb>` (`BOB_HOST` y `BZZZ_HOST_BOB`) | `<host de BOb de lab-02>` | `<host de BOb de model-01>` | `<host de BOb de Febor>` |
| `<dominio base>` (`generar-config-portal.sh`) | `<dominio base de lab-02>` | `<dominio base de model-01>` | `<dominio base de Febor>` |
| `<uuid de la org>` (`BOB_ORG_ID`) | `<uuid de la org de lab-02>` | `<uuid de la org de model-01>` | `<uuid de la org de Febor>` |
| El BOb viejo (`bzzz-bob`) | se desplegó aquí (`docs/OPERACION_bob.md` §0 de Bzzz): mirarlo en B0 | mirarlo en B0 | corre: B2 es obligatorio |
| La cadena de BOb en la base | ya está, aplicada en `5e5b9be` | no se sabe: lo dice la sonda de B0 | no se sabe: lo dice la sonda de B0 |
| `<base>` de `instalacion-firmada` | la huella de `5e5b9be` | según la sonda: la huella del commit que corre, o la base vacía | igual que model-01 |
| Quién | Henry, con quien ayude | Henry, con quien ayude | **solo Henry** |

**La base vacía** es para una caja sin BOb: no hay commit del que sacar la huella. Henry decidió «Defined empty base»
el 2026-11-25. **[pendiente: BOb-engine, después de BossTechnology/BOb-engine#51; el TODO está en
BossTechnology/BOb-engine#53]**. Hasta que entre, una caja sin BOb no tiene `<base>`, y desde B3 no se sigue.

## Lo que tiene que estar fusionado

| Repo | PR | Qué trae | Estado (25 nov) |
|---|---|---|---|
| Bzzz | #445, #449, #450, #454, #457, #458 | `l7-bob.yml` fuera; `bzzz-vecinos`; el alta de vecinas; la atestación por la config e `id-de-imagen.sh` | en `main` |
| Bzzz | #460 | el bit de ejecución en los guiones de `scripts/` | **abierto**: hasta entonces, `bash scripts/…` en el portátil |
| Bzzz | por abrir | la llave pública de imagen en `config/bob/firmantes_imagen` **[llave-img]** | **pendiente** |
| Bob-New | #55, #37 | el paquete de `/opt/bob`; las pantallas del Slice 3 | en `main` |
| Bob-New | BossTechnology/Bob-New#56 | `deploy.sh` ya no migra; los chequeos de secretos descubren por patrón | **abierto** |
| BOb-engine | #48, #52 | O-3 firmado (`cadena` y `resto`); el texto de P5 por D77 | en `main` |
| BOb-engine | #51 | `verify-required` lo comprueba el guion, no `ssh-keygen` | **abierto** |
| BOb-engine | #53 | `postgres.env` fuera de `secrets/` (B2), cómo llega root a la base (B3), requisitos de `firma-instalacion` (H5) | **abierto** |
| BOb-engine | por abrir | la base vacía (H4) | **pendiente**, después de #51 |
| BOb-engine | por abrir | la llave de Henry en `supabase/provision/firmantes_instalacion` **[llave-fido]** | **pendiente**, después de #51 |

## A. Una vez, en el portátil

**A1. La llave de imagen.** **[llave-img] [pendiente: PR de Bzzz por abrir]** La línea pública de la llave SSH con la
que se firma va en `config/bob/firmantes_imagen` de Bzzz, por PR. Tiene que estar en `main` y llegar a cada caja con
B1. Si no, `construir-imagen-bob.sh` acaba en rc 1 (comprueba contra la copia del portátil) y `deploy.sh` no carga la
imagen (comprueba contra la de la caja).

**A2. La llave de instalación.** **[llave-fido] [pendiente: después de BossTechnology/BOb-engine#51]** La línea
pública de la llave de Henry va en `supabase/provision/firmantes_instalacion` de BOb-engine, por PR. Antes de abrirlo,
comprobar que la huella es la de la llave:

```bash
ssh-keygen -lf <llave de instalación>.pub
```

**A3. Los dos commits.** Apuntar los SHA completos, de 40 caracteres:
- `<C_WEB>`: el de `main` de Bob-New que se construye. Va en `3a74911` o después, y con BossTechnology/Bob-New#56
  dentro;
- `<C_ENG>`: el de `main` de BOb-engine que se instala. Lleva #51, la base vacía y la llave de A2.

```bash
git -C <checkout de Bob-New> rev-parse origin/main
```

```bash
git -C <checkout de BOb-engine> rev-parse origin/main
```

**A4. Construir y firmar la imagen, una sola vez.** **[llave-img]** El mismo tar sirve para las tres cajas. Desde el
checkout de Bzzz en `main`, con `bash` delante, porque el guion es 644 en git hasta Bzzz#460 (M3):

```bash
bash scripts/construir-imagen-bob.sh <checkout de Bob-New> <C_WEB> <llave SSH de imagen> /tmp/bob-entrega
```

Lo esperado: rc 0 y tres ficheros en `/tmp/bob-entrega`: `bob-web-<12>.tar`, `bob-web-<12>.atestacion` y
`bob-web-<12>.atestacion.sig`.

**A5. Firmar la instalación, una aprobación por cada `<base>` distinta.** **[llave-fido]** Desde un checkout limpio de
`main` de BOb-engine, en `origin/main`. `FIRMA_LLAVE` es la llave de instalación de Henry, si no es la de por
defecto:

```bash
FIRMA_LLAVE=<llave de instalación> bash scripts/firmar-instalacion.sh <C_ENG> --base <base de la caja>
```

El guion enseña el diff y el log entre las dos revisiones. Escribir `firmo` y tocar la llave. Guardar
`<base>-<nueva>.aprobacion` y su `.sig`. lab-02 lleva una (base `5e5b9be`). model-01 y Febor llevan la suya cuando la
sonda de B0 diga su base, y comparten aprobación si la base es la misma.

**A6. Lo que se lleva a cada caja.** Los tres ficheros de A4, la aprobación de A5 y dos copias de código: el paquete
de Bob-New en `<C_WEB>` y un clon de BOb-engine en `<C_ENG>`. Ambas desde git, no desde el árbol de trabajo.

```bash
scp /tmp/bob-entrega/bob-web-<12>.* <dir de la aprobación>/<base>-<nueva>.aprobacion* bzzz-<caja>:entrega-bob/
```

```bash
git -C <checkout de Bob-New> archive <C_WEB> deploy/caja | ssh bzzz-<caja> 'mkdir -p bob-new && tar -x -C bob-new'
```

```bash
git -C <checkout de BOb-engine> bundle create /tmp/bob-engine.bundle main && scp /tmp/bob-engine.bundle bzzz-<caja>:
```

`entrega-bob/` tiene que existir en el home de `bzzzops` antes del primer `scp` (`ssh bzzz-<caja> mkdir -p entrega-bob`).

## B. En cada caja, en este orden

### B0. Sondas, antes de la ventana (solo leen)

```bash
docker info -f '{{.ServerVersion}} {{.Driver}} {{json .DriverStatus}}'
```

Lo esperado: `overlay2`, sin `io.containerd.snapshotter`. Si alguna caja dice `io.containerd.snapshotter`, la rama de
containerd de `deploy.sh` y `rollback.sh` se prueba DE VERDAD en lab-02 antes de seguir: un deploy, uno de una imagen
que no queda sana y un `rollback.sh`. El banco solo la imita.

```bash
docker ps --format '{{.Names}}' --filter name=bzzz-bob
```

Si sale `bzzz-bob`, B2 es obligatorio antes del alta.

```bash
dig +short <host de BOb>
```

Tiene que dar la IP pública de esta caja, la misma que `dig +short <host del portal>`. Sin el registro no hay
certificado (ver B11). Si falta, se pone en el DNS antes de la ventana.

```bash
supabase --version; ls /usr/lib/postgresql/*/bin/psql; command -v git setpriv flock; df -h /dev/shm
```

Lo esperado: el CLI de Supabase en `2.120.0`, la que fija el CI de BOb-engine, dentro del `PATH` fijo de
`firma-instalacion` (`/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/sbin:/usr/local/bin`); un psql 16 o más nuevo en
`/usr/lib/postgresql/<v>/bin/`; `git`, `setpriv` y `flock`; y un tmpfs en `/dev/shm`. Lo que falte se instala antes
de la ventana (H5).

En model-01 y en Febor, si ya existe `bob` y qué cadena tiene la base. La sonda lee solo versiones, ninguna fila de
cliente:

```bash
sudo docker exec bzzz-supabase-db psql -X -tA -U supabase_admin -d postgres -c "select to_regnamespace('bob') is not null" -c "select version from supabase_migrations.schema_migrations order by version"
```

- `f` y ninguna versión de BOb: la caja no tiene BOb, y `<base>` es la base vacía.
- `t` y una lista: buscar en BOb-engine el commit cuyas migraciones son exactamente esas. Su huella es `<base>`. Si no
  casa con ningún commit, se para aquí y Henry decide.

### B1. Bzzz a `main`, con `generar-secretos.sh` primero (H2)

Enviar el árbol de `main` de Bzzz como siempre (`docs/OPERACION_actualizar.md`, la lista blanca de `lista-de-envio.sh`)
a `/data/bzzz/misc/actualizaciones/nuevo/`.

Con #449, ClickHouse monta en toda caja los usuarios de `bzzz-vecinos`, y `actualizar.sh` no lo recrea sin sus hashes
en `clickhouse.env`. Por eso, **antes** de `--aplicar`, el `generar-secretos.sh` del árbol nuevo. No pisa nada de lo
que ya existe:

```bash
sudo /data/bzzz/misc/actualizaciones/nuevo/scripts/generar-secretos.sh
```

```bash
cd /opt/bzzz && scripts/actualizar.sh --plan /data/bzzz/misc/actualizaciones/nuevo
```

Ninguna ruta `desconocido`. `compose/l7-bob.yml` sale en amarillo como SOBRA si la caja lo trae: se queda hasta B14.

```bash
cd /opt/bzzz && scripts/actualizar.sh --aplicar /data/bzzz/misc/actualizaciones/nuevo; echo "rc=$?"
```

Lo esperado: `rc=0` («ACTUALIZACIÓN OK»), o `rc=3` con el paso de SigNoz que nombra. Luego mirar que llegó lo de BOb:

```bash
ls -l /opt/bzzz/scripts/comprobar-atestacion-bob.sh /opt/bzzz/scripts/id-de-imagen.sh /opt/bzzz/config/bob/firmantes_imagen
```

```bash
docker network inspect -f '{{.Name}} internal={{.Internal}}' bzzz-vecina-bob bzzz-edge
```

Lo esperado: los dos guiones con la `x` (`-rwxr-xr-x`). Sin ella, `deploy.sh` dice `no-medible` y no carga. `actualizar.sh`
les pone el bit; un rsync a pelo no. `firmantes_imagen` tiene la línea de A1. Las redes: `bzzz-vecina-bob internal=true`
y `bzzz-edge internal=false`. Si `bzzz-vecina-bob` no existe todavía, la crea el alta en B6.

### B2. El BOb viejo abajo, ANTES del alta (B4)

El alta no activa el `pg_hba` de las vecinas mientras haya un contenedor de una vecina fuera de su red. El BOb viejo
en `bzzz-app` es uno de ellos: con él en marcha, B6 sale 3. Bajarlo:

```bash
cd /opt/bzzz && docker compose --env-file compose/.env -f compose/l7-bob.yml down
```

```bash
docker ps -q --filter name=bzzz-bob
```

Tiene que salir vacío. No se vuelve a levantar: `l7-bob.yml` ya no se despliega (#445). Desde aquí la caja no tiene
BOb hasta B12.

### B3. La protección de BOb-engine en `/opt/bob`, una vez

Un clon de BOb-engine en `<C_ENG>`, legible por `bzzzops`. Lo que se instala sale de ese clon, que es el commit que
Henry revisó:

```bash
git clone -q bob-engine.bundle bob-engine && git -C bob-engine checkout -q <C_ENG> && git -C bob-engine rev-parse HEAD
```

Tiene que imprimir `<C_ENG>` entero. Luego, desde `~/bob-engine`:

```bash
cd ~/bob-engine && sudo install -d -o root -g root -m 755 /opt/bob /opt/bob/bin /opt/bob/aprobaciones
```

```bash
cd ~/bob-engine && sudo install -o root -g root -m 755 scripts/firma-instalacion.sh /opt/bob/bin/firma-instalacion
```

```bash
cd ~/bob-engine && sudo install -o root -g root -m 644 supabase/provision/firmantes_instalacion /opt/bob/firmantes_instalacion
```

```bash
sudo install -o root -g root -m 644 /dev/null /opt/bob/aprobaciones-revocadas
```

```bash
sudo install -o root -g root -m 644 ~/entrega-bob/<base>-<nueva>.aprobacion ~/entrega-bob/<base>-<nueva>.aprobacion.sig /opt/bob/aprobaciones/
```

`instalacion-firmada` lleva `<base>`, lo que la caja corre hoy (ver «Lo que cambia»). En lab-02 es la huella de
`5e5b9be`:

```bash
cd ~/bob-engine && scripts/firma-instalacion.sh huella 5e5b9be
```

```bash
echo '<base>' | sudo tee /opt/bob/instalacion-firmada >/dev/null && sudo chmod 644 /opt/bob/instalacion-firmada
```

En una caja sin BOb, `<base>` es la base vacía. **[pendiente: base vacía, BOb-engine después de #51]**

**Cómo llega root a la base (B3).** `bzzz-supabase-db` no publica ningún puerto, y su nombre no resuelve en el
servidor. `POSTGRES_HOST` es su IP en `bzzz-app`:

```bash
docker inspect -f '{{(index .NetworkSettings.Networks "bzzz-app").IPAddress}}' bzzz-supabase-db
```

Esa IP y `bzzz-supabase-db`, que es el `MIGRADOR_HOST` del alta y lo pide `resto`, van en `hosts-permitidos`:

```bash
printf '%s\n' '<IP de bzzz-supabase-db>' bzzz-supabase-db | sudo tee /opt/bob/hosts-permitidos >/dev/null && sudo chmod 644 /opt/bob/hosts-permitidos
```

**[pendiente: medirlo en lab-02 a través de `firma-instalacion`; texto en BossTechnology/BOb-engine#53]** La IP cambia
si se recrea el contenedor. Leerla otra vez antes de B5 y de B7, y antes de cada instalación.

### B4. La contraseña de `postgres`, FUERA de `/opt/bob/secrets` (B2)

`deploy.sh` no empieza si en `secrets/` hay un fichero de root que no sea `migrador.env`. La de `postgres` va aparte,
en `/root/bob-install/` (BossTechnology/BOb-engine#53):

```bash
sudo install -d -o root -g root -m 700 /root/bob-install && sudo install -o root -g root -m 600 /dev/null /root/bob-install/postgres.env
```

Henry escribe en él una sola línea, `POSTGRES_PASSWORD=…`, con la contraseña de `postgres` de la caja. Sale de
`/opt/bzzz/secrets/supabase.env`. La pasa con un editor como root. Nada de esta secuencia la imprime, y no se pega en
ningún sitio.

### B5. `cadena`, como `postgres` **[llave-fido] [pendiente: BOb-engine#51 y la llave de A2]**

```bash
sudo /opt/bob/bin/firma-instalacion caja ~/bob-engine <C_ENG> cadena POSTGRES_ENV=/root/bob-install/postgres.env POSTGRES_HOST=<IP de bzzz-supabase-db>
```

Escribir `instalo` cuando lo pida. En lab-02 la cadena ya está y no debería aplicar nada. En una caja sin BOb crea
`bob` y aplica la cadena firmada.

### B6. El alta de la vecina **[ventana]**

```bash
cd /opt/bzzz && scripts/generar-secretos-vecina.sh bob; echo "rc=$?"
```

- `rc=0`: hecho.
- `rc=3` y «entrarían desde fuera de su red»: hay un BOb fuera de `bzzz-vecina-bob`. Volver a B2.
- `rc=3` y «escrito y NO activo»: es lo esperado **la primera vez en cada caja**. El `pg_hba` de las vecinas solo se
  lee al arrancar la base. Avisar a quien esté usando la caja: el login de la caja se corta unos segundos mientras
  `bzzz-supabase-db` reinicia. Luego:

```bash
cd /opt/bzzz && scripts/generar-secretos-vecina.sh bob --reiniciar; echo "rc=$?"
```

Lo esperado: `rc=0`. El alta deja `/opt/bob/secrets/migrador.env`, de root y 600, en un directorio 700. Lo deja
incluso cuando sale 3. Lo lee `resto` (B7) y nada más: ningún contenedor lo monta, y `deploy.sh` ya no lo lee.

### B7. `resto`, como `bob_migrador` **[llave-fido] [pendiente: BOb-engine#51 y la llave de A2]**

```bash
sudo /opt/bob/bin/firma-instalacion caja ~/bob-engine <C_ENG> resto POSTGRES_ENV=/root/bob-install/postgres.env POSTGRES_HOST=<IP de bzzz-supabase-db>
```

Escribir `instalo`. Lo esperado: aplica, como `bob_migrador`, las migraciones de `<C_ENG>` que no están en la cadena.
Hoy son las tres del Slice 3 y la de `organizations`:
- `20261121200000_slice3_catalog_and_feeder_map.sql`;
- `20261121200100_slice3_cell_state.sql`;
- `20261121200200_organizations_read_only_for_bob_app.sql`.

Quedan apuntadas en `bob.schema_migrations`. Sin ellas, bob-web arranca y pinta «Estados del Slice 3 pendientes», que no
es v1.

### B8. El login de bob-web

`generar-secretos-bob.sh`, por omisión, escribe en `/opt/bzzz/secrets/bob` y prueba por `bzzz-app`. Para BOb al lado de
la caja va a `/opt/bob/secrets` y prueba por la red de la vecina. Deja `app.env` del usuario 65534, con el que corre
bob-web, y 600:

```bash
cd /opt/bzzz && DIR_SECRETOS=/opt/bob/secrets RED=bzzz-vecina-bob scripts/generar-secretos-bob.sh; echo "rc=$?"
```

Sin `--feeder`: el feeder no va en v1.

```bash
sudo stat -c '%u %a %n' /opt/bob /opt/bob/secrets /opt/bob/secrets/*
```

Lo esperado:
- `/opt/bob` de `0` y sin escritura para otros;
- `/opt/bob/secrets` de `0`, 700;
- en `secrets/`, solo `migrador.env` `0 600` y `app.env` `65534 600`.

Ni `postgres.env` (B4), ni `vecinos/`, ni enlaces. Si algún día va el feeder, también `feeder.env` `65534 600`.

**No correr `cert-vecina.sh` para `bob` antes de v1 (M2).** Deja un directorio `secrets/vecinos/`, y `deploy.sh` no
empieza con un directorio en `secrets/`. Eso tumba también el deploy de bob-web. El feeder, y con él su certificado, va
después de v1.

### B9. El paquete de Bob-New en `/opt/bob`

Del MISMO commit `<C_WEB>` que la imagen, el que se copió en A6 a `~/bob-new`:

```bash
sudo install -d -o root -g root -m 755 /opt/bob/config
```

```bash
cd ~/bob-new && sudo install -o root -g root -m 755 deploy/caja/deploy.sh deploy/caja/rollback.sh deploy/caja/lib.sh deploy/caja/fijos.sh deploy/caja/comprobar-aislamiento.sh /opt/bob/
```

```bash
cd ~/bob-new && sudo install -o root -g root -m 644 deploy/caja/compose.yml /opt/bob/compose.yml
```

La configuración, sin secretos. `BOB_HOST` es el host que publica Traefik:

```bash
printf 'BOB_HOST=%s\n' '<host de BOb>' | sudo tee /opt/bob/.env >/dev/null
```

```bash
printf 'BOB_ORG_ID=%s\nBOB_GOTRUE_URL=http://bzzz-supabase-auth:9999\nBOB_DB_HOST=bzzz-supabase-db\n' '<uuid de la org>' | sudo tee /opt/bob/config/caja.env >/dev/null
```

### B10. El portal y la puerta, apuntando a BOb (H1)

```bash
grep -E '^BZZZ_HOST_(BOB|PORTAL)=' /opt/bzzz/compose/.env
```

`BZZZ_HOST_PORTAL` ya tiene que estar. Si no, es de la caja y se arregla antes de seguir. Si falta `BZZZ_HOST_BOB`,
que es el mismo host que `BOB_HOST`, sin esquema ni puerto, añadirlo una sola vez:

```bash
printf 'BZZZ_HOST_BOB=%s\n' '<host de BOb>' | sudo tee -a /opt/bzzz/compose/.env >/dev/null
```

El portal, para que la tarjeta de BOb apunte al host y acepte la vuelta (`?volver=`):

```bash
cd /opt/bzzz && scripts/generar-config-portal.sh '<dominio base>'; echo "rc=$?"
```

Lo esperado: `rc=0` y «el fichero PARSEA». La puerta lee `BZZZ_HOST_BOB` de su entorno, así que hay que recrearla.
Sin esto, la puerta manda al portal sin la vuelta a BOb y `verify-deployment.sh` falla:

```bash
cd /opt/bzzz && docker compose --env-file compose/.env -f compose/l6-portal.yml up -d
```

**Desde aquí hasta que B12 acabe bien, `verify-deployment.sh` falla** con «BZZZ_HOST_BOB está … pero no corre ningún
contenedor» (L2). Es lo esperado: B10 va justo antes del deploy para que esa ventana sea corta.

### B11. DNS y certificado: requisito del deploy (H3)

El router de bob-web pide el certificado a Let's Encrypt (`certresolver le`, reto TLS por el 443). Sin el registro DNS
del `<host de BOb>` apuntando a esta caja, B12 pasa (el `curl --resolve` no mira el certificado), pero el navegador
de B13 no. Comprobarlo otra vez justo antes:

```bash
dig +short <host de BOb>
```

Tiene que dar la IP pública de esta caja. Si no, no se sigue.

### B12. Desplegar

```bash
cd /opt/bob && sudo ./deploy.sh --imagen ~/entrega-bob/bob-web-<12>.tar --atestacion ~/entrega-bob/bob-web-<12>.atestacion; echo "rc=$?"
```

`deploy.sh` copia el tar y la atestación a `/opt/bob/entrega/`, de root, antes de mirarlos. No migra: lo hizo B7.

Lo esperado: `desplegada: sha256:… (bob-web)` y `rc=0`. Cualquier otra cosa: ir a C.

### B13. Comprobar

```bash
cd /opt/bob && sudo ./comprobar-aislamiento.sh; echo "rc=$?"
```

Lo esperado: `aislada: 1 contenedor(es) bob-* (bob-web); salida aceptada: bob-web en bzzz-edge` y `rc=0`.

```bash
curl -sk -o /dev/null -w '%{http_code}\n' --resolve '<host de BOb>:443:127.0.0.1' 'https://<host de BOb>/api/health'
```

Lo esperado: 302, 303, 307 o 401, es decir, que contesta la puerta. Un 200 sin sesión es un fallo de seguridad: ir a C.

En el navegador, `https://<host de BOb>` con un certificado válido (no el de Traefik por defecto), entrando con una
cuenta que tenga fila activa en `bob.users`. La lista de lo que hay que mirar es `bob-web-real-box-checklist`:
- la salud en menos de 2 s;
- 401 sin sesión;
- 403 sin fila;
- el simulador sin cifras inventadas;
- y ahora también las celdas del Slice 3 con su estado, no «Estados del Slice 3 pendientes».

```bash
cd /opt/bzzz && scripts/verify-deployment.sh
```

Lo esperado: 0 fallos. Mira la puerta de BOb, su vecina y la redirección puerta → portal → BOb (por eso B10).

### B14. Quitar `l7-bob.yml`

Solo cuando B13 está bien y Henry da BOb por bueno en esta caja:

```bash
sudo rm /opt/bzzz/compose/l7-bob.yml
```

Y la copia de la contraseña de `postgres`, que no hace falta hasta la próxima instalación (D la vuelve a crear con B4):

```bash
sudo rm /root/bob-install/postgres.env
```

## C. Volver atrás en la primera puesta

En la primera puesta no hay imagen anterior: `rollback.sh` dice `no-empieza` y no toca nada. Volver atrás es dejar BOb
fuera hasta arreglarlo. El BOb viejo de la caja no se vuelve a levantar.

Si `deploy.sh` no acabó en `desplegada`, la línea `fallo: …` dice cómo quedó. Si dice «NO se pudo parar», nombra lo que
sigue en marcha. Quitar el contenedor sin compose: si el deploy no llegó a escribir `BOB_WEB_IMAGEN`, `compose down`
no arranca.

```bash
docker rm -f bob-web
```

Comprobar que no queda nada de BOb en marcha. Las dos órdenes tienen que salir vacías. Van aparte porque dos filtros
en un mismo `docker ps` se suman como «y»:

```bash
docker ps -q --filter name=^/bob-; docker ps -q --filter label=com.docker.compose.project=bob
```

Si se hizo B10 y BOb se queda fuera más de un rato, quitar `BZZZ_HOST_BOB` de `/opt/bzzz/compose/.env`, regenerar el
portal y recrear la puerta otra vez, para que la tarjeta no lleve a un BOb que no está.

Lo que **no** se deshace aquí:
- las migraciones de B5 y B7 (ver «Riesgos de v1» en `docs/caja/instalar-y-volver-atras.md`);
- el alta de B6: sus roles y su `pg_hba` se quedan, y la siguiente corrida los encuentra («ya-esta»).

## D. Después de la primera: actualizar y volver atrás

Con migraciones nuevas, primero `resto` con una aprobación nueva: A5 con la base que corre la caja, B4 otra vez y B7.
Luego la imagen:

```bash
cd /opt/bob && sudo ./deploy.sh --imagen <tar nuevo> --atestacion <atestación nueva>
```

Si la nueva no queda sana, `deploy.sh` vuelve solo a la anterior (`vuelta-atras: …`). Para volver a mano:

```bash
cd /opt/bob && sudo ./rollback.sh; echo "rc=$?"
```

Lo esperado: `vuelta-atras: corre sha256:…` y `rc=0`. Correrlo otra vez deja la que había. La vuelta atrás es solo de
la imagen: lo que aplicó `resto` se queda.
