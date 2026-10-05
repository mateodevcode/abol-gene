# DECISIONS.md

Registro de decisiones menores tomadas de forma autónoma (el prompt pide anotarlas aquí y seguir).

## Fase 0 (2026-10-04)
- Se usa `src/` como raíz (`src/app`, `src/components`, `src/lib`, `src/store`) porque el scaffold ya venía así y `jsconfig.json` mapea `@/*` a `./src/*`. El prompt pedía `/app`, `/components`, etc. en raíz; se respeta la intención con el prefijo `src/`.
- `.gitignore`: se permite commitear `.env.example` (`!.env.example`) y se ignora `/.local-uploads/` (driver local de fotos, Fase 7).
- Pool `pg`: `max 5` por defecto, configurable con `PG_POOL_MAX`. Motivo: Vercel serverless abre muchas conexiones cortas (riesgo documentado en Arquitectura §4/§16).
- `pg_trgm` y `unaccent` ya están instaladas en la DB (v1.6 y v1.1, PG 16.4). No hace falta alternativa en app.
- Scripts `db:migrate` / `db:seed` / `create-admin` reservados desde Fase 0; implementación real en Fases 1-2.

## Fase 1 (2026-10-04)
- Migraciones: `001_extensions.sql` (pgcrypto, pg_trgm, unaccent) + `002_core_schema.sql` (13 tablas). Un solo archivo de esquema para orden determinista de FKs circulares (branches↔persons, persons↔photos), resueltas con ALTER TABLE al final.
- `created_by` / `uploaded_by` / `author_user_id` sin FK dura y nulables: el seed y el bootstrap no tienen usuario aún. La app (Fase 3) siempre los llena.
- Sin UNIQUE en `unions`: se permiten varias uniones entre la misma pareja (divorcio + reconciliación) y segundos matrimonios.
- Tablas de enlace (`story_mentions`, `photo_tags`): PK compuesta + created_at/created_by, sin `deleted_at` (el historial vive en `change_log`).
- `change_log` usa `user_id` en vez de `created_by` y no lleva `deleted_at` (es append-only).
- `facts.type` en inglés (`occupation|residence|origin|anecdote|other`); la UI muestra etiquetas en español.
- Trigger `persons_set_normalized_trg`: `full_name_normalized` siempre vía `lower(unaccent(...))`; el seed no lo calcula a mano.
- Seed sin `change_log`: es bootstrap, el historial empieza en Fase 3 con escrituras de la app.
- Tests con `node:test` sin dependencias (`npm run test:db`). Los tests fijan personas demo por nombre + apellido materno + año para no colisionar con sintéticos.
- Sintéticos: padres siempre estrictamente mayores (20-45 años) → DAG acíclico por construcción; PRNG con semilla fija (reproducible).

## Fase 2 (2026-10-04)
- `next-auth@4.24.15` (v4 estable) en vez de v5: API madura para Email provider + adapter propio. Reevaluar en Fase 9 si hace falta.
- Sesiones **JWT** (no DB): el middleware/proxy corre en el edge y no puede usar `pg`. Tablas `accounts` y `verification_tokens` sí se usan; tabla de sesiones omitida a propósito (el adapter la rechaza con error claro).
- `src/proxy.js` (no `middleware.js`): Next 16 deprecó la convención `middleware`.
- Adapter propio sobre la tabla `users` de la app (sin duplicar usuarios): se agregaron `email_verified` e `image` por migración. Rol y `person_id` viajan en el JWT y se refrescan desde la DB en cada `session` (vincularse se refleja sin reingresar; el middleware solo exige token válido).
- Anti-bypass de invitación en 3 capas: la acción `prepareMagicLink` exige código para correos nuevos, `sendVerificationRequest` aplica el límite como respaldo, y `/bienvenida` bloquea cuentas sin invitación ni persona.
- Límite: 5 enlaces/hora por correo (`magic_link_attempts`), configurable en `src/lib/mailer`.
- `INVITE_ROLE=admin` por defecto (miembros no invitan); se puede abrir con `INVITE_ROLE=member`.
- Proveedor `dev` (Credentials) solo existe si `NODE_ENV !== production`; `/dev-login` devuelve 404 en producción.
- Google OAuth: tabla `accounts` lista, proveedor desactivado hasta Fase 9.
- Tests ESM resuelven `@/` con `tests/hooks.mjs` (solo para `npm run test:db`, no afecta a Next).

