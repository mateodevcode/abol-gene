# Árbol Genealógico Familiar: Arquitectura v1

Documento de arquitectura, sin código. Autor: Emanuel · 4 de octubre de 2026

## 1. Visión

Un árbol genealógico privado, vivo e interactivo, que funciona como memoria colectiva de la familia. Cada persona tiene un perfil al que cualquier familiar registrado puede aportar historias, fotos y datos. No hay mensajes ni chats: la interacción gira alrededor de las personas. Todo aporte queda firmado con su autor ("Emanuel: recuerdo..."), y esa atribución reemplaza a la moderación.

**Principios**

- Privado: solo entra quien tiene invitación.
- Confianza + atribución: sin aprobaciones, todo contenido guarda autor y fecha.
- Nada se borra de verdad: todo queda en historial y se puede deshacer.
- Los datos son una sola fuente; las vistas (mapa y datos) solo los presentan distinto.
- El árbol crece sin límite hacia atrás (tatarabuelos y más).

## 2. Alcance de la v1

- Árbol interactivo tipo mapa (pan, zoom, enfoque por familia, colores por rama).
- Modo Datos: ficha completa con padres, hermanos, pareja(s), hijos, abuelos, tíos, primos, descendencia y ascendencia.
- Perfil por persona: foto de portada, galería, historias, hechos con fuente y certeza, línea de vida.
- Iniciales con color de rama cuando no hay foto.
- Estadísticas familiares.
- Invitaciones por enlace o código, vinculación de usuario con su persona en el árbol.
- Detección y fusión de duplicados.
- Historial de cambios con deshacer.
- Sin PWA: se accede desde el navegador, con diseño responsive pensado primero para celular.

**Fuera de la v1:** PWA, notificaciones, mensajes, app nativa, importación de GEDCOM (se puede evaluar después).

## 3. Stack definido

| Capa | Tecnología |
| --- | --- |
| Frontend | Next.js + React + JavaScript |
| Estilos | Tailwind CSS |
| Animaciones de interfaz | Motion (popups, paneles, tarjetas) |
| Cámara del mapa | d3-zoom (arrastre, pellizco, rueda, zoom a familia) |
| Layout del árbol | Algoritmo propio con apoyo de d3 |
| Dibujo | SVG + HTML con nivel de detalle por zoom |
| Estado y caché | TanStack Query + Zustand |
| Backend | Next.js (Route Handlers y Server Actions), mismo proyecto |
| Base de datos | PostgreSQL existente (se crea la DB, el esquema y las credenciales) |
| Acceso a datos | Librería `pg` con SQL directo y migraciones versionadas |
| Autenticación | Auth.js (enlace mágico por correo y Google) + códigos de invitación |
| Correo | AWS SES (para enlaces mágicos) |
| Fotos | AWS S3 (bucket privado) |
| Hosting | Vercel |

**Por qué cambia el backend respecto a la propuesta anterior.** Al no usar Supabase, desaparecen la autenticación y el almacenamiento "incluidos". Las reemplazamos por Auth.js, SES y S3, que encajan en Next.js y aprovechan las credenciales de AWS que ya tienes.

**Por qué SQL directo y no un ORM.** Las consultas clave (ascendencia, descendencia, parentesco, estadísticas) son consultas recursivas de Postgres. Escribirlas en SQL es más claro y más rápido que forzarlas dentro de un ORM.

## 4. Arquitectura general

El sistema son tres piezas y una regla: **el navegador nunca habla directo con la base de datos**.

1. **Navegador (Next.js en el cliente):** dibuja el mapa, la ficha y los popups. Pide datos por ramas y los guarda en caché.
2. **Servidor (Next.js en Vercel):** valida sesión y permisos, ejecuta las consultas a Postgres y firma las URLs de S3.
3. **Servicios:** Postgres (datos), S3 (fotos), SES (correos).

