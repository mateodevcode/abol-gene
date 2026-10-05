# ROL

Eres un ingeniero full-stack senior. Vas a construir de principio a fin una aplicación web llamada "Árbol Genealógico Familiar" (nombre provisional). Trabaja de forma autónoma, por fases, verificando cada fase antes de pasar a la siguiente. Responde y comenta en español; el código y los nombres de variables, tablas y archivos en inglés.

# PRIMERA ACCIÓN OBLIGATORIA

Antes de escribir código, pídeme la cadena de conexión de PostgreSQL (DATABASE_URL). Es la única credencial que necesitas al inicio. No avances hasta tenerla. Guárdala solo en `.env.local` (que debe estar en `.gitignore`). Nunca la imprimas en logs, commits ni en respuestas. Las credenciales de AWS, correo, Google y Vercel se piden más adelante, en la Fase 9, no ahora.

# QUÉ ES LA APLICACIÓN

Un árbol genealógico privado, vivo e interactivo, que funciona como memoria colectiva de mi familia. Cada persona del árbol tiene un perfil al que cualquier familiar registrado puede aportar historias, fotos y datos. No hay mensajes ni chats; la interacción gira alrededor de las personas. No hay moderación ni aprobaciones: la responsabilidad viene de la atribución (cada aporte queda firmado con autor y fecha, por ejemplo "Emanuel: recuerdo..."). La familia es de confianza.

Meta de largo plazo: que el árbol crezca hacia atrás sin límite (tatarabuelos y más allá) y que cualquier familiar agregue información, creando ramas nuevas.

# PRINCIPIOS NO NEGOCIABLES

1. Privado: nadie entra sin invitación.
2. Atribución: todo contenido guarda autor y fecha.
3. Nada se borra de verdad: borrado lógico (`deleted_at`) y todo cambio queda en `change_log` con posibilidad de deshacer.
4. Una sola fuente de datos: el modo Interactivo y el modo Datos leen lo mismo; solo cambia la presentación.
5. Las relaciones derivadas (hermanos, medios hermanos, tíos, primos, parentesco) se CALCULAN, no se guardan.
6. El dibujo, el layout y la cámara del mapa son capas independientes.
7. El navegador nunca habla directo con la base de datos; todo pasa por el servidor, que valida sesión y permisos.
8. Diseño responsive pensando primero en celular. Sin PWA.

# STACK (obligatorio, no sustituir)

- Next.js (App Router) + React + JavaScript. NO usar TypeScript. Usa JSDoc donde ayude a documentar.
- Tailwind CSS.
- Motion (paquete `motion`, antes framer-motion) para animaciones de interfaz: popups, paneles, tarjetas.
- d3-zoom (y d3-selection) para la cámara del mapa: arrastre, pellizco, rueda, zoom animado a una familia.
- Algoritmo de layout propio (función pura), apoyado en utilidades de d3 si conviene.
- Dibujo: SVG para ramas y conexiones, HTML para tarjetas, con nivel de detalle según el zoom.
- TanStack Query (datos del servidor y caché por ramas) + Zustand (estado de interfaz).
- Backend: Route Handlers y Server Actions del mismo proyecto Next.js.
- PostgreSQL con la librería `pg` y SQL directo (sin ORM). Migraciones SQL versionadas en `/db/migrations`, con un script propio para ejecutarlas (`npm run db:migrate`) y otro de datos de ejemplo (`npm run db:seed`).
- Extensiones de Postgres: `pg_trgm` (y `unaccent` si está disponible; si no, normaliza en la aplicación). Si mi base no permite crear extensiones, avísame y propón alternativa.
- Autenticación: Auth.js (NextAuth) con enlace mágico por correo y Google, más códigos de invitación.
- Fotos: AWS S3 (bucket privado) con URLs prefirmadas.
- Correo: AWS SES.
- Hosting: Vercel.

# ESTRATEGIA LOCAL PRIMERO

Las fases 1 a 8 deben funcionar 100% en local (`npm run dev`) usando solo mi Postgres. Para lograrlo, crea adaptadores con la misma interfaz que luego se cambian por los reales:

- Almacenamiento de fotos: interfaz `storage` con un driver `local` (guarda en `/.local-uploads`, fuera de git, servido solo a usuarios con sesión) y un driver `s3`. Se elige con la variable `STORAGE_DRIVER=local|s3`.
- Correo: interfaz `mailer` con un driver `console` (imprime el enlace mágico en la terminal) y un driver `ses`. Se elige con `MAIL_DRIVER=console|ses`.
- Login de desarrollo: en local, el enlace mágico se imprime en consola y además existe una página `/dev-login` (solo si `NODE_ENV !== production`) para entrar rápido con un usuario de prueba.
- Google OAuth se deja desactivado hasta la Fase 9.

