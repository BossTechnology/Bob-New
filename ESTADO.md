# ESTADO.md

> Actualizar al cerrar cada sesión. Es lo primero que lee la siguiente.

## Tarea actual
- Capa de datos de bob-web sobre el esquema `bob` de BOb-engine, como `bob_app`, con el `org_id` de la caja y sin la service role (requisito §4.2, puntos 1 a 5, de los insumos de Bzzz «lo mínimo de la etapa 4»). Rama `bob-schema-data-layer`, PR abierto, sin fusionar.

## Hecho
- Inventario de todo lo que tocaba la service role, PostgREST o las tablas de la demo, en tres categorías y con dueño: `docs/bob-schema-data-layer/inventario.md`.
- Modo caja (`BOB_CAJA=1`): configuración en tiempo de ejecución, login de `bob_app` desde `/run/secrets/bob/app.env`, arranque rechazado con service role, `JWT_SECRET`, credenciales en el entorno o configuración incompleta (visto fallar con `next dev`).
- Sesión contra el GoTrue de la caja en su raíz, en cada petición: GoTrue caído = 503 (visto con un GoTrue falso parado), token rechazado = `/login`. Lista de rutas servidas (`lib/bob/surface.ts`); lo demás, 404.
- Pantallas `/bob/interactions` y `/bob/quality` (más `/api/bob/*`) sobre `proj_durations`, `proj_sentiment` y `proj_metric_counts`; «sin fila» nunca es 0; Sesiones y NPS «sin proyección» (P-2 cerrado por Henry el 2026-11-21: Sesiones sigue así hasta que el contrato la nombre).
- `/api/config/*` (umbrales, anomalías, reglas de texto, canales de notificación, respuestas) contra `bob` como `bob_app` en la caja, con el mismo código de ruta. Fuera de la caja, PostgREST como antes.
- 80 tests (los en vivo sobre el fixture de BOb-engine recargado en `bob-v1`), lint y typecheck en verde. `npm run build` pasa al reintentar (el aviso de seguridad de Next 16.4.2 ya estaba).
- Hallazgos de la imagen local (sesión de insumos, PR #31), en la rama `bob-box-startup-health`: el arranque rechazado ahora sale del proceso con código 1 (visto con `next dev`: sale con los motivos), y `/api/health` responde 503 en ~2,1 s contra una base y un GoTrue que no contestan (antes ~6 s; 11 s en su imagen).
- Revisión del PR #30 atendida: 403 sin fila en `bob.users`, errores genéricos en la caja, pool con topes, ventana de 31 días, proxy sobre todas las rutas, errores de tabla como `Error` con código, login privilegiado rechazado, CI con job en vivo (`.github/workflows/ci.yml`). 80 tests en verde en vivo con `BOB_REQUIRE_LIVE=1`.
- CI en GitHub (`5625cfe`): los dos jobs nuevos («Lint, typecheck and unit tests» y «Schema bob as bob_app (live tests)») y los dos de Vercel en verde. El PR #30 se fusionó a `main` (`b4a7c72`).

## Pendiente
- **P-1 · Papel del usuario en la caja.** Henry (2026-11-21): sin fila o `active` no verdadero = 403 en `/bob/*`, `/api/bob/*` y `/api/config/*`. Como `bob.users` no tiene política para `bob_app`, **hoy en la caja todo sale 403**. BOb-engine lo cerró en su #34 (`bob_app` lee los usuarios de su organización). En bob-web falta el ajuste: los tests de papeles para el nuevo comportamiento (`8b1add5`) y fijar el CI a un BOb-engine con #34 (`BOB_ENGINE_REF`), en un PR aparte.
- **P-3 · Slice 3.** `bob.v_cell_state` no existe; enganche en `lib/bob/cell-state.ts`.
- **P-4 · El simulador.** `dashboard.html` sigue pintando cifras inventadas y está apagado en la caja. Conectarlo a `/api/bob/*`.
- Las acciones de respuesta necesitan el binding de AutoBotz (Slice 6, PR #26 de BOb-engine); en la caja responden 409.
- `npm run build` se corta una vez con `SecurityFatalError` (Next 16.4.2). Ya estaba en `main`.

## Bloqueado
- Nada en este repo. P-1 espera la política de BOb-engine: hasta entonces la caja no es usable (todo 403).

## Siguiente paso
- Que Henry revise y fusione el PR #30. Con P-1 cerrado, probar lectura y escritura de reglas en la caja de punta a punta. Luego P-4 (simulador sobre `/api/bob/*`) y la imagen (`output: 'standalone'`, Dockerfile), que no entran en este PR.

## Notas de sesión
<!-- AAAA-MM-DD: una o dos líneas -->
- 2026-11-21 (noche): revisión del PR #30 atendida y CI añadido. El commit del workflow lo hizo Henry a mano (los permisos de la sesión no dejan commitear `.github/workflows`). Las fallas en vivo vistas a medio camino eran del stack compartido (reinicios, `GRANT bob_app` perdido, contenedor «unhealthy» con `select 1` de 5 s), no del código.
- 2026-11-21 (tarde): el stack compartido `bob-v1` se movió al puerto 54322 y otra sesión lo reinicia a menudo; tras cada reinicio se pierde `GRANT bob_app`. Recargar con `scripts/ci/load-bob-world.mjs` antes de correr los tests.
- 2026-11-21: modo caja probado con un GoTrue falso local y el stack `bob-v1` (login, lectura de las tres pantallas, 503 con GoTrue parado, arranque rechazado). El stack compartido lo reinició otra sesión a mitad de trabajo: recargar el fixture antes de los tests.
- 2026-11-20: matriz de Performance sobre proyecciones reales (local, stack bob-v1 en 58322 con `GRANT bob_app TO postgres`). 11 tests; los 4 de lectura necesitan `BOB_TEST_DATABASE_URL`. El sabotaje «sin fila = 0» los tumba.
- 2026-10-28: puente AutoBotz desactivado sin borrar nada (ruling 1 de Federico, 23 oct). Slice 6 lo reemplaza con el registro real.