**Flujo de lectura del árbol:** el cliente pide "el árbol alrededor de la persona X, con N generaciones hacia arriba y M hacia abajo". El servidor ejecuta una consulta recursiva y devuelve personas y relaciones. El cliente calcula el layout y lo dibuja. Al navegar o hacer zoom a una rama no cargada, pide solo esa rama.

**Flujo de escritura:** el cliente envía una acción (agregar persona, historia, foto). El servidor valida, escribe en la tabla correspondiente y registra el cambio en el historial, todo en una sola transacción.

**Punto de atención con Vercel + Postgres.** Vercel ejecuta funciones sin servidor, que abren muchas conexiones cortas. Hay que confirmar dos cosas de tu base de datos: que acepte conexiones desde Vercel (no solo desde IPs fijas) y que tenga un pooler de conexiones (por ejemplo PgBouncer) o que limitemos el pool por función. Si no, la base puede saturarse.

## 5. Modelo de datos

Todas las tablas llevan `id`, `created_at`, `created_by` y `deleted_at` (borrado lógico), salvo que se indique otra cosa.

### 5.1 Personas y relaciones

**persons**

- Nombres: nombres, apellido paterno, apellido materno, apodo, apellido de soltera (opcional).
- Sexo o género (opcional, solo informativo).
- Nacimiento y fallecimiento: cada uno con fecha, **precisión** (día, mes, año, década, aproximado) y lugar. Esto permite "hacia 1880".
- `is_living`: vivo o fallecido (controla qué datos sensibles se muestran).
- `cover_photo_id`: referencia a una foto de la galería.
- `branch_id`: rama a la que pertenece (ver sección 8).
- `bio_short`: texto breve opcional.

**parent\_links** (padre o madre → hijo)

- `parent_id`, `child_id`
- `kind`: biológico, adoptivo, crianza, padrastro/madrastra
- `certainty`: confirmado, dato familiar sin confirmar
- Se permiten más de dos padres por persona; no se asume una estructura rígida.

**unions** (parejas)

- `person_a_id`, `person_b_id`
- `kind`: matrimonio, unión libre, pareja
- `start_date`, `end_date` (con precisión), `end_reason` (divorcio, viudez, separación)
- Soporta varias uniones por persona, segundos matrimonios y parejas del mismo sexo.

Con estas tres tablas se derivan hermanos, medios hermanos, tíos, primos y cualquier parentesco: **no se guardan, se calculan**.

### 5.2 Contenido aportado

**stories** (historias)

- `person_id` (sobre quién es), `author_user_id`, `title`, `body`, `story_date` (opcional, para la línea de vida), `certainty`.
- Una historia puede mencionar a otras personas (`story_mentions`).

**facts** (datos)

- `person_id`, `type` (oficio, lugar de residencia, origen, anécdota corta, etc.), `value`, `certainty` (confirmado o sin confirmar), `source` (texto libre: "me lo contó la tía Rosa", "acta de nacimiento").

**photos**

- `s3_key_original`, `s3_key_medium`, `s3_key_thumb`, `uploaded_by`, `caption`, `photo_date`, tamaño y dimensiones.
- `photo_tags`: qué personas aparecen en la foto (una foto puede tener muchas personas y viceversa).
- La portada de una persona es solo una foto marcada como principal, no un dato aparte.

### 5.3 Usuarios, invitaciones y confianza

**users**: correo, nombre, `person_id` (la persona del árbol que es él o ella), `role` (admin o miembro), último acceso.

**invites**: código, quién invitó, a qué persona del árbol se vincula (opcional), caducidad, usado o no.

No todas las personas del árbol son usuarios (abuelos fallecidos, niños). Por eso `persons` y `users` son tablas distintas, unidas por `users.person_id`.

### 5.4 Historial y duplicados

**change\_log**: tabla de auditoría con `entity_type`, `entity_id`, `action` (crear, editar, borrar, fusionar), `before` y `after` en JSON, `user_id`, fecha. Es la base del "deshacer".