# MODELO DE DATOS

Todas las tablas llevan `id` (uuid), `created_at`, `created_by` y `deleted_at` (borrado lógico), salvo que se indique otra cosa. Escribe las migraciones con índices adecuados.

**branches**: `name`, `color` (hex), `founder_person_id` (nullable). Paleta predefinida con buen contraste para asignar colores automáticamente.

**persons**
- Nombres: `given_names`, `paternal_surname`, `maternal_surname`, `nickname`, `birth_surname` (opcional).
- `gender` (opcional, informativo).
- Nacimiento y fallecimiento: `birth_date`, `birth_date_precision`, `birth_place`, `death_date`, `death_date_precision`, `death_place`. Precisión: `day | month | year | decade | approximate`. Esto permite "hacia 1880".
- `is_living` (boolean), `branch_id`, `cover_photo_id` (apunta a una foto de la galería), `bio_short`.
- `full_name_normalized` (sin tildes, minúsculas) con índice trigram para búsqueda y duplicados.

**parent_links**: `parent_id`, `child_id`, `kind` (`biological | adoptive | foster | step`), `certainty` (`confirmed | unconfirmed`). Una persona puede tener más de dos padres. Restricción única por (parent_id, child_id). Impedir que alguien sea padre de sí mismo.

**unions**: `person_a_id`, `person_b_id`, `kind` (`marriage | free_union | partnership`), `start_date` + precisión, `end_date` + precisión, `end_reason` (`divorce | widowed | separation | null`). Soporta varias uniones por persona, segundos matrimonios y parejas del mismo sexo.

**stories**: `person_id`, `author_user_id`, `title`, `body`, `story_date` + precisión (para la línea de vida), `certainty`. **story_mentions**: `story_id`, `person_id`.

**facts**: `person_id`, `type` (oficio, residencia, origen, anécdota corta, otro), `value`, `certainty` (`confirmed | unconfirmed`), `source` (texto libre).

**photos**: `storage_key_original`, `storage_key_medium`, `storage_key_thumb`, `uploaded_by`, `caption`, `photo_date`, `width`, `height`, `size_bytes`. **photo_tags**: `photo_id`, `person_id` (una foto puede tener muchas personas). La portada es una foto de la galería marcada en `persons.cover_photo_id`, no un dato aparte.

**users**: `email` (único), `name`, `person_id` (nullable, vincula al usuario con su persona del árbol), `role` (`admin | member`), `last_login_at`. Más las tablas que requiera Auth.js.

**invites**: `code` (único), `invited_by`, `target_person_id` (opcional), `expires_at`, `used_by`, `used_at`.

**change_log**: `entity_type`, `entity_id`, `action` (`create | update | delete | merge | restore`), `before` (jsonb), `after` (jsonb), `user_id`, `created_at`. Cada escritura de la aplicación registra su cambio aquí DENTRO de la misma transacción.

**merge_candidates**: `person_a_id`, `person_b_id`, `score`, `status` (`pending | merged | dismissed`).

Índices mínimos: `parent_links(parent_id)`, `parent_links(child_id)`, `unions(person_a_id)`, `unions(person_b_id)`, trigram sobre `persons.full_name_normalized`, `stories(person_id)`, `photo_tags(person_id)`.

# CONSULTAS CLAVE (en SQL, con CTE recursivas)

Implementa cada una como función en `/lib/db` con pruebas:
- Árbol alrededor de una persona: N generaciones hacia arriba y M hacia abajo, incluyendo parejas y hermanos.
- Descendencia de X: agrupada por hijo y por generación, con conteo total ("43 descendientes en 4 generaciones").
- Ascendencia de X: hasta donde llegue el árbol.
- Camino y parentesco entre dos personas: ancestro común más cercano y etiqueta en español ("tu bisabuelo por parte de tu madre", "primo segundo", "medio hermano"). Vive en `/lib/kinship` como función pura con pruebas.
- Hermanos y medios hermanos (comparten uno o dos padres), tíos y primos.
- Duplicados: similitud de nombre (`pg_trgm`) + cercanía de fechas + padres en común.
- Estadísticas: total de personas, número de generaciones, rama más numerosa, familiar más longevo, cumpleaños del mes, ramas con más huecos por completar.

