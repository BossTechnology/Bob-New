# ESTADO.md

> Actualizar al cerrar cada sesión. Es lo primero que lee la siguiente.

## Tarea actual
- BOB-7, «thin rendering of the Performance matrix» (rama `slice-2-performance-matrix-thin`): la vista local `/bob/performance` pinta el bloque RENDIMIENTO de la demo con las ocho `bob.proj_*` de BOb-engine, leídas como `bob_app` bajo el claim de `BOB_ORG_ID`. PR abierto, sin fusionar.

## Hecho
- PR #24: el puente AutoBotz del simulador deja de escribir en la base. `persistAB` y `loadAutoBotz` salen al inicio mientras `Bridge._abPersist` sea `false`; `_abBody` queda inerte y las tres siguen en `public/dashboard.html`, con un comentario que explica por qué y cómo reactivarlas. El panel sigue con su seed en memoria (ab1 a ab5). Desplegado en producción por Vercel con el merge (`6c4adde`).

## Pendiente
- Grill del Slice 3 con `docs/slice-2-matrix/nota-slice-3.md` como entrada: qué celdas quedan sin fila, en cero o sin configurar sobre el fixture de BOb-engine.
- La vista toma el `org_id` de `BOB_ORG_ID` (una organización por caja), no del JWT del usuario: el login de la demo es otro proyecto de Supabase. Cuando la app corra en la caja, decidir si además se exige que coincidan (P5 §3.3).
- `npm run build` compila, pero termina con `SecurityFatalError`: Next 16.4.2 tiene un aviso de seguridad. Ya estaba en `main` y no lo toca este PR.
- Comprobar en la demo desplegada que el panel AutoBotz carga y que guardar un binding no envía nada a `/api/config/autobotz`. En local ya se vio; en producción no, porque pide sesión.

## Bloqueado
- Nada.

## Siguiente paso
- Antes de que la cadena de migraciones de BOb-engine llegue al proyecto de Supabase compartido, revisar qué más de la demo depende del esquema anterior al renombre (F-11). Con el puente apagado, AutoBotz ya no es uno de esos puntos.

## Notas de sesión
<!-- AAAA-MM-DD: una o dos líneas -->
- 2026-11-20: matriz de Performance sobre proyecciones reales (local, stack bob-v1 en 58322 con `GRANT bob_app TO postgres`). 11 tests; los 4 de lectura necesitan `BOB_TEST_DATABASE_URL`. El sabotaje «sin fila = 0» los tumba.
- 2026-10-28: puente AutoBotz desactivado sin borrar nada (ruling 1 de Federico, 23 oct). Slice 6 lo reemplaza con el registro real.
