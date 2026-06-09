# BOb — Puesta en marcha (lo que debes hacer tú)

Todo el **backend del Backend Discovery v1.0** está implementado en este proyecto
(`bob-web`) y el **dashboard v2** ya está integrado (`public/dashboard.html`) con sus
llamadas de IA reenrutadas al proxy server-side. El build pasa (`npm run build` ✅).

Lo que sigue son las acciones que **solo puedes hacer tú** (cuentas, secretos, infra,
deploy). Están en orden. Camino elegido: **org demo sembrada** (§12.2).

---

## PARTE 1 — Acciones manuales (en orden)

### 1. Crear cuentas y obtener claves
- **Supabase** → crea un proyecto (dev). Settings → API: copia `Project URL`, `anon key`, `service_role key`.
- **Anthropic** → console.anthropic.com → API key (`sk-ant-...`).
- **Resend** (email) → API key (`re_...`) y verifica el dominio `bosstechnology.com`.
- **Twilio** (SMS/voz) → Account SID, Auth Token, y un número emisor. Ajusta permisos geográficos.
- **Slack** (opcional) → Incoming Webhook por organización.

### 2. Variables de entorno
```bash
cp .env.local.example .env.local
# Rellena TODOS los valores. Genera secretos aleatorios para:
#   CRON_SECRET, INTERNAL_SERVICE_API_KEY   (p.ej. `openssl rand -hex 32`)
```

### 3. Aplicar las migraciones de base de datos
Las migraciones están en `supabase/migrations/` (idempotentes, §11.2). Dos caminos:

**A) Stack local (Docker)** — recomendado para desarrollar:
```bash
# Arranca Docker Desktop primero
supabase init        # si pide; ya existe supabase/
supabase start       # levanta Postgres + Auth local
supabase db reset    # aplica TODAS las migraciones + (luego) seed
```

**B) Proyecto remoto dev:**
```bash
supabase link --project-ref <TU_PROJECT_REF>
supabase db push     # aplica las migraciones al proyecto remoto
```

> ⚠ **Si ya habías desplegado el `schema.sql` viejo** en este proyecto, las tablas
> `anomalies/alerts/patterns/rootcause_log` existen sin `org_id` y darán
> `ERROR 42703: column "org_id" does not exist`. La migración
> `20260606115900_drop_legacy_singletenant.sql` (corre primero) las elimina. Si aplicas
> a mano en el SQL Editor, ejecuta antes:
> `DROP TABLE IF EXISTS rootcause_log, patterns, anomalies, alerts CASCADE;`
> Alternativa sin CLI: pega el contenido de los dos archivos `supabase/migrations/*.sql`
> en el **SQL Editor** de Supabase, en orden (primero `...initial_schema`, luego `...auth_custom_claims`).

### 4. Activar el Custom Access Token Hook (CRÍTICO para multi-tenant)
Supabase Dashboard → **Authentication → Hooks → Custom Access Token** →
selecciona `public.custom_access_token_hook`.
Sin esto, el JWT no llevará `org_id`/`role` y las rutas con `requireAuth` darán 401
y las políticas RLS no filtrarán por organización.

### 5. Activar Realtime (§8.2)
**No uses la pantalla “Replication”** (esa es para réplicas de lectura / ETL externo).
El Realtime se activa metiendo las tablas en la publicación `supabase_realtime`.
La migración `20260606120002_realtime.sql` ya lo hace (idempotente); o en el SQL Editor /
Database → Publications → `supabase_realtime` habilita:
`metric_snapshots`, `alerts`, `anomalies`, `sentiment_readings`.
(Deja fuera `audit_log` y `notification_log`.)
> No es bloqueante para ver el demo: el dashboard v2 refresca con su propio bucle de
> simulación. Realtime es la config documentada del backend para datos en vivo reales.

### 6. Crear los Storage buckets (§8.2) — privados
Dashboard → Storage → crea: `logos` y `reports` (ambos **private**).
(Necesarios para subida de logos y para los reportes server-side.)

### 7. Configurar el entorno en Vercel
- Importa el repo en Vercel (framework: Next.js).
- Project → Settings → Environment Variables: añade **las mismas** del `.env.local`
  (incluye `CRON_SECRET` e `INTERNAL_SERVICE_API_KEY`).
- Los **cron jobs** de `vercel.json` se registran solos al desplegar (requiere plan Pro).

### 8. Desplegar
```bash
# desde la raíz de bob-web, conectado a Vercel
vercel --prod
# (o git push a la rama conectada)
```

### 9. Sembrar la organización demo (§12.2)
Con el deploy arriba (o en local), llama al seeder con tu clave de servicio:
```bash
curl -X POST https://TU-APP.vercel.app/api/admin/seed \
  -H "x-internal-api-key: $INTERNAL_SERVICE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"slug":"demo","industry":"education"}'
# Devuelve { org_id, seeded: {...} }
```
Esto crea la org demo + canales + 600 interacciones + sentimiento + alertas + anomalías.

