-- Custom migration: drizzle-kit does not create extensions.
-- On Supabase, pgvector can also be enabled under Database → Extensions.
CREATE EXTENSION IF NOT EXISTS vector;