**merge\_candidates**: pares de personas que el sistema sospecha duplicadas, con puntuación de similitud y estado (pendiente, fusionadas, descartadas).

### 5.5 Índices importantes

- `parent_links(parent_id)` y `parent_links(child_id)`: indispensables para las consultas recursivas.
- `unions(person_a_id)` y `unions(person_b_id)`.
- `persons` con índice trigram (`pg_trgm`) sobre el nombre completo, para búsqueda y detección de duplicados.
- `stories(person_id)`, `photo_tags(person_id)`.

## 6. Consultas clave (resueltas en Postgres)

| Necesidad | Cómo se resuelve |
| --- | --- |
| Ver el árbol alrededor de X | Consulta recursiva hacia arriba (padres) y hacia abajo (hijos), con límite de generaciones |
| Ver descendencia de X | Recursiva hacia abajo, agrupada por hijo y por generación, con conteo |
| Ver ascendencia de X | Recursiva hacia arriba hasta donde llegue el árbol |
| Camino y parentesco hasta mí | Búsqueda del ancestro común más cercano entre dos personas; con el camino se genera la etiqueta ("tu bisabuelo por parte de tu madre") |
| Hermanos y medios hermanos | Personas que comparten uno o dos padres |
| Tíos y primos | Hermanos de los padres y sus hijos |
| Duplicados | Similitud de nombre (`pg_trgm`) más cercanía de fechas y de padres |
| Estadísticas | Agregaciones: total de personas, generaciones, rama más numerosa, más longevo, cumpleaños del mes, ramas con huecos |

**Protección contra ciclos.** Con datos aportados por muchas personas puede ocurrir un error que haga a alguien su propio ancestro. Las consultas recursivas llevan control de ciclos y el servidor rechaza agregar una relación que lo cause.

## 7. Frontend

### 7.1 Pantallas

1. **Mapa interactivo:** vista principal con el árbol.
2. **Modo Datos:** ficha navegable de una persona.
3. **Perfil de persona:** portada, galería, historias, hechos, línea de vida.
4. **Estadísticas.**
5. **Invitar familiares.**
6. **Duplicados por revisar** (solo admin al inicio).
7. **Historial de cambios.**

Un botón fijo alterna entre **Interactivo** y **Datos**. Desde una ficha, "ver en el árbol" lleva al mapa con la cámara centrada en esa persona, y al revés.

### 7.2 Capas del mapa

Separar estas capas es la decisión de fondo de la arquitectura:

1. **Datos:** TanStack Query pide y cachea ramas.
2. **Layout:** función pura que recibe personas y relaciones y devuelve coordenadas. No dibuja nada. Maneja parejas, segundos matrimonios, familias numerosas y huecos.
3. **Cámara:** d3-zoom controla pan y zoom; calcula "zoom a esta familia".
4. **Dibujo:** SVG para ramas y conexiones, HTML para tarjetas.
5. **Animación de interfaz:** Motion para popups, paneles y transiciones.

Cada capa se puede cambiar sin tocar las demás.

### 7.3 Nivel de detalle según el zoom

| Zoom | Qué se ve |
| --- | --- |
| Lejos | Puntos de color y apellidos por familia |
| Medio | Nombres y fotos pequeñas (o iniciales) |
| Cerca | Tarjetas completas con fechas |

Solo se dibuja lo que está dentro de la pantalla. Esto es lo que permite que aguante cientos o miles de personas.

### 7.4 Interacciones

- Arrastrar para moverse; pellizco o rueda para zoom; scroll horizontal natural en generaciones numerosas.
- Un toque en un núcleo familiar: la cámara se acerca, lo centra y atenúa el resto.
- Doble clic o doble toque en una persona: popup con nombres y resumen, con acceso a su perfil.
- Colores por rama; los hijos de dos ramas muestran ambos colores.
- "Camino hasta mí": ilumina la ruta y explica el parentesco.
- Vista por generación: filtrar para ver solo una generación.
- Minimapa en una esquina.
- Ramas incompletas visibles como huecos que invitan a completarlas.
- Cumpleaños y aniversarios próximos resaltados con suavidad.
- Sin foto: círculo con iniciales y el color de la rama (se genera en el cliente).

