-- 002_core_schema.sql — Modelo completo Fase 1 (ver promt.md §MODELO DE DATOS).
-- Convención: toda tabla lleva id uuid, created_at, created_by (nullable: seeds/bootstrap
-- sin usuario) y deleted_at (borrado lógico), salvo change_log (usa user_id) y las
-- tablas de enlace (PK compuesta + created_at/created_by, sin deleted_at: el historial
-- vive en change_log). Ver DECISIONS.md.

-- ============ branches ============
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  deleted_at TIMESTAMPTZ,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4F86C6'
    CONSTRAINT branches_color_hex CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  founder_person_id UUID -- FK a persons se agrega al final (dependencia circular)
);
CREATE INDEX branches_founder_idx ON branches (founder_person_id);

-- ============ persons ============
CREATE TABLE persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  deleted_at TIMESTAMPTZ,
  given_names TEXT NOT NULL,
  paternal_surname TEXT,
  maternal_surname TEXT,
  nickname TEXT,
  birth_surname TEXT,
  gender TEXT, -- informativo, sin constraint
  birth_date DATE,
  birth_date_precision TEXT
    CONSTRAINT persons_birth_prec CHECK (birth_date_precision IN ('day','month','year','decade','approximate')),
  birth_place TEXT,
  death_date DATE,
  death_date_precision TEXT
    CONSTRAINT persons_death_prec CHECK (death_date_precision IN ('day','month','year','decade','approximate')),
  death_place TEXT,
  is_living BOOLEAN NOT NULL DEFAULT TRUE,
  branch_id UUID REFERENCES branches (id) ON DELETE SET NULL,
  cover_photo_id UUID, -- FK a photos se agrega al final (dependencia circular)
  bio_short TEXT,
  full_name_normalized TEXT NOT NULL DEFAULT ''
);
CREATE INDEX persons_branch_idx ON persons (branch_id);
CREATE INDEX persons_cover_photo_idx ON persons (cover_photo_id);
-- Trigram para búsqueda y duplicados (índice mínimo exigido).
CREATE INDEX persons_name_trgm_idx ON persons USING gin (full_name_normalized gin_trgm_ops);

-- Normalización automática: minúsculas + sin tildes + espacios simples.
CREATE OR REPLACE FUNCTION persons_set_normalized() RETURNS trigger AS $$
BEGIN
  NEW.full_name_normalized := lower(unaccent(
    coalesce(NEW.given_names, '') || ' ' ||
    coalesce(NEW.paternal_surname, '') || ' ' ||
    coalesce(NEW.maternal_surname, '') || ' ' ||
    coalesce(NEW.nickname, '') || ' ' ||
    coalesce(NEW.birth_surname, '')
  ));
  NEW.full_name_normalized := regexp_replace(trim(NEW.full_name_normalized), '\s+', ' ', 'g');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER persons_normalized_trg
  BEFORE INSERT OR UPDATE OF given_names, paternal_surname, maternal_surname, nickname, birth_surname
  ON persons FOR EACH ROW EXECUTE FUNCTION persons_set_normalized();

-- ============ parent_links ============
CREATE TABLE parent_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  deleted_at TIMESTAMPTZ,
  parent_id UUID NOT NULL REFERENCES persons (id) ON DELETE RESTRICT,
  child_id UUID NOT NULL REFERENCES persons (id) ON DELETE RESTRICT,
  kind TEXT NOT NULL DEFAULT 'biological'
    CONSTRAINT parent_links_kind CHECK (kind IN ('biological','adoptive','foster','step')),
  certainty TEXT NOT NULL DEFAULT 'confirmed'
    CONSTRAINT parent_links_certainty CHECK (certainty IN ('confirmed','unconfirmed')),
  CONSTRAINT parent_links_no_self CHECK (parent_id <> child_id),
  CONSTRAINT parent_links_pair_unique UNIQUE (parent_id, child_id)
);
CREATE INDEX parent_links_parent_idx ON parent_links (parent_id);
CREATE INDEX parent_links_child_idx ON parent_links (child_id);

-- ============ unions ============
CREATE TABLE unions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  deleted_at TIMESTAMPTZ,
  person_a_id UUID NOT NULL REFERENCES persons (id) ON DELETE RESTRICT,
  person_b_id UUID NOT NULL REFERENCES persons (id) ON DELETE RESTRICT,
  kind TEXT NOT NULL DEFAULT 'marriage'
    CONSTRAINT unions_kind CHECK (kind IN ('marriage','free_union','partnership')),
  start_date DATE,
  start_date_precision TEXT
    CONSTRAINT unions_start_prec CHECK (start_date_precision IN ('day','month','year','decade','approximate')),
  end_date DATE,
  end_date_precision TEXT
    CONSTRAINT unions_end_prec CHECK (end_date_precision IN ('day','month','year','decade','approximate')),
  end_reason TEXT
    CONSTRAINT unions_end_reason CHECK (end_reason IN ('divorce','widowed','separation')),
  CONSTRAINT unions_no_self CHECK (person_a_id <> person_b_id)
  -- Sin UNIQUE de pareja: se permiten varias uniones entre las mismas personas
  -- a lo largo del tiempo (divorcio + reconciliación) y cada persona puede tener
  -- varias uniones (segundos matrimonios).
);
CREATE INDEX unions_person_a_idx ON unions (person_a_id);
CREATE INDEX unions_person_b_idx ON unions (person_b_id);

