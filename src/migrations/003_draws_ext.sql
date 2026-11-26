-- Phase 2 extension: add path and review_note to draws
ALTER TABLE draws ADD COLUMN IF NOT EXISTS path        TEXT;
ALTER TABLE draws ADD COLUMN IF NOT EXISTS review_note TEXT;