### 7.5 Estado

- **TanStack Query:** datos del servidor (ramas, perfiles, estadísticas) con caché.
- **Zustand:** estado de la interfaz (persona seleccionada, modo, zoom actual, filtros).

## 8. Colores por linaje

- Cada **rama** (`branches`) tiene un color propio. Una rama se define por el linaje de un ancestro fundador (por ejemplo, la familia del abuelo paterno).
- Cada persona hereda la rama de su línea de origen.
- Cuando alguien une dos ramas por matrimonio, sus hijos muestran una mezcla de ambos colores (degradado o franja doble).
- Paleta de colores definida de antemano, con buen contraste, para que no queden colores parecidos entre ramas vecinas.
- Los colores se asignan al crear la rama; se pueden cambiar después.

## 9. Fotos con AWS S3

- **Bucket privado.** Nada es público; es una familia, no una galería abierta.
- **Subida directa desde el navegador** con URL prefirmada que genera el servidor. Así se evita el límite de tamaño de las funciones de Vercel.
- **Tres tamaños por foto:** miniatura (mapa), mediana (perfil) y original (detalle). Para la v1 el navegador genera los tres antes de subir, sin necesitar infraestructura extra.
- **Lectura con URLs firmadas** de corta duración, pedidas por el servidor solo a usuarios con sesión.
- **Claves ordenadas** por persona o foto, por ejemplo `photos/{photo_id}/thumb.jpg`.
- **Evolución futura:** CloudFront delante de S3 para mayor velocidad, si hace falta.
- La subida valida tipo de archivo y tamaño máximo.

## 10. Autenticación y permisos

**Cómo entra la gente**

1. Un admin (tú) genera un enlace o código de invitación, opcionalmente ligado a una persona del árbol.
2. El familiar abre el enlace y se registra con **enlace mágico por correo** o **Google**. Sin contraseñas.
3. Queda vinculado a su persona en el árbol (o elige "soy esta persona" entre las existentes).

**Roles**

| Acción | Miembro | Admin |
| --- | --- | --- |
| Ver todo el árbol | Sí | Sí |
| Agregar personas, historias, fotos, datos | Sí | Sí |
| Editar y corregir cualquier dato | Sí | Sí |
| Borrar (borrado lógico) | Sí | Sí |
| Deshacer cambios | Propios | Todos |
| Fusionar duplicados | Proponer | Aprobar |
| Invitar familiares | Opcional (configurable) | Sí |
| Gestionar usuarios y roles | No | Sí |

**Familiares vivos.** Para personas con `is_living = true`, se puede ocultar fecha exacta de nacimiento o datos sensibles a quien no sea de la familia cercana. Queda como decisión pendiente (sección 14).

**Seguridad básica**

- Todas las rutas del servidor exigen sesión.
- Los códigos de invitación caducan y son de un solo uso.
- Límite de intentos para evitar abuso del enlace mágico.
- Las credenciales (base de datos, AWS) viven solo en variables de entorno de Vercel, nunca en el código.

## 11. API (rutas del servidor)

Agrupadas por tema; todas requieren sesión salvo el registro por invitación.

- **Árbol:** obtener árbol alrededor de una persona; obtener una rama; descendencia; ascendencia; camino y parentesco entre dos personas.
- **Personas:** crear, ver ficha completa, editar, borrar lógico, buscar por nombre.
- **Relaciones:** agregar y editar vínculo padre/hijo; agregar y editar unión.
- **Contenido:** crear, editar y borrar historias y datos; listar por persona.
- **Fotos:** pedir URL de subida; confirmar subida; etiquetar personas; marcar como portada; listar galería.
- **Estadísticas:** resumen familiar.
- **Duplicados:** listar candidatos; proponer, aprobar o descartar fusión.
- **Historial:** listar cambios; deshacer un cambio.
- **Invitaciones y usuarios:** crear invitación; canjear invitación; vincular usuario con persona.