## Fase 3 (2026-10-04)
- Correo real con Brevo por SMTP (`MAIL_DRIVER=smtp`, STARTTLS 587, remitente `BREVO_EMAIL_NO_REPLY`). `console` sigue disponible para local sin envíos. SES queda para Fase 9.
- Escrituras siempre con `withTransaction` + `logChange` en la misma transacción; el test de rollback lo comprueba (persona temporal no persiste si el vínculo falla).
- `created_by`/`user_id` de auditoría: siempre el usuario de sesión (nunca confiamos en el cliente).
- Anti-ciclos en app (no solo CHECK): `assertNoCycle` sube por antepasados y rechaza con mensaje en español que nombra a ambas personas. Los ciclos imposibles por construcción en sintéticos se mantienen.
- Duplicados solo AVISAN (no bloquean): umbral efectivo 0.18 (el `%` trigram con 0.3 perdía nombres largos con faltas), puntaje nombre 0.5 + fecha 0.3 + padres 0.3.
- Precisiones/fechas validadas en app además de los CHECK (mensajes claros).
- APIs sin sesión devuelven 401 JSON: el proxy deja pasar `/api/*` y cada handler exige sesión (el 307 a /login solo aplica a páginas).
- Sin UI nueva en Fase 3 (backend): se prueba con `npm run test:db` + curl con sesión (ver resumen).

## Fase 4 (2026-10-04)
- `describeKinship` pura en `/lib/kinship` (testeable sin DB); el wrapper `/lib/db/kinship.js` arma el subgrafo y la API expone etiqueta + ruta A→NCA→B (la usará "Camino hasta mí" en Fase 8).
- Con dos padres el ancestro común no es único (Carmen o Antonio): se devuelve el primero hallado a distancia mínima; la etiqueta no cambia.
- Cobertura de etiquetas: directa hasta tatarabuelos, hermanos/medios ("media hermana" en femenino), tío/sobrino ±1 y segundos, primos 1°–3° en igual grado; resto "pariente lejano". Sin "removidos" genéricos (se prefirió "tío segundo", de uso real).
- Hermanos "completos" = mismo juego de padres conocidos; si uno tiene un padre extra registrado, son medios.
- `birth_place='Sintética'` marca filas generadas: los tests fijan demo con `birth_place IS NULL` para no colisionar con nombres sintéticos iguales.
- Huecos por rama = sin fecha de nacimiento o con menos de 2 padres conocidos.
- Bug encontrado por tests: condición anti-ciclos `pl.child_id = ANY(path)` impedía subir en el CTE de kinship (el hijo siempre está en el path); solo se filtra el padre nuevo.

## Fase 5 (2026-10-04)
- Modo Datos en `/persona/[id]` con `?vista=ficha|descendencia|ascendencia` (server-render, enlazable). Sin grupo `(main)`: rutas planas.
- Ficha de solo lectura (el CRUD vive en APIs de Fase 3; formularios UI no exigidos en el prompt).
- Fechas DATE como texto 'YYYY-MM-DD' vía parser global en `client.js`: `pg` las daba como Date a medianoche local y los getters UTC movían el día (bug real: "4 may" en vez de "5 may"). `formatDate` además acepta Date con getters locales.
- Avatar de iniciales con color de rama en `components/person` (se reutiliza en el mapa).
- Toggle Interactivo↔Datos fijo abajo; "Ver en el árbol" → `/arbol?persona=<id>` (la cámara llega en Fase 6).
- Firma de historias: nombre del autor o "Relato familiar" si es anónima (seed).

## Fase 6 (2026-10-04)
- Capas separadas: TanStack Query (caché por foco+profundidad) → `layoutTree` pura → canvas d3-zoom → SVG aristas + HTML tarjetas → Motion en popup.
- Layout: layering por camino más largo, parejas principales juntas, hermanos con X_GAP y FAMILY_GAP entre grupos, recentrado de padres sobre hijos EN COMÚN con barrido anti-solape en espacio-x. Bug real: topes con vecinos en "orden" (no en posición) solapaban parejas separadas en orden (110 solapes en datos reales → 0).
- Carga parcial v1: ventana up/down alrededor del foco (`+ Nivel` la amplía, cacheada). Carga total solo a pedido (perf: 2058 nodos en ~20ms).
- LOD: lejos puntos+apellido (<0.4), medio nombre+iniciales (<0.85), cerca tarjeta con fechas. Culling con margen 500px; zoom.edge con d3 (rueda, arrastre, pellizco), doble-clic nativo desactivado.
- Popup con un toque O doble-clic (más táctil) + parentesco "tu X" si hay sesión vinculada.
- Hijos de dos ramas: degradado con ambos colores (calculado en cliente).
- Foco de familia: clic en la arista de unión → zoom animado + atenúa resto.
- Camino hasta mí, minimapa, filtro por generación, huecos clicables y cumpleaños quedan para Fase 8.

## Fase 7 (2026-10-04)
- Driver `local` en `/.local-uploads` (ignorado en git), servido solo con sesión y `Cache-Control: private`. Claves `local/<uuid>/<size>.<ext>` (misma forma que usará s3).
- El navegador genera los 3 tamaños (canvas + createImageBitmap) y todo se normaliza a JPEG con fondo blanco; el servidor exige los 3, mismo formato y topes (10MB/5MB/512KB). Sin `sharp` a propósito (cero dependencias nativas).
- Orden de subida: disco primero, DB después; si la DB falla se borran archivos.
- Portada = `persons.cover_photo_id` (una foto de la galería); al borrar la foto se suelta y el avatar vuelve a iniciales. Avatar con foto en ficha, chips y mapa (miniatura).
- `<img>` en vez de `next/image`: el optimizador pediría sin cookie de sesión (401).
- Historias firmadas con `author_user_id` (o "Relato familiar" si es seed anónimo); menciones ignoran ids inexistentes.
- Humo: la ruta `[size]` devolvió la página 404 por estado rancio de Turbopack (registrada en build); reiniciar el dev la resolvió.

