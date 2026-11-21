# Inventario: qué toca hoy la service role, PostgREST o las tablas de la demo

Requisito: §4.2 (puntos 1 a 5) de los insumos de Bzzz «BOb v1 dentro de la caja: lo mínimo de la
etapa 4» (sin firmar, 2026-11-20). En la caja no hay PostgREST, BOb no lleva la service role y
lee el esquema `bob` como `bob_app` bajo el claim del `org_id` de la caja (P5 §3.3 y §3.4).

Leído en `origin/main` de bob-web (`fa4f1cb`) y contra el esquema `bob` del Supabase local de
BOb-engine (`bob-v1`, migraciones hasta `20261121100200`).

## Las tres categorías

- **(i) Se pasa a `bob.*` como `bob_app`.** Hay tabla o proyección en `bob` y la demo la usa.
- **(ii) Se apaga en v1.** Decidido por Henry: `/api/ai`, Twilio, Resend y los crons de Vercel.
  La reconciliación de fantasmas no queda en BOb: pasa al feeder (Henry, 2026-11-21).
- **(iii) Sin equivalente en `bob` todavía.** Se apaga detrás de la bandera y queda pendiente con
  su dueño.

**La bandera:** `BOB_CAJA=1`. Con ella la app corre en modo caja: lo de (ii) y (iii) responde 404
(`lib/bob/surface.ts`, una lista de lo permitido: una ruta nueva nace apagada), lo de (i) lee `bob`
como `bob_app` y la sesión se valida contra el GoTrue de la caja. Sin ella, la demo de Vercel
sigue igual que hoy.

## Qué usa de verdad la demo

`public/dashboard.html` es el simulador. Pinta INTERACCIONES, CALIDAD Y EXPERIENCIA y
RENDIMIENTO con datos que inventa en el navegador: no pide ninguna de esas cifras al servidor.
Al servidor solo le habla por dos caminos:

