# BOb al lado de la caja: instalar, actualizar y volver atrás

Runbook de `deploy/caja/` (Bzzz D77). **Lo corre Henry, a mano, en la caja.** Nada de esto se corre desde el
repo contra una caja de cliente sin su visto bueno en cada corrida.

## Qué hay en la caja

```
/opt/bob/
  compose.yml              copia de deploy/caja/compose.yml
  .env                     BOB_HOST y las imágenes (las escribe deploy.sh; no lleva secretos)
  config/caja.env          BOB_ORG_ID, BOB_GOTRUE_URL, BOB_DB_HOST (configuración, no secretos)
  secrets/app.env          bob_app            600, del usuario 65534
  secrets/feeder.env       bob_feeder         600, del usuario 65534 (cuando haya feeder)
  secrets/vecinos.{crt,key} y vecinos-ca.crt  mTLS hacia bzzz-vecinos (cuando haya feeder)
  secrets/migrador.env     bob_migrador       600, de root: solo lo lee el paso de migración
  atestaciones/            las atestaciones de cada imagen desplegada, con su .sig
  deploy.sh  rollback.sh  lib.sh  comprobar-aislamiento.sh
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

**La salida a internet de `bob-web`.** `bzzz-edge` no es `internal`, así que `bob-web` puede salir (D77 §5: «le
toca a D59»). `comprobar-aislamiento.sh` acepta esa red para `bob-web` y para nadie más. Con
`BOB_SALIDA_ACEPTADA=` (vacía), la comprobación es estricta y falla mientras siga así.

## Antes de la primera instalación (lo hace la caja, no este paquete)

1. **El alta de la vecina en Bzzz:**
   - la red `bzzz-vecina-bob`;
   - su línea en `l6-supabase.yml`;
   - los roles `bob_app`, `bob_feeder`, `bob_ai_ro` y `bob_migrador`, con su `CONNECTION LIMIT`;
   - el `pg_hba`;
   - `generar-secretos-vecina.sh bob`, que deja `/opt/bob/secrets/*.env`.
2. **La cadena actual de migraciones de BOb**, aplicada una vez con `postgres` (D77 77.21). No va con `deploy.sh`.
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

Con migraciones nuevas de BOb, **solo si Henry lo decide**, en el orden en que se aplican:

```bash
./deploy.sh --imagen … --atestacion … --migrar 0034_x.sql --migrar 0035_y.sql
```

**Lo que hace `deploy.sh`:**
1. Carga la imagen.
2. Comprueba la atestación con `/opt/bzzz/scripts/comprobar-atestacion-bob.sh` y los firmantes de
   `/opt/bzzz/config/bob/firmantes_imagen`. Si no casa, no toca nada.
3. Aplica las migraciones pedidas como `bob_migrador`, cada una en su transacción, desde un contenedor de usar y
   tirar en `bzzz-vecina-bob`.
4. Guarda la imagen que corría como anterior, levanta la nueva y espera a que esté sana.
5. Corre `comprobar-aislamiento.sh`.
6. Si algo de los pasos 4 y 5 falla, vuelve sola a la imagen anterior.

**Para comprobar también la entrada por Traefik**, se define `BOB_URL_SALUD=https://<host de BOb>/api/health`.
Valen los códigos de `BOB_URL_SALUD_CODIGOS`: por omisión 200, 302, 303, 307 y 401. La puerta sin sesión redirige o
niega, y eso ya prueba que el router existe y que BOb está sano: Traefik no enruta a un contenedor que no lo está.

**La línea final:**

| Línea | rc | Qué quiere decir |
|---|---|---|
| `desplegada: …` | 0 | La nueva corre y está sana |
| `vuelta-atras: …` | 1 | La nueva no quedó sana y corre otra vez la anterior |
| `fallo: …` | 1 | Una migración falló, o ni la nueva ni la anterior quedaron sanas. La línea dice qué quedó |
| `no-empieza: …` | 2 | No se tocó nada que corra |

### El feeder

Cuando existan el adaptador (tarea 3.7 de BOb-engine) y las vistas de `bzzz-vecinos` (P-F1):

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
  salud y el aislamiento igual que el deploy. La que corría pasa a ser la anterior, así que correrlo dos veces deja
  todo como estaba.
- **Lo que sale:** `vuelta-atras: …` con rc 0, `fallo: …` con rc 1 o `no-empieza: …` con rc 2.
- **No deshace migraciones.** Si la imagen anterior no casa con el esquema que dejó una migración, la vuelta atrás es
  del esquema `bob` y se recupera por esquema (D77 77.14), aparte.

## Comprobar el aislamiento cuando se quiera

```bash
/opt/bob/comprobar-aislamiento.sh
```

**Qué mira.** Descubre todo contenedor del demonio que se llame `bob-*` o que lleve las etiquetas del proyecto `bob`,
también los parados. Para cada uno, falla si:
- no está declarado en `compose.yml`;
- está en una red que su servicio no declara, o en una red con salida que no sea la excepción;
- su entorno o un fichero montado trae la service role, `JWT_SECRET`, `POSTGRES_PASSWORD` o la credencial de migración;
- monta algo fuera de `/opt/bob/config` y `/opt/bob/secrets`;
- publica un puerto.

**Lo que sale:**

| Línea | rc | Qué quiere decir |
|---|---|---|
| `aislada: …` | 0 | Todo en orden |
| `no-aislada: …` | 1 | Algún contenedor falla; el detalle va por stderr |
| `no-medible: …` | 2 | No se pudo mirar, o no hay ningún `bob-*`: vacío no es aislado |

## El banco local

`deploy/caja/banco/banco.sh` prueba todo esto en un portátil, nunca en una caja. Imita la caja con:
- una red interna y otra con salida;
- `supabase/postgres:17.6.1.136`, la imagen de la caja, con `bob_app` y `bob_migrador`;
- el GoTrue de Supabase;
- un Traefik v3.7.18 con middlewares de mentira que llevan los nombres de la caja.

Recorre, en orden:
1. instalar A, actualizar a B, `rollback.sh` y otra vez `rollback.sh`;
2. una imagen que no queda sana, que vuelve sola;
3. una imagen sin atestación que case, que no empieza;
4. `--migrar` con una migración buena y una que bob_migrador no puede aplicar;
5. el chequeo de aislamiento visto fallar cuatro veces: un `bob-intruso` con la service role, una red de más, el modo
   estricto y la service role en el fichero montado.

```bash
docker build -t bob-web:banco-a .
deploy/caja/banco/banco.sh bob-web:banco-a <checkout de Bzzz>/scripts/comprobar-atestacion-bob.sh
```

En el CI, `lib/bob/caja-compose.test.ts` comprueba el compose resuelto:
- sin puertos;
- imagen por id obligatoria;
- sin root y de solo lectura;
- con techos;
- sin secretos en el entorno;
- con las redes declaradas;
- con la puerta primero en cada router.
