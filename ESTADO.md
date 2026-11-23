# ESTADO.md

> Actualizar al cerrar cada sesión. Es lo primero que lee la siguiente.

## Tarea actual
- Capa de datos de bob-web sobre el esquema `bob` de BOb-engine, como `bob_app`, con el `org_id` de la caja y sin la service role (requisito §4.2, puntos 1 a 5, de los insumos de Bzzz «lo mínimo de la etapa 4»). Todo fusionado en `main`: PR #30, #32, #34 (P-1), #35 (P-4), #36 (umbrales) y #31 (imagen). Lo que queda es probarlo en una caja real.

## Hecho
- Inventario de todo lo que tocaba la service role, PostgREST o las tablas de la demo, en tres categorías y con dueño: `docs/bob-schema-data-layer/inventario.md`.
- Modo caja (`BOB_CAJA=1`): configuración en tiempo de ejecución, login de `bob_app` desde `/run/secrets/bob/app.env`, arranque rechazado con service role, `JWT_SECRET`, credenciales en el entorno o configuración incompleta (visto fallar con `next dev`).
- Sesión contra el GoTrue de la caja en su raíz, en cada petición: GoTrue caído = 503 (visto con un GoTrue falso parado), token rechazado = `/login`. Lista de rutas servidas (`lib/bob/surface.ts`); lo demás, 404.
- Pantallas `/bob/interactions` y `/bob/quality` (más `/api/bob/*`) sobre `proj_durations`, `proj_sentiment` y `proj_metric_counts`; «sin fila» nunca es 0; Sesiones y NPS «sin proyección» (P-2 cerrado por Henry el 2026-11-21: Sesiones sigue así hasta que el contrato la nombre).
- `/api/config/*` (umbrales, anomalías, reglas de texto, canales de notificación, respuestas) contra `bob` como `bob_app` en la caja, con el mismo código de ruta. Fuera de la caja, PostgREST como antes.
- P-1 cerrado por BOb-engine #34 (rama `bob-roles-after-engine-34`, con el CI fijado a BOb-engine `6be2909`, que incluye #33, #34 y #35): `bob_app` lee los usuarios de su organización. Henry decidió «sin fila, 403»: sin fila, inactiva, de otra organización o con papel `service`/`demo`, 403; un admin activo entra con su papel (5 tests en vivo en `lib/bob/roles.test.ts`).
- Prueba de punta a punta del modo caja tras BOb-engine #34 (local, `next dev`, GoTrue falso, stack `bob-v1`, con un login temporal sin privilegios miembro de `bob_app`, borrado al terminar): el admin del fixture entra; las tres pantallas, `/api/bob/quality` y `/auth/me` responden 200; un umbral se guarda, se relee y queda en `bob` bajo el tenant A; un `peak_mode` inválido da 400. Salieron dos arreglos: los `numeric` (`upper_bound`, `lower_bound`) vuelven como número, igual que con PostgREST, y `process.exit` pasa a `instrumentation-node.ts` para que no entre en el build de Edge.
- 80 tests (los en vivo sobre el fixture de BOb-engine recargado en `bob-v1`), lint y typecheck en verde. `npm run build` pasa al reintentar (el aviso de seguridad de Next 16.4.2 ya estaba).
- Hallazgos de la imagen local (sesión de insumos, PR #31), en la rama `bob-box-startup-health`: el arranque rechazado ahora sale del proceso con código 1 (visto con `next dev`: sale con los motivos), y `/api/health` responde 503 en ~2,1 s contra una base y un GoTrue que no contestan (antes ~6 s; 11 s en su imagen).
- Revisión del PR #30 atendida: 403 sin fila en `bob.users`, errores genéricos en la caja, pool con topes, ventana de 31 días, proxy sobre todas las rutas, errores de tabla como `Error` con código, login privilegiado rechazado, CI con job en vivo (`.github/workflows/ci.yml`). 80 tests en verde en vivo con `BOB_REQUIRE_LIVE=1`.
- P-4 (PR #35): en la caja el simulador pinta `/api/bob/*` y no inventa nada; «sin fila» y «sin proyección» a la vista; Ánimo como barras por estado; los botones de ventana mandan `range` y el desfase del navegador. Paneles sin equivalente en `bob`, ocultos. El arreglo de las listas que se rellenaban con datos simulados (`4bd24a4`) entró con #36.
- Umbrales en la caja (PR #36): editor de límites para Tiempo Prom. y las cinco filas de conteo, bajo las claves del simulador. Viewer: lee y recibe 403 al guardar (visto en caja local). Nada evalúa los umbrales todavía (Slice 5).
- CI en GitHub (`5625cfe`): los dos jobs nuevos («Lint, typecheck and unit tests» y «Schema bob as bob_app (live tests)») y los dos de Vercel en verde. El PR #30 se fusionó a `main` (`b4a7c72`).

## Pendiente
- **P-3 · Slice 3.** La spec ya está fusionada en BOb-engine (PRs #27, #28, #30 y #32), pero no es `bob.v_cell_state`:
  - es la función `bob_cell_state(org, channels[], from, to)`, invoker, bajo RLS (R4);
  - al lado van `bob_cell_rollup`, con cobertura, y `v_ai_cell_state`, una vista definer para BObee (R6).

  La construcción es el PR #40 de BOb-engine (rama `slice-3-absent-not-zero`). Está abierto y no se fusiona hasta que Federico acepte la 0.6; los ceros que el alimentador escribía para métricas que no cuenta ya se corrigieron (`74823ee`).

  Lado bob-web: PR #37 (borrador, rama `slice-3-cell-states`). Rendimiento, Interacciones, Calidad y `/api/bob/*` leen los estados de `bob.bob_cell_rollup`; en una base sin Slice 3 todo se pinta como antes. Se fusiona después del PR #40. Probado en local el 22 nov contra `2647fce` del #40 (hasta su head actual, `7542401`, solo cambiaron docs): 115/115 en vivo, ninguno omitido. Corregido en `1265420`: una celda observada sin fila se pinta «0», no una duración de cero (en las duraciones el `value` del rollup es el número de muestras).
  - El CI de bob-web fija `BOB_ENGINE_REF` en el head del #40 (`7542401`, commit `7e9f836`), así que el job en vivo corre contra el Slice 3. Cuando el #40 se fusione, hay que cambiarlo al commit de la fusión en `main`.
  - BOb-engine#43 (guard de tenancy para tablas con clave `id`) va después del #40. Al 23 nov tiene conflicto y no tiene checks.
  - El total de cada fila de la matriz no tiene rollup propio (`bob_cell_rollup` es por actor): hoy se pinta observado si algún actor lo está y, si no, el primer estado en el orden del §2. Pedir a BOb-engine un rollup sobre actores para que esa regla tampoco viva en TypeScript.
- Las acciones de respuesta necesitan el binding de AutoBotz (Slice 6, PR #26 de BOb-engine); en la caja responden 409.
- `npm run build` se corta una vez con `SecurityFatalError` (Next 16.4.2). Ya estaba en `main`.

## Bloqueado
- BOB-7 (Relevo), turno de Federico: ¿son cuatro o siete los consumidores del Slice 3? El Word dice cuatro en el §2 y siete en el §3. El 21-11 se le dejó la lista para que la confirme:
  - los cuatro del §2;
  - tres inferidos: los drill-downs del Slice 7, el conteo de fallas del clasificador del Slice 4 y la fila de afirmaciones sin fundamento del Slice 5.
  
  No bloquea la construcción; solo cambia qué consumidores prueba el DONE.

## Siguiente paso
- Probar en una caja real con la imagen de `main`. La lista de verificación está en las notas compartidas de la sesión (`bob-web-real-box-checklist.md`). Lo primero que vigilar: la primera conexión a la base, que en local tardó ~15 s y dio un 503 hasta reintentar.

## Notas de sesión
<!-- AAAA-MM-DD: una o dos líneas -->
- 2026-11-21 (cierre): #34, #35, #36 y #31 fusionados. #35 entró sin `4bd24a4`; viajó en #36, retargeteado a `main`. Caso viewer de los umbrales probado en caja local (papel cambiado a viewer y devuelto a admin; login temporal borrado).
- 2026-11-21 (P-4): simulador probado en modo caja local (GoTrue falso, login temporal `bob_web_e2e` ya borrado): las tres pantallas leen `bob`, Este Mes pide `range=month&tz=300`, y una lectura fallida deja «—» con aviso en rojo. Fuera de la caja la API da 404 y la simulación sigue.
- 2026-11-21: revisión del PR #27 de BOb-engine (spec del Slice 3) publicada como comentario; sus siete puntos quedaron resueltos en main con los PRs #28 y #30. Arrancó la construcción del Slice 3 en su propia sesión. Las tres notas de estado de la rama del PR #29 (`ab04e33`, `079e6f5`, `081641b`) no entraron en el merge; su contenido vigente está aquí.
- 2026-11-21 (noche): revisión del PR #30 atendida y CI añadido. El commit del workflow lo hizo Henry a mano (los permisos de la sesión no dejan commitear `.github/workflows`). Las fallas en vivo vistas a medio camino eran del stack compartido (reinicios, `GRANT bob_app` perdido, contenedor «unhealthy» con `select 1` de 5 s), no del código.
- 2026-11-21 (tarde): el stack compartido `bob-v1` se movió al puerto 54322 y otra sesión lo reinicia a menudo; tras cada reinicio se pierde `GRANT bob_app`. Recargar con `scripts/ci/load-bob-world.mjs` antes de correr los tests.
- 2026-11-21: modo caja probado con un GoTrue falso local y el stack `bob-v1` (login, lectura de las tres pantallas, 503 con GoTrue parado, arranque rechazado). El stack compartido lo reinició otra sesión a mitad de trabajo: recargar el fixture antes de los tests.
- 2026-11-20: matriz de Performance sobre proyecciones reales (local, stack bob-v1 en 58322 con `GRANT bob_app TO postgres`). 11 tests; los 4 de lectura necesitan `BOB_TEST_DATABASE_URL`. El sabotaje «sin fila = 0» los tumba.
- 2026-10-28: puente AutoBotz desactivado sin borrar nada (ruling 1 de Federico, 23 oct). Slice 6 lo reemplaza con el registro real.
