# ERD — Visit Flow

Skema tambahan untuk fitur Visit Flow, di atas skema boilerplate yang
sudah ada (`users`, `sessions`, dll. — lihat `src/db/erd.dbml`, auto-
generated oleh `src/db/migrations.ts` dari migrasi yang ter-apply).

Tabel baru dibuat lewat migrasi bernomor baru:
`src/db/migrations/0007_entities.sql` dan
`src/db/migrations/0008_activities.sql` (nomor lanjut dari
`0006_api_tokens.sql`, pola **up/down** sesuai `AGENTS.md` §3).

## 1. Diagram (DBML)

```dbml
Table users {
  id text [pk]
  name text [not null]
  email text [unique, not null]
  role text [not null]
  // ...kolom lain dari boilerplate, lihat src/db/erd.dbml
}

Table entities {
  id text [pk, not null]
  name text [not null]
  type text [not null, note: 'e.g. Instansi, Perusahaan — pembeda saat nama serupa']
  segment text [not null, note: 'B2G | B2B']
  region text [not null]
  created_at text [not null]

  indexes {
    (name, type) [unique, name: 'idx_entities_name_type']
    segment [name: 'idx_entities_segment']
  }
}

Table activities {
  id text [pk, not null]
  entity_id text [not null]
  segment text [not null, note: 'B2G | B2B — disalin dari entity saat dibuat']
  visit_date text [not null, note: 'YYYY-MM-DD']
  status text [not null, note: 'NOT_VISITED | VISITED, default NOT_VISITED']
  sales_name text [not null, note: 'nilai tambah — nama Sales yang melakukan kunjungan']
  created_by text, note: 'users.id — siapa yang membuat rencana (opsional, untuk audit)'
  created_at text [not null]
  updated_at text [not null]

  indexes {
    entity_id [name: 'idx_activities_entity_id']
    status [name: 'idx_activities_status']
    segment [name: 'idx_activities_segment']
    visit_date [name: 'idx_activities_visit_date']
  }
}

Ref: activities.entity_id > entities.id
Ref: activities.created_by > users.id
```

## 2. Entity Relationship (ringkas)

```
users (1) ───< (0..n) activities >─── (1) entities
```

- Satu **entity** dapat memiliki banyak **activity** (riwayat kunjungan
  berulang ke entitas yang sama pada tanggal berbeda).
- Satu **activity** milik tepat satu **entity**.
- `activities.created_by` opsional menautkan ke `users.id` (siapa Sales
  yang login saat input) — dipisah dari `sales_name` (teks bebas, bisa
  diisi nama Sales lain yang sedang di lapangan, bukan hanya user login).

## 3. Definisi Kolom

### 3.1 `entities`

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | TEXT (UUIDv7) | ✅ PK | `randomUUIDv7()` seperti `users.id` |
| `name` | TEXT | ✅ | Nama entitas, mis. "Kantor Layanan Melati" |
| `type` | TEXT | ✅ | Jenis entitas, mis. "Instansi", "Perusahaan" — pembeda saat nama mirip |
| `segment` | TEXT | ✅ | `B2G` atau `B2B` (CHECK constraint) |
| `region` | TEXT | ✅ | Wilayah, mis. "Bandung" |
| `created_at` | TEXT | ✅ | ISO 8601 UTC, default `strftime('%Y-%m-%dT%H:%M:%fZ','now')` |

Index unik `(name, type)` mencegah duplikat entitas identik; entitas
dengan nama sama tapi `type` berbeda tetap diizinkan (sesuai spesifikasi
tes: "gunakan jenis entitas untuk membedakannya").

### 3.2 `activities`

| Kolom | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | TEXT (UUIDv7) | ✅ PK | |
| `entity_id` | TEXT | ✅ FK → `entities.id` | |
| `segment` | TEXT | ✅ | `B2G` \| `B2B`, disalin dari entitas saat create (memudahkan filter tanpa join, dan tetap valid historis bila segmen entitas berubah di kemudian hari) |
| `visit_date` | TEXT | ✅ | Format `YYYY-MM-DD`, dipakai untuk filter `from`/`to` |
| `status` | TEXT | ✅ | `NOT_VISITED` \| `VISITED`, default `NOT_VISITED` (CHECK constraint) |
| `sales_name` | TEXT | ✅ | Nilai tambah: nama Sales yang melakukan/menjadwalkan kunjungan |
| `created_by` | TEXT | ⬜ FK → `users.id` | User (akun login) yang membuat rencana; nullable untuk fleksibilitas seed |
| `created_at` | TEXT | ✅ | ISO 8601 UTC |
| `updated_at` | TEXT | ✅ | ISO 8601 UTC, diperbarui saat status berubah (`PATCH`) |

Index: `entity_id`, `status`, `segment`, `visit_date` — masing-masing
dipakai langsung oleh filter `GET /api/activities` (lihat `docs/PRD.md`
§5.1) agar query `WHERE` tetap sargable tanpa full scan.

## 4. Query Pola Filter (ilustrasi)

Sesuai aturan "filter harus diterapkan pada data, bukan hanya tampilan"
(`AGENTS.md`, `docs/TASK.md`), `GET /api/activities` dibangun sebagai
satu query SQL berparameter dengan klausa `WHERE` kondisional:

```sql
SELECT
  a.id, a.entity_id, e.name AS entity_name, e.type AS entity_type,
  a.segment, e.region, a.visit_date, a.status, a.sales_name, a.created_at
FROM activities a
JOIN entities e ON e.id = a.entity_id
WHERE (:segment IS NULL OR a.segment = :segment)
  AND (:status  IS NULL OR a.status  = :status)
  AND (:from    IS NULL OR a.visit_date >= :from)
  AND (:to      IS NULL OR a.visit_date <= :to)
  AND (:search  IS NULL OR e.name LIKE '%' || :search || '%' COLLATE NOCASE)
ORDER BY a.visit_date DESC, a.created_at DESC
LIMIT :perPage OFFSET :offset;
```

`meta.total` dihitung dengan `COUNT(*)` atas **klausa `WHERE` yang sama**
(bukan query terpisah tanpa filter), menjaga konsistensi jumlah vs isi
list (`docs/TASK.md` — Kode Etik #3).

## 5. Fallback Entitas (`GET /api/entities`)

Tidak ada tabel tambahan — fallback dibaca dari `activities` yang
bergabung ke `entities` ketika kombinasi `segment`+`search` di master
data (`entities`) tidak menghasilkan baris. Lihat `docs/PRD.md` §5.4
untuk aturan deduplikasi `(name, type)`.
</content>
