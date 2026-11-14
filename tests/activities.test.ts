/**
 * Business-rule tests for Visit Flow: /api/activities (filter combinations,
 * meta.total consistency, create validation, status toggle) and
 * /api/entities (master-data search, history fallback, dedup by name+type).
 * Boots the full app against an in-memory database, same pattern as
 * tests/app.test.ts. Run with: bun test --isolate.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

let app: Awaited<ReturnType<(typeof import("../src/server/app"))["createApp"]>>;

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.APP_URL = "http://localhost:3000";
  process.env.API_PORT = "4001";
  process.env.RATE_LIMIT_AUTH_MAX = "1000";
  const { buildClientAssets } = await import("../src/server/services/assets");
  await buildClientAssets();
  process.env.RATE_LIMIT_GLOBAL_MAX = "10000";
  const { createApp } = await import("../src/server/app");
  app = createApp({ version: "test-version", js: "app.js", css: "app.css" });
});

afterAll(async () => {
  const { db } = await import("../src/db");
  db.close();
});

const BASE = "http://localhost:3000";

interface CallOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  cookie?: string;
}

async function call(path: string, options: CallOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.cookie) headers.set("cookie", options.cookie);
  let body: string | undefined;
  if (options.body) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }
  return app.request(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });
}

const xhr = { "x-inertia": "true" };

function allSetCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  return typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [res.headers.get("set-cookie") ?? ""].filter(Boolean);
}

function sessionCookie(res: Response): string {
  const cookie = allSetCookies(res).find((c) => c.startsWith("session="));
  return cookie ? cookie.split(";")[0]! : "";
}

async function registerUser(email: string, password = "password123"): Promise<string> {
  const res = await call("/register", {
    method: "POST",
    headers: xhr,
    body: { name: "Test Sales", email, password },
  });
  expect(res.status).toBe(303);
  const cookie = sessionCookie(res);
  expect(cookie).not.toBe("");
  return cookie;
}

/** Insert an entity directly via the repo (bypasses the API, for fixtures). */
async function seedEntity(
  name: string,
  type: string,
  segment: "B2G" | "B2B",
  region = "Jakarta",
): Promise<string> {
  const { insertEntity } = await import("../src/server/repo/entity");
  const { randomUUIDv7: id } = await import("bun");
  const entityId = id();
  insertEntity.get(entityId, name, type, segment, region);
  return entityId;
}

/** Create an activity via the real API (exercises create validation too). */
async function createActivity(
  cookie: string,
  overrides: {
    entityId: string;
    segment: "B2G" | "B2B";
    visitDate: string;
    salesName?: string;
  },
): Promise<Response> {
  return call("/api/activities", {
    method: "POST",
    cookie,
    body: {
      entityId: overrides.entityId,
      segment: overrides.segment,
      visitDate: overrides.visitDate,
      salesName: overrides.salesName ?? "Rina Marlina",
    },
  });
}