-- ============ stories + mentions ============
CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  deleted_at TIMESTAMPTZ,
  person_id UUID NOT NULL REFERENCES persons (id) ON DELETE RESTRICT,
  author_user_id UUID, -- FK a users se agrega al final (users se crea después)
  title TEXT,
  body TEXT NOT NULL,
  story_date DATE,
  story_date_precision TEXT
    CONSTRAINT stories_date_prec CHECK (story_date_precision IN ('day','month','year','decade','approximate')),
  certainty TEXT NOT NULL DEFAULT 'confirmed'
    CONSTRAINT stories_certainty CHECK (certainty IN ('confirmed','unconfirmed'))
);
CREATE INDEX stories_person_idx ON stories (person_id);

CREATE TABLE story_mentions (
  story_id UUID NOT NULL REFERENCES stories (id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  PRIMARY KEY (story_id, person_id)
);
CREATE INDEX story_mentions_person_idx ON story_mentions (person_id);

-- ============ facts ============
CREATE TABLE facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  deleted_at TIMESTAMPTZ,
  person_id UUID NOT NULL REFERENCES persons (id) ON DELETE RESTRICT,
  type TEXT NOT NULL
    CONSTRAINT facts_type CHECK (type IN ('occupation','residence','origin','anecdote','other')),
  value TEXT NOT NULL,
  certainty TEXT NOT NULL DEFAULT 'confirmed'
    CONSTRAINT facts_certainty CHECK (certainty IN ('confirmed','unconfirmed')),
  source TEXT -- texto libre: "me lo contó la tía Rosa", "acta de nacimiento"
);
CREATE INDEX facts_person_idx ON facts (person_id);

-- ============ photos + tags ============
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  deleted_at TIMESTAMPTZ,
  storage_key_original TEXT NOT NULL,
  storage_key_medium TEXT,
  storage_key_thumb TEXT,
  uploaded_by UUID, -- usuario que subió (sin FK dura: bootstrap/seed sin usuarios)
  caption TEXT,
  photo_date DATE,
  width INTEGER CONSTRAINT photos_width_pos CHECK (width IS NULL OR width > 0),
  height INTEGER CONSTRAINT photos_height_pos CHECK (height IS NULL OR height > 0),
  size_bytes BIGINT CONSTRAINT photos_size_pos CHECK (size_bytes IS NULL OR size_bytes >= 0)
);

CREATE TABLE photo_tags (
  photo_id UUID NOT NULL REFERENCES photos (id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  PRIMARY KEY (photo_id, person_id)
);
CREATE INDEX photo_tags_person_idx ON photo_tags (person_id);
CREATE INDEX photo_tags_photo_idx ON photo_tags (photo_id);

-- La portada es una foto de la galería marcada en persons.cover_photo_id.
ALTER TABLE persons
  ADD CONSTRAINT persons_cover_photo_fk FOREIGN KEY (cover_photo_id)
  REFERENCES photos (id) ON DELETE SET NULL;

-- ============ users (app; tablas Auth.js en Fase 2) ============
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  deleted_at TIMESTAMPTZ,
  email TEXT NOT NULL CONSTRAINT users_email_unique UNIQUE,
  name TEXT,
  person_id UUID REFERENCES persons (id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'member'
    CONSTRAINT users_role CHECK (role IN ('admin','member')),
  last_login_at TIMESTAMPTZ
);
CREATE INDEX users_person_idx ON users (person_id);

-- FKs que esperaban a users.
ALTER TABLE stories
  ADD CONSTRAINT stories_author_fk FOREIGN KEY (author_user_id)
  REFERENCES users (id) ON DELETE SET NULL;
CREATE INDEX stories_author_idx ON stories (author_user_id);

ALTER TABLE branches
  ADD CONSTRAINT branches_founder_fk FOREIGN KEY (founder_person_id)
  REFERENCES persons (id) ON DELETE SET NULL;

-- ============ invites ============
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  deleted_at TIMESTAMPTZ,
  code TEXT NOT NULL CONSTRAINT invites_code_unique UNIQUE,
  invited_by UUID REFERENCES users (id) ON DELETE SET NULL,
  target_person_id UUID REFERENCES persons (id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  used_by UUID REFERENCES users (id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ
);
CREATE INDEX invites_target_person_idx ON invites (target_person_id);

-- ============ change_log (auditoría + deshacer) ============
-- Excepción a la convención: usa user_id + created_at (sin created_by/deleted_at).
-- Cada escritura de la app registra aquí DENTRO de la misma transacción (Fase 3).
CREATE TABLE change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL
    CONSTRAINT change_log_action CHECK (action IN ('create','update','delete','merge','restore')),
  before JSONB,
  after JSONB,
  user_id UUID REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX change_log_entity_idx ON change_log (entity_type, entity_id);
CREATE INDEX change_log_user_idx ON change_log (user_id);

-- ============ merge_candidates ============
CREATE TABLE merge_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  deleted_at TIMESTAMPTZ,
  person_a_id UUID NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
  person_b_id UUID NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
  score REAL NOT NULL DEFAULT 0
    CONSTRAINT merge_candidates_score CHECK (score >= 0 AND score <= 1),
  status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT merge_candidates_status CHECK (status IN ('pending','merged','dismissed')),
  CONSTRAINT merge_candidates_no_self CHECK (person_a_id <> person_b_id)
);
CREATE INDEX merge_candidates_status_idx ON merge_candidates (status);
