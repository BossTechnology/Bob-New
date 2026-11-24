# Changelog

Una línea por cambio entregado, en lenguaje de usuario.

## Sin publicar
- Modo caja: el simulador queda cerrado si no puede confirmar que habla con `bob` (no se carga la configuración guardada ni se muestran cifras), y ninguno de sus pintores de HTML corre en la caja.
- Modo caja: el inicio de sesión tiene límite por dirección y por cuenta; quien solo conoce el email no bloquea a su dueño desde una dirección que ya usó. Cada decisión queda en el log como una línea JSON, sin email ni contraseña. El formulario dice cuándo hay demasiados intentos.
- Modo caja: las cookies de sesión llevan el prefijo `__Host-` (`__Host-bob-at`, `__Host-bob-rt`).
- Modo caja: cada escritura en `/api/config` se valida por tipo y por rango antes de llegar a la base.
- Modo caja: se rechazan las escrituras desde otro origen y los cuerpos que no son JSON.
- Modo caja: cada respuesta lleva cabeceras de seguridad (CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy`) y ya no anuncia `X-Powered-By`.
- El simulador codifica los valores guardados (nombres de canal, reglas y respuestas, asuntos, mensajes, ventanas pico, alertas) antes de pintarlos en los paneles de configuración: se ven como texto literal, también en la demo de Vercel.
- En la caja, el simulador deja editar el umbral (superior e inferior) de Tiempo Prom., Resueltos, Abandonados, Desambiguación, Derivaciones y Alucinaciones; se guarda en `bob` con un papel admin o analyst. Nada lo evalúa todavía.
- El simulador (`dashboard.html`) pinta los datos de `bob` cuando `/api/bob/*` responde (en la caja): deja de inventar cifras, muestra «sin fila» y «sin proyección», oculta BObee, alertas, alarmas, acciones y los paneles de detalle, y los botones Ahora, Hoy, Esta semana y Este mes leen esa ventana. En la caja, `/` abre el simulador. Fuera de la caja sigue siendo el simulador de siempre.
- Modo caja: si no puede arrancar, el proceso sale (el contenedor ya no queda `running`); `/api/health` responde 503 en unos 2 s cuando la base o GoTrue no contestan.
- Modo caja: una cuenta sin fila activa en `bob.users` recibe 403; los errores de la base no llegan al cliente; la conexión tiene tope de tiempo y la ventana de lectura, de 31 días; el proxy cierra también las rutas apagadas que acaban en `.json`, `.js` o `.css`; no arranca con un login de base privilegiado.
- CI en GitHub: lint, typecheck y tests, y un job que corre los tests en vivo sobre el esquema `bob` de BOb-engine.
- Modo caja (`BOB_CAJA=1`): la app lee el esquema `bob` como `bob_app` con el `org_id` de la caja, valida la sesión contra el GoTrue de la caja y falla cerrada; apaga la IA, las notificaciones, los crons y lo que aún no tiene equivalente en `bob`. La demo de Vercel no cambia.
- Nuevas vistas `/bob/interactions` y `/bob/quality` sobre las proyecciones reales, y `/api/bob/*` con las tres pantallas en JSON.
- Nueva vista local `/bob/performance`: la matriz de Performance de la demo sobre las proyecciones reales de BOb, leídas como `bob_app`, con «sin fila», cero y «no configurado» a la vista (BOB-7, Slice 2).
- El panel AutoBotz del simulador deja de guardar en la base: sigue funcionando con su seed en memoria (BOB-4, ruling 1).
