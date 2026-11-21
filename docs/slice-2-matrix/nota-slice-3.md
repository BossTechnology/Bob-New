# Matriz de Performance sobre proyecciones: qué celdas quedan sin fila, en cero o sin configurar

Entrada del grill del Slice 3 («absent-not-zero»). Leído en `/bob/performance` (este PR) como
`bob_app` bajo el claim de la organización A del fixture de BOb-engine, después de correr el
alimentador de referencia sobre `feeder_events.json` (ventana 2026-11-18 14:00–14:30 UTC,
watermark 14:30). Fixture, no datos de cliente.

Capturas: [todos.jpg](todos.jpg), [website.jpg](website.jpg), [voice.jpg](voice.jpg).

## Los canales de A

| Canal | lag_seconds | idle_bound_seconds | Capacidades |
|---|---|---|---|
| WhatsApp | 0 | sin declarar | orga_conversation, resolution |
| Website | **NULL** (lag no declarado) | sin declarar | orga_conversation, resolution |
| Voice | 900 | sin declarar | resolution |

## La matriz (Todos)

| Fila | Total | Cliente | Agente IA | Agente humano | Configuración |
|---|---|---|---|---|---|
| Disponibles | sin proyección | | | | estado vivo, no una de las ocho |
| Tiempo de respuesta | sin fila | sin fila | sin fila | sin fila | `response_time`: ningún canal |
| Calidad de respuesta | sin proyección | | | | ninguna tabla (coherence, diferida) |
| Resueltos | 3* | sin fila | 1* (Website) | 2* (WhatsApp, Voice) | `resolution`: los tres |
| Abandonados | sin fila | sin fila | sin fila | sin fila | `idle_bound_seconds`: ningún canal |
| Desambiguación | sin fila | sin fila | sin fila | sin fila | el contrato no nombra capacidad |
| Derivaciones | 1 | sin fila | sin fila | 1 (WhatsApp) | el contrato no nombra capacidad |
| Alucinaciones | sin fila | sin fila | sin fila | sin fila | `hallucination`: ningún canal |
| Abandonados en cola | sin fila | sin fila | sin fila | sin fila | el contrato no nombra capacidad |

`*` incluye buckets sin sellar. Turnos sin etiqueta (solo `user`): WhatsApp tiene valores y ceros
escritos; Website tiene `abstained` y `classifier_down` en **0** y `label_missing` **sin fila**;
Voice, sin fila y no configurado.

Las ocho tablas: `proj_durations`, `proj_channel_health` y `proj_rum_signals` no tienen ninguna
fila en ningún canal. `proj_detections` solo en WhatsApp; `proj_deliveries` una fila, sin canal.

## Lo que esto muestra para el Slice 3

1. **En la matriz no aparece ningún cero.** El alimentador escribe ceros solo en las tres fallas
   de etiqueta (que llevan el denominador). Las cinco métricas de la demo se escriben solo cuando
   pasa algo. Hoy la matriz no puede distinguir «no observado» de «observado, nada»: los dos son
   «sin fila». El §5 pide escribir el cero observado, pero la vivacidad sale de `health_uptime`, y
   ningún canal lo declara.
2. **«Sin fila» y «no configurado» coinciden en todas las filas que tienen capacidad**
   (`response_time`, `idle_bound_seconds`, `hallucination`). El fixture no tiene ningún caso de
   capacidad declarada sin filas en la matriz. El caso más cercano es `label_missing` en Website.
3. **Tres filas no pueden decir «no configurado»**: Desambiguación, Derivaciones y Abandonados
   en cola. El contrato no les nombra capacidad ni declaración.
4. **«Sin fila» tiene al menos dos significados más:**
   - *Pendiente*: Website declara `orga_conversation` pero tiene lag NULL, nunca sella y el corte
     de §4.1 nunca corre. Su `label_missing` es «sin fila» porque todavía no se puede saber.
   - *El actor no produce esa métrica*: Resueltos/Cliente. La columna del cliente está vacía por
     atribución, no por ausencia de datos.
5. **Alucinaciones tiene dos causas de ausencia** a la vez: la capacidad no está declarada, y no
   hay ground truth (D-29), así que el contrato la deja ausente aunque se declare.
6. **El total de «Todos» mezcla estados.** Suma canales sellados y sin sellar, y la unión de
   capacidades (§9.1) da por configurada una fila si *algún* canal la declara. Así, Voice desaparece
   del total de las fallas de etiqueta sin decirlo.
7. **Dos filas de la demo no tienen proyección**: Disponibles (estado vivo, `v_roster`) y Calidad
   de respuesta (coherence, diferida). El Slice 3 debe decidir si se pintan, y cómo.
8. **Duraciones, salud y RUM** no tienen filas por diseño del alimentador de referencia (el fixture
   no trae esa instrumentación). En el fixture eso coincide con «no configurado». Con 3.7 ya no
   coincidirá.
9. **AREP** no tiene columna. Solo aparece si una fila lo trae; el contrato todavía no le da
   forma (§7.1).
