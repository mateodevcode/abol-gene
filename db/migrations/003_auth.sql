-- 003_auth.sql — Tablas Auth.js (NextAuth v4) + límite de intentos de enlace mágico.
-- Estrategia de sesión: JWT (el middleware corre en el edge y no puede usar `pg`);
-- estas tablas las usa el adapter en Node (usuarios, cuentas OAuth futuras, tokens).

-- La tabla app `users` ya existe (Fase 1); se agregan columnas del adapter.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS image TEXT;

-- Cuentas OAuth (Google se activa en Fase 9; tabla lista desde ahora).
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  CONSTRAINT accounts_provider_unique UNIQUE (provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS accounts_user_idx ON accounts (user_id);

-- Tokens de verificación del enlace mágico (un solo uso, corta vida).
CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  CONSTRAINT verification_tokens_pkey PRIMARY KEY (identifier, token)
);

-- Límite de intentos de enlace mágico: 5 por correo y hora (ver DECISIONS.md).
CREATE TABLE IF NOT EXISTS magic_link_attempts (
  email TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  invite_code TEXT, -- última invitación usada al pedir el enlace (canje en /bienvenida)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
