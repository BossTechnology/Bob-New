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
| `<host de BOb>` (`BOB_HOST` y `BZZZ_HOST_BOB`) | `<host de BOb de lab-02>` (confirmado por Henry el 26 nov) | `<host de BOb de model-01>` (confirmado por Henry el 26 nov) | `<host de BOb de Febor>` (ya resuelve, 26 nov) |
| `<dominio base>` (`generar-config-portal.sh`) | `<dominio base de lab-02>` (el portal está en la raíz del dominio) | `<dominio base de model-01>` (el portal está en `app.` del dominio) | `<dominio base de Febor>` |
| `<uuid de la org>` (`BOB_ORG_ID`) | creada el 26 nov (slug `laboratorio`); el uuid lo da el `select` de B8b | creada el 26 nov (slug `modelo`, la demo); el uuid lo da el `select` de B8b | sale de B8b en la ventana (slug `febor`) |
| Herramientas del servidor (B0) | instaladas el 25 nov: CLI de Supabase 2.120.0 y `postgresql-client-16`; `git`, `setpriv` y `flock` ya estaban | ni CLI ni psql (medido el 25 nov): se instalan como en B0; `git`, `setpriv` y `flock` ya están | ni CLI ni psql (medido el 25 nov); `git`, `setpriv` y `flock` ya están. **Se instalan dentro de la ventana (B0b), no antes:** apt y needrestart pueden reiniciar servicios |
| Pendiente del servidor (B0b) | apt dejó diferido `systemctl restart docker.service`; el kernel **ya está en `6.8.0-151`** (medido el 26 nov): en B0b solo se comprueba | lo mismo: Docker diferido y kernel 147 → 151, aún sin reiniciar | kernel `7.0.0-1014-gcp` corriendo con `7.0.0-1018-gcp` instalado y `/var/run/reboot-required` presente (medido el 26 nov; no es 147 → 151); además «System restart required», swap al 27 % y 2 procesos zombi (25 nov): el reinicio de B0b |
| Almacén de imágenes de Docker | **containerd** (medido el 25 nov: `29.7.2 overlayfs [["driver-type","io.containerd.snapshotter.v1"]]`): B12 y B13 llevan la parte de containerd | **containerd** (medido el 25 nov: Docker 29.6.1, `overlayfs` con `io.containerd.snapshotter.v1`): lo mismo que lab-02 | **containerd** (medido el 25 nov: Docker 29.7.2, `overlayfs` con `io.containerd.snapshotter.v1`): lo mismo que lab-02 |
| El BOb viejo (`bzzz-bob`) | no corre (medido el 25 nov): B2 no aplica, pero el primer alta sigue necesitando `--reiniciar` (B6) | no corre (medido el 25 nov): B2 no aplica; el primer alta necesita `--reiniciar` (B6) | no hay (medido el 25 nov): `docker ps -a | grep -i bob` vacío y sin `compose/l7-bob.yml`, al contrario de lo que suponía la auditoría (B4). B2 y B14 no aplican; el primer alta necesita `--reiniciar` (B6) |
| La cadena de BOb en la base | ya está, aplicada en `5e5b9be` | no está (medido el 25 nov): sin esquema `bob` y sin `supabase_migrations.schema_migrations`, así que sin historia del CLI. B5 (`cadena`) la crea | no está (medido el 25 nov): sin esquema `bob` y sin `supabase_migrations.schema_migrations`. B5 (`cadena`) la crea |
| `<base>` de `instalacion-firmada` | la huella de `5e5b9be` | **la base vacía** (BossTechnology/BOb-engine#54) | **la base vacía** (BossTechnology/BOb-engine#54), la misma que model-01: comparten aprobación (A5) |
| Dónde está Bzzz | `/opt/bzzz` (`docs/OPERACION_bob.md` de Bzzz) | `/opt/bzzz` (sin medir: la sonda del `working_dir` en B0) | `/opt/bzzz`, con el compose en `/opt/bzzz/compose` (medido el 25 nov: l1 a l5, y el `working_dir` de `bzzz-supabase-db` es ese) |
| Quién | Henry, con quien ayude | Henry, con quien ayude | **solo Henry** |

Los hosts y dominios reales no van en este repo: se apuntan aparte antes de la ventana. El dominio base sale de las URL
de `/data/bzzz/supabase/portal/config.js` de la caja (`grep -oE 'https?://[a-z0-9.-]+' …`), y `BZZZ_HOST_PORTAL` de
`compose/.env` dice dónde está el portal.

**La base vacía** es para una caja sin BOb: no hay commit del que sacar la huella. Henry decidió «Defined empty base»
el 2026-11-25, y está en `main` de BOb-engine (BossTechnology/BOb-engine#54 y #56).
model-01 y Febor son de esas cajas. Su `<base>` es el sha256 de nada, que ningún árbol tiene
(`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; `firma-instalacion.sh vacia`). La aprobación se
firma desde ella (A5) y `instalacion-firmada` la lleva (B3). Desde la base vacía solo corre `cadena`, y antes de aplicar
nada comprueba en la base de datos que de verdad no hay BOb. Si `cadena` falla a medias, se reintenta como dice C.

## Lo que tiene que estar fusionado

| Repo | PR | Qué trae | Estado (26 nov) |
|---|---|---|---|
| Bzzz | #445, #449, #450, #454, #457, #458 | `l7-bob.yml` fuera; `bzzz-vecinos`; el alta de vecinas; la atestación por la config e `id-de-imagen.sh` | en `main` |
| Bzzz | #460 | el bit de ejecución en los guiones de `scripts/` | en `main` |
| Bzzz | — | la llave pública de imagen en `config/bob/firmantes_imagen` **[llave-img]** | en `main` (`188f2ee`); medido el 26 nov: `deploy.sh` dijo «firmada por henry» en lab-02 y model-01 |
| Bzzz | BossTechnology/bzzz#467 | `bob.conf` declara los dos `EXECUTE` de `bob_app` fuera de `bob` (sin esto B6 se niega con dos hallazgos de V14) | en `main` (`f1fa719`) |
| Bzzz | BossTechnology/bzzz#468 | D78: `bob-web` en `bzzz-edge` y en la lista de lo que sale (sin esto B13 falla en §7, «salen sin estar en ella: bob-web») | en `main` (`2cebc7d`) |
| Bzzz | BossTechnology/bzzz#469 | §15 compara ids enteros: lo de `config/caja/fuera-del-repo.txt` deja de salir como vecina (el latido de lab-02, V4) | **abierto**: mientras no entre, B13 en lab-02 da 1 fallo (V4 y V5 del latido) y es el único que se acepta |
| Bob-New | #55, #37 | el paquete de `/opt/bob`; las pantallas del Slice 3 | en `main` |
| Bob-New | BossTechnology/Bob-New#56 | `deploy.sh` ya no migra; los chequeos de secretos descubren por patrón | en `main` |
| BOb-engine | #48, #52 | O-3 firmado (`cadena` y `resto`); el texto de P5 por D77 | en `main` |
| BOb-engine | #51 | `verify-required` lo comprueba el guion, no `ssh-keygen` | en `main` (`946cb19`) |
| BOb-engine | #53 | `postgres.env` fuera de `secrets/` (B2), cómo llega root a la base (B3), requisitos de `firma-instalacion` (H5) | en `main` |
| BOb-engine | #54 | la base vacía (H4), para una caja donde BOb nunca se instaló (model-01 y Febor), y el reintento de un `cadena` a medias | en `main` (`ccd9269`) |
| BOb-engine | BossTechnology/BOb-engine#56 | una aprobación `d → d` nombra su caja (`--caja <machine-id>`); la marca de un `cadena` a medias nombra su base de datos | en `main` (`731a405`) |
| BOb-engine | — | la llave de Henry en `supabase/provision/firmantes_instalacion` **[llave-fido]** | en `main` (`8af7da7`, retocada en `8378591`); medido en las cajas el 26 nov: la firma se valida |
| BOb-engine | BossTechnology/BOb-engine#58 | `cadena` hace el `db push` con `sslmode=disable` (sin esto B5 falla con «server does not support SSL») | en `main` (`0b2e9bc`) |
| BOb-engine | BossTechnology/BOb-engine#67 | el paso REVOKE de F-58 (B7b): se copia solo `scripts/f58/`, fuera de la cadena firmada y del bundle | en `main` (`ed00dd2`) |

## A. Una vez, en el portátil

**Antes de nada, la sonda del alias de B0** (primera de B0): A ya usa `ssh bzzz-<caja>` y `scp`.

**A1. La llave de imagen.** **[llave-img] [en `main` de Bzzz (`188f2ee`)]** La línea pública de la llave SSH con la
que se firma va en `config/bob/firmantes_imagen` de Bzzz, por PR. Tiene que estar en `main` y llegar a cada caja con
B1. Si no, `construir-imagen-bob.sh` acaba en rc 1 (comprueba contra la copia del portátil) y `deploy.sh` no carga la
imagen (comprueba contra la de la caja).

**A2. La llave de instalación.** **[llave-fido] [en `main` de BOb-engine (`8af7da7`)]** La línea
pública de la llave de Henry va en `supabase/provision/firmantes_instalacion` de BOb-engine, por PR. Antes de abrirlo,
comprobar que la huella es la de la llave:

```bash
ssh-keygen -lf <llave de instalación>.pub
```

**A3. Los dos commits.** Apuntar los SHA completos, de 40 caracteres:
- `<C_WEB>`: el de `main` de Bob-New que se construye. Va en `3a74911` o después, y con BossTechnology/Bob-New#56
  dentro;
- `<C_ENG>`: el de `main` de BOb-engine que se instala. Lleva #51, #54 y BossTechnology/BOb-engine#56 (`731a405` o
  después), y la llave de A2;
- solo para lab-02, `<C_WEB_ANTES>`: un commit anterior de `main` de Bob-New que ya tiene el paquete de la caja
  (`f73be3e`, la fusión de #55, o después). Es la segunda imagen de la vuelta atrás con containerd (B13).

```bash
git -C <checkout de Bob-New> rev-parse origin/main
```

```bash
git -C <checkout de BOb-engine> rev-parse origin/main
```

**A4. Construir y firmar la imagen, una sola vez.** **[llave-img]** El mismo tar sirve para las tres cajas. Desde el
checkout de Bzzz en `main`, con `bash` delante (M3). Con Bzzz#460 el guion ya es ejecutable, pero `bash` vale igual
con un checkout más viejo. Las carpetas de salida tienen que existir antes: si no, el guion sale con `no-empieza`.

```bash
mkdir -p /tmp/bob-entrega /tmp/bob-entrega-antes
```

```bash
bash scripts/construir-imagen-bob.sh <checkout de Bob-New> <C_WEB> <llave SSH de imagen> /tmp/bob-entrega
```

Lo esperado: rc 0 y tres ficheros en `/tmp/bob-entrega`: `bob-web-<12>.tar`, `bob-web-<12>.atestacion` y
`bob-web-<12>.atestacion.sig`.

Solo para lab-02, la segunda imagen, la de `<C_WEB_ANTES>`, en otra carpeta. A6 la lleva y B13 la usa:

```bash
bash scripts/construir-imagen-bob.sh <checkout de Bob-New> <C_WEB_ANTES> <llave SSH de imagen> /tmp/bob-entrega-antes
```

**A5. Firmar la instalación, una aprobación por cada `<base>` distinta.** **[llave-fido]** Desde un checkout limpio de
`main` de BOb-engine, en `origin/main`, que tiene que llevar BossTechnology/BOb-engine#56 (`731a405`): las
herramientas de firma son las de `main`. `FIRMA_LLAVE` es la llave de instalación de Henry, si no es la de por
defecto:

lab-02, desde el commit que tiene aplicado:

```bash
FIRMA_LLAVE=<llave de instalación> bash scripts/firmar-instalacion.sh <C_ENG> --base 5e5b9be
```

model-01 y Febor, desde la base vacía. Es una sola aprobación y vale
para las dos:

```bash
FIRMA_LLAVE=<llave de instalación> bash scripts/firmar-instalacion.sh <C_ENG> --base vacia
```

El guion enseña el log y el diff entre las dos revisiones. Desde la base vacía todo es nuevo: el log es el de
`<C_ENG>` entero y el diff sale de nada, así que es largo. Escribir `firmo` y tocar la llave. Guardar
`<base>-<nueva>.aprobacion` y su `.sig`. `<base>` y `<nueva>` son huellas de 64 caracteres. Desde la base vacía,
`<base>` es `e3b0c442…b855`.

Ninguna de las dos lleva `--caja`: `--caja` es solo para la misma huella (`d → d`), y el guion lo rechaza si la base y
la nueva son distintas. En la primera puesta no hace falta. Lo normal es que `resto` (B7) corra con la aprobación con la
que `cadena` llegó a `<C_ENG>`: `caja` la guarda en `instalacion-aprobacion`.

**`d → d`, solo si hace falta.** Es para una caja que ya está en la huella de `<C_ENG>` y no tiene
`instalacion-aprobacion` (no se sabe con qué aprobación llegó): por ejemplo, para correr otra vez `resto`. La
aprobación nombra esa caja, y no vale para otra. Su `machine-id` se lee en la caja:

```bash
ssh bzzz-<caja> cat /etc/machine-id
```

```bash
FIRMA_LLAVE=<llave de instalación> bash scripts/firmar-instalacion.sh <C_ENG> --base <C_ENG> --caja <machine-id>
```

No hay diff: el guion dice que firma `d → d` para esa caja sola. Sin `--caja`, rechaza la misma huella dos veces.

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

Solo para lab-02, la segunda imagen de la vuelta atrás con containerd (B13):

```bash
ssh bzzz-lab-02 mkdir -p entrega-bob/antes && scp /tmp/bob-entrega-antes/bob-web-<12 antes>.* bzzz-lab-02:entrega-bob/antes/
```

## B. En cada caja, en este orden

### B0. Sondas, antes de la ventana (solo leen)

Primero, que el alias SSH apunta a la VM correcta. **Se corre antes de A**, antes del primer `ssh` o `scp` de la
sección A, porque todo lo demás se mide y se envía a lo que responda ese alias. Desde el portátil. El hostname esperado
de cada caja lo tiene Henry (es dato del cliente y no se escribe en el repo), y se compara con el `hostname` corto
(`hostname -s`):

```bash
test "$(ssh bzzz-<caja> hostname -s)" = '<hostname corto esperado de la caja>' && echo "alias OK" || echo "ALIAS NO COINCIDE: parar"
```

Tiene que decir `alias OK`. Si no, se para: el alias apunta a otra VM y nada de lo que sigue vale hasta corregirlo.

```bash
docker info -f '{{.ServerVersion}} {{.Driver}} {{json .DriverStatus}}'
```

Dice qué almacén usa Docker, y con él qué es el id de una imagen:
- `overlay2` sin `io.containerd.snapshotter`: el almacén clásico. El `.Id` de una imagen es el sha256 de su
  configuración, lo mismo que firma la atestación.
- `overlayfs` con `io.containerd.snapshotter.v1` (lab-02): el de containerd. El `.Id` de la imagen y el `.Image` del
  contenedor son el digest del índice o del manifiesto, no el de la configuración. Ver «La rama de containerd» en B13.

Apuntar lo que da en cada caja. Las tres dieron containerd el 25 nov: la parte de containerd de B13 va en las tres.

```bash
docker ps --format '{{.Names}}' --filter name=bzzz-bob
```

Si sale `bzzz-bob`, B2 es obligatorio antes del alta. Por si corre con otro nombre, también los parados:

```bash
docker ps -a --format '{{.Names}} {{.Status}} {{.Image}}' | grep -i bob
```

Y si en `/opt/bzzz` sigue el fichero del BOb viejo (en Febor no está: medido el 25 nov):

```bash
ls -l /opt/bzzz/compose/l7-bob.yml
```

Si existe y no corre nada de él, B2 no hace falta y el fichero se borra en B14.

Dónde está Bzzz en esta caja. Todo lo que sigue da por hecho `/opt/bzzz`, con el compose en `/opt/bzzz/compose`:

```bash
docker inspect bzzz-supabase-db --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
```

Tiene que dar `/opt/bzzz/compose` (así dio Febor el 25 nov). Si da otra ruta, se para y se cambian las rutas de esta
secuencia antes de seguir.

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
`/usr/lib/postgresql/<v>/bin/`; `git`, `setpriv` y `flock`; y un tmpfs en `/dev/shm`.

**Todo lo que está en ese `PATH` tiene que ser de root.** `firma-instalacion caja` lo comprueba y se niega si algo no lo es.
En lab-02, B5 se negó el 26 nov por `/usr/bin/at` (del usuario `daemon`, que lo instala así el paquete `at`). Henry: «Desinstala at».
Se purgó en lab-02 y en model-01; Febor no lo tiene. Para mirarlo antes, sin esperar a B5:

```bash
sudo /opt/bob/bin/firma-instalacion herramienta /usr/bin
```

(Necesita B3 hecho.) Si sale `at`, en lab-02 y model-01 antes de la ventana, y en Febor en B0b:

```bash
sudo apt-get purge -y at
```

Lo que falte se instala antes de la ventana (H5) en lab-02 y model-01. **En Febor, dentro de la ventana, en B0b:** apt y needrestart pueden
reiniciar servicios de una caja en producción. En lab-02 no había ni el CLI ni psql. Así se instalaron el 25 nov:

```bash
sudo apt-get install -y postgresql-client-16
```

El CLI de Supabase, el `.deb` oficial de la versión exacta, comprobado contra el `checksums.txt` de esa misma
release. El fichero se llama así, `checksums.txt`, no `supabase_<v>_checksums.txt`:

```bash
cd /tmp && curl -fsSLO https://github.com/supabase/cli/releases/download/v2.120.0/supabase_2.120.0_linux_amd64.deb && curl -fsSLO https://github.com/supabase/cli/releases/download/v2.120.0/checksums.txt
```

```bash
cd /tmp && sha256sum -c --ignore-missing checksums.txt
```

Tiene que decir `supabase_2.120.0_linux_amd64.deb: OK`. Si no, no se instala.

```bash
sudo dpkg -i /tmp/supabase_2.120.0_linux_amd64.deb && supabase --version
```

Tiene que dar `2.120.0`. **No actualizar a la v3 que sugiere el CLI:** `firma-instalacion` usa la versión que fija el
CI de BOb-engine (`SUPABASE_CLI_VERSION`), y hoy es 2.120.0.

Justo después, la telemetría del CLI apagada, para el usuario y para root. Sin esto, el CLI manda datos de uso desde
una caja de cliente, y `firma-instalacion` lo corre como root:

```bash
supabase telemetry disable; sudo supabase telemetry disable
```

Las dos tienen que decir «Telemetry is disabled» (medido en model-01 el 25 nov).

En model-01 y en Febor, si ya existe `bob` y qué cadena tiene la base. La sonda lee solo versiones, ninguna fila de
cliente:

```bash
sudo docker exec bzzz-supabase-db psql -X -tA -U supabase_admin -d postgres -c "select to_regnamespace('bob') is not null" -c "select version from supabase_migrations.schema_migrations order by version"
```

- `f`, y la segunda consulta falla con `relation "supabase_migrations.schema_migrations" does not exist`: la caja no
  tiene BOb ni historia del CLI (model-01). `<base>` es la base vacía, y B5 (`cadena`) va primero.
- `f` y ninguna versión de BOb: lo mismo, la base vacía.
- `t` y una lista: buscar en BOb-engine el commit cuyas migraciones son exactamente esas. Su huella es `<base>`. Si no
  casa con ningún commit, se para aquí y Henry decide.

### B0b. Docker y kernel pendientes: al abrir la ventana, antes de nada más (en Febor: primero las instalaciones, después el reinicio)

**En Febor, el orden es este y no otro** (Febor no tiene ni `supabase` ni `psql`, medido el 26 nov): 1) instalar el CLI
de Supabase 2.120.0, verificando `checksums.txt`, y `postgresql-client-16`; 2) apagar la telemetría del CLI (todo ello
como en B0); 3) **y solo después**, reiniciar al kernel nuevo. Se instala antes de reiniciar, y dentro de la ventana,
porque apt y needrestart pueden reiniciar servicios, y un reinicio hecho antes dejaría la caja reiniciada sin las
herramientas, o reiniciaría servicios a destiempo en una caja de producción. Febor dijo el 25 nov «System restart
required», con el swap al 27 % y 2 procesos zombi, y el reinicio los limpia.

**En lab-02 y model-01** (no en Febor), al instalar el CLI y psql apt dejó diferido el reinicio de Docker
(`systemctl restart docker.service`) y, en model-01, un kernel nuevo sin arrancar (147 → 151). lab-02 ya corre
`6.8.0-151` (medido el 26 nov). **En Febor** no pasó esto: corre `7.0.0-1014-gcp` con `7.0.0-1018-gcp` instalado y
`/var/run/reboot-required` presente (el kernel nuevo es el 1018, no el 151), y el reinicio va después de las
instalaciones, como arriba. **Nada de esto se hace fuera de una ventana de mantenimiento:** reiniciar Docker para
todos los contenedores de la caja, y reiniciar el servidor también. Se hace al empezar la ventana de cada ensayo, antes
de B1, para que el ensayo corra sobre la caja como quedará.

Mirar qué queda pendiente:

```bash
uname -r; ls /boot/vmlinuz-* ; [ -f /var/run/reboot-required ] && cat /var/run/reboot-required
```

Si hay un kernel más nuevo que `uname -r`, reiniciar el servidor (también reinicia Docker):

```bash
sudo systemctl reboot
```

Si solo falta Docker:

```bash
sudo systemctl restart docker.service
```

Después, volver a entrar (`ssh bzzz-<caja>`) y comprobar que la caja quedó entera antes de seguir:

```bash
uname -r; cd /opt/bzzz && scripts/verify-deployment.sh
```

Lo esperado: el kernel nuevo y 0 fallos. Si `verify-deployment.sh` falla, se arregla la caja antes de B1: el ensayo
no empieza sobre una caja rota.

### B1. Bzzz a `main`, con `generar-secretos.sh` primero (H2)

Enviar el árbol de `main` de Bzzz como siempre (`docs/OPERACION_actualizar.md`, la lista blanca de `lista-de-envio.sh`),
**a una carpeta nueva con el SHA**, no a `nuevo/`: esa carpeta ya existe en las cajas con un árbol viejo dentro y
`rsync` no borra nada, así que lo viejo se mezclaría con lo nuevo. `<árbol>` es
`/data/bzzz/misc/actualizaciones/main-<sha7>`, y es la ruta de todo B1. Desde el checkout de Bzzz en `main`:

```bash
git ls-files | scripts/lista-de-envio.sh > /tmp/bzzz-envio.txt
```

```bash
rsync -a -e /usr/bin/ssh --files-from=/tmp/bzzz-envio.txt ./ bzzz-<caja>:<árbol>/
```

(`-e /usr/bin/ssh` por si el ssh que toma `rsync` no lee `~/.ssh/config`.)

Con #449, ClickHouse monta en toda caja los usuarios de `bzzz-vecinos`, y `actualizar.sh` no lo recrea sin sus hashes
en `clickhouse.env`. Por eso, **antes** de `--aplicar`, el `generar-secretos.sh` del árbol nuevo. No pisa nada de lo
que ya existe:

```bash
sudo bash <árbol>/scripts/generar-secretos.sh
```

**Después, la llave de la puerta.** El `chown -R` de `generar-secretos.sh` deja `puerta.clave` de root, y `bzzz-puerta`
entra en bucle con «no puedo leer la clave… Permission denied» (lab-02 y model-01, 26 nov). Mirarlo siempre:

```bash
sudo stat -c '%U %a' /opt/bzzz/secrets/puerta.clave
```

Tiene que dar `nobody 400`. Si no:

```bash
sudo chown 65534:65534 /opt/bzzz/secrets/puerta.clave && sudo chmod 400 /opt/bzzz/secrets/puerta.clave
```

Y `docker inspect -f '{{.State.Health.Status}}' bzzz-puerta` vuelve a `healthy`. Cuando Bzzz lo arregle en el guion,
este paso queda como comprobación.

```bash
cd /opt/bzzz && bash <árbol>/scripts/actualizar.sh --plan <árbol>
```

Se corre el `actualizar.sh` **del árbol enviado**, no el instalado en `/opt/bzzz/scripts`: el instalado no conoce las
rutas nuevas (`vecinos/`, `conectores/acciones/`, `config/caja/fuera-del-repo.txt`, `config/salida/…`) y en lab-02 dio
19 «desconocido»; el del árbol enviado dio 0 (`docs/OPERACION_actualizar.md` de Bzzz, sección «El procedimiento»; el 19 → 0 se midió en lab-02 el 26 nov). Ninguna ruta
`desconocido`. `compose/l7-bob.yml` sale en amarillo como SOBRA si la caja lo trae: se queda hasta B14.

```bash
cd /opt/bzzz && bash <árbol>/scripts/actualizar.sh --aplicar <árbol>; echo "rc=$?"
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

En una caja sin BOb (model-01 y Febor), `<base>` es la base vacía. En
vez de las dos órdenes de arriba:

```bash
cd ~/bob-engine && scripts/firma-instalacion.sh vacia | sudo tee /opt/bob/instalacion-firmada >/dev/null && sudo chmod 644 /opt/bob/instalacion-firmada
```

Si el clon de `~/bob-engine` no tiene la orden `vacia` (un commit sin BossTechnology/BOb-engine#54), el guion sale con
error y `tee` deja `instalacion-firmada` vacío. La comprobación de abajo lo ve: la primera línea no es la base vacía.

```bash
cat /opt/bob/instalacion-firmada; ls /opt/bob/instalacion-en-curso /opt/bob/instalacion-aprobacion 2>&1
```

Lo esperado:
- la primera línea es `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`;
- los otros dos ficheros no existen.

`instalacion-en-curso` e `instalacion-aprobacion` los escribe `caja`, nunca se escriben a mano. Si
`instalacion-en-curso` ya existe, esta caja tiene un `cadena` a medias: se sigue por C, no por aquí.

**Cómo llega root a la base (B3).** `bzzz-supabase-db` no publica ningún puerto, y su nombre no resuelve en el
servidor. `POSTGRES_HOST` es su IP en `bzzz-app`:

```bash
docker inspect -f '{{(index .NetworkSettings.Networks "bzzz-app").IPAddress}}' bzzz-supabase-db
```

Esa IP y `bzzz-supabase-db`, que es el `MIGRADOR_HOST` del alta y lo pide `resto`, van en `hosts-permitidos`:

```bash
printf '%s\n' '<IP de bzzz-supabase-db>' bzzz-supabase-db | sudo tee /opt/bob/hosts-permitidos >/dev/null && sudo chmod 644 /opt/bob/hosts-permitidos
```

Medido en lab-02 y model-01 el 26 nov a través de `firma-instalacion`: con la IP de `bzzz-app`, B5 y B7 entran. **No la
de `bzzz-vecina-bob`**, que es otra: con ella `caja` se niega («is not loopback nor in /opt/bob/hosts-permitidos»). La IP cambia
si se recrea el contenedor. Leerla otra vez antes de B5 y de B7, y antes de cada instalación.

### B4. La contraseña de `postgres`, FUERA de `/opt/bob/secrets` (B2)

`deploy.sh` no empieza si en `secrets/` hay un fichero de root que no sea `migrador.env`. La de `postgres` va aparte,
en `/root/bob-install/` (BossTechnology/BOb-engine#53):

```bash
sudo install -d -o root -g root -m 700 /root/bob-install && sudo install -o root -g root -m 600 /dev/null /root/bob-install/postgres.env
```

La línea `POSTGRES_PASSWORD=…` se copia de `/opt/bzzz/secrets/supabase.env` como root, con `umask 077`. Así la
contraseña no pasa por un editor, por la pantalla ni por el portapapeles:

```bash
sudo sh -c 'umask 077; grep "^POSTGRES_PASSWORD=" /opt/bzzz/secrets/supabase.env > /root/bob-install/postgres.env'
```

```bash
sudo grep -c '^POSTGRES_PASSWORD=.' /root/bob-install/postgres.env; sudo stat -c '%U %a' /root/bob-install/postgres.env
```

Lo esperado: `1` y `root 600`. Si da `0` o más de `1`, se para, y no se arregla a mano con un editor. Nada de esta
secuencia imprime la contraseña.

### B5. `cadena`, como `postgres` **[llave-fido]**

```bash
sudo /opt/bob/bin/firma-instalacion caja ~/bob-engine <C_ENG> cadena POSTGRES_ENV=/root/bob-install/postgres.env POSTGRES_HOST=<IP de bzzz-supabase-db>
```

Escribir `instalo` cuando lo pida.

- **En lab-02** la cadena ya está, y lo esperado es que `db push --include-all` no aplique nada. Si aplica algo:
  - se apuntan las versiones que nombra la salida;
  - se para antes de B6, en lab-02, y model-01 no empieza;
  - se avisa.

  Lo aplicado no se deshace a mano: las migraciones no tienen vuelta atrás (C). Una versión que no esté en el diff
  firmado en A5 es un incidente. Una que sí esté contradice lo medido en lab-02 (la cadena entera en `5e5b9be`), y
  hay que entender por qué antes de firmar nada más.
- **En model-01 y Febor**, desde la base vacía, la salida dice `= the empty base`. Antes de aplicar nada, `cadena`
  comprueba que la base no tiene rastro de BOb: historia del CLI, roles `bob` o `bob_*`, esquemas `bob_*`, o nombres que crean sus
  migraciones. Si lo rechaza, la base no está vacía: se para, se vuelve a medir con la sonda de B0 y no se cambia
  `instalacion-firmada` para saltárselo. Si pasa, crea `bob` y aplica la cadena firmada. Si falla a medias, C dice
  cómo reintentar.

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

### B7. `resto`, como `bob_migrador` **[llave-fido]**

```bash
sudo /opt/bob/bin/firma-instalacion caja ~/bob-engine <C_ENG> resto POSTGRES_ENV=/root/bob-install/postgres.env POSTGRES_HOST=<IP de bzzz-supabase-db>
```

`<IP de bzzz-supabase-db>` es la de `bzzz-app` (B3), la misma de B5. No la de `bzzz-vecina-bob`: B6 une la base a esa red
y `docker inspect` enseña las dos.

Escribir `instalo`. Lo esperado: aplica, como `bob_migrador`, las migraciones de `<C_ENG>` que no están en la cadena.
Hoy son tres: las dos del Slice 3 y la de `organizations`:
- `20261121200000_slice3_catalog_and_feeder_map.sql`;
- `20261121200100_slice3_cell_state.sql`;
- `20261121200200_organizations_read_only_for_bob_app.sql`.

Quedan apuntadas en `bob.schema_migrations`. Sin ellas, bob-web arranca y pinta «Estados del Slice 3 pendientes», que no
es v1.

### B7b. El paso REVOKE de F-58, justo después de B7 y antes de abrir el acceso (lo corre Henry)

`<C_ENG>` de esta puesta es `00f79b7` (la aprobación `544fe970`). Deja a `authenticated` con TRIGGER, REFERENCES y
MAINTAIN sobre las tablas de `bob` (F-58): un usuario con sesión podría colgar un trigger en `bob.alert_log`. La cadena
firmada y el bundle de A no se tocan. Este paso lo corrige en la caja con dos guiones de BOb-engine,
`scripts/f58/revocar.sh` y `scripts/f58/revocar.sql`, en `d15ac7ef76a7be733908c05a5ff4a964be31b2c5`
(BossTechnology/BOb-engine#67). No es una migración y no cambia la huella de lo instalado. Solo se copian esos dos
ficheros, como `scripts/demo/` en lab-02.

Las sumas esperadas, en ese commit:
- `revocar.sh`: `b9621ca3c29a407800350559b107ad241c819f126b28d5382610202ff21d1db5`;
- `revocar.sql`: `0de98c36440bf639f13e005a6a0a5116651d87a9b4557cc5db8411dd2562328c`.

En el portátil, desde un clon de BOb-engine que tenga ese commit. Se comprueban las sumas antes de copiar; si el commit
falta o algo no cuadra, se para sin copiar nada:

```bash
C=d15ac7ef76a7be733908c05a5ff4a964be31b2c5; d=$(mktemp -d); for f in revocar.sh revocar.sql; do git -C <checkout de BOb-engine> show "${C}:scripts/f58/${f}" > "$d/$f" || exit 1; done; (cd "$d" && printf '%s  revocar.sh\n%s  revocar.sql\n' b9621ca3c29a407800350559b107ad241c819f126b28d5382610202ff21d1db5 0de98c36440bf639f13e005a6a0a5116651d87a9b4557cc5db8411dd2562328c | shasum -a 256 -c -) && ssh bzzz-<caja> 'mkdir -p entrega-bob/f58' && scp "$d"/revocar.sh "$d"/revocar.sql bzzz-<caja>:entrega-bob/f58/
```

El README de `scripts/f58/` no se copia: su sección «Cómo correrlo» usa `~/bob-engine` y no aplica a esta puesta.

En la caja, comprobar otra vez las sumas, instalar como root y correr:

```bash
cd ~/entrega-bob/f58 && sha256sum -c <(printf '%s  revocar.sh\n%s  revocar.sql\n' b9621ca3c29a407800350559b107ad241c819f126b28d5382610202ff21d1db5 0de98c36440bf639f13e005a6a0a5116651d87a9b4557cc5db8411dd2562328c) && sudo install -d -o root -g root -m 700 /root/f58 && sudo install -o root -g root -m 755 revocar.sh revocar.sql /root/f58/ && sudo bash /root/f58/revocar.sh; echo "rc=$?"
```

Si `sha256sum -c` no da `OK` en los dos, no se corre nada: parar y avisar. Root solo ejecuta sus copias de `/root/f58`,
que nadie más puede escribir.

Lo esperado, entre otras líneas, y `rc=0`:
- `F-58 before: N grants beyond SELECT, INSERT, UPDATE and DELETE held by application roles`. En lab-02, el 27 nov: 84.
- `F-58 after: 0 grants left on M relations of bob; SELECT, INSERT, UPDATE and DELETE unchanged. OK`. En lab-02: 65.
- `F-58 default privileges: none beyond SELECT, INSERT, UPDATE and DELETE for new tables in bob`.
- `F-58: done`.

Apuntar `N` y `M` en el registro de la puesta. Correr otra vez la última orden tiene que dar `before: 0` y `rc=0`.

Si sale `WARNING: F-58 default privileges: …` con `rc=0`, no es un fallo: el REVOKE se hizo, pero las tablas nuevas que se
creen después volverían a tener esos permisos. Se sigue con la puesta, se apunta y se avisa. Cualquier otro `rc` distinto
de 0: no abrir el acceso (B10) y avisar. El guion no cambia nada si falla: todo va en una transacción.

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

Ni `postgres.env` (B4), ni enlaces. En v1 tampoco `vecinos/` ni `feeder.env`.

**El feeder va después de v1, y BOb arranca vacío, también en Febor.** En v1 no hay nada que llene el esquema `bob`:
la tarea 3.7 de BOb-engine (el adaptador del feeder contra `bzzz-vecinos`), las vistas de BOb en `bzzz-vecinos` (P-F1;
hoy solo sirve `v1/bob/ping`) y el guion que construye y firma la imagen del feeder (P-H8) no existen. Después de B13
las tablas de datos de `bob` están a 0 (solo `cell_catalog`, la organización de B8b y las cuentas que entren): el
simulador muestra «sin fila» y «sin proyección», que es lo esperado. Por eso, en v1, ni `cert-vecina.sh` para `bob`
ni `deploy.sh --feeder`.

Si el certificado de `bob` se emite antes de tiempo (o después de v1, cuando vaya el feeder), ya no tumba el deploy de
bob-web (M2, cerrado). `cert-vecina.sh --emitir bob` deja el directorio `secrets/vecinos/`, y `deploy.sh` lo acepta
solo así, después del `chown -R 65534` que imprime ese guion:
- `secrets/vecinos` un directorio de verdad (no un enlace), `65534 700` (o 500), y el único directorio de `secrets/`;
- dentro, solo `cliente.key` `65534 600` (o 400), `cliente.crt` y `ca.crt` `65534 644` (o 444, 600, 400), cada uno un
  fichero normal con un solo enlace. Cualquier otro nombre, enlace o subdirectorio y `deploy.sh` no empieza.

Con `--feeder`, `deploy.sh` exige además `feeder.env` y los tres ficheros. El feeder los monta sueltos; el directorio no
se monta.

### B8b. La organización de la caja

Una caja, una organización (P5). Ningún guion la crea, y sin ella no hay `BOB_ORG_ID` para B9. Medido el 26 nov:
`bob.organizations` vacía en lab-02 y model-01 después de B7. Como `postgres`, dentro de la caja:

```bash
sudo docker exec bzzz-supabase-db psql -U postgres -d postgres -tA -c "insert into bob.organizations (name, slug, plan) values ('<Nombre>', '<slug>', 'enterprise') on conflict (slug) do nothing; select id, slug from bob.organizations;"
```

El `id` que imprime es `<uuid de la org>`. El slug va en minúsculas, cifras y guiones; `plan` es `starter`, `growth` o
`enterprise`. Los de lab-02 y model-01 están en «Lo que cambia» (Henry, 26 nov: «Laboratorio son pruebas model es la
caja modelo la versión demo y febor es la caja del Cliente»).

Quien entra a BOb necesita fila activa en `bob.users` de esa organización; sin ella, 403 (P-1). Hoy la fila se crea a mano.
**[pendiente: alta sola como viewer con la sesión de BzzzBX, Henry 26 nov; PR en BOb-engine y Bob-New]**

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

`BOB_PORTAL_URL` es el origen https del portal de esta caja (`https://` y `BZZZ_HOST_PORTAL`, sin ruta). BOb ya no
tiene login propio en la caja: sin sesión manda allí (Henry, 2026-11-26). Sin ella, bob-web no arranca:

```bash
printf 'BOB_ORG_ID=%s\nBOB_GOTRUE_URL=http://bzzz-supabase-auth:9999\nBOB_DB_HOST=bzzz-supabase-db\nBOB_PORTAL_URL=https://%s\n' '<uuid de la org>' '<host del portal>' | sudo tee /opt/bob/config/caja.env >/dev/null
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

En el navegador, `https://<host de BOb>` con un certificado válido (no el de Traefik por defecto). BOb no pide clave:
sin sesión va al portal, se entra allí con la cuenta de BzzzBX, y el portal vuelve a BOb por `/entrar` (Bzzz #470, que
va con esta imagen). La primera vez, una cuenta sin fila en `bob.users` queda como viewer de la organización. La lista
de lo que hay que mirar es `bob-web-real-box-checklist`:
- la salud en menos de 2 s;
- sin sesión, al portal y de vuelta a la misma página de BOb, sin bucle;
- una cuenta nueva entra como viewer (una fila nueva en `bob.users`, papel `viewer`);
- 403 con una fila inactiva;
- «Cerrar sesión» en BOb deja también el portal sin sesión;
- el simulador sin cifras inventadas;
- y ahora también las celdas del Slice 3 con su estado, no «Estados del Slice 3 pendientes».

Sin datos todavía: en v1 no hay feeder (B8), así que las cifras salen vacías («sin fila», «sin proyección», «—»).
Una cifra inventada sí es un fallo.

```bash
cd /opt/bzzz && scripts/verify-deployment.sh
```

Lo esperado: 0 fallos. Mira la puerta de BOb, su vecina y la redirección puerta → portal → BOb (por eso B10).

**§15 pide `bzzz-vecinos` en marcha** en cuanto existe la vecina `bob`, aunque en v1 no vaya el feeder. En lab-02 y model-01
no existía (26 nov). Henry: «Encenderlo sin cert de bob». La CA y el certificado del SERVIDOR, sí; el de `bob`, no: en v1 no va el
feeder (B8). Como `bzzzops`:

```bash
cd /opt/bzzz && scripts/cert-vecina.sh --crear-ca && scripts/cert-vecina.sh --servidor
```

```bash
sudo chown 10091 /opt/bzzz/secrets/vecinos-mtls/servidor/servidor.key
```

```bash
cd /opt/bzzz && docker compose --env-file compose/.env -f compose/l6-vecinos.yml --profile vecinos up -d --build && bash scripts/vecinos-redes.sh
```

Lo esperado: `red bzzz-vecina-bob unida`, `bzzz-vecinos` `healthy`, y `/opt/bob/secrets` sigue con solo `app.env` y
`migrador.env`. Si ya estaba encendido en la caja, no se repite. Con esto model-01 dio 0 fallos el 26 nov.

#### La rama de containerd (lab-02, y cualquier caja que dé containerd en B0)

**Qué cambia.** La identidad que firma la atestación (`imagen_id`) es siempre el sha256 de la **configuración** de la
imagen, igual en los dos almacenes. Con containerd, lo que Docker enseña es otro número: el digest al que apunta el
`index.json` del tar. Así lo resuelve el código de `main`, sin pasos distintos para Henry:
- **Al construir:** `construir-imagen-bob.sh` (Bzzz) construye sin procedencia ni SBOM (`--provenance=false
  --sbom=false`). Firma el id leído del tar con `id-de-imagen.sh --tar`, que comprueba el sha256 del propio fichero de
  configuración. No usa `docker image inspect .Id`.
- **Antes de cargar** (`deploy.sh`, pasos 1 y 2): lee del tar las dos cosas. La `config` es lo atestado. El `objetivo`
  es el digest de `index.json`, siguiendo un índice hasta su único manifiesto linux/amd64, y será el `.Id` con
  containerd. Comprueba la atestación contra la `config`.
- **Después de cargar** (paso 3): busca cuál de las dos tiene Docker como `.Id`. Con containerd es el `objetivo`, y
  ese es el que corre y el que se guarda en `/opt/bob/.env`.
- **Al volver atrás** (`rollback.sh`, y `deploy.sh` cuando la nueva no queda sana): saca la configuración de la imagen
  anterior con `id-de-imagen.sh`, que con containerd lee el `manifest.json` de un `docker save --platform` en flujo,
  sin escribir en disco. Luego comprueba otra vez su atestación.
- **En `verify-deployment.sh`:** pasa el `.Image` del contenedor a `comprobar-atestacion-bob.sh`, que lo normaliza
  con `id-de-imagen.sh` antes de compararlo.

**Lo que no está medido.** Esta rama solo la ha recorrido el banco local con `BANCO_CONTAINERD=1`, un `docker` falso
que se porta como containerd. En una caja de verdad no se ha corrido nunca. En lab-02 se mira a mano, justo después de
B12.

La línea `config … · objetivo …` del paso 1 de `deploy.sh` (por stderr) da los dos números. Apuntarlos como
`<config>` y `<objetivo>`. `<config>` tiene que ser el `imagen_id` de la atestación:

```bash
grep '^imagen_id=' ~/entrega-bob/bob-web-<12>.atestacion
```

Lo que corre es el `objetivo`, tanto en el contenedor como en `.env`:

```bash
docker inspect -f '{{.Image}}' bob-web; docker image inspect -f '{{.Id}}' "$(docker inspect -f '{{.Image}}' bob-web)"; sudo grep '^BOB_WEB_IMAGEN=' /opt/bob/.env
```

Las tres tienen que dar `<objetivo>`.

`id-de-imagen.sh` saca de ahí la configuración:

```bash
bash /opt/bzzz/scripts/id-de-imagen.sh "$(docker inspect -f '{{.Image}}' bob-web)"
```

Tiene que dar `<config>`. Si da `no-medible`, la rama de containerd no sirve en esta caja: se para y se avisa.

```bash
bash /opt/bzzz/scripts/comprobar-atestacion-bob.sh ~/entrega-bob/bob-web-<12>.atestacion /opt/bzzz/config/bob/firmantes_imagen "$(docker inspect -f '{{.Image}}' bob-web)" bob-web
```

Tiene que dar `atestada: commit <C_WEB> de BossTechnology/Bob-New, firmada por …`.

**La vuelta atrás con containerd, solo en lab-02.** Hace falta una segunda imagen atestada: la de `<C_WEB_ANTES>`
(A3), que A4 construyó y A6 llevó a `~/entrega-bob/antes/`.

En lab-02, después de las comprobaciones de arriba, se pone primero la anterior, luego otra vez la de `<C_WEB>`, y se
vuelve atrás dos veces:

```bash
cd /opt/bob && sudo ./deploy.sh --imagen ~/entrega-bob/antes/bob-web-<12 antes>.tar --atestacion ~/entrega-bob/antes/bob-web-<12 antes>.atestacion; echo "rc=$?"
```

```bash
cd /opt/bob && sudo ./deploy.sh --imagen ~/entrega-bob/bob-web-<12>.tar --atestacion ~/entrega-bob/bob-web-<12>.atestacion; echo "rc=$?"
```

```bash
cd /opt/bob && sudo ./rollback.sh; echo "rc=$?"
```

```bash
cd /opt/bob && sudo ./rollback.sh; echo "rc=$?"
```

Lo esperado: `desplegada` dos veces y después `vuelta-atras` dos veces, todo con `rc=0`. Cada `rollback.sh` dice
`atestación de la anterior: atestada` por stderr: esa es la configuración sacada con `docker save`. Al final tiene que
correr `<C_WEB>` (`docker inspect -f '{{.Image}}' bob-web` = su `<objetivo>`).

Las tres cajas dan containerd. Si algo de esto falla en lab-02, model-01 y Febor no siguen hasta arreglarlo.

**Medido en lab-02 el 26 nov, la primera vez en una caja de verdad:** `<config>` `sha256:482a03ff…` = el `imagen_id` de la
atestación; `<objetivo>` `sha256:bac90ec5…` en el contenedor, en `docker image inspect` y en `.env`; `id-de-imagen.sh`
dio `<config>`; las cuatro órdenes de la vuelta atrás, con `rc=0`, y al final corría `<C_WEB>`.

### B14. Quitar `l7-bob.yml`

Solo cuando B13 está bien y Henry da BOb por bueno en esta caja, y solo si el fichero existe (en Febor no existe: B14 no
aplica allí):

```bash
[ -e /opt/bzzz/compose/l7-bob.yml ] && sudo rm /opt/bzzz/compose/l7-bob.yml
```

Y la copia de la contraseña de `postgres`, que no hace falta hasta la próxima instalación (D la vuelve a crear con B4):

```bash
sudo rm /root/bob-install/postgres.env
```

## C. Volver atrás en la primera puesta

### Si `cadena` (B5) falla a medias desde la base vacía (model-01, Febor)

`instalacion-firmada` sigue en la base vacía, y `caja` deja `/opt/bob/instalacion-en-curso`. No se toca a mano.
Comprobarlo:

```bash
cat /opt/bob/instalacion-firmada /opt/bob/instalacion-en-curso
```

Lo esperado, tres líneas:
- la base vacía, `e3b0c442…b855` (de `instalacion-firmada`);
- `e3b0c442…b855-<huella de C_ENG>`;
- `db <system_identifier>/<nombre>/<oid>`: la base de datos que `cadena` comprobó.

El reintento es la misma orden de B5, con el mismo `<C_ENG>` y la misma aprobación. `caja` solo acepta el mismo commit,
en la misma base de datos: un commit nuevo lo rechaza («a retry installs the same commit»), y también una base distinta
(por ejemplo, si se recreó `bzzz-supabase-db` con otra base). Si con `<C_ENG>` no se puede acabar, se para y se avisa.
No se borra `instalacion-en-curso` para firmar otro commit.

```bash
sudo /opt/bob/bin/firma-instalacion caja ~/bob-engine <C_ENG> cadena POSTGRES_ENV=/root/bob-install/postgres.env POSTGRES_HOST=<IP de bzzz-supabase-db>
```

`caja` ve `instalacion-en-curso` y corre la cadena con `BOB_BASE_VACIA=reanuda`. Lo pone `caja` y no se pasa a mano.
Acepta solo lo que deja una cadena a medias y rechaza lo demás:
- historia del CLI solo dentro de la cadena;
- ningún `bob.schema_migrations`;
- ningún rol `bob` ni `bob_*` que pueda entrar.

Si acaba bien, `caja` borra `instalacion-en-curso` y escribe `instalacion-firmada` e `instalacion-aprobacion`, y se
sigue por B6. Si el reintento lo rechaza, se para. No se borra `instalacion-en-curso` ni se reescribe
`instalacion-firmada` a mano para saltarse el chequeo.

### Si falla el deploy

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

Si BOb se queda fuera y no se reintenta ahora, quitar también la copia de la contraseña de `postgres`. B14 no
llega a correr, y la próxima instalación la vuelve a crear con B4:

```bash
sudo rm -f /root/bob-install/postgres.env
```

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
