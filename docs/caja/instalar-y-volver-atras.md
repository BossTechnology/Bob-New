# BOb al lado de la caja: instalar, actualizar y volver atrás

Runbook de `deploy/caja/` (Bzzz D77). **Lo corre Henry, a mano, en la caja.** Nada de esto se corre desde el
repo contra una caja de cliente sin su visto bueno en cada corrida.

## Qué hay en la caja

```
/opt/bob/
  compose.yml              copia de deploy/caja/compose.yml
  .env                     BOB_HOST y las imágenes (las escribe deploy.sh; no lleva secretos)
  config/caja.env          BOB_ORG_ID, BOB_GOTRUE_URL, BOB_DB_HOST, BOB_PORTAL_URL (el origen https del portal
                           de BzzzBX: BOb no tiene login propio) y, si no son los de siempre, BOB_DB_PORT y
                           BOB_DB_NAME (configuración, no secretos)
  secrets/app.env          bob_app            600, del usuario 65534
  secrets/feeder.env       bob_feeder         600, del usuario 65534 (cuando haya feeder)
  secrets/vecinos.{crt,key} y vecinos-ca.crt  mTLS hacia bzzz-vecinos (cuando haya feeder)
  secrets/migrador.env     bob_migrador       600, de root: lo escribe el alta de Bzzz y lo lee `firma-instalacion …
                           resto` de BOb-engine. Este paquete no lo lee y ningún contenedor lo monta
  atestaciones/            las atestaciones de cada imagen desplegada, con su .sig (la caja las lee de aquí:
                           Henry, 2026-11-25, «/opt/<v>/atestaciones/»)
  deploy.sh  rollback.sh  lib.sh  fijos.sh  comprobar-aislamiento.sh
```

Los contenedores son `bob-web` y `bob-feeder`, del proyecto de compose `bob`:

| Contenedor | Redes | Entrada | Secretos montados |
|---|---|---|---|
| `bob-web` | `bzzz-vecina-bob` (internal), `bzzz-edge` | Traefik de la caja, `puerta-apps@file` primero | `app.env` |
| `bob-feeder` (perfil `feeder`) | `bzzz-vecina-bob` | ninguna | `feeder.env`, certificado de `bzzz-vecinos` |

- **No se publica ningún puerto.**
- **Las imágenes van por id** (`sha256:…`).
- **Los contenedores son de solo lectura**, corren como `65534` y sin capacidades.
- **Cada contenedor tiene techo de memoria, CPU y procesos.**

