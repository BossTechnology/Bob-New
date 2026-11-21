# CONTEXT.md — Glosario del dominio

Términos del proyecto y su significado exacto. Úsalos en código, commits, docs y conversación. Si un término no está aquí, no lo inventes: pregunta y agrégalo.

## Términos

| Término | Significado | Dónde aparece |
|---|---|---|
| Matriz de Performance | El bloque RENDIMIENTO de la demo: métricas por fila, actores (Cliente, Agente IA, Agente humano) por columna | `public/dashboard.html`, `app/bob/performance` |
| Sin fila | No hay fila de proyección para esa celda en la ventana. No es cero | `lib/bob/matrix.ts` |
| Cero observado | Hay filas y suman cero | `lib/bob/matrix.ts` |
| No configurado | Ningún canal de la selección declara la capacidad o la declaración que la fila necesita (contrato §5, §9.1, §9.2) | `lib/bob/matrix.ts` |
| Organización de la caja | El único `org_id` de una caja (P5); bajo su claim lee `bob_app` | `BOB_ORG_ID` |
| Modo caja | La app corriendo como BOb v1 dentro de una caja: lee `bob` como `bob_app`, sesión contra el GoTrue de la caja, sin service role ni PostgREST | `BOB_CAJA=1`, `lib/bob/runtime.ts` |
| Superficie de la caja | La lista de rutas que el modo caja sirve; lo que no está en ella responde 404 | `lib/bob/surface.ts` |
| Sin proyección | Cifra de la demo que ninguna de las ocho proyecciones lleva (Disponibles, Calidad de respuesta, Sesiones, NPS). No es «sin fila» | `lib/bob/screens.ts`, `lib/bob/matrix.ts` |

## Fuera de alcance
Lo que este proyecto explícitamente NO hace.

## Decisiones clave
Enlaces a ADRs en `docs/adr/`.