**Protección contra ciclos:** todas las consultas recursivas llevan control de ciclos, y el servidor RECHAZA cualquier relación que haga a alguien su propio ancestro, con un mensaje claro en español.

# AUTENTICACIÓN Y PERMISOS

- Entrada solo por invitación: un admin genera un enlace/código (opcionalmente ligado a una persona del árbol, caducidad configurable, un solo uso). El invitado se registra con enlace mágico o Google y queda vinculado a su persona (o elige "soy esta persona" entre las existentes).
- El primer usuario del sistema (bootstrap) se crea con un script `npm run create-admin -- correo@ejemplo.com`.
- Todas las rutas del servidor exigen sesión, salvo el canje de invitación.
- Roles: `member` puede ver todo, agregar y editar personas, historias, fotos y datos, borrar (lógico) y deshacer sus propios cambios, y proponer fusiones. `admin` además deshace cualquier cambio, aprueba fusiones, gestiona usuarios y roles e invita. Quién puede invitar es configurable (por defecto solo admin).
- Límite de intentos en el enlace mágico.

# FRONTEND

**Pantallas:** (1) Mapa interactivo, (2) Modo Datos / ficha de persona, (3) Perfil de persona (portada, galería, historias, hechos, línea de vida), (4) Estadísticas, (5) Invitar familiares, (6) Duplicados por revisar (admin), (7) Historial de cambios con deshacer.

**Botón fijo Interactivo ↔ Datos.** Desde una ficha, "ver en el árbol" lleva al mapa con la cámara centrada en esa persona, y viceversa.

**Capas del mapa (mantenlas separadas en código):**
1. Datos: TanStack Query pide y cachea ramas. Carga parcial: solo lo visible y lo que se expande.
2. Layout: función pura en `/lib/tree-layout`. Recibe personas, uniones y vínculos; devuelve coordenadas. No dibuja. Debe manejar parejas, segundos matrimonios, familias de 12 hermanos o más, medios hermanos, huecos por ancestros faltantes y ramas que se cruzan. Pruébala con familias de ejemplo complejas.
3. Cámara: d3-zoom con pan, pellizco, rueda y "zoom a esta familia" animado.
4. Dibujo: SVG para conexiones, HTML para tarjetas. Solo se dibuja lo que está dentro de la pantalla.
5. Animación de interfaz: Motion.

**Nivel de detalle según zoom:** lejos = puntos de color y apellidos por familia; medio = nombres y foto pequeña (o iniciales); cerca = tarjetas completas con fechas. Debe fluir bien con al menos 2.000 personas de prueba (genera datos sintéticos para verificarlo).

**Interacciones:**
- Arrastrar para moverse; pellizco o rueda para zoom; scroll horizontal natural en generaciones numerosas.
- Un toque en un núcleo familiar (pareja + hijos): la cámara se acerca, lo centra y atenúa el resto.
- Doble clic o doble toque en una persona: popup animado con nombres y resumen, con acceso a su perfil.
- Colores por rama; los hijos de dos ramas muestran ambos colores (franja doble o degradado).
- "Camino hasta mí": al tocar a alguien se ilumina la ruta hasta mi persona y se explica el parentesco.
- Vista por generación: filtro para ver solo una generación (por ejemplo, todos los primos).
- Minimapa en una esquina.
- Ramas incompletas visibles como huecos clicables que invitan a completar al ancestro faltante.
- Cumpleaños y aniversarios próximos resaltados con suavidad.
- Sin foto: círculo con las iniciales y el color de la rama, generado en el cliente.

**Modo Datos:** ficha navegable con padres, hermanos, medios hermanos, pareja(s), hijos, abuelos, tíos, primos, fechas, historias y fotos, todo con enlaces para saltar de persona en persona. Botones "Ver descendencia" (agrupada por hijo y generación, con contador) y "Ver ascendencia".

**Perfil:** foto de portada (la que se ve en el árbol), galería con todas las fotos (cada una con autor, fecha y personas etiquetadas), historias firmadas, hechos con certeza y fuente, y línea de vida ordenada por año. Al agregar una persona, buscar primero por nombre similar y avisar de posibles duplicados antes de crear.

**Estilo visual:** moderno, limpio, cálido, adecuado para familiares mayores (texto legible, botones grandes, contraste alto). Todo en español.

# ESTRUCTURA DEL PROYECTO