## 12. Estructura del proyecto

```
/app                 páginas y rutas (App Router de Next.js)
  /(auth)            ingreso e invitación
  /(main)/arbol      mapa interactivo
  /(main)/persona/[id]   perfil y modo Datos
  /(main)/estadisticas
  /api               rutas del servidor
/components
  /tree              mapa, tarjetas, minimapa, controles de cámara
  /person            perfil, galería, historias, línea de vida
  /ui                botones, popups, avatares con iniciales
/lib
  /db                conexión, consultas SQL por tema
  /tree-layout       algoritmo de layout (función pura)
  /kinship           cálculo de parentesco
  /s3                firma de URLs
  /auth              configuración de Auth.js
/db/migrations       migraciones SQL versionadas
/store               Zustand
```

## 13. Despliegue y entornos

- **Vercel:** despliegue automático desde el repositorio. Una rama principal para producción y vistas previas para pruebas.
- **Base de datos:** una base de producción y otra de desarrollo (o un esquema separado), para no probar sobre datos reales.
- **Variables de entorno:** cadena de conexión a Postgres, credenciales y bucket de AWS, región, secreto de Auth.js, credenciales de Google, remitente de SES.
- **Migraciones:** se ejecutan con un comando controlado, no automáticamente en cada despliegue.
- **Respaldos:** copia periódica de la base y versionado activado en el bucket S3. Es el patrimonio de la familia; perderlo no es opción.

## 14. Decisiones pendientes

1. **Conexión Postgres desde Vercel:** ¿la base acepta conexiones externas y tiene pooler?
2. **Dominio:** ¿usarás un dominio propio?
3. **Nombre de la aplicación.**
4. **Privacidad de personas vivas:** ¿se muestran todos los datos a toda la familia, o se oculta algo (por ejemplo, fecha exacta de nacimiento)?
5. **Quién puede invitar:** solo tú, o cualquier miembro.
6. **Idioma:** ¿solo español o preparado para más idiomas?
7. **Formato de apellidos:** el modelo contempla dos apellidos (paterno y materno); confirmar que aplica a toda la familia.

## 15. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Layout complejo con familias numerosas y segundos matrimonios | Layout como función pura e independiente, con pruebas con familias de ejemplo |
| Duplicados al crecer hacia atrás | Búsqueda por similitud al agregar y fusión con historial |
| Conexiones a Postgres desde funciones sin servidor | Pooler o límite de conexiones por función |
| Datos erróneos o incompletos de generaciones antiguas | Campo de certeza y fuente en cada dato |
| Pérdida de datos | Borrado lógico, historial, respaldos de Postgres y versionado de S3 |
| Rendimiento del mapa con miles de personas | Nivel de detalle por zoom, dibujar solo lo visible, carga por ramas |

## 16. Plan por etapas

1. **Base:** proyecto Next.js, esquema de Postgres y migraciones, autenticación e invitaciones.
2. **Personas y relaciones:** crear personas, vínculos padre/hijo y uniones, con protección contra ciclos.
3. **Modo Datos:** ficha con padres, hermanos, hijos, parejas, descendencia y ascendencia.
4. **Mapa interactivo:** layout, cámara, nivel de detalle, colores por rama, popup.
5. **Contenido:** historias, hechos, galería de fotos con S3, portada e iniciales.
6. **Extras de navegación:** camino hasta mí, vista por generación, minimapa, huecos visibles.
7. **Estadísticas, duplicados e historial con deshacer.**
8. **Pulido y lanzamiento a la familia.**

Sugerencia: probar con tu familia cercana desde la etapa 4, antes de terminar el resto, para ajustar la experiencia del mapa con uso real.
