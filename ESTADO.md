# ESTADO.md

> Actualizar al cerrar cada sesión. Es lo primero que lee la siguiente.

## Tarea actual
- BOB-7, «thin rendering of the Performance matrix» (rama `slice-2-performance-matrix-thin`): la vista local `/bob/performance` pinta el bloque RENDIMIENTO de la demo con las ocho `bob.proj_*` de BOb-engine, leídas como `bob_app` bajo el claim de `BOB_ORG_ID`. PR #29 abierto, sin fusionar, con los seis arreglos de la revisión independiente (`53e6829`). La ruta solo existe con `BOB_PERF_MATRIX=1` y la auth de Supabase configurada, pide sesión, responde 404 a un `?channel=` desconocido y no muestra errores de pg en la página.

## Hecho
- PR #24: el puente AutoBotz del simulador deja de escribir en la base. `persistAB` y `loadAutoBotz` salen al inicio mientras `Bridge._abPersist` sea `false`; `_abBody` queda inerte y las tres siguen en `public/dashboard.html`, con un comentario que explica por qué y cómo reactivarlas. El panel sigue con su seed en memoria (ab1 a ab5). Desplegado en producción por Vercel con el merge (`6c4adde`).

## Pendiente
- Grill del Slice 3: corre en su propia sesión («Grill del Slice 3: ausente no es cero», worktree de BOb-engine), con `docs/slice-2-matrix/nota-slice-3.md` como entrada. Ya va por la Q14. D-14 sigue con tres estados, y el guion sirve para `not_observed` y `off_shift`, distinguidos por estado y motivo (opción A). La spec incluye los marcadores de D-14.
- Cuando esa spec cierre, la matriz tiene que leer `bob_source_key_unset()` (D-19) y `telemetry_started_at` (D-18). Hoy calcula «no configurado» solo con `channel_capabilities` e `idle_bound_seconds`.
- El texto exacto del Slice 3 y sus cuatro consumidores solo están en el Word adjunto a BOB-7 (`BOb_v1_Remaining_Work_2026-11-10.docx`). No se ha descargado.
- La vista toma el `org_id` de `BOB_ORG_ID` (una organización por caja), no del JWT del usuario: el login de la demo es otro proyecto de Supabase. Cuando la app corra en la caja, decidir si además se exige que coincidan (P5 §3.3).
- `npm run build` compila, pero termina con `SecurityFatalError`: Next 16.4.2 tiene un aviso de seguridad. Ya estaba en `main` y no lo toca este PR.
- Comprobar en la demo desplegada que el panel AutoBotz carga y que guardar un binding no envía nada a `/api/config/autobotz`. En local ya se vio; en producción no, porque pide sesión.

## Bloqueado
- Nada.

## Siguiente paso
- Henry revisa el PR #29.
- Antes de que la cadena de migraciones de BOb-engine llegue al proyecto de Supabase compartido, revisar qué más de la demo depende del esquema anterior al renombre (F-11). Con el puente apagado, AutoBotz ya no es uno de esos puntos.

## Notas de sesión
<!-- AAAA-MM-DD: una o dos líneas -->
- 2026-11-20: matriz de Performance sobre proyecciones reales (PR #29). Después vinieron los arreglos de la revisión: la puerta con `BOB_PERF_MATRIX`, el test de ceros escritos y el canal desconocido. 13 tests; los 6 de lectura necesitan `BOB_TEST_DATABASE_URL`. Cada sabotaje («sin fila = 0» y «0 = sin fila») hace fallar algún test.
- 2026-11-20: el stack local bob-v1 (58322) es compartido. Otra sesión lo reseteó y ya va por las migraciones del Slice 6. Algo, probablemente la suite de BOb-engine, borra las proyecciones y revoca `GRANT bob_app TO postgres`. Antes de los tests en vivo hay que recargar el fixture con el alimentador de referencia y volver a dar el grant.
- 2026-10-28: puente AutoBotz desactivado sin borrar nada (ruling 1 de Federico, 23 oct). Slice 6 lo reemplaza con el registro real.
