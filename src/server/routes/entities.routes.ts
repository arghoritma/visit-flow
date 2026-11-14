/**
 * Entity options at /api/entities — used by the "add visit" form to pick
 * a target entity.
 *
 *   GET /api/entities?segment=B2G&search=melati
 *
 * Primary source is master data (`entities` table). If that combination
 * of segment+search yields no rows, entities are additionally pulled from
 * visit history (activities joined to entities) as a fallback — see
 * repo/entity.ts#listEntitiesFromHistory. Results are deduplicated by
 * (name, type) so an entity with a similar name but a different type is
 * never collapsed into one option.
 */
import { Hono } from "hono";
import { requireAuth } from "../services/auth";
import { noStore } from "../middlewares/cache";
import {
  listEntities,
  listEntitiesFromHistory,
  type EntityRow,
} from "../../server/repo/entity";
import type { AppEnv } from "../middlewares/inertia-middleware";
import type { Entity, Segment } from "../../shared/types";

const toEntity = (row: EntityRow): Entity => ({
  id: row.id,
  name: row.name,
  type: row.type,
  segment: row.segment,
  region: row.region,
  createdAt: row.createdAt,
});

const asSegment = (v: string | undefined): Segment | null =>
  v === "B2G" || v === "B2B" ? v : null;

export const entitiesRoutes = () => {
  const app = new Hono<AppEnv>();

  app.get("/api/entities", requireAuth, noStore, (c) => {
    const segment = asSegment(c.req.query("segment"));
    const rawSearch = c.req.query("search")?.trim();
    const search = rawSearch && rawSearch.length > 0 ? rawSearch : null;

    const masterRows = listEntities.all(segment, segment, search, search);

    let rows = masterRows;
    if (masterRows.length === 0) {
      rows = listEntitiesFromHistory.all(segment, segment, search, search);
    }

    // Defensive de-dup by (name, type) — master data already has a unique
    // index on this pair, but the history fallback query is a GROUP BY and
    // this keeps the contract explicit regardless of source.
    const seen = new Set<string>();
    const deduped = rows.filter((row) => {
      const key = `${row.name}\u0000${row.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return c.json(deduped.map(toEntity));
  });

  return app;
};