### 10. Probar
- **Demo (sin login):** abre `https://TU-APP.vercel.app/demo` → carga el dashboard.
- **Con login:** crea el primer usuario/organización:
  ```bash
  curl -X POST https://TU-APP.vercel.app/auth/signup \
    -H "Content-Type: application/json" \
    -d '{"email":"tu@correo.com","password":"********","org_name":"Mi Empresa","full_name":"Tu Nombre"}'
  ```
  Luego entra por `/login`.
- **Salud:** `GET /api/health` debe responder `{status:"ok", db:"ok"}`.

---

## PARTE 2 — Correr en local
```bash
npm install
npm run dev      # http://localhost:3000  → redirige a /dashboard.html
# Dashboard demo directo: http://localhost:3000/dashboard.html
```
(En local los cron de Vercel no corren; puedes invocarlos a mano:
`curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/metric-refresh`.)

---

## PARTE 3 — Decisiones del documento que quedan abiertas para ti

1. **Path A vs Path B (origen de datos reales, §1.2/§8.6).** Hoy el dashboard funciona
   con la **org demo sembrada**. Para datos reales, conecta tu observabilidad/canales a
   `POST /api/interactions/batch` (cabecera `x-internal-api-key`). Esa decisión sigue TBD.

2. **Cron de 30 s.** El §7.1 pide refrescos cada 30 s, pero **Vercel Cron tiene mínimo
   1 min** — `vercel.json` usa `*/1`. Si necesitas 30 s, hace falta un scheduler externo
   (Supabase `pg_cron`, QStash, etc.). No bloquea el demo.

3. **PDF server-side.** El §5.9 pide render server-side; aquí `POST /api/reports/generate`
   **ensambla el dataset** y lo guarda como JSON en el bucket `reports`. El dashboard ya
   genera el PDF en cliente (jsPDF), que es suficiente para el demo. Falta enchufar un
   renderer server-side si lo quieres como PDF en el backend.

4. **Modelo Claude.** El doc fija `claude-sonnet-4-20250514` (en `lib/claude.ts` → `MODELS`).
   El GA vigente es `claude-sonnet-4-6`; cámbialo en un solo sitio si lo prefieres.

---

## PARTE 4 — Adaptaciones fieles que tuve que hacer (para que funcione)

Transcribí el documento **al pie de la letra**, salvo estos puntos donde el código literal
no compila/no corre. Quedan anotados en el propio código:

- **`middleware.ts` → `proxy.ts`**: en Next.js 16 el middleware se llama *proxy* (lo
  confirmé en los docs locales `node_modules/next/dist/docs/`). Misma función.
- **`@supabase/auth-helpers-nextjs` → `@supabase/ssr`**: el paquete del doc está
  deprecado y no es compatible con Next 16 / React 19.
- **Columnas reservadas**: `anomalies."desc"` y `metric_snapshots."window"` van
  entrecomilladas (mismo nombre). Sin comillas, el DDL del doc no compila en PostgreSQL.
- **Auth hook real**: el §3.1 muestra una firma que no es la que invoca Supabase;
  implementé `public.custom_access_token_hook(event jsonb)` (la real) + un
  `handle_new_auth_user` que lee `org_id` del metadata (el del §2.1 fallaba porque
  `users.org_id` es NOT NULL).

### Inconsistencias del documento (resueltas / marcadas)
- `baselines`, `organizations` y `users` **no llevaban RLS** en el Cap. 2 (contradice §1.4
  y lo marca el linter de Supabase). **Resuelto**: la migración ahora activa RLS en las tres
  con políticas correctas (miembros leen su propia org; `supabase_auth_admin` puede leer para
  el hook de claims; `baselines` queda solo para service-role).
- `usage_log` se referencia en §8.1/§5.10 pero **no está definida en el Cap. 2**. El
  registro de tokens es best-effort (no rompe si la tabla no existe). Créala si quieres
  tracking de costos.

### Nota sobre `supabase/schema.sql`
El archivo antiguo `supabase/schema.sql` (single-tenant) quedó **superado** por las
migraciones multi-tenant. No lo borré; archívalo o elimínalo cuando confirmes la migración.

---

## Resumen de lo implementado
- **2 migraciones** (esquema multi-tenant §2 + auth/claims §3).
- **8 servicios** (§4 + Apéndice A) en `services/`.
- **~50 rutas API** (§5) en `app/api/**` y `app/auth/**`.
- **9 cron jobs** (§7) en `app/api/cron/**` + `vercel.json`.
- **Integraciones** Claude/Resend/Twilio/Slack (§8).
- **Proxy de auth** (§3.2) en `proxy.ts`.
- **Dashboard v2** integrado en `public/dashboard.html` con IA vía `/api/ai`.
- **Demo mode** (`/demo`) + seeder (`/api/admin/seed`) + login (`/login`).