## Fase 8 (2026-10-04)
- Deshacer crea entrada `restore` (la historia jamás se borra). Member: solo propias; admin: todas.
- Fusión mueve TODO (padres, hijos, uniones, historias, hechos, menciones, etiquetas, usuarios, invitaciones, fundadores) y guarda fotos completas de lo tocado; los vínculos/uniones duplicados se borran pero se guardan para reinsertar al deshacer.
- Rastreo de duplicados: self-join trigram >0.55 (lento en 2058: ~50s; es acción admin a pedido, no automática).
- Huecos del mapa: personas con 0 o 1 padre conocido (pedido del usuario: también fundadores como él). Un solo "?" por persona que lleva a conectar existente o crear.
- Camino hasta mí reutiliza la etiqueta y ruta del endpoint kinship (Fase 4).
- Minimapa con clic-para-ir; filtro por generación oculta aristas (vista limpia de cohorte).
- Cumpleaños: punto ámbar en el mapa (vivos con día/mes conocido del mes actual).

## Producción (2026-10-05, pedido del usuario)
- S3 verificado (PUT/GET firmados, versionado activado, CORS localhost). Driver `s3` con subida directa + confirmación + redirect firmado; `local` intacto para desarrollo.
- Correo en prod = Brevo SMTP (no SES por ahora); Google OAuth desactivado hasta que se pida.
- Fotos locales migradas a S3 (`scripts/migrate-photos-to-s3.js`); archivos locales quedan de respaldo.
- `PG_POOL_MAX=2` en prod por el tope bajo del rol (evidencia en tests).

## Validaciones cronológicas (2026-10-04, pedido del usuario)
- Nadie nace antes que su padre/madre biológico o adoptivo (comparación por año; hijastros y crianza exentos por ser vínculo social).
- La unión no empieza antes de que nazca alguno, ni termina antes de empezar.
- Cambiar una fecha de nacimiento revalida padres, hijos y uniones existentes.
- Mensajes en español con años ("nació en 1980, antes que…"). Auditoría: 0 violaciones en los datos actuales.

## Datos reales desde cero (2026-10-04, pedido del usuario)- Base vaciada por completo (TRUNCATE de datos, esquema intacto) para empezar con datos reales. Ojo: `npm run test:db` exige el seed (`npm run db:seed -- --force`); sin seed las pruebas fallan por falta de datos demo.
- Sin contraseñas por diseño: el ingreso es con enlace al correo (Brevo), Google (Fase 9) o `/dev-login` en local. No se guardó ni se pide ninguna contraseña.

## Ingreso con confirmación (2026-10-05, pedido del usuario)
- El enlace mágico directo (GET de Auth.js) se gastaba al pre-abrirlo el antivirus/Outlook → familia confundida. Nuevo flujo: el correo lleva a `/verificar?token=` (página pública informativa, abrirla NO consume) y solo el botón "Entrar al árbol" (POST `magic-token` Credentials) consume el token de un solo uso y crea la sesión. Verificado: 2 GET no gastan, 1 POST sí.
- Token de 64 hex, 60 minutos de vida, auto-crea usuario miembro. Invitación y límite (5/hora) igual que antes, en `requestMagicLink`.
- `authorizeMagicToken` vive en lib pura (testeable sin next-auth); `options.js` solo la envuelve.
- Formulario mínimo `/persona/nueva` (crear + avisar duplicados + vincular padres) y `POST /api/branches` para poder cargar datos reales sin curl. La edición completa de fichas por UI queda pendiente.
- El mapa incluye co-padres (padres de los incluidos aunque no sean pareja del foco): sin esto, Juleisys no se veía al navegar desde Mateo. Reportado por el usuario con datos reales.
- Las parejas se alinean en la misma generación (la más profunda): sin esto, Juleisys quedaba en la fila de la suegra por no tener padres registrados. Con unión + alineación quedan lado a lado.
- **Todo = todo de verdad** (pedido del usuario): el botón cargaba solo la ventana del foco y parecía que faltaba gente. Ahora `Todo` pide la ventana completa (up/down 30), la encuadra y limpia focos/filtros. Además: botón "Centrar aquí" en el popup para re-enfocar y explorar libremente, bandas "Generación N" con líneas guía, y atenuados más visibles (0.45/0.35) para que no parezcan borrados.
## Evidencia para Fase 9 (2026-10-04)
- `npm run test:db` en paralelo agotó las conexiones del rol (`too many connections for role "family_tree_app"`): la base tiene un tope bajo por rol. Los tests ahora corren secuenciales (`--test-concurrency=1`), pero en Vercel hará falta pooler (PgBouncer) o `PG_POOL_MAX` bajo por función. Confirmar con el proveedor antes del despliegue.
