# ESTADO.md

> Actualizar al cerrar cada sesión. Es lo primero que lee la siguiente.

## Tarea actual
- BOB-7, «thin rendering of the Performance matrix» (rama `slice-2-performance-matrix-thin`): la vista local `/bob/performance` pinta el bloque RENDIMIENTO de la demo con las ocho `bob.proj_*` de BOb-engine, leídas como `bob_app` bajo el claim de `BOB_ORG_ID`. PR #29 abierto, sin fusionar, con los seis arreglos de la revisión independiente (`53e6829`). La ruta solo existe con `BOB_PERF_MATRIX=1` y la auth de Supabase configurada, pide sesión, responde 404 a un `?channel=` desconocido y no muestra errores de pg en la página.

## Hecho
- PR #24: el puente AutoBotz del simulador deja de escribir en la base. `persistAB` y `loadAutoBotz` salen al inicio mientras `Bridge._abPersist` sea `false`; `_abBody` queda inerte y las tres siguen en `public/dashboard.html`, con un comentario que explica por qué y cómo reactivarlas. El panel sigue con su seed en memoria (ab1 a ab5). Desplegado en producción por Vercel con el merge (`6c4adde`).

## Pendiente
- Spec del Slice 3 cerrada y fusionada en BOb-engine (PRs #27, #28, #30 y #32). Los siete puntos de la revisión de Henry al PR #27 quedaron resueltos en main:
  - F-28 corregido: no hay cero para métricas con precondición.
  - F-38: `actor_types` en `v_feeder_channel_map`.
  - `pending` sigue al lag actual (R3, aceptado).
  - `bob_cell_state(org, channels[], from, to)` es función, no vista (R4).
  - F-39: la duración de interacción requiere `resolution`.
  - `v_ai_cell_state` es vista definer filtrada por el claim (R6).
  - F-31 dice que D-14 se extiende.
- Construcción del Slice 3: corre en su propia sesión (slice-3-build, worktree de BOb-engine, rama `slice-3-absent-not-zero-build`). Termina en un PR abierto, sin fusionar. Revisarlo contra el spec cuando reporte.
- Cuando el Slice 3 esté fusionado, la matriz pasa a leer `bob_cell_state` en un PR nuevo de bob-web, en lugar de calcular el estado desde `proj_*`. Ahí entran los seis estados, los motivos y los marcadores D-18/D-19, que hoy la matriz no lee.
- Word de BOB-7 (`BOb_v1_Remaining_Work_2026-11-10.docx`, md5 `8365ae54…`) descargado con OK de Henry. No está en el repo.
- La vista toma el `org_id` de `BOB_ORG_ID` (una organización por caja), no del JWT del usuario: el login de la demo es otro proyecto de Supabase. Cuando la app corra en la caja, decidir si además se exige que coincidan (P5 §3.3).
- `npm run build` compila, pero termina con `SecurityFatalError`: Next 16.4.2 tiene un aviso de seguridad. Ya estaba en `main` y no lo toca este PR.
- Comprobar en la demo desplegada que el panel AutoBotz carga y que guardar un binding no envía nada a `/api/config/autobotz`. En local ya se vio; en producción no, porque pide sesión.

## Bloqueado
- BOB-7 (Relevo), turno de Federico: ¿son cuatro o siete los consumidores del Slice 3? El 21-11 se le dejó la lista para que solo la confirme o la corrija:
  - los cuatro del §2;
  - tres inferidos: los drill-downs del Slice 7, el conteo de fallas del clasificador del Slice 4 y la fila de afirmaciones sin fundamento del Slice 5.
  
  No bloquea la construcción; solo cambia qué consumidores prueba el DONE.

## Siguiente paso
- Henry revisa el PR #29.
- Revisar el PR de slice-3-build cuando reporte.
- Cuando Federico conteste en BOB-7, pasar la respuesta a slice-3-build si sigue abierto, o al PR del Slice 3.
- Antes de que la cadena de migraciones de BOb-engine llegue al proyecto de Supabase compartido, revisar qué más de la demo depende del esquema anterior al renombre (F-11). Con el puente apagado, AutoBotz ya no es uno de esos puntos.

## Notas de sesión
<!-- AAAA-MM-DD: una o dos líneas -->
- 2026-11-21: revisión del PR #27 (spec del Slice 3) publicada como comentario; los siete puntos quedaron resueltos en main con los PRs #28 y #30. Arrancó la construcción del Slice 3 en su propia sesión, y en BOB-7 se le dejó a Federico la lista de los siete consumidores.
- 2026-11-20: matriz de Performance sobre proyecciones reales (PR #29). Después vinieron los arreglos de la revisión: la puerta con `BOB_PERF_MATRIX`, el test de ceros escritos y el canal desconocido. 13 tests; los 6 de lectura necesitan `BOB_TEST_DATABASE_URL`. Cada sabotaje («sin fila = 0» y «0 = sin fila») hace fallar algún test.
- 2026-11-20: el stack local bob-v1 (58322) es compartido. Otra sesión lo reseteó y ya va por las migraciones del Slice 6. Algo, probablemente la suite de BOb-engine, borra las proyecciones y revoca `GRANT bob_app TO postgres`. Antes de los tests en vivo hay que recargar el fixture con el alimentador de referencia y volver a dar el grant.
- 2026-10-28: puente AutoBotz desactivado sin borrar nada (ruling 1 de Federico, 23 oct). Slice 6 lo reemplaza con el registro real.
