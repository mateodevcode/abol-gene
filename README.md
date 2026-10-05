# Árbol Genealógico Familiar

App privada de árbol genealógico vivo (memoria colectiva familiar). Next.js App Router + JS, Tailwind, PostgreSQL con SQL directo (`pg`), Auth.js + invitaciones, S3/SES en producción.

Ver `promt.md` (orden de trabajo por fases) y `Árbol Genealógico Familiar Arquitectura v1.md` (diseño).

## Requisitos

- Node 20+ y pnpm
- PostgreSQL 16 con extensiones `pg_trgm` y `unaccent` (verificadas OK en Fase 0)

## Correr en local

```bash
cp .env.example .env.local
# edita .env.local con tu DATABASE_URL real (nunca se commitea)
pnpm install
pnpm dev
```

Abre http://localhost:3000.

Variables locales (`STORAGE_DRIVER=local`, `MAIL_DRIVER=console`):

- Fotos en `/.local-uploads` (fuera de git, solo con sesión).
- Enlace mágico impreso en terminal + página `/dev-login` (Fase 2).

## Base de datos

```bash
npm run db:migrate  # aplica /db/migrations en orden (tabla schema_migrations)
npm run db:seed     # datos de ejemplo (Fase 1)
npm run create-admin -- correo@ejemplo.com "Tu Nombre"  # primer admin (Fase 2)
npm run test:db     # pruebas de base de datos (Fases 1-2)
```

## Ingreso (Fase 2)

Solo con invitación. Flujo:

1. El admin genera un enlace en `/invitar` (o `POST /api/invites`).
2. El familiar abre `/join/<código>`, deja su correo y recibe el enlace mágico
   (en local se imprime en la terminal del servidor).
3. Al entrar, `/bienvenida` lo vincula con su persona (automático si la
   invitación trae persona, o "soy esta persona" si no).
4. En local también sirve `/dev-login` (entrada rápida, no existe en producción).

Límite: 5 enlaces por hora y correo. Google OAuth llega en Fase 9.

## Personas y relaciones (Fase 3)

CRUD con sesión obligatoria (401 sin sesión) y `change_log` en cada escritura:

```bash
# crear (avisa duplicados) / ver / editar / borrar (lógico)
POST   /api/persons            { given_names, paternal_surname, ..., birth_date, branch_id }
GET    /api/persons/[id]
PATCH  /api/persons/[id]
DELETE /api/persons/[id]
# vínculos y uniones (con protección contra ciclos en español)
POST   /api/persons/[id]/parents        { parent_id, kind?, certainty? }
PATCH|DELETE /api/persons/[id]/parents/[parentId]
POST   /api/unions                     { person_a_id, person_b_id, kind?, ... }
PATCH|DELETE /api/unions/[id]
# búsqueda y aviso de duplicados
GET    /api/persons/search?q=carmen
GET    /api/persons/duplicates?given_names=Karmen&paternal_surname=Garsia&birth_date=1912-09-03
```

## Consultas y parentesco (Fase 4)

Lectura con sesión obligatoria:

```bash
GET    /api/persons/[id]/tree?up=2&down=2   # subgrafo con parejas y hermanos
GET    /api/persons/[id]/descendants        # por hijo y generación, con total
GET    /api/persons/[id]/ancestors          # hasta donde llegue
GET    /api/persons/[id]/relatives          # hermanos, medios, tíos, primos
GET    /api/persons/[id]/kinship?to=<id>    # "tu tía segunda" + ruta
GET    /api/stats                           # totales, generaciones, longeva, cumpleaños, huecos
```

## Modo Datos (Fase 5)

Ficha navegable en `/persona/[id]` con `?vista=ficha|descendencia|ascendencia`:
padres, hermanos, medios, parejas, hijos, abuelos, tíos, primos, hechos,
historias firmadas y fotos (galería en Fase 7), todo con enlaces para saltar
de persona en persona, más buscador. Botón fijo Interactivo ↔ Datos y
"Ver en el árbol" (`/arbol?persona=<id>`).

```bash
GET    /api/persons/[id]/profile           # ficha completa agregada
```

## Contenido (Fase 7)

