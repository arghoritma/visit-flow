/**
 * Visit activities at /visits (page) and /api/activities (JSON):
 *
 *   GET   /visits                 → Inertia page: list + filters UI
 *   GET   /api/activities         → filtered/paginated list (JSON)
 *   POST  /api/activities         → create a visit plan
 *   PATCH /api/activities/:id     → update visit status
 *
 * All /api/activities* routes require a logged-in session (requireAuth) —
 * they cannot be reached by manipulating the URL without a valid cookie.
 * These are internal fetch targets for the Visits page, not a public JSON
 * API, so an unauthenticated request gets the same redirect-to-login
 * `requireAuth` gives page routes (not a 401 JSON contract).
 *
 * Filters (`segment`, `status`, `from`, `to`, `search`) are applied in the
 * SQL WHERE clause (see repo/activity.ts) — never filtered client-side —
 * and are combinable. `meta.total` is computed from the same WHERE clause
 * as the list, so count and rows never disagree.
 */
import { Type as t, type Static } from "@sinclair/typebox";
import { randomUUIDv7 as id } from "bun";
import { Hono } from "hono";
import { requireAuth } from "../services/auth";
import { noStore } from "../middlewares/cache";
import {
  countActivities,
  findActivityById,
  insertActivity,
  listActivities,
  updateActivityStatus,
  type ActivityRow,
} from "../../server/repo/activity";
import { findEntityById } from "../../server/repo/entity";
import type { AppEnv } from "../middlewares/inertia-middleware";
import type { Activity, Paginated, Segment, VisitStatus } from "../../shared/types";
import { validateJson } from "../utils/validation";

const SEGMENTS = ["B2G", "B2B"] as const;
const STATUSES = ["NOT_VISITED", "VISITED"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const createBody = t.Object(
  {
    entityId: t.String({ minLength: 1 }),
    segment: t.Union(SEGMENTS.map((s) => t.Literal(s))),
    visitDate: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    salesName: t.String({ minLength: 2, maxLength: 80 }),
  },
  { additionalProperties: false },
);

const patchBody = t.Object(
  { status: t.Union(STATUSES.map((s) => t.Literal(s))) },
  { additionalProperties: false },
);

type CreateBody = Static<typeof createBody>;
type PatchBody = Static<typeof patchBody>;

/** Field messages for the create form (merged into VALIDATION_MESSAGES in app.ts). */
export const ACTIVITY_VALIDATION_MESSAGES: Record<string, string> = {
  "/entityId": "Choose an entity to visit.",
  "/segment": "Segment must be B2G or B2B.",
  "/visitDate": "Enter a valid visit date (YYYY-MM-DD).",
  "/salesName": "Sales name must be at least 2 characters.",
  "/status": "Status must be NOT_VISITED or VISITED.",
};

const toActivity = (row: ActivityRow): Activity => ({
  id: row.id,
  entityId: row.entityId,
  entityName: row.entityName,
  entityType: row.entityType,
  segment: row.segment,
  region: row.region,
  visitDate: row.visitDate,
  status: row.status,
  salesName: row.salesName,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const asSegment = (v: string | undefined): Segment | null =>
  v === "B2G" || v === "B2B" ? v : null;

const asStatus = (v: string | undefined): VisitStatus | null =>
  v === "NOT_VISITED" || v === "VISITED" ? v : null;

const asDate = (v: string | undefined): string | null =>
  v && DATE_RE.test(v) ? v : null;

interface ActivityFilters {
  segment: Segment | null;
  status: VisitStatus | null;
  from: string | null;
  to: string | null;
  search: string | null;
}

function parseFilters(c: { req: { query: (k: string) => string | undefined } }): ActivityFilters {
  const search = c.req.query("search")?.trim();
  return {
    segment: asSegment(c.req.query("segment")),
    status: asStatus(c.req.query("status")),
    from: asDate(c.req.query("from")),
    to: asDate(c.req.query("to")),
    search: search && search.length > 0 ? search : null,
  };
}

function queryActivities(
  filters: ActivityFilters,
  page: number,
  perPage: number,
): Paginated<Activity> {
  const { segment, status, from, to, search } = filters;
  const total =
    countActivities.get(
      segment,
      segment,
      status,
      status,
      from,
      from,
      to,
      to,
      search,
      search,
    )?.n ?? 0;

  const rows = listActivities.all(
    segment,
    segment,
    status,
    status,
    from,
    from,
    to,
    to,
    search,
    search,
    perPage,
    (page - 1) * perPage,
  );

  return {
    data: rows.map(toActivity),
    meta: {
      currentPage: page,
      perPage,
      lastPage: Math.max(1, Math.ceil(total / perPage)),
      total,
    },
  };
}

export const activitiesRoutes = () => {
  const app = new Hono<AppEnv>();

  // Inertia page: list + filters UI. Initial data is server-rendered from
  // the same query the JSON endpoint uses, so the first paint already
  // reflects the URL's filters (shareable/bookmarkable).
  app.get("/visits", requireAuth, (c) => {
    const filters = parseFilters(c);
    const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
    const perPage = Math.min(
      100,
      Math.max(1, Number(c.req.query("perPage") ?? 20) || 20),
    );
    const activities = queryActivities(filters, page, perPage);
    return c.var.inertia.render("Visits", {
      activities,
      filters,
    });
  });

  app.get("/api/activities", requireAuth, noStore, (c) => {
    const filters = parseFilters(c);
    const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
    const perPage = Math.min(
      100,
      Math.max(1, Number(c.req.query("perPage") ?? 20) || 20),
    );
    return c.json(queryActivities(filters, page, perPage));
  });

  app.post(
    "/api/activities",
    requireAuth,
    noStore,
    validateJson(createBody),
    (c) => {
      const body = c.req.valid("json") as CreateBody;
      const entity = findEntityById.get(body.entityId);
      if (!entity) {
        return c.json({ errors: { entityId: "Entity not found." } }, 422);
      }

      const activityId = id();
      insertActivity.get(
        activityId,
        body.entityId,
        body.segment,
        body.visitDate,
        body.salesName,
        c.var.user?.id ?? null,
      );
      const row = findActivityById.get(activityId);
      if (!row) return c.json({ error: "Failed to create activity." }, 500);
      return c.json(toActivity(row), 201);
    },
  );

  app.patch(
    "/api/activities/:id",
    requireAuth,
    noStore,
    validateJson(patchBody),
    (c) => {
      const activityId = c.req.param("id");
      const existing = findActivityById.get(activityId);
      if (!existing) return c.json({ error: "Activity not found." }, 404);

      const body = c.req.valid("json") as PatchBody;
      updateActivityStatus.run(body.status, activityId);
      const row = findActivityById.get(activityId);
      if (!row) return c.json({ error: "Activity not found." }, 404);
      return c.json(toActivity(row), 200);
    },
  );

  return app;
};
