-- ============================================================
-- Korin Clube — Schema Supabase
-- Execute este SQL no SQL Editor do seu projeto Supabase
-- ============================================================

-- Tabela única key-value (simples e eficiente para app single-user)
CREATE TABLE IF NOT EXISTS korin_data (
  key        TEXT PRIMARY KEY,
  value      JSONB        NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- RLS habilitado (boa prática)
ALTER TABLE korin_data ENABLE ROW LEVEL SECURITY;

-- Política aberta (app pessoal sem autenticação)
-- Se quiser restringir por usuário no futuro, troque por auth.uid()
CREATE POLICY "allow_all" ON korin_data
  FOR ALL USING (true) WITH CHECK (true);

-- Índice para performance
CREATE INDEX IF NOT EXISTS korin_data_updated_at_idx ON korin_data (updated_at DESC);
