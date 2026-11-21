# Changelog

Una línea por cambio entregado, en lenguaje de usuario.

## Sin publicar
- Modo caja (`BOB_CAJA=1`): la app lee el esquema `bob` como `bob_app` con el `org_id` de la caja, valida la sesión contra el GoTrue de la caja y falla cerrada; apaga la IA, las notificaciones, los crons y lo que aún no tiene equivalente en `bob`. La demo de Vercel no cambia.
- Nuevas vistas `/bob/interactions` y `/bob/quality` sobre las proyecciones reales, y `/api/bob/*` con las tres pantallas en JSON.
- Nueva vista local `/bob/performance`: la matriz de Performance de la demo sobre las proyecciones reales de BOb, leídas como `bob_app`, con «sin fila», cero y «no configurado» a la vista (BOB-7, Slice 2).
- El panel AutoBotz del simulador deja de guardar en la base: sigue funcionando con su seed en memoria (BOB-4, ruling 1).