/app (rutas App Router: (auth), (main)/arbol, (main)/persona/[id], (main)/estadisticas, /api)
/components (tree, person, ui)
/lib (db, tree-layout, kinship, storage, mailer, auth)
/db/migrations
/scripts (migrate, seed, create-admin)
/store (Zustand)

# FASES (ejecútalas en orden; al terminar cada una, ejecuta las pruebas, muéstrame un resumen corto y continúa salvo que necesites algo de mí)

**Fase 0 – Preparación.** Pídeme DATABASE_URL. Verifica la conexión y las extensiones disponibles. Crea el proyecto Next.js (JavaScript), Tailwind, ESLint, estructura de carpetas, `.env.example` (sin valores reales), `.gitignore` correcto y README con instrucciones.

**Fase 1 – Base de datos.** Migraciones de todo el modelo, script de migración, seed con una familia de ejemplo realista (mínimo 5 generaciones, una familia de 12 hermanos, un segundo matrimonio, medios hermanos, una adopción, una pareja del mismo sexo, fechas aproximadas, personas sin foto) y un generador de datos sintéticos de 2.000+ personas.

**Fase 2 – Autenticación e invitaciones.** Auth.js con enlace mágico (driver `console`), `/dev-login`, `create-admin`, invitaciones, vinculación usuario-persona, protección de rutas y roles.

**Fase 3 – Personas y relaciones.** CRUD de personas, vínculos padre/hijo, uniones, búsqueda y aviso de duplicados, protección contra ciclos, `change_log` en cada escritura.

**Fase 4 – Consultas y parentesco.** Todas las consultas recursivas y `/lib/kinship`, con pruebas automáticas.

**Fase 5 – Modo Datos.** Ficha, descendencia, ascendencia y navegación entre personas.

**Fase 6 – Mapa interactivo.** Layout puro con pruebas, cámara, nivel de detalle, colores por rama (y mezcla), popup, enfoque por familia, carga parcial, rendimiento con 2.000+ personas.

**Fase 7 – Contenido.** Historias, hechos, galería de fotos con el driver `local` (miniatura, mediana y original generadas en el navegador antes de subir), etiquetado, portada, iniciales, línea de vida.

**Fase 8 – Extras y administración.** Camino hasta mí, vista por generación, minimapa, huecos visibles, cumpleaños próximos, estadísticas, pantalla de duplicados y fusión (con historial), pantalla de historial con deshacer.

**Fase 9 – Producción (aquí me pides las credenciales).** Pídeme, en este orden y solo ahora: credenciales de AWS (access key, secret, región, nombre del bucket S3, remitente verificado de SES), credenciales de Google OAuth (client id y secret) y dominio. Luego: cambia `STORAGE_DRIVER=s3` y `MAIL_DRIVER=ses`, configura el bucket como privado con CORS para subida directa y versionado activado, habilita Google en Auth.js, y prepara el despliegue en Vercel (variables de entorno, instrucciones paso a paso, vistas previas). Nota para Vercel + Postgres: confirma conmigo que mi base acepta conexiones externas y tiene pooler (PgBouncer) o limita el pool por función para evitar saturarla. Documenta respaldos recomendados (copia periódica de Postgres + versionado de S3).

# CRITERIOS DE ACEPTACIÓN

- `npm run dev` levanta todo en local con solo DATABASE_URL.
- Puedo iniciar sesión, invitar a alguien, agregar una persona con padres e hijos, ver el árbol y la ficha, subir una foto, escribir una historia y verla firmada.
- El mapa se mantiene fluido con 2.000+ personas y funciona bien en celular con gestos táctiles.
- Intentar crear un ciclo de ancestros falla con un mensaje claro.
- Borrar algo lo oculta pero se puede deshacer desde el historial.
- Las pruebas de layout, parentesco, ciclos y consultas recursivas pasan.
- Ningún secreto queda en el repositorio.

# REGLAS DE TRABAJO

- No cambies el stack ni agregues TypeScript.
- Pregúntame solo cuando algo te bloquee de verdad; si hay una decisión menor, elige la opción más simple, anótala en `DECISIONS.md` y sigue.
- Escribe pruebas para la lógica crítica (layout, kinship, ciclos, consultas recursivas, permisos).
- Haz commits pequeños y claros por fase.
- Al terminar cada fase, dime exactamente cómo probarla.
- Mantén el README actualizado con cómo correr, migrar, sembrar y desplegar.

Empieza ahora por la Fase 0 pidiéndome DATABASE_URL.