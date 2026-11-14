import { db } from "../../db";
import type { Segment, VisitStatus } from "../../shared/types";

export interface ActivityRow {
  id: string;
  entityId: string;
  entityName: string;
  entityType: string;
  segment: Segment;
  region: string;
  visitDate: string;
  status: VisitStatus;
  salesName: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const ACTIVITY_SELECT = `
  SELECT
    a.id,
    a.entity_id AS entityId,
    e.name AS entityName,
    e.type AS entityType,
    a.segment,
    e.region,
    a.visit_date AS visitDate,
    a.status,
    a.sales_name AS salesName,
    a.created_by AS createdBy,
    a.created_at AS createdAt,
    a.updated_at AS updatedAt
  FROM activities a
  JOIN entities e ON e.id = a.entity_id
`;

export const insertActivity = db.query<
  { id: string },
  [string, string, Segment, string, string, string | null]
>(
  `INSERT INTO activities (id, entity_id, segment, visit_date, sales_name, created_by)
   VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
);

export const findActivityById = db.query<ActivityRow, [string]>(
  `${ACTIVITY_SELECT} WHERE a.id = ?`,
);

/** List activities filtered by segment/status/date range/entity-name
 *  search. Every filter is applied in SQL (not post-fetch in JS), and
 *  combinable: a NULL-bound placeholder is a no-op for that clause. */
export const listActivities = db.query<
  ActivityRow,
  [
    Segment | null,
    Segment | null,
    VisitStatus | null,
    VisitStatus | null,
    string | null,
    string | null,
    string | null,
    string | null,
    string | null,
    string | null,
    number,
    number,
  ]
>(
  `${ACTIVITY_SELECT}
   WHERE (?1 IS NULL OR a.segment = ?2)
     AND (?3 IS NULL OR a.status = ?4)
     AND (?5 IS NULL OR a.visit_date >= ?6)
     AND (?7 IS NULL OR a.visit_date <= ?8)
     AND (?9 IS NULL OR e.name LIKE '%' || ?10 || '%' COLLATE NOCASE)
   ORDER BY a.visit_date DESC, a.created_at DESC
   LIMIT ?11 OFFSET ?12`,
);

/** Same WHERE clause as listActivities (minus paging) — kept
 *  parameter-identical so meta.total always matches the list it counts. */
export const countActivities = db.query<
  { n: number },
  [
    Segment | null,
    Segment | null,
    VisitStatus | null,
    VisitStatus | null,
    string | null,
    string | null,
    string | null,
    string | null,
    string | null,
    string | null,
  ]
>(
  `SELECT COUNT(*) AS n
   FROM activities a
   JOIN entities e ON e.id = a.entity_id
   WHERE (?1 IS NULL OR a.segment = ?2)
     AND (?3 IS NULL OR a.status = ?4)
     AND (?5 IS NULL OR a.visit_date >= ?6)
     AND (?7 IS NULL OR a.visit_date <= ?8)
     AND (?9 IS NULL OR e.name LIKE '%' || ?10 || '%' COLLATE NOCASE)`,
);

export const updateActivityStatus = db.query<null, [VisitStatus, string]>(
  `UPDATE activities
   SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = ?`,
);
