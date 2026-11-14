# 0008_activities.sql — visit plans/history against an entity, plus the sales name.

-- up

CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    segment TEXT NOT NULL CHECK (segment IN ('B2G', 'B2B')),
    visit_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'NOT_VISITED' CHECK (
        status IN ('NOT_VISITED', 'VISITED')
    ),
    sales_name TEXT NOT NULL,
    created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT(
        strftime ('%Y-%m-%dT%H:%M:%fZ', 'now')
    ),
    updated_at TEXT NOT NULL DEFAULT(
        strftime ('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
);

CREATE INDEX IF NOT EXISTS idx_activities_entity_id ON activities (entity_id);

CREATE INDEX IF NOT EXISTS idx_activities_status ON activities (status);

CREATE INDEX IF NOT EXISTS idx_activities_segment ON activities (segment);

CREATE INDEX IF NOT EXISTS idx_activities_visit_date ON activities (visit_date);

-- down
DROP TABLE IF EXISTS activities;
DROP INDEX IF EXISTS idx_activities_entity_id;
DROP INDEX IF EXISTS idx_activities_status;
DROP INDEX IF EXISTS idx_activities_segment;
DROP INDEX IF EXISTS idx_activities_visit_date;
