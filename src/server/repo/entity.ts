import { db } from "../../db";
import type { Segment } from "../../shared/types";

export interface EntityRow {
  id: string;
  name: string;
  type: string;
  segment: Segment;
  region: string;
  createdAt: string;
}

export const insertEntity = db.query<
  { id: string },
  [string, string, string, Segment, string]
>(
  `INSERT INTO entities (id, name, type, segment, region) VALUES (?, ?, ?, ?, ?) RETURNING id`,
);

export const findEntityById = db.query<EntityRow, [string]>(
  `SELECT id, name, type, segment, region, created_at AS createdAt FROM entities WHERE id = ?`,
);

/** Master-data entity options, optionally filtered by segment/search. */
export const listEntities = db.query<
  EntityRow,
  [Segment | null, Segment | null, string | null, string | null]
>(
  `SELECT id, name, type, segment, region, created_at AS createdAt
   FROM entities
   WHERE (?1 IS NULL OR segment = ?2)
     AND (?3 IS NULL OR name LIKE '%' || ?4 || '%' COLLATE NOCASE)
   ORDER BY name ASC`,
);

/** Fallback entity options derived from visit history (activities joined
 *  to entities), for when master data has no relevant choice. Deduplicated
 *  by (name, type) via GROUP BY. */
export const listEntitiesFromHistory = db.query<
  EntityRow,
  [Segment | null, Segment | null, string | null, string | null]
>(
  `SELECT e.id, e.name, e.type, e.segment, e.region, MIN(e.created_at) AS createdAt
   FROM activities a
   JOIN entities e ON e.id = a.entity_id
   WHERE (?1 IS NULL OR a.segment = ?2)
     AND (?3 IS NULL OR e.name LIKE '%' || ?4 || '%' COLLATE NOCASE)
   GROUP BY e.name, e.type
   ORDER BY e.name ASC`,
);

export const countEntities = db.query<{ n: number }, []>(
  `SELECT COUNT(*) AS n FROM entities`,
);
