# ESTADO.md

> Actualizar al cerrar cada sesión. Es lo primero que lee la siguiente.

## Tarea actual
- Capa de datos de bob-web sobre el esquema `bob` de BOb-engine, como `bob_app`, con el `org_id` de la caja y sin la service role (requisito §4.2, puntos 1 a 5, de los insumos de Bzzz «lo mínimo de la etapa 4»). Rama `bob-schema-data-layer`, PR abierto, sin fusionar.

## Hecho
- Inventario de todo lo que tocaba la service role, PostgREST o las tablas de la demo, en tres categorías y con dueño: `docs/bob-schema-data-layer/inventario.md`.
- Modo caja (`BOB_CAJA=1`): configuración en tiempo de ejecución, login de `bob_app` desde `/run/secrets/bob/app.env`, arranque rechazado con service role, `JWT_SECRET`, credenciales en el entorno o configuración incompleta (visto fallar con `next dev`).
- Sesión contra el GoTrue de la caja en su raíz, en cada petición: GoTrue caído = 503 (visto con un GoTrue falso parado), token rechazado = `/login`. Lista de rutas servidas (`lib/bob/surface.ts`); lo demás, 404.
- Pantallas `/bob/interactions` y `/bob/quality` (más `/api/bob/*`) sobre `proj_durations`, `proj_sentiment` y `proj_metric_counts`; «sin fila» nunca es 0; Sesiones y NPS «sin proyección».
- `/api/config/*` (umbrales, anomalías, reglas de texto, canales de notificación, respuestas) contra `bob` como `bob_app` en la caja, con el mismo código de ruta. Fuera de la caja, PostgREST como antes.
- 61 tests (los en vivo sobre el fixture de BOb-engine recargado en `bob-v1`), lint y typecheck en verde. `npm run build` pasa al reintentar (el aviso de seguridad de Next 16.4.2 ya estaba).

## Pendiente
- **P-1 · Papel del usuario en la caja.** `bob.users` no tiene política para `bob_app`: toda cuenta entra como `viewer` y las escrituras de `/api/config/*` dan 403. Dueño: BOb-engine (política) o Henry (P-5 de los insumos).
- **P-2 · «Sesiones».** El contrato 0.5.3 no la nombra. Pregunta abierta a Henry: `n` de `interaction_duration`, `handled` de `proj_actor_metrics`, o «sin proyección» hasta que el contrato la nombre.
- **P-3 · Slice 3.** `bob.v_cell_state` no existe; enganche en `lib/bob/cell-state.ts`.
- **P-4 · El simulador.** `dashboard.html` sigue pintando cifras inventadas y está apagado en la caja. Conectarlo a `/api/bob/*`.
- Las acciones de respuesta necesitan el binding de AutoBotz (Slice 6, PR #26 de BOb-engine); en la caja responden 409.
- `npm run build` se corta una vez con `SecurityFatalError` (Next 16.4.2). Ya estaba en `main`.

## Bloqueado
- Nada en este repo. P-1 y P-2 esperan respuesta.

## Siguiente paso
- Con P-1 cerrado, probar la escritura de reglas en la caja de punta a punta. Luego P-4 (simulador sobre `/api/bob/*`) y la imagen (`output: 'standalone'`, Dockerfile), que no entran en este PR.

## Notas de sesión
<!-- AAAA-MM-DD: una o dos líneas -->
- 2026-11-21: modo caja probado con un GoTrue falso local y el stack `bob-v1` (login, lectura de las tres pantallas, 503 con GoTrue parado, arranque rechazado). El stack compartido lo reinició otra sesión a mitad de trabajo: recargar el fixture antes de los tests.
- 2026-11-20: matriz de Performance sobre proyecciones reales (local, stack bob-v1 en 58322 con `GRANT bob_app TO postgres`). 11 tests; los 4 de lectura necesitan `BOB_TEST_DATABASE_URL`. El sabotaje «sin fila = 0» los tumba.
- 2026-10-28: puente AutoBotz desactivado sin borrar nada (ruling 1 de Federico, 23 oct). Slice 6 lo reemplaza con el registro real.
