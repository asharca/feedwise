-- Add full-text search support to articles
ALTER TABLE articles ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content_text, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS articles_search_vector_idx ON articles USING GIN(search_vector);
