-- Tabelas usadas pelo migration-runner (checkpoints, erros, runs).
-- Execute contra o banco PostgreSQL antes de rodar as migrações.
--
-- Uso: psql "$POSTGRES_URL" -f scripts/create-migration-tables.sql

CREATE SCHEMA IF NOT EXISTS migration;

CREATE TABLE IF NOT EXISTS migration.migration_checkpoints (
  entity         text PRIMARY KEY,
  checkpoint_type text NOT NULL,
  checkpoint_value text NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration.migration_runs (
  id          bigserial PRIMARY KEY,
  mode        text NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status      text NOT NULL DEFAULT 'running',
  notes       text
);

CREATE TABLE IF NOT EXISTS migration.migration_errors (
  id         bigserial PRIMARY KEY,
  run_id     bigint,
  entity     text NOT NULL,
  source_pk  text,
  error      text NOT NULL,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
