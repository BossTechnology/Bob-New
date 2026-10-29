# ESTADO.md

> Actualizar al cerrar cada sesión. Es lo primero que lee la siguiente.

## Tarea actual
- Ninguna abierta en este repositorio.

## Hecho
- PR #24: el puente AutoBotz del simulador deja de escribir en la base. `persistAB` y `loadAutoBotz` salen al inicio mientras `Bridge._abPersist` sea `false`; `_abBody` queda inerte y las tres siguen en `public/dashboard.html`, con un comentario que explica por qué y cómo reactivarlas. El panel sigue con su seed en memoria (ab1 a ab5). Desplegado en producción por Vercel con el merge (`6c4adde`).

## Pendiente
- Comprobar en la demo desplegada que el panel AutoBotz carga y que guardar un binding no envía nada a `/api/config/autobotz`. En local ya se vio; en producción no, porque pide sesión.

## Bloqueado
- Nada.

## Siguiente paso
- Antes de que la cadena de migraciones de BOb-engine llegue al proyecto de Supabase compartido, revisar qué más de la demo depende del esquema anterior al renombre (F-11). Con el puente apagado, AutoBotz ya no es uno de esos puntos.

## Notas de sesión
<!-- AAAA-MM-DD: una o dos líneas -->
- 2026-10-28: puente AutoBotz desactivado sin borrar nada (ruling 1 de Federico, 23 oct). Slice 6 lo reemplaza con el registro real.
