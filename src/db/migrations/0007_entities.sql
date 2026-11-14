# 0007_entities.sql — master data of visit target entities (B2G/B2B).

-- up

CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    segment TEXT NOT NULL CHECK (segment IN ('B2G', 'B2B')),
    region TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT(
        strftime ('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_name_type ON entities (name, type);

CREATE INDEX IF NOT EXISTS idx_entities_segment ON entities (segment);

-- down
DROP TABLE IF EXISTS entities;
DROP INDEX IF EXISTS idx_entities_name_type;
DROP INDEX IF EXISTS idx_entities_segment;