**Lo fijo no se cambia desde el entorno.** `fijos.sh` fija:
- la raíz `/opt/bob`;
- el comprobador de atestaciones (`/opt/bzzz/scripts/comprobar-atestacion-bob.sh`, que necesita a su lado
  `id-de-imagen.sh`; llegan juntos por rsync, bzzz#454) y sus firmantes
  (`/opt/bzzz/config/bob/firmantes_imagen`);
- la URL de la puerta;
- los nombres de red.

Si alguno llega del entorno con otro valor, el guion no empieza. Solo el banco local los cambia, y necesita las tres
cosas: `BOB_BANCO=1`, una máquina sin `/opt/bzzz` y la marca que crea `banco.sh` (`BOB_BANCO_MARCA`, un fichero
propio fuera de `/opt` que nombra la carpeta del banco). Lo único que se ajusta es `BOB_ESPERA_SALUD`, los segundos de espera.

**La salida a internet de `bob-web`.** Henry eligió el 2026-11-25, en el chat de Relevo, «(A) bzzz-edge como
excepción»:
- `bob-web` va en `bzzz-edge`, como dice D77 §5. Esa red no es `internal`, así que `bob-web` puede salir.
- `comprobar-aislamiento.sh` la acepta **solo para `bob-web`**, fijo en el código. Falla con cualquier otra red con
  salida y con cualquier otro `bob-*` en `bzzz-edge`. El feeder no tiene salida.
- `BOB_SALIDA_ESTRICTA=1` quita la excepción, y el chequeo falla mientras siga así. Solo endurece; por eso se acepta.
- **Cerrar la salida de `bzzz-edge` queda para D59.** Hasta entonces, que BOb no salga depende de la imagen: en modo
  caja no arranca con claves de salida.

## Riesgos de v1 que se aceptan (ligados a D59)

- **`bzzz-edge` llega a `bob-web:3000` sin pasar por la puerta.** Cualquier contenedor de `bzzz-edge` (Traefik, el
  portal, Hivemonic…) puede hablarle directo, sin `puerta-apps@file`, y poner el `X-Forwarded-For` que quiera.
  `BOB_PROXY_HOPS` cuenta los saltos, pero no puede saber si el primero fue Traefik. Por lo mismo, los límites por
  dirección del login de BOb se pueden falsear desde dentro de esa red.
  - Lo que lo acota: la sesión de BOb se valida contra GoTrue en cada petición. Sin un token válido no se lee nada.
  - Lo que lo cerraría: una red de entrada propia, interna, a la que se una solo Traefik (un PR en Bzzz), o D59.
- **Tras una migración, la vuelta atrás pone la imagen vieja sobre el esquema nuevo.** Ni `deploy.sh` ni `rollback.sh`
  tocan la base. Si la imagen anterior no casa con el esquema, la vuelta atrás es del esquema `bob`, que se
  recupera por esquema (D77 77.14), aparte.

## Antes de la primera instalación (lo hace la caja, no este paquete)

1. **El alta de la vecina en Bzzz:**
   - la red `bzzz-vecina-bob`;
   - su línea en `l6-supabase.yml`;
   - los roles `bob_app`, `bob_feeder`, `bob_ai_ro` y `bob_migrador`, con su `CONNECTION LIMIT`;
   - el `pg_hba`;
   - `generar-secretos-vecina.sh bob`, que deja `/opt/bob/secrets/*.env`.
2. **Las migraciones de BOb, por la instalación firmada de BOb-engine** (`docs/p5-application-layer.md`): `firma-instalacion
   … cadena` con `postgres` antes del alta y `firma-instalacion … resto` con `bob_migrador` después. Nunca con
   `deploy.sh`: no migra.
3. **La puerta y los middlewares** (`puerta-apps@file`, `cabeceras@file`, `login-ritmo@file`) en el Traefik de la
   caja.
4. **`compose/l7-bob.yml` sale de Bzzz** (77.4) y su contenedor `bzzz-bob` se para. Si no, hay dos BOb para el
   mismo host.

## Instalar o actualizar

En el portátil, construir y atestar con el guion de Bzzz (solo commits de `main`):

```bash
scripts/construir-imagen-bob.sh <checkout de Bob-New> <commit> <llave SSH>
```

Llevar a la caja `bob-web-<12>.tar`, `.atestacion` y `.atestacion.sig`. Luego, en la caja:

```bash
cd /opt/bob
./deploy.sh --imagen /ruta/bob-web-<12>.tar --atestacion /ruta/bob-web-<12>.atestacion
```

**`deploy.sh` no migra.** Henry decidió el 2026-11-25 quitar `--migrar` («Remove it»): aplicaba `.sql` que la
atestación no firmaba. Las migraciones nuevas de BOb van **solo** por `firma-instalacion … resto` de BOb-engine, cuya
aprobación firma el commit y lo que aplica. Si una versión de bob-web necesita migraciones, `resto` va antes del deploy.

**Lo que hace `deploy.sh`:**
0. **Copia el tar y la atestación** a una carpeta de root, `/opt/bob/entrega/`. Todo lo que sigue mira esa copia: lo
   que se comprueba es lo que se carga, aunque el fichero de origen cambie entre medias.
1. **Lee el tar sin cargarlo.**
   - Tiene que traer una sola imagen.
   - No puede traer ninguna etiqueta que no sea `bob-web:<12 hex>`, la que pone `construir-imagen-bob.sh`. Si no, al
     cargarlo podría mover una etiqueta que la caja usa sin digest.
   - Su id es el sha256 de su configuración. Esa es la identidad que firma la atestación, y es la misma en cualquier
     almacén de docker. No se usa `.Id`: con el almacén de containerd, `.Id` es el digest del índice, no el de la
     configuración. `construir-imagen-bob.sh` (Bzzz) tiene que firmar la configuración.
   - El sha256 del tar tiene que ser el de la atestación.
2. **Comprueba la atestación** contra ese id. Si no casa, no carga nada.
3. **Carga la imagen** y busca su referencia local: la configuración con overlay2, o el digest al que apunta el
   `index.json` del tar con containerd. Esa referencia es la que corre y la que se guarda en `.env`. Para volver
   atrás, la configuración de la anterior se saca de la imagen del disco (con containerd, con `docker save`), no de
   `.env`.
4. **Guarda la imagen que corría** como anterior, levanta la nueva y espera a que esté sana.
5. **Comprueba por Traefik**, siempre: `https://<BOB_HOST>/api/health` sin sesión, por el 443 del propio servidor.
   - Tiene que contestar **la puerta**: 302, 303, 307 o 401. Eso prueba que el router existe (Traefik no enruta a un
     contenedor que no está sano) y que `puerta-apps@file` va delante.
   - Un **200 sin sesión** quiere decir que la puerta no está, y se trata como un fallo de seguridad.
6. **Corre `comprobar-aislamiento.sh`.**
7. **Si la nueva no queda sana**, comprueba otra vez la atestación de la anterior y vuelve a ella. Si lo que falla es
   la **seguridad** (aislamiento roto o sin la puerta), no vuelve atrás: **para todo lo de BOb**, es decir, el
   compose y, por id, cualquier `bob-*` que descubra el chequeo. Si la anterior tampoco queda sana, también para todo.

**La línea final:**

| Línea | rc | Qué quiere decir |
|---|---|---|
| `desplegada: …` | 0 | La nueva corre, está sana, detrás de la puerta y aislada |
| `vuelta-atras: …` | 1 | La nueva no quedó sana y corre otra vez la anterior |
| `fallo: …` | 1 | La seguridad falló y todo quedó parado; o ni la nueva ni la anterior quedaron sanas. La línea dice cómo quedó |
| `no-empieza: …` | 2 | No se tocó nada que corra (un tar rechazado ni siquiera se carga) |

### El feeder

**Pendiente: hoy nadie construye ni firma la imagen del feeder.** `construir-imagen-bob.sh` de Bzzz solo construye
y firma bob-web. P-H8 dice que los guiones de atestación se quedan en Bzzz y cubren también el feeder, así que el
guion para el feeder se escribe en Bzzz, no aquí.

`deploy.sh --feeder` ya exige lo mismo que para bob-web:
- un tar con una sola imagen, etiquetada `bob-feeder:<12 hex>`;
- una atestación firmada que case, guardada en `/opt/bob/atestaciones/`.

Sin ese guion no hay imagen que pase, y el feeder tampoco tiene todavía adaptador (tarea 3.7 de BOb-engine) ni vistas
en `bzzz-vecinos` (P-F1). Cuando existan los tres:

```bash
./deploy.sh --feeder --imagen bob-feeder-<12>.tar --atestacion bob-feeder-<12>.atestacion
```

Antes de eso, el perfil `feeder` no se levanta.

## Volver atrás

```bash
cd /opt/bob
./rollback.sh            # bob-web
./rollback.sh --feeder   # bob-feeder
```

- **Qué hace:** vuelve a la imagen anterior que dejó `deploy.sh`, comprobando otra vez su atestación, y comprueba la
  salud, la puerta por Traefik y el aislamiento igual que el deploy. La que corría pasa a ser la anterior, así que
  correrlo dos veces deja todo como estaba.
- **Si falla la seguridad**, para todo lo de BOb.
- **Lo que sale:** `vuelta-atras: …` con rc 0, `fallo: …` con rc 1 o `no-empieza: …` con rc 2.
- **No toca la base** (ver «Riesgos de v1»).

## Comprobar el aislamiento cuando se quiera

```bash
/opt/bob/comprobar-aislamiento.sh
```

**Qué mira.** Descubre todo contenedor del demonio que se llame `bob-*` o que lleve las etiquetas del proyecto `bob`,
también los parados.

**Lo permitido sale de D77, fijo en el guion**, y no de `/opt/bob/compose.yml`, que es lo que se protege:
- `bob-web` puede estar en `bzzz-vecina-bob` y `bzzz-edge`;
- `bob-feeder`, solo en `bzzz-vecina-bob`.

Para cada contenedor, falla si:
- no es `bob-web` ni `bob-feeder` del proyecto `bob`;
- está en una red que D77 no le da, o en una red con salida que no sea la excepción;
- lleva etiquetas `traefik.tcp.*` o `traefik.udp.*`;
- es enrutable sin ser `bob-web`;
- tiene un router HTTP sin `puerta-apps@file` primero;
- su entorno trae una variable con nombre de contraseña, llave, token o secreto, una URL con contraseña o un JWT con
  `role=service_role`. **Descubre por patrón, no por lista** (`SECRET_NAME` en `lib/bob/runtime.ts`, el mismo que
  usa la app al arrancar): `MIGRADOR_CLAVE`, la del alta de Bzzz, cae aunque nadie la haya nombrado. Solo se acepta
  ese nombre si el valor es la ruta de un fichero (`/run/secrets/bob/…`, o un `*_FILE`);
- un fichero montado trae lo mismo, salvo el login de ese contenedor en su fichero de `/opt/bob/secrets`
  (`BOB_APP_CLAVE` en el de `bob-web`, `BOB_FEEDER_CLAVE` en el del feeder);
- monta algo fuera de `/opt/bob/config` y `/opt/bob/secrets`;
- publica un puerto.

**Lo que sale:**

| Línea | rc | Qué quiere decir |
|---|---|---|
| `aislada: …` | 0 | Todo en orden |
| `no-aislada: …` | 1 | Algún contenedor falla; el detalle va por stderr |
| `no-medible: …` | 2 | No se pudo mirar, o no hay ningún `bob-*`: vacío no es aislado |

## El banco local

`deploy/caja/banco/banco.sh` prueba todo esto en un portátil. Se niega a correr si hay `/opt/bzzz` o si las redes de
la caja ya existen. Imita la caja con:
- las redes con sus nombres de caja;
- `supabase/postgres:17.6.1.136`, la imagen de la caja, con `bob_app` y `bob_migrador`, y el `migrador.env` del alta
  en `secrets/` (`deploy.sh` lo acepta de root y no lo lee);
- el GoTrue de Supabase;
- un Traefik v3.7.18 con los middlewares de la caja. La puerta es un forwardAuth que niega sin sesión.

Recorre, en orden:
1. Lo fijo no se cambia desde el entorno sin `BOB_BANCO`.
2. Instalar A (401 de la puerta sin sesión, 200 con ella), actualizar a B, `rollback.sh` y otra vez `rollback.sh`.
3. Una imagen que no queda sana vuelve sola, con la atestación de la anterior comprobada otra vez.
4. Tres tars rechazados sin cargarse:
   - uno con la atestación de otra imagen;
   - uno que además etiqueta una imagen ajena, que sigue donde estaba;
   - uno con dos imágenes.
5. `--migrar` ya no existe: `deploy.sh` lo rechaza como argumento desconocido.
6. El chequeo de aislamiento, visto fallar nueve veces:
   - un intruso con la service role;
   - uno con `MIGRADOR_CLAVE` en el entorno (ningún nombre de lista lo veía);
   - uno con una URL con contraseña en el entorno, sin que la contraseña salga en el mensaje;
   - otro `bob-*` en `bzzz-edge`;
   - un router TCP;
   - una red de más;
   - el modo estricto;
   - y, ya con parada, la service role y `MIGRADOR_CLAVE` en el fichero montado.
7. Cuatro fallos de seguridad que paran todo:
   - la service role en `app.env`;
   - `MIGRADOR_CLAVE` en `app.env`;
   - Traefik sin la puerta delante;
   - `bzzz-data` añadida a `bob-web` en el `compose.yml` de la caja.

```bash
docker build -t bob-web:banco-a .
deploy/caja/banco/banco.sh bob-web:banco-a <checkout de Bzzz>/scripts/comprobar-atestacion-bob.sh
BANCO_CONTAINERD=1 deploy/caja/banco/banco.sh bob-web:banco-a <checkout de Bzzz>/scripts/comprobar-atestacion-bob.sh
```

El banco copia también `id-de-imagen.sh` de la misma carpeta. Con `BANCO_CONTAINERD=1`, los guiones de la caja ven
un `docker` falso (`banco/docker-containerd-falso.sh`) que se porta como el almacén de containerd: `.Id` y `.Image`
son el digest del índice y la configuración no sirve de referencia.

En el CI, `lib/bob/caja-compose.test.ts` comprueba el compose resuelto:
- sin puertos;
- imagen por id obligatoria;
- sin root y de solo lectura;
- con techos;
- sin secretos en el entorno (la misma lista y el mismo patrón que el chequeo, comprobado que no se separan);
- con las redes de D77;
- cada router, descubierto por sus etiquetas, con `puerta-apps@file` primero;
- sin `tcp` ni `udp`.

También comprueba que la lista de secretos del chequeo sea idéntica a `FORBIDDEN_IN_BOX`.
