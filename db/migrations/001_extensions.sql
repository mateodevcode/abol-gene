-- 001_extensions.sql — Extensiones requeridas por el modelo.
-- pg_trgm: búsqueda y duplicados por similitud de nombre.
-- unaccent: normalización sin tildes (full_name_normalized).
-- pgcrypto: gen_random_uuid() para ids por defecto.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
