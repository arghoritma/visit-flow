# Visit Flow

Prototype manajemen kunjungan lapangan — tes rekrutmen Software Developer,
CV. Mabel Solusi Mandiri. Semua nama, skenario, dan data pada dokumen dan
seed ini **fiktif**.

Spesifikasi lengkap: [`docs/TASK.md`](docs/TASK.md) · Rencana produk:
[`docs/PRD.md`](docs/PRD.md) · Skema data: [`docs/ERD.md`](docs/ERD.md)

---

## 1. Keputusan Arsitektur

### 1.1 Mulai dari template sendiri, bukan dari nol

Repo ini dimulai dari **[Panceg](https://github.com/arghoritma/panceg)** —
boilerplate full-stack yang saya tulis dan pelihara sendiri untuk membangun
proyek-proyek lain sebelumnya (lihat [`panceg.md`](panceg.md) untuk dokumen
boilerplate aslinya). Alasan memakainya di tes ini:

1. **Tes ini menilai kemampuan menghubungkan FE↔BE, mengolah filter, dan
   menangani kondisi UI** — bukan kemampuan menyusun auth, migrasi, atau
   SSR dari nol. Memulai dari fondasi yang sudah saya pahami penuh (karena
   saya yang menulisnya) membebaskan waktu 2 hari untuk fokus ke domain
   _Visit Flow_ itu sendiri: skema `entities`/`activities`, API filter,
   dan UI-nya.
2. **Auth berautentikasi sudah tersedia** (syarat wajib tes: "endpoint
   tidak bisa dimanipulasi di URL") — register/login/logout, sesi
   DB-backed dengan cookie `httpOnly`, bukan token di query string.
3. **Satu konvensi struktur yang eksplisit** (`AGENTS.md`): route per URL
   namespace, query SQL terparameter di `repo/`, migrasi bernomor dengan
   `up`/`down`. Ini membuat kode fitur baru mudah ditinjau dan konsisten,
   relevan untuk dinilai sebagai kualitas kode, bukan cuma "jalan".
4. **Tidak melanggar ketentuan tes** — Panceg adalah template generik
   saya sendiri (auth, SSR, migrasi, rate limit), tidak mengandung kode,
   data, desain, API, kredensial, atau resource internal MabelHub.

Trade-off yang disadari: stack Inertia v3 + Svelte 5 (server-driven UI,
bukan SPA React/Vue terpisah) mungkin kurang umum dibanding stack lain —
dipilih karena memberi SSR + validasi error terstruktur tanpa menulis
state management client terpisah, dan karena saya paling cepat produktif
di dalamnya untuk jendela waktu 2 hari.

### 1.2 Apa yang diwarisi vs apa yang baru ditulis untuk Visit Flow

| Lapisan                                                | Dari Panceg (diwarisi) | Baru untuk Visit Flow                                      |
| ------------------------------------------------------ | ---------------------- | ---------------------------------------------------------- |
| Auth, sesi, roles                                      | ✅ dipakai langsung    | —                                                          |
| Migrasi `0001`–`0006` (users, sessions, uploads, dst.) | ✅ tidak diubah        | `0007_entities.sql`, `0008_activities.sql`                 |
| `src/server/repo/*` (user, session, dst.)              | ✅ tidak diubah        | `repo/entity.ts`, `repo/activity.ts`                       |
| Pola route (`routes/<feature>.routes.ts`)              | ✅ konvensi dipakai    | `routes/activities.routes.ts`, `routes/entities.routes.ts` |
| Validasi TypeBox, `ValidationFailed` → 422             | ✅ dipakai langsung    | skema body `POST`/`PATCH` activities                       |
| Inertia pages, komponen (`Field`, `Layout`)            | ✅ dipakai langsung    | halaman daftar/filter/form kunjungan                       |
| Tailwind v4 token                                      | ✅ dipakai langsung    | — (tanpa desain paralel)                                   |

---

## 2. Tech Stack & Alasan Pemilihan

| Pilihan                   | Alasan                                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bun** (runtime)         | Satu binary untuk runtime, bundler, test runner, dan `bun:sqlite` bawaan — tidak perlu Node + npm + driver DB terpisah untuk prototype berukuran ini.                                                                                                                                 |
| **Hono** (HTTP)           | Minim dependensi, runtime-agnostic, middleware model yang jelas (urutan eksplisit) — cocok untuk route per-fitur yang eksplisit sesuai kebutuhan tes (route tidak bisa "dimanipulasi di URL" karena guard auth adalah middleware, bukan logic di client).                             |
| **bun:sqlite, zero-ORM**  | Query terparameter langsung terlihat di `repo/` — memudahkan membuktikan ke penilai bahwa **filter diterapkan di SQL `WHERE`**, bukan di-filter di array JS/di tampilan (syarat eksplisit soal tes). Tanpa ORM juga berarti tanpa lapisan abstraksi yang menyembunyikan query aktual. |
| **Inertia v3 + Svelte 5** | Form (`useForm`) otomatis menangani state loading/error per-field dari respons 422 — pas untuk syarat "validasi input... pesan kesalahan yang mudah dipahami" tanpa menulis state management terpisah. SSR bawaan juga memberi render awal yang cepat untuk daftar kunjungan.         |
| **TypeBox**               | Skema validasi `POST`/`PATCH /api/activities` dideklarasikan sekali, dipakai untuk tipe TypeScript _dan_ validasi runtime — konsisten dengan pola `profile.routes.ts` yang sudah ada.                                                                                                 |
| **Tailwind v4**           | Reuse token desain (`--primary`, `--surface`, dst.) yang sudah ada di `styles.css`, menghindari membangun desain sistem paralel untuk halaman kunjungan.                                                                                                                              |

Stack ini **tidak dipilih ulang untuk tes ini** — ia adalah hasil
keputusan arsitektur dari proyek-proyek sebelumnya (lihat `panceg.md`
§"Philosophy" untuk alasan jangka panjangnya: minimal dependency, satu
cara baku melakukan sesuatu, correctness over cleverness).

---

## 3. Fitur yang Ditambahkan untuk Visit Flow

Mengacu pada `docs/PRD.md` §5 untuk kontrak API lengkap dan `docs/ERD.md`
untuk skema tabel.

- [x] Migrasi `entities` (master data) dan `activities` (rencana/riwayat
      kunjungan, termasuk kolom **`sales_name`** — nilai tambah soal tes).
- [x] `GET /api/activities` — filter `segment`, `status`, `from`/`to`
      (inklusif), `search` nama entitas; dapat dikombinasikan; `meta.total`
      konsisten dengan `data`.
- [x] `POST /api/activities` — tambah rencana kunjungan + validasi pesan
      error per field.
- [x] `PATCH /api/activities/:id` — ubah status `VISITED`/`NOT_VISITED`.
- [x] `GET /api/entities` — pilihan entitas dari master data, fallback ke
      riwayat kunjungan, tanpa duplikat (dibedakan via `type`).
- [x] Halaman Inertia (`/visits`): daftar kunjungan + filter + search +
      empty/loading/error state, form tambah kunjungan, toggle status.
- [x] Seed data fiktif (`scripts/seed-visit-flow.ts`, `bun run db:seed:visit-flow`) — 8 entities (termasuk kasus nama kembar beda
      `type`) + 8 activities.
- [x] Test (`bun test`) untuk aturan filter dan validasi —
      `tests/activities.test.ts`: validasi `POST` per field, toggle status
      `PATCH` + 404/422, filter `segment`/`status`/tanggal (termasuk batas
      inklusif)/`search`, kombinasi filter (AND), paginasi, guard auth
      (semua endpoint redirect ke `/login` tanpa sesi), fallback riwayat
      entitas, dan dedup nama+type.

Diverifikasi: `bun run typecheck` (0 error, 0 warning) dan `bun run test`
(106 test lulus, 0 gagal) pada commit ini.

---

## 4. Menjalankan Proyek

Satu proses Bun menyajikan frontend (SSR Svelte via Inertia) dan backend
(Hono API) sekaligus — tidak ada server terpisah untuk FE/BE pada mode
standar.

```bash
bun install
cp .env.example .env          # sudah berisi default yang aman untuk lokal
bun run db:migrate             # terapkan migrasi 0001–0008
bun run db:seed                # buat akun demo (lihat §5)
bun run dev                    # http://localhost:4000
```

Jalankan test:

```bash
bun run test        # alias: bun test --isolate (WAJIB --isolate, lihat AGENTS.md)
```

Typecheck & lint (opsional, bagian QA):

```bash
bun run typecheck
bun run lint
```

### Mode API terpisah (opsional)

Boilerplate juga menyediakan API server standalone berbasis bearer token
(`src/api.ts`, `bun run dev:api`, default port `4001`) untuk kasus
integrasi pihak ketiga. **Tidak dipakai** untuk fitur Visit Flow — semua
endpoint `/api/activities*` dan `/api/entities*` dilayani lewat proses web
utama (`bun run dev`) agar bisa memakai sesi cookie yang sama dengan
halaman Inertia-nya.

### Konfigurasi (`.env`)

Variabel inti yang relevan untuk menjalankan prototype ini (daftar penuh,
termasuk opsi mail/OAuth/rate-limit yang tidak dipakai di tes ini, ada di
`.env.example`):

| Variable          | Default                 | Keterangan                                |
| ----------------- | ----------------------- | ----------------------------------------- |
| `PORT`            | `4000`                  | Port web (FE+BE dalam satu proses)        |
| `APP_URL`         | `http://localhost:4000` | Base URL                                  |
| `DATABASE_PATH`   | `./data/app.sqlite`     | File SQLite — lihat §7 batasan            |
| `MIGRATIONS_MODE` | `startup`               | Migrasi jalan otomatis saat `bun run dev` |
| `SSR`             | `true`                  | Render awal di server                     |

---

## 5. Akun Demo

Dibuat lewat `bun run db:seed [email] [password] [role]` (default
`demo@example.com` / `password123` / `user`):

```bash
bun run db:seed demo@example.com password123 user
```

Login di `http://localhost:4000/login`. Semua endpoint
`/api/activities*` dan `/api/entities*` memerlukan sesi login
(`requireAuth`, middleware yang sama dipakai halaman `/visits` dkk.) —
memanggilnya langsung tanpa cookie sesi yang valid mengembalikan redirect
`302` ke `/login`, terlepas dari parameter apa pun yang ditaruh di URL
(diverifikasi manual dengan `curl` tanpa cookie).

---

## 6. Penggunaan AI

Sesuai arahan `docs/TASK.md`, berikut transparansi penggunaan AI pada
proyek ini. Seluruh kode fitur Visit Flow (migrasi, repo, route, UI,
test) dan dokumen (`PRD.md`, `ERD.md`, bagian ini sendiri) ditulis oleh
AI coding agent (Claude via OpenCode) dalam sesi pair-programming,
berdasarkan arahan, batasan, dan keputusan arsitektur dari saya (memilih
reuse boilerplate Panceg, menentukan skema `entities`/`activities`,
menentukan kolom nilai tambah `sales_name`, meninjau dan memverifikasi
setiap hasil). Tidak ada baris kode fitur ini yang ditulis manual
tanpa asistensi AI; peran saya adalah pengarah, peninjau, dan penguji
hasil (termasuk verifikasi manual via `curl` terhadap server dev yang
berjalan — lihat §3 untuk ringkasan apa yang sudah diverifikasi dan §4
untuk cara menjalankan `bun run typecheck`/`bun run test` sendiri).

| Area                                          | Dibantu AI?                                                                                                     | Fungsi/berkas terdampak                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Dokumentasi (`PRD.md`, `ERD.md`, `README.md`) | Ya, drafting penuh                                                                                              | dokumen ini, `docs/PRD.md`, `docs/ERD.md`                                                                  |
| Migrasi `entities`/`activities`               | Ya, drafting penuh                                                                                              | `src/db/migrations/0007_entities.sql`, `0008_activities.sql`                                               |
| Repo/query filter                             | Ya, drafting penuh                                                                                              | `repo/activity.ts` (`listActivities`/`countActivities` WHERE identik), `repo/entity.ts` (fallback + dedup) |
| Route API & halaman Inertia                   | Ya, drafting penuh                                                                                              | `routes/activities.routes.ts`, `routes/entities.routes.ts`                                                 |
| UI Svelte (`/visits`)                         | Ya, drafting penuh, lalu direvisi (kelas Tailwind yang tidak terdefinisi diganti, state-sync filter diperbaiki) | `src/client/pages/Visits.svelte`, `src/client/components/Layout.svelte` (nav item)                         |
| Seed data fiktif                              | Ya, drafting penuh                                                                                              | `scripts/seed-visit-flow.ts`                                                                               |
| Test (`bun test`)                             | Ya, drafting penuh, satu test diperbaiki setelah gagal karena nama entitas tidak unik antar-test                | `tests/activities.test.ts`                                                                                 |

Estimasi persentase total baris/berkas fitur Visit Flow yang melibatkan
bantuan AI: **~80%** dari kode baru (di luar boilerplate Panceg yang
sudah ada sebelum tes ini). Kontribusi manusia pada sesi ini adalah
arahan/batasan tugas, keputusan arsitektur, serta verifikasi/pengujian
end-to-end (curl manual terhadap endpoint, pembacaan hasil `bun test`/
`svelte-check`), bukan penulisan kode baris-demi-baris.

---

## 7. Batasan yang Diketahui

- **Penyimpanan**: `bun:sqlite` file on-disk (bukan in-memory) per
  `DATABASE_PATH`. Cocok untuk prototype single-instance; bukan untuk
  concurrency tinggi atau multi-instance produksi (single-writer SQLite).
- **Tanpa pemisahan data per-Sales**: semua pengguna yang login melihat
  seluruh daftar kunjungan (tidak ada scoping `created_by` di query list)
  — `created_by` tersimpan untuk audit, tapi daftar/filter tidak
  dipersempit ke sales yang sedang login.
- **`/api/activities*` dan `/api/entities*` bukan API publik**: guard-nya
  (`requireAuth`) sama dengan yang dipakai halaman, jadi request tanpa
  sesi mendapat redirect `302` ke `/login`, bukan `401` JSON — konsisten
  dengan cara endpoint ini dipakai (fetch internal dari halaman `/visits`,
  bukan kontrak JSON publik).
- **Fallback entitas** dari riwayat kunjungan bersifat heuristik sederhana
  (match `segment`+`search` gabungan `entities`/`activities`), bukan
  full-text search.
- **Tidak ada deployment publik** — sesuai ketentuan soal tes, prototype
  ini hanya dijalankan secara lokal.
- Fitur-fitur bawaan Panceg yang tidak relevan untuk tes ini (Google
  OAuth, forgot-password via email, tus resumable upload, standalone API
  bearer-token server) tetap ada di kode karena bagian dari boilerplate,
  tetapi **tidak dipakai** oleh alur Visit Flow dan tidak perlu
  dikonfigurasi untuk menjalankan tes ini.

---

## 8. Dokumen Pendukung

- [`docs/TASK.md`](docs/TASK.md) — spesifikasi tes asli.
- [`docs/PRD.md`](docs/PRD.md) — lingkup fitur, alur pengguna, kontrak API.
- [`docs/ERD.md`](docs/ERD.md) — skema tabel `entities`/`activities`, query
  filter, aturan fallback entitas.
- [`panceg.md`](panceg.md) — dokumentasi boilerplate dasar (arsitektur,
  konvensi, fitur bawaan) yang menjadi starting point repo ini.
- [`AGENTS.md`](AGENTS.md) — aturan struktural wajib untuk kontribusi kode
  baru di repo ini.
