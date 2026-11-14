/**
 * `bun run db:seed:visit-flow` — seed fictitious master-data entities and
 * sample visit activities for the Visit Flow prototype.
 *
 * Idempotent: if entities already exist, entity seeding is skipped and
 * existing rows are looked up by (name, type) for activity seeding; if
 * activities already exist, activity seeding is skipped entirely.
 */
import { randomUUIDv7 as id } from "bun";
import { countActivities, insertActivity } from "../src/server/repo/activity";
import {
  countEntities,
  insertEntity,
  listEntities,
} from "../src/server/repo/entity";
import { findUserByEmail } from "../src/server/repo/user";
import type { Segment } from "../src/shared/types";

interface SeedEntity {
  name: string;
  type: string;
  segment: Segment;
  region: string;
}

// Fictitious data — no resemblance to real MabelHub customers intended.
const ENTITIES: SeedEntity[] = [
  { name: "Kantor Layanan Melati", type: "Instansi", segment: "B2G", region: "Bandung" },
  { name: "Dinas Perhubungan Kota Cempaka", type: "Instansi", segment: "B2G", region: "Bandung" },
  { name: "Kecamatan Sukamaju", type: "Instansi", segment: "B2G", region: "Jakarta" },
  { name: "Puskesmas Anggrek", type: "Instansi", segment: "B2G", region: "Bandung" },
  { name: "Toko Sinar Jaya", type: "Perusahaan", segment: "B2B", region: "Jakarta" },
  { name: "PT Nusantara Teknologi Mandiri", type: "Perusahaan", segment: "B2B", region: "Surabaya" },
  { name: "CV Berkah Abadi", type: "Perusahaan", segment: "B2B", region: "Semarang" },
  // Same name as the B2G office above, disambiguated by `type` only —
  // exercises the "no duplicate names, use type to distinguish" rule.
  { name: "Melati", type: "Perusahaan", segment: "B2B", region: "Bandung" },
];

const SALES_NAMES = ["Dewi Anggraini", "Budi Santoso", "Rina Marlina"] as const;

/** YYYY-MM-DD, `days` from today (negative = past, for VISITED seeds). */
const dateDaysFromNow = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

// 1. Entities — insert once, then always resolve the full set by name+type
//    so activity seeding below has ids regardless of whether this run
//    inserted them or found them already present.
if ((countEntities.get()?.n ?? 0) === 0) {
  for (const e of ENTITIES) insertEntity.get(id(), e.name, e.type, e.segment, e.region);
  console.log(`Seeded ${ENTITIES.length} entities.`);
} else {
  console.log("Entities already seeded, skipping entity insert.");
}

const allEntities = listEntities.all(null, null, null, null);
const entityId = (name: string, type: string) =>
  allEntities.find((e) => e.name === name && e.type === type)?.id;

// 2. Activities — skip entirely if any already exist (idempotent re-run).
const activityTotal = countActivities.get(
  null, null, null, null, null, null, null, null, null, null,
)?.n ?? 0;

if (activityTotal > 0) {
  console.log("Activities already seeded, skipping activity insert.");
  process.exit(0);
}

const demoUser = findUserByEmail.get("demo@example.com");
if (!demoUser) {
  console.log(
    'No demo user found — run "bun run db:seed" first if you want activities ' +
      "attributed to a user (createdBy will be null otherwise).",
  );
}

const plan: Array<{
  entity: string;
  type: string;
  segment: Segment;
  visitDate: string;
  salesName: (typeof SALES_NAMES)[number];
}> = [
  { entity: "Kantor Layanan Melati", type: "Instansi", segment: "B2G", visitDate: dateDaysFromNow(-10), salesName: "Dewi Anggraini" },
  { entity: "Dinas Perhubungan Kota Cempaka", type: "Instansi", segment: "B2G", visitDate: dateDaysFromNow(-3), salesName: "Budi Santoso" },
  { entity: "Puskesmas Anggrek", type: "Instansi", segment: "B2G", visitDate: dateDaysFromNow(-20), salesName: "Dewi Anggraini" },
  { entity: "Kecamatan Sukamaju", type: "Instansi", segment: "B2G", visitDate: dateDaysFromNow(1), salesName: "Budi Santoso" },
  { entity: "Toko Sinar Jaya", type: "Perusahaan", segment: "B2B", visitDate: dateDaysFromNow(2), salesName: "Rina Marlina" },
  { entity: "PT Nusantara Teknologi Mandiri", type: "Perusahaan", segment: "B2B", visitDate: dateDaysFromNow(5), salesName: "Dewi Anggraini" },
  { entity: "CV Berkah Abadi", type: "Perusahaan", segment: "B2B", visitDate: dateDaysFromNow(7), salesName: "Rina Marlina" },
  { entity: "Melati", type: "Perusahaan", segment: "B2B", visitDate: dateDaysFromNow(-1), salesName: "Budi Santoso" },
];

let inserted = 0;
for (const p of plan) {
  const eid = entityId(p.entity, p.type);
  if (!eid) {
    console.warn(`Skipping activity, entity not found: ${p.entity} (${p.type})`);
    continue;
  }
  insertActivity.get(id(), eid, p.segment, p.visitDate, p.salesName, demoUser?.id ?? null);
  inserted += 1;
}

console.log(`Seeded ${inserted} activities (all NOT_VISITED by default).`);
console.log(
  "Tip: use the UI or `PATCH /api/activities/:id` to mark some entries VISITED.",
);