- `/api/config/*` (el puente de persistencia): `channels`, `thresholds`, `responses`, `anomalies`,
  `textrules` y `autobotz` (este último apagado desde PR #24);
- `/api/ai` (BObee).

El resto de `app/api/*` es el backend de la discovery: ninguna pantalla de la demo lo llama.

## (i) Se pasa a `bob.*` como `bob_app`

| Qué | Hoy | En la caja |
|---|---|---|
| Pantalla RENDIMIENTO (`/bob/performance`) | ya lee `bob.proj_*` como `bob_app` (PR #29) | igual; la conexión sale del fichero de secretos (punto 5) |
| Pantalla INTERACCIONES (`/bob/interactions`) | el simulador | `bob.channels` y `proj_durations` (`interaction_duration`). «Sesiones», ver (iii) |
| Pantalla CALIDAD (`/bob/quality`) | el simulador | `proj_sentiment` (ORGA y MECA por separado) y `proj_metric_counts` (fallas de etiqueta). NPS, ver (iii) |
| `GET /api/bob/{performance,interactions,quality}` | no existía | lo mismo en JSON, para que el simulador lo lea después |
| `/api/config/thresholds`, `/thresholds/:metricId` | PostgREST con el JWT del usuario | `bob.threshold_configs`, `bob.response_rules` |
| `/api/config/anomalies`, `/anomalies/:key` | PostgREST | `bob.anomaly_rules`, `bob.response_rules` |
| `/api/config/textrules`, `/textrules/:metricId` | PostgREST | `bob.text_rules`, `bob.response_rules` |
| `/api/config/channels`, `/channels/:id` | PostgREST | `bob.notification_channels`, `bob.response_rules` |
| `/api/config/responses`, `/responses/:id` | PostgREST | `bob.response_rules`, sin los campos `webhook_*` (BOb-engine los quitó) |
| `/api/health` | service role contra `organizations` | `SELECT 1` como `bob_app` y `GET /health` de GoTrue; 503 si alguno no responde |
| `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/me` | `@supabase/ssr` con `NEXT_PUBLIC_SUPABASE_*` | GoTrue de la caja por dentro (`BOB_GOTRUE_URL`, sin `/auth/v1`), en tiempo de ejecución |
| `proxy.ts` | deja pasar todo sin configuración de Supabase; error de `getUser()` = sin usuario | falla cerrado: sin configuración, 503; GoTrue caído, 503; 401 de GoTrue, a `/login`; sin fila en `bob.users`, 403. Ve todas las rutas salvo `_next/static` |
| `lib/auth.ts` `requireAuth` | `org_id` y `app_role` del JWT (hook de Supabase) | `org_id` de `BOB_ORG_ID`; papel de `bob.users`; sin fila o inactiva, 403 (ver P-1) |

## (ii) Se apaga en v1

| Qué | Tablas o salidas |
|---|---|
| `/api/ai`, `/api/ai/{chat,conversations,insights,rootcause,sentiment}` | Anthropic; `bobee_conversations` |
| `/api/notify/{call,email,sms,slack}`, `/api/notify/log` | Twilio, Resend, Slack; `alerts`, `notification_log` |
| `/api/twilio/{status,twiml}`, `/api/slack/action` | Twilio, Slack; `alerts`, `notification_log` |
| Los diez crons de `vercel.json` (`/api/cron/*`): `metric-refresh`, `sentiment-aggregation`, `alert-evaluation`, `anomaly-detection`, `baseline-compute`, `pattern-recognition`, `issue-grouping`, `notif-retry`, `cleanup`, `autobotz-reverify` | service role; `metric_snapshots`, `channels`, `alerts`, `anomalies`, `baselines`, `patterns`, `notification_log`, `audit_log`, `autobotz_bindings`, `alert_log` |
| `services/*` (`NotificationService`, `BObeeService`, `SentimentAnalysisService`, `AnomalyDetectionService`, `MetricAggregationService`, `AlertEvaluationService`, `PatternRecognitionService`, `RootCauseService`), `lib/claude.ts`, `lib/cron.ts` | solo los llaman las rutas de arriba y las de (iii) |
| `/auth/signup` | punto 7: GoTrue de la caja tiene el alta cerrada |
| `/demo` | punto 7 |

`vercel.json` no cambia: en la caja nadie llama a los crons, y con `BOB_CAJA=1` responden 404.
La reconciliación de fantasmas no se programa en BOb (pasa al feeder).

## (iii) Sin equivalente en `bob` todavía

| Qué | Por qué no se pasa | Dueño |
|---|---|---|
| «Sesiones» de INTERACCIONES | El contrato 0.5.3 no nombra una cifra de sesiones. `session_count` de §6.1 es el denominador de cada fila de métrica y se repite por métrica; sumarlo cuenta de más | **BOb-engine** (contrato; Henry decidió «sin proyección», P-2) |
| NPS de CALIDAD | Ninguna de las ocho proyecciones lo lleva | **BOb-engine** (contrato) |
| Respuestas de tipo `action` en `/api/config/responses` | `bob.response_rules` exige `autobotz_id` cuando el tipo es `action` (Slice 6) y el simulador manda un webhook | **BOb-engine**, Slice 6 (PR #26) |
| `/api/config/autobotz`, `/autobotz/:id` | Ya apagado en el simulador (PR #24); `bob.autobotz` cambió de forma con el renombre | **BOb-engine**, Slice 6 |
| `/api/config`, `/config/export`, `/config/import` (`configurations`) | La tabla está en `bob`, pero ninguna pantalla de la demo la usa y su forma (`metric_cfg` entero en JSON) duplica las tablas de reglas | **BOb-engine** (decidir si sobrevive) |
| `/api/config/alerts`, `/config/alerts/summary` (`alert_log`) | Lo escribe el bucle de evaluación, que en v1 no corre | **BOb-engine**, Slice 8 |
| `/api/alerts/*`, `/api/anomalies/*`, `/api/rules/*`, `/api/patterns/*`, `/api/rootcause/*`, `/api/reports/*` | El bucle condición → alerta → acción es del Slice 8; las detecciones llegan por `proj_detections` | **BOb-engine** (Slice 8) y **Federico** (3.7, `proj_detections`) |
| `/api/interactions`, `/interactions/{by-channel,by-metric}` | Filas por interacción: en `bob` no hay. El detalle es `affected_members()` y los paquetes de evidencia (contrato §7.3, §7.5) | **Federico** (3.7) |
| `/api/interactions/batch` | La ingesta es el feeder | **Federico** (3.7) |
| `/api/metrics/*`, `/api/sentiment` | Figuras derivadas (`metric_snapshots`, `sentiment_readings`). El contrato guarda cuentas y deriva al leer; las pantallas ya leen `proj_*` | **BOb-engine** (decidir si la API sobrevive) |
| `/api/channels`, `/api/channels/:id` (canales de negocio) | `bob.channels` cambió (`source_key`, capacidades); el alta de canales es aprovisionamiento | **BOb-engine** |
| `/api/admin/{orgs,seed,metrics/usage}` | Service role. La organización la crea el aprovisionamiento de la caja; `seed` es de la demo | **BOb-engine** |
| `/auth/reset-password`, `/auth/confirm-reset` | Correo de GoTrue en la caja: no hay salida a internet en v1 | **Bzzz** (Henry) |
| `public/coop.html` | Pinta cifras inventadas; en una caja de cliente parecerían reales | **bob-web** |
| `public/dashboard.html` (el simulador) | En la caja deja de simular y pinta `/api/bob/*` con `public/bob-live.mjs` (P-4) | servido con sesión |
| `lib/features.ts` | Nadie lo llama | — |

## Pendientes que salen del inventario

- **P-1 · El papel del usuario en la caja.** Henry decidió (2026-11-21, «Sin fila, 403»): una
  cuenta sin fila en `bob.users`, o con `active` distinto de verdadero, recibe 403 en `/bob/*`,
  `/api/bob/*` y `/api/config/*`; no hay `viewer` por omisión. Tampoco sirve un papel fuera de
  admin, analyst y viewer (`service`, `demo`). **Cerrado** por BOb-engine #34 (2026-11-21):
  `bob_app` lee los usuarios de su organización (`app_reads_org_users`), así que un admin activo
  de la caja entra con su papel.
- **P-2 · «Sesiones».** Cerrado (Henry, 2026-11-21): se pinta «sin proyección» hasta que el
  contrato la nombre. Ni `n` de `interaction_duration` ni `handled` de `proj_actor_metrics`.
- **P-3 · Slice 3.** Los estados de celda los resuelve `bob.v_cell_state`, que no existe. El
  enganche está en `lib/bob/cell-state.ts`: mientras la vista no exista, la app pinta lo que lee
  (sin fila, cero, valor) y no inventa estados.
- **P-4 · El simulador.** Cerrado. Cuando `/api/bob/*` responde, `public/bob-live.mjs` para la
  simulación y pinta las tres pantallas: Sesiones, NPS, Disponibles, Calidad de respuesta, Temas,
  Acciones, Preguntas y Palabras dicen «sin proyección»; Ánimo & Sentimiento son barras por estado
  (ORGA y MECA, nunca sumadas); los botones de ventana mandan `range` (`now`, `today`, `week`,
  `month`) y el desfase del navegador, y la API calcula el inicio local. Sin equivalente en `bob`,
  BObee, alertas, alarmas, acciones, anomalías y los paneles de detalle se ocultan. Si una lectura
  falla, sus cifras muestran «—», nunca lo simulado. Fuera de la caja la API responde 404 y el
  simulador sigue como antes.
- **Umbrales en la caja.** Un clic en Tiempo Prom. o en Resueltos, Abandonados, Desambiguación,
  Derivaciones o Alucinaciones abre un editor de límite superior e inferior que lee y escribe
  `/api/config/thresholds/:metricId` con las claves del simulador (`avgtime`, `res`, `aba`, `des`,
  `der`, `alu`), como el puente de la demo. Conserva `peak_mode` y `peak_windows`. Las cifras sin
  proyección no llevan umbral. Nada evalúa el umbral en la caja ni pinta su incumplimiento: esa
  regla es del motor (Slice 5).