describe("POST /api/activities — create validation", () => {
  it("requires a logged-in session (redirects to /login, no cookie)", async () => {
    const res = await call("/api/activities", {
      method: "POST",
      body: { entityId: "x", segment: "B2B", visitDate: "2026-12-01", salesName: "AB" },
    });
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("rejects a missing entityId with a friendly field error", async () => {
    const cookie = await registerUser("create-missing-entity@example.com");
    const res = await call("/api/activities", {
      method: "POST",
      cookie,
      body: { segment: "B2B", visitDate: "2026-12-01", salesName: "Rina Marlina" },
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors.entityId).toBe("Choose an entity to visit.");
  });

  it("rejects an invalid segment", async () => {
    const cookie = await registerUser("create-bad-segment@example.com");
    const entityId = await seedEntity("CV Segment Test", "Perusahaan", "B2B");
    const res = await call("/api/activities", {
      method: "POST",
      cookie,
      body: {
        entityId,
        segment: "B2C",
        visitDate: "2026-12-01",
        salesName: "Rina Marlina",
      },
    });
    expect(res.status).toBe(422);
    expect((await res.json()).errors.segment).toBe("Segment must be B2G or B2B.");
  });

  it("rejects a malformed visit date", async () => {
    const cookie = await registerUser("create-bad-date@example.com");
    const entityId = await seedEntity("CV Date Test", "Perusahaan", "B2B");
    const res = await call("/api/activities", {
      method: "POST",
      cookie,
      body: {
        entityId,
        segment: "B2B",
        visitDate: "01-12-2026",
        salesName: "Rina Marlina",
      },
    });
    expect(res.status).toBe(422);
    expect((await res.json()).errors.visitDate).toBe(
      "Enter a valid visit date (YYYY-MM-DD).",
    );
  });

  it("rejects a sales name shorter than 2 characters", async () => {
    const cookie = await registerUser("create-bad-salesname@example.com");
    const entityId = await seedEntity("CV Sales Test", "Perusahaan", "B2B");
    const res = await call("/api/activities", {
      method: "POST",
      cookie,
      body: { entityId, segment: "B2B", visitDate: "2026-12-01", salesName: "A" },
    });
    expect(res.status).toBe(422);
    expect((await res.json()).errors.salesName).toBe(
      "Sales name must be at least 2 characters.",
    );
  });

  it("rejects an entityId that does not exist", async () => {
    const cookie = await registerUser("create-no-entity@example.com");
    const res = await call("/api/activities", {
      method: "POST",
      cookie,
      body: {
        entityId: "nonexistent-id",
        segment: "B2B",
        visitDate: "2026-12-01",
        salesName: "Rina Marlina",
      },
    });
    expect(res.status).toBe(422);
    expect((await res.json()).errors.entityId).toBe("Entity not found.");
  });

  it("creates a visit plan and returns it with NOT_VISITED status", async () => {
    const cookie = await registerUser("create-ok@example.com");
    const entityId = await seedEntity("PT Berhasil Jaya", "Perusahaan", "B2B", "Bandung");
    const res = await createActivity(cookie, {
      entityId,
      segment: "B2B",
      visitDate: "2026-12-15",
      salesName: "Budi Santoso",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.entityId).toBe(entityId);
    expect(body.entityName).toBe("PT Berhasil Jaya");
    expect(body.status).toBe("NOT_VISITED");
    expect(body.salesName).toBe("Budi Santoso");
    expect(body.region).toBe("Bandung");
  });
});

describe("PATCH /api/activities/:id — status toggle", () => {
  it("requires a logged-in session", async () => {
    const res = await call("/api/activities/some-id", {
      method: "PATCH",
      body: { status: "VISITED" },
    });
    expect(res.status).toBe(302);
  });

  it("toggles NOT_VISITED -> VISITED and persists it", async () => {
    const cookie = await registerUser("patch-toggle@example.com");
    const entityId = await seedEntity("Toko Patch Test", "Perusahaan", "B2B");
    const created = await createActivity(cookie, {
      entityId,
      segment: "B2B",
      visitDate: "2026-12-01",
    });
    const activity = await created.json();
    expect(activity.status).toBe("NOT_VISITED");

    const patched = await call(`/api/activities/${activity.id}`, {
      method: "PATCH",
      cookie,
      body: { status: "VISITED" },
    });
    expect(patched.status).toBe(200);
    const updated = await patched.json();
    expect(updated.status).toBe("VISITED");
    expect(updated.id).toBe(activity.id);

    // Re-fetch via the list endpoint to confirm it is actually persisted,
    // not just echoed back in the PATCH response.
    const list = await call(`/api/activities?status=VISITED`, { cookie });
    const listBody = await list.json();
    expect(listBody.data.some((a: { id: string }) => a.id === activity.id)).toBe(true);
  });

  it("rejects an invalid status value", async () => {
    const cookie = await registerUser("patch-bad-status@example.com");
    const entityId = await seedEntity("Toko Bad Status", "Perusahaan", "B2B");
    const created = await createActivity(cookie, {
      entityId,
      segment: "B2B",
      visitDate: "2026-12-01",
    });
    const activity = await created.json();

    const res = await call(`/api/activities/${activity.id}`, {
      method: "PATCH",
      cookie,
      body: { status: "MAYBE" },
    });
    expect(res.status).toBe(422);
    expect((await res.json()).errors.status).toBe(
      "Status must be NOT_VISITED or VISITED.",
    );
  });

  it("404s for an activity that does not exist", async () => {
    const cookie = await registerUser("patch-missing@example.com");
    const res = await call("/api/activities/does-not-exist", {
      method: "PATCH",
      cookie,
      body: { status: "VISITED" },
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/activities — combinable server-side filters", () => {
  it("requires a logged-in session", async () => {
    const res = await call("/api/activities");
    expect(res.status).toBe(302);
  });

  it("filters by segment and keeps meta.total consistent with data length", async () => {
    const cookie = await registerUser("filter-segment@example.com");
    const b2b = await seedEntity("CV Segment B2B", "Perusahaan", "B2B");
    const b2g = await seedEntity("Dinas Segment B2G", "Instansi", "B2G");
    await createActivity(cookie, { entityId: b2b, segment: "B2B", visitDate: "2026-12-01" });
    await createActivity(cookie, { entityId: b2g, segment: "B2G", visitDate: "2026-12-02" });

    const res = await call("/api/activities?segment=B2B", { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta.total).toBe(body.data.length);
    expect(body.data.every((a: { segment: string }) => a.segment === "B2B")).toBe(true);
    expect(body.data.some((a: { entityName: string }) => a.entityName === "CV Segment B2B")).toBe(
      true,
    );
  });

  it("filters by status", async () => {
    const cookie = await registerUser("filter-status@example.com");
    const e1 = await seedEntity("PT Status Satu", "Perusahaan", "B2B");
    const e2 = await seedEntity("PT Status Dua", "Perusahaan", "B2B");
    const c1 = await createActivity(cookie, { entityId: e1, segment: "B2B", visitDate: "2026-12-01" });
    await createActivity(cookie, { entityId: e2, segment: "B2B", visitDate: "2026-12-02" });
    const a1 = await c1.json();
    await call(`/api/activities/${a1.id}`, {
      method: "PATCH",
      cookie,
      body: { status: "VISITED" },
    });

    const visited = await call("/api/activities?status=VISITED", { cookie });
    const visitedBody = await visited.json();
    expect(visitedBody.meta.total).toBe(visitedBody.data.length);
    expect(
      visitedBody.data.every((a: { status: string }) => a.status === "VISITED"),
    ).toBe(true);

    const notVisited = await call("/api/activities?status=NOT_VISITED", { cookie });
    const notVisitedBody = await notVisited.json();
    expect(
      notVisitedBody.data.every((a: { status: string }) => a.status === "NOT_VISITED"),
    ).toBe(true);
  });

  it("applies an inclusive date range on both ends", async () => {
    const cookie = await registerUser("filter-daterange@example.com");
    const e = await seedEntity("CV Date Range", "Perusahaan", "B2B");
    await createActivity(cookie, { entityId: e, segment: "B2B", visitDate: "2026-01-10" });
    await createActivity(cookie, { entityId: e, segment: "B2B", visitDate: "2026-01-15" });
    await createActivity(cookie, { entityId: e, segment: "B2B", visitDate: "2026-01-20" });

    // Boundaries themselves must be included, not exclusive.
    const res = await call(
      "/api/activities?from=2026-01-10&to=2026-01-20",
      { cookie },
    );
    const body = await res.json();
    const dates = body.data.map((a: { visitDate: string }) => a.visitDate).sort();
    expect(dates).toEqual(["2026-01-10", "2026-01-15", "2026-01-20"]);
    expect(body.meta.total).toBe(3);

    // Narrower range excludes the boundary dates outside it.
    const narrow = await call(
      "/api/activities?from=2026-01-11&to=2026-01-19",
      { cookie },
    );
    const narrowBody = await narrow.json();
    expect(narrowBody.data.map((a: { visitDate: string }) => a.visitDate)).toEqual([
      "2026-01-15",
    ]);
    expect(narrowBody.meta.total).toBe(1);
  });

  it("filters by entity-name search (case-insensitive substring)", async () => {
    const cookie = await registerUser("filter-search@example.com");
    const melati = await seedEntity("Toko Melati Indah", "Perusahaan", "B2B");
    const other = await seedEntity("CV Lain Sama Sekali", "Perusahaan", "B2B");
    await createActivity(cookie, { entityId: melati, segment: "B2B", visitDate: "2026-12-01" });
    await createActivity(cookie, { entityId: other, segment: "B2B", visitDate: "2026-12-02" });

    const res = await call("/api/activities?search=melati", { cookie });
    const body = await res.json();
    expect(body.meta.total).toBe(1);
    expect(body.data[0].entityName).toBe("Toko Melati Indah");
  });

  it("combines segment + status + search filters together (AND, not OR)", async () => {
    const cookie = await registerUser("filter-combo@example.com");
    const match = await seedEntity("CV Kombinasi Cocok", "Perusahaan", "B2B");
    const wrongSegment = await seedEntity("Dinas Kombinasi Salah", "Instansi", "B2G");
    const c1 = await createActivity(cookie, {
      entityId: match,
      segment: "B2B",
      visitDate: "2026-12-01",
    });
    await createActivity(cookie, {
      entityId: wrongSegment,
      segment: "B2G",
      visitDate: "2026-12-02",
    });
    const a1 = await c1.json();
    await call(`/api/activities/${a1.id}`, {
      method: "PATCH",
      cookie,
      body: { status: "VISITED" },
    });

    const res = await call(
      "/api/activities?segment=B2B&status=VISITED&search=kombinasi",
      { cookie },
    );
    const body = await res.json();
    expect(body.meta.total).toBe(1);
    expect(body.data[0].entityName).toBe("CV Kombinasi Cocok");
  });

  it("paginates and keeps meta.lastPage consistent with total/perPage", async () => {
    const cookie = await registerUser("filter-paginate@example.com");
    for (let i = 0; i < 5; i++) {
      const e = await seedEntity(`PT Paginasi ${i}`, "Perusahaan", "B2B");
      await createActivity(cookie, {
        entityId: e,
        segment: "B2B",
        visitDate: `2026-06-0${i + 1}`,
      });
    }
    const res = await call(
      "/api/activities?search=Paginasi&perPage=2&page=1",
      { cookie },
    );
    const body = await res.json();
    expect(body.meta.total).toBe(5);
    expect(body.meta.perPage).toBe(2);
    expect(body.meta.lastPage).toBe(3);
    expect(body.data).toHaveLength(2);
  });
});

describe("GET /visits — Inertia page shares the same filtered query", () => {
  it("requires a logged-in session", async () => {
    const res = await call("/visits");
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("renders with activities + filters props from the URL query", async () => {
    const cookie = await registerUser("visits-page@example.com");
    const e = await seedEntity("CV Halaman Visits", "Perusahaan", "B2B");
    await createActivity(cookie, { entityId: e, segment: "B2B", visitDate: "2026-12-01" });

    const res = await call("/visits?segment=B2B", { headers: xhr, cookie });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.component).toBe("Visits");
    expect(data.props.filters.segment).toBe("B2B");
    expect(
      data.props.activities.data.some(
        (a: { entityName: string }) => a.entityName === "CV Halaman Visits",
      ),
    ).toBe(true);
  });
});

describe("GET /api/entities — master data, history fallback, dedup", () => {
  it("requires a logged-in session", async () => {
    const res = await call("/api/entities");
    expect(res.status).toBe(302);
  });

  it("returns master-data entities filtered by search", async () => {
    const cookie = await registerUser("entities-search@example.com");
    await seedEntity("Kantor Unik Satu", "Perusahaan", "B2B");
    await seedEntity("Lain Sekali", "Perusahaan", "B2B");

    const res = await call("/api/entities?search=unik", { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Kantor Unik Satu");
  });

  it("filters master-data entities by segment", async () => {
    const cookie = await registerUser("entities-segment@example.com");
    await seedEntity("PT Segment Filter B2B", "Perusahaan", "B2B");
    await seedEntity("Dinas Segment Filter B2G", "Instansi", "B2G");

    const res = await call("/api/entities?segment=B2G", { cookie });
    const body = await res.json();
    expect(body.every((e: { segment: string }) => e.segment === "B2G")).toBe(true);
    expect(body.some((e: { name: string }) => e.name === "Dinas Segment Filter B2G")).toBe(
      true,
    );
  });

  it(
    "falls back to visit history when master-data search finds nothing, " +
      "and still dedups by (name, type)",
    async () => {
      const cookie = await registerUser("entities-fallback@example.com");
      // Name/segment combination that exists only via two activities on the
      // *same* entity (never matched directly by listEntities' own filter
      // combo, since master data has no search for this name+segment pair
      // once we intentionally query a segment the entity itself isn't in —
      // instead we simulate "found only through history" by using an entity
      // whose master segment differs from the one we filter by, so the
      // master-data query (which filters on entities.segment) returns zero
      // rows and the history fallback (which filters on activities.segment)
      // picks it up instead.
      const entityId = await seedEntity("CV Riwayat Saja", "Perusahaan", "B2B");
      await createActivity(cookie, {
        entityId,
        segment: "B2G", // activity recorded under a different segment than master data
        visitDate: "2026-12-01",
      });
      await createActivity(cookie, {
        entityId,
        segment: "B2G",
        visitDate: "2026-12-05",
      });

      const res = await call("/api/entities?segment=B2G&search=riwayat", { cookie });
      expect(res.status).toBe(200);
      const body = await res.json();
      // Must appear exactly once despite two activities referencing it.
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe("CV Riwayat Saja");
    },
  );

  it("never collapses two entities that share a name but differ in type", async () => {
    const cookie = await registerUser("entities-collision@example.com");
    // Name unique to this test (the suite's DB is not reset between tests
    // in the same file, so a shared name like "Melati" would also match
    // fixtures seeded by earlier tests in this describe block).
    await seedEntity("Anggrek Kembar Unik", "Perusahaan", "B2B");
    await seedEntity("Anggrek Kembar Unik", "Instansi", "B2G");

    const res = await call("/api/entities?search=anggrek kembar unik", { cookie });
    const body = await res.json();
    expect(body).toHaveLength(2);
    const types = body.map((e: { type: string }) => e.type).sort();
    expect(types).toEqual(["Instansi", "Perusahaan"]);
  });
});