Historias firmadas, hechos con fuente, galería con subida en 3 tamaños,
etiquetado, portada y línea de vida — todo desde la ficha (`/persona/[id]`).

```bash
POST   /api/persons/[id]/stories  PATCH|DELETE /api/stories/[id]
POST   /api/persons/[id]/facts    PATCH|DELETE /api/facts/[id]
POST   /api/photos/upload         # multipart: original+medium+thumb
GET    /api/photos/[id]/[size]    # original|medium|thumb (con sesión)
PATCH|DELETE /api/photos/[id]     POST|DELETE /api/photos/[id]/tags
# portada: PATCH /api/persons/[id] { cover_photo_id }
```

## Extras y administración (Fase 8)

Mapa: "Camino hasta mí" (popup), filtro por generación, minimapa con
clic-para-ir, huecos `?` clicables, cumpleaños del mes en ámbar.
Páginas: `/estadisticas`, `/historial` (con deshacer) y `/duplicados`
(admin: rastrear, fusionar, descartar).

```bash
GET    /api/history  POST /api/history/[id]/undo   # propios (admin: todos)
GET    /api/duplicates  POST /api/duplicates        # rastrear (admin)
POST   /api/duplicates/[id] { keep_id }             # fusionar (admin)
DELETE /api/duplicates/[id]                         # descartar (admin)
```

## Despliegue en Vercel (Fase 9)

1. Sube el repo a GitHub y conéctalo en Vercel (import project). No se commitea
   ningún secreto: solo `.env.example` con placeholders.
2. En Vercel → Settings → Environment Variables (Production), agrega:
```
DATABASE_URL=postgresql://... (la misma base; acepta conexiones externas)
NEXTAUTH_URL=https://<tu-app>.vercel.app
NEXTAUTH_SECRET=<genera uno: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
STORAGE_DRIVER=s3
NEXT_PUBLIC_STORAGE_DRIVER=s3
MAIL_DRIVER=smtp
PG_POOL_MAX=2
AWS_ACCESS_KEY_ID=...  AWS_SECRET_ACCESS_KEY=...  AWS_DEFAULT_REGION=...
AWS_BUCKET=...  AWS_BUCKET_SUBFOLDER=arbol-gene
BREVO_SMTP_EMAIL=...  BREVO_SMTP_PASS=...  BREVO_EMAIL_NO_REPLY=...
INVITE_ROLE=admin
```
3. Deploy. Luego dime la URL para agregar el CORS exacto del bucket S3
   (subida directa del navegador) y probar el ingreso por correo.
4. Respaldos: la base (copia periódica en tu proveedor) + versionado S3
   (activado). Google OAuth queda para después (solo enlace mágico por ahora).

Notas: `PG_POOL_MAX=2` porque el rol de Postgres tiene tope bajo de
conexiones (comprobado); si crece el uso, pooler PgBouncer. Las fotos
locales se migran una vez con `scripts/migrate-photos-to-s3.js`.

## Mapa interactivo (Fase 6)

`/arbol`: arrastre, rueda/pellizco, doble clic o toque (popup con parentesco
y acceso al perfil), clic en la unión (enfoca a la familia y atenúa el resto),
toolbar (+/−/◎/+Nivel), LOD por zoom y colores por rama (degradado si mezcla).
Carga parcial por foco (`?persona=<id>` centra al inicio).

## Estructura

```
src/app                 App Router ((auth), (main)/arbol, persona/[id], estadisticas, /api)
src/components/tree|person|ui
src/lib/db|tree-layout|kinship|storage|mailer|auth
src/store               Zustand (UI)
db/migrations           SQL versionado
scripts                 migrate, seed, create-admin
```

Principios: privado con invitación, todo firmado con autor/fecha, borrado lógico + `change_log`, parentesco calculado no guardado, el navegador nunca habla directo con la DB.

## Despliegue (Fase 9)

Vercel + Postgres externa + S3 privado + SES. Requiere confirmar pooler (PgBouncer) o limitar pool por función, y configurar `STORAGE_DRIVER=s3`, `MAIL_DRIVER=ses`, Google OAuth y dominio. Detalle en `promt.md` Fase 9.
